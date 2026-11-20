// -----------------------------------------------------------------------------
// S7 addresses: what the user types, what the PLC is asked for.
//
// Accepted, case-insensitive (German letters E/A for inputs/outputs too):
//
//   DB1,X0.1  DB1,BYTE2  DB1,WORD4  DB1,INT6  DB1,DWORD8  DB1,DINT8  DB1,REAL12
//   DB1,LREAL16                      (the nodes7 / Node-RED syntax)
//   DB1.DBX0.1  DB1.DBB2  DB1.DBW4  DB1.DBD8          (the TIA Portal syntax)
//   I0.0  Q0.1  M10.7                                   (bits)
//   IB0  QW2  MW10  MI10  MD20  MDI20  MR20  MLR24      (byte, word, int, dword,
//                                                        dint, real, lreal)
//   V10.0  VB10  VW10  VI10  VD10  VR10                 (LOGO! V memory = DB1)
//
// Every form has one canonical text ("DB1,X0.1", "MW10"): the feature key is
// built on it, so "DB1.DBX0.1", "db1,x0.1" and "V0.1" on DB1 stay one feature.
// -----------------------------------------------------------------------------

/** Data types: size in bytes, integer range. */
export const TYPES = {
  bool: { size: 1 },
  byte: { size: 1, min: 0, max: 255 },
  word: { size: 2, min: 0, max: 65535 },
  int: { size: 2, min: -32768, max: 32767 },
  dword: { size: 4, min: 0, max: 4294967295 },
  dint: { size: 4, min: -2147483648, max: 2147483647 },
  real: { size: 4, float: true },
  lreal: { size: 8, float: true },
};

/** S7comm area codes. */
export const AREA_CODES = { I: 0x81, Q: 0x82, M: 0x83, DB: 0x84 };

const DB_TYPES = {
  X: 'bool',
  B: 'byte',
  BYTE: 'byte',
  W: 'word',
  WORD: 'word',
  I: 'int',
  INT: 'int',
  D: 'dword',
  DWORD: 'dword',
  DI: 'dint',
  DINT: 'dint',
  R: 'real',
  REAL: 'real',
  LR: 'lreal',
  LREAL: 'lreal',
};
const AREA_TYPES = {
  X: 'bool',
  B: 'byte',
  W: 'word',
  I: 'int',
  D: 'dword',
  DI: 'dint',
  R: 'real',
  LR: 'lreal',
};
const AREA_LETTERS = { I: 'I', E: 'I', Q: 'Q', A: 'Q', M: 'M', V: 'V' };
const DB_NAMES = {
  bool: 'X',
  byte: 'BYTE',
  word: 'WORD',
  int: 'INT',
  dword: 'DWORD',
  dint: 'DINT',
  real: 'REAL',
  lreal: 'LREAL',
};
const AREA_NAMES = {
  bool: '',
  byte: 'B',
  word: 'W',
  int: 'I',
  dword: 'D',
  dint: 'DI',
  real: 'R',
  lreal: 'LR',
};
const MAX_OFFSET = 65535;

/**
 * Parse an address.
 * @param {string} text
 * @returns {{ area: 'I'|'Q'|'M'|'DB', db: number, type: string, offset: number, bit: number, text: string } | null}
 */
export function parseAddress(text) {
  const upper = String(text ?? '')
    .trim()
    .toUpperCase();
  let area;
  let db = 0;
  let type;
  let offset;
  let bit;
  const dbMatch = upper.match(/^DB(\d{1,5})[,.](?:DB)?([A-Z]+)(\d{1,5})(?:\.(\d))?$/);
  const areaMatch = upper.match(/^([IEQAMV])(LR|DI|[XBWIDR])?(\d{1,5})(?:\.(\d))?$/);
  if (dbMatch) {
    area = 'DB';
    db = Number(dbMatch[1]);
    type = DB_TYPES[dbMatch[2]];
    offset = Number(dbMatch[3]);
    bit = dbMatch[4];
  } else if (areaMatch) {
    area = AREA_LETTERS[areaMatch[1]];
    // No type letter: a bit (M0.1); a type letter without bit: that type.
    type = areaMatch[2] ? AREA_TYPES[areaMatch[2]] : areaMatch[4] !== undefined ? 'bool' : null;
    offset = Number(areaMatch[3]);
    bit = areaMatch[4];
    if (area === 'V') {
      area = 'DB';
      db = 1;
    }
  } else {
    return null;
  }
  if (!type || offset > MAX_OFFSET || (area === 'DB' && (db < 1 || db > 65535))) {
    return null;
  }
  // A bit needs its number (0 to 7), another type has none.
  if ((type === 'bool') !== (bit !== undefined)) {
    return null;
  }
  bit = bit === undefined ? 0 : Number(bit);
  if (bit > 7) {
    return null;
  }
  const suffix = type === 'bool' ? `.${bit}` : '';
  const canonical =
    area === 'DB'
      ? `DB${db},${DB_NAMES[type]}${offset}${suffix}`
      : `${area}${AREA_NAMES[type]}${offset}${suffix}`;
  return { area, db, type, offset, bit, text: canonical };
}

/** A stable feature key from the canonical address: "a-db1-real4", "a-m0-1". */
export function featureKey(address) {
  return `a-${address.text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Byte count read for an address (a bit reads its byte). */
export const sizeOf = (address) => TYPES[address.type].size;

/**
 * The value of an address from the bytes read (big-endian, as every S7).
 * @param {object} address
 * @param {Buffer} bytes exactly sizeOf(address) bytes
 * @returns {number|boolean}
 */
export function decode(address, bytes) {
  switch (address.type) {
    case 'bool':
      return ((bytes[0] >> address.bit) & 1) === 1;
    case 'byte':
      return bytes.readUInt8(0);
    case 'word':
      return bytes.readUInt16BE(0);
    case 'int':
      return bytes.readInt16BE(0);
    case 'dword':
      return bytes.readUInt32BE(0);
    case 'dint':
      return bytes.readInt32BE(0);
    case 'real':
      return bytes.readFloatBE(0);
    case 'lreal':
      return bytes.readDoubleBE(0);
    default:
      throw new Error(`Unknown type ${address.type}`);
  }
}

/**
 * The bytes to write for a value already checked against the type.
 * @param {object} address
 * @param {number|boolean} value
 * @returns {Buffer}
 */
export function encode(address, value) {
  const bytes = Buffer.alloc(sizeOf(address));
  switch (address.type) {
    case 'bool':
      bytes[0] = value ? 1 : 0;
      break;
    case 'byte':
      bytes.writeUInt8(value, 0);
      break;
    case 'word':
      bytes.writeUInt16BE(value, 0);
      break;
    case 'int':
      bytes.writeInt16BE(value, 0);
      break;
    case 'dword':
      bytes.writeUInt32BE(value, 0);
      break;
    case 'dint':
      bytes.writeInt32BE(value, 0);
      break;
    case 'real':
      bytes.writeFloatBE(value, 0);
      break;
    case 'lreal':
      bytes.writeDoubleBE(value, 0);
      break;
    default:
      throw new Error(`Unknown type ${address.type}`);
  }
  return bytes;
}
