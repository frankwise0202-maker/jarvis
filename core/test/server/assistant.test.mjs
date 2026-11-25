// node --test: the mini status assistant: intent matching over many phrasings and typos, answers built only
// from real numbers, scope (it never claims to do anything), and the text helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ask, classify, INTENTS } from '../../server/assistant/index.mjs';
import { normalize, editDistance, correctTypos } from '../../server/assistant/normalize.mjs';
import { VOCAB } from '../../server/assistant/intents.mjs';
import { fixtureCore, askCtx } from './helpers.mjs';

const ok = fixtureCore('ok');
const warn = fixtureCore('warn');
const alert = fixtureCore('alert');
const nogpu = fixtureCore('nogpu');
const offline = fixtureCore('offline');
const A = (q, c = ok, owner = 'Frank') => ask(q, askCtx(c.core, owner));

const PHRASINGS = {
  greeting: ['hi', 'Hello!', 'hey jarvis', 'hiya', 'good morning', 'Good evening Jarvis', 'yo', 'sup', 'howdy', "what's up"],
  'how-are-you': ['How are you?', 'how are you doing', 'you good?', 'u ok?', 'are you ok', 'how r u', 'hows it going', "how's everything", 'everything ok?', 'all good?', 'are you alright', 'how is the machine', 'how is the computer doing', 'how are things', 'how do you feel', 'Hi Jarvis, how are you?', 'are you healthy', 'hello, you doing ok?'],
  status: ['status report', 'Status', 'give me a summary', 'system report', 'sitrep', 'full report please', 'overview', 'stats', 'brief me', 'what are the numbers', 'diagnostics', 'run down'],
  problems: ['anything wrong?', 'any problems', 'Any issues?', 'any warnings', 'what is wrong', "what's wrong", 'is anything broken', 'any alerts?', 'errors?', 'does anything need attention', 'is something wrong with you'],
  events: ['what happened today', 'any events?', 'what did I miss', 'show me the log', 'what happened overnight', 'recent events'],
  cpu: ['cpu?', 'How is the CPU', 'processor usage', 'how hot is the cpu', 'cpu temp', 'CPU temperature?', "what's eating my cpu", 'what is using the cpu', 'which app is hogging the processor', 'how busy is the processor', 'cpu load', 'cpu speed?', 'how fast is the cpu running', 'core temps', 'what is using the most', 'top processes'],
  gpu: ['gpu?', 'GPU temp?', 'graphics card temperature', 'how is the graphics card', 'nvidia driver?', 'vram?', 'how much video memory is used', 'gpu fan', 'gpu fan speed', 'gpu power draw', 'is the gtx 970 ok', 'gpu usage', 'temprature of the grpahics card', 'whats the graphcis card doing', 'video card?', 'driver?'],
  memory: ['memory?', 'how much ram is free', 'RAM usage', 'how much memory is used', 'what is using the memory', 'memroy usage', 'swap?', 'is it swapping', 'free ram?', 'memory pressure'],
  disk: ['disk?', 'how full is the hard drive', 'how much space is left', 'disk space', 'storage?', 'is the disk healthy', 'drive health', 'is the hard drive failing', 'disk activity', 'free space?', 'is the hdd ok', 'storgae left?'],
  network: ['is the internet working', 'internet?', "what's my ping", 'latency?', 'how fast is the internet', 'download speed', 'network traffic', 'what is my ip address', 'are we online', 'is the connection ok', 'bandwidth?', 'is the internet down'],
  api: ['can you reach claude?', 'is the api up', 'is anthropic down', 'claude api?', 'is claude working'],
  site: ['is the website up', 'what build is the site on', 'is the jarvis site ok', 'github pages?', 'which build is deployed', 'website?'],
  tailscale: ['is my iphone connected', 'is my phone online', 'which devices are online', 'tailscale?', 'is the mac connected', 'devices?', 'is tailscale working', 'is my laptop on the tailnet', 'vpn?'],
  temperature: ['temperature?', 'how hot is it running', 'temps?', 'are you overheating', 'is it hot', 'how warm are you'],
  multi: ['cpu and gpu temps', 'how are the cpu and memory', 'cpu, gpu and ram?'],
  uptime: ['how long have you been up', 'uptime?', 'since when?', 'how long has the computer been on', 'how long have you been running'],
  restarts: ['when did you last restart', 'did you reboot', 'any crashes?', 'have you crashed', 'when was the last boot', 'was there a power cut'],
  trend: ['hotter than usual?', 'is the gpu hotter than usual', 'busier than usual?', 'is the cpu warmer than normal for it', 'is memory usage higher than average', 'is the disk filling up compared to last week', 'how does today compare to the weekly average'],
  time: ['what time is it', 'time?', "what's the date", 'what day is it', 'current time'],
  thanks: ['thanks', 'thank you', 'thx', 'cheers', 'ty', 'great job', 'nice one'],
  bye: ['bye', 'goodbye', 'see you', 'good night', 'later', "that's all"],
  identity: ['who are you', 'what are you', "what's your name", 'are you jarvis', 'are you an ai'],
  capabilities: ['what can you do', 'help', 'what can I ask you', 'what do you know', 'commands?'],
  unknown: ['restart the computer', 'please shut down', 'open jarvis', 'play some music', 'what is the weather', 'tell me a joke', 'asdfgh', 'kill chrome', 'can you install the nvidia driver', 'turn off the screen', 'search the web for news', 'how hot is it outside', 'fix it', 'delete the log', 'set an alarm for 7'],
};

