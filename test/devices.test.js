// The device of the Discover tab: the fields the "Update" button compares
// are pinned (test/fixtures/discovery.baseline.json), every feature carries
// min / max / read_only / has_feedback, and the category / type pairs are
// ones the Gladys dashboard knows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { buildDevice, deviceName, featureValues } from '../src/devices.js';

const gladys = createFakeGladys();
const ENTRY = {
  id: 'a8032aff46b1',
  host: '192.168.1.60',
  mac: 'a8032aff46b1',
  divoomId: '300000020',
  divoomName: 'Bureau',
};
const COMPARED = ['category', 'type', 'unit', 'min', 'max', 'step'];

const pinned = (device) =>
  device.features.map((feature) => ({
    external_id: feature.external_id,
    ...Object.fromEntries(COMPARED.map((key) => [key, feature[key] ?? null])),
  }));

const BASELINE = new URL('./fixtures/discovery.baseline.json', import.meta.url);
if (process.env.UPDATE_BASELINE === '1') {
  writeFileSync(BASELINE, `${JSON.stringify(pinned(buildDevice(gladys, ENTRY, 'en')), null, 2)}\n`);
}

test('the compared fields of the features never change', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  for (const language of ['en', 'fr', 'de', 'es']) {
    assert.deepEqual(pinned(buildDevice(gladys, ENTRY, language)), baseline, language);
  }
});

test('every feature is complete, with a known category / type pair', () => {
  const device = buildDevice(gladys, ENTRY, 'fr');
  assert.equal(device.should_poll, false);
  for (const feature of device.features) {
    for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
    }
    const category = Object.entries(DEVICE_FEATURE_CATEGORIES).find(
      ([, v]) => v === feature.category,
    );
    assert.ok(category, feature.category);
    assert.ok(
      Object.values(DEVICE_FEATURE_TYPES[category[0]]).includes(feature.type),
      feature.type,
    );
  }
  assert.deepEqual(
    device.params.map((param) => param.name),
    ['PIXOO_HOST', 'PIXOO_MAC', 'PIXOO_DIVOOM_ID'],
  );
});

test('names and values', () => {
  assert.equal(deviceName(ENTRY), 'Pixoo Bureau');
  assert.equal(deviceName({ ...ENTRY, divoomName: 'Pixoo64' }), 'Pixoo64');
  assert.equal(deviceName({ id: 'a8032aff46b1', divoomName: '' }), 'Pixoo 46B1');
  assert.deepEqual(
    featureValues({ screenOn: false, brightness: 30, channel: 'cloud', message: '' }),
    [
      ['screen', 0],
      ['brightness', 30],
      ['channel', { text: 'cloud' }],
    ],
  );
});
