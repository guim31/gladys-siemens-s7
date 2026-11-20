// -----------------------------------------------------------------------------
// The S7 layer: addresses, frames checked byte for byte against what a real
// Snap7 server answered, the client over a socket that cuts frames anywhere.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { decode, encode, featureKey, parseAddress } from '../src/s7/address.js';
import { S7Client, packRequests } from '../src/s7/client.js';
import {
  connectionRequest,
  parseCotp,
  parseReadReply,
  parseReply,
  parseSetupReply,
  parseTsap,
  parseWriteReply,
  rackSlotTsap,
  readRequest,
  setupRequest,
  writeRequest,
} from '../src/s7/frames.js';
import { SNAP7_FRAMES } from './fixtures/snap7-frames.js';
import { createFakePlc } from './helpers/fakePlc.js';

const hex = (text) => Buffer.from(text, 'hex');
const s7Of = (frame) => parseCotp(frame.subarray(4)).s7;

test('every accepted address form, and its canonical text', () => {
  const cases = {
    'DB1,REAL0': 'DB1,REAL0',
    'db1,real0': 'DB1,REAL0',
    'DB1,X0.1': 'DB1,X0.1',
    'DB1.DBX0.1': 'DB1,X0.1',
    'DB1.DBB2': 'DB1,BYTE2',
    'DB1,B2': 'DB1,BYTE2',
    'DB1.DBW4': 'DB1,WORD4',
    'DB1,INT6': 'DB1,INT6',
    'DB1.DBD8': 'DB1,DWORD8',
    'DB1,DINT8': 'DB1,DINT8',
    'DB12,LREAL16': 'DB12,LREAL16',
    'M0.1': 'M0.1',
    'MX0.1': 'M0.1',
    MW10: 'MW10',
    MI10: 'MI10',
    MD20: 'MD20',
    MDI20: 'MDI20',
    MR20: 'MR20',
    MLR24: 'MLR24',
    'I0.0': 'I0.0',
    'E0.0': 'I0.0',
    IB0: 'IB0',
    'Q0.1': 'Q0.1',
    'A0.1': 'Q0.1',
    QW2: 'QW2',
    'V10.0': 'DB1,X10.0',
    VW10: 'DB1,WORD10',
    VI10: 'DB1,INT10',
    VD10: 'DB1,DWORD10',
    VR10: 'DB1,REAL10',
  };
  for (const [text, canonical] of Object.entries(cases)) {
    assert.equal(parseAddress(text)?.text, canonical, text);
  }
  assert.equal(featureKey(parseAddress('DB1.DBX0.1')), 'a-db1-x0-1');
  assert.equal(featureKey(parseAddress('VW10')), featureKey(parseAddress('DB1,WORD10')));
});

test('addresses refused: no type, bit out of 0-7, a bit on a word, DB0, junk', () => {
  for (const text of [
    '',
    'M10',
    'M0.8',
    'MW10.1',
    'DB1,X0',
    'DB1,REAL0.1',
    'DB0,INT0',
    'DB1,FOO0',
    'DB1 REAL0',
    'Z0.0',
    'MW70000',
    'ns=3;s=X',
  ]) {
    assert.equal(parseAddress(text), null, text);
  }
});

test('values decode and encode big-endian, as every S7 stores them', () => {
  const real = parseAddress('DB1,REAL0');
  assert.equal(decode(real, encode(real, 21.5)), 21.5);
  const int = parseAddress('MI0');
  assert.deepEqual([...encode(int, -2)], [0xff, 0xfe]);
  assert.equal(decode(int, Buffer.from([0xff, 0xfe])), -2);
  const word = parseAddress('MW0');
  assert.equal(decode(word, Buffer.from([0xff, 0xfe])), 65534);
  const dint = parseAddress('MDI0');
  assert.equal(decode(dint, encode(dint, -123456)), -123456);
  const lreal = parseAddress('DB1,LREAL0');
  assert.equal(decode(lreal, encode(lreal, 1234.5678)), 1234.5678);
  const bit = parseAddress('M0.2');
  assert.equal(decode(bit, Buffer.from([0b100])), true);
  assert.equal(decode(bit, Buffer.from([0b011])), false);
});

test('TSAPs as LOGO!Soft Comfort writes them, and rack/slot', () => {
  assert.equal(parseTsap('02.00'), 0x0200);
  assert.equal(parseTsap('0x0201'), 0x0201);
  assert.equal(parseTsap('4D.57'), 0x4d57);
  assert.equal(parseTsap('257'), 0x0101);
  assert.equal(parseTsap('2.0.0'), null);
  assert.equal(parseTsap('x'), null);
  assert.equal(rackSlotTsap(0, 1), 0x0101);
  assert.equal(rackSlotTsap(0, 2), 0x0102);
  assert.equal(rackSlotTsap(0, 3), 0x0103);
});

