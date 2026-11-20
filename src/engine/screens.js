// Screens (v7) in the lead turn: the open_screen client tool. Jarvis can put what the owner is
// looking at (or a named item) on their second monitor, in a floating panel beside their work, or
// in its own window, and bring it back ("I've put the report on your second screen."). The app does
// the placement (deps.screens.open, src/ui/screens/controller.js) and reports what happened; this
// module validates the input and turns the outcome into the tool_result. No DOM access here.
//
// Lead tools are frozen per conversation, so open_screen ships in lead tools version 5 (v7, new
// conversations), after the Optics tools:
//   leadToolsV5() = [...leadToolsV4(), pinLabelsTool(), lookThroughCameraTool(), openScreenTool()]
//   LEAD_SYSTEM_V4 = LEAD_SYSTEM_V3 + "# Camera and screens", before "# Writing the answer"
// See prompts.js, and lead.js (the dispatch, which runs the tool only when the conversation's frozen
// tools include it: a V4 conversation answers a stray call with "Unknown tool").
//
// The app's dependency (deps.screens; it may return a value or a Promise):
//   open({ what, where, screen, url, id, conversationId, turnId }, { signal }) -> outcome
//   (signal: the turn's; once it aborts (Stop) the app drops a placement still under way, v7.1)
//   outcome: { status: 'opened' | 'needs_tap' | 'needs_permission' | 'closed' | 'nothing' | 'error',
//              kind, title, report, mode: 'screen' | 'pip' | 'window' | 'inapp' | 'tab',
//              label ('SCREEN 2'), screenName, internal, note, button, message }

import { abortError, isPlainObject, singleLine, truncate } from './util.js';

export const SCREEN_TOOL = 'open_screen';
export const SCREEN_WHATS = Object.freeze(['this', 'hologram', 'blueprint', 'mission', 'answer', 'photo', 'camera', 'link']);
export const SCREEN_WHERES = Object.freeze(['other_screen', 'beside', 'window', 'back']);
/** The longest the engine waits for the app to place a screen (it never waits for the owner). */
export const SCREEN_TIMEOUT_MS = 4000;
const LIBRARY_ID = /^lib_[a-z0-9]{6,16}$/;

export const OPEN_SCREEN_DESCRIPTION = `Put something on another screen for the owner, or bring it back: their second monitor, a floating panel that stays on top beside what they are working on, or its own window. The app does it on the owner's device at no cost and reports what happened. Use it only when the owner asks ("put the report on my second screen", "float the hologram", "open that link in a window", "bring it back"), never on your own initiative. With what "this", the app shows whatever the owner is looking at: the open viewer, else the newest card in the chat. When the result says the owner must tap a button first, tell them so and do not call the tool again for that request.`;

/** The open_screen tool definition (a fresh copy). Part of leadToolsV5: never edit it. */
export function openScreenTool() {
  return {
    name: SCREEN_TOOL,
    description: OPEN_SCREEN_DESCRIPTION,
    input_schema: {
      type: 'object',
      properties: {
        what: {
          type: 'string',
          enum: [...SCREEN_WHATS],
          description: 'What to show: "this" (what the owner is looking at), or the newest hologram, blueprint, mission (Mission Control), answer (the latest answer or research report), photo, camera (the live camera view) or link (a web page from this conversation: give url).',
        },
        where: {
          type: 'string',
          enum: [...SCREEN_WHERES],
          description: '"other_screen": the owner\'s other monitor (with only one monitor it floats beside them instead); "beside": a floating panel that stays on top; "window": its own window beside the app; "back": close the other screen and show it in the main window again.',
        },
        screen: { type: 'integer', minimum: 1, maximum: 9, description: 'Only when the owner names a monitor number, e.g. 3 for "screen 3".' },
        url: { type: 'string', description: 'For what "link": the URL exactly as it appears in this conversation.' },
        id: { type: 'string', description: 'A saved hologram or blueprint id from <turn_context> (like "lib_ab12cd34ef"), to show that item.' },
      },
      required: ['what', 'where'],
    },
  };
}

const WHAT_ALIASES = { report: 'answer', reply: 'answer', research: 'answer', mission_control: 'mission', optics: 'camera', image: 'photo', picture: 'photo', url: 'link' };
const WHERE_ALIASES = { other: 'other_screen', second_screen: 'other_screen', monitor: 'other_screen', screen: 'other_screen', float: 'beside', floating: 'beside', pip: 'beside', popup: 'window', tab: 'window', here: 'back', close: 'back' };

