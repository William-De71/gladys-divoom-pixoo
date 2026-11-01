// -----------------------------------------------------------------------------
// Local HTTP client of a Divoom Pixoo 64.
//
// The official API (http://doc.divoom-gz.com/web/#/12, "PIXOO64") is a single
// endpoint: `POST http://<address>:80/post` with a JSON body
// `{ "Command": "Channel/SetBrightness", ... }`. Answers are JSON, with
// `error_code: 0` on success (some commands answer `{}`). Recent firmware
// may expose the same API on `http://<address>:9000/divoom_api` instead
// (seen by the Home Assistant integration): the client tries port 80 first,
// then remembers the endpoint that answered.
//
// The Pixoo is a small device: it crashes when it gets several requests at
// once, so the requests to one address are queued, one at a time.
// -----------------------------------------------------------------------------

export const DEFAULT_TIMEOUT_MS = 5000;

/** An error the Pixoo answered (it is reachable, it refused the command). */
export class PixooError extends Error {
  constructor(command, code) {
    super(`${command}: error_code ${code}`);
    this.name = 'PixooError';
    this.code = code;
  }
}

// Channel/SetIndex and Channel/GetIndex `SelectIndex` values.
export const CHANNELS = ['faces', 'cloud', 'visualizer', 'custom'];

const endpointsOf = (host) => [`http://${host}:80/post`, `http://${host}:9000/divoom_api`];

/**
 * @description Create the client.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - fetch (tests: a fake network).
 * @param {number} [options.timeoutMs] - Timeout of one request.
 * @returns {object} The client.
 */
export function createPixooClient({
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const chosen = new Map(); // host -> endpoint that answered
  const queues = new Map(); // host -> promise of the last request

  const postOnce = async (url, payload) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    }
    const raw = await response.text();
    let body;
    try {
      body = raw.trim() === '' ? {} : JSON.parse(raw);
    } catch {
      throw new Error('the answer is not JSON');
    }
    return body && typeof body === 'object' ? body : {};
  };

  const send = async (host, payload) => {
    const known = chosen.get(host);
    const urls = known ? [known] : endpointsOf(host);
    let lastError;
    for (const url of urls) {
      try {
        const body = await postOnce(url, payload);
        chosen.set(host, url);
        if (body.error_code !== undefined && Number(body.error_code) !== 0) {
          throw new PixooError(payload.Command, body.error_code);
        }
        return body;
      } catch (error) {
        if (error instanceof PixooError) {
          throw error;
        }
        lastError = error;
      }
    }
    // The endpoint that answered before may have moved (firmware update).
    chosen.delete(host);
    throw lastError;
  };

  /** One request at a time per address. */
  const post = (host, payload) => {
    const previous = queues.get(host) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(() => send(host, payload));
    queues.set(host, current);
    current
      .finally(() => {
        if (queues.get(host) === current) {
          queues.delete(host);
        }
      })
      .catch(() => {});
    return current;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));

  return {
    post,

    /** Brightness, screen switch, current face… (Channel/GetAllConf). */
    getAllConf: (host) => post(host, { Command: 'Channel/GetAllConf' }),

    /** @returns {Promise<number>} Channel/GetIndex `SelectIndex`. */
    getChannel: async (host) => {
      const body = await post(host, { Command: 'Channel/GetIndex' });
      return Number(body.SelectIndex);
    },

    /** @returns {Promise<number>} Channel/GetClockInfo `ClockId`. */
    getClockId: async (host) => {
      const body = await post(host, { Command: 'Channel/GetClockInfo' });
      return Number(body.ClockId);
    },

    setBrightness: (host, value) =>
      post(host, { Command: 'Channel/SetBrightness', Brightness: clamp(value, 0, 100) }),

    setScreen: (host, on) => post(host, { Command: 'Channel/OnOffScreen', OnOff: on ? 1 : 0 }),

    setChannel: (host, index) =>
      post(host, { Command: 'Channel/SetIndex', SelectIndex: clamp(index, 0, 3) }),

    setClockFace: (host, clockId) =>
      post(host, { Command: 'Channel/SetClockSelectId', ClockId: clamp(clockId, 0, 1e9) }),

    setCustomPage: (host, index) =>
      post(host, { Command: 'Channel/SetCustomPageIndex', CustomPageIndex: clamp(index, 0, 2) }),

    setVisualizer: (host, position) =>
      post(host, { Command: 'Channel/SetEqPosition', EqPosition: clamp(position, 0, 100) }),

    setCloudChannel: (host, index) =>
      post(host, { Command: 'Channel/CloudIndex', Index: clamp(index, 0, 3) }),

    /** @returns {Promise<number>} Draw/GetHttpGifId `PicId`. */
    getGifId: async (host) => {
      const body = await post(host, { Command: 'Draw/GetHttpGifId' });
      return Number(body.PicId);
    },

    resetGifId: (host) => post(host, { Command: 'Draw/ResetHttpGifId' }),

    /** One 64 × 64 frame (Draw/SendHttpGif with PicNum 1). */
    sendFrame: (host, { id, data, width = 64 }) =>
      post(host, {
        Command: 'Draw/SendHttpGif',
        PicNum: 1,
        PicWidth: width,
        PicOffset: 0,
        PicID: id,
        PicSpeed: 1000,
        PicData: data,
      }),

    /** A text line over the frame sent last (Draw/SendHttpText). */
    sendText: (host, { id, x = 0, y, font, width = 64, speed, text, color, align = 2 }) =>
      post(host, {
        Command: 'Draw/SendHttpText',
        TextId: clamp(id, 0, 19),
        x: clamp(x, 0, 63),
        y: clamp(y, 0, 63),
        dir: 0,
        font: clamp(font, 0, 7),
        TextWidth: clamp(width, 16, 64),
        speed: clamp(speed, 0, 1000),
        TextString: String(text),
        color,
        align,
      }),

    clearText: (host) => post(host, { Command: 'Draw/ClearHttpText' }),

    /** The Pixoo downloads and plays a GIF (16, 32 or 64 pixels wide). */
    playGifUrl: (host, url) =>
      post(host, { Command: 'Device/PlayTFGif', FileType: 2, FileName: String(url) }),

    countdown: (host, { minutes, seconds, start }) =>
      post(host, {
        Command: 'Tools/SetTimer',
        Minute: clamp(minutes, 0, 99),
        Second: clamp(seconds, 0, 59),
        Status: start ? 1 : 0,
      }),

    stopwatch: (host, status) =>
      post(host, { Command: 'Tools/SetStopWatch', Status: clamp(status, 0, 2) }),

    scoreboard: (host, { blue, red }) =>
      post(host, {
        Command: 'Tools/SetScoreBoard',
        BlueScore: clamp(blue, 0, 999),
        RedScore: clamp(red, 0, 999),
      }),

    noiseMeter: (host, on) =>
      post(host, { Command: 'Tools/SetNoiseStatus', NoiseStatus: on ? 1 : 0 }),

    buzzer: (host, { activeMs, offMs, totalMs }) =>
      post(host, {
        Command: 'Device/PlayBuzzer',
        ActiveTimeInCycle: clamp(activeMs, 0, 10000),
        OffTimeInCycle: clamp(offMs, 0, 10000),
        PlayTotalTime: clamp(totalMs, 0, 10000),
      }),
  };
}