test('the requests are the bytes the Snap7 server accepted', () => {
  assert.equal(connectionRequest(0x0100, 0x0101).toString('hex'), SNAP7_FRAMES.connect.request);
  assert.equal(setupRequest(1, 960).toString('hex'), SNAP7_FRAMES.setup.request);
  const addresses = ['DB1,REAL0', 'DB1,X12.2', 'M0.1', 'MW10', 'DB9,INT0', 'DB2,INT20', 'I0.0'].map(
    parseAddress,
  );
  assert.equal(readRequest(2, addresses).toString('hex'), SNAP7_FRAMES.read.request);
  const bit = parseAddress('M0.3');
  assert.equal(
    writeRequest(3, bit, encode(bit, true)).toString('hex'),
    SNAP7_FRAMES.writeBit.request,
  );
});

test('the Snap7 replies parse: PDU size, values, refused items', () => {
  assert.equal(parseCotp(hex(SNAP7_FRAMES.connect.reply).subarray(4)).type, 0xd0);
  assert.equal(parseSetupReply(parseReply(s7Of(hex(SNAP7_FRAMES.setup.reply)))), 960);
  const addresses = ['DB1,REAL0', 'DB1,X12.2', 'M0.1', 'MW10', 'DB9,INT0', 'DB2,INT20', 'I0.0'].map(
    parseAddress,
  );
  const items = parseReadReply(parseReply(s7Of(hex(SNAP7_FRAMES.read.reply))), addresses);
  assert.deepEqual(
    items.map((item, index) => (item.bytes ? decode(addresses[index], item.bytes) : item.code)),
    [21.5, true, true, 42, 0x0a, 0x05, true],
  );
  assert.equal(parseWriteReply(parseReply(s7Of(hex(SNAP7_FRAMES.writeBit.reply)))), 0xff);
  assert.equal(parseWriteReply(parseReply(s7Of(hex(SNAP7_FRAMES.writeMissing.reply)))), 0x0a);
});

test('requests packed to the PDU: 20 items at most, replies that fit', () => {
  const small = Array.from({ length: 45 }, (_, i) => parseAddress(`DB1,INT${i * 2}`));
  assert.deepEqual(
    packRequests(small, 480).map((group) => group.length),
    [20, 20, 5],
  );
  const wide = Array.from({ length: 30 }, (_, i) => parseAddress(`DB1,LREAL${i * 8}`));
  // LOGO! 0BA7: PDU 240, 12 bytes per LREAL item in the reply.
  const groups = packRequests(wide, 240);
  assert.ok(groups.every((group) => 14 + group.length * 12 <= 240));
  assert.equal(groups.flat().length, 30);
});

test('the client puts back frames cut anywhere, and joins frames sent together', async () => {
  const plc = createFakePlc({ DB: { 1: Buffer.from([0x41, 0xac, 0, 0]) } });
  const chunks = [];
  const createSocket = () => {
    const real = plc.createSocket();
    const socket = new EventEmitter();
    socket.setNoDelay = () => {};
    socket.destroy = () => real.destroy();
    socket.write = (frame) => real.write(frame);
    real.on('connect', () => socket.emit('connect'));
    real.on('close', () => socket.emit('close'));
    real.on('error', (err) => socket.emit('error', err));
    // Byte by byte, then everything at once.
    real.on('data', (frame) => {
      chunks.push(frame.length);
      for (const byte of frame) {
        socket.emit('data', Buffer.from([byte]));
      }
    });
    return socket;
  };
  const client = new S7Client({ host: 'x', localTsap: 0x100, remoteTsap: 0x101, createSocket });
  await client.connect();
  const [item] = await client.read([parseAddress('DB1,REAL0')]);
  assert.equal(decode(parseAddress('DB1,REAL0'), item.bytes), 21.5);
  client.close();
  assert.ok(chunks.length >= 3);
});

test('a PLC that never answers: timeout, as "unreachable"', async () => {
  const plc = createFakePlc();
  plc.down = 'silent';
  const client = new S7Client({
    host: 'x',
    localTsap: 0x100,
    remoteTsap: 0x101,
    timeoutMs: 20,
    createSocket: plc.createSocket,
  });
  await assert.rejects(client.connect(), { code: 'unreachable' });
});

test('a request after close fails at once', async () => {
  const plc = createFakePlc();
  const client = new S7Client({
    host: 'x',
    localTsap: 0x100,
    remoteTsap: 0x101,
    createSocket: plc.createSocket,
  });
  await client.connect();
  client.close();
  await assert.rejects(client.read([parseAddress('M0.0')]), { code: 'closed' });
});
