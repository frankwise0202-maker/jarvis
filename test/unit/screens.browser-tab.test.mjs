// "Pull this up in Chrome" (v8.1, G1): src/ui/browser-tab.js in real headless Chromium, with
// window.open replaced by a recorder that never loads anything (no page leaves this machine) and a
// fake Chrome link of contract (f)'s shape (app.chromeLink: state, open). Checks: a tab with no handle
// on Jarvis; a blocked pop-up's one-tap "Open in Chrome" (and the line while Jarvis is hidden); an
// address that acts waits for a click on its card; with Optics or a walkthrough on screen, a window
// placed beside Jarvis; the Jarvis window when linked and online (beside: unfocused, at a rect), the
// owner's own Chrome for "in my Chrome", a normal tab when the link is down (said once); nothing to
// pull up; "close that tab"; the once-only "open it in a window" line from a Jarvis tab.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './platform.harness.test.mjs';

let h;
before(async () => {
  h = await createHarness({ tabs: 'src/ui/browser-tab.js', ctl: 'src/ui/screens/controller.js' });
});
after(async () => {
  if (h) await h.close();
});

function stubs(opts) {
  const o = opts || {};
  const def = (obj, name, value) => Object.defineProperty(obj, name, { configurable: true, get: () => value });
  for (const [k, v] of Object.entries({ width: 1440, height: 900, availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875, isExtended: false })) def(window.screen, k, v);
  for (const [k, v] of Object.entries({ screenX: 0, screenY: 25, screenLeft: 0, screenTop: 25, outerWidth: 1440, outerHeight: 875 })) def(window, k, v);
  window.__gesture = false;
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { get isActive() { return window.__gesture === true; }, hasBeenActive: true } });
  window.__opens = [];
  window.__block = !!o.blockPopups;
  window.addEventListener('click', (e) => {
    if (e.isTrusted) window.__gesture = true;
  }, true);
  // A window that records where it was sent and never loads anything.
  window.open = (url, name, features) => {
    const gesture = window.__gesture;
    if (window.__block && !gesture) {
      window.__opens.push({ url: String(url), name: String(name || ''), features: String(features || ''), blocked: true });
      return null;
    }
    window.__gesture = false;
    const w = {
      opener: window,
      closed: false,
      location: {
        href: String(url),
        replace(u) {
          this.href = String(u);
        },
      },
      close() {
        this.closed = true;
      },
      focus() {},
      moveTo() {},
      resizeTo() {},
      document: { hasFocus: () => false },
    };
    window.__opens.push({ url: String(url), name: String(name || ''), features: String(features || ''), gesture, win: w });
    return w;
  };
  const q = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (d) => (d && /^window-(management|placement)$/.test(d.name) ? Promise.resolve({ state: 'prompt' }) : q(d));
}

async function page(opts = {}) {
  const p = await h.newPage({ init: stubs, initArg: opts });
  await p.evaluate((o) => {
    window.__onScreen = false;
    window.__hidden = false;
    window.__toasts = [];
    window.__linkCalls = [];
    // Contract (f)'s shape: the parts this feature uses.
    window.__link = { linked: !!o.linked, online: !!o.online, reply: { ok: true, site: 'example.com' } };
    const chromeLink = {
      state: () => ({ linked: window.__link.linked, online: window.__link.online, voiceApprovals: false, task: null }),
      subscribe: () => () => {},
      open: async (url, opts2) => {
        window.__linkCalls.push({ url, rect: opts2.rect, focus: opts2.focus });
        return window.__link.reply;
      },
      startTask: async () => ({ ok: false, reason: 'off' }),
      stopTask: async () => {},
      answer: async () => ({ ok: false, reason: 'gone' }),
      onPrompt() {},
      onPromptClosed() {},
      onDone() {},
    };
    window.ctl = window.__mods.ctl.createScreens({ getConversation: () => null, describeOpen: () => null, closeInApp: () => false, showInApp: () => {}, getLibraryItem: async () => null });
    window.tabs = window.__mods.tabs.createBrowserTabs({
      chromeLink: () => (o.noLink ? null : chromeLink),
      screens: window.ctl,
      onScreen: () => window.__onScreen,
      hidden: () => window.__hidden,
      standalone: () => o.standalone !== false,
      listensHidden: () => false,
      toast: (m) => window.__toasts.push(m),
    });
    window.pull = async (target, ctx = {}, where = 'auto') => {
      const out = await window.tabs.pullUp({ do: 'chrome-open', target, where }, { source: 'voice', ...ctx });
      return { status: out.status, via: out.via || null, line: out.line, url: out.url || null };
    };
    window.opened = () => window.__opens.map((x) => ({ url: x.url, name: x.name, features: x.features, blocked: !!x.blocked, sent: x.win ? x.win.location.href : null, opener: x.win ? x.win.opener : undefined }));
  }, opts);
  return p;
}

