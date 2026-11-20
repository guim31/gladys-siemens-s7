// -----------------------------------------------------------------------------
// PLC values ↔ Gladys states.
//
// Read: a bit is 0/1; a number gets its scale and offset (and the kWh
// conversion of the energy kinds). Write: the reverse, checked against the
// declared bounds and the range of the PLC type, since the PLC would silently
// wrap a value that does not fit.
// -----------------------------------------------------------------------------

import { TYPES } from './s7/address.js';
import { KINDS, publishedUnit } from './kinds.js';

/** Round away the float noise (a REAL 21.3 reads 21.299999237). */
function tidy(number, variable) {
  if (variable.precision !== undefined) {
    const factor = 10 ** variable.precision;
    return Math.round(number * factor) / factor;
  }
  return variable.address.type === 'real'
    ? Number(number.toPrecision(7))
    : Number(number.toPrecision(12));
}

/**
 * The Gladys state of a value read.
 * @param {object} variable parsed variable (address, kind, scale, offset, unit...)
 * @param {number|boolean} raw decoded value
 * @returns {number|null} null: nothing to publish (NaN, infinity)
 */
export function toState(variable, raw) {
  if (typeof raw === 'boolean') {
    return raw ? 1 : 0;
  }
  if (!Number.isFinite(raw)) {
    return null;
  }
  const definition = KINDS[variable.kind];
  if (definition.boolean) {
    return raw !== 0 ? 1 : 0;
  }
  const { factor } = publishedUnit(variable.kind, variable.unit ?? definition.units[0]);
  return tidy((raw * (variable.scale ?? 1) + (variable.offset ?? 0)) * factor, variable);
}

/** A failed write, with the code of its message (messages.js WRITE_ERRORS). */
export class WriteError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

/**
 * The raw PLC value for a Gladys value (a number, or a text from an action).
 * @returns {number|boolean}
 */
export function toWrite(variable, input) {
  const { type } = variable.address;
  const typed = String(input).trim();
  // "1,000" is a thousand in English, 1 in French: refused rather than guessed.
  if (/^-?\d{1,3}(,\d{3})+$/.test(typed) || (typed.includes(',') && typed.includes('.'))) {
    throw new WriteError('ambiguous', { value: typed.slice(0, 30) });
  }
  const text = typed.replace(',', '.').toLowerCase();
  const words = { true: 1, false: 0, on: 1, off: 0 };
  const number = text in words ? words[text] : Number(text);
  if (text === '' || !Number.isFinite(number)) {
    throw new WriteError('notANumber', { value: String(input).slice(0, 30) });
  }
  const definition = KINDS[variable.kind];
  if (type === 'bool' || definition.boolean) {
    if (number !== 0 && number !== 1) {
      throw new WriteError('notBoolean', { value: String(input).slice(0, 30) });
    }
    return type === 'bool' ? number === 1 : number;
  }
  // The bounds the feature shows bound the writes too: the core never checks them.
  const min = variable.min ?? definition.min;
  const max = variable.max ?? definition.max;
  if (number < min || number > max) {
    throw new WriteError('outOfBounds', { min, max });
  }
  const { factor } = publishedUnit(variable.kind, variable.unit ?? definition.units[0]);
  const raw = (number / factor - (variable.offset ?? 0)) / (variable.scale ?? 1);
  if (TYPES[type].float) {
    if (type === 'real' && Math.abs(raw) > 3.4e38) {
      throw new WriteError('outOfRange', { type: 'REAL', min: '-3.4e38', max: '3.4e38' });
    }
    return raw;
  }
  // Float noise of the scale (21.5 / 0.1) is fine; a real fraction is refused.
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 1e-9 * Math.max(1, Math.abs(raw))) {
    throw new WriteError('notInteger', { type: type.toUpperCase(), value: String(input) });
  }
  const range = TYPES[type];
  if (rounded < range.min || rounded > range.max) {
    throw new WriteError('outOfRange', {
      type: type.toUpperCase(),
      min: range.min,
      max: range.max,
    });
  }
  return rounded;
}
