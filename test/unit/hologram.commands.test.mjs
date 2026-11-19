import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Local hologram commands (src/lib/hologram-commands.js): typed or spoken phrasings, speech-to-text
// slips and part matching against the prototype samples (test/mock/fixtures).
import { matchHologramCommand as match, normalizeCommandText, resolvePart, blueprintAskedOutright, commandNeedingPart } from '../../src/lib/hologram-commands.js';
import { normalizeHologramSpec } from '../../src/lib/hologram-spec.js';

const partsOf = (name) =>
  normalizeHologramSpec(JSON.parse(readFileSync(new URL(`../mock/fixtures/${name}.json`, import.meta.url), 'utf8'))).spec.parts.map((p) => ({
    id: p.id,
    name: p.name,
    aka: p.aka,
  }));
const CAMRY = partsOf('camry');
const ALT = partsOf('alternator');
const AA = partsOf('battery');

function expectAction(list, action, parts = CAMRY, extra = {}) {
  for (const text of list) {
    const got = match(text, parts, extra.context || {});
    assert.ok(got, `"${text}" should match ${action}`);
    assert.equal(got.action, action, `"${text}" -> ${JSON.stringify(got)}`);
    for (const [k, v] of Object.entries(extra.fields || {})) assert.equal(got[k], v, `"${text}" ${k}`);
  }
}

test('normalization: punctuation, number words, split letters, units', () => {
  assert.equal(normalizeCommandText('Show me the DC-DC converter!'), 'show me the dc dc converter');
  assert.equal(normalizeCommandText('zoom in on the d c to d c converter'), 'zoom in on the dc dc converter');
  assert.equal(normalizeCommandText('Where is the twelve volt battery?'), 'where is the 12 volt battery');
  assert.equal(normalizeCommandText('the 12V battery'), 'the 12 volt battery');
  assert.equal(normalizeCommandText('Élan’s “part”'), "elan's part");
});

test('explode', () => {
  expectAction(
    [
      'expand',
      'Explode',
      'explode it',
      'exploded view',
      'take it apart',
      'Take it a part',
      'take the car apart',
      'pull it apart',
      'open it up',
      'Jarvis, take it apart please',
      'can you expand it',
      'show me the exploded view',
      'break it down',
      'disassemble the alternator',
      'okay now expand it',
      'expend',
      'blow it apart',
    ],
    'explode',
  );
});

test('collapse', () => {
  expectAction(['collapse', 'Collapse it', 'put it back together', 'put it back to gather', 'assemble', 'reassemble the car', 'put the battery back together', 'back together', 'implode'], 'collapse');
});

test('rotate and stop', () => {
  expectAction(['rotate', 'spin', 'spin it', 'rotate the car', 'start rotating', 'keep spinning', 'turn it around', 'auto rotate'], 'rotate');
  expectAction(['stop', 'Stop!', 'stop rotating', 'stop spinning', 'hold still', 'freeze', 'pause', "don't spin", 'stop it'], 'stop');
});

test('labels on and off', () => {
  expectAction(['labels on', 'show labels', 'turn on the labels', 'show the names', 'label everything', 'labels please'], 'labels-on');
  expectAction(['labels off', 'hide labels', 'turn off the labels', 'no labels', 'remove the labels', 'labels of', 'hide the names'], 'labels-off');
});

test('views and reset', () => {
  const cases = {
    front: ['front view', 'show me the front', 'view it from the front', 'from the front', 'front'],
    back: ['back view', 'rear view', 'from behind', 'show the back', 'look at it from the rear'],
    left: ['side view', 'left side view', 'from the side', 'left view'],
    right: ['right side view', 'from the right', 'right view'],
    top: ['top view', 'from above', "bird's eye view", 'top down view', 'show it from the top'],
    bottom: ['bottom view', 'from below', 'underneath view'],
  };
  for (const [view, list] of Object.entries(cases)) expectAction(list, 'view', CAMRY, { fields: { view } });
  expectAction(['reset', 'reset view', 'reset the camera', 'recenter', 'center it', 'default view'], 'reset');
});

