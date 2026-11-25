#!/usr/bin/env node
// The remote view: screenshots and layout checks of the dashboard as the owner's iPhone, iPad and
// Mac see it through Tailscale (https://<machine>.<tailnet>.ts.net/), against the real Core in
// fixture mode. The browser resolves the fixture's tailnet name to this computer and every request
// carries the header Tailscale serve adds (Tailscale-User-Login), so the page is a remote viewer
// exactly as on the phone: no night dim, no pixel shift, no hidden cursor, no typing anywhere.
//
//   node core/dashboard/test/phone-screenshots.mjs [--out DIR] [--only ok,night] [--sizes iphone-13,ipad]
//
// Sizes (--sizes takes the keys; SIZES below): iPhones upright (320×568, 375×667, 390×844 with the
// notch and the home bar) and on their sides (844×390 with the notch, 667×375, 568×320), the iPad
// (820×1180) and the iPad Pro on its side (1366×1024), windows of 500×800 and 640×900, laptops at
// 1280×800 and 1440×900, the Mac's Chrome on those screens (712, 812 and, with the bookmarks bar,
// 789 tall) and the smallest kiosk-layout window (1366×740). States: ok, warn, alert, nogpu,
// internet (the Core's `offline` fixture: the internet is down), offline (the Core itself stops),
// night (23:31). Each shot is saved twice: the first screen (<state>-<size>.png) and the whole page
// (<state>-<size>-full.png).
//
// Checks, at every size: no sideways scrolling and nothing past the screen's edges, no overlapping
// panels or readouts, no text cut off or spilling out of its box (also with the longest values the
// panels can show), no caption line ending on its separator dot, text at 12 px or more and
// sentences at 14 px or more, 44 px touch targets, a question box at 16 px (iOS zooms the page into
// a smaller one) whose hint fits or ends in "…", the state word inside the core's heart, the whole
// core on the first screen (and a one-line top bar on a phone on its side), the newest answer
// starting inside the transcript, a transcript and a log that reach their first and last rows (by
// the mouse wheel where there is a mouse), and none of the kiosk's own behaviour. A window big
// enough for the kiosk layout gets the kiosk's checks instead (one screen, no scrolling, nothing
// cut off), plus the transcript and log checks and, on a touch screen, the 44 px targets and the
// 16 px box. One Chromium at a time; run under nice.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutProblems, loadPlaywright, longTextProblems, startRealCore } from './screenshots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TAILNET_NAME = 'alienware.tail4e5f6a.ts.net'; // the fixtures' machine (core/fixtures/tailscale)
const LOGIN = 'frank@example.com';
const SIM_START = '2026-11-25T21:47:00';
const NIGHT_START = '2026-11-25T23:31:00';

