// PRIVACY-8: README's Privacy section is where the owner reads when the microphone is on. v8.1's hands-free listening on a
// Mac must be there, not only under "Hands-free on a Mac": the conversation going on in the background (with its 8-s
// window and the brake), Standby's microphone kept on through a conversation for barge-in, a second window taking
// Standby only when the one listening closes, Chrome's questions said out loud, and the indicators.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');

function privacySection() {
  const start = readme.indexOf('\n## Privacy\n');
  assert.ok(start >= 0, 'README has a Privacy section');
  const end = readme.indexOf('\n## ', start + 5);
  return readme.slice(start, end < 0 ? undefined : end);
}

/** The top-level bullet of the Privacy section that starts with `title` (with its sub-bullets), one line. */
function bullet(section, title) {
  const at = section.indexOf(`\n- **${title}`);
  assert.ok(at >= 0, `Privacy has a “${title}” bullet`);
  const next = section.indexOf('\n- **', at + 4);
  return section.slice(at, next < 0 ? undefined : next).replace(/\s+/g, ' ');
}

test('PRIVACY-8: README Privacy has a “Hands-free on a Mac” bullet with each new way Jarvis listens, and how to tell', () => {
  const b = bullet(privacySection(), 'Hands-free on a Mac.');
  const says = [
    [/in the background/, 'he listens in the background'],
    [/you started|owner-started/, 'only in sessions the owner started'],
    [/8 seconds/, 'the 8-s follow-up window'],
    [/at most 3 questions/, 'the brake'],
    [/Standby's microphone on through the whole conversation/, 'Standby’s microphone kept on through a conversation (barge-in)'],
    [/only when that window closes/, 'a second window takes Standby only when the one listening closes'],
    [/leave Standby, the others leave it too/, 'leaving Standby leaves it in the other windows too'],
    [/Chrome's questions are said out loud/, 'Chrome’s questions said aloud'],
    [/chimes/, 'the chimes'],
    [/title/, 'the tab title'],
    [/notification/, 'the notification'],
    [/Keep talking when Jarvis is in the background/, 'the setting that turns it off'],
  ];
  for (const [re, what] of says) assert.match(b, re, `it says: ${what}`);
});

test('PRIVACY-8: the Standby bullet no longer says Voice Mode “takes over as usual”, and leaving Standby turns the microphone off in every window', () => {
  const b = bullet(privacySection(), 'Standby (Wake Jarvis).');
  assert.doesNotMatch(b, /takes over as usual/);
  assert.match(b, /Leaving Standby turns the microphone off, in every Jarvis window/);
});
