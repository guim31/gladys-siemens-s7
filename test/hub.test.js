// -----------------------------------------------------------------------------
// The hub against a fake PLC speaking S7comm: discovery, values read at each
// cycle, rate, link loss and return, rack/slot and TSAP, PUT/GET, refused
// addresses, writes, quiet logs, the container's own timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { normalizeConfig } from '../src/config.js';
import { S7Client } from '../src/s7/client.js';
import { createFakePlc } from './helpers/fakePlc.js';
import { HOST, captureLogs, createWorld } from './helpers/world.js';
import {
  HEATING_VARIABLES,
  LOGO_TSAP,
  LOGO_VARIABLES,
  heatingMemory,
  logoMemory,
} from './fixtures/plcs.js';

const heating = (options = {}) =>
  createWorld({
    memory: heatingMemory(),
    ...options,
    config: { variables: HEATING_VARIABLES, ...options.config },
  });

test('one device for the PLC, one feature per variable, the values published on creation', async () => {
  const world = await heating();
  try {
    const { device } = world;
    assert.equal(device.name, 'S7 192.0.2.10');
    assert.equal(device.model, 'Siemens S7');
    assert.equal(device.external_id, 'ext:test-integration:plc:192.0.2.10-102');
    assert.equal(device.should_poll, false);
    assert.deepEqual(
      device.features.map((feature) => [feature.name, feature.category, feature.type]),
      [
        ['Flow', 'temperature-sensor', 'decimal'],
        ['Return', 'temperature-sensor', 'decimal'],
        ['Outdoor', 'temperature-sensor', 'decimal'],
        ['Setpoint', 'water-heater', 'target-temperature'],
        ['Burner', 'unknown', 'unknown'],
        ['Energy', 'energy-sensor', 'index'],
        ['Pump', 'input', 'binary'],
        ['Fault', 'input', 'binary'],
        ['Heating', 'input', 'binary'],
        ['Window', 'input', 'binary'],
        ['Pump output', 'input', 'binary'],
      ],
    );
    assert.equal(world.feature('Flow').external_id, `${device.external_id}:a-db10-real0`);
    // TIA syntax and nodes7 syntax give the same canonical key.
    assert.equal(world.feature('Fault').external_id, `${device.external_id}:a-db10-x22-1`);
    assert.equal(world.state('Outdoor'), -2.5);
    assert.equal(world.state('Flow'), 45.2);
    assert.equal(world.state('Return'), 38.7);
    assert.equal(world.state('Setpoint'), 21);
    assert.equal(world.state('Burner'), 63);
    assert.equal(world.feature('Burner').unit, 'percent');
    assert.equal(world.state('Energy'), 1234.567, 'Wh read, kWh published');
    assert.equal(world.feature('Energy').unit, 'kilowatt-hour');
    assert.equal(world.state('Pump'), 1);
    assert.equal(world.state('Fault'), 0);
    assert.equal(world.state('Heating'), 1);
    assert.equal(world.state('Window'), 1);
    assert.equal(world.state('Pump output'), 1);
    assert.deepEqual(world.fake.connectionStatus, { connected: true });
    assert.deepEqual(world.fake.transports.at(-1), {
      device_external_id: device.external_id,
      transport: 'local',
    });
  } finally {
    await world.stop();
  }
});

test('nothing is published for a device not added to Gladys yet', async () => {
  const world = await heating({ createAll: false });
  try {
    await world.poll();
    assert.equal(world.fake.states.length, 0);
    await world.createDevices();
    await world.settle();
    assert.equal(world.state('Flow'), 45.2);
  } finally {
    await world.stop();
  }
});

test('a change is published at the next cycle, an unchanged value is not', async () => {
  const world = await heating();
  try {
    const before = world.fake.states.length;
    world.plc.memory.DB[10].writeFloatBE(46.1, 0);
    world.plc.memory.M[0] = 0;
    await world.poll();
    assert.equal(world.state('Flow'), 46.1);
    assert.equal(world.state('Heating'), 0);
    assert.equal(world.fake.states.length, before + 2, 'only what changed');
    await world.poll();
    assert.equal(world.fake.states.length, before + 2);
  } finally {
    await world.stop();
  }
});