/**
 * Validate open_screen input. -> { ok: true, value: { what, where ('other'|'beside'|'window'|'back'), screen, url, id } }
 * | { ok: false, error }
 */
export function validateOpenScreenInput(input) {
  if (!isPlainObject(input)) return { ok: false, error: 'Invalid open_screen input: it must be an object with "what" and "where".' };
  const rawWhat = typeof input.what === 'string' ? input.what.trim().toLowerCase() : '';
  const rawWhere = typeof input.where === 'string' ? input.where.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  const what = SCREEN_WHATS.includes(rawWhat) ? rawWhat : WHAT_ALIASES[rawWhat];
  const whereKey = SCREEN_WHERES.includes(rawWhere) ? rawWhere : WHERE_ALIASES[rawWhere];
  if (!what) return { ok: false, error: `Invalid open_screen input: "what" must be one of ${SCREEN_WHATS.join(', ')}.` };
  if (!whereKey) return { ok: false, error: `Invalid open_screen input: "where" must be one of ${SCREEN_WHERES.join(', ')}.` };
  let screen = null;
  if (input.screen !== undefined && input.screen !== null) {
    const n = Number(input.screen);
    if (!Number.isInteger(n) || n < 1 || n > 9) return { ok: false, error: 'Invalid open_screen input: "screen" must be a monitor number from 1 to 9.' };
    screen = n;
  }
  let url = null;
  if (what === 'link' && input.url !== undefined && input.url !== null) {
    if (typeof input.url !== 'string' || !/^https?:\/\//i.test(input.url.trim()) || input.url.length > 2048) {
      return { ok: false, error: 'Invalid open_screen input: "url" must be an http(s) link from this conversation.' };
    }
    url = input.url.trim();
  }
  let id = null;
  if (input.id !== undefined && input.id !== null && input.id !== '') {
    const s = typeof input.id === 'string' ? input.id.trim() : '';
    if (!LIBRARY_ID.test(s)) return { ok: false, error: 'Invalid open_screen input: "id" must be a saved item id from <turn_context>, like "lib_ab12cd34ef".' };
    id = s;
  }
  const where = whereKey === 'other_screen' ? 'other' : whereKey;
  return { ok: true, value: { what, where, screen, url, id } };
}

const oneLine = (s, max) => truncate(singleLine(typeof s === 'string' ? s : ''), max);

