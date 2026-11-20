// -----------------------------------------------------------------------------
// Integration configuration: one PLC (address, how to reach its CPU), the
// variables to read, the pace. DEFAULT_CONFIG mirrors the `default` values of
// the manifest (test/manifest.test.js).
// -----------------------------------------------------------------------------

import { DEFAULT_LANGUAGE, LANGUAGES } from './i18n.js';
import { parseTsap, rackSlotTsap } from './s7/frames.js';

/** Reading intervals offered, in seconds. */
export const INTERVALS = ['1', '2', '5', '10', '30', '60'];

/**
 * PLC families: how the CPU is reached. Rack 0, slot 1 for an S7-1200, an
 * S7-1500 or an ET 200SP CPU, slot 2 for an S7-300; a LOGO! takes the TSAP
 * of the server connection set in LOGO!Soft Comfort; `custom` takes the rack
 * and the slot fields (S7-400, CPU in another slot).
 */
export const PLC_TYPES = {
  s7_1200_1500: { rack: 0, slot: 1, label: 'S7' },
  s7_300: { rack: 0, slot: 2, label: 'S7-300' },
  logo: { tsap: true, label: 'LOGO!' },
  custom: { custom: true, label: 'S7' },
};
export const PLC_TYPE_KEYS = Object.keys(PLC_TYPES);

export const DEFAULT_CONFIG = {
  language: DEFAULT_LANGUAGE,
  port: 102,
  plc_type: 's7_1200_1500',
  rack: 0,
  slot: 1,
  local_tsap: '01.00',
  remote_tsap: '02.00',
  interval: '5',
  allow_write: false,
};

/**
 * Merge the user config with the defaults, with the right types.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG };
  for (const [key, value] of Object.entries(raw ?? {})) {
    // An emptied field arrives as null or "": keep the default.
    if (value !== null && value !== undefined && value !== '') {
      config[key] = value;
    }
  }
  if (!LANGUAGES.includes(config.language)) {
    config.language = DEFAULT_LANGUAGE;
  }
  if (!PLC_TYPE_KEYS.includes(config.plc_type)) {
    config.plc_type = DEFAULT_CONFIG.plc_type;
  }
  config.interval = String(config.interval);
  if (!INTERVALS.includes(config.interval)) {
    config.interval = DEFAULT_CONFIG.interval;
  }
  config.allow_write = config.allow_write === true || config.allow_write === 'true';
  config.host = String(config.host ?? '').trim();
  config.variables = String(config.variables ?? '');
  for (const key of ['port', 'rack', 'slot']) {
    config[key] = Number(config[key]);
  }
  config.local_tsap = String(config.local_tsap).trim();
  config.remote_tsap = String(config.remote_tsap).trim();
  return config;
}

/**
 * How to reach the PLC, or what is wrong.
 * @returns {{ host, port, localTsap, remoteTsap, platformId, label } | { error: string }}
 */
export function readTarget(config) {
  const { host } = config;
  if (!host) {
    return { error: 'noHost' };
  }
  // A host name or an IP address: no scheme, no port, no credentials.
  if (!/^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(host)) {
    return { error: 'badHost' };
  }
  const { port } = config;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: 'badPort' };
  }
  const type = PLC_TYPES[config.plc_type];
  let localTsap = 0x0100;
  let remoteTsap;
  if (type.tsap) {
    localTsap = parseTsap(config.local_tsap);
    remoteTsap = parseTsap(config.remote_tsap);
    if (localTsap === null || remoteTsap === null) {
      return { error: 'badTsap' };
    }
  } else {
    const rack = type.custom ? config.rack : type.rack;
    const slot = type.custom ? config.slot : type.slot;
    if (!Number.isInteger(rack) || rack < 0 || rack > 7) {
      return { error: 'badRackSlot' };
    }
    if (!Number.isInteger(slot) || slot < 0 || slot > 31) {
      return { error: 'badRackSlot' };
    }
    remoteTsap = rackSlotTsap(rack, slot);
  }
  const lower = host.toLowerCase();
  return {
    host: lower,
    port,
    localTsap,
    remoteTsap,
    label: type.label,
    // What the user typed, not what the PLC says: give the PLC a fixed IP.
    platformId: `${lower}-${port}`.replace(/[^a-z0-9.-]/g, '-'),
  };
}
