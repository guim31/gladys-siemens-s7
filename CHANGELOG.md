# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Read the variables of a Siemens S7 PLC (S7-300, S7-400, S7-1200, S7-1500,
  ET 200SP) or a LOGO! 0BA7 / 0BA8 over the local network (S7comm, port 102):
  one device for the PLC, one feature per declared variable, with its kind
  and unit (temperature, power, energy in kWh, on/off…).
- Addresses of DBs, merkers, inputs, outputs and LOGO! V memory, in the
  Node-RED syntax (`DB1,REAL0`, `MW10`) or the TIA Portal one (`DB1.DBX0.1`).
- Reading every 1 s to 1 min, all variables grouped; automatic reconnection.
- Optional writing, off by default: dashboard on/off inputs and setpoints, a
  "Write a value" action and scene action for the variables declared `write`.
- "Check the configuration" and "Read an address" actions.
- Scene triggers: PLC lost, PLC back, variable no longer readable.
- A "Siemens PLC" dashboard widget: first values and health of the link.
- Documentation in English, French, German and Spanish.
