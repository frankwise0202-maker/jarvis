// The controller: the service worker's state and its decisions. It owns the conversation, the
// tasks shown in the side panel, the owner's prompts (site permission, confirmations, limits),
// Stop / Take over / Continue, and what is kept (history) and where.
//
// One task runs at a time. Every open side panel holds a port and receives the same updates.

import { FINAL_STATUSES, PORT_NAME, PROMPT_CHOICES } from '../shared/protocol.js';
import { abortError, displayText, isAbort, jsonCopy, singleLine, sleep, truncate, uid } from '../shared/util.js';
import { Conversation } from './history.js';
import { Driver } from './driver.js';
import { Executor, TOOLSET_NAME, memberResult } from './executor.js';
import { Approvals, CATEGORY_CHIPS, GUARD_CATEGORIES, SECRET_NAMES, classifyDialogText } from './guard.js';
import { inlineUntrusted } from './injection.js';
import { Limits } from './limits.js';
import { MODELS, addUsage } from './models.js';
import { systemPrompt, taskMessage, tools } from './prompts.js';
import { STOPPED_TEXT, runTask } from './agent.js';
import { blockedReason, isActionableUrl, shortUrl, siteOf } from './sites.js';

const SESSION_KEY = 'jarvis.session';
// Errors that a second try usually fixes: Retry then continues the same conversation.
const RESUMABLE = new Set(['rate_limit', 'overloaded', 'server', 'network']);
const BADGE = { running: ['•', '#3ee0ff'], waiting: ['!', '#ffc457'], paused: ['II', '#ffc457'] };

export const RETRY_NOTE = '[Jarvis: the last request failed with a temporary error and the owner pressed Retry. The pages may have changed since: look again (read_page or screenshot) before you act.]';

// How long a page's own "Are you sure?" question waits for the owner before Jarvis answers Cancel.
export const DIALOG_ANSWER_MS = 90 * 1000;
// A download the owner approved a moment ago (the link to it, the address of it) is not asked again.
const DOWNLOAD_ALLOWANCE_MS = 30 * 1000;

