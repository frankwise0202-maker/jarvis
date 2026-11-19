// E2E harness for Jarvis: browser contexts per scenario, storage seeding (SPEC §13), guards
// (page errors, console errors, CSP violations, unexpected dialogs, third-party requests,
// unexpected mock violations) and small helpers built on the SPEC §13 data-testids only.

import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { canonicalJson } from '../mock/util.mjs';
import { startTestServer, MOCK_API_KEY } from '../server.mjs';

export const BAD_API_KEY = 'sk-ant-bad-0123456789abcdefghijk';
export const SEED_MARKER = '__jarvis_e2e_seeded__';
export const TERMINAL_STATUSES = ['done', 'stopped', 'error', 'interrupted'];
export const ACTIVE_AGENT_STATUSES = ['starting', 'thinking', 'searching', 'reading', 'writing'];

/** Playwright is installed globally (CommonJS resolution via NODE_PATH, not ESM `import`). */
export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    /* fall through */
  }
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    /* fall through */
  }
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return require(path.join(globalRoot, 'playwright'));
}

export class E2EError extends Error {}

export function devices(playwright) {
  const iphone = playwright.devices['iPhone 13'];
  const phone = (width, height, label) => ({
    label,
    phone: true,
    options: {
      viewport: { width, height },
      screen: { width, height },
      deviceScaleFactor: 1, // small screenshots that are easy to inspect
      isMobile: true,
      hasTouch: true,
      userAgent: iphone.userAgent,
    },
  });
  return {
    iphone13: phone(390, 844, 'iPhone 13 (390×844)'),
    small: phone(375, 667, 'Small phone (375×667)'),
    desktop: { label: 'Desktop (1440×900)', phone: false, options: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  };
}

export const tid = (name, attrs = {}) =>
  `[data-testid="${name}"]${Object.entries(attrs).map(([k, v]) => `[${k}="${String(v).replace(/"/g, '\\"')}"]`).join('')}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One scenario run. Owns its browser context(s); collects issues from the guards.
 */
export class TestContext {
  constructor({ scenario, browser, playwright, server, artifactsDir, devices: deviceMap }) {
    this.scenario = scenario;
    this.browser = browser;
    this.playwright = playwright;
    this.server = server;
    this.mock = server.mock;
    this.url = server.url;
    this.artifactsDir = artifactsDir;
    this.devices = deviceMap;
    this.issues = [];
    this.notes = [];
    this.screenshots = [];
    this.contexts = [];
    this.extraServers = [];
    this.currentStep = '';
    this.page = null;
  }

  // ---- issues & assertions --------------------------------------------------------------

  issue(message) {
    if (!this.issues.includes(message)) this.issues.push(message);
  }

  note(message) {
    this.notes.push(message);
  }

  assert(condition, message) {
    if (!condition) throw new E2EError(message);
  }

  /** Label a part of the scenario; a failure inside it is reported with the label. */
  async step(name, fn) {
    const previous = this.currentStep;
    this.currentStep = name;
    const result = await fn();
    this.currentStep = previous;
    return result;
  }

  /**
   * Poll `fn` until it returns something truthy. `message` may be a (possibly async) function,
   * evaluated only on timeout so it can describe the final state.
   */
  async waitFor(fn, { timeout = 15000, interval = 100, message = 'condition' } = {}) {
    const end = Date.now() + timeout;
    let lastError;
    for (;;) {
      try {
        const value = await fn();
        if (value) return value;
      } catch (err) {
        lastError = err;
      }
      if (Date.now() > end) {
        const what = typeof message === 'function' ? await Promise.resolve().then(message).catch(() => 'condition') : message;
        throw new E2EError(`Timed out after ${Math.round(timeout / 1000)} s waiting for ${what}${lastError ? ` (last error: ${lastError.message.split('\n')[0]})` : ''}`);
      }
      await sleep(interval);
    }
  }

  // ---- browser contexts -----------------------------------------------------------------

