// Windows (v8.1): several windows from the main-window controller (src/ui/screens/controller.js), in
// real headless Chromium with the browser stubbed: a 1440×900 laptop screen with Jarvis maximized on
// it (or a second monitor), window.open recorded, moveTo / resizeTo / focus recorded per window, and
// which window has the focus set by the test. Checks: one window per "in a window" (named by what it
// shows), at most four (a fifth takes the oldest one's place), room made beside Jarvis with a strip of
// him in view, page windows tracked, "bring the hologram back" / "close the camera window" acting on
// that one only (else the focused, else the newest), layouts, "this window", the front, and viewer
// commands sent to the window that shows the hologram.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './platform.harness.test.mjs';

let h;
before(async () => {
  h = await createHarness({ ctl: 'src/ui/screens/controller.js', panels: 'src/ui/screens/panels.js', frame: 'src/ui/screens/frame.js' });
});
after(async () => {
  if (h) await h.close();
});

function stubs(opts) {
  const o = opts || {};
  if (window.opener) return;
  const LAPTOP = { left: 0, top: 0, width: 1440, height: 900, availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875, isPrimary: true, isInternal: true, label: 'Built-in Retina Display' };
  const DELL = { left: 1440, top: 0, width: 2560, height: 1440, availLeft: 1440, availTop: 0, availWidth: 2560, availHeight: 1415, isPrimary: false, isInternal: false, label: 'DELL U2720Q' };
  const def = (obj, name, value) => Object.defineProperty(obj, name, { configurable: true, get: () => value });
  for (const [k, v] of Object.entries({ width: 1440, height: 900, availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875, isExtended: !!o.two })) def(window.screen, k, v);
  // Jarvis maximized on the laptop.
  for (const [k, v] of Object.entries({ screenX: 0, screenY: 25, screenLeft: 0, screenTop: 25, outerWidth: 1440, outerHeight: 875 })) def(window, k, v);
  window.__gesture = false;
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { get isActive() { return window.__gesture === true; }, hasBeenActive: true } });
  window.__opens = [];
  window.__moves = [];
  window.__focusCalls = [];
  window.__wins = {};
  window.__focus = 'main';
  const realOpen = window.open.bind(window);
  window.open = (url, name, features) => {
    window.__opens.push({ url: String(url), name: String(name || ''), features: String(features || '') });
    const w = realOpen(url, name, features);
    if (!w) return w;
    const n = String(name || '');
    window.__wins[n] = w;
    // Same-origin popups keep their window (and its realm) when the first page loads in them. Each
    // keeps its own place, as on a desktop: where it opened, then where it was moved.
    try {
      const f = Object.fromEntries(String(features || '').split(',').map((kv) => kv.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), Number(v)]));
      const geo = { left: f.left || 0, top: f.top || 0, width: f.width || 800, height: f.height || 600 };
      for (const [prop, key] of [['screenX', 'left'], ['screenLeft', 'left'], ['screenY', 'top'], ['screenTop', 'top'], ['outerWidth', 'width'], ['outerHeight', 'height']]) Object.defineProperty(w, prop, { configurable: true, get: () => geo[key] });
      w.moveTo = (x, y) => {
        window.__moves.push([n, 'move', x, y]);
        geo.left = x;
        geo.top = y;
      };
      w.resizeTo = (x, y) => {
        window.__moves.push([n, 'size', x, y]);
        geo.width = x;
        geo.height = y;
      };
      const focus = w.focus.bind(w);
      w.focus = () => {
        window.__focusCalls.push(n);
        focus();
      };
      w.Document.prototype.hasFocus = function hasFocus() {
        return window.__focus === n;
      };
    } catch {
      /* a page from another site */
    }
    return w;
  };
  const wm = { perm: o.two ? 'granted' : 'prompt', screens: o.two ? [LAPTOP, DELL] : [LAPTOP] };
  window.getScreenDetails = async () => ({ screens: wm.screens, currentScreen: wm.screens[0], addEventListener() {} });
  const q = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (d) => (d && /^window-(management|placement)$/.test(d.name) ? Promise.resolve({ state: wm.perm }) : q(d));
  if (o.noPip) {
    try {
      delete window.documentPictureInPicture;
    } catch {
      /* not configurable */
    }
    Object.defineProperty(window, 'documentPictureInPicture', { value: undefined, configurable: true, writable: true });
  } else {
    // A floating panel that needs a gesture, as Chrome's does (a same-origin popup stands in for it).
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
    { id: 'u1', role: 'user', text: 'Show me a laptop' },
    { id: 'j1', role: 'jarvis', status: 'done', missions: {}, segments: [{ id: 'h1', kind: 'hologram', status: 'done', title: 'Laptop', libraryId: 'lib_laptop0000', spec: { title: 'Laptop', parts: [{ id: 'bat', name: 'Battery' }, { id: 'fan', name: 'Cooling fan' }] } }] },
    { id: 'u2', role: 'user', text: 'Draw the hinge' },
    { id: 'j2', role: 'jarvis', status: 'done', missions: {}, segments: [{ id: 'b1', kind: 'blueprint', status: 'done', title: 'Hinge', libraryId: 'lib_hinge00000', spec: { title: 'Hinge', parts: [{ id: 'x', name: 'Pin' }] } }] },
    { id: 'u3', role: 'user', text: 'Research batteries' },
    { id: 'j3', role: 'jarvis', status: 'done', missions: { m1: { id: 'm1', title: 'Battery research', status: 'done', agents: [] } }, segments: [{ id: 's1', kind: 'mission', missionId: 'm1' }] },
    { id: 'u4', role: 'user', text: 'Which battery fits?' },
    { id: 'j4', role: 'jarvis', status: 'done', missions: {}, segments: [{ id: 't1', kind: 'text', text: 'The **45 Wh** one. See [the spec sheet](https://example.com/spec).' }] },
  ],
};

