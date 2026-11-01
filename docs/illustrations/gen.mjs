// Widget contents for the generated illustrations, built by the real code of
// the integration: the app itself (src/app.js) wired to the fake Gladys of the
// SDK and the fake Pixoo displays of the tests. Two made-up displays: one on
// its clock face, one that stopped answering. Never real data.
// Written as JSON for render.js: node gen.mjs <repo> <out.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(repo, file)).href);
const { createApp } = await load('src/app.js');
const { createPixooClient } = await load('src/pixoo/client.js');
const { cloudDiscovery } = await load('src/pixoo/discovery.js');
const { memoryStorage } = await load('src/storage.js');
const { LANGUAGES } = await load('src/i18n.js');
const { FakePixoo, fakePixooNetwork, silentLogger } = await load('test/helpers/fake-pixoo.js');
const { createFakeGladys } = await import(
  pathToFileURL(join(repo, 'node_modules/@gladysassistant/integration-sdk/lib/testing.js')).href
);

const manifest = JSON.parse(readFileSync(join(repo, 'gladys-assistant-integration.json'), 'utf8'));

const office = new FakePixoo({ host: '192.168.1.60', mac: 'a8032aff46b1', name: 'Bureau' });
office.brightness = 70;
office.clockId = 182;
const kitchen = new FakePixoo({
  host: '192.168.1.61',
  mac: 'a8032aff5c02',
  divoomId: 300000021,
  name: 'Cuisine',
});
const network = fakePixooNetwork([office, kitchen]);
network.others = [];
const gladys = createFakeGladys({ config: { language: 'en' } });
const app = createApp(gladys, {
  client: createPixooClient({ fetch: network.fetch }),
  discover: () => cloudDiscovery(network.fetch),
  storage: memoryStorage(),
  logger: silentLogger,
});
await gladys.connect();
await app.start();
for (const device of gladys.fake.discoveredDevices) {
  await gladys.fake.deviceCreated(structuredClone(device));
}
kitchen.unplugged = true;
await app.poll();
await app.poll();

const idOf = (name) =>
  gladys.fake.discoveredDevices.find((device) => device.name === `Pixoo ${name}`).external_id;
const CARDS = { pixoo: idOf('Bureau'), pixoo_offline: idOf('Cuisine') };

const all = {};
for (const language of LANGUAGES) {
  all[language] = {};
  for (const [card, device] of Object.entries(CARDS)) {
    const ack = await gladys.fake.widgetGet('pixoo', { settings: { device }, language });
    all[language][card] = ack.data.content;
  }
}
await app.stop();

const widget = manifest.widgets.find((item) => item.key === 'pixoo');
writeFileSync(
  out,
  JSON.stringify({
    contents: all,
    images: {},
    cards: Object.fromEntries(
      Object.keys(CARDS).map((key) => [key, { icon: widget.icon, label: widget.label }]),
    ),
  }),
);
