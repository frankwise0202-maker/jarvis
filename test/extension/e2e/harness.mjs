// End-to-end harness: Playwright Chromium with the real unpacked extension (a development build,
// whose API base points at the local mock) in a fresh profile per scenario.
//
// Chromium's new headless mode runs extensions (Playwright's `chromium` channel; the default
// headless shell does not), so no virtual display is needed. Chrome has no API to open the side
// panel without a user gesture, so the tests open the same page (sidepanel.html) in its own
// window; the test sites live in the first window, where Jarvis starts working (the controller
// picks the active web tab of another window when the panel's own window has none).

import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { TEST_API_KEY } from '../mock/claude-mock.mjs';

export class E2EError extends Error {}

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 15000, interval = 50, message = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let lastErr;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      lastErr = err;
    }
    if (Date.now() > end) throw new E2EError(`Timed out waiting for ${typeof message === 'function' ? await message() : message}${lastErr ? ` (${lastErr.message.split('\n')[0]})` : ''}`);
    await sleep(interval);
  }
}

export const tid = (id, extra = '') => `[data-testid="${id}"]${extra}`;

/**
 * Waits until a frame on the run's page shows `re` (another site's page loaded in its box). (With
 * two debugger clients on the tab, the test's and Jarvis's, Chromium now and then never loads a new
 * frame from another site, also before round 4: the box is then pointed at its page again.)
 */
export async function frameLoaded(run, re) {
  const loaded = () => run.page.frames().some((f) => re.test(f.url()));
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await waitFor(loaded, { timeout: 6000 }).catch(() => false)) {
      await sleep(150);
      return;
    }
    await run.page.evaluate(() => {
      for (const f of document.querySelectorAll('iframe, object, embed')) {
        const attr = f.localName === 'object' ? 'data' : 'src';
        const v = f.getAttribute(attr);
        if (!v) continue;
        if (f.localName === 'iframe') f.setAttribute(attr, v);
        else f.replaceWith(f.cloneNode(true));
      }
    });
  }
  throw new E2EError(`no frame showing ${re} (frames: ${run.page.frames().map((f) => f.url()).join(', ')})`);
}

/**
 * One scenario run: a browser with the extension, the panel window and a page in the first
 * window. `server` is the shared test server (mock API + sites).
 */
export class Run {
  constructor({ pw, extDir, server, artifacts, name, headed = false }) {
    Object.assign(this, { pw, extDir, server, artifacts, name, headed });
    this.issues = [];
    this.shots = [];
  }

