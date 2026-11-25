// Settings → Home base, below the address (v7.6, SPEC §24): what the home base may do on its own.
//   · Give the home base your key: one tap sends this device's stored Claude key (POST api/brain/key)
//     after saying what it is for; then only its hint shows ("…Ab3D"), with Remove. The key itself is
//     never shown, logged or kept anywhere new on this device.
//   · Limits: the home base's own spending caps (a day, a month).
//   · Morning briefing: on/off, the time, °F/°C, and where the weather is for ("Use this iPhone's
//     location", rounded to 2 decimals before it leaves the phone, or a city the Core looks up).
//   · Notifications: "Turn on notifications" (the permission prompt only from that tap), a test, off.
// Shown only while a home base is linked; a Core without the brain (1.0) says it needs an update.
//
//   const card = createBrainSettings(brain, { getApiKey, toast, requestPermission, os });
//   card.el · card.refresh() · card.reveal('key' | 'limits' | 'briefing' | 'push') · card.destroy()
//
// All text reaches the page through dom.js helpers (textContent). Never innerHTML.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { brainProblem, formatUsd, roundCoord, deviceLabel, LIMIT_RANGES } from '../lib/brain.js';
import { pushSupport, currentSubscription, subscribePush, unsubscribePush } from '../platform/push.js';

