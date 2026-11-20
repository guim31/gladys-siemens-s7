// -----------------------------------------------------------------------------
// S7comm frames over ISO-on-TCP (RFC 1006): TPKT, COTP, S7 jobs and replies.
//
//   TPKT   03 00 <length:2>                       (length includes the header)
//   COTP   <li> <type> ...                        CR e0, CC d0, DR 80, DT f0
//   S7     32 <rosctr> 00 00 <ref:2> <param:2> <data:2> [<class> <code>]
//
// Only what the integration needs: connection, PDU negotiation, read and
// write of variables. Written from the public descriptions of the protocol
// (Snap7, Wireshark's s7comm dissector, nodes7) and checked against the
// Snap7 server (test/fixtures/snap7-frames.js holds frames it answered).
// -----------------------------------------------------------------------------

import { AREA_CODES, sizeOf } from './address.js';

export const COTP = { CR: 0xe0, CC: 0xd0, DR: 0x80, DT: 0xf0 };
const ROSCTR = { JOB: 0x01, ACK: 0x02, ACK_DATA: 0x03 };
export const FUNCTION = { SETUP: 0xf0, READ: 0x04, WRITE: 0x05 };
const TRANSPORT = { BIT: 0x01, BYTE: 0x02 };
const DATA_TRANSPORT = { BIT: 0x03, BYTE: 0x04 };
export const ITEM_OK = 0xff;

/** Bytes a read request and its reply cost, beyond their items. */
export const READ_REQUEST_OVERHEAD = 10 + 2;
export const READ_ITEM_REQUEST = 12;
export const READ_REPLY_OVERHEAD = 12 + 2;
/** A device rarely takes more than 20 items in one request (S7-300 limit). */
export const MAX_ITEMS = 20;

/** Wrap a COTP payload in a TPKT header. */
export function tpkt(payload) {
  const frame = Buffer.alloc(4 + payload.length);
  frame[0] = 0x03;
  frame.writeUInt16BE(frame.length, 2);
  payload.copy(frame, 4);
  return frame;
}

/** "02.00" or "0x0200" or "512" → 0x0200; null when invalid. */
export function parseTsap(text) {
  const value = String(text ?? '')
    .trim()
    .toLowerCase();
  let number;
  if (/^[0-9a-f]{1,2}\.[0-9a-f]{1,2}$/.test(value)) {
    const [high, low] = value.split('.').map((part) => parseInt(part, 16));
    number = high * 256 + low;
  } else if (/^0x[0-9a-f]{1,4}$/.test(value)) {
    number = parseInt(value, 16);
  } else if (/^\d{1,5}$/.test(value)) {
    number = Number(value);
  } else {
    return null;
  }
  return number >= 0 && number <= 0xffff ? number : null;
}

/** Remote TSAP of a CPU by rack and slot (PG connection, as Snap7 and nodes7). */
export function rackSlotTsap(rack, slot) {
  return 0x0100 + rack * 32 + slot;
}

/** COTP connection request. */
export function connectionRequest(localTsap, remoteTsap) {
  return tpkt(
    Buffer.from([
      0x11,
      COTP.CR,
      0x00,
      0x00, // destination reference
      0x00,
      0x01, // source reference
      0x00, // class 0
      0xc0,
      0x01,
      0x0a, // TPDU size 1024
      0xc1,
      0x02,
      localTsap >> 8,
      localTsap & 0xff,
      0xc2,
      0x02,
      remoteTsap >> 8,
      remoteTsap & 0xff,
    ]),
  );
}

/** A COTP data frame carrying an S7 PDU. */
function dataFrame(s7) {
  return tpkt(Buffer.concat([Buffer.from([0x02, COTP.DT, 0x80]), s7]));
}

function jobHeader(ref, paramLength, dataLength) {
  const header = Buffer.alloc(10);
  header[0] = 0x32;
  header[1] = ROSCTR.JOB;
  header.writeUInt16BE(ref, 4);
  header.writeUInt16BE(paramLength, 6);
  header.writeUInt16BE(dataLength, 8);
  return header;
}