test('a tab: blank first, no opener, then the page; Jarvis says it is open; "close that tab"', async () => {
  const p = await page({ noLink: true });
  const o = await p.evaluate(() => window.pull({ kind: 'site', url: `${location.origin}/site`, name: 'Site' }));
  assert.deepEqual([o.status, o.via, o.line], ['opened', 'tab', 'It’s open in Chrome.']);
  const [tab] = await p.evaluate(() => window.opened());
  assert.deepEqual([tab.url, tab.name, tab.features, tab.opener], ['about:blank', '_blank', '', null], 'a plain tab (no features), and the page can\'t reach Jarvis');
  assert.match(tab.sent, /\/site$/);
  const search = await p.evaluate(() => window.pull({ kind: 'search', query: 'heat pipes' }));
  assert.equal(search.line, 'Searching Google for heat pipes.');
  assert.equal((await p.evaluate(() => window.opened())).at(-1).sent, 'https://www.google.com/search?q=heat%20pipes');
  const closed = await p.evaluate(() => [window.tabs.closeTab(), window.__opens.at(-1).win.closed, window.tabs.closeTab(), window.tabs.closeTab()]);
  assert.deepEqual([closed[0].count, closed[0].line, closed[1], closed[2].count, closed[3].count, closed[3].line], [1, 'Closed the tab.', true, 1, 0, 'I can only close a tab I opened.']);
  assert.deepEqual(p.problems, []);
});

test('"this": a reply\'s links (the first of several, said), a Look\'s name searched, nothing to pull up', async () => {
  const p = await page({ noLink: true });
  const several = await p.evaluate(() => window.pull({ kind: 'this' }, { thisTarget: { kind: 'reply', words: '', urls: [`${location.origin}/a`, `${location.origin}/b`, `${location.origin}/c`] } }));
  assert.equal(several.line, 'It’s open in Chrome. That reply has 3 links; I opened the first.');
  assert.match((await p.evaluate(() => window.opened())).at(-1).sent, /\/a$/);
  const look = await p.evaluate(() => window.pull({ kind: 'this' }, { thisTarget: { kind: 'look', words: 'USB-C charger' } }));
  assert.equal(look.line, 'Searching Google for USB-C charger.');
  const none = await p.evaluate(() => window.pull({ kind: 'this' }, { thisTarget: { kind: 'none', words: '' } }));
  assert.deepEqual([none.status, none.line], ['nothing', 'There’s nothing to pull up yet.']);
  const link = await p.evaluate(() => window.pull({ kind: 'link', ordinal: 4 }, { links: [{ url: `${location.origin}/x`, title: 'X' }] }));
  assert.deepEqual([link.status, link.line], ['nothing', 'That reply has 1 link.']);
  assert.equal((await p.evaluate(() => window.opened())).length, 2, 'nothing opened for those');
});

