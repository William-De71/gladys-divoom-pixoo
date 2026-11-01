import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { ACTIONS } from '../src/app.js';
import { DEFAULTS, LANGUAGES, POLL_INTERVALS } from '../src/config.js';
import { BACKGROUNDS, TEXT_COLORS } from '../src/pixoo/frame.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS, STOPWATCH_STATUS } from '../src/scenes.js';
import { SCROLL_SPEEDS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const REPO = 'William-De71/gladys-divoom-pixoo';
const fieldOf = (action, key) => byKey(byKey(manifest.scene_actions).get(action).fields).get(key);

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'Divoom Pixoo');
  assert.equal(manifest.version, pkg.version);
  assert.match(pkg.version, /^0\./);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-divoom-pixoo:${pkg.version}`);
  assert.equal(manifest.cover_image, `https://raw.githubusercontent.com/${REPO}/main/cover.jpg`);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-divoom-pixoo');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
});

test('declares the local transport: the Divoom search is the only Internet request', () => {
  assert.deepEqual(manifest.transports, ['local']);
  assert.match(source('../src/pixoo/discovery.js'), /https:\/\/app\.divoom-gz\.com\//);
  for (const file of ['app', 'devices', 'widgets', 'config', 'scenes', 'states', 'pixoo/client']) {
    assert.doesNotMatch(source(`../src/${file}.js`), /https:\/\/|node:net|node:dgram/, file);
  }
  assert.doesNotMatch(source('../src/app.js'), /GLADYS_PREFER_LOCAL/);
});

test('requires Gladys 5.3.0, sits on the multimedia shelf, asks no permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['multimedia']);
  for (const key of [
    'location',
    'network_wake',
    'containers',
    'network_discovery',
    'webhooks',
    'messaging',
    'energy_contracts',
    'music',
  ]) {
    assert.equal(manifest[key], undefined, key);
  }
});

test('the configuration matches the code: keys, defaults, options', () => {
  const config = byKey(manifest.config_schema);
  assert.equal(config.get('cloud_discovery').type, 'boolean');
  assert.equal(config.get('cloud_discovery').default, DEFAULTS.cloud_discovery);
  assert.equal(config.get('hosts').type, 'string');
  assert.equal(config.get('hosts').default, DEFAULTS.hosts);
  assert.deepEqual(values(config.get('poll_interval')), POLL_INTERVALS.map(String));
  assert.equal(config.get('poll_interval').default, DEFAULTS.poll_interval);
  assert.deepEqual(values(config.get('language')), LANGUAGES);
  assert.equal(config.get('language').default, DEFAULTS.language);
  for (const field of manifest.config_schema) {
    assert.ok(!['text', 'password'].includes(field.type), `${field.key}: string / secret only`);
    assert.equal(field.display_if, undefined, field.key);
  }
});

test('declares exactly the button, widget, triggers and scene actions the code handles', () => {
  const app = source('../src/app.js');
  assert.deepEqual(
    manifest.actions.map((a) => a.key),
    Object.values(ACTIONS),
  );
  assert.match(app, /onAction\(ACTIONS\.TEST/);
  assert.deepEqual(
    manifest.widgets.map((w) => w.key),
    Object.values(WIDGETS),
  );
  assert.match(app, /onWidgetGet\(\s*WIDGETS\.PIXOO/);
  assert.match(app, /onWidgetAction\(\s*WIDGETS\.PIXOO/);
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key),
    Object.values(SCENE_TRIGGERS),
  );
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key),
    Object.values(SCENE_ACTIONS),
  );
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(\\s*SCENE_ACTIONS\\.${key}\\b`), key);
  }
  // The trigger filter is the device the event names.
  for (const trigger of manifest.scene_triggers) {
    assert.deepEqual(
      trigger.fields.map((field) => field.key),
      ['device'],
    );
    assert.equal(trigger.fields[0].source, 'devices');
  }
});

test('the select values of the scene actions are the ones the code knows', () => {
  assert.deepEqual(values(fieldOf('show_message', 'color')), Object.keys(TEXT_COLORS));
  assert.deepEqual(values(fieldOf('show_message', 'background')), Object.keys(BACKGROUNDS));
  assert.deepEqual(values(fieldOf('show_message', 'speed')), Object.keys(SCROLL_SPEEDS));
  assert.deepEqual(values(fieldOf('stopwatch', 'action')), Object.keys(STOPWATCH_STATUS));
  assert.deepEqual(values(fieldOf('countdown', 'action')), ['start', 'stop']);
  assert.deepEqual(values(fieldOf('noise_meter', 'action')), ['start', 'stop']);
  // Only the device and the text are required: a field added later must be optional.
  for (const action of manifest.scene_actions) {
    const required = action.fields.filter((field) => field.required).map((field) => field.key);
    const expected = { show_message: ['device', 'text'], play_gif: ['device', 'url'] };
    assert.deepEqual(required, expected[action.key] ?? ['device'], action.key);
    assert.deepEqual(action.outputs, [], action.key);
  }
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.actions.length <= 10);
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  for (const action of [...manifest.actions, ...manifest.scene_actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
  }
  for (const action of manifest.scene_actions) {
    assert.ok(action.fields.length <= 10, action.key);
  }
  for (const trigger of manifest.scene_triggers) {
    assert.ok(trigger.fields.length <= 10 && trigger.variables.length <= 20, trigger.key);
  }
  for (const widget of manifest.widgets) {
    for (const setting of widget.settings) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type), setting.key);
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('catalog of Gladys 5.3.0: search keywords within the store bounds, worldwide', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword);
  }
  assert.equal(new Set(normalized).size, normalized.length, 'unique once trimmed and lowercased');
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'never the name itself');
  assert.equal(manifest.countries, undefined, 'usable worldwide: no country list');
});
