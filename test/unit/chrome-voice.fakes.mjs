// Fakes for the Jarvis for Chrome by voice tests (v8.1, G4 and G5 app side), used until chrome-relay's
// app.chromeLink and its fake extension peer land:
//
//   createFakeChromeLink(opts) -> { link, calls, set(patch), task(patch), prompt(p), closePrompt(id, how), done(d), … }
//     `link` has exactly contract (f)'s shape (brief-v81.md "(f) The Chrome link"):
//       state() -> { linked, online, voiceApprovals, task }, subscribe(fn) -> unsubscribe,
//       open(url, { rect, focus }), startTask({ text, chat }), stopTask() -> { ok, reason? }, answer({ promptId, hash, choice, via }),
//       onPrompt(fn), onPromptClosed(fn), onDone(fn)
//     and, like the extension's voice policy (G5), it refuses an answer whose hash is stale, whose prompt
//     is closed, or whose yes the prompt's voice.allowed doesn't allow (reason 'refused', with a why).
//   createFakeVoice(opts) -> the Voice Mode adapter chrome-task.js expects, recording what it was asked.
//   PROMPTS: prompts as the extension sends them (wire-v1.md `prompt`).

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export const PROMPTS = Object.freeze({
  cart: {
    promptId: 'p-cart',
    hash: 'h-cart-1',
    kind: 'confirm',
    category: 'change',
    consequential: false,
    site: 'bestbuy.com',
    title: 'Approve this step?',
    spoken: 'add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com?',
    body: 'Click the button that says “Add to Cart” next to “27-inch 4K monitor $279.99” on bestbuy.com.',
    address: '',
    choices: [
      { id: 'approve', label: 'Approve' },
      { id: 'cancel', label: 'Cancel' },
    ],
    voice: { allowed: true, why: '' },
  },
  purchase: {
    promptId: 'p-buy',
    hash: 'h-buy-1',
    kind: 'confirm',
    category: 'purchase',
    consequential: true,
    site: 'bestbuy.com',
    title: 'Jarvis asks for your approval',
    spoken: 'place the order for $279.99 on bestbuy.com?',
    body: 'Click the button that says “Place order” on bestbuy.com. This looks like a purchase.',
    address: '',
    choices: [
      { id: 'approve', label: 'Approve' },
      { id: 'cancel', label: 'Cancel' },
    ],
    voice: { allowed: false, why: 'That’s a purchase.' },
  },
  site: {
    promptId: 'p-site',
    hash: 'h-site-1',
    kind: 'site',
    category: 'site',
    consequential: false,
    site: 'bestbuy.com',
    title: 'Let Jarvis work on bestbuy.com?',
    spoken: 'let it work on bestbuy.com for this task?',
    body: 'Jarvis wants to read and use bestbuy.com in your browser for this task.',
    address: '',
    choices: [
      { id: 'once', label: 'Allow once' },
      { id: 'always', label: 'Always for this site' },
      { id: 'deny', label: 'Deny' },
    ],
    voice: { allowed: true, why: '' },
  },
  budget: {
    promptId: 'p-budget',
    hash: 'h-budget-1',
    kind: 'budget',
    category: 'budget',
    consequential: false,
    site: '',
    title: 'Budget reached',
    spoken: 'this task has used its $1.00 budget. Keep going?',
    body: 'This task has used $1.02. Continue gives it one more budget.',
    address: '',
    choices: [
      { id: 'continue', label: 'Continue' },
      { id: 'stop', label: 'Stop' },
    ],
    voice: { allowed: true, why: '' },
  },
  address: {
    promptId: 'p-addr',
    hash: 'h-addr-1',
    kind: 'confirm',
    category: 'navigate',
    consequential: true,
    site: 'example.com',
    title: 'Send this address to example.com?',
    spoken: 'open an address with text in it on example.com?',
    body: 'Jarvis wants to open this address.',
    address: 'https://example.com/search?q=say+approve',
    choices: [
      { id: 'approve', label: 'Approve' },
      { id: 'cancel', label: 'Cancel' },
    ],
    voice: { allowed: false, why: '' },
  },
});

