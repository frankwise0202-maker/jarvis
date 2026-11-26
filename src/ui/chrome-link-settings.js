// Settings → Jarvis for Chrome (v8.1, SPEC §32.1): link Jarvis to Jarvis for Chrome (the extension in its own
// "Jarvis" Chrome profile) through the home base, see whether it's there, and unlink.
//   · Not linked: what it does, and Link (it needs the home base: Settings → Home base).
//   · Linking: Copy link code, then the steps in the Jarvis window (side panel → Settings → Voice from Jarvis →
//     paste; Chrome asks to let it reach the home base), and Cancel. The code works once, for 30 minutes: once
//     linked, a new key replaces the code's (REDTEAM-LINK-4), and Jarvis clears the code from the clipboard if it
//     is still there (critique L9, PRIVACY-6), or says it couldn't check. If the clipboard can't be written, the
//     code is shown to copy by hand.
//   · Linked: "Linked · online" (or offline, with what to do), Test (a ping: the round trip and whether "Tasks
//     from Jarvis" is on there), and Unlink (tap twice).
//   · On an iPhone: one line (the link is made on the computer).
// The key never appears here, and the code only while linking.
//
//   const card = createChromeLinkSettings(control, { toast, os })   (control: createChromeLink(...).control)
//   card.el · card.destroy()
//
// Test ids: chrome-link-settings (data-state: phone | no-home-base | off | pending | linked; data-online),
// chrome-link-state, chrome-link-link, chrome-link-steps, chrome-link-copy, chrome-link-code, chrome-link-cancel,
// chrome-link-test, chrome-link-unlink, chrome-link-result, chrome-link-problem. All text goes through dom.js (textContent only).

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { UNREACHABLE_MESSAGE, DOWN_MESSAGE, REFUSED_MESSAGE } from '../lib/homebase.js';
// Its styles: src/styles/chrome-link.css, @imported by src/styles/app.css (no CSS import here: Node tests load
// settings.js, and this module with it).

export const CHROME_LINK_WORDS = Object.freeze({
  intro: 'Jarvis for Chrome is the Chrome extension that clicks and types for you, in its own “Jarvis” Chrome profile. Once linked, “pull this up in Chrome” opens the page in that window, beside Jarvis, and you can give it tasks by voice. Every step that changes something still asks you first, in the Jarvis window.',
  phone: 'Jarvis for Chrome works with Jarvis on your computer. Link it from Settings there.',
  noHomeBase: 'Link your home base first (Settings → Home base): Jarvis and Jarvis for Chrome talk through it.',
  off: 'Not linked',
  pending: 'Waiting for Jarvis for Chrome…',
  online: 'Linked · online',
  offline: 'Linked · offline',
  offlineHelp: 'Open the Jarvis window (the Chrome profile with Jarvis for Chrome) and keep it open. Until then, “pull this up in Chrome” opens a normal tab here.',
  steps: [
    'Copy the link code.',
    'In the Jarvis window (the Chrome profile with Jarvis for Chrome), open its side panel, then Settings → Voice from Jarvis, and paste the code. (Voice from Jarvis needs Jarvis for Chrome 1.1.0 or later.)',
    'When Chrome asks, let Jarvis for Chrome reach your home base.',
  ],
  codeNote: 'The code works once, for 30 minutes: once the two are linked, a new key replaces it. Jarvis then clears it from your clipboard if it’s still there.',
  copied: 'Link code copied. Paste it in Jarvis for Chrome.',
  copyFailed: 'Jarvis couldn’t copy it. Select the code below and copy it (⌘C or Ctrl+C).',
  linked: 'Linked with Jarvis for Chrome.',
  cleared: 'Linked. The link code was cleared from your clipboard.',
  unchecked: 'Linked. Jarvis couldn’t check your clipboard: if it still holds the link code, copy something else over it. (The code no longer works.)',
  unlinked: 'Unlinked. Jarvis for Chrome was told, if it could be reached.',
  extUnlinked: 'Jarvis for Chrome unlinked itself. Link again whenever you like.',
  expired: 'The link code expired before it was used. Press Link for a new one.',
  oldCore: 'Your home base needs Jarvis Core 1.3 or later for this. It updates itself; or run jarvis-core update on the Alienware.',
  testing: 'Asking Jarvis for Chrome…',
  answered: (s) => `Jarvis for Chrome answered in ${s} s.`,
  tasksOff: 'Tasks from Jarvis are off there: turn them on in its side panel, Settings → Voice from Jarvis.',
  tasksOn: 'Tasks from Jarvis are on.',
  noAnswer: 'No answer in 10 seconds. Open the Jarvis window (the Chrome profile with Jarvis for Chrome) and keep it open.',
  privacy: 'The home base only passes messages along: they’re locked with a key that only Jarvis and Jarvis for Chrome have, kept for two minutes in memory. The key stays on this computer, never in backups or sync.',
});

