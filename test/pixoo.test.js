// The local client and the discovery helpers against fake displays: the
// documented commands and answers, the :9000 endpoint of recent firmware,
// one request at a time per display, the Divoom "Find device" answer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPixooClient, PixooError } from '../src/pixoo/client.js';
import {
  cloudDiscovery,
  normalizeMac,
  parseCloudDevices,
  parseHosts,
  platformId,
} from '../src/pixoo/discovery.js';
import { cleanLine, lineTops, plainFrame } from '../src/pixoo/frame.js';
import { FakePixoo, fakePixooNetwork } from './helpers/fake-pixoo.js';

const setup = (options = {}) => {
  const pixoo = new FakePixoo({ host: '192.168.1.60', mac: 'a8032aff46b1', ...options });
  const network = fakePixooNetwork([pixoo]);
  return { pixoo, network, client: createPixooClient({ fetch: network.fetch }) };
};

test('reads the settings and the channel, sends the documented commands', async () => {
  const { pixoo, network, client } = setup();
  const conf = await client.getAllConf('192.168.1.60');
  assert.equal(conf.Brightness, 80);
  assert.equal(await client.getChannel('192.168.1.60'), 0);
  await client.setBrightness('192.168.1.60', 140);
  await client.setScreen('192.168.1.60', false);
  await client.setChannel('192.168.1.60', 2);
  assert.deepEqual(
    [pixoo.brightness, pixoo.screen, pixoo.channel],
    [100, 0, 2],
    'brightness bounded to 100',
  );
  assert.ok(network.requests.every((url) => url === 'http://192.168.1.60:80/post'));
  await client.sendText('192.168.1.60', {
    id: 25,
    y: 70,
    font: 9,
    speed: 60,
    text: 'Hi',
    color: '#FFFFFF',
  });
  const text = pixoo.sent('Draw/SendHttpText')[0];
  assert.deepEqual(
    [text.TextId, text.y, text.font, text.TextWidth, text.align],
    [19, 63, 7, 64, 2],
    'every value within the documented ranges',
  );
});

test('recent firmware: falls back to :9000/divoom_api and remembers it', async () => {
  const { network, client } = setup({ port9000: true });
  await client.getAllConf('192.168.1.60');
  await client.getChannel('192.168.1.60');
  assert.deepEqual(network.requests, [
    'http://192.168.1.60:80/post',
    'http://192.168.1.60:9000/divoom_api',
    'http://192.168.1.60:9000/divoom_api',
  ]);
});

test('a refused command is a PixooError, an unplugged display a network error', async () => {
  const { pixoo, client } = setup();
  pixoo.refuse.add('Channel/SetBrightness');
  await assert.rejects(client.setBrightness('192.168.1.60', 10), PixooError);
  pixoo.unplugged = true;
  await assert.rejects(
    client.getAllConf('192.168.1.60'),
    (error) => !(error instanceof PixooError),
  );
});

test('one request at a time per display', async () => {
  let running = 0;
  let most = 0;
  const fetch = async (url, init) => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    return { ok: true, status: 200, text: async () => '{"error_code":0}', url, init };
  };
  const client = createPixooClient({ fetch });
  await Promise.all([1, 2, 3, 4].map((value) => client.setBrightness('10.0.0.5', value)));
  assert.equal(most, 1);
});

test('the Divoom service: displays with a valid address, ids and MAC normalized', async () => {
  const { network } = setup();
  const devices = await cloudDiscovery(network.fetch);
  assert.deepEqual(devices[0], {
    name: 'Pixoo64',
    divoomId: '300000020',
    host: '192.168.1.60',
    mac: 'a8032aff46b1',
  });
  assert.equal(devices.length, 2, 'the Ditoo is listed: the local probe sorts it out');
  assert.deepEqual(parseCloudDevices({ DeviceList: [{ DevicePrivateIP: 'nope' }] }), []);
  assert.throws(() => parseCloudDevices({ ReturnCode: 1 }));
  network.cloudDown = true;
  await assert.rejects(cloudDiscovery(network.fetch));
});

test('identity: MAC, else Divoom id, else address; typed addresses parsed', () => {
  assert.equal(platformId({ mac: 'A8:03:2A:FF:46:B1', divoomId: '1', host: 'x' }), 'a8032aff46b1');
  assert.equal(platformId({ mac: '', divoomId: '300000020', host: 'x' }), 'divoom-300000020');
  assert.equal(platformId({ host: '192.168.1.60' }), 'ip-192-168-1-60');
  assert.equal(normalizeMac('00:00:00:00:00:00'), '');
  assert.deepEqual(parseHosts('192.168.1.60, 192.168.1.60;10.0.0.300 10.0.0.2'), [
    '192.168.1.60',
    '10.0.0.2',
  ]);
});

test('frames and lines: 64 × 64 RGB, centered lines, one clean line of text', () => {
  const frame = Buffer.from(plainFrame('dark_blue'), 'base64');
  assert.equal(frame.length, 64 * 64 * 3);
  assert.deepEqual([...frame.subarray(0, 3)], [0, 16, 64]);
  assert.deepEqual(lineTops(1), [24]);
  assert.deepEqual(lineTops(2), [14, 34]);
  assert.equal(cleanLine(' Hello\nworld\u0007 '), 'Hello world');
  assert.equal(cleanLine('x'.repeat(600)).length, 511);
});
