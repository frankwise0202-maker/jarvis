// The controller: the service worker's state and its decisions. It owns the conversation, the
// tasks shown in the side panel, the owner's prompts (site permission, confirmations, limits),
// Stop / Take over / Continue, and what is kept (history) and where.
//
// One task runs at a time. Every open side panel holds a port and receives the same updates.

import { FINAL_STATUSES, PORT_NAME, PROMPT_CHOICES } from '../shared/protocol.js';
import { abortError, displayText, isAbort, jsonCopy, singleLine, truncate, uid } from '../shared/util.js';
import { Conversation } from './history.js';
import { Driver } from './driver.js';
import { Executor } from './executor.js';
import { Approvals, CATEGORY_CHIPS, GUARD_CATEGORIES, SECRET_NAMES, classifyDialogText, isGenericLabel } from './guard.js';
import { Limits } from './limits.js';
import { MODELS, addUsage } from './models.js';
import { systemPrompt, taskMessage, tools } from './prompts.js';
import { runTask } from './agent.js';
import { isActionableUrl, shortUrl, siteOf } from './sites.js';

const SESSION_KEY = 'jarvis.session';
// Errors that a second try usually fixes: Retry then continues the same conversation.
const RESUMABLE = new Set(['rate_limit', 'overloaded', 'server', 'network']);
const BADGE = { running: ['•', '#3ee0ff'], waiting: ['!', '#ffc457'], paused: ['II', '#ffc457'] };