/** PDU negotiation ("setup communication"). */
export function setupRequest(ref, pduSize = 960) {
  const params = Buffer.from([FUNCTION.SETUP, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  params.writeUInt16BE(pduSize, 6);
  return dataFrame(Buffer.concat([jobHeader(ref, params.length, 0), params]));
}

/** The 12-byte "any pointer" of a variable. */
function itemSpec(address, { bit = false } = {}) {
  const spec = Buffer.alloc(12);
  spec[0] = 0x12;
  spec[1] = 0x0a;
  spec[2] = 0x10;
  spec[3] = bit ? TRANSPORT.BIT : TRANSPORT.BYTE;
  spec.writeUInt16BE(bit ? 1 : sizeOf(address), 4);
  spec.writeUInt16BE(address.area === 'DB' ? address.db : 0, 6);
  spec[8] = AREA_CODES[address.area];
  const start = address.offset * 8 + (bit ? address.bit : 0);
  spec[9] = (start >> 16) & 0xff;
  spec[10] = (start >> 8) & 0xff;
  spec[11] = start & 0xff;
  return spec;
}

/** Read several variables in one request (a bit reads its whole byte). */
export function readRequest(ref, addresses) {
  const params = Buffer.concat([
    Buffer.from([FUNCTION.READ, addresses.length]),
    ...addresses.map((address) => itemSpec(address)),
  ]);
  return dataFrame(Buffer.concat([jobHeader(ref, params.length, 0), params]));
}

/** Write one variable: a bit as a bit (its neighbours untouched), the rest as bytes. */
export function writeRequest(ref, address, bytes) {
  const bit = address.type === 'bool';
  const params = Buffer.concat([Buffer.from([FUNCTION.WRITE, 1]), itemSpec(address, { bit })]);
  const data = Buffer.alloc(4 + bytes.length);
  data[1] = bit ? DATA_TRANSPORT.BIT : DATA_TRANSPORT.BYTE;
  data.writeUInt16BE(bit ? 1 : bytes.length * 8, 2);
  bytes.copy(data, 4);
  return dataFrame(Buffer.concat([jobHeader(ref, params.length, data.length), params, data]));
}

/** Bytes the reply to a read of these addresses takes. */
export function readReplySize(addresses) {
  let size = READ_REPLY_OVERHEAD;
  addresses.forEach((address, index) => {
    const length = sizeOf(address);
    size += 4 + length + (length % 2 === 1 && index < addresses.length - 1 ? 1 : 0);
  });
  return size;
}

/** A failure of the protocol, with a code the hub turns into a message. */
export class S7Error extends Error {
  constructor(code, message, params = {}) {
    super(message ?? code);
    this.code = code;
    this.params = params;
  }
}

/**
 * Split a TPKT payload: COTP type and, for a data frame, the S7 PDU.
 * @param {Buffer} payload the frame without its 4-byte TPKT header
 */
export function parseCotp(payload) {
  if (payload.length < 2) {
    throw new S7Error('protocol', 'COTP frame too short');
  }
  const length = payload[0];
  const type = payload[1] & 0xf0;
  if (type === COTP.DT) {
    return { type, last: (payload[2] & 0x80) !== 0, s7: payload.subarray(1 + length) };
  }
  return { type };
}

/**
 * Parse an S7 reply PDU.
 * @returns {{ ref: number, errorCode: number, params: Buffer, data: Buffer }}
 */
export function parseReply(pdu) {
  if (pdu.length < 12 || pdu[0] !== 0x32) {
    throw new S7Error('protocol', 'Not an S7 reply');
  }
  const rosctr = pdu[1];
  const headerLength = rosctr === ROSCTR.ACK || rosctr === ROSCTR.ACK_DATA ? 12 : 10;
  const paramLength = pdu.readUInt16BE(6);
  const dataLength = pdu.readUInt16BE(8);
  if (pdu.length < headerLength + paramLength + dataLength) {
    throw new S7Error('protocol', 'S7 reply cut');
  }
  return {
    rosctr,
    ref: pdu.readUInt16BE(4),
    errorCode: headerLength === 12 ? pdu.readUInt16BE(10) : 0,
    params: pdu.subarray(headerLength, headerLength + paramLength),
    data: pdu.subarray(headerLength + paramLength, headerLength + paramLength + dataLength),
  };
}

/** The PDU size granted by the setup reply. */
export function parseSetupReply(reply) {
  if (reply.params[0] !== FUNCTION.SETUP || reply.params.length < 8) {
    throw new S7Error('protocol', 'Unexpected setup reply');
  }
  return reply.params.readUInt16BE(6);
}

/**
 * The items of a read reply, in the order asked.
 * @returns {Array<{ code: number, bytes?: Buffer }>}
 */
export function parseReadReply(reply, addresses) {
  if (reply.params[0] !== FUNCTION.READ || reply.params[1] !== addresses.length) {
    throw new S7Error('protocol', 'Unexpected read reply');
  }
  const { data } = reply;
  const items = [];
  let position = 0;
  for (let index = 0; index < addresses.length; index += 1) {
    if (position + 4 > data.length) {
      throw new S7Error('protocol', 'Read reply cut');
    }
    const code = data[position];
    const transport = data[position + 1];
    let length = data.readUInt16BE(position + 2);
    // Lengths are in bits, except for octet strings (09), reals (07).
    if (transport !== 0x09 && transport !== 0x07) {
      length = Math.ceil(length / 8);
    }
    position += 4;
    if (code !== ITEM_OK) {
      items.push({ code });
      continue;
    }
    if (position + length > data.length) {
      throw new S7Error('protocol', 'Read reply cut');
    }
    items.push({ code, bytes: Buffer.from(data.subarray(position, position + length)) });
    position += length;
    if (length % 2 === 1 && index < addresses.length - 1) {
      position += 1; // fill byte
    }
  }
  return items;
}

/** The return code of a one-item write reply. */
export function parseWriteReply(reply) {
  if (reply.params[0] !== FUNCTION.WRITE || reply.data.length < 1) {
    throw new S7Error('protocol', 'Unexpected write reply');
  }
  return reply.data[0];
}