export const SIZES = {
  'iphone-se1': { w: 320, h: 568, touch: true, dpr: 2, label: 'iPhone SE (1st gen) 320×568' },
  'iphone-se': { w: 375, h: 667, touch: true, dpr: 2, label: 'iPhone SE 375×667' },
  // The notch and the home bar (viewport-fit=cover): what env(safe-area-inset-*) reports on an iPhone 13.
  'iphone-13': { w: 390, h: 844, touch: true, dpr: 2, label: 'iPhone 13 390×844', insets: { top: 47, bottom: 34 } },
  'iphone-13-side': { w: 844, h: 390, touch: true, dpr: 2, label: 'iPhone 13 on its side 844×390', insets: { left: 47, right: 47, bottom: 21 } },
  'iphone-se-side': { w: 667, h: 375, touch: true, dpr: 2, label: 'iPhone SE on its side 667×375' },
  'iphone-se1-side': { w: 568, h: 320, touch: true, dpr: 2, label: 'iPhone SE (1st gen) on its side 568×320 (the smallest core)' },
  'window-640': { w: 640, h: 900, touch: false, dpr: 1, label: 'a 640 px window (two columns, the smallest core)' },
  ipad: { w: 820, h: 1180, touch: true, dpr: 2, label: 'iPad Air 820×1180' },
  'laptop-1280': { w: 1280, h: 800, touch: false, dpr: 1, label: 'laptop window 1280×800' },
  'mac-chrome-1280': { w: 1280, h: 712, touch: false, dpr: 1, label: "the Mac's Chrome on a 1280×800 screen (712 tall inside)" },
  'laptop-1440': { w: 1440, h: 900, touch: false, dpr: 1, label: 'laptop window 1440×900' },
  'mac-chrome-1440': { w: 1440, h: 812, touch: false, dpr: 1, label: "the Mac's Chrome on a 1440×900 screen (812 tall inside)" },
  'mac-chrome-1440-bar': { w: 1440, h: 789, touch: false, dpr: 1, label: "the Mac's Chrome with its bookmarks bar on a 1440×900 screen (789 tall inside)" },
  'window-1366': { w: 1366, h: 740, touch: false, dpr: 1, label: 'the smallest window that gets the kiosk layout 1366×740' },
  'window-500': { w: 500, h: 800, touch: false, dpr: 1, label: 'a window dragged narrow, or an iPad in Split View 500×800' },
  'ipad-pro-side': { w: 1366, h: 1024, touch: true, dpr: 1, label: 'iPad Pro 12.9" on its side 1366×1024 (the kiosk layout)' },
};
const STATES = ['ok', 'warn', 'alert', 'nogpu', 'internet', 'offline', 'night'];
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

function parseArgs(argv) {
  const o = { out: path.join(HERE, 'artifacts', 'phone'), only: null, sizes: Object.keys(SIZES) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--out') o.out = path.resolve(next());
    else if (a === '--only') o.only = next().split(',');
    else if (a === '--sizes') o.sizes = next().split(',');
    else throw new Error(`unknown option ${a}`);
  }
  for (const k of o.sizes) if (!SIZES[k]) throw new Error(`unknown size ${k} (${Object.keys(SIZES).join(', ')})`);
  return o;
}

/** Which layout the page chose: the kiosk's (corner readouts) or the remote view's (compact core). */
function layoutOf(page) {
  return page.evaluate(() => {
    const compact = getComputedStyle(document.getElementById('core-canvas')).getPropertyValue('--orb-layout').trim() === 'compact';
    if (!compact) return 'kiosk';
    return getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length > 1 ? 'two-column' : 'one-column';
  });
}

