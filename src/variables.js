// -----------------------------------------------------------------------------
// The "Variables" field of the configuration: one entry per PLC variable,
// separated by semicolons (or new lines).
//
//   Name: ADDRESS [kind] [write] [unit=...] [scale=...] [offset=...]
//         [min=...] [max=...] [precision=...]
//
//   Boiler: DB1,REAL0 temperature; Pump: Q0.1 switch; Level: VW10 scale=0.1
//
// The address gives the data type (src/s7/address.js). Without "Name:", the
// variable is named after its address.
// -----------------------------------------------------------------------------

import { featureKey, parseAddress } from './s7/address.js';
import { KINDS, unitOfSymbol } from './kinds.js';

export const MAX_VARIABLES = 100;
const MAX_NAME = 40;
const NUMBER_OPTIONS = ['scale', 'offset', 'min', 'max', 'precision'];

/**
 * Parse the field.
 * @param {string} text
 * @returns {{ variables: Array<object>, errors: Array<{ entry: number, name?: string, code: string, params?: object }> }}
 */
export function parseVariables(text) {
  const variables = [];
  const errors = [];
  const seen = new Map();
  String(text ?? '')
    .split(/[;\n]/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk !== '')
    .forEach((raw, index) => {
      const entry = index + 1;
      let name = null;
      let rest = raw;
      const colon = raw.indexOf(':');
      if (colon !== -1) {
        name = raw.slice(0, colon).trim();
        rest = raw.slice(colon + 1);
      }
      const fail = (code, params = {}) => errors.push({ entry, name, code, params });
      if (name === '') {
        fail('noName');
        return;
      }
      const [addressText, ...options] = rest.trim().split(/\s+/).filter(Boolean);
      if (!addressText) {
        fail('noAddress');
        return;
      }
      const address = parseAddress(addressText);
      if (!address) {
        fail('badAddress', { address: addressText.slice(0, 30) });
        return;
      }
      if (seen.has(address.text)) {
        fail('duplicateAddress', { address: address.text, other: seen.get(address.text) });
        return;
      }

      const variable = {
        entry,
        name: name === null ? address.text : name.slice(0, MAX_NAME),
        address,
        key: featureKey(address),
        kind: null,
        write: false,
      };
      for (const option of options) {
        const lower = option.toLowerCase();
        if (KINDS[lower] && variable.kind === null) {
          variable.kind = lower;
          continue;
        }
        if (lower === 'write') {
          variable.write = true;
          continue;
        }
        const match = option.match(/^([a-z]+)=(.+)$/i);
        const key = match?.[1].toLowerCase();
        if (key === 'unit') {
          const unit = unitOfSymbol(match[2]);
          if (!unit) {
            fail('unknownUnit', { unit: match[2] });
            return;
          }
          variable.unit = unit;
        } else if (NUMBER_OPTIONS.includes(key)) {
          const value = match[2];
          const number = Number(value.replace(',', '.'));
          if (
            !Number.isFinite(number) ||
            (key === 'precision' && (!Number.isInteger(number) || number < 0 || number > 6)) ||
            (key === 'scale' && number === 0)
          ) {
            fail('badNumber', { option: key, value });
            return;
          }
          variable[key] = number;
        } else {
          fail('unknownWord', { word: option.slice(0, 30) });
          return;
        }
      }

      const bool = address.type === 'bool';
      variable.kind ??= bool ? (variable.write ? 'switch' : 'binary') : 'value';
      const kind = KINDS[variable.kind];
      if (bool && !kind.boolean) {
        fail('kindOfBit', { kind: variable.kind });
        return;
      }
      if (kind.writable) {
        variable.write = true;
      }
      if (variable.unit && !kind.units.includes(variable.unit)) {
        fail('unitOfKind', { unit: variable.unit, kind: variable.kind });
        return;
      }
      // One bound given, the other from the kind: they must still be in order.
      if ((variable.min ?? kind.min) >= (variable.max ?? kind.max)) {
        fail('minMax');
        return;
      }
      if (variables.length >= MAX_VARIABLES) {
        fail('tooMany', { max: MAX_VARIABLES });
        return;
      }
      // A name picks the variable a scene writes: two alike would be a guess.
      const twin = variables.find(
        (other) => other.name.toLowerCase() === variable.name.toLowerCase(),
      );
      if (twin) {
        fail('duplicateName', { other: twin.entry });
        return;
      }
      seen.set(address.text, entry);
      variables.push(variable);
    });
  return { variables, errors };
}