test('close, parts list, zoom, deselect, show all', () => {
  expectAction(['close', 'close it', 'close the hologram', 'exit', "we're done"], 'close');
  expectAction(['parts list', 'show me the parts list', 'list the parts', 'what parts are there'], 'parts-list');
  expectAction(['zoom in', 'closer', 'make it bigger'], 'zoom-in');
  expectAction(['zoom out', 'further away', 'smaller'], 'zoom-out');
  expectAction(['deselect', 'clear selection', 'never mind'], 'deselect');
  expectAction(['show everything', 'show all', 'unisolate', 'bring everything back'], 'show-all');
});

test('select and focus parts by name, plural, id or aka', () => {
  const sel = [
    ['show me the hybrid battery', 'hybrid-battery'],
    ['select the DC-DC converter', 'dcdc-converter'],
    ['highlight the radiators', 'radiators'],
    ['where is the fuel tank', 'fuel-tank'],
    ["where's the 12 volt battery", 'battery-12v'],
    ['find the steering wheel', 'steering-wheel'],
    ['show the exhaust', 'exhaust'],
    ['show me the engine', 'engine'],
    ['the windshield', 'glass'], // not a part name, but "windows"? should not match blindly
  ];
  for (const [text, id] of sel.slice(0, -1)) {
    const got = match(text, CAMRY);
    assert.equal(got && got.action, 'select', text);
    assert.equal(got.partId, id, `${text} -> ${JSON.stringify(got)}`);
  }
  const foc = [
    ['zoom in on the power control unit', 'pcu'],
    ['focus on the transaxle', 'transaxle'],
    ['zoom into the hybrid transaxle', 'transaxle'],
    ['look at the rear seat', 'rear-seat'],
    ['go to the trunk lid', 'trunk-lid'],
    ['take a closer look at the drive shafts', 'drive-shafts'],
  ];
  for (const [text, id] of foc) {
    const got = match(text, CAMRY);
    assert.equal(got && got.action, 'focus', text);
    assert.equal(got.partId, id, `${text} -> ${JSON.stringify(got)}`);
  }
});

test('the Camry has no alternator: "the alternator" finds the DC-DC converter by its aka', () => {
  for (const text of ['show me the alternator', 'where is the alternator', 'alternator', 'zoom in on the alternator']) {
    const got = match(text, CAMRY);
    assert.ok(got, text);
    assert.equal(got.partId, 'dcdc-converter', text);
  }
});

test('alternator parts, including plurals and voice slips', () => {
  const cases = [
    ['show the rotor', 'rotor'],
    ['select the router', 'rotor'], // speech-to-text slip
    ['show me the claw poles', 'rotor'],
    ['where are the slip rings', 'slip-rings'],
    ['show the slip ring', 'slip-rings'],
    ['select the stater', 'stator-core'],
    ['show me the stator windings', 'stator-winding'],
    ['highlight the brushes', 'brushes'],
    ['find the carbon brush', 'brushes'],
    ['show the voltage regulator', 'regulator'],
    ['show the rectifier', 'rectifier'],
    ['where are the diodes', 'rectifier'],
    ['select the pulley', 'pulley'],
    ['show the pulley nut', 'pulley-nut'],
    ['show me the fan', 'fan'],
    ['select the through bolts', 'through-bolts'],
    ['show the b plus terminal', 'b-terminal'],
    ['show the rear housing', 'rear-housing'],
    ['show the front bearing', 'front-bearing'],
    ['show the feeled coil', 'field-coil'],
  ];
  for (const [text, id] of cases) {
    const got = match(text, ALT);
    assert.ok(got, text);
    assert.equal(got.partId, id, `${text} -> ${JSON.stringify(got)}`);
  }
});

test('battery parts', () => {
  const cases = [
    ['show the zinc', 'anode'],
    ['select the anode', 'anode'],
    ['where is the cathode', 'cathode'],
    ['show me the manganese dioxide rings', 'cathode'],
    ['highlight the separator', 'separator'],
    ['show the brass nail', 'collector'],
    ['show the current collector', 'collector'],
    ['show the positive terminal', 'pos-terminal'],
    ['show the negative end cap', 'neg-cap'],
    ['show the steel can', 'can'],
    ['show the seal', 'seal'],
    ['show the label', 'label'],
  ];
  for (const [text, id] of cases) {
    const got = match(text, AA);
    assert.ok(got, text);
    assert.equal(got.partId, id, `${text} -> ${JSON.stringify(got)}`);
  }
});