/** The remote view's checks, run in the page. `insets`: the notch and home bar, as on the phone. */
export function remoteProblems(page, insets = {}) {
  return page.evaluate((insets) => {
    const out = [];
    const W = document.documentElement.clientWidth;
    const safe = { top: insets.top || 0, right: insets.right || 0, bottom: insets.bottom || 0, left: insets.left || 0 };
    const desc = (el) => `${el.id ? `#${el.id}` : el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;
    const shown = (el) => {
      if (el.closest('[hidden]')) return false;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const ownText = (el) => [...el.childNodes].some((c) => c.nodeType === 3 && c.data.trim());

    // Sideways: the page never scrolls sideways and nothing reaches past either edge.
    const se = document.scrollingElement;
    if (se.scrollWidth > W) out.push(`page scrolls sideways (${se.scrollWidth} > ${W})`);
    const past = new Set();
    for (const el of document.querySelectorAll('.stage *')) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= W + 0.5 && r.left >= -0.5) continue;
      let p = el.parentElement;
      let reported = false;
      while (p) {
        if (past.has(p)) reported = true;
        p = p.parentElement;
      }
      past.add(el);
      if (!reported) out.push(`${desc(el)} reaches past the ${r.right > W + 0.5 ? 'right' : 'left'} edge (${Math.round(r.left)}..${Math.round(r.right)} of ${W})`);
    }

    // Overlaps: panels, the orb, the readouts, the summary, the banner and the top bar's pieces.
    const blocks = [
      ...document.querySelectorAll('.panel, .core-orb, .gauge-readout, .core-summary, .offline-banner, .state-chip, .clock-block, .brand-host, .readout-block, .open-jarvis, .brand-word, .brand-orb'),
    ].filter(shown);
    const rects = blocks.map((el) => [el, el.getBoundingClientRect()]);
    // Nothing under the notch or the rounded corners: every block inside the safe area, and at the
    // top of the page nothing under the status bar.
    for (const [el, r] of rects) {
      if (r.left < safe.left - 0.5 || r.right > W - safe.right + 0.5) out.push(`${desc(el)} is under the notch (${Math.round(r.left)}..${Math.round(r.right)}, safe ${safe.left}..${W - safe.right})`);
      if (r.top + window.scrollY < safe.top - 0.5) out.push(`${desc(el)} is under the status bar (top ${Math.round(r.top + window.scrollY)} < ${safe.top})`);
    }
    const lastBlock = document.querySelector('.stage').getBoundingClientRect();
    const stagePad = parseFloat(getComputedStyle(document.querySelector('.stage')).paddingBottom);
    if (stagePad < safe.bottom - 0.5) out.push(`the page ends under the home bar (${stagePad}px of room, ${safe.bottom} needed)`);
    void lastBlock;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [a, ra] = rects[i];
        const [b, rb] = rects[j];
        if (a.contains(b) || b.contains(a)) continue;
        const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (x > 1 && y > 1) out.push(`${desc(a)} overlaps ${desc(b)} (${Math.round(x)}×${Math.round(y)} px)`);
      }
    }
    // Inside any box: no two pieces side by side run into each other (a readout's name and its
    // flag, a panel's title and its chip, a figure and the next). Text is measured where it is
    // drawn, so a word spilling out of a squeezed box counts.
    const drawn = (el) => {
      const r = el.getBoundingClientRect();
      if (!ownText(el)) return r;
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      return { left: Math.min(r.left, t.left), right: Math.max(r.right, t.right), top: Math.min(r.top, t.top), bottom: Math.max(r.bottom, t.bottom) };
    };
    const seen = new Set();
    for (const parent of document.querySelectorAll('.stage, .stage *')) {
      const kids = [...parent.children].filter((k) => shown(k) && !['absolute', 'fixed'].includes(getComputedStyle(k).position) && k.tagName !== 'CANVAS' && !k.classList.contains('hud-sr'));
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const ra = drawn(kids[i]);
          const rb = drawn(kids[j]);
          const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          const key = `${desc(kids[i])}|${desc(kids[j])}`;
          if (x > 1 && y > 1 && !seen.has(key)) {
            seen.add(key);
            out.push(`${desc(kids[i])} runs into ${desc(kids[j])} (${Math.round(x)}×${Math.round(y)} px)`);
          }
        }
      }
    }
    // The state word sits inside the heart, and the readouts never cover the orb.
    const label = document.getElementById('core-label').getBoundingClientRect();
    const orb = document.querySelector('.core-orb').getBoundingClientRect();
    if (label.left < orb.left - 1 || label.right > orb.right + 1 || label.top < orb.top - 1 || label.bottom > orb.bottom + 1) out.push('the state word leaves the core');
    const heart = 2 * 0.34 * window.__jarvisCore.stats().orb.R; // the dark disc the word sits on
    if (label.width > heart + 1) out.push(`the state word (${Math.round(label.width)} px) is wider than the core's heart (${Math.round(heart)} px)`);
    // The first screen shows the whole core (the page is read from the top, scrolled to 0), and a
    // phone on its side (under 431 px tall) keeps the top bar to one line so the core fits under it.
    const orbBottom = orb.bottom + window.scrollY;
    if (orbBottom > innerHeight - safe.bottom + 1) out.push(`the core ends ${Math.round(orbBottom - (innerHeight - safe.bottom))} px below the first screen`);
    if (innerHeight < 431) {
      const bar = [...document.querySelectorAll('.topbar > *, .topbar .brand > *, .topbar .topbar-right > *')].filter((n) => shown(n) && getComputedStyle(n).display !== 'contents');
      const tops = bar.map((n) => n.getBoundingClientRect());
      const first = Math.min(...tops.map((r) => r.bottom));
      const below = bar.filter((n, i) => tops[i].top >= first - 1);
      if (below.length) out.push(`the top bar takes two lines on a screen ${innerHeight} px tall (${below.map(desc).join(', ')} on the second)`);
    }

    // Text: nothing cut off or spilling out of its box; sizes.
    const BODY = '.ev-text, .msg, .ask-hello, .proc-name, .svc-name, .core-summary, .missing-text, .disk-note, .events-empty, .offline-text, .toast';
    let smallest = Infinity;
    for (const el of document.querySelectorAll('.stage *, .toast')) {
      if (!ownText(el) || !shown(el) || el.closest('.hud-sr')) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      smallest = Math.min(smallest, fs);
      if (fs < 12 - 0.01) out.push(`text below 12 px: ${desc(el)} "${el.textContent.trim().slice(0, 30)}" (${fs}px)`);
      if (el.matches(BODY) && fs < 14 - 0.01) out.push(`sentence below 14 px: ${desc(el)} (${fs}px)`);
      if (cs.display !== 'inline' && el.clientWidth === 0) out.push(`text squeezed to nothing: ${desc(el)} "${el.textContent.trim().slice(0, 40)}"`);
      else if (cs.display !== 'inline') {
        if (el.scrollWidth > el.clientWidth + 1) out.push(`text cut or spilling sideways: ${desc(el)} "${el.textContent.trim().slice(0, 40)}" (${el.scrollWidth} > ${el.clientWidth})`);
        // A one-line value with a tight line height overflows its line box by a few pixels of empty
        // ascent and descent; only text that wraps can lose a line.
        const clipsY = (cs.overflowY !== 'visible' || cs.webkitLineClamp !== 'none') && cs.whiteSpace !== 'nowrap';
        if (clipsY && el.scrollHeight > el.clientHeight + 1) out.push(`text cut at the bottom: ${desc(el)} "${el.textContent.trim().slice(0, 40)}"`);
      } else if (cs.display === 'inline') {
        const box = el.parentElement.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        if (r.right > box.right + 1 || r.left < box.left - 1) out.push(`text spills out of its box: ${desc(el)} "${el.textContent.trim().slice(0, 40)}"`);
      }
    }

    // Touch targets and the question box.
    for (const el of document.querySelectorAll('.ask-chip, .ask-send, .ask-input, .open-jarvis')) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 44 - 0.5 || r.width < 44 - 0.5) out.push(`touch target under 44 px: ${desc(el)} (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
    const inputFs = parseFloat(getComputedStyle(document.getElementById('ask-input')).fontSize);
    if (inputFs < 16) out.push(`the question box is ${inputFs}px (iOS zooms the page into fields under 16 px)`);
    return { problems: out, smallest };
  }, insets);
}

/** Where a caption wraps, its separator dot goes down with the value after it, never ends a line. */
export function separatorProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.querySelector('.stage'), NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const s = t.data;
      const el = t.parentElement;
      if (!s.includes('·') || !el.getClientRects().length || el.closest('[hidden], .hud-sr')) continue;
      for (let i = s.indexOf('·'); i !== -1; i = s.indexOf('·', i + 1)) {
        let j = i + 1;
        while (j < s.length && /\s/.test(s[j])) j++;
        if (j >= s.length) continue;
        range.setStart(t, i);
        range.setEnd(t, i + 1);
        const dot = range.getBoundingClientRect();
        range.setStart(t, j);
        range.setEnd(t, j + 1);
        const next = range.getBoundingClientRect();
        if (dot.height && next.top > dot.bottom - 2) out.push(`a line ends with its separator: #${el.id || el.className} "${s.slice(Math.max(0, i - 14), i + 1)}" / "${s.slice(j, j + 16)}"`);
      }
    }
    return out;
  });
}