const basename = (p) => String(p || '').split(/[\\/]/).pop() || '';
function formatBytes(n) {
  if (!(n > 0)) return '';
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export class Controller {
  /**
   * deps: { chrome, store, pageSource, createClient, encoder, platform, now }
   */
  constructor({ chrome, store, pageSource, createClient, encoder, platform = 'mac', now = () => Date.now() }) {
    this.chrome = chrome;
    this.store = store;
    this.createClient = createClient;
    this.encoder = encoder;
    this.now = now;
    this.platform = platform;
    this.system = systemPrompt({ platform });
    this.tools = tools();
    this.ports = new Set();
    this.tasks = []; // task cards of the current chat, oldest first
    this.thumbs = new Map(); // taskId -> Map(stepId -> dataUrl)
    this.chatId = uid('chat_');
    this.conversation = new Conversation({ id: this.chatId });
    this.features = {};
    this.run = null; // the running task's context
    this.driver = new Driver({
      chrome,
      pageSource,
      onStopRequest: ({ via }) => this.stop(via === 'esc' ? 'esc' : 'bar'),
      onDialog: (toolId, dialog) => this.dialogPolicy(toolId, dialog),
      onDetach: (toolId, reason) => this.onDebuggerDetached(toolId, reason),
      onNavigationRequest: (toolId, url) => this.navigationPolicy(toolId, url),
    });
    this.driver.onTamper = (toolId) => this.onTamper(toolId);
    this.driver.onUnstyled = (toolId) => this.onUnstyled(toolId);
    this.sendQueue = 0;
    this.retryDelaysMs = undefined; // tests shorten the agent loop's waits between retries
  }

  // -------------------------------------------------------------------------------------------
  // Panels

  connect(port) {
    if (port.name !== PORT_NAME) return;
    this.ports.add(port);
    port.onDisconnect.addListener(() => this.ports.delete(port));
    port.onMessage.addListener((msg) => {
      this.onMessage(msg).catch((err) => console.error('[jarvis] message failed:', err?.message || err));
    });
    this.sendSnapshot(port);
  }

  post(msg, port = null) {
    for (const p of port ? [port] : this.ports) {
      try {
        p.postMessage(msg);
      } catch {
        this.ports.delete(p);
      }
    }
  }

  publicTask(task) {
    const copy = jsonCopy(task);
    return copy;
  }

  sendSnapshot(port) {
    this.post({ type: 'snapshot', chatId: this.chatId, running: !!this.run, tasks: this.tasks.map((t) => this.publicTask(t)) }, port);
    for (const t of this.tasks) {
      const thumbs = this.thumbs.get(t.id);
      if (thumbs && thumbs.size) this.post({ type: 'thumbs', taskId: t.id, thumbs: Object.fromEntries(thumbs) }, port);
    }
  }

  emitTask(task) {
    this.post({ type: 'task', task: this.publicTask(task) });
    this.persistSoon();
  }

  async onMessage(msg) {
    switch (msg?.type) {
      case 'hello':
        return;
      case 'start':
        return this.start({ text: msg.text, windowId: msg.windowId });
      case 'stop':
        return this.stop('panel');
      case 'takeover':
        return this.takeover();
      case 'resume':
        return this.resume();
      case 'decide':
        return this.decide(msg.promptId, msg.choice);
      case 'retry':
        return this.retry(msg.taskId, msg.windowId);
      case 'new-chat':
        return this.newChat({ clear: false });
      case 'clear-chat':
        return this.newChat({ clear: true });
      case 'ping':
        return;
      default:
        return;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Tasks

  newTask(text, extra = {}) {
    return {
      id: uid('task_'),
      text: displayText(text).trim(),
      status: 'running',
      model: null,
      startedAt: this.now(),
      endedAt: null,
      steps: [],
      narration: '',
      answer: '',
      error: null,
      cost: 0,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      limits: null,
      prompt: null,
      injections: [],
      notices: [],
      ...extra,
    };
  }

  async start({ text, windowId, retryOf = null, contextReset = false, resume = false }) {
    const clean = displayText(text).trim();
    if (!clean) return;
    if (this.run) {
      this.post({ type: 'error', message: 'Jarvis is already working on a task. Stop it first.' });
      return;
    }
    const settings = await this.store.getSettings();
    const apiKey = await this.store.getApiKey();
    const task = this.newTask(clean, { model: settings.model, retryOf, contextReset, resumed: resume });
    this.tasks.push(task);
    this.thumbs.set(task.id, new Map());
    if (!apiKey) {
      this.finishTask(task, 'error', { error: 'Add your Anthropic API key first (Settings → API key).' });
      return;
    }
    const limits = new Limits({ budgetUsd: settings.budgetUsd, maxSteps: settings.maxSteps });
    task.limits = limits.snapshot();
    const run = {
      task,
      limits,
      abort: new AbortController(),
      approvals: new Approvals(this.now),
      sitesAllowed: new Set(),
      sitesDenied: new Set(),
      always: await this.store.getSites().catch(() => ({})),
      everyday: (await this.store.getEveryday?.().catch(() => ({}))) || {},
      prompt: null,
      promptQueue: Promise.resolve(),
      takeover: false,
      takeovers: 0,
      resumeWaiter: null,
      downloads: [], // downloads held while this task runs: { id, url, site, name, size, verdict, seq }
      downloadSeq: 0,
      downloadsReported: 0,
      downloadAllowances: [],
      settings,
      windowId,
    };
    this.run = run;
    this.emitTask(task);
    this.updateBadge('running');

    let startTab = null;
    try {
      this.driver.enable();
      startTab = await this.pickStartTab(windowId);
      await this.driver.setMode('acting');
    } catch (err) {
      console.warn('[jarvis] could not pick a start tab:', err?.message || err);
    }

    run.policy = this.policy(run);
    const executor = new Executor({
      driver: this.driver,
      encoder: this.encoder,
      policy: run.policy,
      hooks: {
        onInjection: ({ toolId, url, quotes }) => this.noteInjection(run, quotes, url, toolId),
        onThumb: (stepId, dataUrl) => this.setThumb(task, stepId, dataUrl),
      },
    });
    const env = {
      client: this.createClient({ apiKey, baseURL: await this.store.getApiBase() }),
      model: settings.model,
      system: this.system,
      tools: this.tools,
      conversation: this.conversation,
      executor,
      limits,
      features: this.features,
      signal: run.abort.signal,
      approvals: run.approvals,
      ask: (prompt) => this.ask(run, prompt),
      confirm: ({ action, category, source, site, facts }) => this.confirm(run, { action, category, source, site: site ?? this.currentSite(), facts: facts ? `What it covers: ${this.describeStep(facts)}` : '' }),
      site: () => this.currentSite(),
      scope: () => this.currentScope(),
      isCurrent: () => this.run === run && !run.orphaned,
      retryDelaysMs: this.retryDelaysMs,
      takeoverRequested: () => run.takeover,
      takeoverEpoch: () => run.takeovers,
      waitForResume: () => this.waitForResume(run),
      emit: this.emitter(run),
    };

    const work = (async () => {
      let outcome;
      try {
        outcome = await runTask(env, resume ? null : taskMessage(clean, { now: new Date(this.now()), startTab, retry: !!retryOf }));
      } catch (err) {
        if (isAbort(err)) outcome = { status: 'stopped', answer: '', error: null };
        else {
          console.error('[jarvis] task failed:', err?.stack || err);
          outcome = { status: 'error', answer: '', error: `Something went wrong: ${truncate(singleLine(err?.message || err), 200)}` };
        }
      }
      await this.finishRun(run, outcome);
    })();
    run.done = work;
    await work;
  }

  async finishRun(run, outcome) {
    // A run Stop already ended (it hung in a call that never returned) finishes nothing more: its
    // late cleanup must not touch the next task's tabs.
    if (run.orphaned) return;
    // Release the tabs before another task may start, so its new debugger sessions are never
    // detached by this one's cleanup.
    await this.driver.releaseAll();
    if (this.run === run) this.run = null;
    this.updateBadge(null);
    await this.finishTask(run.task, outcome.status, outcome);
    // Anything still waiting for the owner (a download, a page's question) ends with the task.
    this.settleDownloads(run);
    if (!run.abort.signal.aborted) run.abort.abort();
  }

  finishTask(task, status, { answer = '', error = null, errorKind = null } = {}) {
    if (!FINAL_STATUSES.has(task.status) || task.status === 'stopped') {
      task.status = task.stoppedVia ? 'stopped' : status;
      if (answer) task.answer = displayText(answer);
      if (error) task.error = displayText(error);
      if (task.status === 'error' && errorKind) {
        // Retry can carry on from here, in the same conversation, while nothing else was asked since.
        task.errorKind = errorKind;
        task.resumeAt = { chatId: this.chatId, length: this.conversation.length };
      }
      task.endedAt = task.endedAt || this.now();
      task.prompt = null;
      task.narration = '';
      for (const s of task.steps) if (s.status === 'running') s.status = status === 'done' ? 'done' : 'skipped';
    }
    this.emitTask(task);
    if (this.run?.task === task) this.run = null;
    return this.saveHistory(task).catch(() => {});
  }

  async saveHistory(task) {
    const thumbs = this.thumbs.get(task.id) || new Map();
    await this.store.saveTask({
      id: task.id,
      text: task.text,
      status: task.status,
      answer: task.answer,
      error: task.error,
      cost: task.cost,
      model: task.model,
      startedAt: task.startedAt,
      endedAt: task.endedAt,
      injections: task.injections,
      steps: task.steps.map((s) => ({ kind: s.kind, label: s.label, status: s.status, ...(thumbs.get(s.id) ? { thumb: thumbs.get(s.id) } : {}) })),
    });
  }

  emitter(run) {
    const task = run.task;
    return {
      step: (step) => {
        const s = { id: uid('s'), at: this.now(), ...step };
        task.steps.push(s);
        if (step.kind === 'action') task.narration = '';
        this.emitTask(task);
        return s.id;
      },
      update: (id, patch) => {
        const s = task.steps.find((x) => x.id === id);
        if (!s) return;
        Object.assign(s, patch);
        this.emitTask(task);
      },
      remove: (id) => {
        const i = task.steps.findIndex((x) => x.id === id);
        if (i < 0) return;
        task.steps.splice(i, 1);
        this.emitTask(task);
      },
      narration: (text) => {
        task.narration = text;
        this.post({ type: 'narration', taskId: task.id, text });
      },
      usage: (cost, usage, model) => {
        task.cost += cost;
        addUsage(task.usage, usage);
        const note = `Part of this task was answered by ${model} (a fallback model).`;
        if (model && model !== task.model && !MODELS[model] && !task.notices.includes(note)) task.notices.push(note);
        task.limits = run.limits.snapshot();
        this.emitTask(task);
      },
      injection: ({ quote, tabId }) => this.noteInjection(run, quote ? [quote] : [], null, tabId),
      notice: (text, level = 'info') => {
        task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level, label: text, status: 'done' });
        this.emitTask(task);
      },
    };
  }

  noteInjection(run, quotes, url, toolId) {
    const task = run.task;
    const norm = (q) =>
      String(q)
        .toLowerCase()
        .replace(/[\u2018\u2019\u201c\u201d"'`]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[.!?…]+$/, '')
        .trim();
    for (const quote of quotes) {
      const n = norm(quote);
      // Claude's own report often quotes what the page scan already found: show it once.
      if (!n || task.injections.some((i) => norm(i.quote).includes(n) || n.includes(norm(i.quote)))) continue;
      const site = url ? siteOf(url) : '';
      task.injections.push({ quote, site, tabId: toolId || '' });
      task.steps.push({ id: uid('s'), at: this.now(), kind: 'warning', label: `Ignored instructions hidden in ${site || 'the page'}: “${truncate(quote, 160)}”`, status: 'done' });
    }
    this.emitTask(task);
  }

  setThumb(task, stepId, dataUrl) {
    const map = this.thumbs.get(task.id);
    if (!map) return;
    map.set(stepId, dataUrl);
    const s = task.steps.find((x) => x.id === stepId);
    if (s) s.thumb = true;
    this.post({ type: 'thumb', taskId: task.id, stepId, dataUrl });
  }

  currentSite() {
    const t = this.driver.active();
    return t && /^https?:/i.test(t.url || '') ? siteOf(t.url) : '';
  }

  /** Where an approval asked now applies: the site, page, tab and document Jarvis works in. */
  currentScope() {
    const t = this.driver.active();
    if (!t || !/^https?:/i.test(t.url || '')) return { site: '', url: '', tabId: '' };
    return { site: siteOf(t.url), url: t.url, tabId: t.toolId, doc: t.docSeq };
  }

  /** The tab a new task starts in (see pickStartTab in the README's architecture notes). */
  async pickStartTab(windowId) {
    const tabs = await this.chrome.tabs.query({ windowType: 'normal' });
    const ownPage = (u) => typeof u === 'string' && u.startsWith(`chrome-extension://${this.chrome.runtime?.id || ''}`);
    const web = (t) => t && /^https?:/i.test(t.url || t.pendingUrl || '') && isActionableUrl(t.url || t.pendingUrl);
    const inWindow = tabs.filter((t) => windowId === undefined || windowId === null || t.windowId === windowId);
    const active = inWindow.find((t) => t.active);
    let pick = null;
    if (active && web(active)) pick = active;
    else if (!active || ownPage(active.url)) {
      // The panel itself is open as a tab (or popped out): use the most recent web tab, preferring
      // the active tab of another window.
      const byRecent = (a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0);
      pick = inWindow.filter(web).sort(byRecent)[0] || tabs.filter((t) => t.active && web(t)).sort(byRecent)[0] || null;
    }
    if (!pick) {
      this.driver.windowId = windowId ?? this.driver.windowId;
      return null; // Claude starts with new_tab / navigate
    }
    this.driver.windowId = pick.windowId;
    const id = this.driver.register(pick);
    this.driver.activeToolId = id;
    return this.driver.get(id);
  }

  // -------------------------------------------------------------------------------------------
  // Prompts

  /**
   * Asks the owner (one prompt at a time: a download or a page's question that comes up while
   * another prompt waits is shown after it). Resolves with the choice id. `timeoutMs`: the choice
   * made for the owner when they don't answer in time (`timeoutChoice`).
   */
  ask(run, prompt) {
    const turn = run.promptQueue.then(() => this.askNow(run, prompt));
    run.promptQueue = turn.catch(() => {});
    return turn;
  }

  askNow(run, prompt) {
    const choices = PROMPT_CHOICES[prompt.kind] || [];
    return new Promise((resolve, reject) => {
      if (run.abort.signal.aborted) return reject(abortError());
      const id = uid('p_');
      const onAbort = () => done(reject, abortError());
      let timer = 0;
      if (prompt.timeoutMs) timer = setTimeout(() => done(resolve, prompt.timeoutChoice), prompt.timeoutMs);
      const done = (fn, v) => {
        clearTimeout(timer);
        run.abort.signal.removeEventListener('abort', onAbort);
        if (run.prompt?.id === id) run.prompt = null;
        if (run.task.prompt?.id === id) run.task.prompt = null;
        if (!FINAL_STATUSES.has(run.task.status)) {
          run.task.status = run.takeover ? 'paused' : 'running';
          this.updateBadge(run.takeover ? 'paused' : 'running');
          if (!run.takeover) this.driver.setMode('acting').catch(() => {});
        }
        this.emitTask(run.task);
        fn(v);
      };
      run.abort.signal.addEventListener('abort', onAbort, { once: true });
      run.prompt = { id, choices, resolve: (v) => done(resolve, v) };
      run.task.prompt = { id, kind: prompt.kind, title: prompt.title, body: prompt.body, facts: prompt.facts || '', site: prompt.site || '', category: prompt.category || '', detail: prompt.detail || '', source: prompt.source || '', consequential: !!prompt.consequential, choices: prompt.choices };
      run.task.status = 'waiting';
      this.updateBadge('waiting');
      if (!run.takeover) this.driver.setMode('waiting').catch(() => {});
      this.emitTask(run.task);
    });
  }

  decide(promptId, choice) {
    const run = this.run;
    if (!run?.prompt || run.prompt.id !== promptId) return;
    if (!run.prompt.choices.includes(choice)) return;
    run.prompt.resolve(choice);
  }

  async confirm(run, { action, category, source, site, facts = '', consequential, title, timeoutMs = 0 }) {
    const what = CATEGORY_CHIPS[category] || 'Consequential action';
    const choice = await this.ask(run, {
      kind: 'confirm',
      source,
      category,
      site,
      consequential: consequential ?? category !== 'change',
      title: title || (source === 'guard' ? 'Approve this step?' : 'Jarvis asks for your approval'),
      body: action,
      facts,
      choices: [
        { id: 'approve', label: 'Approve', tone: 'primary' },
        { id: 'cancel', label: 'Cancel', tone: 'danger' },
      ],
      detail: what,
      timeoutMs,
      timeoutChoice: 'cancel',
    });
    return choice === 'approve';
  }

  /**
   * The owner's prompt for one step: what Jarvis will do to which element (its kind, its text and
   * what the page labels it), the item it belongs to, what is selected, where a link goes, and
   * what the guard recognises it would do.
   */
  describeStep(c) {
    const q = (s, n) => truncate(singleLine(s), n);
    const shown = c.label ? (c.plain ? ` ${q(c.label, 60)}` : ` "${q(c.label, 60)}"`) : c.unlabelled ? ` ${c.unlabelled}` : '';
    const alias = c.alias && c.alias !== c.label ? ` (labelled "${q(c.alias, 40)}")` : '';
    const role = c.role && c.label ? ` (${c.role})` : '';
    const hidden = c.hidden ? ' (inside a part of the page hidden from Jarvis)' : '';
    const item = c.item ? ` next to “${q(c.item, 140)}”` : '';
    const sel = c.selection?.count ? ` with ${c.selection.count} item${c.selection.count === 1 ? '' : 's'} selected (${c.selection.names.map((n) => q(n, 32)).join('; ')}${c.selection.count > c.selection.names.length ? '; …' : ''})` : '';
    const detail = c.detail ? ` ${c.detail}` : '';
    const where = c.url && /^https?:/i.test(c.url) ? shortUrl(c.url, 60) : c.site || 'this page';
    const dest = c.dest ? ` It opens ${shortUrl(c.dest, 70)}.` : '';
    const what = c.consequential ? ` This looks like ${c.reason || GUARD_CATEGORIES[c.category]}.` : !c.label && c.unlabelled ? " Jarvis can't tell what it does." : '';
    return `${c.verb}${shown}${alias}${role}${hidden}${item}${sel}${detail} on ${where}.${dest}${what}`;
  }

  policy(run) {
    return {
      checkSite: async (url) => {
        const site = siteOf(url);
        if (!site) return null;
        const denied = () => `Error: the owner did not allow Jarvis to work on ${site}. Don't try this site again; tell the owner, or use another site if the task allows.`;
        if (run.sitesDenied.has(site)) return denied();
        if (run.sitesAllowed.has(site)) return null;
        const always = await this.store.getSites();
        if (always[site] === 'always') {
          run.sitesAllowed.add(site);
          return null;
        }
        // The same site asked about twice at once (a page load and a step): one prompt answers both.
        run.sitePrompts = run.sitePrompts || new Map();
        if (run.sitePrompts.has(site)) {
          await run.sitePrompts.get(site).catch(() => {});
          return run.sitesAllowed.has(site) ? null : denied();
        }
        let host = '';
        try {
          host = new URL(url).hostname;
        } catch {
          host = '';
        }
        const asking = this.ask(run, {
          kind: 'site',
          site,
          title: `Let Jarvis work on ${site}?`,
          body: `Jarvis wants to read and use ${host && host !== site ? `${host} (part of ${site})` : site} in your browser for this task.`,
          choices: [
            { id: 'once', label: 'Allow once', tone: 'primary' },
            { id: 'always', label: 'Always for this site', tone: 'secondary' },
            { id: 'deny', label: 'Deny', tone: 'danger' },
          ],
        });
        run.sitePrompts.set(site, asking);
        let choice;
        try {
          choice = await asking;
        } finally {
          run.sitePrompts.delete(site);
        }
        if (choice === 'always') {
          await this.store.allowSiteAlways(site);
          run.sitesAllowed.add(site);
          run.always = { ...(run.always || {}), [site]: 'always' };
          return null;
        }
        if (choice === 'once') {
          run.sitesAllowed.add(site);
          return null;
        }
        run.sitesDenied.add(site);
        run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `You denied access to ${site}.`, status: 'done' });
        return denied();
      },
      confirmGuard: async (c) => {
        const site = c.site || '';
        const what = GUARD_CATEGORIES[c.category] || 'a step that changes something';
        const quoted = c.label ? ` ${this.quoteLabel(run, c)}` : '';
        if (c.consequential && run.approvals.isDeclined(c.category, site)) {
          return `Blocked: the owner already declined ${what} on ${site || 'this page'} in this task. It was not done. Don't try again or find another way; tell the owner and finish.`;
        }
        if (run.approvals.isDeclinedElement(c.element) || (c.dest && run.approvals.isDeclinedHref(c.dest))) {
          return `Blocked: the owner already declined this step (${c.verb}${quoted}) in this task. It was not done. Don't try again or find another way; tell the owner and finish.`;
        }
        // Covered by the owner's request_confirmation approval of exactly this element, in this
        // state (used up now).
        if (c.bind && run.approvals.consume({ ...c.bind, site, tabId: c.toolId, url: c.url })) return null;
        const ok = await this.confirm(run, { action: this.describeStep(c), category: c.category, source: 'guard', site, consequential: !!c.consequential });
        if (ok) return null;
        run.approvals.decline(c.category, site, { element: c.element, href: c.dest });
        const shown = c.label ? ` "${truncate(singleLine(c.label), 60)}"` : '';
        run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `You cancelled: ${c.verb}${shown}. Jarvis did not do it.`, status: 'done' });
        return `Blocked: the owner declined this step (${c.verb}${quoted}${c.consequential ? `: ${c.reason || what}` : ''}). It was not done. Don't try it again or find another way to do it; tell the owner and finish.`;
      },
      everyday: (site) => !!(site && run.everyday?.[site] === true),
      isAllowed: (site) => !!site && (run.sitesAllowed.has(site) || run.always?.[site] === 'always') && !run.sitesDenied.has(site),
      isDeclinedHref: (url) => run.approvals.isDeclinedHref(url),
      isDeclinedElement: (key) => run.approvals.isDeclinedElement(key),
      allowDownload: ({ url, site }) => run.downloadAllowances.push({ url, site, until: this.now() + DOWNLOAD_ALLOWANCE_MS }),
      awaitDownload: (url, opts) => this.awaitDownload(run, url, opts),
      drainDownloads: () => {
        const out = run.downloads.filter((d) => d.seq > run.downloadsReported).map((d) => ({ name: d.name, site: d.site, verdict: d.verdict }));
        run.downloadsReported = run.downloadSeq;
        return out;
      },
      onBlocked: (text) => {
        run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: text, status: 'done' });
        this.emitTask(run.task);
      },
      onSecret: (kind) => {
        const what = SECRET_NAMES[kind] || 'a secret';
        const ask = kind === 'password' ? 'Please sign in yourself, then tell Jarvis to continue.' : 'Please enter it yourself, then tell Jarvis to continue.';
        run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `Jarvis won’t type ${what}. ${ask}`, status: 'done' });
        this.emitTask(run.task);
      },
    };
  }

  /**
   * Whether to accept a JavaScript dialog the page opened. Alerts are just acknowledged. "Leave
   * site?" (beforeunload) is refused: the owner's unsaved work stays. A prompt() is dismissed
   * (Jarvis types nothing into it). A confirm() ("Are you sure?") is the page asking a question:
   * Jarvis never answers it for the owner. It is held open and shown to the owner with its text
   * and what Jarvis just did; only their Approve answers OK (and no answer within
   * DIALOG_ANSWER_MS answers Cancel). Returns a boolean, or a promise of one.
   */
  dialogPolicy(toolId, dialog) {
    const run = this.run;
    const t = this.driver.get(toolId);
    if (dialog.type === 'alert') return true;
    if (dialog.type !== 'confirm' || !run || !t || run.takeover || run.stopping || run.abort.signal.aborted) return false;
    const site = siteOf(t.url);
    if (!site) return false;
    const category = classifyDialogText(dialog.message);
    if (category && run.approvals.isDeclined(category, site)) return false;
    const step = [...run.task.steps].reverse().find((s) => s.kind === 'action');
    const doing = step ? singleLine(step.label).replace(/…$/, '') : '';
    const when = doing ? ` (as Jarvis is ${doing.charAt(0).toLowerCase()}${doing.slice(1)})` : '';
    const quoted = truncate(singleLine(dialog.message), 300);
    const action = `The page ${shortUrl(t.url, 60)} asks: “${quoted || '(no text)'}”${when}. Approve answers OK; Cancel answers Cancel.`;
    return this.confirm(run, { action, category: category || 'dialog', source: 'guard', site, consequential: true, title: 'The page asks you', timeoutMs: DIALOG_ANSWER_MS }).then(
      (ok) => {
        if (!ok && category) run.approvals.decline(category, site);
        return ok;
      },
      () => false,
    );
  }

  /**
   * A page Jarvis works in wants to load `url` in the tab (a link, a script, a redirect) while
   * Jarvis acts: a denied site (or an address the owner declined) never loads; a site not asked
   * about yet is asked first. The owner's own page loads during Take over are not checked.
   */
  async navigationPolicy(toolId, url) {
    const run = this.run;
    if (!run || run.takeover || run.stopping || run.abort.signal.aborted) return true;
    if (blockedReason(url)) return false;
    const site = siteOf(url);
    if (!site) return true;
    if (run.approvals.isDeclinedHref(url)) {
      run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `Jarvis stopped the page from opening ${shortUrl(url, 60)}, which you declined.`, status: 'done' });
      this.emitTask(run.task);
      return false;
    }
    if (run.sitesDenied.has(site)) {
      run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `Jarvis stopped the page from opening ${site}, which you denied.`, status: 'done' });
      this.emitTask(run.task);
      return false;
    }
    if (run.sitesAllowed.has(site)) return true;
    try {
      return !(await run.policy.checkSite(url));
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Downloads (chrome.downloads.onDeterminingFilename, wired by the service worker)

  /**
   * A download starts while a task runs: it is held (no file is written) until the owner decides.
   * Returns true when held (the listener then answers Chrome later), false to leave it alone (no
   * task running, or the owner has taken over).
   */
  holdDownload(item, suggest) {
    const run = this.run;
    if (!run || run.takeover || run.stopping || run.abort.signal.aborted || run.orphaned) return false;
    const url = String(item?.finalUrl || item?.url || '');
    const site = siteOf(url) || siteOf(String(item?.referrer || '')) || '';
    const name = basename(item?.filename) || basename(new URL(url, 'http://x/').pathname) || 'a file';
    const size = item?.totalBytes > 0 ? item.totalBytes : item?.fileSize > 0 ? item.fileSize : 0;
    const rec = { id: item?.id, url, site, name, size, verdict: 'pending', seq: ++run.downloadSeq };
    rec.promise = new Promise((resolve) => (rec.resolve = resolve));
    rec.settle = async (ok) => {
      if (rec.verdict !== 'pending') return;
      rec.verdict = ok ? 'approved' : 'declined';
      if (!ok) {
        try {
          await this.chrome.downloads?.cancel?.(item.id);
        } catch {
          /* already gone */
        }
      }
      try {
        suggest();
      } catch {
        /* Chrome stopped waiting */
      }
      rec.resolve(rec.verdict);
      run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: ok ? 'info' : 'warn', label: ok ? `Saved “${truncate(name, 60)}” to your Downloads folder.` : `Jarvis did not save “${truncate(name, 60)}”.`, status: 'done' });
      this.emitTask(run.task);
    };
    run.downloads.push(rec);
    const now = this.now();
    run.downloadAllowances = run.downloadAllowances.filter((a) => a.until > now);
    const allowance = run.downloadAllowances.findIndex((a) => (a.url && (a.url === url || a.url === item?.url)) || (!a.url && a.site && a.site === site));
    if (allowance >= 0) {
      // The owner approved this download a moment ago (the link to it, or its address).
      run.downloadAllowances.splice(allowance, 1);
      rec.settle(true);
      return true;
    }
    this.confirm(run, {
      action: `Save the file “${truncate(name, 80)}”${size ? ` (${formatBytes(size)})` : ''} from ${site || 'a page'}? A page Jarvis is working in started this download.`,
      category: 'download',
      source: 'guard',
      site,
      consequential: true,
      title: 'Save this download?',
    }).then((ok) => rec.settle(ok), () => rec.settle(false));
    return true;
  }

  /** Ends every download still held (task over, Stop, Take over): nothing is saved. */
  settleDownloads(run) {
    for (const d of run?.downloads || []) if (d.verdict === 'pending') d.settle(false);
  }

  /** The owner's decision on the download navigate just started (waits a moment for it to appear). */
  async awaitDownload(run, url, { signal, appearMs = 5000 } = {}) {
    const started = Date.now();
    for (;;) {
      const rec = [...run.downloads].reverse().find((d) => d.url === url || d.verdict === 'pending');
      if (rec) return rec.promise;
      if (signal?.aborted) throw abortError();
      if (Date.now() - started > appearMs) return null;
      await sleep(100);
    }
  }

  /** A page label quoted for Claude inside a refusal: marked as page content, scanned for injections. */
  quoteLabel(run, c) {
    const { text, injections } = inlineUntrusted(truncate(singleLine(c.label), 60));
    if (injections.length) this.noteInjection(run, injections, c.url, c.toolId);
    return text;
  }

  /** The control bar's own styles could not be applied on a page (not the page's doing). */
  onUnstyled(toolId) {
    const run = this.run;
    if (!run || run.unstyledWarned) return;
    run.unstyledWarned = true;
    const t = this.driver.get(toolId);
    const site = t ? siteOf(t.url) : '';
    run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `Jarvis's control bar can't be drawn properly on ${site || 'this page'}. Stop Jarvis here, with Esc, or with ${this.platform === 'mac' ? '⌘⇧.' : 'Ctrl+Shift+.'}.`, status: 'done' });
    this.emitTask(run.task);
  }

  /** The page keeps hiding or covering the control bar: tell the owner (once per task). */
  onTamper(toolId) {
    const run = this.run;
    if (!run || run.tamperWarned) return;
    run.tamperWarned = true;
    const t = this.driver.get(toolId);
    const site = t ? siteOf(t.url) : '';
    run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `${site || 'This page'} is hiding Jarvis's control bar. Jarvis is still working: Stop it here or with ${this.platform === 'mac' ? '⌘⇧.' : 'Ctrl+Shift+.'} if anything looks wrong.`, status: 'done' });
    this.emitTask(run.task);
  }

  // -------------------------------------------------------------------------------------------
  // Stop, take over, continue

  /** Stops the running task at once: aborts the API request, releases the debugger. */
  async stop(via = 'panel') {
    const run = this.run;
    if (!run || run.stopping) return;
    run.stopping = true;
    run.task.stoppedVia = via;
    run.abort.abort();
    run.resumeWaiter?.reject(abortError());
    // The task card turns "stopped" right away; the loop finishes the bookkeeping when it unwinds.
    run.task.status = 'stopped';
    run.task.prompt = null;
    run.task.endedAt = this.now();
    for (const s of run.task.steps) if (s.status === 'running') s.status = 'skipped';
    this.updateBadge(null);
    this.settleDownloads(run);
    const release = this.driver.releaseAll();
    this.emitTask(run.task);
    await release;
    // A call that never returns (Chrome holding a tab open that asked "Leave site?", a page that
    // stopped answering) must not keep Jarvis busy: if the run has not ended within a second, it
    // ends here, and its late unwinding changes nothing.
    await Promise.race([run.done || Promise.resolve(), sleep(1000)]);
    if (this.run === run) this.orphan(run);
  }

  /** Ends a stopped run that did not unwind: every tool call gets its result, and Jarvis is free. */
  orphan(run) {
    run.orphaned = true;
    const last = this.conversation.last();
    if (last?.role === 'assistant' && Array.isArray(last.content)) {
      const uses = last.content.filter((b) => b.type === 'tool_use');
      if (uses.length) {
        this.conversation.append({
          role: 'user',
          content: uses.map((tu) => (tu.toolset_name === TOOLSET_NAME ? memberResult(tu.id, STOPPED_TEXT, true) : { type: 'tool_result', tool_use_id: tu.id, content: STOPPED_TEXT, is_error: true })),
        });
      }
    }
    this.run = null;
    this.updateBadge(null);
    this.finishTask(run.task, 'stopped');
  }

  async takeover() {
    const run = this.run;
    if (!run || run.takeover || run.stopping) return;
    run.takeover = true;
    run.takeovers += 1;
    run.task.status = run.task.prompt ? 'waiting' : 'paused';
    this.updateBadge('paused');
    // Downloads Jarvis's pages started and the owner has not approved yet do not happen.
    this.settleDownloads(run);
    await this.driver.releaseAll();
    this.emitTask(run.task);
  }

  resume() {
    const run = this.run;
    if (!run || !run.takeover || run.stopping) return;
    run.takeover = false;
    this.driver.enable();
    run.task.status = run.task.prompt ? 'waiting' : 'running';
    this.updateBadge(run.task.prompt ? 'waiting' : 'running');
    this.driver.setMode('acting').catch(() => {});
    const waiter = run.resumeWaiter;
    run.resumeWaiter = null;
    waiter?.resolve();
    this.emitTask(run.task);
  }

  waitForResume(run) {
    if (!run.takeover) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (run.abort.signal.aborted) return reject(abortError());
      run.resumeWaiter = { resolve, reject };
      run.task.status = 'paused';
      this.emitTask(run.task);
    });
  }

  onDebuggerDetached(toolId, reason) {
    // The owner pressed "Cancel" on Chrome's "started debugging this browser" bar: that revokes
    // Jarvis's control, so the task stops.
    if (reason === 'canceled_by_user' && this.run && !this.run.takeover) this.stop('chrome');
  }

  /**
   * Retry. After a temporary error (rate limit, overload, a server or connection problem) the
   * conversation is still valid and nothing else was asked since: Jarvis carries on where it
   * stopped, with everything said so far. Otherwise (a finished, stopped or failed task) it runs
   * the task again from the start, in a fresh conversation.
   */
  async retry(taskId, windowId) {
    const prev = this.tasks.find((t) => t.id === taskId);
    if (!prev || this.run) return;
    const at = prev.resumeAt;
    const last = this.conversation.last();
    const resumable = prev.status === 'error' && RESUMABLE.has(prev.errorKind) && at && at.chatId === this.chatId && at.length === this.conversation.length && last?.role === 'user';
    if (resumable) {
      if (Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result')) {
        this.conversation.append({ role: 'user', content: [{ type: 'text', text: RETRY_NOTE }] });
      }
      await this.start({ text: prev.text, windowId, retryOf: prev.id, resume: true });
      return;
    }
    this.resetConversation();
    await this.start({ text: prev.text, windowId, retryOf: prev.id, contextReset: true });
  }

  resetConversation() {
    this.chatId = uid('chat_');
    this.conversation = new Conversation({ id: this.chatId });
    this.driver.reset();
  }

  async newChat({ clear }) {
    if (this.run) return;
    this.resetConversation();
    if (clear) {
      this.tasks = [];
      this.thumbs.clear();
    }
    this.persistSoon();
    for (const p of this.ports) this.sendSnapshot(p);
  }

  /** Settings changed in another panel (or this one) while a task runs: the everyday-steps switches. */
  onStorageChanged(changes) {
    const run = this.run;
    if (!run || !changes) return;
    if (changes['jarvis.everyday']) {
      const v = changes['jarvis.everyday'].newValue;
      const map = {};
      if (v && typeof v === 'object') for (const [site, on] of Object.entries(v)) if (on === true) map[site] = true;
      run.everyday = map;
    }
    if (changes['jarvis.sites']) {
      const v = changes['jarvis.sites'].newValue;
      run.always = v && typeof v === 'object' ? { ...v } : {};
    }
  }

  updateBadge(state) {
    const action = this.chrome.action;
    if (!action) return;
    const [text, color] = (state && BADGE[state]) || ['', '#3ee0ff'];
    try {
      action.setBadgeText({ text });
      if (text) action.setBadgeBackgroundColor({ color });
    } catch {
      /* ignore */
    }
  }

  // -------------------------------------------------------------------------------------------
  // Session persistence (in memory, survives a service-worker restart, not a browser restart)

  persistSoon() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist().catch(() => {});
    }, 400);
  }

  async persist() {
    const session = this.chrome.storage?.session;
    if (!session) return;
    const base = {
      chatId: this.chatId,
      tasks: this.tasks.slice(-30),
      driver: { nextNum: this.driver.nextNum, tabs: [...this.driver.tabs.values()].map((t) => ({ toolId: t.toolId, chromeId: t.chromeId, url: t.url, title: t.title, nextRef: t.nextRef, closed: !!t.closed })) },
    };
    try {
      await session.set({ [SESSION_KEY]: { ...base, messages: this.conversation.messages } });
    } catch {
      // Too big for session storage (screenshots): keep the cards; the next task starts a fresh
      // conversation if the worker restarts.
      try {
        await session.set({ [SESSION_KEY]: { ...base, messages: null } });
      } catch {
        /* ignore */
      }
    }
  }

  async restore() {
    const session = this.chrome.storage?.session;
    if (!session) return;
    let saved;
    try {
      saved = (await session.get(SESSION_KEY))[SESSION_KEY];
    } catch {
      return;
    }
    if (!saved) return;
    this.chatId = saved.chatId || this.chatId;
    this.tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
    for (const t of this.tasks) {
      this.thumbs.set(t.id, new Map());
      if (!FINAL_STATUSES.has(t.status)) {
        t.status = 'interrupted';
        t.prompt = null;
        t.error = 'Chrome restarted Jarvis’s background worker during this task. Press Retry to run it again.';
        t.endedAt = this.now();
      }
    }
    if (Array.isArray(saved.messages)) {
      try {
        this.conversation = new Conversation({ id: this.chatId, messages: saved.messages });
        // An interrupted round may have left tool calls unanswered; start fresh in that case.
        const last = this.conversation.last();
        if (last?.role === 'assistant' && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_use')) this.resetConversation();
      } catch {
        this.resetConversation();
      }
    }
    if (saved.driver?.tabs) {
      for (const t of saved.driver.tabs) if (!t.closed) this.driver.restoreTab(t);
      this.driver.nextNum = Math.max(this.driver.nextNum, saved.driver.nextNum || 1);
    }
  }
}
