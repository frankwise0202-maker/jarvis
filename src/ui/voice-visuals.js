// Voice Mode × holograms (SPEC §14.1, §16): what Jarvis says when a local hologram command heard in
// Voice Mode has acted. Pure functions with no DOM (test/unit/ui.voice.visuals.test.mjs).
//
//   commandAck(command)        the short spoken acknowledgement of a matched viewer command
//                              ("Expanding.", "Here's the separator."), or '' for none
//   savedBlueprintAck(command) said when "blueprint the <part>" opened a saved sheet (free)
//   spokenPart(name)           a part name as it is said after "the" ("Steel can (+)" -> "the steel can")
//   blueprintQuestion({ partName, title, cost })
//                              asked before a 2D build from a softer wording ("rotor blueprint"):
//                              "Shall I draw a blueprint of the rotor? It costs about 15 cents."
//   confirmReply(text)         the owner's answer to it: 'yes' | 'no' | null (not an answer)
//   spokenCost('≈ $0.15')      "about 15 cents"
//   partHint(words, command)   v8.1 (R10): inside a hologram its part names win, so "open the camera"
//                              selects the laptop's camera; the hint after the line says how to reach
//                              the owner's own camera: "Say 'open Optics' for your camera." ('' for none)
//   nothingBackAck()           v8.1 (C3): "go back" with a hologram and nothing to go back to
//
// `command` is what matchHologramCommand (src/lib/hologram-commands.js) returns: { action, partId?,
// partName?, view?, query? }, or { action: 'which-part', for: 'isolate'|'focus' } (the viewer:
// "isolate it" with nothing selected).

const VIEW_WORDS = Object.freeze({
  front: 'Front view.',
  back: 'Back view.',
  left: 'Left side.',
  right: 'Right side.',
  top: 'Top view.',
  bottom: 'From below.',
  'front-left': 'Three-quarter view.',
  'front-right': 'Three-quarter view.',
  'back-left': 'Rear three-quarter view.',
  'back-right': 'Rear three-quarter view.',
});

const SIMPLE = Object.freeze({
  explode: 'Expanding.',
  collapse: 'Putting it back together.',
  rotate: 'Rotating.',
  stop: 'Holding still.',
  'labels-on': 'Labels on.',
  'labels-off': 'Labels off.',
  reset: 'Back to the start.',
  'zoom-in': 'Zooming in.',
  'zoom-out': 'Zooming out.',
  'show-all': 'Showing every part.',
  deselect: 'Cleared.',
  'parts-list': 'Here are the parts.',
});

/**
 * A part's name as it is said after "the": without "(+)"-style qualifiers, and lower-case unless
 * it starts with an acronym ("DC-DC converter", "HV battery"). '' when nothing is left.
 */
export function spokenPart(name) {
  let s = String(name ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[−+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s,;:.]+$/, '');
  if (!s) return '';
  s = s.replace(/^the\s+/i, '');
  const first = s.split(' ')[0];
  if (!/[A-Z0-9].*[A-Z0-9]/.test(first) && /^[A-Z][a-z]/.test(first)) s = s[0].toLowerCase() + s.slice(1);
  return `the ${s}`;
}

