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
import { Approvals, CATEGORIES, CATEGORY_CHIPS, GUARD_CATEGORIES, SECRET_NAMES, classifyDialogText } from './guard.js';
import { addressAction } from './actions.js';
import { addressKey } from './address.js';
import { inlineUntrusted } from './injection.js';
import { Limits } from './limits.js';
import { MODELS, addUsage } from './models.js';
import { systemPrompt, taskMessage, tools } from './prompts.js';
import { STOPPED_TEXT, runTask } from './agent.js';
import { blockedReason, isActionableUrl, shortUrl, showUrl, siteOf } from './sites.js';

const SESSION_KEY = 'jarvis.session';
// Errors that a second try usually fixes: Retry then continues the same conversation.
const RESUMABLE = new Set(['rate_limit', 'overloaded', 'server', 'network']);
const BADGE = { running: ['•', '#3ee0ff'], waiting: ['!', '#ffc457'], paused: ['II', '#ffc457'] };

export const RETRY_NOTE = '[Jarvis: the last request failed with a temporary error and the owner pressed Retry. The pages may have changed since: look again (read_page or screenshot) before you act.]';

// How long the owner's OK to a page's "Are you sure?" question stands for the same question when
// Jarvis does the step again (the page got Cancel at once; see dialogPolicy).
export const DIALOG_REPEAT_MS = 30 * 1000;
// A download the owner approved a moment ago (the link to it, the address of it) is not asked again.
const DOWNLOAD_ALLOWANCE_MS = 30 * 1000;

const basename = (p) => String(p || '').split(/[\\/]/).pop() || '';

/** A file name shortened in the middle, so that its end (its real extension) always shows. */
export function shortFileName(name, max = 80) {
  const s = singleLine(String(name || ''));
  if (s.length <= max) return s;
  const tail = Math.min(36, Math.floor(max / 2));
  return `${s.slice(0, max - tail - 1)}…${s.slice(-tail)}`;
}

const FILE_KINDS = {
  pdf: 'a PDF document', html: 'a web page (.html)', htm: 'a web page (.htm)', xhtml: 'a web page (.xhtml)', svg: 'an SVG picture', txt: 'a text file', csv: 'a spreadsheet (.csv)',
  xlsx: 'a spreadsheet (.xlsx)', xls: 'a spreadsheet (.xls)', docx: 'a document (.docx)', doc: 'a document (.doc)', pptx: 'a presentation (.pptx)', png: 'a picture (.png)', jpg: 'a picture (.jpg)',
  jpeg: 'a picture (.jpeg)', gif: 'a picture (.gif)', webp: 'a picture (.webp)', zip: 'a zip archive', mp3: 'a sound file', mp4: 'a video', mov: 'a video', ics: 'a calendar invitation',
};
const RISKY_EXT = /^(app|dmg|pkg|mpkg|command|tool|sh|bash|zsh|scpt|applescript|workflow|terminal|jar|exe|msi|bat|cmd|com|scr|ps1|vbs|js|jse|wsf|hta|lnk|iso|img|deb|rpm|apk|xpi|crx)$/i;

/**
 * What kind of file a download is, by the last extension of its name (what the Mac will open it
 * as), with a warning when its name pretends to be something else (".pdf.html") or it can run.
 */
export function fileKind(name) {
  const n = String(name || '');
  const m = /\.([a-z0-9]{1,10})$/i.exec(n);
  if (!m) return { kind: 'a file with no extension', warn: '' };
  const ext = m[1].toLowerCase();
  const prev = /\.([a-z0-9]{1,6})\.[a-z0-9]{1,10}$/i.exec(n);
  const disguised = prev && prev[1].toLowerCase() !== ext ? `Careful: its name ends in “.${prev[1]}.${ext}”, so it is a .${ext} file, not a .${prev[1]} one.` : '';
  const runs = RISKY_EXT.test(ext) ? `A .${ext} file can run programs on your Mac.` : '';
  return { kind: FILE_KINDS[ext] || `a .${ext} file`, warn: [disguised, runs].filter(Boolean).join(' ') };
}

