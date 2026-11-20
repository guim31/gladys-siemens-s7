// -----------------------------------------------------------------------------
// A fake S7 PLC that speaks the real protocol (TPKT, COTP, S7comm) over an
// in-memory socket: the client under test is the real one, frames included.
// Its behaviour follows the Snap7 server answers recorded in
// test/fixtures/snap7-frames.js, plus what Snap7 does not do: refusing a
// wrong rack/slot (a real CPU sends a COTP disconnect), PUT/GET off.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';

const AREAS = { 0x81: 'I', 0x82: 'Q', 0x83: 'M', 0x84: 'DB' };

/**
 * @param {object} [memory] { DB: { 1: Buffer }, M: Buffer, I: Buffer, Q: Buffer }
 */
export function createFakePlc(memory = {}) {
  const plc = {
    memory: {
      DB: memory.DB ?? { 1: Buffer.alloc(64) },
      M: memory.M ?? Buffer.alloc(64),
      I: memory.I ?? Buffer.alloc(16),
      Q: memory.Q ?? Buffer.alloc(16),
    },
    /** null: anything accepted; else the only remote TSAP accepted. */
    acceptTsap: null,
    /** 'refused' (ECONNREFUSED), 'silent' (no answer), 'unknownHost', or null. */
    down: null,
    putGet: true,
    /** Areas written as read-only ("DB2", "I"...): writes get code 03. */
    readOnly: new Set(),
    pduSize: 480,
    connections: 0,
    sockets: new Set(),
    requests: [],
    /** Cut every open connection (PLC switched off). */
    cut() {
      for (const socket of plc.sockets) {
        socket.serverClose();
      }
    },
    createSocket: () => createSocket(plc),
  };
  return plc;
}

function createSocket(plc) {
  const socket = new EventEmitter();
  let open = true;
  socket.setNoDelay = () => {};
  socket.destroy = () => {
    open = false;
    plc.sockets.delete(socket);
  };
  socket.end = socket.destroy;
  socket.serverClose = () => {
    if (open) {
      open = false;
      plc.sockets.delete(socket);
      setImmediate(() => socket.emit('close'));
    }
  };
  const reply = (frame) =>
    setImmediate(() => {
      if (open) {
        socket.emit('data', frame);
      }
    });
  socket.write = (frame) => {
    if (!open) {
      return;
    }
    const answer = handle(plc, Buffer.from(frame), socket);
    if (answer) {
      reply(answer);
    }
  };
  setImmediate(() => {
    if (plc.down === 'refused') {
      socket.emit(
        'error',
        Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      );
      socket.emit('close');
      return;
    }
    if (plc.down === 'unknownHost') {
      socket.emit(
        'error',
        Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
      );
      socket.emit('close');
      return;
    }
    if (plc.down === 'silent') {
      return; // never connects: the client times out
    }
    plc.sockets.add(socket);
    plc.connections += 1;
    socket.emit('connect');
  });
  return socket;
}

const tpkt = (payload) => {
  const frame = Buffer.alloc(4 + payload.length);
  frame[0] = 3;
  frame.writeUInt16BE(frame.length, 2);
  payload.copy(frame, 4);
  return frame;
};

function ackData(ref, params, data, errorCode = 0) {
  const header = Buffer.alloc(12);
  header[0] = 0x32;
  header[1] = 0x03;
  header.writeUInt16BE(ref, 4);
  header.writeUInt16BE(params.length, 6);
  header.writeUInt16BE(data.length, 8);
  header.writeUInt16BE(errorCode, 10);
  return tpkt(Buffer.concat([Buffer.from([0x02, 0xf0, 0x80]), header, params, data]));
}

function areaBuffer(plc, code, db) {
  const area = AREAS[code];
  if (area === 'DB') {
    return plc.memory.DB[db] ?? null;
  }
  return plc.memory[area] ?? null;
}

function handle(plc, frame, socket) {
  const cotpType = frame[5];
  if (cotpType === 0xe0) {
    const remote = frame.readUInt16BE(20);
    if (plc.acceptTsap !== null && remote !== plc.acceptTsap) {
      // A real CPU answers a disconnect request for an unknown TSAP.
      setImmediate(() => socket.serverClose());
      return tpkt(Buffer.from([0x06, 0x80, 0x00, 0x01, 0x00, 0x00, 0x00]));
    }
    const confirm = Buffer.from(frame.subarray(4));
    confirm[1] = 0xd0;
    return tpkt(confirm);
  }
  const s7 = frame.subarray(7);
  const ref = s7.readUInt16BE(4);
  const paramLength = s7.readUInt16BE(6);
  const params = s7.subarray(10, 10 + paramLength);
  const data = s7.subarray(10 + paramLength);
  const fn = params[0];
  plc.requests.push(fn);
  if (fn === 0xf0) {
    const answer = Buffer.from(params);
    answer.writeUInt16BE(Math.min(plc.pduSize, params.readUInt16BE(6)), 6);
    return ackData(ref, answer, Buffer.alloc(0));
  }
  if (!plc.putGet) {
    return ackData(ref, Buffer.from([fn, 0]), Buffer.alloc(0), 0x8104);
  }
  const count = params[1];
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const spec = params.subarray(2 + i * 12, 14 + i * 12);
    items.push({
      transport: spec[3],
      length: spec.readUInt16BE(4),
      db: spec.readUInt16BE(6),
      area: spec[8],
      start: (spec[9] << 16) | (spec[10] << 8) | spec[11],
    });
  }
  if (fn === 0x04) {
    const parts = [];
    items.forEach((item, index) => {
      const buffer = areaBuffer(plc, item.area, item.db);
      const offset = item.start >> 3;
      if (!buffer) {
        parts.push(Buffer.from([0x0a, 0x00, 0x00, 0x00]));
        return;
      }
      if (offset + item.length > buffer.length) {
        parts.push(Buffer.from([0x05, 0x00, 0x00, 0x00]));
        return;
      }
      const head = Buffer.from([0xff, 0x04, 0, 0]);
      head.writeUInt16BE(item.length * 8, 2);
      const fill =
        item.length % 2 === 1 && index < items.length - 1 ? Buffer.alloc(1) : Buffer.alloc(0);
      parts.push(head, buffer.subarray(offset, offset + item.length), fill);
    });
    return ackData(ref, Buffer.from([0x04, count]), Buffer.concat(parts));
  }
  if (fn === 0x05) {
    const [item] = items;
    const buffer = areaBuffer(plc, item.area, item.db);
    const areaName = AREAS[item.area] === 'DB' ? `DB${item.db}` : AREAS[item.area];
    let code = 0xff;
    if (!buffer) {
      code = 0x0a;
    } else if (plc.readOnly.has(areaName)) {
      code = 0x03;
    } else if (item.transport === 0x01) {
      const offset = item.start >> 3;
      const bit = item.start & 7;
      if (offset >= buffer.length) {
        code = 0x05;
      } else {
        buffer[offset] = data[4] ? buffer[offset] | (1 << bit) : buffer[offset] & ~(1 << bit);
      }
    } else {
      const offset = item.start >> 3;
      if (offset + item.length > buffer.length) {
        code = 0x05;
      } else {
        data.subarray(4, 4 + item.length).copy(buffer, offset);
      }
    }
    return ackData(ref, Buffer.from([0x05, 1]), Buffer.from([code]));
  }
  return null;
}