export const RETRY_NOTE = '[Jarvis: the last request failed with a temporary error and the owner pressed Retry. The pages may have changed since: look again (read_page or screenshot) before you act.]';

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
    });
    this.driver.onTamper = (toolId) => this.onTamper(toolId);
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
      prompt: null,
      takeover: false,
      takeovers: 0,
      resumeWaiter: null,
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

    const executor = new Executor({
      driver: this.driver,
      encoder: this.encoder,
      policy: this.policy(run),
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
      confirm: ({ action, category, source, site }) => this.confirm(run, { action, category, source, site: site ?? this.currentSite() }),
      site: () => this.currentSite(),
      scope: () => this.currentScope(),
      retryDelaysMs: this.retryDelaysMs,
      takeoverRequested: () => run.takeover,
      takeoverEpoch: () => run.takeovers,
      waitForResume: () => this.waitForResume(run),
      emit: this.emitter(run),
    };

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
  }

  async finishRun(run, outcome) {
    // Release the tabs before another task may start, so its new debugger sessions are never
    // detached by this one's cleanup.
    await this.driver.releaseAll();
    if (this.run === run) this.run = null;
    this.updateBadge(null);
    await this.finishTask(run.task, outcome.status, outcome);
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

  /** Where an approval asked now applies: the site, page and tab Jarvis works in. */
  currentScope() {
    const t = this.driver.active();
    if (!t || !/^https?:/i.test(t.url || '')) return { site: '', url: '', tabId: '' };
    return { site: siteOf(t.url), url: t.url, tabId: t.toolId };
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

  ask(run, prompt) {
    const choices = PROMPT_CHOICES[prompt.kind] || [];
    return new Promise((resolve, reject) => {
      if (run.abort.signal.aborted) return reject(abortError());
      const id = uid('p_');
      const onAbort = () => done(reject, abortError());
      const done = (fn, v) => {
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
      run.task.prompt = { id, kind: prompt.kind, title: prompt.title, body: prompt.body, site: prompt.site || '', category: prompt.category || '', detail: prompt.detail || '', source: prompt.source || '', choices: prompt.choices };
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

  async confirm(run, { action, category, source, site }) {
    const what = CATEGORY_CHIPS[category] || 'Consequential action';
    const choice = await this.ask(run, {
      kind: 'confirm',
      source,
      category,
      site,
      title: source === 'guard' ? 'Approve this action?' : 'Jarvis asks for your approval',
      body: action,
      choices: [
        { id: 'approve', label: 'Approve', tone: 'primary' },
        { id: 'cancel', label: 'Cancel', tone: 'danger' },
      ],
      detail: what,
    });
    return choice === 'approve';
  }

  policy(run) {
    return {
      checkSite: async (url) => {
        const site = siteOf(url);
        if (!site) return null;
        if (run.sitesDenied.has(site)) return `Error: the owner did not allow Jarvis to work on ${site}. Don't try this site again; tell the owner, or use another site if the task allows.`;
        if (run.sitesAllowed.has(site)) return null;
        const always = await this.store.getSites();
        if (always[site] === 'always') {
          run.sitesAllowed.add(site);
          return null;
        }
        const choice = await this.ask(run, {
          kind: 'site',
          site,
          title: `Let Jarvis work on ${site}?`,
          body: `Jarvis wants to read and use ${site} in your browser for this task.`,
          choices: [
            { id: 'once', label: 'Allow once', tone: 'primary' },
            { id: 'always', label: 'Always for this site', tone: 'secondary' },
            { id: 'deny', label: 'Deny', tone: 'danger' },
          ],
        });
        if (choice === 'always') {
          await this.store.allowSiteAlways(site);
          run.sitesAllowed.add(site);
          return null;
        }
        if (choice === 'once') {
          run.sitesAllowed.add(site);
          return null;
        }
        run.sitesDenied.add(site);
        run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `You denied access to ${site}.`, status: 'done' });
        return `Error: the owner did not allow Jarvis to work on ${site}. Don't try this site again; tell the owner, or use another site if the task allows.`;
      },
      confirmGuard: async (c) => {
        const site = c.site || '';
        const what = GUARD_CATEGORIES[c.category] || 'a consequential action';
        if (run.approvals.isDeclined(c.category, site)) {
          return `Blocked: the owner already declined ${what} on ${site || 'this page'} in this task. It was not done. Don't try again or find another way; tell the owner and finish.`;
        }
        // Covered by the owner's request_confirmation approval of exactly this (used up now).
        if (c.category !== 'frame' && run.approvals.consume(c.category, site, { tabId: c.toolId, url: c.url, label: c.label, alias: c.alias, generic: isGenericLabel(c.label) })) return null;
        const shown = c.label ? ` "${truncate(singleLine(c.label), 60)}"` : '';
        const alias = c.alias ? ` (labelled "${truncate(singleLine(c.alias), 40)}")` : '';
        const where = c.url && /^https?:/i.test(c.url) ? shortUrl(c.url, 60) : site || 'this page';
        const action = `${c.verb}${shown}${alias} on ${where} — this looks like ${c.reason || what}.`;
        const ok = await this.confirm(run, { action, category: c.category, source: 'guard', site });
        // Approve covers exactly this action, once: nothing is stored for later ones.
        if (ok) return null;
        run.approvals.decline(c.category, site);
        run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `You cancelled: ${c.verb}${shown}. Jarvis did not do it.`, status: 'done' });
        return `Blocked: the owner declined this action (${c.verb}${shown}: ${c.reason || what}). It was not done. Don't try it again or find another way to do it; tell the owner and finish.`;
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
   * Whether to accept a JavaScript dialog the page opened. Alerts are just acknowledged.
   * "Leave site?" (beforeunload) is refused: the owner's unsaved work stays. A confirm() is
   * accepted only as part of an action the owner approved: the approved click or key in this very
   * call (and the dialog is about the same kind of action), or a request_confirmation approval for
   * this page and tab (used up). Everything else is dismissed; Claude sees the dialog's text.
   */
  dialogPolicy(toolId, dialog) {
    const run = this.run;
    const t = this.driver.get(toolId);
    if (dialog.type === 'alert') return true;
    if (dialog.type !== 'confirm' || !run || !t) return false;
    const site = siteOf(t.url);
    if (!site) return false;
    const category = classifyDialogText(dialog.message);
    if (category && run.approvals.isDeclined(category, site)) return false;
    const arm = t.dialogArm;
    if (arm && arm.uses > 0 && Date.now() <= arm.until && arm.site === site && (!category || category === arm.category)) {
      arm.uses -= 1;
      return true;
    }
    return run.approvals.consumeForDialog(category, site, { tabId: toolId, url: t.url });
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
    const release = this.driver.releaseAll();
    this.emitTask(run.task);
    await release;
  }

  async takeover() {
    const run = this.run;
    if (!run || run.takeover || run.stopping) return;
    run.takeover = true;
    run.takeovers += 1;
    run.task.status = run.task.prompt ? 'waiting' : 'paused';
    this.updateBadge('paused');
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
