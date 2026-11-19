// Voice Mode × holograms (SPEC §14.1, §16): what Jarvis says when a local hologram command heard in
// Voice Mode has acted. Pure functions with no DOM (test/unit/ui.voice.visuals.test.mjs).
//
//   commandAck(command)        the short spoken acknowledgement of a matched viewer command
//                              ("Expanding.", "Here's the separator."), or '' for none
//   savedBlueprintAck(command) said when "blueprint the <part>" opened a saved sheet (free)
//   spokenPart(name)           a part name as it is said after "the" ("Steel can (+)" -> "the steel can")
//
// `command` is what matchHologramCommand (src/lib/hologram-commands.js) returns: { action, partId?,
// partName?, view?, query? }.

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
    default:
      // close: the viewer is gone and Voice Mode is back; blueprint: its outcome speaks for it.
      return '';
  }
}

/** Said when "blueprint the <part>" opened a blueprint that was already saved (no new build). */
export function savedBlueprintAck(command) {
  const part = spokenPart(command && command.partName);
  return part ? `Here's your saved blueprint of ${part}.` : "Here's your saved blueprint.";
}
