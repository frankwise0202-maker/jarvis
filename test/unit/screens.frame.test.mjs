// Screens (v7): the HUD frame's header in a screen window of any size, in real headless Chromium
// with the app's stylesheets. A screen window is maximized on another monitor, but "open it in a
// window" takes the right half of the screen (about 720px on a laptop) and the owner can drag any
// screen window down to the size of a floating panel: the buttons must stay inside the frame and in
// reach, nothing may be drawn over anything else, and the title must stay readable.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHarness, ROOT } from './platform.harness.test.mjs';

const CSS = ['tokens', 'base', 'hud', 'presence', 'screens', 'themes'].map((f) => fs.readFileSync(path.join(ROOT, 'src/styles', `${f}.css`), 'utf8')).join('\n');

let h;
before(async () => {
  h = await createHarness({ frame: 'src/ui/screens/frame.js' }, { statics: { '/fonts/': 'public/fonts' } });
});
after(async () => {
  if (h) await h.close();
});

async function frameAt(width, height, o) {
  const p = await h.newPage({ contextOptions: { viewport: { width, height } } });
  await p.addStyleTag({ content: CSS });
  await p.evaluate((opts) => {
    const { createScreenFrame } = window.__mods.frame;
    const noop = () => {};
    // A phone shows a screen full screen in the app: compact, with only a close button (controller.js).
    const frame = opts.inapp
      ? createScreenFrame({ label: 'SCREEN', kind: opts.kind, title: opts.title, where: 'inapp', compact: true, setDocumentTitle: false, onClose: noop })
      : createScreenFrame({ label: 'WINDOW', kind: opts.kind, title: opts.title, where: 'window', onBack: noop, onClose: noop, onFullscreen: noop });
    if (opts.detail) frame.setDetail(opts.detail);
    if (opts.status) frame.setStatus(opts.status, 'done');
    frame.setState('ready');
    if (opts.inapp) {
      const host = document.createElement('div');
      host.className = 'scr-inapp';
      host.append(frame.el);
      document.body.append(host);
    } else document.body.append(frame.el);
  }, o);
  await p.evaluate(() => document.fonts.ready);
  return p;
}

// Boxes of everything the header draws: the eyebrow's words (cut to the eyebrow when it clips
// them), the title, the clock, the status chip and the buttons.
function measure() {
  const box = (el) => {
    const b = el.getBoundingClientRect();
    return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
  };
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const eyebrow = document.querySelector('.scr__eyebrow');
  const clips = getComputedStyle(eyebrow).overflow !== 'visible';
  const eb = box(eyebrow);
  // The words as drawn: each leaf span's box, cut to the eyebrow's box when the eyebrow clips.
  const words = [...eyebrow.querySelectorAll('span')]
    .filter((el) => !el.children.length && shown(el) && el.textContent.trim())
    .map((el) => {
      const b = box(el);
      return { ...(clips ? { l: Math.max(b.l, eb.l), r: Math.min(b.r, eb.r), t: Math.max(b.t, eb.t), b: Math.min(b.b, eb.b) } : b), text: el.textContent.trim() };
    })
    .filter((b) => b.r - b.l > 0.5 && b.b - b.t > 0.5)
    .map((b) => ({ ...b, what: 'eyebrow' }));
  const title = document.querySelector('.scr__title');
  const parts = [...words, { ...box(title), what: 'title' }];
  for (const [sel, what] of [['.scr__clock', 'clock'], ['.scr__status', 'status']]) {
    const el = document.querySelector(sel);
    if (shown(el)) parts.push({ ...box(el), what });
  }
  const buttons = [...document.querySelectorAll('.scr__actions .scr__btn')].map((b) => ({ ...box(b), what: `button ${b.getAttribute('aria-label')}`, label: b.getAttribute('aria-label'), text: b.innerText.trim() }));
  return {
    vw: innerWidth,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    eyebrow: words.map((w) => w.text).join(' '),
    parts: [...parts, ...buttons],
    buttons,
    title: {
      w: title.getBoundingClientRect().width,
      text: title.textContent,
      cut: title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 1,
      lines: Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight)),
    },
  };
}

const overlaps = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;

const CASES = [
  { kind: 'mission', title: 'Three home battery systems', status: 'COMPLETE · 3/3' },
  { kind: 'hologram', title: '2024 Toyota Camry Hybrid (XV70)', detail: '43 PARTS' },
  { kind: 'answer', title: 'What does it cost to own one for five years?' },
];
// A second monitor; half a 1440px laptop screen ("open it in a window"); floating-panel sizes.
const SIZES = [
  [1440, 900],
  [720, 860],
  [460, 540],
  [420, 320],
];