async function page(opts = {}) {
  const p = await h.newPage({ init: stubs, initArg: opts });
  await p.evaluate((conv) => {
    conv.turns[7].segments[0].text = conv.turns[7].segments[0].text.replace('https://example.com/spec', `${location.origin}/spec-sheet`);
    window.__app = { shownInApp: [], closedInApp: [] };
    window.ctl = window.__mods.ctl.createScreens({
      getConversation: () => conv,
      getLiveTurn: () => null,
      describeOpen: () => null,
      closeInApp: (t) => (window.__app.closedInApp.push(t.kind), true),
      showInApp: (t, o) => window.__app.shownInApp.push({ kind: t.kind, reason: o && o.reason }),
      getLibraryItem: async () => null,
      cameraLive: () => false,
      jarvisState: () => window.__jarvis || { core: 'idle', word: 'ONLINE', heard: '' },
    });
    const pick = (o) => o && { status: o.status, mode: o.mode || null, kind: o.kind || null, count: o.count, reused: !!o.reused, replaced: o.replaced ? o.replaced.kind : null, which: o.which || null };
    window.say = async (text) => {
      window.__gesture = true;
      const res = window.ctl.command(text, { source: 'typed' });
      if (!res) return null;
      return pick(await res.done);
    };
    window.win = async (action) => window.ctl.windowCommand(action, { source: 'voice' });
    window.kinds = () => window.ctl.list().map((s) => s.kind);
    window.nameOf = (kind) => `jarvis-${window.ctl.list().find((s) => s.kind === kind).id}`;
    window.focusOn = (kind) => {
      window.__focus = kind === 'main' ? 'main' : window.nameOf(kind);
    };
    window.acks = (o) => [window.__mods.ctl.screenAck(o), window.__mods.ctl.screenMessage(o)];
  }, CONV);
  return p;
}

