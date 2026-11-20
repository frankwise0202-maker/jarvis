// Screens (v7): the main-window controller (src/ui/screens/controller.js) in real headless Chromium
// with the browser APIs stubbed: Window Management (two monitors, the permission states), Document
// Picture-in-Picture (a real same-origin popup stands in for the floating window), a popup blocker
// and the user gesture. Checks the placement chosen for each command, the one-tap fallback and the
// one-time tip, the permission explainer, reuse without a gesture, moving between screens, closing
// and handing back, and the tool path.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './platform.harness.test.mjs';

let h;
before(async () => {
  h = await createHarness({ ctl: 'src/ui/screens/controller.js' });
});
after(async () => {
  if (h) await h.close();
});

// Stubs installed before any page script (see test/e2e/scenarios/screens.mjs for the same in E2E).
function stubs(opts) {
  const o = opts || {};
  const LAPTOP = { left: 0, top: 0, width: 1440, height: 900, availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875, isPrimary: true, isInternal: true, label: 'Built-in Retina Display' };
  const DELL = { left: 1440, top: 0, width: 2560, height: 1440, availLeft: 1440, availTop: 0, availWidth: 2560, availHeight: 1415, isPrimary: false, isInternal: false, label: 'DELL U2720Q' };
  if (window.opener) return;
  window.__gesture = false;
  // Headless Chromium has the real APIs (one screen, isExtended false): replace or remove them.
  const remove = (name) => {
    try {
      delete window[name];
    } catch {
      /* not configurable */
    }
    if (name in window) Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
  };
  Object.defineProperty(window.screen, 'isExtended', { configurable: true, get: () => !o.single });
  if (o.noWm) remove('getScreenDetails');
  if (o.noPip) remove('documentPictureInPicture');
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { get isActive() { return window.__gesture === true; }, hasBeenActive: true } });
  window.__opens = [];
  window.__blockPopups = !!o.blockPopups;
  const realOpen = window.open.bind(window);
  // Like the browser: a gesture (transient activation) is used up by the window it opens.
  window.open = (url, name, features) => {
    window.__opens.push({ url: String(url), name: String(name || ''), features: String(features || ''), gesture: window.__gesture });
    if (window.__blockPopups && !window.__gesture) return null;
    window.__gesture = false;
    return realOpen(url, name, features);
  };
  const wm = { perm: o.perm || 'granted', screens: o.single ? [LAPTOP] : [LAPTOP, DELL], asked: 0 };
  window.__wm = wm;
  if (!o.noWm) {
    window.getScreenDetails = async () => {
      wm.asked += 1;
      if (wm.perm === 'denied') throw new DOMException('denied', 'NotAllowedError');
      wm.perm = 'granted';
      return { screens: wm.screens, currentScreen: wm.screens[0], addEventListener() {} };
    };
    const q = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (d) => (d && /^window-(management|placement)$/.test(d.name) ? Promise.resolve({ state: wm.perm }) : q(d));
  }
  if (!o.noPip) {
    const pip = {
      window: null,
      async requestWindow({ width, height }) {
        if (!window.__gesture) throw new DOMException('needs a gesture', 'NotAllowedError');
        window.__gesture = false;
        const w = realOpen('', '', `popup,width=${width},height=${height}`);
        pip.window = w;
        window.__pipSize = { width, height };
        return w;
      },
    };
    Object.defineProperty(window, 'documentPictureInPicture', { value: pip, configurable: true, writable: true });
  }
}

const CONV = {
  id: 'c1',
  turns: [
    { id: 'u1', role: 'user', text: 'Show me a Camry' },
    { id: 'j1', role: 'jarvis', status: 'done', missions: {}, segments: [{ id: 'h1', kind: 'hologram', status: 'done', title: '2024 Camry', libraryId: 'lib_camry00000', spec: { title: '2024 Camry', parts: [{ id: 'a', name: 'A' }] } }] },
    { id: 'u2', role: 'user', text: 'Compare EV SUVs' },
    { id: 'j2', role: 'jarvis', status: 'done', missions: {}, segments: [{ id: 't1', kind: 'text', text: 'The **Kia EV9**. See [review](https://example.com/ev9).' }] },
  ],
};

