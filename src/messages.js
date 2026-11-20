// -----------------------------------------------------------------------------
// Every text the container sends to Gladys, in the four languages of its
// interface: connection status, configuration mistakes, read and write
// failures. German says "du", Spanish "usted".
// -----------------------------------------------------------------------------

import { localize } from './i18n.js';
import { unitLabel } from './kinds.js';

/** Connection status of the Configuration screen, by error code. */
export const STATUS = {
  noHost: {
    en: 'Enter the IP address of the PLC.',
    fr: "Saisissez l'adresse IP de l'automate.",
    de: 'Gib die IP-Adresse der SPS ein.',
    es: 'Introduzca la dirección IP del PLC.',
  },
  badHost: {
    en: 'The PLC address must be an IP address or a host name, without port.',
    fr: "L'adresse de l'automate doit être une adresse IP ou un nom d'hôte, sans port.",
    de: 'Die SPS-Adresse muss eine IP-Adresse oder ein Hostname sein, ohne Port.',
    es: 'La dirección del PLC debe ser una dirección IP o un nombre de host, sin puerto.',
  },
  badPort: {
    en: 'The port must be a number from 1 to 65535 (102 for S7).',
    fr: 'Le port doit être un nombre de 1 à 65535 (102 pour S7).',
    de: 'Der Port muss eine Zahl von 1 bis 65535 sein (102 für S7).',
    es: 'El puerto debe ser un número de 1 a 65535 (102 para S7).',
  },
  badTsap: {
    en: 'A TSAP is written as in LOGO!Soft Comfort, e.g. 02.00.',
    fr: 'Un TSAP s’écrit comme dans LOGO!Soft Comfort, par exemple 02.00.',
    de: 'Ein TSAP wird wie in LOGO!Soft Comfort geschrieben, z. B. 02.00.',
    es: 'Un TSAP se escribe como en LOGO!Soft Comfort, por ejemplo 02.00.',
  },
  badRackSlot: {
    en: 'The rack goes from 0 to 7, the slot from 0 to 31.',
    fr: 'Le châssis (rack) va de 0 à 7, l’emplacement (slot) de 0 à 31.',
    de: 'Das Rack geht von 0 bis 7, der Steckplatz (Slot) von 0 bis 31.',
    es: 'El bastidor (rack) va de 0 a 7, la ranura (slot) de 0 a 31.',
  },
  unreachable: {
    en: 'The PLC does not answer on port 102: check its address and the network. Retrying.',
    fr: "L'automate ne répond pas sur le port 102 : vérifiez son adresse et le réseau. Nouvel essai en cours.",
    de: 'Die SPS antwortet nicht auf Port 102: Prüfe ihre Adresse und das Netzwerk. Neuer Versuch läuft.',
    es: 'El PLC no responde en el puerto 102: compruebe su dirección y la red. Reintentando.',
  },
  unknownHost: {
    en: 'Unknown host name: use the IP address of the PLC.',
    fr: "Nom d'hôte inconnu : utilisez l'adresse IP de l'automate.",
    de: 'Unbekannter Hostname: Verwende die IP-Adresse der SPS.',
    es: 'Nombre de host desconocido: utilice la dirección IP del PLC.',
  },
  refused: {
    en: 'The PLC refuses the connection: check the PLC type, the rack and slot (or the LOGO! TSAP). Retrying.',
    fr: "L'automate refuse la connexion : vérifiez le type d'automate, le rack et le slot (ou le TSAP du LOGO!). Nouvel essai en cours.",
    de: 'Die SPS lehnt die Verbindung ab: Prüfe SPS-Typ, Rack und Slot (oder den TSAP der LOGO!). Neuer Versuch läuft.',
    es: 'El PLC rechaza la conexión: compruebe el tipo de PLC, el rack y el slot (o el TSAP del LOGO!). Reintentando.',
  },
  putGet: {
    en: 'The CPU refuses the reads: in TIA Portal, allow PUT/GET access and turn off "optimized block access" on the DBs.',
    fr: "Le CPU refuse les lectures : dans TIA Portal, autorisez l'accès PUT/GET et décochez « Accès optimisé au bloc » sur les DB.",
    de: 'Die CPU lehnt das Lesen ab: Erlaube in TIA Portal den PUT/GET-Zugriff und schalte „Optimierter Bausteinzugriff“ der DBs aus.',
    es: 'La CPU rechaza las lecturas: en TIA Portal, permita el acceso PUT/GET y desactive el «acceso optimizado al bloque» de los DB.',
  },
  protocol: {
    en: 'The PLC answers something this integration does not understand. Retrying.',
    fr: "L'automate répond quelque chose que l'intégration ne comprend pas. Nouvel essai en cours.",
    de: 'Die SPS antwortet etwas, das die Integration nicht versteht. Neuer Versuch läuft.',
    es: 'El PLC responde algo que la integración no entiende. Reintentando.',
  },
  configErrors: {
    en: (count) =>
      `Connected, but ${count} variable(s) are ignored: run "Check the configuration".`,
    fr: (count) =>
      `Connecté, mais ${count} variable(s) ignorée(s) : lancez « Vérifier la configuration ».`,
    de: (count) => `Verbunden, aber ${count} Variable(n) ignoriert: Starte „Konfiguration prüfen“.`,
    es: (count) =>
      `Conectado, pero se ignoran ${count} variable(s): ejecute «Comprobar la configuración».`,
  },
  initFailed: {
    en: 'The integration could not start: see its logs.',
    fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
    de: 'Die Integration konnte nicht starten: Sieh dir ihre Protokolle an.',
    es: 'La integración no pudo iniciarse: consulte sus registros.',
  },
};