test('D1: each "in a window" adds a window, named by what it shows; the second makes room (Jarvis\'s strip kept)', async () => {
  const p = await page();
  const one = await p.evaluate(() => window.say('put the camera in a window'));
  assert.deepEqual([one.status, one.mode, one.kind, one.reused], ['opened', 'window', 'camera', false]);
  const two = await p.evaluate(() => window.say('put the hologram in another window'));
  assert.deepEqual([two.status, two.mode, two.kind, two.reused], ['opened', 'window', 'hologram', false]);
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['camera', 'hologram']);
  const opens = await p.evaluate(() => window.__opens.map((x) => x.features));
  assert.deepEqual(opens, ['popup=1,left=720,top=25,width=720,height=875', 'popup=1,left=880,top=25,width=560,height=875'], 'the first on the right half; the second beside it');
  const moves = await p.evaluate(() => window.__moves.filter((m) => m[0] === window.nameOf('camera')).map((m) => m.slice(1)));
  assert.deepEqual(moves, [['move', 320, 25], ['size', 560, 875]], 'the camera window moved over: 320px of Jarvis stay in view');
  // The same thing again: that window, raised (no second camera window).
  const again = await p.evaluate(() => window.say('put the camera in another window'));
  assert.deepEqual([again.status, again.reused], ['opened', true]);
  assert.equal(await p.evaluate(() => window.__opens.length), 2);
  assert.deepEqual(await p.evaluate(() => window.acks({ status: 'opened', mode: 'window', kind: 'camera', reused: true, already: true })), ["It's already in its own window.", 'The camera is already in its own window.']);
  assert.deepEqual(p.problems, []);
});

test('D1: at most four; a fifth takes the oldest one\'s place, and Jarvis says so', async () => {
  const p = await page();
  for (const t of ['put the camera in a window', 'put the hologram in a window', 'put the blueprint in a window', 'put mission control in a window']) {
    const o = await p.evaluate((t) => window.say(t), t);
    assert.equal(o.status, 'opened', t);
  }
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['camera', 'hologram', 'blueprint', 'mission']);
  const fifth = await p.evaluate(() => window.say('put the answer in a window'));
  assert.deepEqual([fifth.status, fifth.reused, fifth.replaced, fifth.kind], ['opened', true, 'camera', 'answer']);
  assert.equal(await p.evaluate(() => window.__opens.length), 4, 'no fifth window: the oldest shows the answer');
  assert.deepEqual((await p.evaluate(() => window.kinds())).sort(), ['answer', 'blueprint', 'hologram', 'mission']);
  const [ack, msg] = await p.evaluate(() => window.acks({ status: 'opened', mode: 'window', kind: 'answer', reused: true, replaced: { kind: 'camera' } }));
  assert.equal(ack, "That's 4 windows, so it took the place of the camera window.");
  assert.match(msg, /4 windows are open, so it took the place of the camera window/);
});

test('D1: "bring the hologram back" and "close the camera window" act on that one only; else the focused, else the newest', async () => {
  const p = await page();
  await p.evaluate(() => window.say('put the camera in a window'));
  await p.evaluate(() => window.say('put the hologram in a window'));
  await p.evaluate(() => window.say('put the answer in a window'));
  const back = await p.evaluate(() => window.say('bring the hologram back'));
  assert.deepEqual([back.status, back.count, back.kind], ['closed', 1, 'hologram']);
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['camera', 'answer'], 'only the hologram window closed');
  assert.deepEqual(await p.evaluate(() => window.__app.shownInApp), [{ kind: 'hologram', reason: 'handback' }], 'and came back to the main window');
  const closed = await p.evaluate(async () => {
    const o = await window.win({ op: 'close', which: 'camera' });
    return [o.status, o.count, o.kind, ...window.acks(o)];
  });
  assert.deepEqual(closed, ['closed', 1, 'camera', 'Closed the camera window.', 'Closed the camera window.']);
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['answer']);
  const none = await p.evaluate(async () => {
    const o = await window.win({ op: 'close', which: 'hologram' });
    return [o.status, o.count, ...window.acks(o)];
  });
  assert.deepEqual(none, ['closed', 0, "There's no hologram window.", 'There’s no hologram window open.']);
  // Without a name: the window with the focus, else the newest.
  await p.evaluate(() => window.say('put the camera in a window'));
  await p.evaluate(() => window.focusOn('answer'));
  const plain = await p.evaluate(() => window.say('close the window'));
  assert.deepEqual([plain.status, plain.count, plain.kind], ['closed', 1, 'answer'], 'the focused one, though older');
  await p.evaluate(() => window.say('put the hologram in a window'));
  await p.evaluate(() => window.focusOn('main'));
  const newest = await p.evaluate(() => window.say('bring it back'));
  assert.deepEqual([newest.count, newest.kind], [1, 'hologram'], 'nothing focused: the newest');
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['camera']);
  // "Close all windows": every one.
  await p.evaluate(() => window.say('put the answer in a window'));
  const all = await p.evaluate(() => window.say('close all windows'));
  assert.deepEqual([all.status, all.count], ['closed', 2]);
  assert.deepEqual(await p.evaluate(() => window.kinds()), []);
});