test('the reads are grouped: 100 variables in a few requests, the flush slowed to stay under 300 states a minute', async () => {
  const db = Buffer.alloc(400);
  const variables = Array.from({ length: 100 }, (_, i) => `V${i}: DB1,INT${i * 2}`).join('; ');
  const world = await createWorld({
    memory: { DB: { 1: db } },
    config: { variables, interval: '1' },
  });
  try {
    assert.equal(world.device.features.length, 100);
    const reads = world.plc.requests.filter((fn) => fn === 0x04).length;
    world.plc.requests.length = 0;
    await world.poll();
    // PDU 480: 20 items per request.
    assert.equal(world.plc.requests.filter((fn) => fn === 0x04).length, 5);
    assert.ok(reads >= 5);
    assert.equal(world.hub.flushPeriodMs(), 25_000);
  } finally {
    await world.stop();
  }
});

test('a lost PLC: status, transport and trigger once, retries spaced out, then back', async () => {
  const world = await heating();
  try {
    world.plc.cut();
    world.plc.down = 'refused';
    await world.poll();
    assert.equal(world.fake.connectionStatus.connected, false);
    assert.match(world.fake.connectionStatus.message.fr, /ne répond pas sur le port 102/);
    assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
    assert.deepEqual(
      world.fake.sceneEvents.map((event) => event.key),
      ['plc_disconnected'],
    );
    assert.equal(world.fake.sceneEvents[0].data.device_name, 'S7 192.0.2.10');
    assert.match(world.fake.sceneEvents[0].data.error, /ne répond pas/);

    // Within the delay, no new attempt.
    const connections = world.plc.connections;
    world.plc.down = null;
    await world.poll();
    assert.equal(world.plc.connections, connections);

    world.advance(5_000);
    world.plc.memory.DB[10].writeFloatBE(50, 0);
    await world.poll();
    assert.deepEqual(world.fake.connectionStatus, { connected: true });
    assert.equal(world.fake.transports.at(-1).transport, 'local');
    assert.deepEqual(
      world.fake.sceneEvents.map((event) => event.key),
      ['plc_disconnected', 'plc_reconnected'],
    );
    assert.equal(world.state('Flow'), 50);
  } finally {
    await world.stop();
  }
});

test('the retry delay grows to a minute while the PLC stays away', async () => {
  const world = await heating();
  try {
    world.plc.cut();
    world.plc.down = 'silent';
    const attempts = [];
    for (let second = 0; second < 300; second += 1) {
      const before = world.hub.nextAttemptAt;
      await world.poll();
      if (world.hub.nextAttemptAt !== before) {
        attempts.push(second);
      }
      world.advance(1000);
    }
    assert.deepEqual(attempts.slice(0, 5), [0, 5, 15, 45, 105]);
    assert.equal(world.fake.sceneEvents.length, 1, 'one trigger, not one per attempt');
  } finally {
    await world.stop();
  }
});

test('a wrong rack/slot is refused by the CPU, and the right one connects', async () => {
  const world = await heating({
    config: { plc_type: 's7_300' },
    setup: (plc) => {
      plc.acceptTsap = 0x0101; // an S7-1200: rack 0, slot 1
    },
  });
  try {
    assert.equal(world.fake.connectionStatus.connected, false);
    assert.match(world.fake.connectionStatus.message.en, /refuses the connection/);
    await world.fake.configUpdated({
      host: HOST,
      variables: HEATING_VARIABLES,
      plc_type: 'custom',
      rack: 0,
      slot: 1,
    });
    await world.settle();
    assert.deepEqual(world.fake.connectionStatus, { connected: true });
  } finally {
    await world.stop();
  }
});

