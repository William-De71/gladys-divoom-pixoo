// -----------------------------------------------------------------------------
// Runtime texts, in the four languages of the Gladys UI.
//
// `t(key, vars)` returns a multi-language object `{ en, fr, de, es }`
// (configuration button, widget, connection status); `text(key, language,
// vars)` returns one string (feature names, scene action errors: Gladys does
// not send the language of the user with a scan, a command or a scene
// action, see `language` in config.js).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const MESSAGES = {
  // --- Feature names (`<device name> - <feature>`) ---------------------------
  screen: { en: 'Screen', fr: 'Écran', de: 'Bildschirm', es: 'Pantalla' },
  brightness: { en: 'Brightness', fr: 'Luminosité', de: 'Helligkeit', es: 'Brillo' },
  channel: { en: 'Channel', fr: 'Canal', de: 'Kanal', es: 'Canal' },
  message: { en: 'Message', fr: 'Message', de: 'Nachricht', es: 'Mensaje' },

  // --- Channels (options of the channel feature) -----------------------------
  channel_faces: { en: 'Clock faces', fr: 'Cadrans', de: 'Zifferblätter', es: 'Esferas' },
  channel_cloud: {
    en: 'Cloud gallery',
    fr: 'Galerie cloud',
    de: 'Cloud-Galerie',
    es: 'Galería en la nube',
  },
  channel_visualizer: {
    en: 'Visualizer',
    fr: 'Visualiseur',
    de: 'Visualizer',
    es: 'Visualizador',
  },
  channel_custom: {
    en: 'Custom',
    fr: 'Personnalisé',
    de: 'Benutzerdefiniert',
    es: 'Personalizado',
  },
  channel_unknown: { en: 'Other', fr: 'Autre', de: 'Andere', es: 'Otro' },

  // --- Text colors (widget form) ----------------------------------------------
  color_white: { en: 'White', fr: 'Blanc', de: 'Weiß', es: 'Blanco' },
  color_yellow: { en: 'Yellow', fr: 'Jaune', de: 'Gelb', es: 'Amarillo' },
  color_orange: { en: 'Orange', fr: 'Orange', de: 'Orange', es: 'Naranja' },
  color_red: { en: 'Red', fr: 'Rouge', de: 'Rot', es: 'Rojo' },
  color_green: { en: 'Green', fr: 'Vert', de: 'Grün', es: 'Verde' },
  color_cyan: { en: 'Cyan', fr: 'Cyan', de: 'Cyan', es: 'Cian' },
  color_blue: { en: 'Blue', fr: 'Bleu', de: 'Blau', es: 'Azul' },
  color_magenta: { en: 'Magenta', fr: 'Magenta', de: 'Magenta', es: 'Magenta' },

  // --- Connection status (Integrations page) ---------------------------------
  statusConnected: {
    en: '{count} of {total} Pixoo display(s) answering on the local network.',
    fr: '{count} écran(s) Pixoo sur {total} répondent sur le réseau local.',
    de: '{count} von {total} Pixoo-Display(s) antworten im lokalen Netzwerk.',
    es: '{count} de {total} pantalla(s) Pixoo responden en la red local.',
  },
  statusAllUnreachable: {
    en: '{count} Pixoo display(s) known, none answering right now (unplugged?).',
    fr: '{count} écran(s) Pixoo connu(s), aucun ne répond pour l’instant (débranché ?).',
    de: '{count} Pixoo-Display(s) bekannt, derzeit antwortet keines (ausgesteckt?).',
    es: '{count} pantalla(s) Pixoo conocida(s), ninguna responde ahora (¿desenchufada?).',
  },
  statusNone: {
    en: 'No Pixoo found yet. Plug it in, then use “Search and test the displays”.',
    fr: 'Aucun Pixoo trouvé pour l’instant. Branchez-le, puis utilisez « Rechercher et tester les écrans ».',
    de: 'Noch kein Pixoo gefunden. Schließe es an und nutze „Displays suchen und testen“.',
    es: 'Aún no se ha encontrado ningún Pixoo. Enchúfelo y use «Buscar y probar las pantallas».',
  },
  statusCloudFailed: {
    en: 'The Divoom search did not answer ({error}) and no Pixoo is known: type its address in the configuration.',
    fr: 'La recherche Divoom n’a pas répondu ({error}) et aucun Pixoo n’est connu : saisissez son adresse dans la configuration.',
    de: 'Die Divoom-Suche hat nicht geantwortet ({error}) und kein Pixoo ist bekannt: Gib seine Adresse in der Konfiguration ein.',
    es: 'La búsqueda de Divoom no respondió ({error}) y no se conoce ningún Pixoo: escriba su dirección en la configuración.',
  },

  // --- Configuration button ------------------------------------------------------
  testOk: {
    en: '{count} Pixoo display(s): {list}.',
    fr: '{count} écran(s) Pixoo : {list}.',
    de: '{count} Pixoo-Display(s): {list}.',
    es: '{count} pantalla(s) Pixoo: {list}.',
  },
  testNone: {
    en: 'No Pixoo answers. Check that it is plugged in and on the same network as Gladys, or type its IP address.',
    fr: 'Aucun Pixoo ne répond. Vérifiez qu’il est branché et sur le même réseau que Gladys, ou saisissez son adresse IP.',
    de: 'Kein Pixoo antwortet. Prüfe, ob es angeschlossen und im selben Netzwerk wie Gladys ist, oder gib seine IP-Adresse ein.',
    es: 'Ningún Pixoo responde. Compruebe que está enchufado y en la misma red que Gladys, o escriba su dirección IP.',
  },
  testCloudError: {
    en: 'The Divoom search failed: {error}.',
    fr: 'La recherche Divoom a échoué : {error}.',
    de: 'Die Divoom-Suche ist fehlgeschlagen: {error}.',
    es: 'La búsqueda de Divoom falló: {error}.',
  },
  testUnreachable: {
    en: 'not answering',
    fr: 'ne répond pas',
    de: 'antwortet nicht',
    es: 'no responde',
  },
  testTyped: {
    en: 'typed address',
    fr: 'adresse saisie',
    de: 'eingegebene Adresse',
    es: 'dirección escrita',
  },
  testBrightness: {
    en: 'brightness {value} %',
    fr: 'luminosité {value} %',
    de: 'Helligkeit {value} %',
    es: 'brillo {value} %',
  },

  // --- Errors (scene actions, dashboard, widget toasts) ----------------------------
  errorUnknownDevice: {
    en: 'This device is not a Pixoo of this integration (or it has not been found since the last start).',
    fr: 'Cet appareil n’est pas un Pixoo de cette intégration (ou il n’a pas été retrouvé depuis le dernier démarrage).',
    de: 'Dieses Gerät ist kein Pixoo dieser Integration (oder es wurde seit dem letzten Start nicht gefunden).',
    es: 'Este dispositivo no es un Pixoo de esta integración (o no se ha encontrado desde el último inicio).',
  },
  errorUnreachable: {
    en: '{name} does not answer: {error}',
    fr: '{name} ne répond pas : {error}',
    de: '{name} antwortet nicht: {error}',
    es: '{name} no responde: {error}',
  },
  errorRefused: {
    en: '{name} refused the command ({error}). Its firmware may be too old: update it in the Divoom app.',
    fr: '{name} a refusé la commande ({error}). Son micrologiciel est peut-être trop ancien : mettez-le à jour dans l’appli Divoom.',
    de: '{name} hat den Befehl abgelehnt ({error}). Die Firmware ist vielleicht zu alt: Aktualisiere sie in der Divoom-App.',
    es: '{name} rechazó la orden ({error}). Puede que su firmware sea demasiado antiguo: actualícelo en la app Divoom.',
  },
  errorEmptyText: {
    en: 'The text to show is empty.',
    fr: 'Le texte à afficher est vide.',
    de: 'Der anzuzeigende Text ist leer.',
    es: 'El texto que mostrar está vacío.',
  },
  errorGifUrl: {
    en: 'The GIF address must start with http:// or https://.',
    fr: 'L’adresse du GIF doit commencer par http:// ou https://.',
    de: 'Die GIF-Adresse muss mit http:// oder https:// beginnen.',
    es: 'La dirección del GIF debe empezar por http:// o https://.',
  },
  errorChannel: {
    en: 'Unknown channel: {channel}.',
    fr: 'Canal inconnu : {channel}.',
    de: 'Unbekannter Kanal: {channel}.',
    es: 'Canal desconocido: {channel}.',
  },
  errorUnknownFeature: {
    en: 'Unknown feature: {key}.',
    fr: 'Fonctionnalité inconnue : {key}.',
    de: 'Unbekannte Funktion: {key}.',
    es: 'Función desconocida: {key}.',
  },

  // --- Widget ---------------------------------------------------------------------
  widgetChooseDevice: {
    en: 'Choose a Pixoo in the widget settings.',
    fr: 'Choisissez un Pixoo dans les réglages du widget.',
    de: 'Wähle ein Pixoo in den Widget-Einstellungen.',
    es: 'Elija un Pixoo en los ajustes del widget.',
  },
  widgetState: { en: 'Screen', fr: 'Écran', de: 'Bildschirm', es: 'Pantalla' },
  widgetOn: { en: 'On', fr: 'Allumé', de: 'An', es: 'Encendida' },
  widgetOff: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagada' },
  widgetUnreachable: {
    en: 'Not answering',
    fr: 'Ne répond pas',
    de: 'Antwortet nicht',
    es: 'No responde',
  },
  widgetChannel: { en: 'Channel', fr: 'Canal', de: 'Kanal', es: 'Canal' },
  widgetClockFace: { en: 'Clock face', fr: 'Cadran', de: 'Zifferblatt', es: 'Esfera' },
  widgetAddress: { en: 'Address', fr: 'Adresse', de: 'Adresse', es: 'Dirección' },
  widgetBrightness: { en: 'Brightness', fr: 'Luminosité', de: 'Helligkeit', es: 'Brillo' },
  widgetOffline: {
    en: 'Is the Pixoo plugged in and on the Wi-Fi?',
    fr: 'Le Pixoo est-il branché et sur le Wi-Fi ?',
    de: 'Ist das Pixoo angesteckt und im WLAN?',
    es: '¿Está el Pixoo enchufado y en el wifi?',
  },
  widgetTurnOn: { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  widgetTurnOff: { en: 'Turn off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
  widgetShowText: {
    en: 'Show a text',
    fr: 'Afficher un texte',
    de: 'Text anzeigen',
    es: 'Mostrar un texto',
  },
  widgetTextField: { en: 'Text', fr: 'Texte', de: 'Text', es: 'Texto' },
  widgetColorField: { en: 'Color', fr: 'Couleur', de: 'Farbe', es: 'Color' },
  widgetDurationField: {
    en: 'Duration (s, 0 = stays)',
    fr: 'Durée (s, 0 = reste)',
    de: 'Dauer (s, 0 = bleibt)',
    es: 'Duración (s, 0 = se queda)',
  },
  widgetClock: { en: 'Clock', fr: 'Horloge', de: 'Uhr', es: 'Reloj' },
  widgetCountdown: { en: 'Countdown', fr: 'Minuteur', de: 'Countdown', es: 'Temporizador' },
  widgetMinutesField: { en: 'Minutes', fr: 'Minutes', de: 'Minuten', es: 'Minutos' },
  widgetSwitchedOn: {
    en: '{name}: screen on.',
    fr: '{name} : écran allumé.',
    de: '{name}: Bildschirm an.',
    es: '{name}: pantalla encendida.',
  },
  widgetSwitchedOff: {
    en: '{name}: screen off.',
    fr: '{name} : écran éteint.',
    de: '{name}: Bildschirm aus.',
    es: '{name}: pantalla apagada.',
  },
  widgetTextShown: {
    en: 'The text is on {name}.',
    fr: 'Le texte est affiché sur {name}.',
    de: 'Der Text wird auf {name} angezeigt.',
    es: 'El texto se muestra en {name}.',
  },
  widgetClockShown: {
    en: '{name} shows its clock face.',
    fr: '{name} affiche son cadran.',
    de: '{name} zeigt sein Zifferblatt.',
    es: '{name} muestra su esfera.',
  },
  widgetCountdownStarted: {
    en: 'Countdown of {minutes} min started on {name}.',
    fr: 'Minuteur de {minutes} min lancé sur {name}.',
    de: 'Countdown von {minutes} Min. auf {name} gestartet.',
    es: 'Temporizador de {minutes} min iniciado en {name}.',
  },
};

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name]),
  );
}