test('D1: page windows are tracked: "close the page window" and "close everything" reach them', async () => {
  const p = await page();
  const o = await p.evaluate(() => window.say('open the link in a window'));
  assert.deepEqual([o.status, o.kind], ['opened', 'link']);
  const list = await p.evaluate(() => window.ctl.list().map((s) => [s.kind, s.external]));
  assert.deepEqual(list, [['link', true]]);
  assert.equal(await p.evaluate(() => window.__opens.at(-1).url), 'about:blank', 'opened blank, then sent to the page: no handle on Jarvis');
  await p.evaluate(() => window.say('put the camera in a window'));
  const closed = await p.evaluate(async () => (await window.win({ op: 'close', which: 'link' })).count);
  assert.equal(closed, 1);
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['camera']);
  await p.evaluate(() => window.say('open the link in a window'));
  const all = await p.evaluate(async () => {
    const o = await window.win({ op: 'close-all', viewers: true });
    return [o.status, o.count, o.viewers];
  });
  assert.deepEqual(all, ['closed', 2, true]);
});

test('D2: "side by side", "camera on the left, hologram on the right" (opening what isn\'t in a window yet)', async () => {
  const p = await page();
  const o = await p.evaluate(async () => {
    window.__gesture = true;
    const r = await window.win({ op: 'arrange', layout: 'left-right', a: 'camera', b: 'hologram' });
    return { ...r, lines: window.acks(r) };
  });
  assert.deepEqual([o.status, o.count, o.names, o.screen], ['arranged', 2, ['camera', 'hologram'], 'current']);
  assert.deepEqual(o.lines, ['Camera on the left, hologram on the right.', 'Camera on the left, hologram on the right.']);
  const last = await p.evaluate(() => {
    const out = {};
    for (const [n, kind, x, y] of window.__moves) out[`${n}:${kind}`] = [x, y];
    return { camera: [out[`${window.nameOf('camera')}:move`], out[`${window.nameOf('camera')}:size`]], hologram: [out[`${window.nameOf('hologram')}:move`], out[`${window.nameOf('hologram')}:size`]] };
  });
  assert.deepEqual(last, { camera: [[320, 25], [560, 875]], hologram: [[880, 25], [560, 875]] });
  // Swapped sides by name.
  const swapped = await p.evaluate(async () => (await window.win({ op: 'arrange', layout: 'left-right', a: 'hologram', b: 'camera' })).names);
  assert.deepEqual(swapped, ['hologram', 'camera']);
  assert.deepEqual(await p.evaluate(() => window.__moves.filter((m) => m[0] === window.nameOf('hologram') && m[1] === 'move').at(-1).slice(2)), [320, 25]);
  // Nothing in a window: said so.
  const empty = await (await page()).evaluate(async () => window.win({ op: 'arrange', layout: 'side-by-side' }));
  assert.deepEqual([empty.status, empty.message], ['nothing', 'There’s nothing in a window to arrange yet.']);
});

