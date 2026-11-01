// -----------------------------------------------------------------------------
// The integration: every Gladys handler, registered before connect().
//
//   discovery   the official Divoom "Find device" service (optional) + the
//               addresses of the configuration, then Channel/GetAllConf on
//               every address: only what answers the local API is listed
//   states      each created display is asked every 10 to 60 s: screen,
//               brightness, channel, current clock face
//   commands    Gladys features, scene actions, widget buttons -> local
//               HTTP requests (src/pixoo/client.js)
//   messages    a plain frame then one or two text lines; with a duration,
//               the channel shown before comes back afterwards
//
// A display is identified by its MAC address (from the Divoom service), so
// a new address (DHCP) is followed. The displays seen are kept in /data so a
// restart asks them at once, without waiting for a search.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { buildDevice, deviceName, FEATURE_KEYS, featureValues } from './devices.js';
import { t, text, truncate, truncateAll } from './i18n.js';
import { CHANNELS, createPixooClient, PixooError } from './pixoo/client.js';
import { cloudDiscovery, normalizeMac, platformId } from './pixoo/discovery.js';
import {
  BACKGROUNDS,
  cleanLine,
  DEFAULT_FONT,
  lineTops,
  plainFrame,
  TEXT_COLORS,
} from './pixoo/frame.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS, STOPWATCH_STATUS } from './scenes.js';
import { createStatePublisher } from './states.js';
import { createStorage } from './storage.js';
import { buildPixooWidget, WIDGET_ACTIONS, WIDGETS } from './widgets.js';

export const ACTIONS = { TEST: 'test_connection' };

const MINUTE = 60 * 1000;
const FAILURES_BEFORE_UNREACHABLE = 2;
const RESCAN_SPACING_MS = 5 * MINUTE;
const RESCAN_EVERY_MS = 60 * MINUTE;
const WIDGET_REFRESH_SPACING_MS = 11 * 1000;
// Draw/SendHttpGif ids grow by one per frame; the firmware is known to stall
// when they get large (Home Assistant resets them past 32), so they restart.
const GIF_ID_LIMIT = 32;
const MAX_DURATION_S = 3600;
const MAX_MESSAGE = 1800;
export const SCROLL_SPEEDS = { slow: 100, normal: 60, fast: 30 };

/**
 * @description Wire the integration.
 * @param {object} gladys - SDK client (or the fake one of the tests).
 * @param {object} [deps] - Dependencies.
 * @param {object} [deps.client] - src/pixoo/client.js client (tests: fake displays).
 * @param {Function} [deps.discover] - `() => Promise<devices>`: the Divoom service (tests: a fake).
 * @param {object} [deps.storage] - src/storage.js storage.
 * @param {object} [deps.logger] - Logger.
 * @param {Function} [deps.now] - Clock (ms).
 * @returns {object} `{ start, stop, poll, scan, … }`.
 */