function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.warn('[jarvis] home base settings:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

function out(el, text, tone = 'info') {
  el.hidden = !text;
  el.dataset.tone = tone;
  el.replaceChildren(...(text ? [icon(tone === 'ok' ? 'check' : tone === 'busy' ? 'spinner' : tone === 'info' ? 'info' : 'alert', { size: 16 }), h('span', { text })] : []));
}

function whenText(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** The device's own word for itself in "Use this iPhone's location". */
function thisDevice(os) {
  const label = deviceLabel(os);
  return label === 'Browser' || label === 'Windows PC' || label === 'Android phone' ? 'this device' : `this ${label}`;
}

export function createBrainSettings(brain, { getApiKey, toast, requestPermission, os = 'other' } = {}) {
  const say = (text, opts) => safe(() => typeof toast === 'function' && toast(text, opts));
  let destroyed = false;
  const devWord = thisDevice(os);
  const DevWord = devWord.replace(/^./, (c) => c.toUpperCase());

  // ---- loading / failure line ---------------------------------------------------------------------
  const stateMsg = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'brain-settings-state' } });
  const retry = h('button', { class: 'btn btn-sm', type: 'button', hidden: true, attrs: { 'data-testid': 'brain-settings-retry' }, on: { click: () => brain.load({ force: true }) } }, icon('refresh', { size: 14 }), h('span', { text: 'Try again' }));

  // ---- the key --------------------------------------------------------------------------------------
  const keyState = h('div', { class: 'key-state', attrs: { 'data-testid': 'brain-key-state' } });
  const keyExplain = h('p', { class: 'set-help', attrs: { 'data-testid': 'brain-key-explain' } });
  const keySend = h('button', { class: 'btn btn-primary', type: 'button', attrs: { 'data-testid': 'brain-key-send' }, on: { click: () => sendKey() } }, icon('key', { size: 16 }), h('span', { text: 'Give the home base your key' }));
  const keyRemove = h('button', { class: 'btn btn-danger-ghost', type: 'button', attrs: { 'data-testid': 'brain-key-remove' }, on: { click: () => removeKey() } }, icon('trash', { size: 16 }), h('span', { text: 'Remove' }));
  const keyOut = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'brain-key-result' } });
  const keyCard = h(
    'div',
    { class: 'set-card brain-card', attrs: { 'data-testid': 'brain-key' } },
    h('h4', { class: 'set-subtitle', text: 'Let it work while your phone is locked' }),
    keyState,
    keyExplain,
    h('div', { class: 'set-row-actions set-row-actions--start' }, keySend, keyRemove),
    keyOut,
    h('p', { class: 'set-help key-privacy' }, icon('lock', { size: 14 }), h('span', { text: 'The key goes straight to your home base over Tailscale and is kept there in a private file. It is never shown again, never logged, and only ever sent to Anthropic.' })),
  );
  let keyBusy = false;

  async function sendKey() {
    if (keyBusy) return;
    const key = safe(() => (typeof getApiKey === 'function' ? getApiKey() : ''), '');
    if (!key) {
      out(keyOut, 'Add your Claude API key on this device first (Settings → API key), then come back here.', 'warn');
      return;
    }
    keyBusy = true;
    keySend.disabled = true;
    out(keyOut, 'Handing your key to the home base…', 'busy');
    const r = await brain.call('sendBrainKey', key);
    keyBusy = false;
    keySend.disabled = false;
    if (destroyed) return;
    if (r && r.ok) {
      out(keyOut, r.verified ? `Done. The home base has your key (${r.hint || 'saved'}) and Anthropic accepted it.` : `Done. The home base has your key (${r.hint || 'saved'}); it will check it with Anthropic when it’s next online.`, 'ok');
      say('The home base has your key.', { level: 'success' });
      brain.load({ force: true });
      return;
    }
    out(keyOut, brainProblem(r).message, 'err');
  }

  async function removeKey() {
    if (keyBusy) return;
    keyBusy = true;
    keyRemove.disabled = true;
    const r = await brain.call('removeBrainKey');
    keyBusy = false;
    keyRemove.disabled = false;
    if (destroyed) return;
    if (r && r.ok) {
      out(keyOut, 'Removed. The home base keeps its free features (the briefing without Claude, the system report).', 'ok');
      brain.load({ force: true });
      return;
    }
    out(keyOut, brainProblem(r).message, 'err');
  }

  function renderKey(b) {
    const set = b.key.set;
    keyState.replaceChildren(
      h('span', { class: ['key-dot', set ? 'is-on' : 'is-off'], attrs: { 'aria-hidden': 'true' } }),
      h(
        'div',
        { class: 'key-state-text' },
        h('strong', { text: set ? 'The home base has your key' : 'The home base has no key yet' }),
        h('span', { class: ['key-mask', set && 'mono'], attrs: { 'data-testid': 'brain-key-hint' }, text: set ? `${b.key.hint || 'saved'}${b.key.verified === true ? ' · accepted by Anthropic' : b.key.verified === false ? ' · not checked yet' : ''}${b.key.setAt ? ` · since ${whenText(b.key.setAt)}` : ''}` : 'Free features only: the briefing without Claude and the system report.' }),
      ),
    );
    const daily = b.limits.dailyUsd !== null ? formatUsd(b.limits.dailyUsd) : '$5.00';
    setText(
      keyExplain,
      set
        ? `It researches and watches for you in the background and writes your morning briefing with Claude, and stops for the day at ${daily}.`
        : `With your Claude key, your home base keeps working while your phone is locked: it researches questions in the background, watches for things you ask about and writes your morning briefing. It stops spending at its own limit (${daily} a day). One tap sends the key this device already has.`,
    );
    const hasKey = !!safe(() => (typeof getApiKey === 'function' ? getApiKey() : ''), '');
    keySend.hidden = set;
    keySend.disabled = !hasKey;
    keySend.title = hasKey ? '' : 'Add your API key on this device first (Settings → API key).';
    keyRemove.hidden = !set;
    if (!set && !hasKey && keyOut.hidden) out(keyOut, 'Add your Claude API key on this device first (Settings → API key), then come back here.', 'info');
  }

  // ---- limits -------------------------------------------------------------------------------------
  const limitInput = (id, label, range) =>
    h('input', { class: 'input input--money', type: 'number', id, min: range.min, max: range.max, step: '0.5', attrs: { inputmode: 'decimal', 'data-testid': id === 'brain-daily' ? 'brain-limit-daily' : 'brain-limit-monthly', 'aria-label': label } });
  const dailyIn = limitInput('brain-daily', 'Daily limit in dollars', LIMIT_RANGES.dailyUsd);
  const monthlyIn = limitInput('brain-monthly', 'Monthly limit in dollars', LIMIT_RANGES.monthlyUsd);
  const limitsSave = h('button', { class: 'btn', type: 'button', attrs: { 'data-testid': 'brain-limits-save' }, on: { click: () => saveLimits() } }, icon('check', { size: 16 }), h('span', { text: 'Save limits' }));
  const limitsOut = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'brain-limits-result' } });
  const spendLine = h('p', { class: 'set-help', attrs: { 'data-testid': 'brain-spend-line' } });
  const money = (input, label) => h('label', { class: 'brain-money' }, h('span', { class: 'set-label', text: label }), h('div', { class: 'money-wrap' }, h('span', { class: 'money-prefix', text: '$' }), input));
  const limitsCard = h(
    'div',
    { class: 'set-card brain-card', attrs: { 'data-testid': 'brain-limits' } },
    h('h4', { class: 'set-subtitle', text: 'Spending limits' }),
    h('p', { class: 'set-help', text: 'What the home base may spend on its own. It won’t start anything new past a limit, and research that reaches one stops with what it has.' }),
    h('div', { class: 'brain-money-row' }, money(dailyIn, 'A day'), money(monthlyIn, 'A month')),
    spendLine,
    h('div', { class: 'set-row-actions set-row-actions--start' }, limitsSave),
    limitsOut,
  );

  async function saveLimits() {
    const d = Number(dailyIn.value);
    const m = Number(monthlyIn.value);
    if (!Number.isFinite(d) || d < LIMIT_RANGES.dailyUsd.min || d > LIMIT_RANGES.dailyUsd.max) {
      out(limitsOut, `The daily limit can be $0 to $${LIMIT_RANGES.dailyUsd.max}.`, 'err');
      return;
    }
    if (!Number.isFinite(m) || m < LIMIT_RANGES.monthlyUsd.min || m > LIMIT_RANGES.monthlyUsd.max) {
      out(limitsOut, `The monthly limit can be $0 to $${LIMIT_RANGES.monthlyUsd.max}.`, 'err');
      return;
    }
    limitsSave.disabled = true;
    out(limitsOut, 'Saving…', 'busy');
    const r = await brain.call('saveBrainSettings', { limits: { dailyUsd: Math.round(d * 100) / 100, monthlyUsd: Math.round(m * 100) / 100 } });
    limitsSave.disabled = false;
    if (destroyed) return;
    if (r && r.ok) {
      brain.setBrain(r.brain);
      out(limitsOut, `Saved: ${formatUsd(r.brain.limits.dailyUsd)} a day, ${formatUsd(r.brain.limits.monthlyUsd)} a month.`, 'ok');
      return;
    }
    out(limitsOut, brainProblem(r).message, 'err');
  }

  function renderLimits(b) {
    if (document.activeElement !== dailyIn) dailyIn.value = b.limits.dailyUsd !== null ? String(b.limits.dailyUsd) : '';
    if (document.activeElement !== monthlyIn) monthlyIn.value = b.limits.monthlyUsd !== null ? String(b.limits.monthlyUsd) : '';
    setText(spendLine, `Spent so far: ${formatUsd(b.spend.todayUsd)} today, ${formatUsd(b.spend.monthUsd)} this month.${b.spend.capReached ? ` The ${b.spend.capReached === 'monthly' ? 'monthly' : 'daily'} limit is reached.` : ''}`);
  }

  // ---- the morning briefing ---------------------------------------------------------------------------
  const briefOn = h('input', { type: 'checkbox', class: 'switch', attrs: { role: 'switch', 'data-testid': 'brain-briefing-on', 'aria-label': 'Morning briefing' }, on: { change: () => saveBriefing({ enabled: briefOn.checked }) } });
  const briefTime = h('input', { class: 'input brain-time', type: 'time', step: 60, attrs: { 'data-testid': 'brain-briefing-time', 'aria-label': 'Briefing time' }, on: { change: () => briefTime.value && saveBriefing({ time: briefTime.value }) } });
  const briefUnits = h(
    'select',
    { class: 'input brain-units', attrs: { 'data-testid': 'brain-briefing-units', 'aria-label': 'Temperature' }, on: { change: () => saveBriefing({ units: briefUnits.value }) } },
    h('option', { value: 'F', text: '°F' }),
    h('option', { value: 'C', text: '°C' }),
  );
  const locNow = h('p', { class: 'set-help', attrs: { 'data-testid': 'brain-location' } });
  const locDevice = h('button', { class: 'btn', type: 'button', attrs: { 'data-testid': 'brain-loc-device' }, on: { click: () => useDeviceLocation() } }, icon('pin', { size: 16 }), h('span', { text: `Use ${devWord}’s location` }));
  const cityIn = h('input', { class: 'input', type: 'text', maxLength: 80, placeholder: 'Or type a city', attrs: { 'data-testid': 'brain-city', 'aria-label': 'City for the weather', autocomplete: 'address-level2' }, on: { keydown: (e) => e.key === 'Enter' && (e.preventDefault(), useCity()) } });
  const cityBtn = h('button', { class: 'btn', type: 'button', attrs: { 'data-testid': 'brain-city-save' }, on: { click: () => useCity() } }, h('span', { text: 'Use this city' }));
  const briefOut = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'brain-briefing-result' } });
  const briefCard = h(
    'div',
    { class: 'set-card brain-card', attrs: { 'data-testid': 'brain-briefing-settings' } },
    h('div', { class: 'brain-switch-row' }, h('div', {}, h('h4', { class: 'set-subtitle', text: 'Morning briefing' }), h('p', { class: 'set-help', text: 'Weather, headlines and how the home base’s night went, ready when you wake up (on its screen and here).' })), briefOn),
    h('div', { class: 'brain-row' }, h('label', { class: 'brain-field' }, h('span', { class: 'set-label', text: 'Time' }), briefTime), h('label', { class: 'brain-field' }, h('span', { class: 'set-label', text: 'Temperature' }), briefUnits)),
    h('span', { class: 'set-label', text: 'Weather for' }),
    locNow,
    h('div', { class: 'set-row-actions set-row-actions--start' }, locDevice),
    h('div', { class: 'key-entry brain-city-entry' }, cityIn, h('div', { class: 'key-buttons' }, cityBtn)),
    briefOut,
  );

  async function saveBriefing(patch, { busy = 'Saving…', done = 'Saved.' } = {}) {
    out(briefOut, busy, 'busy');
    const r = await brain.call('saveBrainSettings', { briefing: patch });
    if (destroyed) return false;
    if (r && r.ok) {
      brain.setBrain(r.brain);
      out(briefOut, done, 'ok');
      return true;
    }
    out(briefOut, brainProblem(r).message, 'err');
    const st = brain.getState();
    if (st.brain) renderBriefing(st.brain);
    return false;
  }

  function useDeviceLocation() {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : null;
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      out(briefOut, 'This browser can’t share its location. Type a city instead.', 'warn');
      return;
    }
    out(briefOut, 'Finding where you are…', 'busy');
    locDevice.disabled = true;
    try {
      geo.getCurrentPosition(
        async (pos) => {
          locDevice.disabled = false;
          const lat = roundCoord(pos && pos.coords && pos.coords.latitude);
          const lon = roundCoord(pos && pos.coords && pos.coords.longitude);
          if (lat === null || lon === null) {
            out(briefOut, 'Couldn’t read the location. Type a city instead.', 'warn');
            return;
          }
          // Rounded to about a kilometre before it leaves this device.
          await saveBriefing({ location: { lat, lon, label: 'Your location' } }, { busy: 'Saving your location…', done: 'The briefing’s weather is for where you are now.' });
        },
        (err) => {
          locDevice.disabled = false;
          const denied = err && err.code === 1;
          out(briefOut, denied ? `Location is off for Jarvis. Allow it for Jarvis in ${os === 'ios' ? 'iPhone Settings → Privacy & Security → Location Services' : 'the browser’s site settings'}, or type a city.` : 'Couldn’t find where you are just now. Type a city instead.', 'warn');
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
      );
    } catch {
      locDevice.disabled = false;
      out(briefOut, 'Couldn’t ask for the location. Type a city instead.', 'warn');
    }
  }

  async function useCity() {
    const city = cityIn.value.replace(/\s+/g, ' ').trim();
    if (!city) {
      out(briefOut, 'Type a city first.', 'warn');
      safe(() => cityIn.focus());
      return;
    }
    if (await saveBriefing({ location: { city } }, { busy: 'Looking it up…', done: 'Saved. The weather is for that city now.' })) cityIn.value = '';
  }

  function renderBriefing(b) {
    briefOn.checked = b.briefing.enabled;
    if (document.activeElement !== briefTime) briefTime.value = b.briefing.time;
    briefUnits.value = b.briefing.units;
    const loc = b.briefing.location;
    setText(locNow, loc ? `${loc.label}${loc.lat !== null && loc.lon !== null && /^your location$/i.test(loc.label) ? ` (${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)})` : ''}` : 'Not set yet: the briefing has no weather until you choose.');
    const next = b.briefing.enabled && b.briefing.nextAt ? `Next one: ${whenText(b.briefing.nextAt)}.` : '';
    briefTime.title = next;
  }

  // ---- notifications --------------------------------------------------------------------------------
  const pushState = h('p', { class: 'set-help', attrs: { 'data-testid': 'brain-push-state' } });
  const pushOn = h('button', { class: 'btn btn-primary', type: 'button', attrs: { 'data-testid': 'brain-push-on' }, on: { click: () => turnOnPush() } }, icon('bolt', { size: 16 }), h('span', { text: 'Turn on notifications' }));
  const pushTest = h('button', { class: 'btn', type: 'button', attrs: { 'data-testid': 'brain-push-test' }, on: { click: () => testPush() } }, h('span', { text: 'Send a test' }));
  const pushOff = h('button', { class: 'btn btn-danger-ghost', type: 'button', attrs: { 'data-testid': 'brain-push-off' }, on: { click: () => turnOffPush() } }, h('span', { text: 'Turn off' }));
  const pushOut = h('p', { class: 'key-result', hidden: true, attrs: { role: 'status', 'aria-live': 'polite', 'data-testid': 'brain-push-result' } });
  const pushCard = h(
    'div',
    { class: 'set-card brain-card', attrs: { 'data-testid': 'brain-push' } },
    h('h4', { class: 'set-subtitle', text: 'Notifications' }),
    h('p', { class: 'set-help', text: `The home base can tell ${devWord} when research is done, something you’re watching happens, or your briefing is ready, even when Jarvis is closed.` }),
    pushState,
    h('div', { class: 'set-row-actions set-row-actions--start' }, pushOn, pushTest, pushOff),
    pushOut,
  );
  let pushSubscribed = false;
  let pushBusy = false;

  async function syncPush() {
    const sub = await currentSubscription().catch(() => null);
    if (destroyed) return;
    pushSubscribed = !!sub;
    renderPush();
  }

  function renderPush() {
    const support = pushSupport();
    const st = brain.getState();
    const devices = st.brain ? st.brain.push.devices : [];
    if (support === 'ios-tab') setText(pushState, 'On iPhone, add Jarvis to your Home Screen first (Share → Add to Home Screen), then turn notifications on in the app.');
    else if (support !== 'ok') setText(pushState, 'This browser can’t get notifications from the home base.');
    else if (pushSubscribed) setText(pushState, `Notifications are on for ${devWord}.${devices.length > 1 ? ` The home base notifies ${devices.length} devices.` : ''}`);
    else setText(pushState, devices.length ? `Off for ${devWord}. (The home base notifies ${devices.length === 1 ? 'one other device' : `${devices.length} other devices`}.)` : `Off for ${devWord}.`);
    pushOn.hidden = support !== 'ok' || pushSubscribed;
    pushTest.hidden = support !== 'ok' || !pushSubscribed;
    pushOff.hidden = support !== 'ok' || !pushSubscribed;
  }

  async function turnOnPush() {
    if (pushBusy) return;
    const st = brain.getState();
    const vapid = st.brain ? st.brain.push.vapidPublicKey : '';
    pushBusy = true;
    pushOn.disabled = true;
    out(pushOut, 'Asking for permission…', 'busy');
    // The permission prompt comes first, inside this tap (subscribePush asks before anything else).
    const r = await subscribePush(vapid, { requestPermission });
    if (destroyed) return;
    if (!r.ok) {
      pushBusy = false;
      pushOn.disabled = false;
      out(pushOut, r.message, 'err');
      return;
    }
    out(pushOut, 'Telling the home base…', 'busy');
    const sent = await brain.call('pushSubscribe', r.subscription, deviceLabel(os));
    pushBusy = false;
    pushOn.disabled = false;
    if (destroyed) return;
    if (sent && sent.ok) {
      pushSubscribed = true;
      out(pushOut, 'Notifications are on. Tap “Send a test” to see one.', 'ok');
      brain.load({ force: true });
      renderPush();
      return;
    }
    out(pushOut, brainProblem(sent).message, 'err');
  }

  async function testPush() {
    pushTest.disabled = true;
    out(pushOut, 'Sending a test…', 'busy');
    const r = await brain.call('pushTest');
    pushTest.disabled = false;
    if (destroyed) return;
    if (r && r.ok) out(pushOut, r.sent ? `Sent to ${r.sent === 1 ? 'one device' : `${r.sent} devices`}${r.failed ? ` (${r.failed} didn’t answer)` : ''}. It should arrive in a moment.` : 'The home base has no device to notify. Turn notifications off and on again.', r.sent ? 'ok' : 'warn');
    else out(pushOut, brainProblem(r).message, 'err');
  }

  async function turnOffPush() {
    if (pushBusy) return;
    pushBusy = true;
    const endpoint = await unsubscribePush();
    if (endpoint) await brain.call('pushUnsubscribe', endpoint);
    pushBusy = false;
    if (destroyed) return;
    pushSubscribed = false;
    out(pushOut, `Notifications are off for ${devWord}.`, 'ok');
    brain.load({ force: true });
    renderPush();
  }

  // ---- the whole card ------------------------------------------------------------------------------
  const parts = h('div', { class: 'brain-parts' }, keyCard, limitsCard, briefCard, pushCard);
  const el = h('div', { class: 'brain-settings', hidden: true, attrs: { 'data-testid': 'brain-settings' } }, h('h4', { class: 'set-section-sub hud-label', text: 'What the home base does for you' }), h('div', { class: 'brain-state-row' }, stateMsg, retry), parts);

  function render() {
    const st = brain.getState();
    el.hidden = st.phase === 'unset';
    if (st.phase === 'unset') return;
    const b = st.brain;
    if (!b) {
      parts.hidden = true;
      if (st.phase === 'failed' && st.problem) {
        out(stateMsg, st.problem.message, st.problem.state === 'old' ? 'warn' : 'err');
        retry.hidden = st.problem.state === 'old';
      } else {
        out(stateMsg, 'Checking what the home base can do…', 'busy');
        retry.hidden = true;
      }
      return;
    }
    parts.hidden = false;
    if (st.phase === 'failed' && st.problem) {
      out(stateMsg, st.problem.message, 'warn');
      retry.hidden = false;
    } else {
      out(stateMsg, '');
      retry.hidden = true;
    }
    renderKey(b);
    renderLimits(b);
    renderBriefing(b);
    renderPush();
  }

  const off = brain.subscribe((st) => {
    render();
    // Linked just now (Save): find out what this home base can do.
    if (st && st.phase === 'idle' && st.url) brain.load();
  });
  render();
  if (brain.base()) brain.load({ force: true });
  syncPush();

  const targets = { key: keyCard, limits: limitsCard, briefing: briefCard, push: pushCard };
  return {
    el,
    refresh: () => {
      brain.load({ force: true });
      syncPush();
    },
    /** Scroll a part into view once the brain is loaded (from "Give the home base your key"). */
    async reveal(part) {
      const target = targets[part];
      if (!target) return;
      if (brain.base()) await brain.load();
      if (destroyed || target.closest('[hidden]')) return;
      safe(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      if (part === 'key' && !keySend.hidden && !keySend.disabled) safe(() => keySend.focus({ preventScroll: true }));
      if (part === 'limits') safe(() => dailyIn.focus({ preventScroll: true }));
    },
    destroy() {
      destroyed = true;
      if (typeof off === 'function') off();
    },
  };
}