/** The question box's hint fits in the box, or ends in "…" where it does not (never cut mid-letter). */
export function placeholderProblems(page) {
  return page.evaluate(() => {
    const box = document.getElementById('ask-input');
    const cs = getComputedStyle(box);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const need = ctx.measureText(box.placeholder).width;
    const room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (need > room + 1 && cs.textOverflow !== 'ellipsis') return [`the question box's hint "${box.placeholder}" is cut (${Math.round(need)} px in ${Math.round(room)} px, no ellipsis)`];
    return [];
  });
}

/**
 * The owner can read the whole conversation and the whole log (run once an answer is in). The
 * newest answer starts inside the transcript, below its faded top edge; nothing above it is out of
 * reach (a box that keeps only its newest lines and cannot scroll loses the start of the answer);
 * and a transcript or a log longer than its box scrolls, by the mouse wheel where there is a mouse
 * (`wheel`), as far as the oldest row, which ends clear of the log's faded bottom edge.
 */
export async function talkProblems(page, { wheel = false } = {}) {
  const geometry = () =>
    page.evaluate(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const fadeOf = (cs) => ((cs.maskImage || cs.webkitMaskImage || 'none') !== 'none' ? 1.5 * rem : 0);
      const box = (id) => {
        const n = document.getElementById(id);
        const cs = getComputedStyle(n);
        const r = n.getBoundingClientRect();
        const kids = [...n.children].filter((k) => k.getClientRects().length);
        const first = kids[0]?.getBoundingClientRect();
        const last = kids[kids.length - 1]?.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          fade: fadeOf(cs),
          scrolls: cs.overflowY === 'auto' || cs.overflowY === 'scroll',
          overflowY: cs.overflowY,
          over: n.scrollHeight - n.clientHeight,
          scrollTop: n.scrollTop,
          rows: kids.length,
          firstTop: first ? first.top : null,
          lastBottom: last ? last.bottom : null,
          readable: kids.filter((k) => {
            const b = k.getBoundingClientRect();
            return b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
          }).length,
        };
      };
      const t = box('transcript');
      const answers = document.querySelectorAll('#transcript .msg-core:not(.is-pending)');
      const ans = answers[answers.length - 1];
      if (ans) {
        const a = ans.getBoundingClientRect();
        t.answer = { top: a.top, bottom: a.bottom, line: parseFloat(getComputedStyle(ans).lineHeight) || 20, text: ans.textContent.trim().slice(0, 60) };
      }
      return { t, log: box('events') };
    });
  const out = [];
  const { t, log } = await geometry();
  if (t.answer) {
    const hidden = t.top + t.fade - t.answer.top;
    if (hidden > 1) out.push(`the newest answer starts ${Math.round(hidden)} px above the transcript's readable area ("${t.answer.text}…")`);
    if (t.answer.top + t.answer.line > t.bottom + 1) out.push('the newest answer starts below the transcript');
  }
  // Out of reach: content above the box's top at its scroll origin, or past its end with no scrolling.
  const reach = (name, b) => {
    if (b.firstTop !== null && b.firstTop < b.top - 1 && b.scrollTop === 0) out.push(`the ${name}'s first ${Math.round(b.top - b.firstTop)} px are out of reach above its top (overflow-y ${b.overflowY}; no scrolling goes there)`);
    if (b.over > 1 && !b.scrolls) out.push(`the ${name} is ${b.over} px taller than its box and cannot be scrolled (overflow-y ${b.overflowY}; ${b.readable} of ${b.rows} rows readable)`);
  };
  reach('transcript', t);
  reach('event log', log);
  const centre = async (id) => {
    const b = await page.locator(`#${id}`).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  };
  if (log.rows && log.scrolls && log.over > 1) {
    // Scroll the log to its end (with the wheel where there is a mouse) and read the oldest row.
    if (wheel) {
      await centre('events');
      await page.mouse.wheel(0, 5000);
      await page.waitForTimeout(500);
    } else await page.evaluate(() => (document.getElementById('events').scrollTop = 1e6));
    const end = (await geometry()).log;
    if (end.lastBottom > end.bottom - end.fade + 1) out.push(`the event log's oldest row stays ${Math.round(end.lastBottom - (end.bottom - end.fade))} px under its faded edge at the end of the scroll${wheel ? ' (mouse wheel)' : ''}`);
    await page.evaluate(() => (document.getElementById('events').scrollTop = 0));
  }
  if (t.rows && t.scrolls && t.over > 1) {
    // Back to the start of the conversation: the first message readable below the faded edge.
    if (wheel) {
      await centre('transcript');
      await page.mouse.wheel(0, -5000);
      await page.waitForTimeout(500);
    } else await page.evaluate(() => (document.getElementById('transcript').scrollTop = 0));
    const start = (await geometry()).t;
    if (start.firstTop < start.top + start.fade - 1) out.push(`the transcript's first message stays ${Math.round(start.top + start.fade - start.firstTop)} px under its faded edge at the top of the scroll${wheel ? ' (mouse wheel)' : ''}`);
    await page.evaluate((s) => (document.getElementById('transcript').scrollTop = s), t.scrollTop);
  }
  if (wheel) await page.mouse.move(5, 5);
  return out;
}