test('D2: with a second monitor (Window Management allowed), the layout goes there and Jarvis stays in full view', async () => {
  const p = await page({ two: true });
  await p.evaluate(() => window.say('put the camera in a window'));
  await p.evaluate(() => window.say('put the hologram in a window'));
  await p.evaluate(() => window.say('put the answer in a window'));
  const o = await p.evaluate(async () => {
    const r = await window.win({ op: 'arrange', layout: 'side-by-side' });
    return { ...r, lines: window.acks(r) };
  });
  assert.deepEqual([o.status, o.count, o.screen], ['arranged', 3, 'other']);
  assert.equal(o.lines[0], '3 windows, in a grid on your other screen.');
  const moves = await p.evaluate(() => window.__moves.filter((m) => m[1] === 'move').slice(-3).map((m) => m.slice(2)));
  assert.deepEqual(moves, [[1440, 0], [2720, 0], [1440, 707]], 'on the second monitor, in a grid');
});

test('D4: "do this in this window": the window with the focus, else the main one; "show the report here"', async () => {
  const p = await page();
  const main = await p.evaluate(async () => {
    const o = await window.win({ op: 'here' });
    return [o.status, o.where, ...window.acks(o)];
  });
  assert.deepEqual(main, ['here', 'main', 'Here, in the main window.', 'Working in the main window.'], 'no window open: the main one');
  await p.evaluate(() => window.say('put the camera in a window'));
  await p.evaluate(() => window.say('put the hologram in a window'));
  await p.evaluate(() => window.focusOn('camera'));
  const inCam = await p.evaluate(async () => {
    const o = await window.win({ op: 'here' });
    return [o.status, o.where, o.kind, ...window.acks(o)];
  });
  assert.deepEqual(inCam, ['here', 'window', 'camera', 'In the camera window.', 'Working in the camera window.']);
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['camera', 'hologram'], 'nothing moved');
  // "Show the report here" while the hologram window has the focus: the report goes there.
  await p.evaluate(() => window.focusOn('hologram'));
  const report = await p.evaluate(async () => {
    const o = await window.win({ op: 'here', which: 'answer' });
    return [o.status, o.where, o.kind, o.moved, window.__mods.ctl.screenAck(o)];
  });
  assert.deepEqual(report, ['here', 'window', 'answer', true, 'Here, in the answer window.']);
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['camera', 'answer']);
  // Back in the main window: "show it here" brings back the window we were working in.
  await p.evaluate(() => window.focusOn('main'));
  const back = await p.evaluate(async () => {
    const o = await window.win({ op: 'here' });
    return [o.where, o.moved, o.kind, window.__mods.ctl.screenAck(o)];
  });
  assert.deepEqual(back, ['main', true, 'answer', "It's back here, in the main window."]);
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['camera']);
});

