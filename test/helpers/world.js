// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake PLC speaking S7comm,
// and the integration wired on top through registerHandlers — the very
// wiring index.js uses, the real S7 client included.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { S7Client } from '../../src/s7/client.js';
import { createFakePlc } from './fakePlc.js';

// Keep the test output readable (LOG_LEVEL is read on every log call).
// LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const HOST = '192.0.2.10';

/**
 * @param {object} options
 * @param {object} [options.memory] memory of the fake PLC
 * @param {object} [options.config] integration config (host added)
 * @param {boolean} [options.connect]
 * @param {boolean} [options.createAll] add the discovered device to Gladys
 * @param {(plc: object) => void} [options.setup] change the PLC before connecting
 * @param {object} [options.clock] { now } a clock the test moves
 */
export async function createWorld({
  memory,
  config = {},
  connect = true,
  createAll = true,
  setup,
  clock = { now: 1_800_000_000_000 },
} = {}) {
  const plc = createFakePlc(memory);
  setup?.(plc);
  const gladys = createFakeGladys({ config: { host: HOST, ...config } });
  const app = registerHandlers(gladys, {
    createClient: (options) =>
      new S7Client({ ...options, timeoutMs: 50, createSocket: plc.createSocket }),
    timers: false,
    now: () => clock.now,
  });
  const world = {
    gladys,
    fake: gladys.fake,
    app,
    hub: app.hub,
    plc,
    clock,
    async settle() {
      await app.hub.polling;
      await app.hub.flushing;
    },
    /** One reading cycle, as the timer runs it. */
    async poll() {
      await app.hub.poll();
      await world.settle();
    },
    /** Let the time pass (the reconnection delays). */
    advance(ms) {
      clock.now += ms;
    },
    async createDevices(devices = gladys.fake.discoveredDevices) {
      for (const device of devices) {
        await gladys.fake.deviceCreated(device);
      }
    },
    get device() {
      return gladys.fake.discoveredDevices[0];
    },
    feature(name) {
      const feature = world.device?.features.find((candidate) => candidate.name === name);
      if (!feature) {
        throw new Error(`No feature ${name}`);
      }
      return feature;
    },
    /** The last state published for a feature, by name. */
    state(name) {
      return gladys.fake.lastState(world.feature(name).external_id);
    },
    async stop() {
      await app.stop();
    },
  };
  if (connect) {
    await gladys.connect();
    await world.settle();
    if (createAll) {
      await world.createDevices();
      await world.settle();
    }
  }
  return world;
}

/**
 * Capture the log lines written at `level` and above while `run` runs.
 * @returns {Promise<string[]>}
 */
export async function captureLogs(t, run, level = 'info') {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  try {
    await run();
  } finally {
    process.env.LOG_LEVEL = previous;
    console.log.mock.restore();
    console.error.mock.restore();
  }
  return lines;
}
