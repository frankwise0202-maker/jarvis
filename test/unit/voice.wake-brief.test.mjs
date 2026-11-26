// v8.1 fixes MONEY-4 and MAC-5: the wake routine's paid briefing (the briefing protocol, a team of agents:
// no home base linked, or one that can't brief) is asked first with its price, as C6's "brief me" is, and
// only "yes" sends it. Room talk answering the offer (woken in the background, or by claps: "brief me",
// "the news", or "sure" / "yes" when no music was found) never starts it alone. Voice Mode itself on a tiny
// DOM and a virtual clock (voice-mode.fakes.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceEnv } from './voice-mode.fakes.mjs';

const PROMPT = 'BRIEFING PROTOCOL PROMPT';
const PRICE = /^Your briefing sends a team of agents to look up the news, about \$1\.55\. Shall I run it\?$/;
const protocol = () => ({ text: PROMPT, mode: 'swarm', usd: 1.55, paid: true });
/** Listen n hears list[n] (listen 0 is the wake window), the others nobody. */
const heard = (list) => (i) => (i < list.length ? list[i] : null);

async function until(env, cond, what, maxMs = 120000) {
  const end = env.clock.now() + maxMs;
  while (!cond()) {
    if (env.clock.now() > end) throw new Error(`timed out waiting for ${what} (said: ${JSON.stringify(env.log.spoken.map((s) => s.text))}; sent: ${JSON.stringify(env.log.turns)})`);
    await env.advance(50);
  }
}

const said = (env, re) => env.log.spoken.some((s) => re.test(s.text));

for (const [answer, hidden] of [
  ['Brief me.', true],
  ['Sure.', true],
  ['The news.', false],
  ['Yes.', false],
]) {
  test(`MONEY-4, MAC-5: woken by claps${hidden ? ', hidden' : ''}, "${answer}" to the offer asks the briefing's price first; "no" sends nothing`, async (t) => {
    const env = await voiceEnv(t);
    if (hidden) env.setHidden(true);
    env.say(heard([null, answer, 'No.']));
    env.open({ wake: env.wakeHooks({ briefing: protocol }), listenWhileHidden: () => true, answer: 'Here is your briefing.' });
    await until(env, () => said(env, PRICE), 'the price question');
    assert.deepEqual(env.log.turns, [], 'nothing sent before an answer to the price');
    await until(env, () => said(env, /^Okay, no briefing\.$/), '"Okay, no briefing."');
    await env.advance(5000);
    assert.deepEqual(env.log.turns, [], '"no" sends nothing');
  });
}

test('MONEY-4: "yes" to the price sends the briefing once, in a chat of its own', async (t) => {
  const env = await voiceEnv(t);
  let sent = 0;
  env.say(heard([null, 'Brief me.', 'Yes.']));
  env.open({ wake: env.wakeHooks({ briefing: () => ({ ...protocol(), sent: () => (sent += 1) }) }), listenWhileHidden: () => true, answer: 'Here is your briefing.' });
  await until(env, () => env.log.turns.length > 0, 'the briefing');
  assert.ok(said(env, PRICE), 'its price was said first');
  assert.deepEqual(env.log.turns, [PROMPT]);
  assert.equal(sent, 1, 'noted as given once it was sent');
});

test('MONEY-4: a home base that can\'t brief falls back to the protocol: its price is asked first too', async (t) => {
  const env = await voiceEnv(t);
  env.say(heard([null, 'Brief me.', 'No.']));
  const briefing = () => ({ done: Promise.resolve({ send: PROMPT, mode: 'swarm', usd: 1.55, paid: true }) });
  env.open({ wake: env.wakeHooks({ briefing }), listenWhileHidden: () => true, answer: 'Here is your briefing.' });
  await until(env, () => said(env, PRICE), 'the price question');
  await until(env, () => said(env, /^Okay, no briefing\.$/), '"Okay, no briefing."');
  await env.advance(3000);
  assert.deepEqual(env.log.turns, [], 'nothing sent');
});

test('MONEY-4: the home base\'s own briefing is said as before, free (no price question, no turn)', async (t) => {
  const env = await voiceEnv(t);
  env.say(heard([null, 'Brief me.']));
  const briefing = () => ({ done: Promise.resolve({ ack: 'Good evening. Markets are up.' }) });
  env.open({ wake: env.wakeHooks({ briefing }), listenWhileHidden: () => true, answer: 'x' });
  await until(env, () => said(env, /^Good evening\. Markets are up\.$/), 'the home base\'s briefing');
  assert.ok(!said(env, /Shall I run it\?/), 'no price question');
  assert.deepEqual(env.log.turns, []);
});
