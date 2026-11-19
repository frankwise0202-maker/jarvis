// First-run onboarding: Welcome → Name → API key (tested before saving) → Ready.
// Explains where to get a key, adding credits, setting a spend limit, and that the
// key never leaves this device except to api.anthropic.com.

import { h, setText, extLink } from './dom.js';
import { icon } from './icons.js';
import { createCore } from './hud/core.js';
import { getSettings, saveSettings } from '../platform/settings.js';
import { setApiKey, looksLikeApiKey, getApiKey } from '../platform/secrets.js';
import { sttSupported } from '../platform/voice/stt.js';

const STEPS = ['welcome', 'name', 'key', 'ready'];
const LINKS = {
  keys: 'https://console.anthropic.com/settings/keys',
  billing: 'https://console.anthropic.com/settings/billing',
  limits: 'https://console.anthropic.com/settings/limits',
};

/**
 * @param {object} o
 * @param {(key: string) => Promise<{ ok: boolean, error?: object }>} o.testApiKey
 * @param {() => void} o.onDone            onboarding finished (settings.onboarded saved)
 * @param {() => void} o.onKeyChanged
 * @param {() => void} [o.openInstallGuide]
 * @param {string} [o.startAt]             step to open on
 */
export function createOnboarding(o) {
  let step = STEPS.includes(o.startAt) ? o.startAt : 'welcome';
  let keySaved = !!safe(getApiKey, '');
  let keyWarning = '';
  let destroyed = false;

  const canvas = h('canvas', { class: 'ob-core-canvas', attrs: { 'aria-hidden': 'true', 'data-testid': 'onboarding-core' } });
  const hero = h('div', { class: 'ob-hero' }, h('div', { class: 'ob-core' }, canvas));
  let core = null;
  try {
    core = createCore(canvas, { size: 168, mode: 'hero' });
  } catch (err) {
    console.error('[jarvis] onboarding core failed:', err);
  }
  const setCore = (state) => {
    try {
      core && core.setState(state);
    } catch {
      /* ignore */
    }
  };

  const progressText = h('span', { class: 'ob-progress-text mono' });
  const dots = h('div', { class: 'ob-dots', attrs: { 'aria-hidden': 'true' } }, STEPS.map(() => h('span', { class: 'ob-dot' })));
  const backBtn = h('button', { class: 'icon-btn ob-back', type: 'button', attrs: { 'aria-label': 'Back' }, on: { click: () => back() } }, icon('chevron-left', { size: 22 }));
  const top = h('div', { class: 'ob-top' }, backBtn, h('div', { class: 'ob-progress' }, dots, progressText));
  const stage = h('div', { class: 'ob-stage' });
  const actions = h('div', { class: 'ob-actions' });
  const el = h(
    'div',
    { class: 'onboarding', attrs: { 'data-testid': 'onboarding', 'data-step': step } },
    h('div', { class: 'ob-inner' }, top, hero, stage, actions),
  );

  function go(next) {
    if (destroyed || !STEPS.includes(next)) return;
    step = next;
    render();
  }
  function back() {
    const i = STEPS.indexOf(step);
    if (i > 0) go(STEPS[i - 1]);
  }

  function primary(label, onClick, { testid = 'onboarding-next', iconName = 'chevron-right', disabled = false } = {}) {
    return h(
      'button',
      { class: 'btn btn-primary btn-lg ob-primary', type: 'button', disabled, attrs: { 'data-testid': testid }, on: { click: onClick } },
      h('span', { text: label }),
      iconName ? icon(iconName, { size: 18 }) : null,
    );
  }

  function render() {
    el.setAttribute('data-step', step);
    const i = STEPS.indexOf(step);
    setText(progressText, `${String(i + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}`);
    Array.from(dots.children).forEach((d, j) => {
      d.classList.toggle('is-done', j < i);
      d.classList.toggle('is-current', j === i);
    });
    backBtn.hidden = i === 0 || step === 'ready';
    hero.classList.toggle('is-compact', step !== 'welcome' && step !== 'ready');
    setCore('idle');
    let content;
    let buttons;
    if (step === 'welcome') [content, buttons] = welcomeStep();
    else if (step === 'name') [content, buttons] = nameStep();
    else if (step === 'key') [content, buttons] = keyStep();
    else [content, buttons] = readyStep();
    const wrapper = h('div', { class: 'ob-step', attrs: { 'data-step': step } }, content);
    stage.replaceChildren(wrapper);
    actions.replaceChildren(...buttons);
    // Move focus to the step's heading (or its input) for screen readers and keyboards.
    requestAnimationFrame(() => {
      const target = wrapper.querySelector('[data-autofocus]') || wrapper.querySelector('h1');
      if (target) {
        try {
          target.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    });
  }

  function heading(label, title, sub) {
    return [h('p', { class: 'label-caps ob-label', text: label }), h('h1', { class: 'ob-title', tabIndex: -1, text: title }), sub ? h('p', { class: 'ob-sub', text: sub }) : null];
  }

  function feature(iconName, title, text) {
    return h('li', { class: 'ob-feature' }, h('span', { class: 'ob-feature-icon' }, icon(iconName, { size: 18 })), h('div', null, h('strong', { text: title }), h('span', { text })));
  }

  function welcomeStep() {
    const content = [
      ...heading('Systems online', 'Hello. I’m Jarvis.', 'Your personal AI assistant — on your phone and your computer.'),
      h(
        'ul',
        { class: 'ob-features' },
        feature('bolt', 'Instant answers', 'Ask anything, by typing or by voice.'),
        feature('search', 'Live web research', 'I search and read the web, and cite my sources.'),
        feature('agents', 'An agent swarm', 'For big questions I deploy a team of agents that research in parallel.'),
        feature('lock', 'Private by design', 'Runs in your browser with your own key. No servers in between.'),
      ),
    ];
    const buttons = [primary('Get started', () => go('name')), h('a', { class: 'btn btn-ghost ob-secondary', href: './?demo=1', attrs: { 'data-testid': 'onboarding-demo' } }, h('span', { text: 'Try the demo first' }))];
    return [content, buttons];
  }

  function nameStep() {
    const input = h('input', {
      class: 'input input--lg',
      type: 'text',
      value: getSettings().userName || '',
      placeholder: 'Your first name',
      maxLength: 40,
      attrs: { 'data-testid': 'onboarding-name', autocomplete: 'given-name', autocapitalize: 'words', spellcheck: 'false', 'aria-label': 'Your name', 'data-autofocus': '', enterkeyhint: 'next' },
      on: {
        keydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            next();
          }
        },
      },
    });
    function next() {
      try {
        saveSettings({ userName: input.value });
      } catch (err) {
        console.error('[jarvis] saving name failed:', err);
      }
      go('key');
    }
    const content = [...heading('Profile', 'What should I call you?', 'Leave it blank and I’ll call you “sir”.'), h('div', { class: 'ob-field' }, input)];
    return [content, [primary('Continue', next)]];
  }

  function keyStep() {
    const input = h('input', {
      class: 'input input--lg input--mono',
      type: 'password',
      placeholder: 'sk-ant-…',
      attrs: {
        'data-testid': 'onboarding-key',
        autocomplete: 'off',
        autocapitalize: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
        'aria-label': 'Anthropic API key',
        'aria-describedby': 'ob-key-error',
        'data-autofocus': '',
        enterkeyhint: 'go',
      },
      on: {
        keydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            connect();
          }
        },
        input: () => showError(''),
      },
    });
    const eye = h(
      'button',
      {
        class: 'icon-btn input-adorn',
        type: 'button',
        attrs: { 'aria-label': 'Show key', 'aria-pressed': 'false' },
        on: {
          click: () => {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            eye.setAttribute('aria-pressed', show ? 'true' : 'false');
            eye.setAttribute('aria-label', show ? 'Hide key' : 'Show key');
            eye.replaceChildren(icon(show ? 'eye-off' : 'eye', { size: 18 }));
          },
        },
      },
      icon('eye', { size: 18 }),
    );
    const error = h('p', { class: 'ob-error', id: 'ob-key-error', hidden: true, attrs: { 'data-testid': 'onboarding-error', role: 'alert' } });
    const success = h('p', { class: 'ob-success', hidden: true, attrs: { role: 'status' } }, icon('check', { size: 16 }), h('span', { text: 'Connected. Your key is saved on this device.' }));
    const connectLabel = h('span', { text: 'Connect' });
    const connectBtn = h('button', { class: 'btn btn-primary btn-lg ob-primary', type: 'button', attrs: { 'data-testid': 'onboarding-connect' }, on: { click: () => connect() } }, connectLabel, icon('bolt', { size: 18 }));
    const skip = h('button', { class: 'btn btn-ghost ob-secondary', type: 'button', attrs: { 'data-testid': 'onboarding-skip' }, on: { click: () => go('ready') } }, h('span', { text: keySaved ? 'Keep my saved key' : 'Skip for now' }));
    const continueBtn = primary('Continue', () => go('ready'));
    continueBtn.hidden = true;
    let testing = false;

    function showError(text, tone = 'err') {
      error.hidden = !text;
      error.dataset.tone = tone;
      error.replaceChildren(...(text ? [icon('alert', { size: 16 }), h('span', { text })] : []));
    }

    async function connect() {
      if (testing) return;
      const key = input.value.trim();
      if (!key) {
        showError('Paste your API key to continue.');
        input.focus();
        return;
      }
      if (!looksLikeApiKey(key)) {
        showError('That doesn’t look like an Anthropic API key. It should start with “sk-ant-”.');
        return;
      }
      testing = true;
      connectBtn.disabled = true;
      input.disabled = true;
      connectBtn.classList.add('is-busy');
      setText(connectLabel, 'Testing…');
      showError('');
      setCore('thinking');
      let res;
      try {
        res = await o.testApiKey(key);
      } catch (err) {
        console.error('[jarvis] testApiKey threw:', err);
        res = { ok: false, error: { kind: 'unknown', message: 'The test failed unexpectedly.' } };
      }
      if (destroyed) return;
      testing = false;
      connectBtn.classList.remove('is-busy');
      input.disabled = false;
      connectBtn.disabled = false;
      setText(connectLabel, 'Connect');
      if (res && res.ok) {
        saveKey(key);
        setCore('idle');
        success.hidden = false;
        connectBtn.hidden = true;
        skip.hidden = true;
        setTimeout(() => {
          if (!destroyed && step === 'key') go('ready');
        }, 650);
        return;
      }
      const err = (res && res.error) || {};
      setCore('error');
      setTimeout(() => setCore('idle'), 1600);
      switch (err.kind) {
        case 'auth':
          showError('Anthropic rejected this key. Check that you copied the whole key, or create a new one.');
          break;
        case 'network':
          showError('Couldn’t reach Anthropic. Check your internet connection and try again.');
          break;
        case 'billing':
        case 'rate_limit':
        case 'overloaded':
        case 'not_found': {
          // The key authenticated; the account just can't run requests right now.
          saveKey(key);
          keyWarning =
            err.kind === 'billing'
              ? 'Your key works, but the account has no credits yet. Add credits in Billing before your first question.'
              : err.kind === 'not_found'
                ? 'Your key works, but this account can’t use the test model. Check model access in the Console.'
                : 'Your key works, but Anthropic is busy right now. You can continue.';
          showError(keyWarning, 'warn');
          connectBtn.hidden = true;
          skip.hidden = true;
          continueBtn.hidden = false;
          break;
        }
        default:
          showError(err.message || 'The key test failed. Try again in a moment.');
      }
    }

    function saveKey(key) {
      try {
        setApiKey(key);
        keySaved = true;
        o.onKeyChanged();
      } catch (err) {
        console.error('[jarvis] setApiKey failed:', err);
      }
    }

    const steps = h(
      'ol',
      { class: 'ob-steps', attrs: { 'aria-label': 'How to get a key' } },
      h('li', null, h('span', { class: 'ob-step-num mono', text: '1' }), h('div', null, h('strong', { text: 'Create an API key' }), h('span', { text: 'Sign in to the Anthropic Console → API Keys → Create key.' }), extLink(LINKS.keys, 'console.anthropic.com', { class: 'link-ext' }))),
      h('li', null, h('span', { class: 'ob-step-num mono', text: '2' }), h('div', null, h('strong', { text: 'Add credits' }), h('span', { text: 'Jarvis uses your Anthropic account. Add a little credit under Billing.' }), extLink(LINKS.billing, 'Billing', { class: 'link-ext' }))),
      h('li', null, h('span', { class: 'ob-step-num mono', text: '3' }), h('div', null, h('strong', { text: 'Set a monthly spend limit' }), h('span', { text: 'Recommended: a limit such as $20 under Limits keeps costs predictable.' }), extLink(LINKS.limits, 'Limits', { class: 'link-ext' }))),
    );
    const content = [
      ...heading('Connect', 'Connect to Claude', 'Paste your Anthropic API key. I’ll test it before saving.'),
      h('div', { class: 'ob-field' }, h('div', { class: 'input-group' }, input, eye), error, success),
      h('p', { class: 'ob-privacy' }, icon('lock', { size: 15 }), h('span', { text: 'Your key stays on this device. Jarvis sends it only to api.anthropic.com — never anywhere else.' })),
      h('p', { class: 'label-caps ob-steps-title', text: 'No key yet?' }),
      steps,
    ];
    return [content, [connectBtn, continueBtn, skip]];
  }

  function readyStep() {
    const name = getSettings().userName || 'sir';
    const stt = safe(sttSupported, false);
    const tips = [
      feature('sparkle', 'Pick a mode', 'Auto decides for you, Quick answers fast, Swarm deploys the full agent team.'),
      stt ? feature('mic', 'Talk to me', 'Tap the microphone and speak; I’ll send when you finish.') : null,
      feature('dollar', 'Costs are estimates', 'Each reply shows an estimated cost. Your spend limit in the Console is the hard cap.'),
    ];
    const content = [
      ...heading('Ready', `All systems ready, ${name}.`, keySaved ? (keyWarning ? 'One thing to sort out first — see the note in Settings → API key.' : 'Your key is connected and stored on this device.') : 'Add your API key any time in Settings → API key.'),
      h('ul', { class: 'ob-features' }, tips),
      o.openInstallGuide
        ? h('button', { class: 'ob-install', type: 'button', attrs: { 'data-testid': 'onboarding-install' }, on: { click: () => o.openInstallGuide() } }, icon('phone', { size: 18 }), h('span', { text: 'Install Jarvis on your phone or computer' }), icon('chevron-right', { size: 16 }))
        : null,
    ];
    const buttons = [
      primary(
        'Start',
        () => {
          try {
            saveSettings({ onboarded: true });
          } catch (err) {
            console.error('[jarvis] saving onboarded failed:', err);
          }
          o.onDone();
        },
        { iconName: 'chevron-right' },
      ),
    ];
    return [content, buttons];
  }

  render();

  return {
    el,
    get step() {
      return step;
    },
    go,
    destroy() {
      destroyed = true;
      try {
        core && core.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
