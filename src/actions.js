// -----------------------------------------------------------------------------
// The buttons of the Configuration screen and the scene action.
//
// - "Check the configuration" says whether the PLC answers and lists the
//   mistakes entry by entry.
// - "Read an address" reads any address once (S7 has no browsing: this is how
//   a user finds the right one before declaring it).
// - "Write a value" (button and scene action) writes to a declared variable.
//
// Gladys shows in green what a handler returns and in red what it throws:
// every failure throws an ActionFailure carrying the four languages.
// -----------------------------------------------------------------------------

import { byLanguage, formatNumber, joinLines, localize } from './i18n.js';
import { STATUS, VARIABLE_ERRORS, itemCode, writeError } from './messages.js';
import { parseAddress } from './s7/address.js';
import { WriteError } from './values.js';

export const ACTION_KEYS = {
  CHECK_CONFIG: 'check_config',
  READ_ADDRESS: 'read_address',
  WRITE_VALUE: 'write_value',
};
export const SCENE_ACTION_KEYS = { WRITE_VALUE: 'write_value' };

export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

export const ACTION_TEXT = {
  notConnected: {
    en: 'The PLC is not connected:',
    fr: "L'automate n'est pas connecté :",
    de: 'Die SPS ist nicht verbunden:',
    es: 'El PLC no está conectado:',
  },
  connected: {
    en: ({ count, total }) => `Connected: ${count} of ${total} variable(s) read.`,
    fr: ({ count, total }) => `Connecté : ${count} variable(s) lue(s) sur ${total}.`,
    de: ({ count, total }) => `Verbunden: ${count} von ${total} Variable(n) gelesen.`,
    es: ({ count, total }) => `Conectado: ${count} de ${total} variable(s) leída(s).`,
  },
  noVariable: {
    en: 'No variable declared yet: fill the Variables field (use "Read an address" to try one).',
    fr: 'Aucune variable déclarée : remplissez le champ Variables (« Lire une adresse » permet d’en essayer une).',
    de: 'Noch keine Variable deklariert: Fülle das Feld Variablen (mit „Adresse lesen“ kannst du eine testen).',
    es: 'Ninguna variable declarada: rellene el campo Variables («Leer una dirección» permite probar una).',
  },
  allGood: {
    en: 'No mistake in the variables.',
    fr: 'Aucune erreur dans les variables.',
    de: 'Kein Fehler in den Variablen.',
    es: 'Ningún error en las variables.',
  },
  mistakes: {
    en: 'Mistakes:',
    fr: 'Erreurs :',
    de: 'Fehler:',
    es: 'Errores:',
  },
  noAddress: {
    en: 'Give an address, e.g. DB1,REAL0, M0.1 or VW10.',
    fr: 'Indiquez une adresse, par exemple DB1,REAL0, M0.1 ou VW10.',
    de: 'Gib eine Adresse an, z. B. DB1,REAL0, M0.1 oder VW10.',
    es: 'Indique una dirección, por ejemplo DB1,REAL0, M0.1 o VW10.',
  },
  badAddress: {
    en: ({ address }) => `"${address}" is not an S7 address (e.g. DB1,REAL0, M0.1, MW10, VW10).`,
    fr: ({ address }) =>
      `« ${address} » n'est pas une adresse S7 (ex. DB1,REAL0, M0.1, MW10, VW10).`,
    de: ({ address }) => `„${address}“ ist keine S7-Adresse (z. B. DB1,REAL0, M0.1, MW10, VW10).`,
    es: ({ address }) =>
      `«${address}» no es una dirección S7 (p. ej. DB1,REAL0, M0.1, MW10, VW10).`,
  },
  read: {
    en: ({ address, value }) => `${address} = ${value}`,
    fr: ({ address, value }) => `${address} = ${value}`,
    de: ({ address, value }) => `${address} = ${value}`,
    es: ({ address, value }) => `${address} = ${value}`,
  },
  readFailed: {
    en: ({ address }) => `${address} cannot be read:`,
    fr: ({ address }) => `${address} ne peut pas être lue :`,
    de: ({ address }) => `${address} kann nicht gelesen werden:`,
    es: ({ address }) => `${address} no se puede leer:`,
  },
  written: {
    en: ({ name, value }) => `${name}: ${value} written.`,
    fr: ({ name, value }) => `${name} : ${value} écrit.`,
    de: ({ name, value }) => `${name}: ${value} geschrieben.`,
    es: ({ name, value }) => `${name}: ${value} escrito.`,
  },
  noVariableName: {
    en: 'Give the name or the address of a declared variable.',
    fr: "Indiquez le nom ou l'adresse d'une variable déclarée.",
    de: 'Gib den Namen oder die Adresse einer deklarierten Variable an.',
    es: 'Indique el nombre o la dirección de una variable declarada.',
  },
  noValue: {
    en: 'Give the value to write.',
    fr: 'Indiquez la valeur à écrire.',
    de: 'Gib den zu schreibenden Wert an.',
    es: 'Indique el valor que se va a escribir.',
  },
};

