# Siemens S7 for Gladys Assistant

Read and write the variables of a **Siemens S7 PLC** from
[Gladys Assistant](https://gladysassistant.com), on the local network: S7-300,
S7-400, S7-1200, S7-1500, ET 200SP CPUs and LOGO! 0BA7 / 0BA8, through the S7
protocol (S7comm over ISO-on-TCP, port 102).

> **Developed without the hardware: feedback welcome.** It was tested against
> the [Snap7](https://snap7.sourceforge.net/) S7 server in Docker, not against
> a real PLC.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Features

- One Gladys device for the PLC, one feature per declared variable: bits,
  bytes, words, integers and reals of DBs, merkers, inputs, outputs and the
  LOGO! V memory, with their unit (temperature, power, energy in kWh…).
- Addresses in the Node-RED / nodes7 syntax (`DB1,REAL0`, `DB1,X0.1`, `MW10`)
  or the TIA Portal one (`DB1.DBX0.1`, `DB1.DBW4`), German letters (`E`, `A`)
  and LOGO! V addresses (`VW10`, `V0.1`).
- Reading at the chosen pace (1 s to 1 min), every variable in as few requests
  as the PDU allows; only the changes reach Gladys, under its 300 values a
  minute.
- S7-1200/1500 (rack 0, slot 1), S7-300 (slot 2), any rack/slot (S7-400), LOGO!
  by TSAP; clear messages for a wrong rack/slot or PUT/GET left off.
- Automatic reconnection, retries spaced from 5 s to 1 min.
- **Writing, off by default**: dashboard on/off inputs and setpoints, a
  "Write a value" button and scene action, for the variables declared `write`;
  a bit is written alone, the value is read back.
- **Read an address** and **Check the configuration** buttons.
- Scene triggers: PLC lost, PLC back, address no longer readable.
- A **Siemens PLC** dashboard widget.

## Requirements

- Gladys Assistant 5.1 or later.
- A Siemens S7 PLC or a LOGO! reachable on port 102 from Gladys, with a fixed
  IP address; PUT/GET access allowed on S7-1200/1500, a server connection on a
  LOGO!.

## Installation

In Gladys: **Integrations → Install from GitHub**, then the address of this
repository: `https://github.com/guim31/gladys-siemens-s7`. Enter the PLC
address and type, declare the variables, save and add the PLC from the
**Discovery** tab.

## How it works

- `src/s7/` is a small S7comm client written for this integration, without
  any dependency: `address.js` (address syntax, encoding), `frames.js` (TPKT,
  COTP, S7 jobs and replies), `client.js` (one TCP connection, one request at a
  time, frames reassembled, items packed to the negotiated PDU). It was
  preferred to `nodes7` (not maintained since 2022, no TCP reassembly, retries
  silently on a refused rack/slot, logs on the console) and to
  `@st-one-io/nodes7` (GPL-3.0).
- `src/hub.js` publishes the device as soon as the configuration is read (the
  address gives the type), reads every variable at each cycle, and publishes
  the latest value of each feature at most every interval, slower with many
  variables (100 variables: every 25 s).
- External ids: the device is `plc:<host>-<port>` (what the user typed); a
  feature is `a-<canonical address>` (`DB1.DBX0.1`, `db1,x0.1` and, on a
  LOGO!, `V0.1` are all `a-db1-x0-1`).

## Checked, and what was not

- The unit tests drive the real client against a fake PLC that speaks the
  protocol (`test/helpers/fakePlc.js`), and check the frames byte for byte
  against those of a real Snap7 server (`test/fixtures/snap7-frames.js`).
- The image was run with the Gladys sandbox constraints against a Snap7 server
  in Docker (`scripts/live-check.mjs`): reading, writing, refused write,
  unknown DB, server stopped then back.
- Not checked: a real CPU. The Snap7 server accepts any rack/slot and has no
  PUT/GET setting: these two refusals are tested with the fake PLC only, from
  the behaviour documented by Siemens and Snap7.

## Limitations

- One PLC per installation; numbers and bits only (no STRING, dates, arrays,
  timers, counters).
- Optimized DBs of S7-1200/1500 cannot be read by address; S7-200 (PPI) is not
  supported.
- The S7 protocol has no security: keep the PLC on a trusted network.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests never touch the network. `scripts/live-check.mjs` runs the
integration (fake Gladys of the SDK, real client) against a real S7 server:

```bash
docker build -t gladys-test-siemens-s7-plc scripts/snap7
docker network create gladys-test-siemens-s7
docker run -d --name gladys-test-siemens-s7-plc --network gladys-test-siemens-s7 gladys-test-siemens-s7-plc
docker run --rm --network gladys-test-siemens-s7 -v "$PWD:/app:ro" -w /app \
  mirror.gcr.io/library/node:24-alpine node scripts/live-check.mjs gladys-test-siemens-s7-plc
```

See [`CLAUDE.md`](CLAUDE.md) for the project rules. Releases go through
**Actions → Release** (it bumps `package.json`, the manifest `version` and
`docker_image`, and rolls `CHANGELOG.md`). A hand-pushed `vX.Y.Z` tag only
builds the image: bump `version` in `package.json` and in the manifest (with
the `docker_image` tag) and commit it before tagging.

## Credits

- [Snap7](https://snap7.sourceforge.net/) by Davide Nardella (LGPL-3.0) and
  [python-snap7](https://github.com/gijzelaerr/python-snap7) (MIT): the
  reference of the protocol and the test server.
- [nodes7](https://github.com/plcpeople/nodeS7) by plcpeople (MIT): the address
  syntax, the reference used by Node-RED users.
- The s7comm dissector of [Wireshark](https://www.wireshark.org/).
- The Siemens logo of the cover comes from
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Siemens-logo.svg).
- The architecture and the conformity tests follow
  [gladys-opcua](https://github.com/guim31/gladys-opcua) and
  [gladys-modbus](https://github.com/guim31/gladys-modbus).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Siemens AG.
Siemens, SIMATIC, S7 and LOGO! are trademarks of Siemens AG.

## License

Apache-2.0