/** A page with the controller wired to a fake app; window.__app records what the app was asked. */
async function page(opts = {}) {
  const p = await h.newPage({ init: stubs, initArg: opts });
  await p.evaluate((conv) => {
    // Links point at this test server, so opening one never leaves the machine.
    conv.turns[3].segments[0].text = conv.turns[3].segments[0].text.replace('https://example.com/ev9', `${location.origin}/ev9-review`);
    window.__app = { shownInApp: [], closedInApp: [], toasts: [] };
    window.__open = null; // the in-app viewer, for "this"
    window.ctl = window.__mods.ctl.createScreens({
      getConversation: () => conv,
      getLiveTurn: () => null,
      describeOpen: () => window.__open,
      closeInApp: (t) => (window.__app.closedInApp.push(t.kind), true),
      showInApp: (t, o) => window.__app.shownInApp.push({ kind: t.kind, reason: o && o.reason, back: !!(o && o.back) }),
      getLibraryItem: async () => null,
      toast: (m) => window.__app.toasts.push(m),
    });
    // Run a command "inside a click" (gesture) or not (voice): resolves to the outcome.
    window.say = async (text, { gesture = false, source = 'typed' } = {}) => {
      window.__gesture = gesture; // lasts until a window uses it, like transient activation
      const res = window.ctl.command(text, { source });
      if (!res) return null;
      const o = await res.done;
      return { status: o.status, mode: o.mode || null, label: o.label || null, note: o.note || null, button: o.button || null, kind: o.kind || null, count: o.count, reused: !!o.reused };
    };
  }, CONV);
  return p;
}

test('typed "on my other screen", permission granted: a window maximized on the second monitor', async () => {
  const p = await page();
  const o = await p.evaluate(() => window.say('put the report on my other screen', { gesture: true }));
  assert.deepEqual(o, { status: 'opened', mode: 'screen', label: 'SCREEN 2', note: null, button: null, kind: 'answer', count: undefined, reused: false });
  const opens = await p.evaluate(() => window.__opens);
  assert.equal(opens.length, 1);
  assert.equal(opens[0].features, 'popup=1,left=1440,top=0,width=2560,height=1415');
  const url = new URL(opens[0].url);
  assert.deepEqual([url.searchParams.get('screen'), url.searchParams.get('w'), url.searchParams.get('n'), url.searchParams.get('c'), url.searchParams.get('t')], ['answer', 'other', '2', 'c1', 'j2']);
  assert.deepEqual(await p.evaluate(() => window.ctl.list().map((s) => [s.mode, s.label, s.kind])), [['screen', 'SCREEN 2', 'answer']]);
  // Another thing for screen 2: the open window takes it, no new window and no gesture needed.
  const o2 = await p.evaluate(() => window.say('put the hologram on screen 2', { source: 'voice' }));
  assert.deepEqual([o2.status, o2.reused, o2.kind], ['opened', true, 'hologram']);
  assert.equal(await p.evaluate(() => window.__opens.length), 1);
  assert.deepEqual(p.problems, []);
});

test('spoken, popups blocked: a one-tap button (and, the first time only, the pop-ups tip)', async () => {
  const p = await page({ blockPopups: true });
  const o = await p.evaluate(() => window.say('open this on my other screen', { source: 'voice' }));
  assert.deepEqual([o.status, o.button, o.kind], ['needs_tap', 'Open on screen 2', 'answer']);
  assert.equal(await p.locator('[data-testid="screens-tap"]').count(), 1);
  assert.equal(await p.locator('[data-testid="screens-tip"]').count(), 1, 'the tip, once');
  assert.match(await p.locator('[data-testid="screens-tip"]').textContent(), /Always allow pop-ups/);
  // The tap: a real click (a gesture) opens it.
  await p.evaluate(() => {
    document.querySelector('[data-testid="screens-tap-button"]').addEventListener('click', () => (window.__gesture = true), { capture: true });
  });
  await p.click('[data-testid="screens-tap-button"]');
  await p.waitForFunction(() => window.ctl.list().length === 1);
  assert.equal(await p.locator('[data-testid="screens-tap"]').count(), 0, 'the button goes away');
  const opens = await p.evaluate(() => window.__opens.map((x) => x.gesture));
  assert.deepEqual(opens, [false, true]);
  // Blocked again later: the button, without the tip.
  await p.evaluate(() => window.ctl.closeAll());
  const again = await p.evaluate(() => window.say('float the report', { source: 'voice' }));
  assert.equal(again.status, 'needs_tap');
  assert.equal(again.button, 'Float it');
  assert.equal(await p.locator('[data-testid="screens-tip"]').count(), 0);
  assert.deepEqual(p.problems, []);
});