/** 'the hologram "2024 Toyota Camry Hybrid"', 'Mission Control', 'the report "EV SUVs"'. */
function nameOf(outcome) {
  const kind = outcome.kind;
  const title = oneLine(outcome.title, 80).replace(/"/g, "'");
  const base = kind === 'mission' ? 'Mission Control' : kind === 'answer' ? (outcome.report ? 'the report' : 'the answer') : kind === 'camera' ? 'the camera view' : kind ? `the ${kind}` : 'it';
  return title && kind !== 'camera' ? `${base} "${title}"` : base;
}

const NOTE_TEXT = {
  'single-screen': 'Only one screen is connected, so it is floating beside the owner\'s work instead.',
  'no-wm': 'This browser cannot choose a screen, so it opened in a new window; the owner can drag it to the other screen.',
  'wm-denied': 'Window placement is blocked in the browser\'s site settings, so it opened in a new window the owner can drag to the other screen.',
  'no-pip': 'This browser has no floating panels, so it opened in a window beside the app.',
  'same-screen': 'Jarvis is already on that screen, so it opened in a window there.',
  'no-such-screen': 'There is no monitor with that number, so it went to the other screen.',
};

/** The tool_result for an outcome: { content, is_error? }. */
export function screenToolResult(outcome) {
  const o = isPlainObject(outcome) ? outcome : {};
  const note = NOTE_TEXT[o.note] ? ` ${NOTE_TEXT[o.note]}` : '';
  const name = nameOf(o);
  const label = typeof o.label === 'string' && o.label ? o.label.toLowerCase() : 'the other screen';
  switch (o.status) {
    case 'opened': {
      if (o.mode === 'screen') {
        const which = o.internal ? 'the laptop\'s own screen' : 'the owner\'s other monitor';
        const named = o.screenName ? `, ${oneLine(o.screenName, 40).replace(/"/g, "'")}` : '';
        return { content: `Opened ${name} on ${label} (${which}${named}), maximized.${note} Tell the owner in a few words.` };
      }
      if (o.mode === 'pip') return { content: `${capital(name)} is floating beside the owner's work in a panel that stays on top; they can move and resize it.${note} Tell the owner in a few words.` };
      if (o.mode === 'window') return { content: `Opened ${name} in its own window beside the app.${note} Tell the owner in a few words.` };
      if (o.mode === 'tab') return { content: `Opened ${name} in a new tab (the owner is on a phone).` };
      if (o.mode === 'inapp') return { content: `The owner's device has one screen, so ${name} opened full screen in the app instead. Tell them.` };
      return { content: `Opened ${name}.${note}` };
    }
    case 'needs_tap':
      // The camera is off: a tool call never turns it on (src/ui/screens/controller.js).
      if (o.note === 'camera-off') return { content: `The camera is off, and only the owner can turn it on: they now see a "${oneLine(o.button || 'Turn on camera', 40)}" button. Tell them to tap it if they want to see the camera there. Do not call open_screen or look_through_camera again for this request.` };
      return { content: `The browser needs one tap from the owner before it can open the window: they now see a "${oneLine(o.button || 'Open', 40)}" button for ${name}. Tell them to tap it. Do not call open_screen again for this request.` };
    case 'needs_permission':
      return { content: `To use the owner's other monitor, the browser will ask them once to allow window management: they now see a short explanation with an "Allow" button. Tell them to tap it. Do not call open_screen again for this request.` };
    case 'closed':
      if (o.count === 0) return { content: 'Nothing was open on another screen.' };
      // A camera screen whose camera was off closes without turning the camera on in the main window.
      if (o.kind === 'camera' && o.back === false) return { content: `Closed the camera view on ${label}; the camera is off now.` };
      return { content: `Closed ${label} and brought ${name} back to the owner's main window.` };
    case 'nothing':
      return { content: oneLine(o.message, 300) || 'There is nothing to show on a screen yet.', is_error: true };
    default:
      return { content: `The screen could not be opened: ${oneLine(o.message, 300) || 'unknown problem'}.`, is_error: true };
  }
}

function capital(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The app's answer, null after `ms`, or an AbortError as soon as `signal` aborts (Stop). */
function withTimeout(promise, ms, signal) {
  let timer;
  let onAbort = null;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => resolve(null), ms);
      if (signal) {
        onAbort = () => reject(abortError());
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
    }),
  ]).finally(() => {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  });
}

/**
 * Run one open_screen call of a tool round and return its tool_result { content, is_error? }.
 * Never throws, except an AbortError when the owner stops the turn meanwhile (v7.1: before, Stop
 * waited for the app, up to 4 s, and the screen could still open afterwards; the app gets the
 * turn's signal and drops a placement still under way). ctx: the lead turn context (conv, turn,
 * deps, signal).
 */
export async function runOpenScreen(ctx, toolUse) {
  const check = validateOpenScreenInput(toolUse && toolUse.input);
  if (!check.ok) return { content: check.error, is_error: true };
  const screens = ctx && ctx.deps && ctx.deps.screens;
  if (!screens || typeof screens.open !== 'function') return { content: 'Screens are not available on this device right now.', is_error: true };
  const signal = (ctx && ctx.signal) || null;
  if (signal && signal.aborted) throw abortError();
  try {
    const outcome = await withTimeout(
      Promise.resolve().then(() => screens.open({ ...check.value, conversationId: ctx.conv ? ctx.conv.id : null, turnId: ctx.turn ? ctx.turn.id : null }, { signal })),
      ctx.screenTimeoutMs ?? SCREEN_TIMEOUT_MS,
      signal,
    );
    if (!outcome) return { content: 'The app did not answer in time, so the screen may not have opened. Ask the owner whether they can see it.', is_error: true };
    return screenToolResult(outcome);
  } catch (err) {
    if (err && err.name === 'AbortError' && signal && signal.aborted) throw err;
    return { content: `The screen could not be opened: ${oneLine(String((err && err.message) || err), 200)}.`, is_error: true };
  }
}

/** Resume never reopens screens: Resume is one tap on a checkpoint, not the owner asking now. */
export const SCREEN_NOT_RESUMED = 'Screens are not reopened when resuming; ask again if it is still wanted.';