/**
 * @description A runtime text in the four languages.
 * @param {string} key - Message key.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function t(key, vars = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, text(key, language, vars)]));
}

/**
 * @description A runtime text in one language (English when unknown).
 * @param {string} key - Message key.
 * @param {string} language - Language code.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @returns {string} The text.
 */
export function text(key, language, vars = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message ${key}`);
  }
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const resolved = Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [name, pick(value, lang)]),
  );
  return fill(message[lang], resolved);
}

/**
 * @description The name of a feature in one language.
 * @param {string} key - Feature key.
 * @param {string} language - Language code.
 * @returns {string} The name.
 */
export function featureName(key, language) {
  return MESSAGES[key] ? text(key, language) : key;
}

/**
 * @description One language of a value that may be multi-language.
 * @param {*} value - A string, a number or `{ en, fr, ... }`.
 * @param {string} language - Language code.
 * @returns {*} The value in that language.
 */
export function pick(value, language) {
  if (value && typeof value === 'object') {
    return value[language] ?? value.en;
  }
  return value;
}

/**
 * @description Cut a text to a maximum length, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - Maximum length.
 * @returns {string} The text, at most `max` characters.
 */
export function truncate(value, max) {
  const string = String(value ?? '');
  return string.length <= max ? string : `${string.slice(0, max - 1).trimEnd()}…`;
}

/**
 * @description Cut every language of a multi-language text.
 * @param {object} message - `{ en, fr, ... }`.
 * @param {number} max - Maximum length.
 * @returns {object} The message.
 */
export function truncateAll(message, max) {
  return Object.fromEntries(
    Object.entries(message).map(([language, value]) => [language, truncate(value, max)]),
  );
}

export const MESSAGE_KEYS = Object.keys(MESSAGES);
export const MESSAGES_FOR_TESTS = MESSAGES;