test('a LOGO! is reached by its TSAP, its V memory is DB1', async () => {
  const world = await createWorld({
    memory: logoMemory(),
    config: { variables: LOGO_VARIABLES, plc_type: 'logo' },
    setup: (plc) => {
      plc.acceptTsap = LOGO_TSAP;
    },
  });
  try {
    assert.equal(world.device.name, 'LOGO! 192.0.2.10');
    assert.equal(world.device.model, 'Siemens LOGO!');
    assert.equal(world.state('Greenhouse'), 21.5);
    assert.equal(world.state('Humidity'), 55);
    assert.equal(world.state('Light'), 1);
    assert.equal(world.state('Watering cycles'), 1520);
    assert.equal(world.state('Fan'), 0);
    // VW10 and DB1,WORD10 are the same memory: the same feature key.
    assert.match(world.feature('Watering cycles').external_id, /:a-db1-word10$/);
  } finally {
    await world.stop();
  }
});

test('PUT/GET off on an S7-1200/1500: the status says what to change in TIA Portal', async () => {
  const world = await heating({
    setup: (plc) => {
      plc.putGet = false;
    },
  });
  try {
    assert.equal(world.fake.connectionStatus.connected, false);
    assert.match(world.fake.connectionStatus.message.fr, /PUT\/GET/);
    assert.match(world.fake.connectionStatus.message.de, /PUT\/GET/);
  } finally {
    await world.stop();
  }
});

test('unknown host, missing or wrong address: a clear status, no device', async () => {
  const unknown = await heating({
    setup: (plc) => {
      plc.down = 'unknownHost';
    },
  });
  try {
    assert.match(unknown.fake.connectionStatus.message.en, /Unknown host name/);
  } finally {
    await unknown.stop();
  }
  for (const [host, pattern] of [
    ['', /Enter the IP address/],
    ['http://192.0.2.10', /IP address or a host name/],
  ]) {
    const world = await heating({ config: { host } });
    try {
      assert.match(world.fake.connectionStatus.message.en, pattern);
      assert.deepEqual(world.fake.discoveredDevices, []);
    } finally {
      await world.stop();
    }
  }
});

test('an address the PLC refuses: the others are still read, one trigger, then readable again', async () => {
  const world = await heating({
    config: { variables: `${HEATING_VARIABLES}; Spare: DB11,INT0; Far: DB10,REAL40` },
  });
  try {
    assert.equal(world.state('Flow'), 45.2);
    assert.equal(world.state('Spare'), undefined);
    const events = world.fake.sceneEvents.filter((event) => event.key === 'variable_error');
    assert.deepEqual(
      events.map((event) => [event.data.variable_name, event.data.error]),
      [
        ['Spare', "ce DB n'existe pas dans l'automate"],
        [
          'Far',
          'adresse hors limites : le DB existe-t-il, est-il assez long, sans accès optimisé ?',
        ],
      ],
    );
    await world.poll();
    assert.equal(
      world.fake.sceneEvents.filter((event) => event.key === 'variable_error').length,
      2,
      'not once per cycle',
    );
    assert.deepEqual(world.hub.counts(), { good: 11, total: 13 });
    world.plc.memory.DB[11] = Buffer.alloc(4);
    world.plc.memory.DB[11].writeInt16BE(7, 0);
    await world.poll();
    assert.equal(world.state('Spare'), 7);
    assert.deepEqual(world.hub.counts(), { good: 12, total: 13 });
  } finally {
    await world.stop();
  }
});

