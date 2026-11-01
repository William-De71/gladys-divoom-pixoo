// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`) and fake Pixoo displays
// (test/helpers/fake-pixoo.js): discovery, states, commands, messages,
// scene actions and triggers, widget, address changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp } from '../src/app.js';
import { createPixooClient } from '../src/pixoo/client.js';
import { cloudDiscovery } from '../src/pixoo/discovery.js';
import { memoryStorage } from '../src/storage.js';
import { FakePixoo, fakePixooNetwork, silentLogger } from './helpers/fake-pixoo.js';

const CONFIG = { language: 'fr', hosts: '10.0.0.2', cloud_discovery: true };
const id = (key) => `ext:test-integration:device:${key}`;
const BUREAU = id('a8032aff46b1');
const TYPED = id('ip-10-0-0-2');

const displays = () => [
  new FakePixoo({ host: '192.168.1.60', mac: 'A8:03:2A:FF:46:B1', name: 'Bureau' }),
  // Typed in the configuration, unknown to the Divoom service (no MAC listed).
  new FakePixoo({ host: '10.0.0.2', name: '', port9000: true }),
];

async function setup({
  config = CONFIG,
  create = true,
  network = fakePixooNetwork(displays()),
  storage = memoryStorage(),
} = {}) {
  const gladys = createFakeGladys({ config: structuredClone(config) });
  const app = createApp(gladys, {
    client: createPixooClient({ fetch: network.fetch }),
    discover: () => cloudDiscovery(network.fetch),
    storage,
    logger: silentLogger,
  });
  await gladys.connect();
  await app.start();
  if (create) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(structuredClone(device));
    }
    await app.flushStates();
  }
  // The timers are unref'd: the tests drive polls and searches themselves.
  return { gladys, fake: gladys.fake, app, network, storage };
}

const ok = (ack) => {
  assert.equal(ack.success, true, ack.error);
  return ack.data;
};
const deviceOf = (fake, externalId) =>
  structuredClone(fake.discoveredDevices.find((device) => device.external_id === externalId));
