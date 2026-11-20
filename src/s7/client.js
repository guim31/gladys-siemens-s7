// -----------------------------------------------------------------------------
// An S7 client over one TCP connection (port 102): connect, read a list of
// variables (packed into as few requests as the PDU size allows), write one.
//
// One request at a time: a PLC grants few parallel jobs, and a home setup
// reads a few dozen variables per cycle. Every failure is an S7Error whose
// code the hub turns into a message:
//
//   unreachable  nothing answers on port 102 (address, network, PLC off)
//   unknownHost  the host name does not resolve
//   refused      the PLC closes or refuses the connection: rack/slot or TSAP
//   putGet       the CPU refuses the job: PUT/GET access off (S7-1200/1500)
//   protocol     a frame the client does not understand
//   closed       the connection was closed (by stop() or by the PLC)
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import net from 'node:net';
import {
  COTP,
  MAX_ITEMS,
  READ_ITEM_REQUEST,
  READ_REQUEST_OVERHEAD,
  S7Error,
  connectionRequest,
  parseCotp,
  parseReadReply,
  parseReply,
  parseSetupReply,
  parseWriteReply,
  readReplySize,
  readRequest,
  setupRequest,
  writeRequest,
} from './frames.js';

const UNKNOWN_HOST = ['ENOTFOUND', 'EAI_AGAIN'];
/** Header error 0x8104: "function not available", PUT/GET off on S7-1200/1500. */
const FUNCTION_REFUSED = 0x8104;

/** Split addresses into requests that fit the PDU, request and reply alike. */
export function packRequests(addresses, pduSize) {
  const requests = [];
  let current = [];
  for (const address of addresses) {
    const next = [...current, address];
    const fits =
      next.length <= MAX_ITEMS &&
      READ_REQUEST_OVERHEAD + READ_ITEM_REQUEST * next.length <= pduSize &&
      readReplySize(next) <= pduSize;
    if (fits || current.length === 0) {
      current = next;
    } else {
      requests.push(current);
      current = [address];
    }
  }
  if (current.length > 0) {
    requests.push(current);
  }
  return requests;
}

