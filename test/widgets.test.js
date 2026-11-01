// The widget content, built by the same code Gladys gets: valid for the SDK
// in every language, within the budget, the right buttons for each state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildPixooWidget, WIDGET_ACTIONS } from '../src/widgets.js';

const VIEW = {
  deviceId: 'ext:test-integration:device:a8032aff46b1',
  name: 'Pixoo Bureau',
  host: '192.168.1.60',
  reachable: true,
  screenOn: true,
  brightness: 80,
  channel: 'faces',
  clockId: 182,
};
const buttons = (content) =>
  content.components.filter((c) => c.type === 'button').map((c) => c.action.key);

test('a display that answers: state, channel, face, brightness and four buttons', () => {
  const content = buildPixooWidget(VIEW);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.length <= 8);
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => item.value.fr ?? item.value),
    ['Allumé', 'Cadrans', '#182', '192.168.1.60'],
  );
  assert.deepEqual(buttons(content), [
    WIDGET_ACTIONS.SCREEN_OFF,
    WIDGET_ACTIONS.SHOW_TEXT,
    WIDGET_ACTIONS.CLOCK,
    WIDGET_ACTIONS.COUNTDOWN,
  ]);
});

test('screen off: the first button turns it on; no clock face outside the faces channel', () => {
  const content = buildPixooWidget({ ...VIEW, screenOn: false, channel: 'cloud' });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(buttons(content)[0], WIDGET_ACTIONS.SCREEN_ON);
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items.length, 3);
});

test('not answering: a hint, no button; no device: an invitation to choose one', () => {
  const offline = buildPixooWidget({ ...VIEW, reachable: false });
  assert.deepEqual(validateWidgetContent(offline), []);
  assert.deepEqual(buttons(offline), []);
  const none = buildPixooWidget(null);
  assert.deepEqual(validateWidgetContent(none), []);
  assert.equal(none.components.length, 1);
});