test('screen windows of every size: the header keeps its buttons inside the frame, draws nothing over anything, and the title stays readable', async () => {
  for (const [width, height] of SIZES) {
    for (const c of CASES) {
      const p = await frameAt(width, height, c);
      const m = await p.evaluate(measure);
      const at = `${width}x${height} ${c.kind}`;
      assert.ok(m.overflow <= 0, `${at}: no sideways scroll (${m.overflow}px)`);
      assert.equal(m.buttons.length, 3, `${at}: Full screen, Bring back and Close`);
      for (const b of m.buttons) {
        assert.ok(b.l >= 10 && b.r <= m.vw - 10, `${at}: ${b.what} sits inside the frame (${Math.round(b.l)}–${Math.round(b.r)} of ${m.vw})`);
        assert.ok(b.w >= 36 && b.h >= 36, `${at}: ${b.what} is at least 36×36 (${Math.round(b.w)}×${Math.round(b.h)})`);
      }
      for (let i = 0; i < m.parts.length; i++) {
        for (let j = i + 1; j < m.parts.length; j++) {
          const [a, b] = [m.parts[i], m.parts[j]];
          if (a.what === b.what) continue;
          assert.ok(!overlaps(a, b), `${at}: the ${a.what} and the ${b.what} do not overlap`);
        }
      }
      assert.match(m.eyebrow, /^WINDOW · \S/, `${at}: the eyebrow starts with where and what ("${m.eyebrow}")`);
      assert.doesNotMatch(m.eyebrow, /·$/, `${at}: no "·" is left dangling ("${m.eyebrow}")`);
      if (width >= 1280) assert.equal(m.eyebrow, `WINDOW · ${c.kind === 'mission' ? 'MISSION CONTROL' : c.kind === 'answer' ? 'ANSWER' : 'HOLOGRAM'}${c.detail ? ` · ${c.detail}` : ''}`, `${at}: the whole eyebrow on a wide screen`);
      const room = Math.min(300, 0.6 * width);
      assert.ok(m.title.w >= room, `${at}: the title has room to be read (${Math.round(m.title.w)}px, wants ${Math.round(room)})`);
      const back = m.buttons.find((b) => /^Bring it back/.test(b.label));
      assert.equal(back.label, 'Bring it back to the main window', `${at}: Bring back keeps its name for assistive tech`);
      if (width >= 1280) assert.equal(back.text.toUpperCase(), 'BRING BACK', `${at}: a wide screen spells Bring back out`);
      assert.deepEqual(p.problems, [], `${at}: no page errors`);
      await p.context().close();
    }
  }
});

test('a phone shows a screen full screen in the app: the close button in reach, and the title on the whole width, on up to two lines', async () => {
  for (const [width, height] of [
    [390, 844],
    [375, 667],
    [320, 568],
  ]) {
    for (const c of [
      { kind: 'answer', title: 'What does a 2024 Camry Hybrid cost?' },
      { kind: 'hologram', title: '2024 Toyota Camry Hybrid (XV70)', detail: '43 PARTS' },
      { kind: 'mission', title: 'Compare the best family electric SUVs: range, price, safety and what owners say after a year', status: 'WORKING · 4 AGENTS' },
    ]) {
      const p = await frameAt(width, height, { ...c, inapp: true });
      const m = await p.evaluate(measure);
      const at = `${width}x${height} in the app, ${c.kind}`;
      assert.ok(m.overflow <= 0, `${at}: no sideways scroll`);
      assert.equal(m.buttons.length, 1, `${at}: only Close`);
      const [close] = m.buttons;
      assert.ok(close.l >= 5 && close.r <= width - 5 && close.w >= 36 && close.h >= 36, `${at}: Close is inside the frame and at least 36×36`);
      for (let i = 0; i < m.parts.length; i++) {
        for (let j = i + 1; j < m.parts.length; j++) {
          const [a, b] = [m.parts[i], m.parts[j]];
          if (a.what !== b.what) assert.ok(!overlaps(a, b), `${at}: the ${a.what} and the ${b.what} do not overlap`);
        }
      }
      assert.match(m.eyebrow, /^SCREEN · \S/, `${at}: the eyebrow ("${m.eyebrow}")`);
      assert.doesNotMatch(m.eyebrow, /·$/, `${at}: no "·" is left dangling`);
      assert.ok(m.title.w >= 0.85 * width, `${at}: the title has the whole width (${Math.round(m.title.w)}px)`);
      assert.ok(m.title.lines <= 2, `${at}: at most two lines (${m.title.lines})`);
      if (c.title.length <= 36) assert.ok(!m.title.cut, `${at}: "${c.title}" is shown whole`);
      assert.deepEqual(p.problems, [], `${at}: no page errors`);
      await p.context().close();
    }
  }
});