  /**
   * New browser context + page for `device`, with storage seeded once (reloads keep app state).
   * seed: 'default' (mock key, onboarded, userName Tony), 'fresh' (only the dev API base),
   * 'empty' (nothing at all), or an object { apiKey, settings, apiBase }.
   */
  async newPage({ device = this.scenario.device || 'iphone13', seed = this.scenario.seed || 'default', settings = this.scenario.settings || {}, serverUrl = this.url } = {}) {
    const d = this.devices[device];
    if (!d) throw new E2EError(`Unknown device "${device}"`);
    const context = await this.browser.newContext({
      ...d.options,
      serviceWorkers: 'allow',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      colorScheme: 'dark',
    });
    this.contexts.push(context);
    const origin = new URL(serverUrl).origin;

    let values = {};
    if (seed === 'default' || (seed && typeof seed === 'object')) {
      const s = seed === 'default' ? {} : seed;
      values = {
        'jarvis.dev.apiBase': s.apiBase ?? origin,
        'jarvis.apiKey': s.apiKey ?? MOCK_API_KEY,
        'jarvis.settings.v1': JSON.stringify({ onboarded: true, userName: 'Tony', ...(s.settings || {}), ...settings }),
      };
    } else if (seed === 'fresh') {
      values = { 'jarvis.dev.apiBase': origin };
    }
    await context.addInitScript(
      ({ values, origin, marker }) => {
        try {
          if (location.origin !== origin || localStorage.getItem(marker)) return;
          localStorage.setItem(marker, '1');
          for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v);
        } catch {
          /* storage unavailable */
        }
      },
      { values, origin, marker: SEED_MARKER },
    );