test('"show me the hologram window": raised; D3: viewer commands go to the window that shows the hologram', async () => {
  const p = await page();
  await p.evaluate(() => window.say('put the hologram in a window'));
  await p.evaluate(() => window.say('put the camera in a window'));
  const front = await p.evaluate(async () => {
    window.__focusCalls = [];
    const o = await window.win({ op: 'focus', which: 'hologram' });
    return [o.status, window.__mods.ctl.screenAck(o), window.__focusCalls];
  });
  assert.deepEqual(front.slice(0, 2), ['focused', "Here's the hologram window."]);
  assert.deepEqual(front[2], [await p.evaluate(() => window.nameOf('hologram'))]);
  const sent = await p.evaluate(async () => {
    const got = [];
    const ch = new BroadcastChannel('jarvis-screens');
    ch.onmessage = (e) => e.data && e.data.t === 'command' && got.push(e.data);
    const id = window.ctl.list().find((s) => s.kind === 'hologram').id;
    // The window says its parts and selection (as the screen page does).
    new BroadcastChannel('jarvis-screens').postMessage({ t: 'state', screen: id, parts: [{ id: 'bat', name: 'Battery' }, { id: 'fan', name: 'Cooling fan' }], selected: 'fan' });
    await new Promise((r) => setTimeout(r, 100));
    const shown = window.ctl.shown('hologram');
    const a = window.ctl.commandIn('hologram', { action: 'explode' });
    const b = window.ctl.commandIn('hologram', { action: 'isolate' }); // "isolate it": the part selected there
    const none = window.ctl.commandIn('blueprint', { action: 'explode' });
    const photos = window.ctl.commandIn('hologram', { action: 'photos', partId: 'bat' });
    await new Promise((r) => setTimeout(r, 100));
    ch.close();
    return { shown: { label: shown.label, parts: shown.parts.map((x) => x.id), selected: shown.selected }, a: a && a.handled, b: b && b.command.partId, none, photos, got: got.map((m) => [m.screen === id, m.command.action, m.command.partId || null]) };
  });
  assert.deepEqual(sent.shown, { label: 'WINDOW', parts: ['bat', 'fan'], selected: 'fan' });
  assert.equal(sent.a, true);
  assert.equal(sent.b, 'fan');
  assert.equal(sent.none, null, 'no window shows a blueprint: the app opens it in the main window');
  assert.equal(sent.photos, null, 'photos need the main window\'s viewer');
  assert.deepEqual(sent.got, [[true, 'explode', null], [true, 'isolate', 'fan']]);
  // "Close it" for the hologram in a window closes that window.
  const closed = await p.evaluate(() => window.ctl.commandIn('hologram', { action: 'close' }));
  assert.equal(closed.closed, true);
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['camera']);
});

test('a page beside Jarvis: openPage at a rect, tracked; besideRect keeps his strip', async () => {
  const p = await page();
  const rect = await p.evaluate(() => window.ctl.besideRect());
  assert.deepEqual(rect, { left: 720, top: 25, width: 720, height: 875 });
  const o = await p.evaluate(async (rect) => {
    const r = await window.ctl.openPage(`${location.origin}/spec-sheet`, { title: 'Spec sheet', rect, button: 'Open in Chrome' }, { source: 'voice' });
    return [r.status, r.mode, r.kind];
  }, rect);
  assert.deepEqual(o, ['opened', 'window', 'link']);
  const last = await p.evaluate(() => window.__opens.at(-1));
  assert.deepEqual([last.url, last.features], ['about:blank', 'popup=1,left=720,top=25,width=720,height=875']);
  assert.deepEqual(await p.evaluate(() => window.ctl.list().map((s) => [s.kind, s.external])), [['link', true]]);
  // The same page again: raised, not opened twice.
  const again = await p.evaluate(async (rect) => (await window.ctl.openPage(`${location.origin}/spec-sheet`, { rect })).reused, rect);
  assert.equal(again, true);
  assert.equal(await p.evaluate(() => window.__opens.length), 1);
  assert.deepEqual(p.problems, []);
});