test('sides and ambiguity', () => {
  const fl = match('show the front left brake', CAMRY);
  assert.equal(fl.partId, 'brake-fl');
  const fr = match('select the right front wheel', CAMRY);
  assert.equal(fr.partId, 'wheel-fr');
  const rl = match('zoom in on the rear left tyre', CAMRY);
  assert.equal(rl.partId, 'wheel-rl');
  const amb = match('show the front brake', CAMRY);
  assert.ok(['brake-fl', 'brake-fr'].includes(amb.partId));
  assert.equal(amb.alternatives.length, 1);
  const driver = match("show the driver's seat", CAMRY);
  assert.equal(driver.partId, 'seat-fl');
});

test('isolate', () => {
  const cases = [
    ['isolate the engine', 'engine'],
    ['I so late the engine', 'engine'],
    ['show only the hybrid battery', 'hybrid-battery'],
    ['just the transaxle', 'transaxle'],
    ['hide everything except the exhaust', 'exhaust'],
    ['show me the fuel tank only', 'fuel-tank'],
  ];
  for (const [text, id] of cases) {
    const got = match(text, CAMRY);
    assert.equal(got && got.action, 'isolate', `${text} -> ${JSON.stringify(got)}`);
    assert.equal(got.partId, id, text);
  }
  assert.deepEqual(match('isolate it', CAMRY, { selected: 'pcu' }), { action: 'isolate', partId: 'pcu' });
  assert.equal(match('isolate it', CAMRY), null);
  // With nothing selected the viewer handles these itself (the last part shown, or "which part?").
  for (const text of ['isolate it', 'Isolate it.', 'isolate', 'isolate this', 'show only that']) assert.equal(commandNeedingPart(text), 'isolate', text);
  for (const text of ['zoom in on it', 'focus on it', 'zoom in on that']) assert.equal(commandNeedingPart(text), 'focus', text);
  for (const text of ['isolate the engine', 'show it', 'expand it', 'blueprint this', 'photos of it', 'what is it', '']) assert.equal(commandNeedingPart(text), null, text);
});

test('photos (free) for the object or a part', () => {
  assert.deepEqual(match('show me photos', CAMRY), { action: 'photos' });
  assert.deepEqual(match('real pictures', CAMRY), { action: 'photos' });
  const p = match('photos of the alternator', ALT);
  assert.equal(p.action, 'photos');
  assert.equal(p.partId, undefined); // "the alternator" is the object itself here, not a part
  const q = match('pictures of the rotor', ALT);
  assert.equal(q.partId, 'rotor');
  assert.equal(match('what does the rectifier look like', ALT).partId, 'rectifier');
  assert.deepEqual(match('photos of it', ALT, { selected: 'pulley' }), { action: 'photos', partId: 'pulley' });
});

test('2D / blueprint: whole object or a part (the paid build)', () => {
  for (const text of ['2D', '2 d', 'two d', 'to d', 'blueprint', 'blue print', 'make a blueprint', 'switch to 2D', 'show me the 2D view', 'draw the blueprint', 'show it in 2D']) {
    assert.deepEqual(match(text, CAMRY), { action: 'blueprint' }, text);
  }
  const cases = [
    ['blueprint the alternator', CAMRY, 'dcdc-converter'],
    ['blueprint of the rotor', ALT, 'rotor'],
    ['2D blueprint of the stator', ALT, 'stator-core'],
    ['blue print of the stater', ALT, 'stator-core'],
    ['make a blueprint for the hybrid battery', CAMRY, 'hybrid-battery'],
    ['show the rectifier in 2D', ALT, 'rectifier'],
  ];
  for (const [text, parts, id] of cases) {
    const got = match(text, parts);
    assert.equal(got && got.action, 'blueprint', `${text} -> ${JSON.stringify(got)}`);
    assert.equal(got.partId, id, text);
  }
  assert.deepEqual(match('blueprint this', ALT, { selected: 'fan' }), { action: 'blueprint', partId: 'fan' });
});