    // Guards.
    await context.exposeBinding('__e2eReport', (_source, payload) => {
      if (payload?.kind === 'csp') this.issue(`CSP violation: ${payload.directive} blocked ${payload.blocked || '(inline)'}${payload.source ? ` at ${payload.source}:${payload.line}` : ''}`);
    });
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        try {
          window.__e2eReport({ kind: 'csp', directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber });
        } catch {
          /* binding gone during navigation */
        }
      });
    });
    context.on('request', (req) => {
      const url = req.url();
      if (!/^https?:/i.test(url)) return;
      try {
        if (new URL(url).origin !== origin) this.issue(`Third-party request (SPEC §2 allows none in tests): ${req.method()} ${url}`);
      } catch {
        /* ignore */
      }
    });
    const page = await context.newPage();
    this.attachPageGuards(page);
    if (!this.page) this.page = page;
    return page;
  }

  attachPageGuards(page) {
    const allowed = this.scenario.allowConsole || [];
    page.on('pageerror', (err) => this.issue(`Uncaught exception: ${err.message.split('\n')[0]}`));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (allowed.some((re) => re.test(text))) return;
      const loc = msg.location();
      this.issue(`Console error: ${text.slice(0, 300)}${loc?.url ? ` (${loc.url.replace(this.url, '')}:${loc.lineNumber})` : ''}`);
    });
    page.on('dialog', async (dialog) => {
      this.issue(`Unexpected ${dialog.type()} dialog: "${dialog.message().slice(0, 120)}"`);
      await dialog.dismiss().catch(() => {});
    });
    page.on('crash', () => this.issue('The page crashed'));
  }

  /** A separate test server (e.g. one the PWA scenario can shut down to go offline). */
  async startExtraServer(options = {}) {
    const srv = await startTestServer({ build: 'never', quiet: true, mock: { timeScale: this.server.mock.timeScale }, ...options });
    this.extraServers.push(srv);
    return srv;
  }

  // ---- app helpers ------------------------------------------------------------------------

  locator(name, attrs, page = this.page) {
    return page.locator(tid(name, attrs));
  }

  async goto(pathname = '/', { page = this.page, waitReady = true, serverUrl = this.url } = {}) {
    await page.goto(new URL(pathname, `${serverUrl}/`).href, { waitUntil: 'domcontentloaded' });
    if (waitReady) await this.waitReady(page);
  }

  async waitReady(page = this.page, timeout = 20000) {
    await page.waitForSelector(tid('app', { 'data-ready': 'true' }), { state: 'attached', timeout }).catch(() => {
      throw new E2EError('The app never became ready ([data-testid="app"][data-ready="true"] missing)');
    });
  }

  async reload(page = this.page) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitReady(page);
  }

  async visible(name, { attrs, timeout = 15000, page = this.page, message } = {}) {
    const loc = page.locator(tid(name, attrs)).first();
    await loc.waitFor({ state: 'visible', timeout }).catch(() => {
      throw new E2EError(message || `Expected ${tid(name, attrs)} to be visible within ${Math.round(timeout / 1000)} s`);
    });
    return loc;
  }

  async count(name, attrs, page = this.page) {
    return page.locator(tid(name, attrs)).count();
  }

  /** Select a composer mode and check aria-pressed. */
  async selectMode(mode, page = this.page) {
    const btn = await this.visible(`mode-${mode}`, { page });
    await btn.click();
    await this.waitFor(async () => (await btn.getAttribute('aria-pressed')) === 'true', { timeout: 3000, message: `mode-${mode} to have aria-pressed="true"` });
  }

  /**
   * Type a message and press Send. Resolves to the new Jarvis turn locator.
   */
  async send(text, { mode, page = this.page } = {}) {
    if (mode) await this.selectMode(mode, page);
    const before = await this.count('turn-jarvis', undefined, page);
    const input = await this.visible('composer-input', { page });
    await input.fill(text);
    const send = await this.visible('composer-send', { page, message: 'composer-send should be visible when idle' });
    await send.click();
    await this.waitFor(async () => (await this.count('turn-jarvis', undefined, page)) > before, { timeout: 10000, message: 'a new Jarvis turn to appear after sending' });
    return page.locator(tid('turn-jarvis')).nth(before);
  }

  async turnStatus(turn) {
    return turn.getAttribute('data-status');
  }

  /** Wait until `turn` reaches a terminal status; assert it is one of `expected`. */
  async waitForTurn(turn, expected = ['done'], { timeout = 45000 } = {}) {
    const wanted = Array.isArray(expected) ? expected : [expected];
    const status = await this.waitFor(async () => {
      const s = await this.turnStatus(turn);
      return TERMINAL_STATUSES.includes(s) ? s : null;
    }, { timeout, message: `the Jarvis turn to finish (expected status ${wanted.join(' or ')})` });
    if (!wanted.includes(status)) {
      const err = await turn.locator(tid('segment-error')).first().textContent().catch(() => '');
      throw new E2EError(`Turn finished with status "${status}", expected ${wanted.join(' or ')}${err ? `: ${err.trim().slice(0, 200)}` : ''}`);
    }
    return status;
  }

  async text(locator) {
    return ((await locator.textContent()) || '').replace(/\s+/g, ' ').trim();
  }

  async screenshot(name, page = this.page) {
    await mkdir(this.artifactsDir, { recursive: true });
    const file = path.join(this.artifactsDir, `${this.scenario.name}-${name}.png`);
    await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' }).catch(async () => page.screenshot({ path: file }));
    this.screenshots.push(path.relative(process.cwd(), file));
    return file;
  }

  /** No horizontal scrolling (SPEC §2): scrollWidth must not exceed the viewport width. */
  async checkNoHorizontalOverflow(label, page = this.page) {
    const m = await page.evaluate(() => {
      const se = document.scrollingElement || document.documentElement;
      const vw = window.innerWidth;
      if (se.scrollWidth <= vw) return { scrollWidth: se.scrollWidth, innerWidth: vw, offenders: [] };
      // Overflowing: name the widest unclipped elements to make the failure actionable.
      const offenders = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.right > vw + 1) || getComputedStyle(el).position === 'fixed') continue;
        let p = el.parentElement;
        let clipped = false;
        while (p && p !== document.body) {
          if (/^(auto|scroll|hidden|clip)$/.test(getComputedStyle(p).overflowX)) {
            clipped = true;
            break;
          }
          p = p.parentElement;
        }
        if (!clipped) {
          const name = el.dataset.testid ? `[data-testid=${el.dataset.testid}]` : typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : '';
          offenders.push(`${el.tagName.toLowerCase()}${name} (right edge ${Math.round(r.right)}px)`);
        }
      }
      return { scrollWidth: se.scrollWidth, innerWidth: vw, offenders: offenders.slice(0, 5) };
    });
    this.assert(m.scrollWidth <= m.innerWidth, `Horizontal overflow (${label}): scrollWidth ${m.scrollWidth} > innerWidth ${m.innerWidth}${m.offenders.length ? `; e.g. ${m.offenders.join(', ')}` : ''}`);
  }

  /** Mock requests of one kind ('lead', 'worker', 'keytest', 'structured', …). */
  requests(kind) {
    return this.mock.requests.filter((r) => !kind || r.kind === kind);
  }

  /**
   * Every lead request in a conversation must extend the previous one append-only (SPEC §8.3):
   * same system and tools, and the earlier messages repeated exactly.
   */
  assertAppendOnly(leadRequests = this.requests('lead').filter((r) => r.status === 200)) {
    for (let i = 1; i < leadRequests.length; i++) {
      const a = leadRequests[i - 1].body;
      const b = leadRequests[i].body;
      if (canonicalJson(a.messages[0]) !== canonicalJson(b.messages[0])) continue; // different conversation
      this.assert(canonicalJson(a.system) === canonicalJson(b.system), `Lead request ${i + 1} changed the frozen system prompt`);
      this.assert(canonicalJson(a.tools) === canonicalJson(b.tools), `Lead request ${i + 1} changed the frozen tools`);
      // A Stop may drop the end of the previous request's history, and only that: the partial
      // assistant messages of a pause_turn continuation, or a message withdrawn before Jarvis
      // replied (one user message, possibly followed by such a chain). What comes next must then
      // be a new user message (a turn or tool results); everything before stays exactly as sent.
      let p = 0;
      while (p < a.messages.length && p < b.messages.length && canonicalJson(a.messages[p]) === canonicalJson(b.messages[p])) p++;
      const dropped = a.messages.slice(p);
      const droppable = dropped.every((m, j) => m.role === 'assistant' || (j === 0 && m.role === 'user'));
      const nextOk = !dropped.length || !b.messages[p] || b.messages[p].role === 'user';
      this.assert(droppable && nextOk, `Lead request ${i + 1} edited history: messages[${p}] differs from the previous request`);
    }
  }

  // ---- teardown -----------------------------------------------------------------------------

  async dispose() {
    for (const c of this.contexts) await c.close().catch(() => {});
    for (const s of this.extraServers) await s.close().catch(() => {});
    this.contexts = [];
    this.extraServers = [];
  }

  async saveFailureArtifacts() {
    await mkdir(this.artifactsDir, { recursive: true });
    const base = path.join(this.artifactsDir, `${this.scenario.name}-FAILED`);
    for (const c of this.contexts) {
      for (const p of c.pages()) {
        if (p.isClosed()) continue;
        await p.screenshot({ path: `${base}.png` }).catch(() => {});
        await writeFile(`${base}.html`, await p.content().catch(() => '')).catch(() => {});
        this.screenshots.push(path.relative(process.cwd(), `${base}.png`));
        break;
      }
      break;
    }
    const log = this.mock.requests.map((r) => ({ id: r.id, kind: r.kind, status: r.status, outcome: r.outcome, directives: r.directives, stop: r.stopReason, error: r.error, messages: r.body?.messages?.length }));
    await writeFile(`${base}-mock.json`, JSON.stringify({ requests: log, violations: this.mock.violations, bodies: this.mock.requests.map((r) => r.body) }, null, 2)).catch(() => {});
  }
}