export function createApp(
  gladys,
  {
    client = createPixooClient(),
    discover = () => cloudDiscovery(globalThis.fetch),
    storage = createStorage(),
    logger = sdkLogger,
    now = Date.now,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  let pollTimer = null;
  let rescanTimer = null;
  let stopped = false;
  let polling = null;
  let scanning = null;
  let lastScanAt = 0;
  let cloudError = null;
  let statusKey = '';
  const entries = new Map(); // platform id -> entry
  const created = new Set(); // device external ids
  const transports = new Map();
  const widgetRefresh = new Map();

  const states = createStatePublisher(gladys, {
    logger,
    now,
    isCreated: (externalId) => created.has(externalId),
  });

  const safely = (task, what) =>
    Promise.resolve()
      .then(task)
      .catch((error) => logger.warn(`Pixoo: ${what} failed: ${error?.message ?? error}`));

  const errorText = (error) => truncate(error?.message ?? error, 120);

  // --- Widgets, transports, status ---------------------------------------------------

  const refreshWidget = (key) => {
    const slot = widgetRefresh.get(key) ?? { at: 0, timer: null };
    widgetRefresh.set(key, slot);
    const wait = slot.at + WIDGET_REFRESH_SPACING_MS - now();
    if (wait <= 0) {
      slot.at = now();
      safely(() => gladys.requestWidgetRefresh(key), 'widget refresh');
    } else if (!slot.timer) {
      slot.timer = setTimeout(() => {
        slot.timer = null;
        refreshWidget(key);
      }, wait);
      slot.timer.unref?.();
    }
  };
  const refreshWidgets = () => Object.values(WIDGETS).forEach(refreshWidget);

  const publishTransport = (entry, force = false) => {
    if (!created.has(entry.deviceId)) {
      return;
    }
    const transport = entry.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    if (!force && transports.get(entry.deviceId) === transport) {
      return;
    }
    transports.set(entry.deviceId, transport);
    safely(
      () => gladys.publishTransports([{ external_id: entry.deviceId, transport }]),
      'transport badge',
    );
  };

  const nameOf = (entry) => entry.gladysName || deviceName(entry);

  const publishStatus = () => {
    // The created displays once there are some, every display found before.
    const identified = [...entries.values()].filter((entry) => entry.identified);
    const mine = identified.filter((entry) => created.has(entry.deviceId));
    const known = mine.length > 0 ? mine : identified;
    const answering = known.filter((entry) => entry.reachable);
    let key;
    let connected;
    let message;
    if (known.length === 0 && cloudError) {
      key = `cloud:${cloudError}`;
      [connected, message] = [false, t('statusCloudFailed', { error: cloudError })];
    } else if (known.length === 0) {
      [key, connected, message] = ['none', false, t('statusNone')];
    } else if (answering.length === 0) {
      key = `off:${known.length}`;
      [connected, message] = [false, t('statusAllUnreachable', { count: known.length })];
    } else {
      key = `ok:${answering.length}:${known.length}`;
      connected = true;
      message = t('statusConnected', { count: answering.length, total: known.length });
    }
    if (key !== statusKey) {
      statusKey = key;
      safely(() => gladys.setConnectionStatus(connected, message), 'status');
    }
  };

  // --- Entries -------------------------------------------------------------------------

  const persist = () =>
    safely(
      () =>
        storage.write(
          'pixoos.json',
          Object.fromEntries(
            [...entries.values()]
              .filter((entry) => entry.identified)
              .map((entry) => [
                entry.id,
                {
                  host: entry.host,
                  mac: entry.mac,
                  divoomId: entry.divoomId,
                  divoomName: entry.divoomName,
                },
              ]),
          ),
        ),
      'saving the displays',
    );

  const pushStates = (entry) => {
    const ids = gladys.externalIds('device', entry.id);
    for (const [key, value] of featureValues(entry)) {
      states.push(ids.feature(key), value);
    }
  };

  const entryOf = ({ id, host, mac = '', divoomId = '' }) => {
    let entry = entries.get(id);
    if (!entry) {
      entry = {
        id,
        deviceId: gladys.externalIds('device', id).device,
        host,
        mac,
        divoomId,
        divoomName: '',
        typed: false,
        identified: false,
        reachable: null,
        failures: 0,
        screenOn: undefined,
        brightness: undefined,
        channel: undefined,
        clockId: undefined,
        message: undefined,
        gifId: null,
        restore: null,
        gladysName: '',
      };
      entries.set(id, entry);
    } else {
      if (host && entry.host !== host) {
        logger.info(`Pixoo: ${id} moved from ${entry.host} to ${host}`);
        entry.host = host;
        // A new address may be a firmware with another endpoint: ask again.
        entry.gifId = null;
      }
      entry.mac ||= mac;
      entry.divoomId ||= divoomId;
    }
    return entry;
  };

  const sceneEvent = (entry, key) => {
    if (!created.has(entry.deviceId)) {
      return;
    }
    safely(
      () =>
        gladys.publishSceneEvent(key, {
          device: entry.deviceId,
          name: truncate(nameOf(entry), 200),
          host: entry.host,
        }),
      `scene event ${key}`,
    );
  };

  const setReachable = (entry, reachable) => {
    if (entry.reachable === reachable) {
      return;
    }
    const before = entry.reachable;
    entry.reachable = reachable;
    if (before === true && reachable === false) {
      sceneEvent(entry, SCENE_TRIGGERS.UNREACHABLE);
    } else if (before === false && reachable === true) {
      sceneEvent(entry, SCENE_TRIGGERS.REACHABLE_AGAIN);
    }
    publishTransport(entry);
    publishStatus();
    refreshWidgets();
  };

  const markFailure = (entry, error) => {
    if (stopped) {
      return;
    }
    entry.failures += 1;
    logger.debug?.(`Pixoo: ${entry.host} failed (${entry.failures}): ${error?.message ?? error}`);
    if (entry.failures >= FAILURES_BEFORE_UNREACHABLE || entry.reachable === null) {
      setReachable(entry, false);
      requestRescan();
    }
  };

  const applyConf = (entry, conf) => {
    let changed = false;
    const set = (key, value) => {
      if (value !== undefined && entry[key] !== value) {
        entry[key] = value;
        changed = true;
      }
    };
    if (conf.LightSwitch !== undefined) {
      set('screenOn', Number(conf.LightSwitch) === 1);
    }
    if (Number.isFinite(Number(conf.Brightness)) && conf.Brightness !== null) {
      set('brightness', Math.min(100, Math.max(0, Math.round(Number(conf.Brightness)))));
    }
    if (Number.isFinite(Number(conf.CurClockId)) && conf.CurClockId !== null) {
      set('clockId', Number(conf.CurClockId));
    }
    return changed;
  };

  /** Ask a display its settings and its channel. */
  const readEntry = async (entry) => {
    let changed;
    try {
      changed = applyConf(entry, await client.getAllConf(entry.host));
      entry.failures = 0;
      setReachable(entry, true);
    } catch (error) {
      markFailure(entry, error);
      return false;
    }
    try {
      const index = await client.getChannel(entry.host);
      const channel = CHANNELS[index] ?? null;
      if (channel !== entry.channel) {
        entry.channel = channel;
        changed = true;
      }
    } catch (error) {
      logger.debug?.(`Pixoo: no channel from ${entry.host}: ${error?.message ?? error}`);
    }
    pushStates(entry);
    if (changed) {
      refreshWidgets();
    }
    return true;
  };

  // --- Discovery -------------------------------------------------------------------------

  const discovered = () =>
    [...entries.values()]
      .filter((entry) => entry.identified)
      .map((entry) => buildDevice(gladys, entry, config.language));

  const publishDiscovered = () =>
    safely(() => gladys.publishDiscoveredDevices(discovered()), 'discovery');

  const scanOnce = async () => {
    lastScanAt = now();
    const candidates = []; // { host, mac, divoomId, divoomName, typed }
    cloudError = null;
    if (config.cloudDiscovery) {
      try {
        for (const device of await discover()) {
          candidates.push({ ...device, divoomName: device.name, typed: false });
        }
      } catch (error) {
        cloudError = errorText(error);
        logger.warn(`Pixoo: the Divoom search failed: ${cloudError}`);
      }
    }
    for (const host of config.hosts) {
      if (!candidates.some((candidate) => candidate.host === host)) {
        // Known before by its MAC at this address: keep that identity.
        const known = [...entries.values()].find(
          (entry) => entry.host === host && !entry.id.startsWith('ip-'),
        );
        candidates.push({
          host,
          mac: known?.mac ?? '',
          divoomId: known?.divoomId ?? '',
          divoomName: known?.divoomName ?? '',
          typed: true,
        });
      }
    }
    const touched = [];
    await Promise.all(
      candidates.map(async (candidate) => {
        let id = platformId(candidate);
        if (!id.startsWith('ip-')) {
          // The same display was known by its address only: keep that identity
          // if the user created it, drop it otherwise, never both.
          const byAddress = entries.get(platformId({ host: candidate.host }));
          if (byAddress && created.has(byAddress.deviceId)) {
            id = byAddress.id;
          } else if (byAddress) {
            entries.delete(byAddress.id);
          }
        }
        const entry = entryOf({
          id,
          host: candidate.host,
          mac: normalizeMac(candidate.mac),
          divoomId: candidate.divoomId,
        });
        entry.divoomName = candidate.divoomName || entry.divoomName;
        entry.typed = candidate.typed;
        // Only what answers the local API is a Pixoo of this integration
        // (the Divoom service also lists Ditoo, Tivoo… speakers).
        if (await readEntry(entry)) {
          entry.identified = true;
          touched.push(entry);
        } else if (!entry.identified) {
          entries.delete(entry.id);
        }
      }),
    );
    persist();
    await publishDiscovered();
    publishStatus();
    return touched;
  };

  /** Run a search, or join the one running. */
  const scan = () => {
    if (!scanning) {
      scanning = scanOnce().finally(() => {
        scanning = null;
      });
    }
    return scanning;
  };

  function requestRescan() {
    if (stopped || scanning || now() - lastScanAt < RESCAN_SPACING_MS) {
      return;
    }
    safely(() => scan(), 'search');
  }

  // --- Polling ---------------------------------------------------------------------------

  const pollOnce = async () => {
    const targets = [...entries.values()].filter((entry) => created.has(entry.deviceId));
    await Promise.all(targets.map((entry) => readEntry(entry)));
    publishStatus();
  };

  const poll = () => {
    if (!polling) {
      polling = pollOnce().finally(() => {
        polling = null;
      });
    }
    return polling;
  };

  const schedule = () => {
    clearInterval(pollTimer);
    clearInterval(rescanTimer);
    pollTimer = null;
    rescanTimer = null;
    if (stopped) {
      return;
    }
    pollTimer = setInterval(() => safely(() => poll(), 'poll'), config.pollMs);
    pollTimer.unref?.();
    rescanTimer = setInterval(() => safely(() => scan(), 'search'), RESCAN_EVERY_MS);
    rescanTimer.unref?.();
  };

  // --- Commands ----------------------------------------------------------------------------

  const userError = (key, vars = {}) => new Error(text(key, config.language, vars));

  const entryFor = (externalId) => {
    const deviceId = String(externalId ?? '');
    const entry = [...entries.values()].find(
      (candidate) =>
        candidate.deviceId === deviceId || deviceId.startsWith(`${candidate.deviceId}:`),
    );
    if (!entry) {
      throw userError('errorUnknownDevice');
    }
    return entry;
  };

  /** Run requests on a display, mapping errors to user texts. */
  const command = async (entry, task) => {
    try {
      const result = await task();
      entry.failures = 0;
      setReachable(entry, true);
      return result;
    } catch (error) {
      if (error instanceof PixooError) {
        throw userError('errorRefused', { name: nameOf(entry), error: errorText(error) });
      }
      markFailure(entry, error);
      throw userError('errorUnreachable', { name: nameOf(entry), error: errorText(error) });
    }
  };

  const setScreen = async (entry, on) => {
    await command(entry, () => client.setScreen(entry.host, on));
    entry.screenOn = on;
    pushStates(entry);
    refreshWidgets();
  };

  const setBrightness = async (entry, value) => {
    const brightness = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
    await command(entry, () => client.setBrightness(entry.host, brightness));
    entry.brightness = brightness;
    pushStates(entry);
    refreshWidgets();
  };

  const forgetRestore = (entry) => {
    if (entry.restore) {
      clearTimeout(entry.restore.timer);
      entry.restore = null;
    }
  };

  const setChannel = async (entry, channel) => {
    const index = CHANNELS.indexOf(channel);
    if (index < 0) {
      throw userError('errorChannel', { channel: truncate(channel, 30) });
    }
    forgetRestore(entry);
    await command(entry, () => client.setChannel(entry.host, index));
    entry.channel = channel;
    pushStates(entry);
    refreshWidgets();
  };

  const showClockFace = async (entry, clockId) => {
    forgetRestore(entry);
    await command(entry, async () => {
      if (Number.isFinite(clockId)) {
        await client.setClockFace(entry.host, clockId);
      } else {
        await client.setChannel(entry.host, CHANNELS.indexOf('faces'));
      }
    });
    entry.channel = 'faces';
    if (Number.isFinite(clockId)) {
      entry.clockId = clockId;
    }
    pushStates(entry);
    refreshWidgets();
  };

  /** The next Draw/SendHttpGif id, restarting from 1 past the limit. */
  const nextGifId = async (entry) => {
    if (!Number.isFinite(entry.gifId)) {
      entry.gifId = await client.getGifId(entry.host).catch(() => GIF_ID_LIMIT);
    }
    let id = entry.gifId + 1;
    if (!Number.isFinite(id) || id >= GIF_ID_LIMIT) {
      await client.resetGifId(entry.host);
      id = 1;
    }
    entry.gifId = id;
    return id;
  };

  /** Put back what was shown before a message with a duration. */
  const restoreView = async (entry, saved) => {
    if (entry.restore !== saved || stopped) {
      return;
    }
    entry.restore = null;
    try {
      if (saved.channel === 'faces' && Number.isFinite(saved.clockId)) {
        await client.setClockFace(entry.host, saved.clockId);
      } else {
        await client.setChannel(
          entry.host,
          Math.max(0, CHANNELS.indexOf(saved.channel ?? 'faces')),
        );
      }
      entry.channel = saved.channel ?? 'faces';
      pushStates(entry);
      refreshWidgets();
    } catch (error) {
      logger.warn(`Pixoo: putting back the screen of ${entry.host} failed: ${errorText(error)}`);
    }
  };

  /**
   * @description Show one or two text lines over a plain background.
   * @param {object} entry - The display.
   * @param {object} message - `{ lines, color, background, duration, speed }`.
   */
  const showMessage = async (entry, { lines, color, background, duration, speed }) => {
    const cleaned = lines.map(cleanLine).filter(Boolean).slice(0, 2);
    if (cleaned.length === 0) {
      throw userError('errorEmptyText');
    }
    const seconds = Math.min(MAX_DURATION_S, Math.max(0, Math.round(Number(duration) || 0)));
    const hex = TEXT_COLORS[color] ?? TEXT_COLORS.white;
    const backdrop = BACKGROUNDS[background] ? background : 'black';
    const step = SCROLL_SPEEDS[speed] ?? SCROLL_SPEEDS.normal;
    // Keep the view of before the FIRST message of a series.
    const before = entry.restore
      ? { channel: entry.restore.channel, clockId: entry.restore.clockId }
      : { channel: entry.channel, clockId: entry.clockId };
    forgetRestore(entry);
    await command(entry, async () => {
      const id = await nextGifId(entry);
      await client.sendFrame(entry.host, { id, data: plainFrame(backdrop) });
      const tops = lineTops(cleaned.length);
      for (const [index, line] of cleaned.entries()) {
        await client.sendText(entry.host, {
          id: index + 1,
          y: tops[index],
          font: DEFAULT_FONT,
          speed: step,
          text: line,
          color: hex,
        });
      }
    });
    entry.message = truncate(cleaned.join(' / '), 500);
    pushStates(entry);
    if (seconds > 0) {
      const saved = { ...before, timer: null };
      saved.timer = setTimeout(
        () => safely(() => restoreView(entry, saved), 'restore'),
        seconds * 1000,
      );
      saved.timer.unref?.();
      entry.restore = saved;
    }
    refreshWidgets();
  };

  gladys.onSetValue(async (device, feature, value) => {
    const entry = entryFor(device.external_id);
    const key = String(feature.external_id).split(':').pop();
    if (key === FEATURE_KEYS.SCREEN) {
      await setScreen(entry, Number(value) === 1);
    } else if (key === FEATURE_KEYS.BRIGHTNESS) {
      await setBrightness(entry, value);
    } else if (key === FEATURE_KEYS.CHANNEL) {
      await setChannel(entry, String(value));
    } else if (key === FEATURE_KEYS.MESSAGE) {
      await showMessage(entry, { lines: [value], color: 'white', background: 'black' });
    } else {
      throw userError('errorUnknownFeature', { key });
    }
  });

  // --- Device events ---------------------------------------------------------------------------

  const trackCreated = (device) => {
    if (!device?.external_id) {
      return null;
    }
    created.add(device.external_id);
    const id = String(device.external_id).split(':').pop();
    const param = (name) => device.params?.find?.((item) => item.name === name)?.value;
    const host = entries.get(id)?.host ?? param('PIXOO_HOST');
    if (!host) {
      return null;
    }
    const entry = entryOf({
      id,
      host,
      mac: normalizeMac(param('PIXOO_MAC')),
      divoomId: String(param('PIXOO_DIVOOM_ID') ?? ''),
    });
    entry.identified = true;
    entry.gladysName = device.name ?? entry.gladysName;
    return entry;
  };

  gladys.onDeviceCreated(async (device) => {
    const entry = trackCreated(device);
    if (entry) {
      // States published before the creation were thrown away by Gladys.
      states.republish(entry.deviceId);
      await readEntry(entry);
      pushStates(entry);
      publishTransport(entry, true);
      publishStatus();
    }
    refreshWidgets();
  });

  gladys.onDeviceUpdated(async (device) => {
    const entry = trackCreated(device);
    if (entry) {
      states.republish(entry.deviceId);
    }
    refreshWidgets();
  });

  gladys.onDeviceDeleted(async (device) => {
    if (device?.external_id) {
      created.delete(device.external_id);
      transports.delete(device.external_id);
      states.forget(device.external_id);
    }
    publishStatus();
    refreshWidgets();
  });

  gladys.onScanRequest(async () => {
    await scan();
  });

  gladys.onConfigUpdated(async (raw) => {
    const previous = config;
    config = normalizeConfig(raw ?? {});
    if (previous.pollMs !== config.pollMs) {
      schedule();
    }
    if (
      previous.hosts.join(',') !== config.hosts.join(',') ||
      previous.cloudDiscovery !== config.cloudDiscovery
    ) {
      await scan();
    } else if (previous.language !== config.language) {
      await publishDiscovered();
    }
  });

  // --- Configuration button ------------------------------------------------------------------------

  gladys.onAction(ACTIONS.TEST, async () => {
    await scan();
    const known = [...entries.values()].filter((entry) => entry.identified);
    const cloud = cloudError ? t('testCloudError', { error: cloudError }) : null;
    if (known.length === 0) {
      const none = t('testNone');
      return cloud
        ? truncateAll(
            Object.fromEntries(
              Object.keys(none).map((lang) => [lang, `${cloud[lang]} ${none[lang]}`]),
            ),
            MAX_MESSAGE,
          )
        : none;
    }
    const message = {};
    for (const language of ['en', 'fr', 'de', 'es']) {
      const list = known
        .map((entry) => {
          const details = [entry.host];
          if (entry.typed) {
            details.push(text('testTyped', language));
          }
          if (!entry.reachable) {
            details.push(text('testUnreachable', language));
          } else if (Number.isFinite(entry.brightness)) {
            details.push(text('testBrightness', language, { value: entry.brightness }));
          }
          return `${nameOf(entry)} (${details.join(', ')})`;
        })
        .join(' ; ');
      message[language] = text('testOk', language, { count: known.length, list });
      if (cloud) {
        message[language] = `${message[language]} ${cloud[language]}`;
      }
    }
    return truncateAll(message, MAX_MESSAGE);
  });

  // --- Scene actions -----------------------------------------------------------------------------------

  const number = (value, fallback) => {
    const parsed = Number(value);
    return value === undefined || value === null || value === '' || !Number.isFinite(parsed)
      ? fallback
      : parsed;
  };

  gladys.onSceneAction(SCENE_ACTIONS.SHOW_MESSAGE, async (fields = {}) => {
    await showMessage(entryFor(fields.device), {
      lines: [fields.text, fields.second_line],
      color: fields.color,
      background: fields.background,
      duration: number(fields.duration, 0),
      speed: fields.speed,
    });
  });

  gladys.onSceneAction(SCENE_ACTIONS.PLAY_GIF, async (fields = {}) => {
    const entry = entryFor(fields.device);
    const url = String(fields.url ?? '').trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 500) {
      throw userError('errorGifUrl');
    }
    forgetRestore(entry);
    await command(entry, () => client.playGifUrl(entry.host, url));
    refreshWidgets();
  });

  gladys.onSceneAction(SCENE_ACTIONS.SHOW_CLOCK_FACE, async (fields = {}) => {
    const clockId = number(fields.clock_id, NaN);
    await showClockFace(
      entryFor(fields.device),
      Number.isFinite(clockId) ? Math.round(clockId) : NaN,
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.COUNTDOWN, async (fields = {}) => {
    const entry = entryFor(fields.device);
    forgetRestore(entry);
    await command(entry, () =>
      client.countdown(entry.host, {
        minutes: number(fields.minutes, 5),
        seconds: number(fields.seconds, 0),
        start: fields.action !== 'stop',
      }),
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.STOPWATCH, async (fields = {}) => {
    const entry = entryFor(fields.device);
    const status = STOPWATCH_STATUS[fields.action] ?? STOPWATCH_STATUS.start;
    forgetRestore(entry);
    await command(entry, () => client.stopwatch(entry.host, status));
  });

  gladys.onSceneAction(SCENE_ACTIONS.SCOREBOARD, async (fields = {}) => {
    const entry = entryFor(fields.device);
    forgetRestore(entry);
    await command(entry, () =>
      client.scoreboard(entry.host, { blue: number(fields.blue, 0), red: number(fields.red, 0) }),
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.NOISE_METER, async (fields = {}) => {
    const entry = entryFor(fields.device);
    forgetRestore(entry);
    await command(entry, () => client.noiseMeter(entry.host, fields.action !== 'stop'));
  });

  gladys.onSceneAction(SCENE_ACTIONS.PLAY_BUZZER, async (fields = {}) => {
    const entry = entryFor(fields.device);
    const total = Math.min(10000, Math.max(100, Math.round(number(fields.duration_ms, 1500))));
    await command(entry, () =>
      client.buzzer(entry.host, { activeMs: 500, offMs: 500, totalMs: total }),
    );
  });

  // --- Widget --------------------------------------------------------------------------------------

  const createdEntries = () => [...entries.values()].filter((entry) => created.has(entry.deviceId));

  const viewOf = (entry) => ({
    deviceId: entry.deviceId,
    name: nameOf(entry),
    host: entry.host,
    reachable: Boolean(entry.reachable),
    screenOn: entry.screenOn === true,
    brightness: Number.isFinite(entry.brightness) ? entry.brightness : null,
    channel: CHANNELS.includes(entry.channel) ? entry.channel : null,
    clockId: Number.isFinite(entry.clockId) ? entry.clockId : null,
  });

  gladys.onWidgetGet(WIDGETS.PIXOO, async ({ settings } = {}) => {
    const entry = createdEntries().find((candidate) => candidate.deviceId === settings?.device);
    return buildPixooWidget(entry ? viewOf(entry) : null);
  });

  const toast = (error) =>
    truncateAll(
      { en: error.message, fr: error.message, de: error.message, es: error.message },
      200,
    );

  gladys.onWidgetAction(
    WIDGETS.PIXOO,
    async (actionKey, params = {}, { settings, values } = {}) => {
      let entry;
      try {
        entry = entryFor(settings?.device ?? params.device);
      } catch (error) {
        return toast(error);
      }
      const name = truncate(nameOf(entry), 60);
      try {
        let done;
        if (actionKey === WIDGET_ACTIONS.SCREEN_ON) {
          await setScreen(entry, true);
          done = t('widgetSwitchedOn', { name });
        } else if (actionKey === WIDGET_ACTIONS.SCREEN_OFF) {
          await setScreen(entry, false);
          done = t('widgetSwitchedOff', { name });
        } else if (actionKey === WIDGET_ACTIONS.SHOW_TEXT) {
          await showMessage(entry, {
            lines: [values?.text],
            color: values?.color,
            background: 'black',
            duration: number(values?.duration, 0),
          });
          done = t('widgetTextShown', { name });
        } else if (actionKey === WIDGET_ACTIONS.CLOCK) {
          await showClockFace(entry, NaN);
          done = t('widgetClockShown', { name });
        } else if (actionKey === WIDGET_ACTIONS.COUNTDOWN) {
          const minutes = Math.min(99, Math.max(1, Math.round(number(values?.minutes, 5))));
          forgetRestore(entry);
          await command(entry, () =>
            client.countdown(entry.host, { minutes, seconds: 0, start: true }),
          );
          done = t('widgetCountdownStarted', { name, minutes });
        } else {
          return undefined;
        }
        refreshWidgets();
        return truncateAll(done, 200);
      } catch (error) {
        return toast(error);
      }
    },
  );

  // --- Lifecycle -------------------------------------------------------------------------------------

  return {
    /** Restore the known displays, ask them, then search. */
    async start() {
      stopped = false;
      config = normalizeConfig(gladys.config ?? {});
      created.clear();
      const saved = (await storage.read('pixoos.json')) ?? {};
      for (const [id, info] of Object.entries(saved)) {
        if (typeof info?.host === 'string') {
          const entry = entryOf({
            id,
            host: info.host,
            mac: normalizeMac(info.mac),
            divoomId: String(info.divoomId ?? ''),
          });
          entry.divoomName = String(info.divoomName ?? '');
          entry.identified = true;
        }
      }
      (gladys.devices ?? []).forEach((device) => trackCreated(device));
      await poll();
      schedule();
      await scan();
    },

    async stop() {
      stopped = true;
      clearInterval(pollTimer);
      clearInterval(rescanTimer);
      widgetRefresh.forEach((slot) => clearTimeout(slot.timer));
      entries.forEach((entry) => forgetRestore(entry));
      states.stop();
      await Promise.allSettled([polling, scanning]);
    },

    poll,
    scan,
    flushStates: () => states.flush(),
    entries,
  };
}