test('everyday and negative phrases never start the paid 2D build (talk about a blueprint is not a request)', () => {
  const never = [
    [ALT, ['skip the blueprint', 'skip the 2D', 'read the blueprint', 'cool blueprint', 'cool drawing', 'make a plan', 'give me a plan for the rotor', 'give me a plan for replacing the rotor', 'show me the drawing', 'do a drawing', 'what\'s the plan', 'fix the drawing', 'save the drawing', 'print the blueprint', 'share the blueprint', 'delete the blueprint', 'email the blueprint', 'hold the blueprint', 'hide the blueprint', 'leave the blueprint', 'no blueprint', 'not the blueprint', 'no blueprint please, how does the regulator work?', "don't make a blueprint", 'do not draw the blueprint', 'blueprint later', "I'll do the blueprint later", 'maybe a blueprint later', 'the blueprint can wait', 'not now, the blueprint', 'never mind the blueprint', 'cancel the blueprint', 'is a blueprint expensive', 'how much is a blueprint', "what's a blueprint"]],
    [CAMRY, ['hold the blueprint', 'hide the blueprint', 'good plan', 'good blueprint', 'read the blueprint', "let's make a plan", 'make a plan for the battery', 'skip the blueprint', 'leave the blueprint']],
    [AA, ['leave the blueprint', 'show me the plans', 'plans', 'the plan', 'show me the drawing', 'skip the blueprint']],
  ];
  for (const [parts, list] of never) {
    for (const text of list) {
      const got = match(text, parts);
      assert.ok(!got || got.action !== 'blueprint', `"${text}" must not start a blueprint (got ${JSON.stringify(got)})`);
    }
  }
  // Talking about it while asking something else is a question for Jarvis.
  assert.equal(match('No blueprint please, how does the regulator work?', ALT), null);
  assert.equal(match('skip the blueprint', ALT), null);
  assert.equal(match('let\'s make a plan', CAMRY), null);
});

test('2D requests that still start (or open) a blueprint: explicit wording, exact part names', () => {
  const whole = ['open the blueprint', 'flat drawing', 'technical drawing', 'schematic', '2D drawing', 'show me the blueprint'];
  for (const text of whole) assert.deepEqual(match(text, ALT), { action: 'blueprint' }, text);
  const cases = [
    ['rotor blueprint', ALT, 'rotor'],
    ['the rotor blueprint', ALT, 'rotor'],
    ['show me the rotor blueprint', ALT, 'rotor'],
    ['slip rings blueprint', ALT, 'slip-rings'],
    ['the stator in 2D', ALT, 'stator-core'],
    ['2D drawing of the pulley', ALT, 'pulley'],
    ['technical drawing of the rotor', ALT, 'rotor'],
    ['schematic of the regulator', ALT, 'regulator'],
    ['blueprint the router', ALT, 'rotor'], // a speech slip after "blueprint" is still forgiven
    ['blueprint the separator', AA, 'separator'],
    ['hood blueprint', CAMRY, 'hood'],
    ['engine in 2d', CAMRY, 'engine'],
    ['blueprint the hood', CAMRY, 'hood'],
  ];
  for (const [text, parts, id] of cases) {
    const got = match(text, parts);
    assert.equal(got && got.action, 'blueprint', `${text} -> ${JSON.stringify(got)}`);
    assert.equal(got.partId, id, text);
  }
  // "<word> blueprint" must name the part exactly: no fuzzy guesses (good ≠ hood, skip ≠ slip, cool ≠ coil, read ≠ rear).
  for (const [text, parts] of [['good blueprint', CAMRY], ['skip blueprint', ALT], ['cool blueprint', ALT], ['router blueprint', ALT]]) {
    const got = match(text, parts);
    assert.ok(!got || got.action !== 'blueprint', `${text} -> ${JSON.stringify(got)}`);
  }
});

test('the owner\'s own phrasings: "switch it to 2D", "I want a blueprint of …", "pull up …"', () => {
  for (const text of ['Switch it to 2D.', 'okay switch it to 2D', 'make it 2D', 'turn it into a blueprint', 'flip to 2D', 'change it to 2D', 'convert it to 2D', 'put it in 2D', 'turn it into 2D', 'switch over to 2D', 'go to 2D']) {
    assert.deepEqual(match(text, AA), { action: 'blueprint' }, text);
    assert.deepEqual(match(text, AA, { selected: 'separator' }), { action: 'blueprint' }, `${text} (a part selected: "it" is still the whole object)`);
  }
  assert.deepEqual(match('switch this part to 2D', AA, { selected: 'separator' }), { action: 'blueprint', partId: 'separator' });
  for (const text of ['I want a blueprint of the separator', "I'd like a blueprint of the separator", 'I would like a blueprint of the separator', 'I need a 2D drawing of the separator']) {
    const got = match(text, AA);
    assert.equal(got && got.action, 'blueprint', `${text} -> ${JSON.stringify(got)}`);
    assert.equal(got.partId, 'separator', text);
  }
  const pull = [
    ['pull up the alternator', CAMRY, 'dcdc-converter'],
    ['pull up the separator', AA, 'separator'],
    ['bring up the rotor', ALT, 'rotor'],
  ];
  for (const [text, parts, id] of pull) {
    const got = match(text, parts);
    assert.equal(got && got.action, 'select', `${text} -> ${JSON.stringify(got)}`);
    assert.equal(got.partId, id, text);
  }
  assert.deepEqual(match('pull up the labels', AA), { action: 'labels-on' }, 'not the "Label sleeve" part');
  assert.deepEqual(match('bring up the parts list', AA), { action: 'parts-list' });
  for (const text of ['make it red', 'turn it into a car', 'flip it over', 'switch it off', 'I want a Tesla', 'pull up a Tesla']) assert.equal(match(text, CAMRY), null, text);
});