test('first use of the second monitor: the explainer, then Chrome\'s prompt, then the window', async () => {
  const p = await page({ perm: 'prompt' });
  const o = await p.evaluate(() => window.say('put the hologram on my other screen', { gesture: true }));
  assert.equal(o.status, 'needs_permission');
  assert.equal(await p.evaluate(() => window.__wm.asked), 0, 'nothing asked before the owner chooses');
  assert.match(await p.locator('[data-testid="screens-explainer"]').textContent(), /Chrome will ask once/);
  await p.evaluate(() => document.querySelector('[data-testid="screens-allow"]').addEventListener('click', () => (window.__gesture = true), { capture: true }));
  await p.click('[data-testid="screens-allow"]');
  await p.waitForFunction(() => window.ctl.list().length === 1);
  assert.equal(await p.evaluate(() => window.__wm.asked), 1);
  assert.deepEqual(await p.evaluate(() => window.ctl.list().map((s) => [s.mode, s.label, s.kind])), [['screen', 'SCREEN 2', 'hologram']]);
  assert.deepEqual(p.problems, []);
});

test('one monitor: "other screen" floats beside; the floating panel copies the styles and shows the frame', async () => {
  const p = await page({ single: true });
  await p.addStyleTag({ content: '.scr { --probe: 1px; } .scr__title { letter-spacing: 0.12em; }' });
  const o = await p.evaluate(() => window.say('put the hologram on my other screen', { gesture: true }));
  assert.deepEqual([o.status, o.mode, o.note, o.label], ['opened', 'pip', 'single-screen', 'FLOAT']);
  assert.deepEqual(await p.evaluate(() => window.__pipSize), { width: 640, height: 480 });
  const inPip = await p.evaluate(() => {
    const w = window.documentPictureInPicture.window;
    const root = w.document.querySelector('[data-testid="screen"]');
    return {
      styles: w.document.querySelectorAll('style').length,
      copied: Array.from(w.document.querySelectorAll('style')).some((s) => s.textContent.includes('--probe')),
      where: root && root.dataset.where,
      kind: root && root.dataset.kind,
      compact: root && root.dataset.compact,
      title: w.document.querySelector('[data-testid="screen-title"]').textContent,
      eyebrow: w.document.querySelector('.scr__eyebrow').textContent,
      htmlClass: w.document.documentElement.className,
    };
  });
  assert.ok(inPip.styles >= 1 && inPip.copied, 'stylesheets copied into the floating document');
  // The part count is in the header (a readout on the stage collided with the labels).
  assert.deepEqual([inPip.where, inPip.kind, inPip.compact, inPip.title, inPip.eyebrow], ['beside', 'hologram', 'true', '2024 Camry', 'FLOAT·HOLOGRAM·1 PART']);
  assert.match(inPip.htmlClass, /is-pip/);
  // The panel is open: the next thing floats in it without a gesture.
  const o2 = await p.evaluate(() => window.say('float the report', { source: 'voice' }));
  assert.deepEqual([o2.status, o2.reused, o2.kind], ['opened', true, 'answer']);
  assert.equal(await p.evaluate(() => window.documentPictureInPicture.window.document.querySelector('[data-testid="screen"]').dataset.kind), 'answer');
  // "Close the float": it closes, and nothing is handed back (it did not come from an in-app viewer).
  const closed = await p.evaluate(() => window.say('close the float'));
  assert.deepEqual([closed.status, closed.count], ['closed', 1]);
  assert.equal(await p.evaluate(() => window.documentPictureInPicture.window.closed), true);
  await p.waitForTimeout(400);
  assert.deepEqual(await p.evaluate(() => window.__app.shownInApp), []);
  // Closed by the panel's own window controls while the app has the focus (Chrome's "back to tab"
  // focuses the app): handed back here.
  await p.evaluate(() => window.say('float the report', { gesture: true }));
  await p.evaluate(() => window.documentPictureInPicture.window.close());
  await p.waitForFunction(() => window.ctl.list().length === 0);
  assert.deepEqual(await p.evaluate(() => window.__app.shownInApp), [{ kind: 'answer', reason: 'handback', back: true }]);
});