/** The kiosk's own behaviour must be off for a remote viewer (run after the page has been idle). */
async function kioskBehaviourProblems(page, { night }) {
  const out = [];
  const s = await page.evaluate(() => ({
    view: document.documentElement.dataset.view,
    night: document.documentElement.dataset.night,
    cursorHidden: document.documentElement.classList.contains('cursor-hidden'),
    shift: document.getElementById('stage').style.getPropertyValue('--shift-x'),
    transform: getComputedStyle(document.getElementById('stage')).transform,
  }));
  if (s.view !== 'remote') out.push(`the page thinks it is ${s.view}, not a remote viewer`);
  if (s.night === 'on') out.push(`a remote viewer dims at night${night ? '' : ' (in the daytime!)'}`);
  if (s.cursorHidden) out.push('a remote viewer hides the cursor');
  if (s.shift) out.push(`a remote viewer shifts the page (--shift-x ${s.shift})`);
  // Typing on the page (not in the box) stays out of the question box.
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.keyboard.press('KeyQ');
  const typed = await page.evaluate(() => document.getElementById('ask-input').value);
  if (typed) out.push(`typing on a remote viewer's page went into the question box ("${typed}")`);
  return out;
}

/**
 * The longest values the panels can show, each in a clone of the value's own element (the page's
 * nodes are not touched): none may be cut or spill out of its box.
 */
