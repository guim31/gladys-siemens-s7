// -----------------------------------------------------------------------------
// Live check against a real S7 server (the Snap7 server of scripts/snap7):
// the integration as index.js wires it, the real client over TCP, the fake
// Gladys of the SDK in place of Gladys. Never run by npm test.
//
//   node scripts/live-check.mjs <host> [seconds to watch]
//
// Prints what Gladys would receive. While it watches, stop and start the
// server to see the loss and the return.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';

const host = process.argv[2];
const watchSeconds = Number(process.argv[3] ?? 0);
if (!host) {
  console.log('Usage: node scripts/live-check.mjs <host> [seconds to watch]');
  process.exit(2);
}

const variables = [
  'Flow: DB1,REAL0 temperature',
  'Count: DB1,INT4',
  'Word: DB1.DBW6',
  'Energy: DB1,DINT8 energy unit=Wh',
  'Bit 0: DB1,X12.0',
  'Bit 1: DB1,X12.1 switch',
  'Big: DB1,LREAL16',
  'Mode: M0.1',
  'Counter: MW10 write',
  'Input: I0.0',
  'Missing: DB9,INT0',
].join('; ');

const gladys = createFakeGladys({
  config: { host, variables, interval: '1', allow_write: true, language: 'en' },
});
const app = registerHandlers(gladys);
const show = (label, value) => console.log(`${label.padEnd(28)} ${JSON.stringify(value)}`);

await gladys.connect();
await app.ready;
const [device] = gladys.fake.discoveredDevices;
show('connection status', gladys.fake.connectionStatus);
await gladys.fake.deviceCreated(device);
await app.hub.flushing;
for (const feature of device.features) {
  show(feature.name, gladys.fake.lastState(feature.external_id) ?? null);
}
show(
  'scene events',
  gladys.fake.sceneEvents.map((event) => [event.key, event.data.error]),
);

const action = async (key, fields) => {
  const ack = await gladys.fake.action(key, fields);
  return ack.success ? ack.data.message.en : `REFUSED: ${ack.error.en}`;
};
show('check_config', await action('check_config', {}));
show('read DB1,REAL0', await action('read_address', { address: 'DB1,REAL0' }));
show('read DB2,INT20 (past end)', await action('read_address', { address: 'DB2,INT20' }));
show('write Counter = 77', await action('write_value', { variable: 'Counter', value: '77' }));
show('write Bit 1 = 1', await action('write_value', { variable: 'Bit 1', value: '1' }));
show('write Flow (read-only)', await action('write_value', { variable: 'Flow', value: '20' }));
show('write Missing (no DB9)', await action('write_value', { variable: 'Missing', value: '1' }));
show('read MW10 back', await action('read_address', { address: 'MW10' }));
show('read DB1,X12.0 (untouched)', await action('read_address', { address: 'DB1,X12.0' }));
await gladys.fake.setValue(
  device,
  device.features.find((feature) => feature.name === 'Bit 1'),
  0,
);
show('Bit 1 after setValue 0', gladys.fake.lastState(device.features[5].external_id));

if (watchSeconds > 0) {
  console.log(`Watching ${watchSeconds} s: stop and start the server now.`);
  let last = '';
  for (let second = 0; second < watchSeconds; second += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const status = JSON.stringify(gladys.fake.connectionStatus);
    if (status !== last) {
      last = status;
      show(`t+${second + 1}s status`, gladys.fake.connectionStatus);
    }
  }
  show(
    'scene events',
    gladys.fake.sceneEvents.map((event) => event.key),
  );
  show('flow after the return', gladys.fake.lastState(device.features[0].external_id));
}

const usage = process.memoryUsage();
show('memory (RSS, MB)', Math.round(usage.rss / 1048576));
await app.stop();
process.exit(0);
