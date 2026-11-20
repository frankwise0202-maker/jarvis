// Key names for the `key` and `hold_key` members -> CDP Input.dispatchKeyEvent parameters.
// Claude writes a single key ("Enter"), a chord joined with "+" ("ctrl+a", "cmd+shift+t") or a
// space-separated sequence ("Backspace Backspace"); names follow the xdotool style it is trained
// on ("Return", "Page_Down", "BackSpace") as well as DOM names ("ArrowDown").

const MOD_BITS = Object.freeze({ alt: 1, ctrl: 2, meta: 4, shift: 8 });

const MODIFIERS = Object.freeze({
  alt: { key: 'Alt', code: 'AltLeft', keyCode: 18, bit: 'alt' },
  ctrl: { key: 'Control', code: 'ControlLeft', keyCode: 17, bit: 'ctrl' },
  meta: { key: 'Meta', code: 'MetaLeft', keyCode: 91, bit: 'meta' },
  shift: { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bit: 'shift' },
});

const MODIFIER_ALIASES = Object.freeze({
  alt: 'alt', option: 'alt', opt: 'alt', alt_l: 'alt', alt_r: 'alt', altleft: 'alt', altright: 'alt',
  ctrl: 'ctrl', control: 'ctrl', control_l: 'ctrl', control_r: 'ctrl', controlleft: 'ctrl', ctl: 'ctrl',
  cmd: 'meta', command: 'meta', meta: 'meta', super: 'meta', super_l: 'meta', super_r: 'meta', win: 'meta', windows: 'meta', metaleft: 'meta', os: 'meta',
  shift: 'shift', shift_l: 'shift', shift_r: 'shift', shiftleft: 'shift',
});

const NAMED = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  insert: { key: 'Insert', code: 'Insert', keyCode: 45 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  capslock: { key: 'CapsLock', code: 'CapsLock', keyCode: 20 },
  contextmenu: { key: 'ContextMenu', code: 'ContextMenu', keyCode: 93 },
};
for (let i = 1; i <= 12; i++) NAMED[`f${i}`] = { key: `F${i}`, code: `F${i}`, keyCode: 111 + i };

const ALIASES = {
  return: 'enter', kp_enter: 'enter', numpadenter: 'enter', 'enter↵': 'enter',
  esc: 'escape', backspace: 'backspace', back_space: 'backspace', del: 'delete', ins: 'insert',
  up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright',
  page_up: 'pageup', prior: 'pageup', pgup: 'pageup', page_down: 'pagedown', next: 'pagedown', pgdn: 'pagedown',
  spacebar: 'space', caps_lock: 'capslock', menu: 'contextmenu', iso_left_tab: 'tab',
};

const PUNCTUATION = {
  '-': { code: 'Minus', keyCode: 189 }, '=': { code: 'Equal', keyCode: 187 }, '[': { code: 'BracketLeft', keyCode: 219 },
  ']': { code: 'BracketRight', keyCode: 221 }, '\\': { code: 'Backslash', keyCode: 220 }, ';': { code: 'Semicolon', keyCode: 186 },
  "'": { code: 'Quote', keyCode: 222 }, ',': { code: 'Comma', keyCode: 188 }, '.': { code: 'Period', keyCode: 190 },
  '/': { code: 'Slash', keyCode: 191 }, '`': { code: 'Backquote', keyCode: 192 }, '+': { code: 'Equal', keyCode: 187 },
};
const PUNCT_NAMES = { minus: '-', equal: '=', equals: '=', plus: '+', comma: ',', period: '.', dot: '.', slash: '/', backslash: '\\', semicolon: ';', apostrophe: "'", quote: "'", grave: '`', backquote: '`', bracketleft: '[', bracketright: ']' };

// Editing commands CDP runs directly (on macOS, shortcut keys alone do not edit text fields).
// Never paste, copy or cut: Jarvis does not use the owner's clipboard (see isClipboardChord).
const EDIT_COMMANDS = Object.freeze({ a: 'selectAll', z: 'undo', y: 'redo' });

