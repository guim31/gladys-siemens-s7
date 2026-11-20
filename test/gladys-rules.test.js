// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures: an S7-1200 boiler room, a LOGO! greenhouse, and one variable of
// every kind, writable or not, in every message language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KINDS } from '../src/kinds.js';
import { createWorld } from './helpers/world.js';
import {
  HEATING_VARIABLES,
  LOGO_TSAP,
  LOGO_VARIABLES,
  heatingMemory,
  logoMemory,
} from './fixtures/plcs.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

// One variable per kind, of a type that fits it: a bit for on/off, a REAL else.
const kindVariables = Object.keys(KINDS)
  .map((kind, i) =>
    KINDS[kind].boolean
      ? `${kind}: M${i}.0 ${kind} write`
      : `${kind}: DB1,REAL${i * 4} ${kind} write`,
  )
  .join('; ');
const kindMemory = () => ({ DB: { 1: Buffer.alloc(128) }, M: Buffer.alloc(32) });

const fleets = {
  heating: { memory: heatingMemory, variables: HEATING_VARIABLES, config: {} },
  logo: {
    memory: logoMemory,
    variables: LOGO_VARIABLES,
    config: { plc_type: 'logo' },
    tsap: LOGO_TSAP,
  },
  kinds: { memory: kindMemory, variables: kindVariables, config: {} },
};

const scenarios = [];
for (const [fleet, spec] of Object.entries(fleets)) {
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const allowWrite of [false, true]) {
      scenarios.push({ fleet, spec, language, allowWrite });
    }
  }
}

for (const { fleet, spec, language, allowWrite } of scenarios) {
  test(`every discovered device follows the Gladys rules (${fleet}, ${language}, writing ${allowWrite ? 'on' : 'off'})`, async () => {
    const world = await createWorld({
      memory: spec.memory(),
      config: { ...spec.config, variables: spec.variables, language, allow_write: allowWrite },
      setup: (plc) => {
        plc.acceptTsap = spec.tsap ?? null;
      },
    });
    try {
      const devices = world.fake.discoveredDevices;
      assert.equal(devices.length, 1, 'one device for the PLC');
      const deviceIds = new Set();

      for (const device of devices) {
        const where = device.name;
        assert.ok(!deviceIds.has(device.external_id), `${where}: duplicate device external_id`);
        deviceIds.add(device.external_id);

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(feature.external_id.startsWith(`${device.external_id}:`), `${at}: foreign id`);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
          assert.ok(feature.name.length <= 40, `${at}: name longer than 40 characters`);
        }
      }
    } finally {
      await world.stop();
    }
  });
}

test('the writable features are the declared switches and setpoints, nothing else', async () => {
  const world = await createWorld({
    memory: kindMemory(),
    config: { variables: kindVariables, allow_write: true },
  });
  try {
    const writable = world.device.features
      .filter((feature) => !feature.read_only)
      .map((f) => f.name);
    assert.deepEqual(writable.sort(), ['setpoint', 'switch']);
    // Not voice-controllable: never a switch or thermostat category.
    for (const feature of world.device.features) {
      assert.ok(!['switch', 'thermostat', 'light'].includes(feature.category), feature.name);
    }
    assert.equal(world.device.features.length, Object.keys(KINDS).length);
  } finally {
    await world.stop();
  }
});

test('every feature gets a value from the PLC once added', async () => {
  for (const [fleet, spec] of Object.entries(fleets)) {
    const world = await createWorld({
      memory: spec.memory(),
      config: { ...spec.config, variables: spec.variables },
      setup: (plc) => {
        plc.acceptTsap = spec.tsap ?? null;
      },
    });
    try {
      for (const feature of world.device.features) {
        assert.equal(
          typeof world.fake.lastState(feature.external_id),
          'number',
          `${fleet} / ${feature.name}`,
        );
      }
    } finally {
      await world.stop();
    }
  }
});
