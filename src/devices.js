// -----------------------------------------------------------------------------
// Gladys side of a Pixoo: the device published in the Discover tab and the
// values of its features.
//
//   screen      light/binary: the screen on or off (Channel/OnOffScreen)
//   brightness  light/brightness: 0 to 100 (Channel/SetBrightness)
//   channel     text/select: Faces, Cloud, Visualizer or Custom
//               (Channel/SetIndex), read back with Channel/GetIndex
//   message     text/text: a text typed on the dashboard is shown on the
//               screen (white on black, scrolling when too long)
//
// The light category is the one of the Home Assistant integration (a light
// entity): the dashboard shows an on/off switch with a brightness slider,
// and "turn off the lights" scenes switch the screen off too.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
} from '@gladysassistant/integration-sdk';
import { CHANNELS } from './pixoo/client.js';
import { featureName, text } from './i18n.js';

export const FEATURE_KEYS = {
  SCREEN: 'screen',
  BRIGHTNESS: 'brightness',
  CHANNEL: 'channel',
  MESSAGE: 'message',
};

/**
 * @description Default name of a display: the name set in the Divoom app,
 * else the end of its identity (the dashboard shows the device name when a
 * feature is alone of its type).
 * @param {object} entry - `{ divoomName, id }`.
 * @returns {string} `Pixoo Bureau` or `Pixoo 46B1`.
 */
export function deviceName(entry) {
  const name = String(entry.divoomName ?? '').trim();
  if (name) {
    return /pixoo|divoom/i.test(name) ? name : `Pixoo ${name}`;
  }
  if (entry.id.startsWith('ip-')) {
    return `Pixoo ${entry.id.slice(3).replace(/-/g, '.')}`;
  }
  return `Pixoo ${entry.id.slice(-4).toUpperCase()}`;
}

/**
 * @description The channel options, in the order of the Pixoo.
 * @param {string} language - Label language.
 * @returns {Array<{ value: string, label: string, sort_order: number }>} The options.
 */
export function channelOptions(language) {
  return CHANNELS.map((value, order) => ({
    value,
    label: text(`channel_${value}`, language),
    sort_order: order,
  }));
}

const featureOf = (key, language) => {
  switch (key) {
    case FEATURE_KEYS.SCREEN:
      return {
        category: CATEGORIES.LIGHT,
        type: TYPES.LIGHT.BINARY,
        min: 0,
        max: 1,
        has_feedback: true,
        keep_history: true,
      };
    case FEATURE_KEYS.BRIGHTNESS:
      return {
        category: CATEGORIES.LIGHT,
        type: TYPES.LIGHT.BRIGHTNESS,
        min: 0,
        max: 100,
        has_feedback: true,
        keep_history: false,
      };
    case FEATURE_KEYS.CHANNEL:
      return {
        category: CATEGORIES.TEXT,
        type: TYPES.TEXT.SELECT,
        min: 0,
        max: 0,
        has_feedback: true,
        keep_history: false,
        supported_options: channelOptions(language),
      };
    default:
      return {
        category: CATEGORIES.TEXT,
        type: TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        // The Pixoo cannot tell what it shows: the value is the last text sent.
        has_feedback: false,
        keep_history: false,
      };
  }
};

/**
 * @description The device of the Discover tab.
 * @param {object} gladys - SDK client (externalIds).
 * @param {object} entry - Display entry (app.js).
 * @param {string} language - Language of the feature names.
 * @returns {object} The Gladys device.
 */
export function buildDevice(gladys, entry, language) {
  const ids = gladys.externalIds('device', entry.id);
  const name = deviceName(entry);
  return {
    name,
    external_id: ids.device,
    // The integration asks the displays itself, on its own timer.
    should_poll: false,
    features: Object.values(FEATURE_KEYS).map((key) => ({
      name: `${name} - ${featureName(key, language)}`,
      external_id: ids.feature(key),
      ...featureOf(key, language),
      read_only: false,
    })),
    params: [
      { name: 'PIXOO_HOST', value: entry.host },
      { name: 'PIXOO_MAC', value: entry.mac || '' },
      { name: 'PIXOO_DIVOOM_ID', value: entry.divoomId || '' },
    ],
  };
}

/**
 * @description The values of the features.
 * @param {object} entry - `{ screenOn, brightness, channel, message }`.
 * @returns {Array<[string, number|{text: string}]>} `[featureKey, value]`.
 */
export function featureValues(entry) {
  const values = [];
  if (typeof entry.screenOn === 'boolean') {
    values.push([FEATURE_KEYS.SCREEN, entry.screenOn ? 1 : 0]);
  }
  if (Number.isFinite(entry.brightness)) {
    values.push([FEATURE_KEYS.BRIGHTNESS, entry.brightness]);
  }
  if (CHANNELS.includes(entry.channel)) {
    values.push([FEATURE_KEYS.CHANNEL, { text: entry.channel }]);
  }
  if (typeof entry.message === 'string' && entry.message !== '') {
    values.push([FEATURE_KEYS.MESSAGE, { text: entry.message }]);
  }
  return values;
}