function resolveKey(name) {
  const raw = String(name);
  const lower = raw.toLowerCase();
  if (NAMED[lower]) return { ...NAMED[lower] };
  if (ALIASES[lower]) return { ...NAMED[ALIASES[lower]] };
  if (PUNCT_NAMES[lower]) return resolveKey(PUNCT_NAMES[lower]);
  if (raw.length === 1) {
    const ch = raw;
    if (/[a-z]/i.test(ch)) {
      const up = ch.toUpperCase();
      return { key: ch, code: `Key${up}`, keyCode: up.charCodeAt(0), text: ch };
    }
    if (/[0-9]/.test(ch)) return { key: ch, code: `Digit${ch}`, keyCode: ch.charCodeAt(0), text: ch };
    if (PUNCTUATION[ch]) return { key: ch, ...PUNCTUATION[ch], text: ch };
  }
  return null;
}

/**
 * Parses the `text` of a key / hold_key call into chords: [{ mods: ['ctrl', ...], key }].
 * Throws an Error with text for Claude when a name is unknown.
 */
export function parseKeys(text) {
  const src = String(text ?? '').trim();
  if (!src) throw new Error('Error: key needs a key name such as "Enter" or "ctrl+a".');
  const chords = [];
  for (const item of src.split(/\s+/)) {
    // "ctrl++" and a bare "+" mean the plus key.
    const parts = item === '+' ? ['+'] : item.replace(/\+\+$/, '+plus').split('+').filter((p) => p !== '');
    const mods = [];
    let key = null;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const mod = MODIFIER_ALIASES[p.toLowerCase()];
      if (mod && i < parts.length - 1) {
        if (!mods.includes(mod)) mods.push(mod);
        continue;
      }
      if (mod && i === parts.length - 1) {
        // A lone modifier ("shift") is pressed as a key.
        key = { ...MODIFIERS[mod], isModifier: true };
        continue;
      }
      if (key) throw new Error(`Error: "${item}" names more than one key; join modifiers with "+", e.g. "ctrl+shift+t".`);
      key = resolveKey(p);
      if (!key) throw new Error(`Error: unknown key "${p}". Use names like Enter, Tab, Escape, Backspace, ArrowDown, PageDown, a, 1, or chords like "ctrl+a".`);
    }
    if (!key) throw new Error(`Error: "${item}" has no key.`);
    chords.push({ mods, key });
  }
  return chords;
}

export function modifierBits(mods) {
  return (mods || []).reduce((bits, m) => bits | (MOD_BITS[m] || 0), 0);
}

/** Parses a `modifiers` string for clicks ("shift", "ctrl+shift") into CDP bits. Throws on unknown names. */
export function clickModifiers(text) {
  if (text === undefined || text === null || text === '') return 0;
  let bits = 0;
  for (const p of String(text).toLowerCase().split('+').map((s) => s.trim()).filter(Boolean)) {
    const mod = MODIFIER_ALIASES[p];
    if (!mod) throw new Error(`Error: unknown modifier "${p}". Use shift, ctrl, alt or cmd, joined with "+".`);
    bits |= MOD_BITS[mod];
  }
  return bits;
}

/**
 * CDP Input.dispatchKeyEvent parameter lists for one chord: modifier downs, the key down/up
 * (`repeat` times) and modifier ups. `hold` splits it: { down, up } for hold_key.
 */