/** The short spoken acknowledgement of a viewer command that has just acted ('' for none). */
export function commandAck(command) {
  const cmd = command && typeof command === 'object' ? command : {};
  const part = spokenPart(cmd.partName);
  if (Object.prototype.hasOwnProperty.call(SIMPLE, cmd.action)) return SIMPLE[cmd.action];
  switch (cmd.action) {
    case 'optics':
      // Optics over Voice Mode says its own short line ("Switching cameras.", "Camera off.").
      return typeof cmd.ack === 'string' ? cmd.ack.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
    case 'view':
      return VIEW_WORDS[cmd.view] || 'Changing the view.';
    case 'select':
      return part ? `Here's ${part}.` : '';
    case 'focus':
      return part ? `Zooming in on ${part}.` : 'Zooming in.';
    case 'isolate':
      return part ? `Just ${part}.` : '';
    case 'photos': {
      if (part) return `Photos of ${part}.`;
      const query = String(cmd.query ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      return query ? `Photos of ${query}.` : 'Here are some photos.';
    }
    case 'which-part':
      return `Which part? Tap one, or say ${cmd.for === 'focus' ? 'zoom in on' : 'isolate'} and its name.`;
    default:
      // close / close-blueprint: the viewer or sheet is gone; blueprint: its outcome speaks for it.
      return '';
  }
}

// The camera words of Optics (open, turn on, start, show me the camera; camera on) that a camera part
// of the hologram on screen takes first (R10).
const CAMERA_WORDS = /\b(?:open|turn on|start|show me|show|switch on|bring up|pull up)\b(?: up)?(?: the| my| your)? (?:camera|webcam|web cam)\b|^\W*(?:camera|webcam) on\W*$/i;

/**
 * R10: a part of the hologram on screen took words that would otherwise open the camera ("open the
 * camera" selected the laptop's camera module): the hint said after the line. '' for anything else.
 */
export function partHint(words, command) {
  const cmd = command && typeof command === 'object' ? command : {};
  if (!['select', 'focus', 'isolate'].includes(cmd.action)) return '';
  const said = String(words ?? '');
  if (/\boptics\b/i.test(said) || !CAMERA_WORDS.test(said)) return '';
  return "Say 'open Optics' for your camera.";
}

/** C3: "go back" with a hologram on screen and no sheet over it (nothing is swallowed silently). */
export function nothingBackAck() {
  return "There's nothing to go back to.";
}

/** Said when "blueprint the <part>" opened a blueprint that was already saved (no new build). */
export function savedBlueprintAck(command) {
  const part = spokenPart(command && command.partName);
  return part ? `Here's your saved blueprint of ${part}.` : "Here's your saved blueprint.";
}

/** A cost label like "≈ $0.15" or "≈ $0.15–0.35" as it is said: "about 15 cents" ('' when none). */
export function spokenCost(label) {
  const nums = String(label ?? '').match(/\d+(?:\.\d+)?/g);
  const vals = (nums || []).slice(0, 2).map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  if (!vals.length) return '';
  const cents = (n) => Math.round(n * 100);
  if (vals.every((n) => n < 1)) {
    return vals.length === 2 && cents(vals[0]) !== cents(vals[1]) ? `about ${cents(vals[0])} to ${cents(vals[1])} cents` : `about ${cents(vals[0])} cents`;
  }
  const dollars = (n) => {
    const d = Math.floor(n);
    const c = Math.round((n - d) * 100);
    return `${d} dollar${d === 1 ? '' : 's'}${c ? ` ${c}` : ''}`;
  };
  return vals.length === 2 ? `about ${dollars(vals[0])} to ${dollars(vals[1])}` : `about ${dollars(vals[0])}`;
}

/**
 * Asked before a 2D blueprint is built from a softer wording ("rotor blueprint", "open the
 * blueprint" with none saved): each sheet costs money, and Voice Mode hears the whole room.
 */
export function blueprintQuestion({ partName = '', title = '', cost = '' } = {}) {
  const what = spokenPart(partName) || spokenPart(title) || 'the whole object';
  const price = spokenCost(cost);
  return `Shall I draw a blueprint of ${what}? It costs ${price || 'a few cents'}.`;
}

const YES_WORDS = '(?:yes|yeah|yea|yep|yup|sure|ok|okay|alright|all right|please|please do|do it|go ahead|go for it|draw it|build it|make it|absolutely|definitely|of course|sounds good|why not|affirmative|yes please)';
const NO_WORDS = '(?:no|nope|nah|no thanks|no thank you|don\'t|dont|do not|cancel|cancel it|never mind|nevermind|not now|not yet|no need|skip|skip it|forget it|stop|leave it)';
const POLITE = '(?: (?:please|thanks|thank you|jarvis|sir))*';
const YES_RE = new RegExp(`^${YES_WORDS}(?: ${YES_WORDS})*${POLITE}$`);
const NO_RE = new RegExp(`^${NO_WORDS}(?: ${NO_WORDS})*${POLITE}$`);

/** The owner's answer to blueprintQuestion: 'yes', 'no', or null when the words are something else. */
export function confirmReply(text) {
  const s = String(text ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:hey |ok |okay )?jarvis /, '')
    .replace(/^(?:um|uh|er|well) /, '');
  if (!s) return null;
  if (YES_RE.test(s)) return 'yes';
  if (NO_RE.test(s)) return 'no';
  return null;
}