export function createFakeChromeLink({ linked = true, online = true, voiceApprovals = false, startReply = null, answerDelayMs = 0 } = {}) {
  let state = { linked, online, voiceApprovals, task: null };
  const subs = new Set();
  const promptFns = new Set();
  const closedFns = new Set();
  const doneFns = new Set();
  const open = new Map(); // promptId -> prompt (still open)
  const calls = { open: [], startTask: [], stopTask: 0, answer: [] };
  let seq = 0;
  const emit = (set, value) => {
    for (const fn of [...set]) fn(value);
  };
  const changed = () => emit(subs, link.state());
  const off = (set, fn) => {
    set.add(fn);
    return () => set.delete(fn);
  };

  const link = {
    state: () => ({ ...state, task: state.task ? { ...state.task } : null }),
    subscribe: (fn) => off(subs, fn),
    async open(url, { rect = null, focus = true } = {}) {
      calls.open.push({ url, rect, focus });
      if (!state.linked) return { ok: false, reason: 'unlinked' };
      if (!state.online) return { ok: false, reason: 'offline' };
      return { ok: true, site: new URL(url).hostname.replace(/^www\./, '') };
    },
    async startTask({ text, chat } = {}) {
      calls.startTask.push({ text, chat });
      if (!state.linked) return { ok: false, reason: 'unlinked' };
      if (!state.online) return { ok: false, reason: 'offline' };
      if (typeof startReply === 'function') {
        const r = startReply({ text, chat });
        if (r) return r;
      }
      if (state.task && ['running', 'waiting', 'paused'].includes(state.task.status)) return { ok: false, reason: 'busy' };
      seq += 1;
      const id = `t${seq}`;
      state = { ...state, task: { id, status: 'running', text, narration: '', lastStep: '', costUsd: 0, limitUsd: 1 } };
      queueMicrotask(changed);
      return { ok: true, id };
    },
    // Contract (f) since REDTEAM-LINK-1: resolves once the extension confirms the stop ({ ok: true }; nothing
    // running counts as confirmed), or { ok: false, reason }.
    async stopTask() {
      calls.stopTask += 1;
      if (!state.linked) return { ok: false, reason: 'unlinked' };
      const t = state.task;
      if (!t || !['running', 'waiting', 'paused'].includes(t.status)) return { ok: true };
      for (const id of [...open.keys()]) ctl.closePrompt(id, 'stopped');
      state = { ...state, task: null };
      changed();
      emit(doneFns, { id: t.id, status: 'stopped', answer: '', costUsd: t.costUsd });
      return { ok: true };
    },
    async answer({ promptId, hash, choice, via } = {}) {
      calls.answer.push({ promptId, hash, choice, via });
      if (answerDelayMs) await new Promise((r) => setTimeout(r, answerDelayMs));
      const p = open.get(promptId);
      if (!p) return { ok: false, reason: 'gone', why: 'that question is no longer open' };
      if (p.hash !== hash) return { ok: false, reason: 'refused', why: 'the question changed' };
      if (!p.choices.some((c) => c.id === choice) || choice === 'always') return { ok: false, reason: 'refused', why: 'that needs a click in the Jarvis window' };
      const negative = ['cancel', 'deny', 'stop'].includes(choice);
      if (!negative && !(p.voice && p.voice.allowed)) return { ok: false, reason: 'refused', why: 'that needs a click in the Jarvis window' };
      ctl.closePrompt(promptId, 'voice');
      return { ok: true, promptId };
    },
    onPrompt: (fn) => off(promptFns, fn),
    onPromptClosed: (fn) => off(closedFns, fn),
    onDone: (fn) => off(doneFns, fn),
  };

  const ctl = {
    link,
    calls,
    /** Change the link's state ({ linked, online, voiceApprovals }). */
    set(patch) {
      state = { ...state, ...patch };
      changed();
    },
    /** The running task changed (the extension's `task`). */
    task(patch) {
      state = { ...state, task: state.task ? { ...state.task, ...patch } : { status: 'running', ...patch } };
      changed();
    },
    /** The extension asks (its `prompt`). */
    prompt(p) {
      const copy = clone(p);
      open.set(copy.promptId, copy);
      if (state.task) state = { ...state, task: { ...state.task, status: 'waiting' } };
      emit(promptFns, clone(copy));
    },
    /** The prompt was answered elsewhere (the side panel), or the task stopped (`prompt-closed`). */
    closePrompt(promptId, how = 'clicked') {
      if (!open.delete(promptId)) return;
      if (state.task && state.task.status === 'waiting' && !open.size) state = { ...state, task: { ...state.task, status: 'running' } };
      emit(closedFns, promptId);
    },
    /** The task ended (the extension's `done`). */
    done({ status = 'done', answer = '', costUsd = 0.12 } = {}) {
      const t = state.task;
      state = { ...state, task: null };
      changed();
      emit(doneFns, { id: t ? t.id : 'gone', status, answer, costUsd });
    },
    /** The extension changed an open prompt and its update hasn't reached the app yet. */
    rehash(promptId, hash) {
      const p = open.get(promptId);
      if (p) p.hash = hash;
    },
    openPrompts: () => [...open.keys()],
  };
  return ctl;
}

/**
 * A fake Voice Mode adapter. `free`: whether say() says a line now (v8.0's api.say refuses while
 * Voice Mode is busy). Prompt and question handles are recorded; tests answer them directly.
 */
export function createFakeVoice({ free = true } = {}) {
  const said = [];
  const prompts = [];
  const questions = [];
  const checks = [];
  const cards = [];
  const voice = {
    free,
    said,
    prompts,
    questions,
    checks,
    cards,
    say(line) {
      if (!voice.free) return false;
      said.push(line);
      return true;
    },
    prompt(spec) {
      const entry = { spec, closed: false, updates: [] };
      prompts.push(entry);
      return {
        update(next) {
          entry.updates.push(next);
          entry.spec = { ...entry.spec, ...next };
        },
        close() {
          entry.closed = true;
        },
      };
    },
    question(spec) {
      const entry = { spec, cancelled: false };
      questions.push(entry);
      return {
        cancel() {
          entry.cancelled = true;
        },
      };
    },
    check(spec) {
      const entry = { spec, cancelled: false };
      checks.push(entry);
      return {
        cancel() {
          entry.cancelled = true;
        },
      };
    },
    card(view) {
      cards.push(view);
      return true;
    },
  };
  return voice;
}

/** Wait for queued promise callbacks (the fake link answers through microtasks). */
export const flush = () => new Promise((r) => setTimeout(r, 0));