test('writes: off by default, then only the declared variables, read back after writing', async () => {
  const world = await heating();
  try {
    const pump = world.feature('Heating');
    assert.equal(pump.read_only, true, 'writing is off: every feature read-only');
    const off = await world.fake.setValue(world.device, pump, 0);
    assert.equal(off.success, false);
    assert.match(off.error.fr, /L'écriture est désactivée/);
    assert.equal(world.plc.memory.M[0], 1);
  } finally {
    await world.stop();
  }
  const writable = await heating({ config: { allow_write: true } });
  try {
    const heatingSwitch = writable.feature('Heating');
    assert.equal(heatingSwitch.read_only, false);
    assert.equal(writable.feature('Setpoint').read_only, false);
    assert.equal(writable.feature('Flow').read_only, true);
    assert.equal(writable.feature('Pump').read_only, true);

    writable.plc.memory.M[0] = 0b1001; // M0.3 must stay set
    const ack = await writable.fake.setValue(writable.device, heatingSwitch, 0);
    assert.equal(ack.success, true, JSON.stringify(ack.error));
    assert.equal(writable.plc.memory.M[0], 0b1000, 'only the bit is written');
    assert.equal(writable.state('Heating'), 0, 'read back');

    const setpoint = await writable.fake.setValue(
      writable.device,
      writable.feature('Setpoint'),
      19.5,
    );
    assert.equal(setpoint.success, true);
    assert.equal(writable.plc.memory.DB[10].readFloatBE(12), 19.5);
    assert.equal(writable.state('Setpoint'), 19.5);

    const tooHot = await writable.fake.setValue(writable.device, writable.feature('Setpoint'), 45);
    assert.equal(tooHot.success, false);
    assert.match(tooHot.error.en, /bounds declared for this variable \(5 to 30\)/);

    const notDeclared = await writable.fake.setValue(writable.device, writable.feature('Flow'), 3);
    assert.equal(notDeclared.success, false);
    assert.match(notDeclared.error.en, /Flow is not declared "write"/);
  } finally {
    await writable.stop();
  }
});

test('writes refused by the PLC, or that do not fit the type', async () => {
  const world = await createWorld({
    memory: logoMemory(),
    config: {
      variables: 'Counter: VW10 write; Temp: VI0 write scale=0.1; Out: Q0.0 switch',
      allow_write: true,
    },
    setup: (plc) => {
      plc.readOnly.add('Q');
    },
  });
  try {
    const refused = await world.fake.action('write_value', { variable: 'Out', value: '1' });
    assert.equal(refused.success, false);
    assert.match(refused.error.en, /refused the write: the PLC denies access/);

    const negative = await world.fake.action('write_value', { variable: 'Counter', value: '-1' });
    assert.match(negative.error.en, /Out of range for a WORD \(0 to 65535\)/);

    const fraction = await world.fake.action('write_value', { variable: 'counter', value: '2.5' });
    assert.match(fraction.error.fr, /un WORD n'accepte que des nombres entiers/);

    const scaled = await world.fake.action('write_value', { variable: 'Temp', value: '18,5' });
    assert.equal(scaled.success, true, JSON.stringify(scaled.error));
    assert.equal(world.plc.memory.DB[1].readInt16BE(0), 185);
    assert.equal(world.state('Temp'), 18.5);
  } finally {
    await world.stop();
  }
});

test('a normal cycle writes nothing at info level', async (t) => {
  const world = await heating();
  try {
    const lines = await captureLogs(t, async () => {
      world.plc.memory.DB[10].writeFloatBE(47, 0);
      await world.poll();
      await world.poll();
    });
    assert.deepEqual(lines, []);
  } finally {
    await world.stop();
  }
});

test('a lost link is logged once, not at every attempt, and its return once', async (t) => {
  const world = await heating();
  try {
    const lines = await captureLogs(t, async () => {
      world.plc.cut();
      world.plc.down = 'refused';
      for (let i = 0; i < 5; i += 1) {
        await world.poll();
        world.advance(60_000);
      }
      world.plc.down = null;
      await world.poll();
    });
    assert.equal(lines.filter((line) => /unavailable/.test(line)).length, 1, lines.join('\n'));
    assert.equal(lines.filter((line) => /connected again/.test(line)).length, 1);
    assert.equal(lines.length, 2, lines.join('\n'));
  } finally {
    await world.stop();
  }
});

test('the container reads the PLC by itself, without any onPoll from the core', async () => {
  const plc = createFakePlc(heatingMemory());
  const gladys = createFakeGladys({
    // One variable: the flush keeps the 1 s pace (300 states a minute).
    config: { host: HOST, variables: 'Flow: DB10,REAL0 temperature', interval: '1' },
  });
  const app = registerHandlers(gladys, {
    createClient: (options) => new S7Client({ ...options, createSocket: plc.createSocket }),
  });
  try {
    await gladys.connect();
    await app.ready;
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(device);
    }
    const flow = gladys.fake.discoveredDevices[0].features[0].external_id;
    assert.equal(gladys.fake.lastState(flow), 45.2);
    plc.memory.DB[10].writeFloatBE(60, 0);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await app.hub.flushing;
    assert.equal(gladys.fake.lastState(flow), 60);
  } finally {
    await app.stop();
  }
});

test('stop() closes the connection and stops the timer', async () => {
  const world = await heating();
  await world.stop();
  assert.equal(world.plc.sockets.size, 0);
  assert.equal(world.hub.pollTimer, null);
});

test('a write is bounded by the range the feature shows, even without min/max', async () => {
  const world = await heating({
    config: { allow_write: true, variables: 'Sp: DB10,REAL12 setpoint; Count: DB10,DINT18 write' },
  });
  try {
    const hot = await world.fake.action('write_value', { variable: 'Sp', value: '500' });
    assert.match(hot.error.en, /bounds declared for this variable \(0 to 100\)/);
    assert.equal(world.plc.memory.DB[10].readFloatBE(12), 21);
    const thousand = await world.fake.action('write_value', { variable: 'Count', value: '1,000' });
    assert.match(thousand.error.fr, /« 1,000 » est ambigu/);
    const mixed = await world.fake.action('write_value', { variable: 'Count', value: '1.000,5' });
    assert.match(mixed.error.en, /ambiguous/);
    assert.equal(world.plc.memory.DB[10].readInt32BE(18), 1234567);
    // "0,5" can only be a decimal comma.
    const half = await world.fake.action('write_value', { variable: 'Sp', value: '0,125' });
    assert.equal(half.success, true, JSON.stringify(half.error));
    assert.equal(world.plc.memory.DB[10].readFloatBE(12), 0.125);
  } finally {
    await world.stop();
  }
});

test('a write the PLC does not confirm says so: it may have been applied', async () => {
  const world = await heating({ config: { allow_write: true } });
  try {
    // The PLC goes silent: the write times out.
    world.plc.sockets.forEach((socket) => {
      socket.write = () => {};
    });
    const ack = await world.fake.action('write_value', { variable: 'Heating', value: '0' });
    assert.match(ack.error.en, /did not confirm the write: it may have been applied/);
  } finally {
    await world.stop();
  }
});

test('stop() during a connection attempt ends at once and arms no timer', async () => {
  const plc = createFakePlc(heatingMemory());
  plc.down = 'silent';
  const gladys = createFakeGladys({ config: { host: HOST, variables: HEATING_VARIABLES } });
  const app = registerHandlers(gladys, {
    createClient: (options) => new S7Client({ ...options, createSocket: plc.createSocket }),
  });
  const connecting = gladys.connect();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const started = Date.now();
  await app.stop();
  await connecting;
  await app.ready;
  await app.hub.lifecycle;
  assert.ok(Date.now() - started < 1000, 'not the 5 s connection timeout');
  assert.equal(app.hub.pollTimer, null);
});

test('configurations applied back to back run one after the other', async () => {
  const world = await heating({ config: { interval: '60' } });
  try {
    const config = normalizeConfig({ host: HOST, variables: HEATING_VARIABLES, interval: '60' });
    world.hub.timers = true;
    await Promise.all([world.hub.configure(config), world.hub.configure(config)]);
    assert.ok(world.hub.pollTimer, 'one timer');
    assert.equal(world.plc.sockets.size, 1, 'one connection');
  } finally {
    await world.stop();
  }
});