const PROBLEMS = {
  unreachable: UNREACHABLE_MESSAGE,
  down: DOWN_MESSAGE,
  refused: REFUSED_MESSAGE,
  'old-core': CHROME_LINK_WORDS.oldCore,
  rate: 'The home base asked Jarvis to slow down for a moment. It tries again by itself.',
  error: 'The home base gave an unexpected answer. Jarvis tries again by itself.',
};

function out(el, text, tone = 'info') {
  el.hidden = !text;
  el.dataset.tone = tone;
  el.replaceChildren(...(text ? [icon(tone === 'ok' ? 'check' : tone === 'busy' ? 'spinner' : tone === 'info' ? 'info' : 'alert', { size: 16 }), h('span', { text })] : []));
}

export function createChromeLinkSettings(control, { toast } = {}) {
  const say = (text, opts) => {
    try {
      if (typeof toast === 'function') toast(text, opts);
    } catch {
      /* ignore */
    }
  };
  let destroyed = false;
  let unlinkArmed = false;
  let unlinkTimer = 0;
  let lastPhase = null;
  let lastCleared = null;
  let lastClip = null;
  let busy = false;

  const stateDot = h('span', { class: 'cl-dot', attrs: { 'aria-hidden': 'true' } });
  const stateText = h('span', { class: 'cl-state-text' });
  const stateLine = h('p', { class: 'cl-state', attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'chrome-link-state' } }, stateDot, stateText);
  const help = h('p', { class: 'set-help cl-help', hidden: true });
  const problemOut = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'chrome-link-problem' } });
  const result = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'chrome-link-result' } });

  const linkBtn = h('button', { class: 'btn btn-primary', type: 'button', attrs: { 'data-testid': 'chrome-link-link' }, on: { click: () => onLink() } }, icon('link', { size: 16 }), h('span', { text: 'Link' }));
  const copyLabel = h('span', { text: 'Copy link code' });
  const copyBtn = h('button', { class: 'btn btn-primary', type: 'button', attrs: { 'data-testid': 'chrome-link-copy' }, on: { click: () => onCopy() } }, icon('copy', { size: 16 }), copyLabel);
  const cancelBtn = h('button', { class: 'btn', type: 'button', attrs: { 'data-testid': 'chrome-link-cancel' }, on: { click: () => onCancel() } }, h('span', { text: 'Cancel' }));
  const testBtn = h('button', { class: 'btn', type: 'button', attrs: { 'data-testid': 'chrome-link-test' }, on: { click: () => onTest() } }, icon('bolt', { size: 16 }), h('span', { text: 'Test' }));
  const unlinkLabel = h('span', { text: 'Unlink' });
  const unlinkBtn = h('button', { class: 'btn btn-danger-ghost', type: 'button', attrs: { 'data-testid': 'chrome-link-unlink' }, on: { click: () => onUnlink(), blur: () => setTimeout(disarm, 150) } }, icon('close', { size: 16 }), unlinkLabel);
  const codeField = h('input', {
    class: 'input mono cl-code',
    type: 'text',
    readOnly: true,
    hidden: true,
    attrs: { 'data-testid': 'chrome-link-code', 'aria-label': 'Link code', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' },
    on: { focus: () => codeField.select() },
  });
  const steps = h(
    'ol',
    { class: 'cl-steps', attrs: { 'data-testid': 'chrome-link-steps' } },
    CHROME_LINK_WORDS.steps.map((text, i) => h('li', null, h('span', { text }), i === 0 ? h('div', { class: 'cl-step-action' }, copyBtn) : null)),
  );
  const pendingBox = h('div', { class: 'cl-pending', hidden: true }, steps, codeField, h('p', { class: 'set-help', text: CHROME_LINK_WORDS.codeNote }), h('div', { class: 'set-row-actions set-row-actions--start' }, cancelBtn));
  const offBox = h('div', { class: 'cl-off', hidden: true }, h('div', { class: 'set-row-actions set-row-actions--start' }, linkBtn));
  const linkedBox = h('div', { class: 'cl-linked', hidden: true }, h('div', { class: 'set-row-actions set-row-actions--start' }, testBtn, unlinkBtn));
  const intro = h('p', { class: 'set-help', text: CHROME_LINK_WORDS.intro });
  const privacy = h('p', { class: 'set-help key-privacy' }, icon('lock', { size: 14 }), h('span', { text: CHROME_LINK_WORDS.privacy }));

  const el = h(
    'div',
    { class: 'set-card cl-card', attrs: { 'data-testid': 'chrome-link-settings' } },
    intro,
    stateLine,
    help,
    problemOut,
    offBox,
    pendingBox,
    linkedBox,
    result,
    privacy,
  );

  function disarm() {
    unlinkArmed = false;
    clearTimeout(unlinkTimer);
    unlinkBtn.classList.remove('is-armed');
    setText(unlinkLabel, 'Unlink');
  }

  function render() {
    if (destroyed) return;
    let info;
    try {
      info = control.info();
    } catch {
      return;
    }
    const stateName = !info.computer ? 'phone' : info.phase === 'off' && !info.homeBase ? 'no-home-base' : info.phase;
    el.dataset.state = stateName;
    el.dataset.online = info.online ? 'true' : 'false';
    stateDot.dataset.tone = stateName === 'linked' ? (info.online ? 'ok' : 'off') : stateName === 'pending' ? 'wait' : 'none';
    const words = {
      phone: CHROME_LINK_WORDS.phone,
      'no-home-base': CHROME_LINK_WORDS.off,
      off: CHROME_LINK_WORDS.off,
      pending: CHROME_LINK_WORDS.pending,
      linked: info.online ? CHROME_LINK_WORDS.online : CHROME_LINK_WORDS.offline,
    }[stateName];
    setText(stateText, words);
    intro.hidden = stateName === 'phone';
    privacy.hidden = stateName === 'phone';
    help.hidden = !(stateName === 'no-home-base' || (stateName === 'linked' && !info.online));
    setText(help, stateName === 'no-home-base' ? CHROME_LINK_WORDS.noHomeBase : CHROME_LINK_WORDS.offlineHelp);
    offBox.hidden = !(stateName === 'off' || stateName === 'no-home-base');
    linkBtn.disabled = stateName !== 'off' || busy;
    pendingBox.hidden = stateName !== 'pending';
    linkedBox.hidden = stateName !== 'linked';
    if (stateName !== 'pending') codeField.hidden = true;
    unlinkBtn.disabled = busy;
    testBtn.disabled = busy;
    // A problem with the home base, while linking or linked.
    const problem = (stateName === 'pending' || stateName === 'linked') && info.problem ? PROBLEMS[info.problem] || PROBLEMS.error : '';
    out(problemOut, problem, 'warn');
    // What just happened.
    if (lastPhase === 'pending' && stateName === 'linked') {
      out(result, info.clearedAt ? CHROME_LINK_WORDS.cleared : info.clipboard === 'unchecked' ? CHROME_LINK_WORDS.unchecked : CHROME_LINK_WORDS.linked, info.clipboard === 'unchecked' ? 'warn' : 'ok');
      say(CHROME_LINK_WORDS.linked, { level: 'success' });
    } else if (stateName === 'linked' && info.clearedAt && info.clearedAt !== lastCleared && lastCleared !== null) {
      out(result, CHROME_LINK_WORDS.cleared, 'ok');
    } else if (stateName === 'linked' && info.clipboard === 'unchecked' && lastClip !== 'unchecked') {
      out(result, CHROME_LINK_WORDS.unchecked, 'warn');
    } else if (info.note === 'ext-unlinked' && stateName !== 'linked') {
      out(result, CHROME_LINK_WORDS.extUnlinked, 'info');
    } else if (info.note === 'expired' && stateName !== 'pending' && stateName !== 'linked') {
      out(result, CHROME_LINK_WORDS.expired, 'info');
    }
    lastCleared = info.clearedAt || 0;
    lastClip = info.clipboard || null;
    lastPhase = stateName;
  }

  function onLink() {
    if (busy) return;
    const r = control.begin();
    if (!r.ok) {
      const text = r.reason === 'no-home-base' ? CHROME_LINK_WORDS.noHomeBase : r.reason === 'phone' ? CHROME_LINK_WORDS.phone : 'Jarvis couldn’t start a link here.';
      out(result, text, 'warn');
      return;
    }
    out(result, '', 'info');
    render();
    try {
      copyBtn.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  async function onCopy() {
    const r = await control.copyCode();
    if (destroyed) return;
    if (r.ok) {
      codeField.hidden = true;
      codeField.value = '';
      out(result, CHROME_LINK_WORDS.copied, 'ok');
      setText(copyLabel, 'Copy again');
      return;
    }
    const code = control.code();
    if (!code) return;
    codeField.value = code;
    codeField.hidden = false;
    out(result, CHROME_LINK_WORDS.copyFailed, 'warn');
    try {
      codeField.focus();
      codeField.select();
    } catch {
      /* ignore */
    }
  }

  function onCancel() {
    control.cancel();
    codeField.value = '';
    codeField.hidden = true;
    setText(copyLabel, 'Copy link code');
    out(result, '', 'info');
    render();
  }

  async function onTest() {
    if (busy) return;
    busy = true;
    render();
    out(result, CHROME_LINK_WORDS.testing, 'busy');
    const t0 = Date.now();
    let r;
    try {
      r = await control.ping();
    } catch {
      r = { ok: false, reason: 'offline' };
    } finally {
      busy = false;
    }
    if (destroyed) return;
    if (r && r.ok) {
      const secs = Math.max(0.1, Math.round((Date.now() - t0) / 100) / 10).toFixed(1);
      const tasks = r.status ? (r.status.tasksFromJarvis ? CHROME_LINK_WORDS.tasksOn : CHROME_LINK_WORDS.tasksOff) : '';
      out(result, `${CHROME_LINK_WORDS.answered(secs)}${tasks ? ` ${tasks}` : ''}`, 'ok');
    } else {
      out(result, r && r.reason === 'unlinked' ? CHROME_LINK_WORDS.off : CHROME_LINK_WORDS.noAnswer, 'warn');
    }
    render();
  }

  async function onUnlink() {
    if (!unlinkArmed) {
      unlinkArmed = true;
      unlinkBtn.classList.add('is-armed');
      setText(unlinkLabel, 'Tap again to unlink');
      clearTimeout(unlinkTimer);
      unlinkTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    busy = true;
    render();
    try {
      await control.unlink();
    } finally {
      busy = false;
    }
    if (destroyed) return;
    setText(copyLabel, 'Copy link code');
    out(result, CHROME_LINK_WORDS.unlinked, 'info');
    render();
  }

  const off = control.onChange(() => render());
  render();
  // Opening Settings asks the home base now whether Jarvis for Chrome is there.
  Promise.resolve()
    .then(() => control.refresh())
    .then(() => render(), () => {});

  return {
    el,
    destroy() {
      destroyed = true;
      clearTimeout(unlinkTimer);
      try {
        off();
      } catch {
        /* ignore */
      }
      codeField.value = '';
    },
  };
}