test('D3, the window\'s side: the hologram panel runs the viewer\'s commands (queued until its 3D view is ready) and reports its parts and selection', async () => {
  const p = await h.newPage();
  const out = await p.evaluate(async () => {
    const frame = window.__mods.frame.createScreenFrame({ win: window, label: 'WINDOW', kind: 'hologram', where: 'window' });
    document.body.append(frame.el);
    const calls = [];
    const states = [];
    let opts = null;
    let release;
    const loaded = new Promise((r) => {
      release = r;
    });
    const rec = (name) => (...args) => {
      calls.push([name, ...args]);
      return true;
    };
    const holo = { explode: rec('explode'), setLabels: rec('setLabels'), select: rec('select'), focus: rec('focus'), isolate: rec('isolate'), setView: rec('setView'), zoom: rec('zoom'), autoRotate: rec('autoRotate'), resetView: rec('resetView'), setSpec: () => ({ ok: true }), updateSpec() {}, getState: () => ({ ready: true }), dispose() {} };
    const panel = window.__mods.panels.createScreenPanel('hologram', {
      win: window,
      frame,
      deps: {
        loadHologram: async () => {
          await loaded;
          return { createHologram: (stage, o) => ((opts = o), holo) };
        },
        onState: (st) => states.push(st),
      },
    });
    frame.body.append(panel.el);
    const early = panel.command({ action: 'explode' }); // the 3D view is still loading: it waits
    panel.update({ spec: { title: 'Laptop', parts: [{ id: 'bat', name: 'Battery', aka: ['cell'] }, { id: 'fan', name: 'Cooling fan' }] }, status: 'done' });
    release();
    for (let i = 0; i < 50 && !calls.length; i++) await new Promise((r) => setTimeout(r, 10));
    const words = [
      panel.command({ action: 'view', view: 'front' }),
      panel.command({ action: 'isolate', partId: 'bat', partName: 'Battery' }),
      panel.command({ action: 'labels-off' }),
      panel.command({ action: 'show-all' }),
      panel.command({ action: 'photos', partId: 'bat' }),
      panel.command(null),
    ];
    opts.onSelect('fan', { name: 'Cooling fan', info: '' });
    return { early, calls, words, states, selected: panel.el.dataset.selected };
  });
  assert.equal(out.early, '', 'nothing to say yet: it runs once the view is ready');
  assert.deepEqual(out.calls, [['explode', 1], ['setView', 'front'], ['isolate', 'bat'], ['setLabels', false], ['isolate', null]]);
  assert.deepEqual(out.words, ['Front view', 'Isolated · Battery', 'Labels off', 'Showing every part', '', '']);
  assert.deepEqual(out.states, [{ parts: [{ id: 'bat', name: 'Battery', aka: ['cell'] }, { id: 'fan', name: 'Cooling fan', aka: [] }] }, { selected: 'fan' }]);
  assert.equal(out.selected, 'fan');
  assert.deepEqual(p.problems, []);
});

test('D5: swap two windows\' places; bigger, smaller, "fill the screen" (Jarvis\'s strip kept); a floating panel says to drag its corner', async () => {
  const p = await page();
  await p.evaluate(() => window.say('put the camera in a window'));
  await p.evaluate(() => window.say('put the hologram in a window'));
  const last = (kind) => p.evaluate((kind) => {
    const n = window.nameOf(kind);
    const moves = window.__moves.filter((m) => m[0] === n);
    const mv = moves.filter((m) => m[1] === 'move').at(-1);
    const sz = moves.filter((m) => m[1] === 'size').at(-1);
    return [mv[2], mv[3], sz[2], sz[3]];
  }, kind);
  const swap = await p.evaluate(async () => {
    const o = await window.win({ op: 'swap' });
    return [o.status, window.__mods.ctl.screenAck(o)];
  });
  assert.deepEqual(swap, ['swapped', 'Swapped.']);
  assert.deepEqual(await last('camera'), [880, 25, 560, 875]);
  assert.deepEqual(await last('hologram'), [320, 25, 560, 875]);
  const fill = await p.evaluate(async () => {
    const o = await window.win({ op: 'size', size: 'fill', which: 'camera' });
    return [o.status, window.__mods.ctl.screenAck(o)];
  });
  assert.deepEqual(fill, ['sized', 'It fills the screen beside me.']);
  assert.deepEqual(await last('camera'), [320, 25, 1120, 875], 'all of the screen but his strip');
  await p.evaluate(() => window.win({ op: 'size', size: 'smaller', which: 'camera' }));
  assert.deepEqual(await last('camera'), [432, 113, 896, 700]);
  await p.evaluate(() => window.win({ op: 'size', size: 'bigger', which: 'camera' }));
  assert.deepEqual(await last('camera'), [320, 25, 1120, 875], 'back to its widest, never over the strip');
  const none = await p.evaluate(async () => {
    const o = await window.win({ op: 'size', size: 'bigger', which: 'blueprint' });
    return window.__mods.ctl.screenAck(o);
  });
  assert.equal(none, "There's no blueprint window.");
});

