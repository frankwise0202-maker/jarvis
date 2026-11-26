// v8.1 (SPEC §28.1, A1): the honest tab title of a hands-free session with Jarvis in the background:
// "Listening · Jarvis", "Thinking · Jarvis", "Speaking · Jarvis", restored after (src/ui/attention.js
// sessionTitle), alongside missionFinished's "(n) " marker. Node, with a fake page.

import { test } from 'node:test';
import assert from 'node:assert/strict';

let loads = 0;

async function setup(t) {
  const saved = {};
  for (const k of ['window', 'document', 'navigator']) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.title = 'Jarvis';
  doc.visibilityState = 'visible';
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/157.0.0.0', maxTouchPoints: 0 }, configurable: true, writable: true });
  t.after(() => {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  });
  const attention = await import(`../../src/ui/attention.js?title=${++loads}`);
  attention.initAttention(() => ({ notifyOnFinish: true }));
  const setHidden = (hidden) => {
    doc.visibilityState = hidden ? 'hidden' : 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { attention, doc, setHidden };
}

test('the session word follows Voice Mode’s state while Jarvis is in the background, and the title comes back after', async (t) => {
  const { attention, doc, setHidden } = await setup(t);
  setHidden(true);
  attention.sessionTitle('listening');
  assert.equal(doc.title, 'Listening · Jarvis');
  attention.sessionTitle('thinking');
  assert.equal(doc.title, 'Thinking · Jarvis');
  attention.sessionTitle('working');
  assert.equal(doc.title, 'Thinking · Jarvis', 'a mission is thinking too');
  attention.sessionTitle('speaking');
  assert.equal(doc.title, 'Speaking · Jarvis');
  attention.sessionTitle('idle');
  assert.equal(doc.title, 'Jarvis', 'idle: no word');
  attention.sessionTitle('listening');
  attention.sessionTitle(null);
  assert.equal(doc.title, 'Jarvis', 'the session ended');
});

test('only while hidden: on screen the title is the app’s own; hidden again, the word is back', async (t) => {
  const { attention, doc, setHidden } = await setup(t);
  attention.sessionTitle('listening');
  assert.equal(doc.title, 'Jarvis', 'on screen: unchanged');
  setHidden(true);
  assert.equal(doc.title, 'Listening · Jarvis');
  setHidden(false);
  assert.equal(doc.title, 'Jarvis');
  attention.sessionTitle('speaking');
  setHidden(true);
  assert.equal(doc.title, 'Speaking · Jarvis');
});

test('with missionFinished’s marker: “(1) Speaking · Jarvis”; seen again, both go; the session word alone comes back when hidden', async (t) => {
  const { attention, doc, setHidden } = await setup(t);
  setHidden(true);
  attention.sessionTitle('speaking');
  attention.missionFinished({ title: 'Research', summary: 'Mission complete.' });
  assert.equal(doc.title, '(1) Speaking · Jarvis');
  attention.sessionTitle('listening');
  assert.equal(doc.title, '(1) Listening · Jarvis');
  setHidden(false);
  assert.equal(doc.title, 'Jarvis');
  setHidden(true);
  assert.equal(doc.title, 'Listening · Jarvis', 'the finish was seen; the session goes on');
  attention.sessionTitle(null);
  assert.equal(doc.title, 'Jarvis');
});

test('the app retitled the page meanwhile: its title stands, and is the one marked', async (t) => {
  const { attention, doc, setHidden } = await setup(t);
  setHidden(true);
  attention.sessionTitle('listening');
  assert.equal(doc.title, 'Listening · Jarvis');
  doc.title = 'Jarvis · Trip plans';
  attention.sessionTitle('thinking');
  assert.equal(doc.title, 'Thinking · Jarvis · Trip plans');
  doc.title = 'Something else';
  attention.sessionTitle(null);
  assert.equal(doc.title, 'Something else');
});

test('unknown states and no document never throw', async (t) => {
  const { attention, doc } = await setup(t);
  for (const v of [undefined, '', 'toString', 'constructor', 42, {}]) attention.sessionTitle(v);
  assert.equal(doc.title, 'Jarvis');
});