const featureOf = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`));
const last = (fake, externalId, key) => fake.lastState(`${externalId}:${key}`);
const setValue = (fake, externalId, key, value) => {
  const device = deviceOf(fake, externalId);
  return fake.setValue(device, featureOf(device, key), value);
};
const pixooAt = (network, host) => network.pixoos.get(host);

test('discovery: displays from the Divoom service and typed addresses, nothing else', async () => {
  const { fake, storage } = await setup({ create: false });
  const ids = fake.discoveredDevices.map((device) => device.external_id).sort();
  assert.deepEqual(ids, [BUREAU, TYPED].sort(), 'the Ditoo has no local API: not listed');
  const bureau = deviceOf(fake, BUREAU);
  assert.equal(bureau.name, 'Pixoo Bureau');
  assert.equal(featureOf(bureau, 'screen').name, 'Pixoo Bureau - Écran');
  assert.equal(bureau.should_poll, false);
  assert.equal(bureau.poll_frequency, undefined);
  assert.deepEqual(
    featureOf(bureau, 'channel').supported_options.map((option) => option.label),
    ['Cadrans', 'Galerie cloud', 'Visualiseur', 'Personnalisé'],
  );
  assert.equal(deviceOf(fake, TYPED).name, 'Pixoo 10.0.0.2');
  assert.deepEqual(Object.keys(storage.files['pixoos.json']).sort(), [
    'a8032aff46b1',
    'ip-10-0-0-2',
  ]);
  for (const device of fake.discoveredDevices) {
    for (const feature of device.features) {
      for (const field of ['min', 'max', 'read_only', 'has_feedback']) {
        assert.notEqual(feature[field], undefined, `${feature.external_id}.${field}`);
      }
    }
  }
});

test('states: screen, brightness and channel of the created displays, republished on creation', async () => {
  const { fake } = await setup();
  assert.equal(last(fake, BUREAU, 'screen'), 1);
  assert.equal(last(fake, BUREAU, 'brightness'), 80);
  assert.equal(last(fake, BUREAU, 'channel'), 'faces');
  assert.equal(last(fake, TYPED, 'brightness'), 80);
  assert.ok(
    fake.transports.some(
      (entry) => entry.device_external_id === BUREAU && entry.transport === 'local',
    ),
  );
  assert.equal(fake.connectionStatus.connected, true);
  assert.match(fake.connectionStatus.message.fr, /2 écran\(s\) Pixoo sur 2/);
});

test('a change made on the device or in the Divoom app is read at the next poll', async () => {
  const { fake, app, network } = await setup();
  const pixoo = pixooAt(network, '192.168.1.60');
  pixoo.brightness = 35;
  pixoo.screen = 0;
  pixoo.channel = 2;
  await app.poll();
  await app.flushStates();
  assert.equal(last(fake, BUREAU, 'brightness'), 35);
  assert.equal(last(fake, BUREAU, 'screen'), 0);
  assert.equal(last(fake, BUREAU, 'channel'), 'visualizer');
});

test('features: screen, brightness, channel and message command the display', async () => {
  const { fake, app, network } = await setup();
  const pixoo = pixooAt(network, '192.168.1.60');
  ok(await setValue(fake, BUREAU, 'screen', 0));
  ok(await setValue(fake, BUREAU, 'brightness', 42));
  ok(await setValue(fake, BUREAU, 'channel', 'cloud'));
  assert.deepEqual([pixoo.screen, pixoo.brightness, pixoo.channel], [0, 42, 1]);
  ok(await setValue(fake, BUREAU, 'message', 'Bonjour'));
  const text = pixoo.sent('Draw/SendHttpText');
  assert.equal(text.length, 1);
  assert.equal(text[0].TextString, 'Bonjour');
  assert.equal(text[0].color, '#FFFFFF');
  assert.equal(pixoo.sent('Draw/SendHttpGif').length, 1, 'a frame first: text needs one');
  await app.flushStates();
  assert.equal(last(fake, BUREAU, 'screen'), 0);
  assert.equal(last(fake, BUREAU, 'message'), 'Bonjour');
  const bad = await setValue(fake, BUREAU, 'channel', 'disco');
  assert.equal(bad.success, false);
  assert.match(bad.error, /Canal inconnu/);
});

test('show_message: two lines, colors, the frame id restarts past 32', async () => {
  const { fake, network } = await setup();
  const pixoo = pixooAt(network, '192.168.1.60');
  pixoo.gifId = 31;
  ok(
    await fake.sceneAction('show_message', {
      device: BUREAU,
      text: 'Courrier',
      second_line: 'arrivé',
      color: 'yellow',
      background: 'dark_blue',
      speed: 'fast',
    }),
  );
  assert.equal(pixoo.sent('Draw/ResetHttpGifId').length, 1);
  assert.equal(pixoo.sent('Draw/SendHttpGif')[0].PicID, 1);
  const lines = pixoo.sent('Draw/SendHttpText');
  assert.deepEqual(
    lines.map((line) => [line.TextId, line.y, line.TextString, line.color, line.speed]),
    [
      [1, 14, 'Courrier', '#FFD200', 30],
      [2, 34, 'arrivé', '#FFD200', 30],
    ],
  );
  const frame = Buffer.from(pixoo.sent('Draw/SendHttpGif')[0].PicData, 'base64');
  assert.deepEqual([...frame.subarray(0, 3)], [0, 16, 64]);
  ok(await fake.sceneAction('show_message', { device: BUREAU, text: 'Encore' }));
  assert.equal(pixoo.sent('Draw/SendHttpGif')[1].PicID, 2);
  const empty = await fake.sceneAction('show_message', { device: BUREAU, text: '  ' });
  assert.equal(empty.success, false);
  assert.match(empty.error, /vide/);
});

test('show_message with a duration: the clock face of before comes back', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { fake, network } = await setup();
  const pixoo = pixooAt(network, '192.168.1.60');
  ok(await fake.sceneAction('show_message', { device: BUREAU, text: 'Pizza', duration: 10 }));
  // A second message during the first keeps the view of before the first.
  ok(await fake.sceneAction('show_message', { device: BUREAU, text: 'Prête', duration: 5 }));
  assert.equal(pixoo.channel, 3);
  t.mock.timers.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pixoo.channel, 0);
  assert.deepEqual(pixoo.sent('Channel/SetClockSelectId').at(-1).ClockId, 182);
});

test('scene actions: GIF, clock face, tools, buzzer bounded', async () => {
  const { fake, network } = await setup();
  const pixoo = pixooAt(network, '192.168.1.60');
  ok(
    await fake.sceneAction('play_gif', { device: BUREAU, url: 'http://f.divoom-gz.com/64_64.gif' }),
  );
  assert.equal(pixoo.sent('Device/PlayTFGif')[0].FileType, 2);
  const badUrl = await fake.sceneAction('play_gif', { device: BUREAU, url: 'file:///etc/passwd' });
  assert.equal(badUrl.success, false);
  ok(await fake.sceneAction('show_clock_face', { device: BUREAU, clock_id: 64 }));
  assert.equal(pixoo.clockId, 64);
  ok(await fake.sceneAction('show_clock_face', { device: BUREAU }));
  assert.equal(pixoo.sent('Channel/SetIndex').at(-1).SelectIndex, 0);
  ok(await fake.sceneAction('countdown', { device: BUREAU, minutes: 2, seconds: 30 }));
  assert.deepEqual(pixoo.sent('Tools/SetTimer')[0], {
    Command: 'Tools/SetTimer',
    Minute: 2,
    Second: 30,
    Status: 1,
  });
  ok(await fake.sceneAction('stopwatch', { device: BUREAU, action: 'reset' }));
  assert.equal(pixoo.sent('Tools/SetStopWatch')[0].Status, 2);
  ok(await fake.sceneAction('scoreboard', { device: BUREAU, blue: 3, red: 1200 }));
  assert.equal(pixoo.sent('Tools/SetScoreBoard')[0].RedScore, 999);
  ok(await fake.sceneAction('noise_meter', { device: BUREAU, action: 'stop' }));
  assert.equal(pixoo.sent('Tools/SetNoiseStatus')[0].NoiseStatus, 0);
  ok(await fake.sceneAction('play_buzzer', { device: BUREAU, duration_ms: 60000 }));
  assert.equal(pixoo.sent('Device/PlayBuzzer')[0].PlayTotalTime, 10000);
  const unknown = await fake.sceneAction('countdown', { device: id('nope') });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /n’est pas un Pixoo/);
});

test('a refused command says the firmware may be too old', async () => {
  const { fake, network } = await setup();
  pixooAt(network, '192.168.1.60').refuse.add('Tools/SetTimer');
  const ack = await fake.sceneAction('countdown', { device: BUREAU });
  assert.equal(ack.success, false);
  assert.match(ack.error, /micrologiciel/);
});

test('triggers: unreachable after two failed polls, reachable again after', async () => {
  const { fake, app, network } = await setup();
  const pixoo = pixooAt(network, '192.168.1.60');
  pixoo.unplugged = true;
  await app.poll();
  assert.equal(fake.sceneEvents.length, 0, 'one failure is not enough');
  await app.poll();
  assert.deepEqual(fake.sceneEvents.at(-1), {
    key: 'unreachable',
    data: { device: BUREAU, name: 'Pixoo Bureau', host: '192.168.1.60' },
  });
  assert.ok(
    fake.transports.some(
      (entry) => entry.device_external_id === BUREAU && entry.transport === 'unreachable',
    ),
  );
  pixoo.unplugged = false;
  await app.poll();
  assert.equal(fake.sceneEvents.at(-1).key, 'reachable_again');
  assert.equal(fake.sceneEvents.length, 2);
});

test('a new address (DHCP) is followed through the Divoom service, same device', async () => {
  const { fake, app, network } = await setup();
  const pixoo = pixooAt(network, '192.168.1.60');
  network.pixoos.delete('192.168.1.60');
  pixoo.host = '192.168.1.77';
  network.add(pixoo);
  await app.scan();
  const device = deviceOf(fake, BUREAU);
  assert.equal(device.params.find((param) => param.name === 'PIXOO_HOST').value, '192.168.1.77');
  ok(await setValue(fake, BUREAU, 'brightness', 10));
  assert.equal(pixoo.brightness, 10);
});

test('the Divoom search off or down: typed addresses still work, the status says why', async () => {
  const network = fakePixooNetwork(displays());
  network.cloudDown = true;
  const { fake } = await setup({ network, create: false, config: { ...CONFIG, hosts: '' } });
  assert.equal(fake.discoveredDevices.length, 0);
  assert.equal(fake.connectionStatus.connected, false);
  assert.match(fake.connectionStatus.message.fr, /recherche Divoom n’a pas répondu/);
  const off = await setup({ config: { ...CONFIG, cloud_discovery: false }, create: false });
  assert.deepEqual(
    off.fake.discoveredDevices.map((device) => device.external_id),
    [TYPED],
  );
  assert.ok(!off.network.requests.some((url) => url.includes('divoom-gz.com')));
});

test('restart: the displays saved in /data are asked at once', async () => {
  const first = await setup();
  const gladys = createFakeGladys({ config: { ...CONFIG, cloud_discovery: false, hosts: '' } });
  gladys.fake.devices.push(...first.fake.devices.map((device) => structuredClone(device)));
  const app = createApp(gladys, {
    client: createPixooClient({ fetch: first.network.fetch }),
    discover: async () => [],
    storage: first.storage,
    logger: silentLogger,
  });
  await gladys.connect();
  await app.start();
  await app.stop();
  await app.flushStates();
  assert.equal(gladys.fake.lastState(`${BUREAU}:brightness`), 80);
});

test('configuration button: lists the displays with their address', async () => {
  const { fake } = await setup();
  const { message } = ok(await fake.action('test_connection'));
  assert.match(message.fr, /2 écran\(s\) Pixoo/);
  assert.match(message.fr, /Pixoo Bureau \(192\.168\.1\.60, luminosité 80 %\)/);
  assert.match(message.fr, /10\.0\.0\.2, adresse saisie/);
  for (const language of ['en', 'fr', 'de', 'es']) {
    assert.ok(message[language].length <= 1800);
  }
});

test('widget: valid content in every language, buttons work', async () => {
  const { fake, network } = await setup();
  for (const language of ['en', 'fr', 'de', 'es']) {
    const { content } = ok(
      await fake.widgetGet('pixoo', { settings: { device: BUREAU }, language }),
    );
    assert.deepEqual(validateWidgetContent(content), [], language);
    assert.ok(content.components.length <= 8);
  }
  const { content } = ok(await fake.widgetGet('pixoo', { settings: { device: id('nope') } }));
  assert.equal(content.components.length, 1);
  const pixoo = pixooAt(network, '192.168.1.60');
  const off = ok(
    await fake.widgetAction(
      'pixoo',
      'screen_off',
      { device: BUREAU },
      { settings: { device: BUREAU } },
    ),
  );
  assert.match(off.message.fr, /écran éteint/);
  assert.equal(pixoo.screen, 0);
  const shown = ok(
    await fake.widgetAction(
      'pixoo',
      'show_text',
      { device: BUREAU },
      {
        settings: { device: BUREAU },
        values: { text: 'Salut', color: 'green', duration: 0 },
      },
    ),
  );
  assert.match(shown.message.fr, /Le texte est affiché/);
  assert.equal(pixoo.sent('Draw/SendHttpText')[0].color, '#20E040');
  ok(
    await fake.widgetAction(
      'pixoo',
      'countdown',
      { device: BUREAU },
      { settings: { device: BUREAU }, values: { minutes: 3 } },
    ),
  );
  assert.equal(pixoo.sent('Tools/SetTimer')[0].Minute, 3);
  pixoo.unplugged = true;
  const failed = ok(
    await fake.widgetAction('pixoo', 'clock', { device: BUREAU }, { settings: { device: BUREAU } }),
  );
  assert.match(failed.message.fr, /ne répond pas/);
});