test('an address that does something waits for a click on its card', async () => {
  const p = await page({ noLink: true });
  const o = await p.evaluate(() => window.pull({ kind: 'this' }, { thisTarget: { kind: 'link', words: 'Deal', url: `${location.origin}/product?add-to-cart=42` } }));
  assert.deepEqual([o.status, o.line], ['needs_click', 'That address looks like it adds to a cart, so it opens only when you click Open.']);
  assert.equal((await p.evaluate(() => window.opened())).length, 0, 'nothing opened by voice');
  const card = p.locator('[data-testid="chrome-act"]');
  assert.equal(await card.locator('.scr-prompt__title').textContent(), 'It looks like it adds to a cart. Open it?');
  assert.match(await p.locator('[data-testid="chrome-act-address"]').textContent(), /\/product\?add-to-cart=42$/);
  await p.click('[data-testid="chrome-act-open"]');
  await p.waitForFunction(() => window.__opens.length === 1);
  const [tab] = await p.evaluate(() => window.opened());
  assert.match(tab.sent, /add-to-cart=42$/);
  assert.equal(await card.count(), 0, 'the card goes away');
  // "Not now": nothing opens.
  await p.evaluate(() => window.pull({ kind: 'this' }, { thisTarget: { kind: 'link', words: 'Cancel', url: `${location.origin}/orders/7/cancel` } }));
  assert.match(await p.locator('[data-testid="chrome-act"] .scr-prompt__title').textContent(), /deletes or cancels something/);
  await p.click('[data-testid="chrome-act-cancel"]');
  assert.equal(await p.evaluate(() => window.__opens.length), 1);
});

test('blocked pop-up: the one-tap "Open in Chrome" button; hidden, Jarvis says to allow pop-ups once', async () => {
  const p = await page({ noLink: true, blockPopups: true });
  const o = await p.evaluate(() => window.pull({ kind: 'site', url: `${location.origin}/site` }));
  assert.deepEqual([o.status, o.line], ['needs_tap', 'Tap Open in Chrome, and it’ll open.']);
  await p.click('[data-testid="chrome-tap-button"]');
  await p.waitForFunction(() => window.__opens.some((x) => !x.blocked));
  assert.match((await p.evaluate(() => window.opened())).find((x) => !x.blocked).sent, /\/site$/);
  await p.evaluate(() => {
    window.__hidden = true;
  });
  const hidden = await p.evaluate(() => window.pull({ kind: 'site', url: `${location.origin}/other` }));
  assert.equal(hidden.line, 'I couldn’t open it: allow pop-ups for Jarvis once.');
});

test('Optics or a walkthrough on screen: a window beside Jarvis (his strip kept), not a tab', async () => {
  const p = await page({ noLink: true });
  await p.evaluate(() => {
    window.__onScreen = true;
  });
  const o = await p.evaluate(() => window.pull({ kind: 'site', url: `${location.origin}/site` }));
  assert.deepEqual([o.status, o.via, o.line], ['opened', 'window', 'It’s open beside me.']);
  const [w] = await p.evaluate(() => window.opened());
  assert.deepEqual([w.url, w.features, w.opener], ['about:blank', 'popup=1,left=720,top=25,width=720,height=875', null]);
  assert.match(w.name, /^jarvis-link-/);
  assert.deepEqual(await p.evaluate(() => window.ctl.list().map((s) => [s.kind, s.external])), [['link', true]], 'tracked like any window');
});

