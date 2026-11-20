// -----------------------------------------------------------------------------
// The actions of the Configuration screen and the scene action: a real
// success shows in green (resolved), every failure in red (thrown, with the
// four languages).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';
import { HEATING_VARIABLES, heatingMemory } from './fixtures/plcs.js';

const failed = (ack) => {
  assert.equal(ack.success, false, JSON.stringify(ack.data));
  for (const lang of ['en', 'fr', 'de', 'es']) {
    assert.equal(typeof ack.error[lang], 'string', `error.${lang}`);
  }
  return ack.error;
};
const succeeded = (ack) => {
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  return ack.data.message;
};

const heating = (config = {}) =>
  createWorld({ memory: heatingMemory(), config: { variables: HEATING_VARIABLES, ...config } });

test('check_config: green when everything is right, red with the mistakes', async () => {
  const good = await heating();
  try {
    const message = succeeded(await good.fake.action('check_config', {}));
    assert.equal(
      message.fr,
      'Connecté : 11 variable(s) lue(s) sur 11.\nAucune erreur dans les variables.',
    );
  } finally {
    await good.stop();
  }
  const bad = await heating({
    variables: `${HEATING_VARIABLES}; Spare: DB11,INT0; Y: MW10.3; Z: M0.2 temperature`,
  });
  try {
    const error = failed(await bad.fake.action('check_config', {}));
    assert.match(error.en, /^Connected: 11 of 14 variable\(s\) read\./);
    assert.match(error.en, /Entry 13 \(Y\): "MW10.3" is not an S7 address/);
    assert.match(error.en, /Entry 14 \(Z\): a bit can only be binary or switch, not temperature/);
    assert.match(error.fr, /Entrée 12 \(Spare\) : |Entrée 12 \(Spare\): ce DB n'existe pas/);
  } finally {
    await bad.stop();
  }
});

test('check_config: red when the PLC is not connected, or nothing is declared', async () => {
  const down = await heating();
  try {
    down.plc.cut();
    down.plc.down = 'refused';
    await down.poll();
    assert.match(
      failed(await down.fake.action('check_config', {})).fr,
      /^L'automate n'est pas connecté :\nL'automate ne répond pas/,
    );
  } finally {
    await down.stop();
  }
  const empty = await heating({ variables: '' });
  try {
    assert.match(failed(await empty.fake.action('check_config', {})).en, /No variable declared/);
  } finally {
    await empty.stop();
  }
  const noHost = await heating({ host: '' });
  try {
    assert.match(failed(await noHost.fake.action('check_config', {})).en, /Enter the IP address/);
  } finally {
    await noHost.stop();
  }
});

test('read_address: any address once, declared or not', async () => {
  const world = await heating({ variables: '' });
  try {
    assert.equal(
      succeeded(await world.fake.action('read_address', { address: 'db10,real4' })).fr,
      'DB10,REAL4 = 38,7',
    );
    assert.equal(
      succeeded(await world.fake.action('read_address', { address: 'DB10.DBX22.0' })).en,
      'DB10,X22.0 = 1',
    );
    assert.match(
      failed(await world.fake.action('read_address', { address: 'DB99,INT0' })).en,
      /^DB99,INT0 cannot be read:\nthis DB does not exist/,
    );
    assert.match(
      failed(await world.fake.action('read_address', { address: 'DB10,INT0.1' })).fr,
      /n'est pas une adresse S7/,
    );
    assert.match(failed(await world.fake.action('read_address', {})).en, /Give an address/);
  } finally {
    await world.stop();
  }
});

test('write_value: green once written, red on every failure', async () => {
  const world = await heating({ allow_write: true });
  try {
    assert.equal(
      succeeded(await world.fake.action('write_value', { variable: 'setpoint', value: '20,5' })).fr,
      'Setpoint : 20,5 écrit.',
    );
    assert.equal(world.plc.memory.DB[10].readFloatBE(12), 20.5);
    // By address too.
    succeeded(await world.fake.action('write_value', { variable: 'M0.0', value: 'off' }));
    assert.equal(world.plc.memory.M[0] & 1, 0);
    assert.match(
      failed(await world.fake.action('write_value', { variable: 'Nope', value: '1' })).en,
      /No declared variable is called Nope/,
    );
    assert.match(
      failed(await world.fake.action('write_value', { variable: 'Heating', value: '2' })).en,
      /expected 0 or 1/,
    );
    assert.match(
      failed(await world.fake.action('write_value', { variable: 'Setpoint', value: 'warm' })).en,
      /"warm" is not a number/,
    );
    assert.match(
      failed(await world.fake.action('write_value', { variable: 'Setpoint' })).en,
      /Give the value/,
    );
    assert.match(
      failed(await world.fake.action('write_value', { value: '1' })).en,
      /Give the name/,
    );
  } finally {
    await world.stop();
  }
});

test('the scene action writes, and fails the action (not the scene) on a refusal', async () => {
  const world = await heating({ allow_write: true });
  try {
    const ack = await world.fake.sceneAction('write_value', { variable: 'Heating', value: '0' });
    assert.equal(ack.success, true, JSON.stringify(ack.error));
    assert.equal(world.plc.memory.M[0] & 1, 0);
    const refused = await world.fake.sceneAction('write_value', { variable: 'Flow', value: '1' });
    assert.equal(refused.success, false);
    assert.match(refused.error.de, /Flow ist in den Variablen nicht als „write“ deklariert/);
  } finally {
    await world.stop();
  }
  const off = await heating();
  try {
    const ack = await off.fake.sceneAction('write_value', { variable: 'Heating', value: '0' });
    assert.equal(ack.success, false);
    assert.match(ack.error.es, /La escritura está desactivada/);
  } finally {
    await off.stop();
  }
});