test('intents: every phrasing lands on the right intent', () => {
  const misses = [];
  let n = 0;
  for (const [intent, list] of Object.entries(PHRASINGS)) {
    for (const q of list) {
      n += 1;
      const got = classify(q).intent;
      if (got !== intent) misses.push(`${JSON.stringify(q)} → ${got} (want ${intent})`);
    }
  }
  assert.deepEqual(misses, [], `${misses.length} of ${n} phrasings missed`);
  assert.ok(n >= 200, `${n} phrasings`);
  for (const intent of Object.keys(PHRASINGS)) assert.ok(INTENTS.includes(intent), intent);
});

test('aspects and devices are picked up', () => {
  assert.deepEqual(classify('gpu temp?').aspects, ['temp']);
  assert.ok(classify("what's eating my cpu").aspects.includes('processes'));
  assert.ok(classify('is the disk healthy').aspects.includes('health'));
  assert.equal(classify('is my iphone connected').device, 'iphone');
  assert.equal(classify('is the mac online').device, 'mac');
  assert.equal(classify('restart the computer').reason, 'action');
  assert.equal(classify('what is the weather').reason, 'offtopic');
  assert.equal(classify('').reason, 'empty');
});

test('how are you: all normal, with the real numbers', () => {
  const s = ok.core.snapshot;
  const r = A('How are you?');
  assert.equal(r.intent, 'how-are-you');
  assert.equal(r.answer, `All systems normal, Frank. CPU at ${Math.round(s.cpu.usagePct)} percent, graphics card at ${Math.round(s.gpu.tempC)} °C, and ${Math.round(s.disks.mounts[0].freeBytes / 1e9)} GB free on the main drive.`);
  assert.deepEqual([r.facts.level, r.facts.cpuPct, r.facts.gpuTempC, r.facts.diskFreeBytes], ['ok', s.cpu.usagePct, s.gpu.tempC, s.disks.mounts[0].freeBytes]);
  assert.ok(r.suggestions.length >= 2);
  // no owner name configured: no ", Frank"
  assert.match(A('How are you?', ok, null).answer, /^All systems normal\. CPU at/);
  // a greeting first
  assert.match(A('hi jarvis, how are you?').answer, /^Good afternoon, Frank\. All systems normal\./);
});

