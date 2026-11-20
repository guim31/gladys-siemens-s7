// -----------------------------------------------------------------------------
// The "Siemens PLC" widget: tiles of the device features, link status, each
// block can be hidden, valid for the core (budget, references).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createWorld } from './helpers/world.js';
import { HEATING_VARIABLES, heatingMemory } from './fixtures/plcs.js';

const get = async (world, settings, language = 'fr') => {
  const ack = await world.fake.widgetGet('plc_overview', { settings, language });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  return ack.data.content;
};

test('six tiles at most and the link status, valid for the core', async () => {
  const world = await createWorld({
    memory: heatingMemory(),
    config: { variables: HEATING_VARIABLES },
  });
  try {
    const content = await get(world, { device: world.device.external_id });
    validateWidgetContent(content);
    const tiles = content.components.filter((component) => component.type === 'value');
    assert.equal(tiles.length, 6);
    const ids = new Set(world.device.features.map((feature) => feature.external_id));
    assert.ok(tiles.every((tile) => ids.has(tile.device_feature)));
    const status = content.components.find((component) => component.type === 'status');
    assert.deepEqual(
      status.items.map((item) => item.value),
      ['Connecté', '11/11', status.items[2].value, status.items[3].value],
    );
    assert.match(status.items[3].value, /^\d+ ms$/);
    assert.ok(content.components.length <= 8);
  } finally {
    await world.stop();
  }
});

test('each block can be hidden; a link loss shows in the status', async () => {
  const world = await createWorld({
    memory: heatingMemory(),
    config: { variables: HEATING_VARIABLES },
  });
  try {
    const device = world.device.external_id;
    const noValues = await get(world, { device, hide_values: true });
    assert.deepEqual(
      noValues.components.map((component) => component.type),
      ['status'],
    );
    const noStatus = await get(world, { device, hide_status: true });
    assert.ok(noStatus.components.every((component) => component.type === 'value'));
    world.plc.cut();
    world.plc.down = 'refused';
    await world.poll();
    const down = await get(world, { device }, 'en');
    const status = down.components.find((component) => component.type === 'status');
    assert.equal(status.items[0].value, 'Disconnected');
    assert.equal(status.items[1].value, '0/11');
    assert.ok(world.fake.widgetRefreshes.includes('plc_overview'));
  } finally {
    await world.stop();
  }
});

test('no PLC chosen, or one no longer configured: a sentence', async () => {
  const world = await createWorld({
    memory: heatingMemory(),
    config: { variables: HEATING_VARIABLES },
  });
  try {
    assert.match((await get(world, {})).components[0].text.fr, /Choisissez l'automate/);
    assert.match(
      (await get(world, { device: 'ext:test-integration:plc:other-102' })).components[0].text.en,
      /no longer in the integration/,
    );
  } finally {
    await world.stop();
  }
});