  /**
   * `nativeWindow`: a real window size instead of Playwright's fixed viewport (Chrome's debugging
   * bar then makes the page shorter, as on a Mac). `startUrl`: the page the owner has open.
   * `approveSteps` (default on): the owner approves every ordinary step Jarvis asks about (deny
   * by default asks before each click, typing and key), so a scenario answers only the prompts
   * it is about: site prompts and consequential steps. `everyday`: sites whose "everyday steps"
   * switch is on. `downloads`: Chrome's own download handling, into this folder.
   */
  async start({ settings = {}, seed = true, panelSize = { width: 400, height: 860 }, deviceScaleFactor = 1, nativeWindow = false, startUrl = null, approveSteps = true, everyday = [], always = [], downloads = null, launch = {} } = {}) {
    this.profile = await mkdtemp(path.join(os.tmpdir(), 'jarvis-ext-e2e-'));
    this.downloads = downloads;
    if (downloads) {
      // Chrome's own download folder for this profile (with Playwright's handling switched off
      // below, Chrome's download manager decides, as in the owner's Chrome).
      await mkdir(path.join(this.profile, 'Default'), { recursive: true });
      await writeFile(path.join(this.profile, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: downloads, prompt_for_download: false, directory_upgrade: true }, savefile: { default_directory: downloads } }));
    }
    this.context = await this.pw.chromium.launchPersistentContext(this.profile, {
      channel: 'chromium',
      headless: !this.headed,
      args: [`--disable-extensions-except=${this.extDir}`, `--load-extension=${this.extDir}`, '--no-proxy-server', '--no-first-run', '--no-default-browser-check', ...(nativeWindow ? ['--window-size=1280,900'] : []), ...(launch.args || [])],
      ...(launch.ignoreDefaultArgs ? { ignoreDefaultArgs: launch.ignoreDefaultArgs } : {}),
      ...(nativeWindow ? { viewport: null } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor }),
    });
    this.sw = this.context.serviceWorkers()[0] || (await this.context.waitForEvent('serviceworker', { timeout: 15000 }));
    this.extId = new URL(this.sw.url()).host;
    this.sw.on('console', (msg) => {
      if (msg.type() === 'error') this.issues.push(`service worker console error: ${msg.text()}`);
    });
    if (seed) {
      const port = this.server.port;
      await this.sw.evaluate(
        ({ key, base, settings, everyday, always }) =>
          chrome.storage.local.set({
            'jarvis.apiKey': key,
            'jarvis.dev.apiBase': base,
            'jarvis.settings': { model: 'claude-sonnet-5-5', budgetUsd: 1, maxSteps: 40, incognito: false, ...settings },
            'jarvis.everyday': Object.fromEntries(everyday.map((s) => [s, true])),
            'jarvis.sites': Object.fromEntries(always.map((s) => [s, 'always'])),
          }),
        { key: TEST_API_KEY, base: this.server.apiBase, settings, everyday, always },
      );
      void port;
    } else {
      await this.sw.evaluate((base) => chrome.storage.local.set({ 'jarvis.dev.apiBase': base }), this.server.apiBase);
    }
    this.page = this.context.pages()[0] || (await this.context.newPage());
    this.watchPage(this.page);
    if (downloads) {
      const cdp = await this.context.newCDPSession(this.page);
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });
      await cdp.detach().catch(() => {});
    }
    // The extension answers the page's JS dialogs itself (through the debugger). Without a
    // listener Playwright would answer them first (and accept "Leave site?").
    this.page.on('dialog', () => {});
    await this.page.goto(startUrl || this.server.siteUrl('shop', '/'));
    // The panel in its own window.
    const opened = this.context.waitForEvent('page', { predicate: (p) => p.url().includes('sidepanel.html'), timeout: 15000 });
    await this.sw.evaluate((size) => chrome.windows.create({ url: chrome.runtime.getURL('sidepanel.html'), type: 'normal', ...size }), panelSize);
    this.panel = await opened;
    await this.panel.setViewportSize(panelSize);
    this.watchPage(this.panel, 'panel');
    await this.panel.waitForLoadState('domcontentloaded');
    this.stepPrompts = [];
    if (approveSteps) this.approveSteps();
    return this;
  }

  /**
   * Plays an owner who approves every ordinary step Jarvis asks about (the prompts with
   * data-consequential="false"); records them in this.stepPrompts ({ title, body }).
   */
  approveSteps() {
    if (this.stepLoop) return;
    this.stepLoop = { on: true };
    const loop = this.stepLoop;
    const done = new Set();
    (async () => {
      while (loop.on) {
        try {
          const list = await this.panel.locator('[data-testid="prompt"][data-kind="confirm"][data-consequential="false"]').evaluateAll((els) => els.map((e) => ({ id: e.dataset.promptId, title: e.querySelector('.prompt__title')?.textContent || '', body: e.querySelector('[data-testid="prompt-body"]')?.textContent || '' })));
          for (const p of list) {
            if (done.has(p.id)) continue;
            done.add(p.id);
            this.stepPrompts.push(p);
            await this.panel.locator(`[data-prompt-id="${p.id}"] [data-testid="prompt-choice"][data-choice="approve"]`).click({ timeout: 5000 }).catch(() => {});
          }
        } catch {
          /* the panel is busy */
        }
        await sleep(40);
      }
    })();
  }

  stopApprovingSteps() {
    if (this.stepLoop) this.stepLoop.on = false;
    this.stepLoop = null;
  }

  watchPage(p, label = 'page') {
    p.on('pageerror', (err) => this.issues.push(`${label} error: ${err.message}`));
    p.on('console', (msg) => {
      if (msg.type() === 'error' && label === 'panel') this.issues.push(`${label} console error: ${msg.text()}`);
    });
  }

  // ---- panel helpers -----------------------------------------------------------------------

  async send(text) {
    await this.panel.fill(tid('composer'), text);
    await this.panel.click(tid('send'));
  }

  lastCard() {
    return this.panel.locator(tid('task-card')).last();
  }

  async status() {
    return (await this.lastCard().getAttribute('data-status')) || '';
  }

  async waitStatus(statuses, timeout = 20000) {
    const want = Array.isArray(statuses) ? statuses : [statuses];
    await waitFor(async () => want.includes(await this.status()), { timeout, message: async () => `task status ${want.join('|')} (is ${await this.status()}; ${await this.describe()})` });
  }

  async waitPrompt(kind, timeout = 15000) {
    // With ordinary steps approved in the background, only the prompts the scenario answers.
    const loc = this.lastCard().locator(tid('prompt', `[data-kind="${kind}"]${kind === 'confirm' && this.stepLoop ? ':not([data-consequential="false"])' : ''}`));
    await loc.waitFor({ timeout });
    return loc;
  }

  async decide(kind, choice) {
    const prompt = await this.waitPrompt(kind);
    // This prompt, by its id: the next prompt can appear in the same place at once.
    const id = await prompt.getAttribute('data-prompt-id');
    const body = await prompt.locator(tid('prompt-body')).textContent();
    await prompt.locator(tid('prompt-choice', `[data-choice="${choice}"]`)).click();
    await this.panel.locator(`[data-prompt-id="${id}"]`).waitFor({ state: 'detached', timeout: 10000 });
    return body;
  }

  async steps() {
    return this.lastCard().locator(tid('step')).evaluateAll((els) => els.map((e) => ({ kind: e.dataset.kind, status: e.dataset.status, label: e.querySelector('.step__label')?.textContent || '', thumb: !!e.querySelector('img') })));
  }

  async answer() {
    return (await this.lastCard().locator(tid('answer')).textContent()) || '';
  }

  async describe() {
    try {
      const steps = await this.steps();
      return `steps: ${steps.map((s) => `${s.label} [${s.status}]`).join(' | ')}; mock violations: ${JSON.stringify(this.server.mock.violations.slice(-3))}`;
    } catch {
      return '';
    }
  }

  // ---- service worker helpers ----------------------------------------------------------------

  /** Chrome tab ids this extension has a debugger session on (asks Chrome, not our state). */
  async attachedTabs() {
    return this.sw.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const out = [];
      for (const t of tabs) {
        try {
          await chrome.debugger.sendCommand({ tabId: t.id }, 'Page.getFrameTree');
          out.push(t.id);
        } catch {
          /* not attached */
        }
      }
      return out;
    });
  }

  async overlayCount(p = this.page) {
    try {
      return await p.locator('[data-jarvis-control]').count();
    } catch {
      return -1;
    }
  }

  async shot(name, target = this.panel) {
    await mkdir(this.artifacts, { recursive: true });
    const file = path.join(this.artifacts, `${this.name}-${name}.png`);
    await target.screenshot({ path: file });
    this.shots.push(file);
    return file;
  }

  async close({ failed = false } = {}) {
    if (failed) {
      try {
        await mkdir(this.artifacts, { recursive: true });
        if (this.panel) await this.panel.screenshot({ path: path.join(this.artifacts, `${this.name}-FAILED-panel.png`) });
        if (this.page) await this.page.screenshot({ path: path.join(this.artifacts, `${this.name}-FAILED-page.png`) });
        await writeFile(path.join(this.artifacts, `${this.name}-FAILED-mock.json`), JSON.stringify({ violations: this.server.mock.violations, requests: this.server.mock.requests.map(({ body, ...r }) => r) }, null, 2));
      } catch {
        /* best effort */
      }
    }
    this.stopApprovingSteps();
    try {
      await this.context?.close();
    } catch {
      /* ignore */
    }
    if (this.profile) await rm(this.profile, { recursive: true, force: true }).catch(() => {});
  }
}