export class S7Client extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.host
   * @param {number} [options.port]
   * @param {number} options.localTsap
   * @param {number} options.remoteTsap
   * @param {number} [options.timeoutMs]
   * @param {(options: object) => import('node:net').Socket} [options.createSocket]
   */
  constructor({ host, port = 102, localTsap, remoteTsap, timeoutMs = 5000, createSocket }) {
    super();
    this.host = host;
    this.port = port;
    this.localTsap = localTsap;
    this.remoteTsap = remoteTsap;
    this.timeoutMs = timeoutMs;
    this.createSocket = createSocket ?? ((options) => net.connect(options));
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = null;
    this.queue = Promise.resolve();
    this.ref = 0;
    this.pduSize = 0;
    this.connected = false;
    this.fragments = [];
  }

  /** Open the TCP connection, the ISO connection, and negotiate the PDU. */
  async connect() {
    await this.#open();
    try {
      const confirm = await this.#exchange(
        connectionRequest(this.localTsap, this.remoteTsap),
        'cotp',
      );
      if (confirm.type !== COTP.CC) {
        throw new S7Error('refused', 'ISO connection refused');
      }
      const reply = await this.#exchange(setupRequest(this.#nextRef()), 's7');
      this.#checkHeader(reply);
      this.pduSize = Math.max(240, parseSetupReply(reply));
      this.connected = true;
    } catch (err) {
      // A PLC that drops the connection here has refused the TSAP.
      const error = err.code === 'closed' ? new S7Error('refused', err.message) : err;
      this.close();
      throw error;
    }
  }

  /**
   * Read variables.
   * @param {Array<object>} addresses parsed addresses
   * @returns {Promise<Array<{ code: number, bytes?: Buffer }>>} in the same order
   */
  read(addresses) {
    return this.#serialize(async () => {
      const results = [];
      for (const group of packRequests(addresses, this.pduSize)) {
        const reply = await this.#exchange(readRequest(this.#nextRef(), group), 's7');
        this.#checkHeader(reply);
        results.push(...parseReadReply(reply, group));
      }
      return results;
    });
  }

  /**
   * Write one variable.
   * @returns {Promise<number>} the item return code (0xff: done)
   */
  write(address, bytes) {
    return this.#serialize(async () => {
      const reply = await this.#exchange(writeRequest(this.#nextRef(), address, bytes), 's7');
      this.#checkHeader(reply);
      return parseWriteReply(reply);
    });
  }

  /** Close the connection; no 'close' event for a close asked here. */
  close() {
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    this.#fail(new S7Error('closed', 'Connection closed'));
    if (socket) {
      socket.removeAllListeners();
      socket.on('error', () => {});
      socket.destroy();
    }
  }

  #serialize(job) {
    const run = this.queue.then(() => {
      if (!this.connected) {
        throw new S7Error('closed', 'Not connected');
      }
      return job();
    });
    this.queue = run.catch(() => {});
    return run;
  }

  #nextRef() {
    this.ref = (this.ref % 0xfffe) + 1;
    return this.ref;
  }

  #checkHeader(reply) {
    if (reply.errorCode === FUNCTION_REFUSED) {
      throw new S7Error('putGet', 'The CPU refuses PUT/GET jobs');
    }
    if (reply.errorCode !== 0) {
      throw new S7Error('protocol', `S7 error 0x${reply.errorCode.toString(16)}`);
    }
  }

  #open() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = this.createSocket({ host: this.host, port: this.port });
      this.socket = socket;
      this.buffer = Buffer.alloc(0);
      this.fragments = [];
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.close();
          reject(new S7Error('unreachable', 'Connection timed out'));
        }
      }, this.timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.setNoDelay?.(true);
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      socket.on('data', (chunk) => this.#onData(chunk));
      socket.on('error', (err) => {
        clearTimeout(timer);
        // Once TCP is up, a reset is the PLC hanging up on us.
        const code = UNKNOWN_HOST.includes(err.code)
          ? 'unknownHost'
          : settled && err.code === 'ECONNRESET'
            ? 'closed'
            : 'unreachable';
        const error = new S7Error(code, err.message);
        if (!settled) {
          settled = true;
          this.close();
          reject(error);
          return;
        }
        this.#lost(error);
      });
      socket.on('close', () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          this.socket = null;
          reject(new S7Error('unreachable', 'Connection closed'));
          return;
        }
        this.#lost(new S7Error('closed', 'Connection closed by the PLC'));
      });
    });
  }

  /** The connection dropped: fail the request in flight, tell the hub once. */
  #lost(error) {
    if (!this.socket) {
      return;
    }
    const wasConnected = this.connected;
    this.#fail(error);
    this.close();
    if (wasConnected) {
      this.emit('close', error);
    }
  }

  #fail(error) {
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  /** Send a frame, wait for the next COTP frame (or the next S7 reply). */
  #exchange(frame, expect) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new S7Error('closed', 'Not connected'));
        return;
      }
      const timer = setTimeout(() => {
        if (this.pending?.timer === timer) {
          const error = new S7Error('unreachable', 'No reply from the PLC');
          this.pending = null;
          reject(error);
          // A late reply would be taken for the next one: start over.
          this.#lost(error);
        }
      }, this.timeoutMs);
      this.pending = { expect, resolve, reject, timer };
      this.socket.write(frame);
    });
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      if (this.buffer[0] !== 0x03) {
        this.#lost(new S7Error('protocol', 'Not a TPKT frame'));
        return;
      }
      const length = this.buffer.readUInt16BE(2);
      if (length < 7) {
        this.#lost(new S7Error('protocol', 'Bad TPKT length'));
        return;
      }
      if (this.buffer.length < length) {
        return;
      }
      const payload = this.buffer.subarray(4, length);
      this.buffer = this.buffer.subarray(length);
      try {
        this.#onFrame(parseCotp(payload));
      } catch (err) {
        this.#lost(err instanceof S7Error ? err : new S7Error('protocol', err.message));
        return;
      }
    }
  }

  #onFrame(cotp) {
    const pending = this.pending;
    if (cotp.type === COTP.DR) {
      this.#lost(new S7Error('refused', 'The PLC refused the connection'));
      return;
    }
    if (!pending) {
      return; // nothing asked: ignore
    }
    if (pending.expect === 'cotp') {
      this.pending = null;
      clearTimeout(pending.timer);
      pending.resolve(cotp);
      return;
    }
    if (cotp.type !== COTP.DT) {
      return;
    }
    // A PDU split over several data frames is put back together.
    this.fragments.push(cotp.s7);
    if (!cotp.last) {
      return;
    }
    const pdu = Buffer.concat(this.fragments);
    this.fragments = [];
    const reply = parseReply(pdu);
    if (reply.ref !== this.ref) {
      return; // a late reply to an abandoned request
    }
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(reply);
  }
}