test('a blueprint sheet is closed by name ("close the blueprint", "back to the hologram"), never read as a part', () => {
  const closing = ['close the blueprint', 'Close the blueprint.', 'close blueprint', 'hide the blueprint', 'hide blueprint', 'exit the blueprint', 'dismiss the blueprint', 'quit the blueprint', 'leave the blueprint', 'close the drawing', 'close the sheet', 'close the 2D view', 'close the 2D', 'close the plan', 'close the schematic', 'remove the blueprint', 'get rid of the blueprint', 'take the blueprint away', 'put the blueprint away', "I'm done with the blueprint", 'back to the hologram', 'go back to the hologram', 'back to the 3D model', 'go back', 'blueprint off', 'no more blueprint', 'no more blueprints'];
  for (const parts of [[], AA, ALT, CAMRY]) {
    for (const text of closing) assert.deepEqual(match(text, parts), { action: 'close-blueprint' }, `${text} (${parts.length} parts)`);
  }
  // Closing the hologram itself is unchanged.
  for (const text of ['close', 'close it', 'close the hologram', 'exit', "we're done", 'close the viewer']) assert.deepEqual(match(text, CAMRY), { action: 'close' }, text);
  // "go back" no longer focuses the rear housing (back -> rear); "back" alone is still the back view.
  assert.deepEqual(match('back', ALT), { action: 'view', view: 'back' });
});

test('blueprintAskedOutright: "blueprint …", "2D …" or a build verb asks outright; other wordings get a spoken check first', () => {
  for (const text of ['blueprint the separator', 'Blueprint.', '2D', '2D blueprint of the stator', 'blue print of the stater', 'make a blueprint', 'draw the blueprint', 'build a 2D drawing of the rotor', 'switch it to 2D', 'Switch to 2D.', 'turn it into a blueprint', 'I want a blueprint of the separator', 'Jarvis, can you blueprint the rotor', 'please make a blueprint for the hybrid battery']) {
    assert.equal(blueprintAskedOutright(text), true, text);
  }
  for (const text of ['rotor blueprint', 'open the blueprint', 'show me the blueprint', 'show the rectifier in 2D', 'the stator in 2D', 'give me the blueprint', 'see the 2D view', '', 'expand it', 'make it red']) {
    assert.equal(blueprintAskedOutright(text), false, text);
  }
});

test('anything else goes to Jarvis (null)', () => {
  for (const text of [
    'how does the alternator work?',
    'show me how the alternator is made',
    'what is the difference between NiMH and lithium ion',
    'why is the battery under the seat',
    'compare this with a Honda Accord',
    'tell me about the engine',
    'how much does a new hybrid battery cost',
    'show me a Tesla Model 3',
    'make it red',
    '',
    '   ',
    'x'.repeat(200),
  ]) {
    assert.equal(match(text, CAMRY), null, text);
  }
  assert.equal(match('select the flux capacitor', CAMRY), null);
  assert.equal(match('show me the alternator', AA), null);
});

test('resolvePart scores and handles empty input', () => {
  assert.equal(resolvePart('', CAMRY), null);
  assert.equal(resolvePart('engine', []), null);
  const r = resolvePart('alternate or', ALT);
  assert.equal(r, null); // the alternator itself is not a part of its own model
  const s = resolvePart('d c d c converter', CAMRY);
  assert.equal(s.part.id, 'dcdc-converter');
  assert.ok(s.score >= 0.9);
});