export function chordEvents(chord, { repeat = 1 } = {}) {
  const bits = modifierBits(chord.mods);
  const down = [];
  const up = [];
  let held = 0;
  for (const m of chord.mods) {
    const def = MODIFIERS[m];
    held |= MOD_BITS[m];
    down.push({ type: 'rawKeyDown', key: def.key, code: def.code, windowsVirtualKeyCode: def.keyCode, modifiers: held });
  }
  const k = chord.key;
  const shifted = bits & MOD_BITS.shift;
  const printable = typeof k.text === 'string' && !(bits & (MOD_BITS.ctrl | MOD_BITS.meta | MOD_BITS.alt));
  const letter = typeof k.text === 'string' && /^[a-z]$/.test(k.text);
  const text = printable ? (shifted && letter ? k.text.toUpperCase() : k.text) : undefined;
  let command = (bits & (MOD_BITS.ctrl | MOD_BITS.meta)) && /^[a-z]$/i.test(k.key) ? EDIT_COMMANDS[k.key.toLowerCase()] : undefined;
  if (command === 'undo' && shifted) command = 'redo'; // cmd+shift+z
  const keyDown = {
    type: text ? 'keyDown' : 'rawKeyDown',
    key: shifted && letter ? k.text.toUpperCase() : k.key,
    code: k.code,
    windowsVirtualKeyCode: k.keyCode,
    modifiers: bits,
    ...(text ? { text, unmodifiedText: k.text } : {}),
    ...(command ? { commands: [command] } : {}),
  };
  const keyUp = { type: 'keyUp', key: keyDown.key, code: k.code, windowsVirtualKeyCode: k.keyCode, modifiers: bits };
  const press = [];
  for (let i = 0; i < Math.max(1, repeat); i++) press.push(keyDown, keyUp);
  const ups = [];
  for (const m of [...chord.mods].reverse()) {
    const def = MODIFIERS[m];
    held &= ~MOD_BITS[m];
    ups.push({ type: 'keyUp', key: def.key, code: def.code, windowsVirtualKeyCode: def.keyCode, modifiers: held });
  }
  return { down, press, up: ups, keyDown, keyUp };
}

/** A readable chord for step labels: "Enter", "⌘A", "Ctrl+Shift+T". */
export function chordLabel(chord) {
  const names = { meta: '⌘', ctrl: 'Ctrl+', alt: '⌥', shift: '⇧' };
  const key = chord.key.key === ' ' ? 'Space' : chord.key.key.length === 1 ? chord.key.key.toUpperCase() : chord.key.key;
  return `${chord.mods.map((m) => names[m]).join('')}${key}`;
}

export function isEnterChord(chord) {
  return chord.key.key === 'Enter';
}

export function isEscapeChord(chord) {
  return chord.key.key === 'Escape';
}

/** Space with any modifiers: Chrome presses a focused button (or flips a switch) on Space whatever else is held. */
export function isSpaceChord(chord) {
  return chord.key.key === ' ';
}

/** Whether the chord types a character (a letter, digit or punctuation key without ctrl, cmd or alt). */
export function isPrintableChord(chord) {
  const k = chord.key;
  return typeof k.text === 'string' && k.text !== '\r' && !k.isModifier && !chord.mods.some((m) => m === 'ctrl' || m === 'meta' || m === 'alt');
}

/** What the guard needs to judge a key as a shortcut: { key (DOM name), mods, printable }. */
export function shortcutInfo(chord) {
  return { key: chord.key.key, mods: [...chord.mods], printable: isPrintableChord(chord) };
}

const hasCmd = (chord) => chord.mods.includes('ctrl') || chord.mods.includes('meta');

/**
 * A chord that pastes from the clipboard: cmd/ctrl+V (with any other modifiers) and
 * Shift+Insert. Chrome pastes on these by itself on Windows, Linux and ChromeOS, so leaving the
 * paste command out of the key event is not enough: Jarvis refuses these chords.
 */
export function isPasteChord(chord) {
  const k = chord?.key?.key || '';
  return (/^v$/i.test(k) && hasCmd(chord)) || (k === 'Insert' && chord.mods.includes('shift') && !hasCmd(chord));
}

/** A chord that copies or cuts to the clipboard (cmd/ctrl+C or X, Ctrl+Insert, Shift+Delete). */
export function isCopyCutChord(chord) {
  const k = chord?.key?.key || '';
  return (/^[cx]$/i.test(k) && hasCmd(chord)) || (k === 'Insert' && hasCmd(chord)) || (k === 'Delete' && chord.mods.includes('shift') && !hasCmd(chord));
}

/** Pasting, copying or cutting: Jarvis never touches the owner's clipboard. */
export function isClipboardChord(chord) {
  return isPasteChord(chord) || isCopyCutChord(chord);
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

/** A bare scrolling key (arrows, Page Up/Down, Home, End; Shift allowed, no Ctrl, Cmd or Alt). */
export function isScrollChord(chord) {
  return SCROLL_KEYS.has(chord?.key?.key) && !chord.mods.some((m) => m === 'ctrl' || m === 'meta' || m === 'alt');
}

/** A lone modifier key ("shift"): pressing it alone changes nothing. */
export function isModifierChord(chord) {
  return !!chord?.key?.isModifier;
}
