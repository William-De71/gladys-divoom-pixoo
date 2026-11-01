// Test helpers: fake Pixoo displays behind a fake `fetch` (no socket is ever
// opened), a fake Divoom "Find device" service, a silent logger.
//
// A FakePixoo keeps the settings Channel/GetAllConf reports and records every
// command it receives, answering like the official documentation
// (http://doc.divoom-gz.com/web/#/12): `{ error_code: 0, ... }`, `{}` for
// some commands. Nothing starts on import (`node --test` runs this folder).

export class FakePixoo {
  /**
   * @param {object} options - Options.
   * @param {string} options.host - IP address.
   * @param {string} [options.mac] - MAC address (as the Divoom service writes it).
   * @param {number} [options.divoomId] - Divoom device id.
   * @param {string} [options.name] - Name set in the Divoom app.
   * @param {boolean} [options.port9000] - Recent firmware: API on :9000/divoom_api only.
   */
  constructor({ host, mac = '', divoomId = 300000020, name = 'Pixoo64', port9000 = false }) {
    Object.assign(this, { host, mac, divoomId, name, port9000 });
    this.brightness = 80;
    this.screen = 1;
    this.channel = 0;
    this.clockId = 182;
    this.gifId = 0;
    this.commands = [];
    this.unplugged = false;
    this.refuse = new Set(); // commands answered with error_code 1
  }

  handle(body) {
    this.commands.push(body);
    const { Command: command } = body;
    if (this.refuse.has(command)) {
      return { error_code: 1 };
    }
    switch (command) {
      case 'Channel/GetAllConf':
        return {
          error_code: 0,
          Brightness: this.brightness,
          RotationFlag: 1,
          ClockTime: 60,
          GalleryTime: 60,
          SingleGalleyTime: 5,
          PowerOnChannelId: 1,
          GalleryShowTimeFlag: 1,
          CurClockId: this.clockId,
          Time24Flag: 1,
          TemperatureMode: 0,
          GyrateAngle: 0,
          MirrorFlag: 0,
          LightSwitch: this.screen,
        };
      case 'Channel/GetIndex':
        return { SelectIndex: this.channel };
      case 'Channel/SetBrightness':
        this.brightness = body.Brightness;
        return { error_code: 0 };
      case 'Channel/OnOffScreen':
        this.screen = body.OnOff;
        return { error_code: 0 };
      case 'Channel/SetIndex':
        this.channel = body.SelectIndex;
        return {};
      case 'Channel/SetClockSelectId':
        this.channel = 0;
        this.clockId = body.ClockId;
        return {};
      case 'Draw/GetHttpGifId':
        return { error_code: 0, PicId: this.gifId };
      case 'Draw/ResetHttpGifId':
        this.gifId = 0;
        return { error_code: 0 };
      case 'Draw/SendHttpGif':
        this.gifId = body.PicID;
        // What the screen shows is the HTTP animation (reported as custom).
        this.channel = 3;
        return { error_code: 0 };
      case 'Draw/SendHttpText':
      case 'Draw/ClearHttpText':
      case 'Device/PlayTFGif':
      case 'Tools/SetTimer':
      case 'Tools/SetStopWatch':
      case 'Tools/SetScoreBoard':
      case 'Tools/SetNoiseStatus':
      case 'Device/PlayBuzzer':
        return { error_code: 0 };
      default:
        return { error_code: 1 };
    }
  }

  /** The commands received, without the polling ones. */
  sent(name) {
    return this.commands.filter((body) => (name ? body.Command === name : true));
  }
}

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() {
    return typeof body === 'string' ? body : JSON.stringify(body);
  },
});

const refused = () =>
  Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });

/**
 * @description A network of fake displays and the Divoom service.
 * @param {FakePixoo[]} pixoos - The displays.
 * @returns {object} `{ pixoos, fetch, requests, cloud, add }`.
 */
export function fakePixooNetwork(pixoos = []) {
  const network = {
    pixoos: new Map(pixoos.map((pixoo) => [pixoo.host, pixoo])),
    requests: [],
    /** What the Divoom service answers: the displays, or an error to throw. */
    cloudDown: false,
    /** Other Divoom devices the service lists (a Ditoo speaker): no local API. */
    others: [
      { DeviceName: 'Ditoo', DeviceId: 300000099, DevicePrivateIP: '192.168.1.99', DeviceMac: '' },
    ],
    add(pixoo) {
      network.pixoos.set(pixoo.host, pixoo);
    },
    async fetch(href, init = {}) {
      const url = new URL(href);
      network.requests.push(href);
      if (url.hostname === 'app.divoom-gz.com') {
        if (network.cloudDown) {
          throw refused();
        }
        return response(200, network.cloudBody());
      }
      const pixoo = network.pixoos.get(url.hostname);
      if (!pixoo || pixoo.unplugged) {
        throw refused();
      }
      const wanted = pixoo.port9000 ? ':9000/divoom_api' : ':80/post';
      if (`:${url.port || 80}${url.pathname}` !== wanted) {
        throw refused();
      }
      return response(200, pixoo.handle(JSON.parse(init.body)));
    },
    /** The body of the Divoom "Find device" service. */
    cloudBody() {
      return {
        ReturnCode: 0,
        ReturnMessage: '',
        DeviceList: [
          ...[...network.pixoos.values()]
            .filter((pixoo) => pixoo.mac)
            .map((pixoo) => ({
              DeviceName: pixoo.name,
              DeviceId: pixoo.divoomId,
              DevicePrivateIP: pixoo.host,
              DeviceMac: pixoo.mac,
            })),
          ...network.others,
        ],
      };
    },
  };
  return network;
}

export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export const flush = () => new Promise((resolve) => setImmediate(resolve));