/** Mistakes in the "Variables" field (variables.js), and addresses the PLC refuses. */
export const VARIABLE_ERRORS = {
  noName: {
    en: 'empty name before ":"',
    fr: 'nom vide avant « : »',
    de: 'leerer Name vor „:“',
    es: 'nombre vacío antes de «:»',
  },
  noAddress: {
    en: 'no address after the name',
    fr: "pas d'adresse après le nom",
    de: 'keine Adresse nach dem Namen',
    es: 'falta la dirección después del nombre',
  },
  badAddress: {
    en: ({ address }) => `"${address}" is not an S7 address (e.g. DB1,REAL0, M0.1, MW10, VW10)`,
    fr: ({ address }) =>
      `« ${address} » n'est pas une adresse S7 (ex. DB1,REAL0, M0.1, MW10, VW10)`,
    de: ({ address }) => `„${address}“ ist keine S7-Adresse (z. B. DB1,REAL0, M0.1, MW10, VW10)`,
    es: ({ address }) => `«${address}» no es una dirección S7 (p. ej. DB1,REAL0, M0.1, MW10, VW10)`,
  },
  duplicateAddress: {
    en: ({ address, other }) => `${address} is already declared in entry ${other}`,
    fr: ({ address, other }) => `${address} est déjà déclarée à l'entrée ${other}`,
    de: ({ address, other }) => `${address} ist schon in Eintrag ${other} deklariert`,
    es: ({ address, other }) => `${address} ya está declarada en la entrada ${other}`,
  },
  duplicateName: {
    en: ({ other }) => `this name is already used by entry ${other}`,
    fr: ({ other }) => `ce nom est déjà pris par l'entrée ${other}`,
    de: ({ other }) => `dieser Name wird schon von Eintrag ${other} verwendet`,
    es: ({ other }) => `este nombre ya lo usa la entrada ${other}`,
  },
  unknownWord: {
    en: ({ word }) => `unknown word "${word}"`,
    fr: ({ word }) => `mot inconnu « ${word} »`,
    de: ({ word }) => `unbekanntes Wort „${word}“`,
    es: ({ word }) => `palabra desconocida «${word}»`,
  },
  unknownUnit: {
    en: ({ unit }) => `unknown unit "${unit}"`,
    fr: ({ unit }) => `unité inconnue « ${unit} »`,
    de: ({ unit }) => `unbekannte Einheit „${unit}“`,
    es: ({ unit }) => `unidad desconocida «${unit}»`,
  },
  badNumber: {
    en: ({ option, value }) => `${option}=${value} is not a valid number`,
    fr: ({ option, value }) => `${option}=${value} n'est pas un nombre valide`,
    de: ({ option, value }) => `${option}=${value} ist keine gültige Zahl`,
    es: ({ option, value }) => `${option}=${value} no es un número válido`,
  },
  unitOfKind: {
    en: ({ unit, kind }) => `the unit ${unitLabel(unit)} does not fit the kind ${kind}`,
    fr: ({ unit, kind }) => `l'unité ${unitLabel(unit)} ne convient pas à la nature ${kind}`,
    de: ({ unit, kind }) => `die Einheit ${unitLabel(unit)} passt nicht zur Art ${kind}`,
    es: ({ unit, kind }) => `la unidad ${unitLabel(unit)} no corresponde al tipo ${kind}`,
  },
  kindOfBit: {
    en: ({ kind }) => `a bit can only be binary or switch, not ${kind}`,
    fr: ({ kind }) => `un bit ne peut être que binary ou switch, pas ${kind}`,
    de: ({ kind }) => `ein Bit kann nur binary oder switch sein, nicht ${kind}`,
    es: ({ kind }) => `un bit solo puede ser binary o switch, no ${kind}`,
  },
  minMax: {
    en: 'min must be lower than max',
    fr: 'min doit être inférieur à max',
    de: 'min muss kleiner als max sein',
    es: 'min debe ser menor que max',
  },
  tooMany: {
    en: ({ max }) => `more than ${max} variables: ignored`,
    fr: ({ max }) => `plus de ${max} variables : ignorée`,
    de: ({ max }) => `mehr als ${max} Variablen: ignoriert`,
    es: ({ max }) => `más de ${max} variables: ignorada`,
  },
  // Return codes of the PLC for one variable.
  outOfRange: {
    en: 'address out of range: does the DB exist, is it long enough, without optimized access?',
    fr: 'adresse hors limites : le DB existe-t-il, est-il assez long, sans accès optimisé ?',
    de: 'Adresse außerhalb des Bereichs: Gibt es den DB, ist er lang genug, ohne optimierten Zugriff?',
    es: 'dirección fuera de rango: ¿existe el DB, es lo bastante largo, sin acceso optimizado?',
  },
  notFound: {
    en: 'this DB does not exist in the PLC',
    fr: "ce DB n'existe pas dans l'automate",
    de: 'diesen DB gibt es in der SPS nicht',
    es: 'este DB no existe en el PLC',
  },
  accessDenied: {
    en: 'the PLC denies access to this address',
    fr: "l'automate refuse l'accès à cette adresse",
    de: 'die SPS verweigert den Zugriff auf diese Adresse',
    es: 'el PLC deniega el acceso a esta dirección',
  },
  itemError: {
    en: ({ code }) => `the PLC refuses this address (code ${code})`,
    fr: ({ code }) => `l'automate refuse cette adresse (code ${code})`,
    de: ({ code }) => `die SPS lehnt diese Adresse ab (Code ${code})`,
    es: ({ code }) => `el PLC rechaza esta dirección (código ${code})`,
  },
};

