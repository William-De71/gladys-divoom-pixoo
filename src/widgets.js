// -----------------------------------------------------------------------------
// Dashboard widget.
//
//   pixoo   one display (setting `device`): screen state, channel, current
//           clock face (its id is what the "Show a clock face" scene action
//           takes), brightness, and four buttons: screen on / off, "Show a
//           text" (a form: text, color, duration), the clock and a
//           countdown (a form: minutes)
//
// Pure: the build function turns a snapshot into a content, so the tests and
// docs/illustrations/gen.mjs use the exact code Gladys gets. Every text is
// multi-language: Gladys caches the content per language.
// -----------------------------------------------------------------------------

import { TEXT_COLORS } from './pixoo/frame.js';
import { t, truncate } from './i18n.js';

export const WIDGETS = { PIXOO: 'pixoo' };
export const WIDGET_ACTIONS = {
  SCREEN_ON: 'screen_on',
  SCREEN_OFF: 'screen_off',
  SHOW_TEXT: 'show_text',
  CLOCK: 'clock',
  COUNTDOWN: 'countdown',
};
export const TTL_SECONDS = 60;
// The widget form offers the most readable colors only.
export const FORM_COLORS = ['white', 'yellow', 'orange', 'red', 'green', 'cyan'];

/**
 * @typedef {object} PixooView
 * @property {string} deviceId - Gladys external id.
 * @property {string} name - Device name in Gladys.
 * @property {string} host - IP address.
 * @property {boolean} reachable - Answers on the local network.
 * @property {boolean} screenOn - Screen on.
 * @property {number|null} brightness - 0 to 100.
 * @property {string|null} channel - faces, cloud, visualizer, custom.
 * @property {number|null} clockId - Current clock face.
 */

/**
 * @description The `pixoo` widget.
 * @param {PixooView|null} view - The display, null when the setting points nowhere.
 * @returns {object} The widget content.
 */
export function buildPixooWidget(view) {
  if (!view) {
    return {
      version: 1,
      ttl_seconds: TTL_SECONDS,
      components: [{ type: 'text', text: t('widgetChooseDevice'), variant: 'caption' }],
    };
  }
  let state;
  if (!view.reachable) {
    state = { value: t('widgetUnreachable'), color: 'danger' };
  } else if (view.screenOn) {
    state = { value: t('widgetOn'), color: 'success' };
  } else {
    state = { value: t('widgetOff'), color: 'neutral' };
  }
  const items = [{ label: t('widgetState'), ...state }];
  if (view.reachable && view.channel) {
    items.push({ label: t('widgetChannel'), value: t(`channel_${view.channel}`), color: 'info' });
  }
  if (view.reachable && view.channel === 'faces' && Number.isFinite(view.clockId)) {
    items.push({ label: t('widgetClockFace'), value: `#${view.clockId}`, color: 'neutral' });
  }
  items.push({ label: t('widgetAddress'), value: view.host, color: 'neutral' });
  const components = [
    { type: 'text', text: truncate(view.name, 40), variant: 'heading' },
    { type: 'status', items },
  ];
  if (!view.reachable) {
    components.push({ type: 'text', text: t('widgetOffline'), variant: 'caption' });
    return { version: 1, ttl_seconds: TTL_SECONDS, components };
  }
  if (Number.isFinite(view.brightness)) {
    components.push({
      type: 'gauge',
      value: view.brightness,
      min: 0,
      max: 100,
      unit: '%',
      label: t('widgetBrightness'),
      color: view.screenOn ? 'primary' : 'neutral',
    });
  }
  const device = { device: view.deviceId };
  components.push({
    type: 'button',
    label: view.screenOn ? t('widgetTurnOff') : t('widgetTurnOn'),
    icon: 'power',
    style: view.screenOn ? 'secondary' : 'primary',
    action: {
      key: view.screenOn ? WIDGET_ACTIONS.SCREEN_OFF : WIDGET_ACTIONS.SCREEN_ON,
      params: device,
    },
  });
  components.push({
    type: 'button',
    label: t('widgetShowText'),
    icon: 'type',
    style: 'primary',
    action: {
      key: WIDGET_ACTIONS.SHOW_TEXT,
      params: device,
      fields: [
        { key: 'text', type: 'string', label: t('widgetTextField'), required: true },
        {
          key: 'color',
          type: 'select',
          label: t('widgetColorField'),
          required: true,
          default: 'white',
          options: FORM_COLORS.filter((name) => TEXT_COLORS[name]).map((name) => ({
            value: name,
            label: t(`color_${name}`),
          })),
        },
        {
          key: 'duration',
          type: 'number',
          label: t('widgetDurationField'),
          required: false,
          default: 0,
          min: 0,
          max: 3600,
        },
      ],
    },
  });
  components.push({
    type: 'button',
    label: t('widgetClock'),
    icon: 'clock',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.CLOCK, params: device },
  });
  components.push({
    type: 'button',
    label: t('widgetCountdown'),
    icon: 'watch',
    style: 'secondary',
    action: {
      key: WIDGET_ACTIONS.COUNTDOWN,
      params: device,
      fields: [
        {
          key: 'minutes',
          type: 'number',
          label: t('widgetMinutesField'),
          required: true,
          default: 5,
          min: 1,
          max: 99,
        },
      ],
    },
  });
  return { version: 1, ttl_seconds: TTL_SECONDS, components: components.slice(0, 8) };
}
