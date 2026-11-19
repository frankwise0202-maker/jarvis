// Speech text for the ear: markdown.js speech mode (markdownToPlainText(md, { speech: true }),
// finishSpeech) and tts.js toSpeech. One test per rule, each with negative cases: ordinary prose,
// phone numbers, dates, times and hyphenated words are never changed. Plain Node (no DOM needed).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToPlainText } from '../../src/lib/markdown.js';
import { toSpeech } from '../../src/platform/voice/tts.js';

const say = (md) => markdownToPlainText(md, { speech: true });
const same = (text) => assert.equal(say(text), text, `unchanged: ${text}`);

test('abbreviations: e.g., i.e., etc., vs., approx. are spoken in full', () => {
  assert.equal(say('Batteries, e.g. solid-state, i.e. the next step.'), 'Batteries, for example solid-state, that is the next step.');
  assert.equal(say('E.g. this one. I.e. that one.'), 'For example this one. That is that one.');
  assert.equal(say('Use e.g., a spoon (i.e. the small one).'), 'Use for example, a spoon (that is the small one).');
  // "etc." keeps its period when it also ends the sentence.
  assert.equal(say('Apples, pears, etc. The rest is fruit.'), 'Apples, pears, et cetera. The rest is fruit.');
  assert.equal(say('Apples, pears, etc., and more.'), 'Apples, pears, et cetera, and more.');
  assert.equal(say('Apples, pears, etc. and so on.'), 'Apples, pears, et cetera and so on.');
  assert.equal(say('Apples, pears, etc.'), 'Apples, pears, et cetera.');
  assert.equal(say('- apples, pears, etc.\n- plums'), 'apples, pears, et cetera.\nplums.');
  assert.equal(say('(Apples, pears, etc.)'), '(Apples, pears, et cetera)');
  assert.equal(say('Lakers vs. Celtics, Lakers vs Celtics.'), 'Lakers versus Celtics, Lakers versus Celtics.');
  assert.equal(say('It takes approx. 10 minutes and costs approx. $5.'), 'It takes approximately 10 minutes and costs approximately $5.');
  assert.equal(say('Three kilos, approx. Then we left.'), 'Three kilos, approximately. Then we left.');
  // Not abbreviations.
  for (const text of ['VS Code is open.', 'The egg is ready.', 'Visit the ie site.', 'An etcetera.', 'Approximately right.', 'vs.']) same(text);
});

test('symbols: & between words, % after a number, ~ before a number, 20+, ×', () => {
  assert.equal(say('Salt & pepper, Tom & Jerry, rock&roll.'), 'Salt and pepper, Tom and Jerry, rock and roll.');
  assert.equal(say('Prices rose 12% and then 3.5 %.'), 'Prices rose 12 percent and then 3.5 percent.');
  assert.equal(say('About ~5 people paid ~$20 each, ~ 30 in all.'), 'About about 5 people paid about $20 each, about 30 in all.');
  assert.equal(say('It has 20+ years of data and is for 18+.'), 'It has 20 plus years of data and is for 18 plus.');
  assert.equal(say('A 2×3 grid, 3 × 4 is 12, 1920×1080.'), 'A 2 times 3 grid, 3 times 4 is 12, 1920 times 1080.');
  // Left alone: acronyms with &, % without a number, ~ between numbers, + before a number or between numbers.
  for (const text of ['R&D and AT&T and Q&A.', 'The % sign.', 'From 5~10 people.', 'Dial +44 20 7946 0958.', 'So 1+1 is 2.', 'C++ is hard.', 'Grade A+.']) same(text);
});

test('temperatures and units: °C, °F, a lone °, 24/7, km/h', () => {
  assert.equal(say('It is 20°C in London and 68 °F in New York.'), 'It is 20 degrees Celsius in London and 68 degrees Fahrenheit in New York.');
  assert.equal(say('Turn 90° left. Readings in °C.'), 'Turn 90 degrees left. Readings in degrees Celsius.');
  assert.equal(say('We are open 24/7.'), 'We are open twenty-four seven.');
  assert.equal(say('Limit 100 km/h, or 60km/h in town, in km/h.'), 'Limit 100 kilometres per hour, or 60 kilometres per hour in town, in kilometres per hour.');
  for (const text of ['Open 24/70 days.', 'Use mph here.', 'It is 7/24 now.']) same(text);
});