/** The code of a PLC return code, for VARIABLE_ERRORS. */
export function itemCode(returnCode) {
  return { 3: 'accessDenied', 5: 'outOfRange', 10: 'notFound' }[returnCode] ?? 'itemError';
}

/** Why a write failed. */
export const WRITE_ERRORS = {
  writeDisabled: {
    en: 'Writing is off: turn on "Allow writing" in the configuration.',
    fr: "L'écriture est désactivée : activez « Autoriser l'écriture » dans la configuration.",
    de: 'Schreiben ist aus: Aktiviere „Schreiben erlauben“ in der Konfiguration.',
    es: 'La escritura está desactivada: active «Permitir la escritura» en la configuración.',
  },
  notDeclaredWritable: {
    en: ({ name }) => `${name} is not declared "write" in the variables.`,
    fr: ({ name }) => `${name} n'est pas déclarée « write » dans les variables.`,
    de: ({ name }) => `${name} ist in den Variablen nicht als „write“ deklariert.`,
    es: ({ name }) => `${name} no está declarada «write» en las variables.`,
  },
  unknownVariable: {
    en: ({ name }) => `No declared variable is called ${name}.`,
    fr: ({ name }) => `Aucune variable déclarée ne s'appelle ${name}.`,
    de: ({ name }) => `Keine deklarierte Variable heißt ${name}.`,
    es: ({ name }) => `Ninguna variable declarada se llama ${name}.`,
  },
  notConnected: {
    en: 'The PLC is not connected.',
    fr: "L'automate n'est pas connecté.",
    de: 'Die SPS ist nicht verbunden.',
    es: 'El PLC no está conectado.',
  },
  notANumber: {
    en: ({ value }) => `"${value}" is not a number.`,
    fr: ({ value }) => `« ${value} » n'est pas un nombre.`,
    de: ({ value }) => `„${value}“ ist keine Zahl.`,
    es: ({ value }) => `«${value}» no es un número.`,
  },
  ambiguous: {
    en: ({ value }) => `"${value}" is ambiguous: write 1000 or 1.5, without thousands separator.`,
    fr: ({ value }) =>
      `« ${value} » est ambigu : écrivez 1000 ou 1,5, sans séparateur de milliers.`,
    de: ({ value }) =>
      `„${value}“ ist mehrdeutig: Schreib 1000 oder 1,5, ohne Tausendertrennzeichen.`,
    es: ({ value }) => `«${value}» es ambiguo: escriba 1000 o 1,5, sin separador de miles.`,
  },
  unknownResult: {
    en: 'The PLC did not confirm the write: it may have been applied. Check the value.',
    fr: "L'automate n'a pas confirmé l'écriture : elle a pu être appliquée. Vérifiez la valeur.",
    de: 'Die SPS hat das Schreiben nicht bestätigt: Es wurde vielleicht ausgeführt. Prüfe den Wert.',
    es: 'El PLC no confirmó la escritura: puede que se haya aplicado. Compruebe el valor.',
  },
  notBoolean: {
    en: ({ value }) => `"${value}": expected 0 or 1 (or true / false).`,
    fr: ({ value }) => `« ${value} » : 0 ou 1 attendu (ou true / false).`,
    de: ({ value }) => `„${value}“: 0 oder 1 erwartet (oder true / false).`,
    es: ({ value }) => `«${value}»: se espera 0 o 1 (o true / false).`,
  },
  outOfRange: {
    en: ({ type, min, max }) => `Out of range for a ${type} (${min} to ${max}).`,
    fr: ({ type, min, max }) => `Hors limites pour un ${type} (${min} à ${max}).`,
    de: ({ type, min, max }) => `Außerhalb des Bereichs eines ${type} (${min} bis ${max}).`,
    es: ({ type, min, max }) => `Fuera de rango para un ${type} (${min} a ${max}).`,
  },
  outOfBounds: {
    en: ({ min, max }) => `Outside the bounds declared for this variable (${min} to ${max}).`,
    fr: ({ min, max }) => `Hors des bornes déclarées pour cette variable (${min} à ${max}).`,
    de: ({ min, max }) =>
      `Außerhalb der für diese Variable deklarierten Grenzen (${min} bis ${max}).`,
    es: ({ min, max }) => `Fuera de los límites declarados para esta variable (${min} a ${max}).`,
  },
  notInteger: {
    en: ({ type, value }) => `"${value}": a ${type} takes whole numbers only.`,
    fr: ({ type, value }) => `« ${value} » : un ${type} n'accepte que des nombres entiers.`,
    de: ({ type, value }) => `„${value}“: Ein ${type} nimmt nur ganze Zahlen an.`,
    es: ({ type, value }) => `«${value}»: un ${type} solo admite números enteros.`,
  },
  refused: {
    en: ({ reason }) => `The PLC refused the write: ${reason}.`,
    fr: ({ reason }) => `L'automate a refusé l'écriture : ${reason}.`,
    de: ({ reason }) => `Die SPS hat das Schreiben abgelehnt: ${reason}.`,
    es: ({ reason }) => `El PLC rechazó la escritura: ${reason}.`,
  },
  failed: {
    en: ({ detail }) => `The write failed: ${detail}`,
    fr: ({ detail }) => `L'écriture a échoué : ${detail}`,
    de: ({ detail }) => `Das Schreiben ist fehlgeschlagen: ${detail}`,
    es: ({ detail }) => `La escritura falló: ${detail}`,
  },
};