test('D5: a floating panel can\'t be resized by script, and a page can\'t be moved: Jarvis says so', async () => {
  const p = await page();
  await p.evaluate(() => window.say('float the hologram'));
  const pip = await p.evaluate(async () => (await window.win({ op: 'size', size: 'bigger', which: 'hologram' })).message);
  assert.equal(pip, 'Drag its corner; I can’t resize floating panels. Say “put it in a window” for one I can.');
  await p.evaluate(() => window.say('open the link in a window'));
  const page2 = await p.evaluate(async () => (await window.win({ op: 'size', size: 'fill', which: 'link' })).message);
  assert.equal(page2, 'I can’t move a page from another site. Close it and open it again where you want it.');
});

test('D6: "float yourself": one tap opens Jarvis on top (his core, the state word, the words heard); he takes a floating hologram\'s place, and says so', async () => {
  const p = await page();
  const first = await p.evaluate(async () => {
    window.__gesture = false;
    const o = await window.win({ op: 'float-jarvis' });
    return [o.status, o.button];
  });
  assert.deepEqual(first, ['needs_tap', 'Float Jarvis'], 'a floating panel needs a tap (Chrome\'s rule)');
  await p.evaluate(() => document.querySelector('[data-testid="screens-tap-button"]').addEventListener('click', () => (window.__gesture = true), { capture: true }));
  await p.click('[data-testid="screens-tap-button"]');
  await p.waitForFunction(() => window.ctl.list().some((s) => s.kind === 'jarvis' && s.mode === 'pip'));
  assert.deepEqual(await p.evaluate(() => window.__pipSize), { width: 300, height: 260 });
  const shown = () => p.evaluate(() => {
    const d = window.documentPictureInPicture.window.document;
    const el = d.querySelector('[data-testid="float-jarvis"]');
    return el && { state: el.dataset.state, word: d.querySelector('[data-testid="float-jarvis-word"]').textContent, heard: d.querySelector('[data-testid="float-jarvis-heard"]').textContent, eyebrow: d.querySelector('.scr__eyebrow').textContent };
  });
  assert.deepEqual(await shown(), { state: 'idle', word: 'ONLINE', heard: '', eyebrow: 'FLOAT·JARVIS' });
  await p.evaluate(() => {
    window.__jarvis = { core: 'listening', word: 'LISTENING', heard: 'what time is it' };
  });
  await p.waitForFunction(() => window.documentPictureInPicture.window.document.querySelector('[data-testid="float-jarvis"]').dataset.state === 'listening');
  assert.deepEqual(await shown(), { state: 'listening', word: 'LISTENING', heard: '“what time is it”', eyebrow: 'FLOAT·JARVIS' });
  const again = await p.evaluate(async () => window.__mods.ctl.screenAck(await window.win({ op: 'float-jarvis' })));
  assert.equal(again, "I'm already floating.");
  // A floating hologram: Jarvis takes its place (no new panel, no tap), and says so.
  await p.evaluate(() => window.say('float the hologram'));
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['hologram']);
  const replaced = await p.evaluate(async () => {
    window.__gesture = false;
    const o = await window.win({ op: 'float-jarvis' });
    return [o.status, o.replaced && o.replaced.kind, window.__mods.ctl.screenAck(o)];
  });
  assert.deepEqual(replaced, ['opened', 'hologram', "I'm floating beside you, in place of the hologram."]);
  assert.deepEqual(await p.evaluate(() => window.kinds()), ['jarvis']);
});

test('D6: no floating panels in this browser: Jarvis says he can\'t', async () => {
  const p = await page({ noPip: true });
  const o = await p.evaluate(async () => (await window.win({ op: 'float-jarvis' })).message);
  assert.equal(o, 'This browser can’t float me. Chrome on a computer can.');
});