test('number ranges with an en dash or a hyphen become "to"; phone numbers, dates and times are left alone', () => {
  assert.equal(say('Allow 5–10 minutes, or 5-10, or 5 – 10.'), 'Allow 5 to 10 minutes, or 5 to 10, or 5 to 10.');
  assert.equal(say('It costs $5–$10, or £1,000-£2,000.'), 'It costs $5 to $10, or £1,000 to £2,000.');
  assert.equal(say('A 5-10% rise, then 50%–60%.'), 'A 5 to 10 percent rise, then 50 percent to 60 percent.');
  assert.equal(say('Between 1.5-2.5 litres, pages 10-20, the 1939-45 war, the 2020–21 season, a 9-5 job.'), 'Between 1.5 to 2.5 litres, pages 10 to 20, the 1939 to 45 war, the 2020 to 21 season, a 9 to 5 job.');
  assert.equal(say('About ~5-10 people.'), 'About about 5 to 10 people.');
  // Never touched.
  for (const text of [
    'Call 555-123-4567 or 555-1234.',
    'Call +1 415-555-0100 or 0800-123-456 or 020-7946-0958 or 020 7946 0958.',
    'On 2026-11-19 at 10:30.',
    'At 2026-11-19T10:30:00Z it starts.',
    'From 10:30–11:00 and 10:30-11:00.',
    'In 2026-11 we ship.',
    'Postcode 12345-6789.',
    'A well-known, state-of-the-art e-mail.',
    'COVID-19, GPT-4, F-35 and A4-10 paper.',
    'Version v1.2-3 and 3.5-turbo.',
    'Subtract 5 - 3 to get 2.',
    'Room 08-15.',
    'Fractions 1/2-3/4 here.',
  ]) same(text);
});

test('leftover reference markers and Markdown syntax are never spoken', () => {
  assert.equal(say('Growth was strong [1]. It doubled[2][3], rose [4, 5] and [6–8].'), 'Growth was strong. It doubled, rose and.');
  assert.equal(say('As noted [source] and [Source 2], see [^1] [citation needed].'), 'As noted and, see.');
  assert.equal(say('Rates rose 5% [1](https://reuters.com/a) per [Reuters](https://reuters.com/b) [[2]](https://x.example).'), 'Rates rose 5 percent per Reuters.');
  assert.equal(say('A ** stray marker and __ another and ` ticks ``.'), 'A stray marker and another and ticks.');
  assert.equal(say('Unclosed **bold and `code here.'), 'Unclosed bold and code here.');
  // Brackets that are not reference markers stay.
  for (const text of ['He said [sic] it.', 'Items [a] and [b].', 'The [2026] edition.']) same(text);
});

test('headings and list items end as sentences, so the voice pauses', () => {
  assert.equal(say('## Plan\n\n1. Check the weather\n2. Pack\n\n| Day | Rain |\n|---|---|\n| Mon | 20% |'), 'Plan.\nCheck the weather.\nPack.\nDay, Rain.\nMon, 20 percent.');
});

test('plain text (copy) and rendering are unchanged by the speech rules', () => {
  const md = 'Prices rose 5-10% e.g. here [1](https://reuters.com) & more ~5 at 20°C, 24/7.';
  assert.equal(markdownToPlainText(md), 'Prices rose 5-10% e.g. here 1 & more ~5 at 20°C, 24/7.');
});

test('toSpeech: full keeps one line per block (a pause each); summary is the first paragraph', () => {
  const md = '# Forecast\n\nIt will be 18–20°C, approx. 60% cloud.\n\n- Rain after 6 p.m.\n- Wind ~15 km/h\n\n```js\nignored()\n```';
  assert.equal(toSpeech(md, 'full'), 'Forecast.\nIt will be 18 to 20 degrees Celsius, approximately 60 percent cloud.\nRain after 6 p.m.\nWind about 15 kilometres per hour.');
  assert.equal(toSpeech(md, 'summary'), 'It will be 18 to 20 degrees Celsius, approximately 60 percent cloud.');
  assert.equal(toSpeech(md, 'off'), '');
  assert.equal(toSpeech('', 'full'), '');
});