/** "Entry 3 (Boiler): ..." */
export const ENTRY_LABEL = {
  en: (entry, name) => `Entry ${entry}${name ? ` (${name})` : ''}`,
  fr: (entry, name) => `Entrée ${entry}${name ? ` (${name})` : ''}`,
  de: (entry, name) => `Eintrag ${entry}${name ? ` (${name})` : ''}`,
  es: (entry, name) => `Entrada ${entry}${name ? ` (${name})` : ''}`,
};

/** The multi-language text of a variable error. */
export function variableError({ entry, name, code, params = {} }) {
  const label = localize(ENTRY_LABEL, entry, name);
  const text = localize(VARIABLE_ERRORS[code], params);
  return Object.fromEntries(
    Object.keys(text).map((lang) => [lang, `${label[lang]}: ${text[lang]}`]),
  );
}

/** The multi-language text of a write error. */
export function writeError(code, params = {}) {
  if (code === 'refused') {
    const reason = localize(VARIABLE_ERRORS[itemCode(params.returnCode)], {
      code: params.returnCode,
    });
    return localize(
      Object.fromEntries(
        Object.entries(WRITE_ERRORS.refused).map(([lang, template]) => [
          lang,
          () => template({ reason: reason[lang] }),
        ]),
      ),
    );
  }
  return localize(WRITE_ERRORS[code] ?? WRITE_ERRORS.failed, params);
}
