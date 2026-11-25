// Pure helpers of UI modules (FX-UI's code; their DOM is covered by the E2E scenarios):
// share.js export sanitizers (keys never leave, Markdown stays inert), the backup-import toast
// text (settings.js importSummary) and the composer's swarm sizes. Run in plain Node.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { closeFences, containsApiKey, redactSecrets, REDACTED_KEY, safeMarkdown } from '../../src/ui/share.js';
import { importSummary } from '../../src/ui/settings.js';

const KEY = 'sk-ant-api03-SAVED_KEY_abcdefghijklmnop-XY';
const FENCE = '```';

let composer;
before(async () => {
  // composer.js imports its stylesheet (the build bundles it), so load it through esbuild.
  const esbuild = await import('esbuild');
  const out = await esbuild.build({
    entryPoints: [new URL('../../src/ui/composer.js', import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    loader: { '.css': 'empty' },
    logLevel: 'silent',
  });
  composer = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
});

// ---- share.js: no key ever leaves in an export ------------------------------------------------

test('redactSecrets removes the saved key (also Markdown-escaped) and anything shaped like a key', () => {
  assert.equal(REDACTED_KEY, '[API key removed]');
  assert.equal(redactSecrets(`my key ${KEY} ok`, KEY), 'my key [API key removed] ok');
  assert.equal(redactSecrets(`escaped: ${KEY.replace(/_/g, '\\_')} ok`, KEY), 'escaped: [API key removed] ok', 'an escaper put "\\" before "_"');
  assert.equal(redactSecrets('old one: sk-ant-api03-OTHEROTHEROTHEROTHER-zz.'), 'old one: [API key removed].');
  assert.equal(redactSecrets('Sk-Ant-api03-OTHEROTHEROTHEROTHER-zz'), REDACTED_KEY, 'a capitalized prefix still holds the secret');
  assert.equal(redactSecrets('two: sk-ant-' + 'a'.repeat(24) + ' and sk-ant-' + 'b'.repeat(30)), 'two: [API key removed] and [API key removed]');
  // Not keys: too short, or a different prefix; non-strings become ''.
  assert.equal(redactSecrets('sk-ant-short and sk-live-abcdefghijklmnopqrstuvwxyz'), 'sk-ant-short and sk-live-abcdefghijklmnopqrstuvwxyz');
  assert.equal(redactSecrets(null), '');
  assert.equal(redactSecrets('nothing to do', 'short'), 'nothing to do');
  assert.deepEqual([containsApiKey(`x ${KEY}`), containsApiKey('SK-ANT-' + 'Q'.repeat(20)), containsApiKey('sk-ant-short'), containsApiKey(5)], [true, true, false, false]);
});

// ---- share.js: exported Markdown is inert in any viewer -------------------------------------

test('safeMarkdown neutralizes raw HTML and unsafe links but keeps safe links and readable code', () => {
  assert.equal(safeMarkdown('Hi <script>alert(1)</script> & <img src=x onerror=alert(1)>'), 'Hi &lt;script>alert(1)&lt;/script> & &lt;img src=x onerror=alert(1)>');
  assert.equal(
    safeMarkdown('[x](javascript:alert(1)) [ok](https://example.com) [m](mailto:a@b.c) [f](#top)'),
    '[x]\\(javascript:alert(1)) [ok](https://example.com) [m](mailto:a@b.c) [f](#top)',
  );
  assert.equal(safeMarkdown('[a]: javascript:alert(1)\n[b]: https://ok.example'), '[a\\]: javascript:alert(1)\n[b]: https://ok.example');
  assert.equal(safeMarkdown('<https://example.com> and a < b and <!-- c -->'), '&lt;https://example.com> and a < b and &lt;!-- c -->', 'a plain "<" stays');
  // Column-0 fenced code stays as written; everything around it is neutralized.
  assert.equal(safeMarkdown(`${FENCE}html\n<b>bold</b>\n${FENCE}\n<b>outside</b>`), `${FENCE}html\n<b>bold</b>\n${FENCE}\n&lt;b>outside&lt;/b>`);
  // An indented fence may end with its list item before the fence does: then nothing is exempt.
  assert.equal(safeMarkdown(`- item\n  ${FENCE}\n  <b>x</b>\n  ${FENCE}`), `- item\n  ${FENCE}\n  &lt;b>x&lt;/b>\n  ${FENCE}`);
  for (const md of ['a <b>x</b> [l](javascript:y) \\<i>z</i>', `${FENCE}\n<b>\n${FENCE}\n<i>`, '[r]: data:text/html,x', 'plain text']) {
    assert.equal(safeMarkdown(safeMarkdown(md)), safeMarkdown(md), `idempotent: ${md}`);
    assert.doesNotMatch(safeMarkdown(md).replace(/^```[\s\S]*?^```/gm, ''), /<(?:[A-Za-z!/?])/, `no live tag opener left outside code: ${md}`);
  }
});

test('closeFences closes a code block a stopped or truncated reply left open', () => {
  assert.equal(closeFences(`${FENCE}js\nlet a = 1;`), `${FENCE}js\nlet a = 1;\n${FENCE}`);
  assert.equal(closeFences(`${FENCE}\nx\n${FENCE}`), `${FENCE}\nx\n${FENCE}`);
  assert.equal(closeFences('~~~~\ncode'), '~~~~\ncode\n~~~~');
  assert.equal(closeFences('no code here'), 'no code here');
});

// ---- settings.js: what the import toast says ----------------------------------------------------

test('importSummary says what a backup import restored, copied and skipped', () => {
  const ok = (message) => ({ message, level: 'success' });
  assert.deepEqual(importSummary({ conversations: 3, memory: 5, settings: true }), ok('Restored 3 conversations, 5 memories and your preferences.'));
  assert.deepEqual(importSummary({ conversations: 1 }), ok('Restored 1 conversation.'));
  assert.deepEqual(importSummary({ conversations: 0, memory: 1, protocols: 2 }), ok('Restored 1 memory and 2 protocols.'));
  assert.deepEqual(importSummary({ settings: false, settingsChanged: ['theme'] }), ok('Restored your preferences.'));
  assert.deepEqual(importSummary({ conversations: 1, library: 2 }), ok('Restored 1 conversation and 2 saved holograms and blueprints.'));
  assert.deepEqual(importSummary({ library: 1 }), ok('Restored 1 saved hologram or blueprint.'));
  // The home base's address (v7.5): named on its own, only when it was restored (a device had none linked).
  assert.deepEqual(importSummary({ settings: true, settingsChanged: ['homeBaseUrl'], homeBase: 'alienware' }), ok('Restored your home base’s address (alienware).'));
  assert.deepEqual(
    importSummary({ conversations: 2, settings: true, settingsChanged: ['theme', 'homeBaseUrl'], homeBase: 'alienware' }),
    ok('Restored 2 conversations, your preferences and your home base’s address (alienware).'),
  );
  assert.deepEqual(importSummary({ settings: true, settingsChanged: ['homeBaseUrl'] }), ok('Restored your home base’s address.'));
  const nothing = ok('Nothing new to restore: this device already has everything in that backup.');
  assert.deepEqual(importSummary({}), nothing);
  assert.deepEqual(importSummary(null), nothing);
  assert.deepEqual(importSummary({ skipped: 2 }), { message: 'Nothing was restored. 2 conversations weren’t made by Jarvis (or were damaged) and were skipped.', level: 'warn' });
  // The exact result importBackup() returns (platform/backup.js) for a diverged conversation.
  assert.deepEqual(importSummary({ conversations: 2, copies: 1, replaced: ['a'], memory: 0, settings: true, settingsChanged: ['theme'], skipped: 1 }), {
    message: 'Restored 2 conversations and your preferences. One conversation had changed on both devices, so the backup’s version was added as a copy “(from backup)”. 1 conversation wasn’t made by Jarvis (or was damaged) and was skipped.',
    level: 'warn',
  });
});

// ---- composer.js: the swarm team sizes ------------------------------------------------------------

test('composer swarm sizes: the offered sizes, the default team size and snapping', () => {
  const { SWARM_SIZES, swarmSizesFor, defaultTeamSize, snapSwarmSize } = composer;
  assert.deepEqual(SWARM_SIZES, [3, 6, 10, 15, 20]);
  assert.deepEqual(swarmSizesFor(8), [3, 6, 8, 10, 15, 20], 'the owner’s default joins the list');
  assert.deepEqual(swarmSizesFor(10), [3, 6, 10, 15, 20], 'no duplicate');
  assert.deepEqual(swarmSizesFor('nonsense'), [3, 6, 8, 10, 15, 20]);
  assert.deepEqual([defaultTeamSize(12), defaultTeamSize(25), defaultTeamSize(3.6), defaultTeamSize(0), defaultTeamSize('x')], [12, 20, 4, 8, 8]);
  assert.deepEqual([snapSwarmSize(12), snapSwarmSize(12.5), snapSwarmSize(4.5), snapSwarmSize(100), snapSwarmSize(-5), snapSwarmSize(NaN)], [10, 15, 6, 20, 3, 10], 'halfway rounds up');
  assert.deepEqual([snapSwarmSize(7, [3, 6, 8, 10]), snapSwarmSize(6.9, [3, 6, 8, 10])], [8, 6], 'with the default (8) offered too');
});