test('moving: from an in-app viewer to the floating panel, then to screen 2, then back', async () => {
  const p = await page();
  await p.evaluate(() => {
    window.__open = { kind: 'hologram', ref: { libraryId: 'lib_camry00000', segmentId: 'h1', conversationId: 'c1', turnId: 'j1' }, title: '2024 Camry' };
  });
  const o = await p.evaluate(() => window.say('float it', { gesture: true }));
  assert.deepEqual([o.status, o.mode, o.kind], ['opened', 'pip', 'hologram']);
  assert.deepEqual(await p.evaluate(() => window.__app.closedInApp), ['hologram'], 'the in-app viewer closed (one 3D view)');
  await p.evaluate(() => {
    window.__open = null;
  });
  const o2 = await p.evaluate(() => window.say('put it on my other screen', { gesture: true }));
  assert.deepEqual([o2.status, o2.mode, o2.kind], ['opened', 'screen', 'hologram']);
  assert.deepEqual(await p.evaluate(() => window.ctl.list().map((s) => s.mode)), ['screen'], 'the floating panel closed: it moved');
  const back = await p.evaluate(() => window.say('bring it back', { source: 'voice' }));
  assert.deepEqual([back.status, back.count], ['closed', 1]);
  assert.deepEqual(await p.evaluate(() => window.__app.shownInApp), [{ kind: 'hologram', reason: 'handback', back: true }]);
  assert.deepEqual(await p.evaluate(() => window.ctl.list()), []);
});

test('closing: ambiguous words only while a screen is open; nothing open says so', async () => {
  const p = await page();
  assert.equal(await p.evaluate(() => window.say('close the window')), null, 'not ours: the in-app viewer may want it');
  const none = await p.evaluate(() => window.say('close the other screen'));
  assert.deepEqual([none.status, none.count], ['closed', 0]);
  await p.evaluate(() => window.say('open the report in a window', { gesture: true }));
  assert.deepEqual(await p.evaluate(() => window.ctl.list().map((s) => [s.mode, s.label])), [['window', 'WINDOW']]);
  assert.match((await p.evaluate(() => window.__opens.at(-1).features)), /^popup=1,left=\d+,top=\d+,width=\d+,height=\d+$/);
  const closed = await p.evaluate(() => window.say('close the window'));
  assert.deepEqual([closed.status, closed.count], ['closed', 1]);
});

test('no Window Management (Safari, Firefox): a window to drag across; no PiP: a window beside', async () => {
  const p = await page({ noWm: true, noPip: true });
  const o = await p.evaluate(() => window.say('put the hologram on my other screen', { gesture: true }));
  assert.deepEqual([o.status, o.mode, o.note], ['opened', 'window', 'no-wm']);
  const o2 = await p.evaluate(() => window.say('float the report', { gesture: true }));
  assert.deepEqual([o2.status, o2.mode, o2.reused], ['opened', 'window', true]);
});

test('links open as their own page, without a handle on Jarvis; the tool never needs a gesture to try', async () => {
  const p = await page();
  const o = await p.evaluate(() => window.say('open the link on my other screen', { gesture: true }));
  assert.deepEqual([o.status, o.mode, o.kind], ['opened', 'screen', 'link']);
  const last = await p.evaluate(() => window.__opens.at(-1));
  assert.equal(last.url, 'about:blank');
  // The tool: no gesture, popups allowed here: it opens.
  const t = await p.evaluate(async () => {
    const r = await window.ctl.openFromTool({ what: 'answer', where: 'window' });
    return [r.status, r.mode, r.kind];
  });
  assert.deepEqual(t, ['opened', 'window', 'answer']);
  // The tool with nothing to show: a clear message for Jarvis.
  const n = await p.evaluate(async () => (await window.ctl.openFromTool({ what: 'mission', where: 'beside' })).message);
  assert.match(n, /no mission in this conversation/);
});