test('linked and online: the Jarvis window (beside: at a rect, not focused); "in my Chrome" and a link that is down open a tab', async () => {
  const p = await page({ linked: true, online: true });
  const o = await p.evaluate(() => window.pull({ kind: 'site', url: 'https://www.youtube.com/', name: 'YouTube' }));
  assert.deepEqual([o.status, o.via, o.line], ['opened', 'jarvis', 'It’s open in the Jarvis window.']);
  assert.deepEqual(await p.evaluate(() => window.__linkCalls.at(-1)), { url: 'https://www.youtube.com/', rect: null, focus: true });
  await p.evaluate(() => {
    window.__onScreen = true;
  });
  const beside = await p.evaluate(() => window.pull({ kind: 'search', query: 'heat pipes' }));
  assert.equal(beside.line, 'It’s open in the Jarvis window, beside me.');
  assert.deepEqual(await p.evaluate(() => window.__linkCalls.at(-1)), { url: 'https://www.google.com/search?q=heat%20pipes', rect: { left: 720, top: 25, width: 720, height: 875 }, focus: false });
  assert.equal(await p.evaluate(() => window.__opens.length), 0, 'nothing opened here');
  // An acting address: the extension asks in the Jarvis window (the app doesn't ask twice).
  await p.evaluate(() => {
    window.__onScreen = false;
    window.__link.reply = { ok: false, reason: 'needs-click' };
  });
  const acts = await p.evaluate(() => window.pull({ kind: 'this' }, { thisTarget: { kind: 'link', url: 'https://shop.example.com/p?add-to-cart=1', words: 'x' } }));
  assert.deepEqual([acts.status, acts.via, acts.line], ['needs_click', 'jarvis', 'That address looks like it does something, so it waits for your click in the Jarvis window.']);
  assert.equal(await p.locator('[data-testid="chrome-act"]').count(), 0);
  // Refused there: said why.
  await p.evaluate(() => {
    window.__link.reply = { ok: false, reason: 'blocked', why: 'the Chrome Web Store is off limits' };
  });
  const refused = await p.evaluate(() => window.pull({ kind: 'site', url: 'https://chromewebstore.google.com/', name: 'x' }));
  assert.equal(refused.line, 'I can’t open that address: the Chrome Web Store is off limits.');
  // "In my Chrome": the owner's own window, never the Jarvis window.
  const calls = await p.evaluate(() => window.__linkCalls.length);
  await p.evaluate(() => {
    window.__link.reply = { ok: true, site: 'x' };
  });
  const mine = await p.evaluate(() => window.pull({ kind: 'site', url: `${location.origin}/mine` }, {}, 'mine'));
  assert.deepEqual([mine.via, mine.line], ['tab', 'It’s open in Chrome.']);
  assert.equal(await p.evaluate(() => window.__linkCalls.length), calls, 'the link was not used');
  // The link goes down: a normal tab, and Jarvis says so once.
  await p.evaluate(() => {
    window.__link.reply = { ok: false, reason: 'offline' };
  });
  const down = await p.evaluate(() => window.pull({ kind: 'site', url: `${location.origin}/down` }));
  assert.deepEqual([down.via, down.line], ['tab', 'I can’t reach Jarvis for Chrome, so it’s in a normal tab. It’s open in Chrome.']);
  const again = await p.evaluate(() => window.pull({ kind: 'site', url: `${location.origin}/down2` }));
  assert.equal(again.line, 'It’s open in Chrome.', 'said once');
  // Not online (the status says so): a tab, without asking the link.
  await p.evaluate(() => {
    window.__link.online = false;
  });
  const before = await p.evaluate(() => window.__linkCalls.length);
  await p.evaluate(() => window.pull({ kind: 'site', url: `${location.origin}/off` }));
  assert.equal(await p.evaluate(() => window.__linkCalls.length), before);
});

test('from a Jarvis tab that can\'t listen while covered: "open it in a window" is offered once, and "it" is the page', async () => {
  const p = await page({ noLink: true, standalone: false });
  const first = await p.evaluate(() => window.pull({ kind: 'site', url: `${location.origin}/page` }));
  assert.equal(first.line, 'It’s open in Chrome. Say “open it in a window” to keep me in view.');
  const second = await p.evaluate(() => window.pull({ kind: 'site', url: `${location.origin}/page2` }));
  assert.equal(second.line, 'It’s open in Chrome.', 'once');
  // "Open it in a window": the page, in a window beside Jarvis.
  const o = await p.evaluate(async () => {
    window.__gesture = true;
    const r = window.ctl.command('open it in a window', { source: 'voice' });
    const out = await r.done;
    return [out.status, out.kind, window.__opens.at(-1).win.location.href];
  });
  assert.equal(o[0], 'opened');
  assert.equal(o[1], 'link');
  assert.match(o[2], /\/page2$/);
});

test('openInBrowserTab with the browser\'s own window.open: a tab (no window features), blank first, then the page, with no opener', async () => {
  const p = await h.newPage();
  const out = await p.evaluate(async () => {
    const calls = [];
    const real = window.open.bind(window);
    window.open = (url, name, features) => {
      calls.push([String(url), String(name), features === undefined ? null : String(features)]);
      return real(url, name, features);
    };
    const w = window.__mods.tabs.openInBrowserTab(`${location.origin}/tab-page?x=1`);
    for (let i = 0; i < 150; i++) {
      try {
        if (w.location.pathname === '/tab-page') break;
      } catch {
        /* still loading */
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    const res = { calls, opener: w.opener, path: `${w.location.pathname}${w.location.search}` };
    w.close();
    return res;
  });
  assert.deepEqual(out.calls, [['about:blank', '_blank', null]]);
  assert.equal(out.opener, null, 'the page can\'t reach Jarvis');
  assert.equal(out.path, '/tab-page?x=1');
});