export function assert(cond, message) {
  if (!cond) throw new E2EError(message);
}

/**
 * The cross-site prompt (round 4): Jarvis read one site in the task and now acts on another
 * ("Carry on to x?"), or opens an address it built there ("Send this address to x?").
 */
export const isFlowPrompt = (p) => p?.kind === 'confirm' && /^(Carry on to|Send this address to) /.test(p.title || '');

/** Records every prompt the panel shows ({ kind, title, body, chips }), polling every 40 ms. */
export function watchPrompts(run) {
  const seen = [];
  const keys = new Set();
  let on = true;
  (async () => {
    while (on) {
      try {
        const list = await run.panel.locator(tid('prompt')).evaluateAll((els) => els.map((e) => ({ id: e.closest('[data-testid="task-card"]')?.dataset.status || '', kind: e.dataset.kind, step: e.dataset.consequential === 'false', title: e.querySelector('.prompt__title')?.textContent || '', body: e.querySelector('[data-testid="prompt-body"]')?.textContent || '', facts: e.querySelector('[data-testid="prompt-facts"]')?.textContent || '', chips: [...e.querySelectorAll('.chip')].map((c) => c.textContent) })));
        for (const p of list) {
          const k = `${p.kind}|${p.title}|${p.body}`;
          if (!keys.has(k)) {
            keys.add(k);
            seen.push(p);
          }
        }
      } catch {
        /* the panel is busy */
      }
      await sleep(40);
    }
  })();
  // confirms(): the consequential approvals (and Jarvis's own questions); steps(): the ordinary
  // steps deny-by-default asks about.
  return { seen, stop: () => (on = false), confirms: () => seen.filter((p) => p.kind === 'confirm' && !p.step), steps: () => seen.filter((p) => p.kind === 'confirm' && p.step), sites: () => seen.filter((p) => p.kind === 'site') };
}
