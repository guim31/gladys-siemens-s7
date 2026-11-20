// -----------------------------------------------------------------------------
// The "PLC" dashboard widget: the first values of the PLC as live tiles, and
// the health of the link — connected or not, how many variables the PLC
// answers, the time of the last reading and how long it took. What a plain
// device box cannot say.
//
// Budget of the core: 8 components at most; here up to 6 tiles + 1 status.
// Each block can be hidden in the widget settings.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { pick } from './i18n.js';

export const WIDGET_KEY = 'plc_overview';
const MAX_TILES = 6;

export const TEXT = {
  pick: {
    en: 'Choose the PLC in the widget settings.',
    fr: "Choisissez l'automate dans les réglages du widget.",
    de: 'Wähle die SPS in den Einstellungen des Widgets.',
    es: 'Elija el PLC en los ajustes del widget.',
  },
  unknown: {
    en: 'This PLC is no longer in the integration configuration.',
    fr: "Cet automate n'est plus dans la configuration de l'intégration.",
    de: 'Diese SPS ist nicht mehr in der Konfiguration der Integration.',
    es: 'Este PLC ya no está en la configuración de la integración.',
  },
  link: { en: 'Link', fr: 'Liaison', de: 'Verbindung', es: 'Enlace' },
  connected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  disconnected: { en: 'Disconnected', fr: 'Déconnecté', de: 'Getrennt', es: 'Desconectado' },
  waiting: { en: 'Connecting', fr: 'Connexion', de: 'Verbindet', es: 'Conectando' },
  variables: {
    en: 'Readable variables',
    fr: 'Variables lisibles',
    de: 'Lesbare Variablen',
    es: 'Variables legibles',
  },
  lastRead: {
    en: 'Last reading',
    fr: 'Dernière lecture',
    de: 'Letztes Lesen',
    es: 'Última lectura',
  },
  readTime: {
    en: 'Reading time',
    fr: 'Durée de lecture',
    de: 'Lesedauer',
    es: 'Duración de lectura',
  },
  never: { en: 'Never', fr: 'Jamais', de: 'Nie', es: 'Nunca' },
};

/**
 * The content of the widget.
 * @param {import('./hub.js').S7Hub} hub
 * @param {{ settings?: object, language?: string }} request
 */
export function overviewContent(hub, { settings = {}, language = 'en' } = {}) {
  const lang = ['en', 'fr', 'de', 'es'].includes(language) ? language : 'en';
  if (!settings.device) {
    return { ttl_seconds: 300, components: [{ type: 'text', variant: 'body', text: TEXT.pick }] };
  }
  if (!hub.ids || settings.device !== hub.ids.device) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: TEXT.unknown }],
    };
  }
  const components = [];
  if (settings.hide_values !== true) {
    const created = (hub.gladys.devices ?? []).find(
      (device) => device.external_id === settings.device,
    );
    const known = new Set((created?.features ?? []).map((feature) => feature.external_id));
    components.push(
      ...hub
        .features()
        .map(({ feature }) => feature)
        .filter((feature) => known.size === 0 || known.has(feature.external_id))
        .slice(0, MAX_TILES)
        .map((feature) => ({ type: 'value', device_feature: feature.external_id })),
    );
  }
  if (settings.hide_status !== true) {
    const { connected, lastReadAt, readMs } = hub.status;
    const { good, total } = hub.counts();
    components.push({
      type: 'status',
      items: [
        {
          label: TEXT.link,
          value: pick(
            connected === true
              ? TEXT.connected
              : connected === false
                ? TEXT.disconnected
                : TEXT.waiting,
            lang,
          ),
          color:
            connected === true
              ? WIDGET_COLORS.SUCCESS
              : connected === false
                ? WIDGET_COLORS.DANGER
                : WIDGET_COLORS.NEUTRAL,
        },
        {
          label: TEXT.variables,
          value: `${good}/${total}`,
          color: total > 0 && good < total ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
        },
        {
          label: TEXT.lastRead,
          value: lastReadAt ? clock(lastReadAt, lang) : pick(TEXT.never, lang),
        },
        { label: TEXT.readTime, value: readMs === null ? '-' : `${readMs} ms` },
      ],
    });
  }
  return { ttl_seconds: 30, components };
}

/** "14:32:05" in the time zone of Gladys (the supervisor sets TZ). */
function clock(timestamp, lang) {
  return new Intl.DateTimeFormat(lang, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}