/** The status message of a PLC that is not connected, as an ActionFailure. */
function notConnected(hub, extra = []) {
  const reason = hub.statusMessage() ?? localize(STATUS.unreachable);
  return new ActionFailure(joinLines([ACTION_TEXT.notConnected, reason, ...extra]));
}

/** "Check the configuration". */
export async function checkConfig(hub) {
  if (!hub.target) {
    throw new ActionFailure(hub.statusMessage() ?? localize(STATUS.noHost));
  }
  const problems = hub.problems();
  const mistakes = problems.length > 0 ? [ACTION_TEXT.mistakes, ...problems] : [];
  if (hub.status.connected !== true) {
    throw notConnected(hub, mistakes);
  }
  if (hub.variables.length === 0 && problems.length === 0) {
    throw new ActionFailure(localize(ACTION_TEXT.noVariable));
  }
  const { good } = hub.counts();
  const header = localize(ACTION_TEXT.connected, {
    count: good,
    total: hub.variables.length + hub.configErrors.length,
  });
  if (problems.length > 0) {
    // Connected, but some entries are wrong: the user has something to fix.
    throw new ActionFailure(joinLines([header, ...mistakes]));
  }
  return joinLines([header, ACTION_TEXT.allGood]);
}

/** "Read an address". */
export async function readAddress(hub, fields = {}) {
  const text = String(fields.address ?? '').trim();
  if (text === '') {
    throw new ActionFailure(localize(ACTION_TEXT.noAddress));
  }
  const address = parseAddress(text);
  if (!address) {
    throw new ActionFailure(localize(ACTION_TEXT.badAddress, { address: text.slice(0, 30) }));
  }
  if (!hub.client || hub.status.connected !== true) {
    throw notConnected(hub);
  }
  let result;
  try {
    result = await hub.readAddress(address);
  } catch {
    throw notConnected(hub);
  }
  if (result.value === undefined) {
    const reason = localize(VARIABLE_ERRORS[itemCode(result.code)], { code: result.code });
    throw new ActionFailure(
      joinLines([localize(ACTION_TEXT.readFailed, { address: address.text }), reason]),
    );
  }
  return byLanguage((lang) =>
    ACTION_TEXT.read[lang]({
      address: address.text,
      value:
        typeof result.value === 'boolean'
          ? String(Number(result.value))
          : formatNumber(
              // A REAL holds 7 significant digits: 38.7 reads 38.700001.
              address.type === 'real' ? Number(result.value.toPrecision(7)) : result.value,
              lang,
              6,
            ),
    }),
  );
}

/** "Write a value", from the button or a scene. */
export async function writeValue(hub, fields = {}) {
  const target = String(fields.variable ?? '').trim();
  if (target === '') {
    throw new ActionFailure(localize(ACTION_TEXT.noVariableName));
  }
  const value =
    fields.value === undefined || fields.value === null ? '' : String(fields.value).trim();
  if (value === '') {
    throw new ActionFailure(localize(ACTION_TEXT.noValue));
  }
  const variable = hub.findVariable(target);
  if (!variable) {
    throw new ActionFailure(writeError('unknownVariable', { name: target.slice(0, 40) }));
  }
  try {
    const result = await hub.write(variable, value);
    return localize(ACTION_TEXT.written, { name: result.name, value: value.slice(0, 30) });
  } catch (err) {
    if (err instanceof WriteError) {
      throw new ActionFailure(writeError(err.code, err.params));
    }
    throw err;
  }
}