export function longValueProblems(page) {
  return page.evaluate(() => {
    // [text, shown as words in the muted style (data-unknown) rather than as a value]
    const NB = '\u00a0';
    const LONG = {
      'cpu-usage': ['100%'],
      'cpu-temp': [`100${NB}°C`],
      'cpu-freq': [`4.00${NB}GHz`],
      'cpu-load': ['12.34 · 12.34 · 12.34'],
      'gpu-util': ['100%'],
      'gpu-temp': [`100${NB}°C`],
      'gpu-power': [`151${NB}W`],
      'gpu-fan': ['100%'],
      'gpu-vram': [`4.0 / 4.0${NB}GB`],
      'mem-pct': ['100%'],
      'mem-used': [`15.5${NB}GB`],
      'mem-avail': [`1023${NB}MB`],
      'mem-swap': [`4.0${NB}GB of 4.0${NB}GB`],
      'io-read': [`999${NB}MB/s`],
      'io-write': [`999${NB}MB/s`],
      'disk-health': ['not checked', true],
      'net-down': [`999${NB}Mb/s`],
      'net-up': [`999${NB}Mb/s`],
      'net-internet': ['not checked', true],
      'net-api': ['UNREACHABLE'],
      'net-tail': ['not connected', true],
      uptime: ['365d 23h'],
      'g-cpu-v': ['100%'],
      'g-gpu-v': ['NO DRIVER', true],
      'g-ram-v': ['100%'],
      'g-disk-v': ['NO DATA', true],
    };
    const out = [];
    for (const [id, [text, unknown]] of Object.entries(LONG)) {
      const orig = document.getElementById(id);
      if (!orig || orig.closest('[hidden]') || !orig.getClientRects().length) continue;
      const clone = orig.cloneNode(false);
      clone.removeAttribute('id');
      if (unknown) clone.dataset.unknown = 'true';
      else delete clone.dataset.unknown;
      clone.textContent = text;
      orig.after(clone);
      const before = orig.style.display;
      orig.style.display = 'none';
      const box = clone.parentElement.getBoundingClientRect();
      const r = clone.getBoundingClientRect();
      if (clone.scrollWidth > clone.clientWidth + 1 || r.right > box.right + 1 || r.right > document.documentElement.clientWidth) out.push(`the longest ${id} ("${text}") does not fit (${clone.scrollWidth} > ${clone.clientWidth})`);
      orig.style.display = before;
      clone.remove();
    }
    return out;
  });
}