test('how are you: warnings and alerts are named, alerts first', () => {
  const w = A('how are you', warn).answer;
  assert.match(w, /^Mostly fine, Frank, but 4 things need a look: the CPU is running hot at \d+ °C/);
  assert.match(w, /the main drive is 88 percent full \(\d+ GB free\)/);
  const a = A('how are you', alert).answer;
  assert.match(a, /^Not great, Frank, I'm afraid: the CPU is overheating at 9\d °C, memory is nearly full \(only 4 percent available\) and the main drive is 96 percent full/);
  assert.match(a, /Also 4 warnings: /);
  assert.equal(A('you good?', nogpu).answer, "Mostly fine, Frank, but one thing needs a look: the graphics driver isn't loaded.");
  assert.equal(A('how are you', offline).answer, "Not great, Frank, I'm afraid: the internet is down.");
});

test('problems and events', () => {
  assert.match(A('anything wrong?').answer, /^Nothing wrong, Frank\. Every check is within normal limits\. Earlier, at 13:58: graphics card running hot \(8\d °C\), since resolved\.$/);
  const p = A('any problems?', alert);
  assert.match(p.answer, /^7 things need attention, Frank\. Alerts: .*\. Warnings: .*\.$/);
  assert.equal(p.facts.issues.length, 7);
  const e = A('what happened today?', warn);
  assert.equal(e.intent, 'events');
  assert.match(e.answer, /^In the last 24 hours: 13:32, main drive 88% full \(\d+ GB free\); /);
  assert.ok(e.facts.count >= 4);
});

test('hardware answers use the snapshot, and say so when a value is missing', () => {
  const s = ok.core.snapshot;
  assert.equal(A('gpu temp?').answer, `The GTX 970 is at ${Math.round(s.gpu.tempC)} °C, nice and cool.`);
  assert.equal(A('vram?').answer, `${Math.round(s.gpu.memUsedMB)} MB of 4 GB video memory in use (${Math.round(s.gpu.memPct)} percent).`);
  assert.equal(A('nvidia driver?').answer, 'The NVIDIA driver 580.95.05 is loaded and working.');
  assert.match(A('how hot is the cpu').answer, /^The CPU is at \d+ °C \(cores \d+ to \d+ °C\), nice and cool\.$/);
  assert.match(A("what's eating my cpu").answer, /^Using the most right now: Dashboard \(Chrome\) at \d+ percent of the CPU/);
  assert.match(A('what is using the memory').answer, /^Using the most memory: Dashboard \(Chrome\) with \d+ MB across 3 processes, GNOME Shell with 420 MB/);
  assert.match(A('how much ram is free').answer, /^Memory is 3\d percent used: 5\.\d GB of 16 GB, with \d+ GB available\.$/);
  assert.equal(A('swap?').answer, "Swap isn't being used (4 GB available).");
  assert.equal(A('how full is the hard drive').answer, `The main drive is 47 percent full: ${Math.round(s.disks.mounts[0].freeBytes / 1e9)} GB free of 983 GB.`);
  assert.equal(A('is the disk healthy').answer, 'The drive passed its SMART health check (ST1000DM003-1SB102, 42,211 hours powered on).');
  assert.match(A('is the disk healthy', nogpu).answer, /^I haven't checked the drive's health: smartctl needs permission/);
  assert.match(A('is the disk healthy', warn).answer, /^The drive is showing wear: sda: 8 reallocated sectors, 16 pending sectors\./);
  // GPU without a driver: no invented usage numbers
  const g = A('gpu?', nogpu);
  assert.equal(g.answer, "The GeForce GTX 970 is installed, but its NVIDIA driver isn't loaded, so I can't read its usage or temperature. The basic nouveau driver does report 37 °C. Installing the NVIDIA driver (580 series) would let me read it.");
  assert.equal(g.facts.utilPct, null);
  assert.doesNotMatch(g.answer, /percent/);
});

test('network, Claude API, website, Tailscale', () => {
  const s = ok.core.snapshot;
  assert.match(A('is the internet working').answer, new RegExp(`^The internet is up: ${s.services.internet.latencyMs} ms to Cloudflare\\. Right now it's .* on a 1 Gbit/s Ethernet link\\.$`));
  assert.match(A('how fast is the internet').answer, /^I don't run speed tests, but right now/);
  assert.equal(A('what is my ip address').answer, "On your home network I'm 192.168.1.42, and on Tailscale I'm 100.101.102.103.");
  assert.match(A('is the internet down', offline).answer, /^The internet is down, Frank, since \d\d:\d\d\. I'm checking again every 30 seconds\.$/);
  assert.match(A('can you reach claude?').answer, /^Yes: api\.anthropic\.com answered in \d+ ms/);
  assert.match(A('can you reach claude?', alert).answer, /^No, I can't reach api\.anthropic\.com right now \(not answering\)\./);
  assert.equal(A('can you reach claude?', offline).answer, "Not while the internet is down. I'll know as soon as it's back.");
  assert.match(A('what build is the site on').answer, /^The Jarvis website is up, on build 5f3c9e1a/);
  assert.match(A('is the website up', offline).answer, /isn't answering right now .* The last build I saw was 5f3c9e1a\.$/);
  assert.equal(A('is my iphone connected').answer, 'Your iPhone (iphone-15) is online.');
  assert.equal(A('is my mac on').answer, 'Your Mac (franks-macbook-air) was last seen 47 minutes ago.');
  assert.match(A('which devices are online').answer, /^Tailscale is connected: 1 of 2 devices online\. Your iPhone \(iphone-15\) is online and your Mac/);
  assert.match(A('is my ipad online').answer, /^I don't see a ipad on your tailnet\./);
  assert.equal(A('is my phone connected', offline).answer, 'Your iPhone (iphone-15) was last seen 6 minutes ago.');
});

test('uptime, restarts, trends, time', () => {
  assert.equal(A('how long have you been up').answer, 'The computer and I have been up 3 days, 4 hours, since Sunday at 10:20.');
  assert.equal(A('when did you last restart').answer, 'The computer last started Sunday at 10:20 (3 days ago). No unexpected restarts this week.');
  assert.match(A('hotter than usual?', warn).answer, /^Yes, the CPU is about 4\d °C hotter than usual: 8\d °C against a 7-day average of 4\d °C; and the graphics card is about normal/);
  assert.match(A('hotter than usual?').answer, /^The CPU is about normal: 4\d °C against a 7-day average of 4\d °C/);
  assert.match(A('is the disk filling up compared to last week', warn).answer, /main drive/);
  assert.equal(A('what time is it').answer, "It's 14:32 on Wednesday 25 November.");
  // without enough history it says so instead of guessing
  const young = fixtureCore('ok', { warmupSec: 120 });
  young.core.history.clear();
  young.core.runFor(30);
  assert.match(A('hotter than usual?', young).answer, /I haven't been watching long enough to know what's usual/);
});

test('scope: polite refusals, never a claim to have done something', () => {
  for (const q of PHRASINGS.unknown) {
    const r = A(q);
    assert.equal(r.intent, 'unknown', q);
    assert.doesNotMatch(r.answer, /\b(done|restarted|opened|installed|playing|deleted|killed|turned off)\b/i, q);
  }
  assert.equal(A('restart the computer').answer, "I can't do that, Frank; I only report on how this computer is doing. For that, open Jarvis.");
  assert.match(A('open jarvis').answer, /The Open Jarvis button opens the full app\.$/);
  assert.match(A('fix it', warn).answer, /^I can't fix things myself, Frank; I only report\. What needs attention: the CPU is running hot/);
  assert.equal(A('fix it').answer, "I can't fix things myself, Frank, but there's nothing to fix: all systems normal.");
  assert.match(A('how hot is it outside').answer, /^I can't feel the room, Frank, only the inside of the case: the CPU is at \d+ °C\.$/);
  assert.match(A('asdfgh').answer, /^I'm afraid I only know about this computer, Frank\. Try "How are you\?"/);
  assert.equal(A('').answer, 'Ask me how the computer is doing.');
  assert.equal(A('who are you').answer, "I'm the Jarvis Core status reporter, Frank. I watch this computer around the clock and tell you how it's doing. For anything else, open Jarvis.");
});

test('every intent answers in every scenario without throwing or printing undefined/NaN', () => {
  const scenarios = [ok, warn, alert, nogpu, offline];
  for (const c of scenarios) {
    for (const list of Object.values(PHRASINGS)) {
      for (const q of list) {
        const r = A(q, c);
        assert.equal(typeof r.answer, 'string');
        assert.ok(r.answer.length > 5, q);
        assert.doesNotMatch(r.answer, /undefined|NaN|null|\[object/, `${c.core.sim.scenario}: ${q} → ${r.answer}`);
        assert.ok(r.answer.length < 700, `${q}: ${r.answer.length} chars`);
      }
    }
  }
  assert.match(ask('how are you', { s: null }).answer, /starting up/);
});

test('text helpers: normalise, edit distance, typo correction that never invents keywords', () => {
  assert.equal(normalize("What's   the GPU's temp??"), 'what is the gpu temp');
  assert.equal(normalize('Hows it going, Jarvis?'), 'how is it going jarvis');
  assert.equal(normalize('Ça va? ÉTAT'), 'ca va etat');
  assert.equal(normalize('41°C'), '41 degrees');
  assert.equal(editDistance('temprature', 'temperature'), 1);
  assert.equal(editDistance('grpahics', 'graphics'), 1); // transposition
  assert.equal(editDistance('abc', 'xyz', 1), 2);
  assert.equal(correctTypos('temprature of the grpahics card', VOCAB), 'temperature of the graphics card');
  assert.equal(correctTypos('tmep', VOCAB), 'temp');
  assert.equal(correctTypos('main drive', VOCAB), 'main drive'); // not "rain"
  assert.equal(correctTypos('hold on', VOCAB), 'hold on'); // not "cold"
  assert.equal(correctTypos('memroy', VOCAB), 'memory');
});