/** "a.com", "a.com and b.com", "a.com, b.com and c.com". */
function listSites(sites) {
  const list = [...new Set(sites)].slice(0, 4);
  if (list.length <= 1) return list[0] || 'another site';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** Whether an address carries text beyond its site: a path, a query or a fragment (all of which a page there sees). */
function carriesText(url) {
  try {
    const u = new URL(url);
    return (!!u.search && u.search !== '?') || (!!u.hash && u.hash !== '#') || (!!u.pathname && u.pathname !== '/');
  } catch {
    return true;
  }
}

/** An address as the cross-site check compares it: normalised (addressKey), with its fragment. */
function flowKey(url) {
  try {
    const u = new URL(url);
    const k = addressKey(url);
    return u.hash && u.hash !== '#' ? `${k}#${u.hash.slice(1)}` : k;
  } catch {
    return '';
  }
}
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
      onNavigationRequest: (toolId, url, req) => this.navigationPolicy(toolId, url, req),
    });
    this.driver.onTamper = (toolId) => this.onTamper(toolId);
    this.driver.onPopup = (toolId, url) => this.popupPolicy(toolId, url);
    this.driver.onTabUrl = (toolId, url) => this.popupMoved(toolId, url);
    this.driver.onUnstyled = (toolId) => this.onUnstyled(toolId);
    this.driver.onNoBar = (toolId) => this.onNoBar(toolId);
    this.driver.onLoadStopped = (toolId, info) => this.onLoadStopped(toolId, info);
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
      dialogApprovals: [], // the owner's OK to a page question, for doing its step again: { toolId, message, until }
      loadPrompts: new Set(), // "Approve this page load?" prompts not answered yet (cancelled when Jarvis lets go)
      // What Claude has read on which site in this task, and where the owner let Jarvis go on
      // acting after that (see crossSite): reads: the sites read; cleared: site -> the sites whose
      // reads the owner let Jarvis carry on to it with; seen: addresses of links on pages Jarvis
      // read; denied: sites the owner would not let it carry on to; urls: addresses the owner
      // approved opening.
      flow: { reads: new Set(), cleared: new Map(), seen: new Set(), denied: new Set(), urls: new Set() },
      noBarOk: new Set(), // documents (tab|doc) where the owner let Jarvis act without its bar
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
    // A page load still waiting for the owner's answer does not happen: its prompt ends as Cancel,
    // and the driver fails it before letting go of the tab (Chrome would otherwise send it).
    this.cancelLoadPrompts(run);
    // Release the tabs before another task may start, so its new debugger sessions are never
    // detached by this one's cleanup.
    this.releasingRun = run;
    try {
      await this.driver.releaseAll();
    } finally {
      if (this.releasingRun === run) this.releasingRun = null;
    }
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
      // A prompt withdrawn before its turn (a page load Jarvis let go of) is never shown.
      if (prompt.token?.cancelled) return resolve(prompt.timeoutChoice || 'cancel');
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
      run.prompt = { id, choices, token: prompt.token || null, resolve: (v) => done(resolve, v) };
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

  async confirm(run, { action, category, source, site, facts = '', consequential, title, timeoutMs = 0, token = null }) {
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
      token,
    });
    return choice === 'approve';
  }

  /**
   * Withdraws every "Approve this page load?" prompt not answered yet, as Cancel (Jarvis is letting
   * go of the tab: Take over, the end of the task, Stop). The driver fails those loads before it
   * detaches, so nothing is sent; an Approve shown afterwards would do nothing.
   */
  cancelLoadPrompts(run) {
    for (const token of [...(run?.loadPrompts || [])]) {
      token.cancelled = true;
      if (run.prompt?.token === token) run.prompt.resolve('cancel');
    }
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
    const dest = c.dest ? ` It opens ${showUrl(c.dest, 90)}${c.target ? ` ${c.target}` : ''}.` : c.target ? ` It opens ${c.target}.` : '';
    const blind = c.selectionUnknown ? " Jarvis can't see everything that is selected on this page (part of it is hidden from Jarvis)." : '';
    const what = c.consequential ? ` This looks like ${c.reason || GUARD_CATEGORIES[c.category]}.` : !c.label && c.unlabelled ? " Jarvis can't tell what it does." : '';
    return `${c.verb}${shown}${alias}${role}${hidden}${item}${sel}${detail} on ${where}.${dest}${blind}${what}`;
  }

  policy(run) {
    return {
      checkSite: async (url, ctx, opts = {}) => {
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
        // What Claude read on other sites in this task could reach this one: say so here (allowing
        // the site also lets Jarvis carry on to it, and open the address shown; see crossSite).
        const read = this.readSites(run, site);
        const address = opts?.address && read.length && carriesText(url) && !run.flow.seen.has(flowKey(url)) ? url : '';
        const asking = this.ask(run, {
          kind: 'site',
          site,
          title: `Let Jarvis work on ${site}?`,
          body: `Jarvis wants to read and use ${host && host !== site ? `${host} (part of ${site})` : site} in your browser for this task.${read.length ? ` In this task it has read ${listSites(read)}: if a page tricked Jarvis, what it read there could reach ${site}.` : ''}${address ? ` It would open this address there (everything in it reaches ${site}):\n${showUrl(address, 400)}` : ''}`,
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
          this.clearFlow(run, site, read);
          if (address) run.flow.urls.add(flowKey(address));
          return null;
        }
        if (choice === 'once') {
          run.sitesAllowed.add(site);
          this.clearFlow(run, site, read);
          if (address) run.flow.urls.add(flowKey(address));
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
        if (run.approvals.isDeclinedElement(c.element) || (c.opens && run.approvals.isDeclinedHref(c.opens)) || (c.dest && run.approvals.isDeclinedHref(c.dest))) {
          return `Blocked: the owner already declined this step (${c.verb}${quoted}) in this task. It was not done. Don't try again or find another way; tell the owner and finish.`;
        }
        // Covered by the owner's request_confirmation approval of exactly this element, in this
        // state (used up now).
        if (c.bind && run.approvals.consume({ ...c.bind, site, tabId: c.toolId, url: c.url })) return null;
        const ok = await this.confirm(run, { action: this.describeStep(c), category: c.category, source: 'guard', site, consequential: !!c.consequential });
        if (ok) return null;
        // The address it would have opened stays declined too, on any site (this one included).
        run.approvals.decline(c.category, site, { element: c.element, href: [c.opens, c.dest].filter(Boolean) });
        const shown = c.label ? ` "${truncate(singleLine(c.label), 60)}"` : '';
        run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `You cancelled: ${c.verb}${shown}. Jarvis did not do it.`, status: 'done' });
        return `Blocked: the owner declined this step (${c.verb}${quoted}${c.consequential ? `: ${c.reason || what}` : ''}). It was not done. Don't try it again or find another way to do it; tell the owner and finish.`;
      },
      everyday: (site) => !!(site && run.everyday?.[site] === true),
      // The cross-site check (what Claude read on one site reaching another; see crossSite).
      noteRead: (site) => {
        if (site) run.flow.reads.add(site);
      },
      noteLinks: (urls) => {
        for (const u of urls || []) {
          if (run.flow.seen.size >= 20000) break;
          const key = flowKey(u);
          if (key) run.flow.seen.add(key);
        }
      },
      readElsewhere: (site) => [...run.flow.reads.keys()].some((s) => s !== site),
      crossSite: (site, opts) => this.crossSite(run, site, opts),
      barCheck: (info) => this.barCheck(run, info),
      isAllowed: (site) => !!site && (run.sitesAllowed.has(site) || run.always?.[site] === 'always') && !run.sitesDenied.has(site),
      isDeclinedHref: (url) => run.approvals.isDeclinedHref(url),
      isDeclinedElement: (key) => run.approvals.isDeclinedElement(key),
      hasBinding: ({ toolId, doc, targetId }) => run.approvals.hasBinding({ tabId: toolId, doc, targetId }),
      noteActionResult: (url, what) => run.approvals.noteActionResult(url, what),
      actionResult: (url) => run.approvals.actionResult(url),
      askDialog: (q, opts) => this.askDialog(run, q, opts),
      preApproveDialog: (q) => run.dialogApprovals.push({ toolId: q.toolId, message: String(q.message || ''), until: this.now() + DIALOG_REPEAT_MS }),
      allowDownload: ({ url, site }) => run.downloadAllowances.push({ url, site, until: this.now() + DOWNLOAD_ALLOWANCE_MS }),
      awaitDownload: (url, opts) => this.awaitDownload(run, url, opts),
      drainDownloads: () => {
        const out = run.downloads.filter((d) => d.seq > run.downloadsReported).map((d) => ({ name: d.name, site: d.site, url: d.url, verdict: d.verdict }));
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
   * The sites Claude has read in this task other than `site`; with `since`, only those the owner
   * has not yet let Jarvis carry on to `site` with.
   */
  readSites(run, site, { since = true } = {}) {
    const cleared = since ? run.flow.cleared.get(site) : null;
    return [...run.flow.reads].filter((s) => s !== site && !cleared?.has(s));
  }

  /** The owner let Jarvis act on `site` after reading `sites`. */
  clearFlow(run, site, sites) {
    if (!sites?.length) return;
    const set = run.flow.cleared.get(site) || new Set();
    for (const s of sites) set.add(s);
    run.flow.cleared.set(site, set);
  }

  /**
   * The cross-site check. Claude may have read something private on one site in this task (a code
   * in the owner's mail, say), and a page that tricked it would like that to reach a site it
   * controls: in an address Claude builds, in what Jarvis types, in which links it clicks or where
   * it points. Before Jarvis acts on `site` (opens a page there, or sends it any input):
   *   - when Claude read other sites the owner has not yet let Jarvis carry on to `site` with, the
   *     owner is asked once ("Jarvis read A in this task; now it wants to act on B");
   *   - when Claude read any other site in this task, opening an address on `site` that carries
   *     text Claude chose (a query, or a path no page Jarvis read links to) asks every time,
   *     showing the whole address, decoded.
   * Returns null, or the refusal (Claude is told not to try again).
   */
  async crossSite(run, site, { url = '' } = {}) {
    if (!site) return null;
    const flow = run.flow;
    const refusal = `Blocked: the owner did not let Jarvis carry on to ${site} after reading other sites in this task (what Jarvis read there could reach ${site}). Nothing was sent there. Don't try it again or find another way; tell the owner and finish.`;
    if (flow.denied.has(site)) return refusal;
    const others = this.readSites(run, site);
    const anyOther = this.readSites(run, site, { since: false });
    const carries = !!url && anyOther.length > 0 && carriesText(url) && !flow.seen.has(flowKey(url)) && !flow.urls.has(flowKey(url));
    if (!others.length && !carries) return null;
    const read = carries ? anyOther : others;
    const body = carries
      ? `In this task Jarvis has read ${listSites(read)}. Now it wants to open this address on ${site}:\n${showUrl(url, 400)}\nEverything in an address reaches ${site}. If a page tricked Jarvis, something it read (a code, a message, a link) could be in it. Approve only if you recognise all of it.`
      : `In this task Jarvis has read ${listSites(read)}. Now it wants to act on ${site} (open its pages, click, type or point there). If a page tricked Jarvis, what it read could reach ${site} that way. Approve if going on to ${site} is part of your task.`;
    const ok = await this.confirm(run, { action: body, category: 'flow', source: 'guard', site, consequential: true, title: carries ? `Send this address to ${site}?` : `Carry on to ${site}?` }).catch((err) => {
      if (isAbort(err)) throw err;
      return false;
    });
    if (!ok) {
      flow.denied.add(site);
      run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: carries ? `You cancelled opening ${showUrl(url, 80)}. Jarvis did not open it.` : `You stopped Jarvis from going on to ${site} after reading ${listSites(read)}.`, status: 'done' });
      this.emitTask(run.task);
      return refusal;
    }
    this.clearFlow(run, site, read);
    if (carries) flow.urls.add(flowKey(url));
    return null;
  }

  /**
   * The page cannot show Jarvis's control bar (an SVG or XML page, or a page that broke it): before
   * Jarvis sends input there, the owner decides, once for that page. Returns null or the refusal.
   */
  async barCheck(run, { toolId, doc, site }) {
    const key = `${toolId}|${doc}`;
    if (run.noBarOk.has(key)) return null;
    const ok = await this.confirm(run, {
      action: `Jarvis can't show its control bar and glowing border on ${site || 'this page'}, so you can't see there that Jarvis is in control. Stop still works from the side panel and with ${this.platform === 'mac' ? '⌘⇧.' : 'Ctrl+Shift+.'}. Approve to let Jarvis go on acting on this page without the bar.`,
      category: 'change',
      source: 'guard',
      site,
      consequential: true,
      title: 'Act without the control bar?',
    }).catch((err) => {
      if (isAbort(err)) throw err;
      return false;
    });
    if (!ok) return `Blocked: Jarvis can't show its control bar on ${site || 'this page'}, and the owner did not let it act there without the bar. Nothing was done. Tell the owner, and don't act on this page.`;
    run.noBarOk.add(key);
    return null;
  }

  /** The control bar could not be shown on a page Jarvis works in: tell the owner at once (once per task). */
  onNoBar(toolId) {
    const run = this.run;
    if (!run || run.noBarWarned) return;
    run.noBarWarned = true;
    const t = this.driver.get(toolId);
    const site = t ? siteOf(t.url) : '';
    run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `Jarvis can't show its control bar on ${site || 'this page'}. It asks you before acting there; Stop works from here or with ${this.platform === 'mac' ? '⌘⇧.' : 'Ctrl+Shift+.'}.`, status: 'done' });
    this.emitTask(run.task);
  }

  /**
   * A page load the driver stopped (the controller's decision, or Jarvis letting go of the tab
   * while it waited for the owner): the notice in the step list says what really happened.
   */
  onLoadStopped(toolId, { url = '', main = true, sending = false, ok = true, notice = '', released = false, lost = false } = {}) {
    const run = this.run || this.releasingRun;
    if (!run) return;
    const where = `${showUrl(url, 60)}${main ? '' : ' (in a frame)'}`;
    let label;
    if (ok) label = notice || (released ? `Jarvis stopped the page from ${sending ? 'sending a form to' : 'opening'} ${where}: it was waiting for your answer when Jarvis let go of the tab.` : `Jarvis stopped the page from ${sending ? 'sending a form to' : 'opening'} ${where}.`);
    else label = lost ? `The page may have ${sending ? 'sent a form to' : 'opened'} ${where}: Chrome ended Jarvis's control of the tab while it waited for your answer.` : `Jarvis could not stop the page from ${sending ? 'sending a form to' : 'opening'} ${where}: it may have gone ahead.`;
    run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label, status: 'done' });
    this.emitTask(run.task);
  }

  /**
   * Whether to accept a JavaScript dialog the page opened. Alerts are just acknowledged. "Leave
   * site?" (beforeunload) is refused: the owner's unsaved work stays. A prompt() is dismissed
   * (Jarvis types nothing into it). A confirm() ("Are you sure?") is the page asking a question:
   * Jarvis never answers OK for the owner, and never holds the page waiting for them either (a page
   * held by its own dialog cannot show Jarvis's bar or hear Esc). So it is answered Cancel at once
   * and left for the owner (deferred): once the step that raised it is done, the executor asks
   * them, and on their OK does the step again, when this same question is answered OK (the
   * owner's OK stands for DIALOG_REPEAT_MS, for that tab and that text, once). Returns a boolean or
   * { accept, asked, deferred }.
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
    const now = this.now();
    run.dialogApprovals = run.dialogApprovals.filter((a) => a.until > now);
    const i = run.dialogApprovals.findIndex((a) => a.toolId === toolId && a.message === String(dialog.message || ''));
    if (i >= 0) {
      run.dialogApprovals.splice(i, 1);
      return { accept: true, asked: true };
    }
    return { accept: false, deferred: true };
  }

  /**
   * The owner's answer to a page question Jarvis answered Cancel at once (see dialogPolicy), asked
   * once the step that raised it is done. `doing`: that step; `rerun`: whether Jarvis can do it
   * again by itself. Resolves true for OK.
   */
  async askDialog(run, q, { doing = '', rerun = false } = {}) {
    if (this.run !== run || run.abort.signal.aborted) return false;
    const t = q.toolId ? this.driver.get(q.toolId) : null;
    const site = t ? siteOf(t.url) : '';
    const category = classifyDialogText(q.message);
    if (category && run.approvals.isDeclined(category, site)) return false;
    const when = doing ? ` (as Jarvis was ${singleLine(doing).replace(/…$/, '').replace(/^./, (c) => c.toLowerCase())})` : '';
    const quoted = truncate(singleLine(q.message), 300);
    const then = rerun ? 'Approve: Jarvis does that step again and answers OK.' : 'Approve: Jarvis is told to do that step again, and answers OK then.';
    const action = `The page ${t ? shortUrl(t.url, 60) : site || 'Jarvis is working in'} asks: “${quoted || '(no text)'}”${when}. Jarvis answered Cancel for now, so what it asks has not happened. ${then} Cancel: nothing more happens.`;
    let ok = false;
    try {
      ok = await this.confirm(run, { action, category: category || 'dialog', source: 'guard', site, consequential: true, title: 'The page asks you' });
    } catch (err) {
      if (isAbort(err)) throw err;
      ok = false;
    }
    if (!ok && category) run.approvals.decline(category, site);
    return ok;
  }

  /**
   * A page Jarvis works in opened a new window. Its first request leaves from the new tab, where
   * Jarvis's checks of this tab's loads do not reach: when it goes to a site the owner denied, an
   * address they declined, or one an approved step already opened, the new tab is closed at once
   * and the owner told. (Other windows are left alone: acting in them asks for their site as any
   * tab does.)
   */
  async popupPolicy(toolId, url) {
    const run = this.run;
    if (!run || run.takeover || run.stopping || run.abort.signal.aborted || !/^https?:/i.test(String(url || ''))) return;
    const site = siteOf(url);
    const why = run.sitesDenied.has(site) ? `${site} (which you denied)` : run.approvals.isDeclinedHref(url) ? `${showUrl(url, 60)} (which you declined)` : run.approvals.actionResult(url) ? `${showUrl(url, 60)} again (that repeats a step you approved once)` : '';
    if (!why) return;
    run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `A page opened ${why} in a new window; Jarvis closed it.`, status: 'done' });
    this.emitTask(run.task);
    for (let i = 0; i < 20; i++) {
      try {
        const tabs = await this.chrome.tabs.query({});
        const hit = tabs.find((tab) => String(tab.pendingUrl || tab.url || '') === url && !this.driver.byChrome.has(tab.id)) || tabs.find((tab) => String(tab.pendingUrl || tab.url || '') === url && this.driver.get(this.driver.byChrome.get(tab.id))?.openedByJarvis);
        if (hit) {
          await this.chrome.tabs.remove(hit.id);
          return;
        }
      } catch {
        /* keep looking */
      }
      await sleep(100);
    }
  }

  /**
   * A window a page opened (one Jarvis does not control) went on to another address: a redirect,
   * or the page's own script. Its request has already left (Chrome sends a new window's loads from
   * that tab, where Jarvis cannot hold them); when it reached a site the owner denied, an address
   * they declined or one an approved step already opened, the tab is closed at once and the owner
   * told that the site may have received the request.
   */
  async popupMoved(toolId, url) {
    const run = this.run;
    if (!run || run.takeover || run.stopping || run.abort.signal.aborted || !/^https?:/i.test(String(url || ''))) return;
    const t = this.driver.get(toolId);
    if (!t || !t.openedByJarvis || t.attached) return;
    const site = siteOf(url);
    const why = run.sitesDenied.has(site) ? `${site}, which you denied` : run.approvals.isDeclinedHref(url) ? `${showUrl(url, 60)}, which you declined` : run.approvals.actionResult(url) ? `${showUrl(url, 60)} again, which repeats a step you approved once` : '';
    if (!why) return;
    run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: 'warn', label: `A window a page opened went on to ${why}; Jarvis closed it, but that site may have received the request.`, status: 'done' });
    this.emitTask(run.task);
    try {
      await this.chrome.tabs.remove(t.chromeId);
    } catch {
      /* already closed */
    }
  }

  /**
   * A page Jarvis works in wants to load `url` in the tab or in a frame of it (a link, a script, a
   * redirect, a form) while Jarvis acts: { method, main, sessionId, frameId } (`sessionId`: the load
   * comes from inside a box from another site, its own form or a frame nested in it). Never: a
   * denied site, an address the owner declined, an address an approved step already opened
   * (unless that step is what loads it now: repeating it). Asked first: a site not asked about yet
   * (the tab's own page, and forms sent into or from a frame); and, when no step the owner approved
   * is behind it, a form sent (POST) and an address that says it acts ("/act/delete"), so a page
   * that posts an order by itself, or sends Jarvis on to an action address, cannot act unasked. A
   * step approved on the page never covers what another site's box sends by itself. The owner's
   * own page loads during Take over are not checked; frames' ordinary page loads are not asked
   * about. Returns true (load it) or { allow: false, notice } (the driver fails it, and the notice
   * goes in the step list once Chrome confirms nothing was sent).
   */
  async navigationPolicy(toolId, url, { method = 'GET', main = true, sessionId = null, frameId = null } = {}) {
    const run = this.run;
    if (!run || run.takeover || run.stopping || run.abort.signal.aborted) return true;
    if (blockedReason(url)) return main ? { allow: false } : true;
    const site = siteOf(url);
    if (!site) return true;
    const stop = (notice) => ({ allow: false, notice });
    const where = `${showUrl(url, 60)}${main ? '' : ' (in a frame)'}`;
    if (run.approvals.isDeclinedHref(url)) return stop(`Jarvis stopped the page from opening ${where}, which you declined.`);
    if (run.sitesDenied.has(site)) return stop(`Jarvis stopped the page from opening ${site}${main ? '' : ' in a frame'}, which you denied.`);
    const approved = this.driver.approvedInput(toolId, { sessionId, frameId });
    const prior = run.approvals.actionResult(url);
    if (prior && !approved) return stop(`Jarvis stopped the page from opening ${showUrl(url, 60)} again: that would repeat a step you approved once (${CATEGORIES[prior.category] || 'a step that does something'}).`);
    const sending = !/^(GET|HEAD)$/i.test(String(method || 'GET'));
    const acts = !sending && main ? addressAction(url) : null;
    if (!approved && (sending || (acts && !acts.file))) {
      // Nothing the owner approved led here: the page itself (or a box from another site in it) is
      // sending a form, or opening an address that acts. The owner decides.
      const t = this.driver.get(toolId);
      const from = t && /^https?:/i.test(t.url || '') ? shortUrl(t.url, 60) : site;
      const consequential = !!(acts && CATEGORIES[acts.category]);
      const what = sending ? `send a form to ${showUrl(url, 90)}${sessionId ? ' (from inside a box from another site)' : main ? '' : ' (into a frame)'}` : `open ${showUrl(url, 90)} (${acts.reason})`;
      // (Withdrawn as Cancel if Jarvis lets go of the tab before the owner answers.)
      const token = { cancelled: false };
      run.loadPrompts.add(token);
      let ok = false;
      try {
        ok = await this.confirm(run, {
          action: `The page ${from} wants to ${what}. No step you approved asked for this: a page can place an order, pay, send or delete this way. Approve lets it go ahead; Cancel stops it.`,
          category: consequential ? acts.category : 'change',
          source: 'guard',
          site,
          consequential: true,
          title: 'Approve this page load?',
          token,
        });
      } catch {
        ok = false;
      } finally {
        run.loadPrompts.delete(token);
      }
      if (token.cancelled) return stop(`Jarvis stopped the page from ${sending ? 'sending a form to' : 'opening'} ${where}: it was waiting for your answer when Jarvis let go of the tab.`);
      if (!ok) {
        // A declined action address stays declined; a form's action does not (the owner may
        // approve sending that form themselves later, with a click).
        run.approvals.decline(consequential ? acts.category : 'change', site, { href: sending ? '' : url });
        return stop(`Jarvis stopped the page from ${sending ? 'sending a form to' : 'opening'} ${where}.`);
      }
    }
    if (!main) {
      // A frame's own page loads (ads, videos, widgets) go ahead; a form sent into a frame, or from
      // inside one, goes to a site only with the owner's permission.
      if (!sending || run.sitesAllowed.has(site)) return true;
    } else if (run.sitesAllowed.has(site)) return true;
    try {
      const refusal = await run.policy.checkSite(url);
      return refusal ? stop(`Jarvis stopped the page from ${sending ? 'sending a form to' : 'opening'} ${where}: you did not allow ${site}.`) : true;
    } catch {
      return stop('');
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
    const kind = fileKind(name);
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
      run.task.steps.push({ id: uid('s'), at: this.now(), kind: 'notice', level: ok ? 'info' : 'warn', label: ok ? `Saved “${shortFileName(name, 60)}” to your Downloads folder.` : `Jarvis did not save “${shortFileName(name, 60)}”.`, status: 'done' });
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
      action: `Save the file “${shortFileName(name, 80)}” (${kind.kind}${size ? `, ${formatBytes(size)}` : ''}) from ${site || 'a page'}? A page Jarvis is working in started this download.${kind.warn ? ` ${kind.warn}` : ''}`,
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
    // (The driver fails every page load still waiting for the owner before it lets go of the tab.)
    this.cancelLoadPrompts(run);
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
    // A page load waiting for the owner's answer does not happen (the driver fails it before it
    // lets go of the tab; Chrome would otherwise send it): its prompt ends as Cancel.
    this.cancelLoadPrompts(run);
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