async function shoot({ browser, state, sizeKey, outDir }) {
  const size = SIZES[sizeKey];
  const night = state === 'night';
  const coreScenario = night || state === 'offline' ? 'ok' : state === 'internet' ? 'offline' : state;
  const core = await startRealCore({ scenario: coreScenario, start: night ? NIGHT_START : SIM_START });
  const port = new URL(core.url).port;
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: size.dpr,
    isMobile: size.touch,
    hasTouch: size.touch,
    userAgent: size.touch ? IPHONE_UA : undefined,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'dark',
    // What Tailscale serve adds. The page is plain http here (the phone gets https), so the Core is
    // told the scheme, or it would refuse the page's own origin for module scripts and fonts.
    extraHTTPHeaders: { 'Tailscale-User-Login': LOGIN, 'Tailscale-User-Name': 'Frank', 'X-Forwarded-Proto': 'http' },
  });
  const page = await context.newPage();
  const problems = [];
  if (size.insets) {
    const cdp = await context.newCDPSession(page);
    const i = { top: 0, right: 0, bottom: 0, left: 0, ...size.insets };
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: i.top, topMax: i.top, right: i.right, rightMax: i.right, bottom: i.bottom, bottomMax: i.bottom, left: i.left, leftMax: i.left } }).catch((e) => problems.push(`could not emulate the notch: ${e.message}`));
  }
  let stopping = false;
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !(stopping && /Failed to load resource|ERR_/.test(m.text()))) problems.push(`console error: ${m.text()}`);
  });
  const name = `${state}-${sizeKey}`;
  try {
    await page.goto(`http://${TAILNET_NAME}:${port}/?nosw`);
    await page.waitForFunction(() => window.__jarvisCore && window.__jarvisCore.stats().online, null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2500);
    if (!night && state !== 'offline') {
      const q = state === 'ok' || state === 'nogpu' ? 'How are you?' : 'Anything wrong?';
      const chip = page.locator(`.ask-chip[data-q="${q}"]`);
      if (size.touch) await chip.tap();
      else await chip.click();
      await page.waitForSelector('.msg-core:not(.is-pending)', { timeout: 5000 });
      if (state === 'nogpu') {
        const gpu = page.locator('.ask-chip[data-q="GPU temp?"]');
        if (size.touch) await gpu.tap();
        else await gpu.click();
        await page.waitForFunction(() => document.querySelectorAll('.msg-core:not(.is-pending)').length >= 2);
      }
      if (!size.touch) await page.mouse.move(size.w / 2, 10);
      await page.locator('#ask-input').blur();
    }
    if (state === 'offline') {
      stopping = true;
      await core.control({ down: true });
      await page.waitForFunction(() => !window.__jarvisCore.stats().online, null, { timeout: 15000 });
      await page.waitForTimeout(3000);
    }
    if (night) await page.waitForTimeout(4000); // the kiosk would be dimming by now
    await page.waitForTimeout(1500); // a cursor would have hidden by now (3 s)
    await page.evaluate(() => window.scrollTo(0, 0));
    const layout = await layoutOf(page);
    const checks = [];
    let smallest = null;
    if (layout === 'kiosk') {
      // The kiosk layout (it fits), seen by a remote viewer: the kiosk run's checks, plus, on a
      // screen that can be touched (the iPad Pro), the touch targets and the 16 px question box.
      // The Mac's mouse keeps the kiosk's sizes, so the transcript keeps the kiosk's height.
      checks.push(...(await layoutProblems(page)));
      checks.push(
        ...(await page.evaluate((touch) => {
          const out = [];
          const coarse = matchMedia('(any-pointer: coarse)').matches;
          if (coarse !== touch) out.push(`the page sees ${coarse ? 'a touch screen' : 'no touch screen'} on a ${touch ? 'touch' : 'mouse'} device`);
          if (!coarse) return out;
          for (const el of document.querySelectorAll('.ask-chip, .ask-send, .ask-input, .open-jarvis')) {
            const r = el.getBoundingClientRect();
            if (r.width && (r.height < 43.5 || r.width < 43.5)) out.push(`touch target under 44 px: ${el.className} (${Math.round(r.width)}×${Math.round(r.height)})`);
          }
          const fs = parseFloat(getComputedStyle(document.getElementById('ask-input')).fontSize);
          if (fs < 16) out.push(`the question box is ${fs}px (iOS zooms the page into fields under 16 px)`);
          return out;
        }, size.touch)),
      );
    } else {
      const r = await remoteProblems(page, size.insets);
      checks.push(...r.problems, ...(await separatorProblems(page)));
      smallest = r.smallest;
    }
    const first = path.join(outDir, `${name}.png`);
    const full = path.join(outDir, `${name}-full.png`);
    await page.screenshot({ path: first });
    await page.screenshot({ path: full, fullPage: true });
    checks.push(...(await talkProblems(page, { wheel: !size.touch })));
    checks.push(...(await placeholderProblems(page)));
    if (state !== 'offline') checks.push(...(layout === 'kiosk' ? await longTextProblems(page) : await longValueProblems(page)));
    checks.push(...(await kioskBehaviourProblems(page, { night })));
    const height = await page.evaluate(() => document.scrollingElement.scrollHeight);
    return { name, first, full, layout, height, smallest, problems: [...problems, ...checks] };
  } finally {
    await context.close();
    await core.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await mkdir(opts.out, { recursive: true });
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch({ args: [`--host-resolver-rules=MAP ${TAILNET_NAME} 127.0.0.1`, '--no-proxy-server'] });
  const states = opts.only || STATES;
  let failed = 0;
  console.log(`The remote view through the tailnet name ${TAILNET_NAME} (the real Core in fixture mode)`);
  try {
    for (const state of states) {
      for (const sizeKey of opts.sizes) {
        const r = await shoot({ browser, state, sizeKey, outDir: opts.out });
        if (r.problems.length) failed++;
        console.log(`${(r.problems.length ? 'PROBLEMS' : 'ok').padEnd(8)} ${r.name.padEnd(26)} ${r.layout.padEnd(10)} page ${r.height}px${r.smallest ? `, smallest text ${r.smallest}px` : ''}  ${r.first}`);
        for (const p of r.problems) console.log(`         - ${p}`);
      }
    }
  } finally {
    await browser.close();
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
