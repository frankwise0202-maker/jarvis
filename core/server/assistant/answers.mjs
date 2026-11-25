// Answers for the status assistant: short, calm, friendly, and only ever about this machine. Every number
// comes from the live snapshot, the history or the event log; anything not available is said plainly
// ("not readable", "not checked") and never estimated.
//
// Each builder takes (ctx, cls) and returns { answer, facts, suggestions }.
//   ctx: { s (snapshot), history, events, now, owner, tz }
//   cls: the classification from intents.mjs (topics, aspects, device, greeted, reason)

import { isNum } from '../util.mjs';
import { fmtBytes, fmtRate, fmtBits, fmtTemp, fmtPercentWords, fmtMs, fmtDuration, fmtClock, fmtDate, fmtWhen, fmtAgo, joinWords, cap, localHour } from '../format.mjs';

const r1 = (v) => (isNum(v) ? Math.round(v * 10) / 10 : null);
const r0 = (v) => (isNum(v) ? Math.round(v) : null);

const named = (ctx) => (ctx.owner ? `, ${ctx.owner}` : '');

function partOfDay(ctx) {
  const h = localHour(ctx.now, ctx.tz);
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function tempWord(c, alert = 90) {
  if (!isNum(c)) return null;
  if (c < 50) return 'cool';
  if (c < 70) return 'comfortable';
  if (c < 80) return 'warm but fine';
  if (c < alert) return 'running hot';
  return 'overheating';
}

const rootMount = (s) => s.disks?.mounts?.find((m) => m.mount === '/') ?? s.disks?.mounts?.[0] ?? null;
const problems = (s) => (s.health?.items ?? []).filter((i) => i.level !== 'ok').sort((a, b) => (a.level === b.level ? 0 : a.level === 'alert' ? -1 : 1));
const gpuOk = (s) => s.gpu?.status === 'ok';
const gpuShort = (s) => (s.gpu?.name ? s.gpu.name.replace(/^NVIDIA GeForce /, '') : 'graphics card');
const lowerFirst = (m) => (m && /^[A-Z][a-z]/.test(m) && !/^(CPU|GPU|NVIDIA|Claude|Jarvis|Tailscale|GNOME)\b/.test(m) ? m[0].toLowerCase() + m.slice(1) : m);

/** A health item as a spoken clause: "the CPU is running hot at 85 °C". */
function spoken(item, s) {
  const v = item.value;
  const alert = item.level === 'alert';
  if (item.id === 'cpu.temp') return `the CPU is ${alert ? 'overheating' : 'running hot'} at ${fmtTemp(v)}`;
  if (item.id === 'gpu.temp') return `the graphics card is ${alert ? 'overheating' : 'running hot'} at ${fmtTemp(v)}`;
  if (item.id === 'cpu.load') return `the CPU has been very busy (${fmtPercentWords(v)}) for over 5 minutes`;
  if (item.id === 'gpu.driver') return "the graphics driver isn't loaded";
  if (item.id === 'memory') return alert ? `memory is nearly full (only ${fmtPercentWords(v)} available)` : `memory is running low (${fmtPercentWords(v)} available)`;
  if (item.id === 'swap') return `swap is ${alert ? 'nearly full' : 'heavily used'} (${fmtPercentWords(v)})`;
  if (item.id.startsWith('disk:')) {
    const mount = item.id.slice(5);
    const m = s?.disks?.mounts?.find((x) => x.mount === mount);
    return `${mount === '/' ? 'the main drive' : `the drive at ${mount}`} is ${fmtPercentWords(v)} full${m ? ` (${fmtBytes(m.freeBytes)} free)` : ''}`;
  }
  if (item.id === 'disk.health') {
    if (alert) return 'the drive is failing its health check';
    const d = (s?.disks?.health?.devices ?? []).find((x) => [x.reallocated, x.pending, x.uncorrectable].some((n) => n > 0));
    const parts = d ? [d.reallocated > 0 && `${d.reallocated} reallocated`, d.pending > 0 && `${d.pending} pending`, d.uncorrectable > 0 && `${d.uncorrectable} unreadable`].filter(Boolean) : [];
    return `the drive is showing wear${parts.length ? ` (${joinWords(parts)} sectors)` : ''}`;
  }
  if (item.id === 'internet') return 'the internet is down';
  if (item.id === 'api') return 'the Claude API is unreachable';
  if (item.id === 'site') return 'the Jarvis website is unreachable';
  if (item.id === 'tailscale') {
    const m = { 'Tailscale logged out': 'Tailscale is logged out', 'Tailscale waiting for approval': 'Tailscale is waiting for approval', 'Tailscale switched off': 'Tailscale is switched off', 'Tailscale service not running': "the Tailscale service isn't running" };
    return m[item.message] ?? lowerFirst(item.message);
  }
  return item.message;
}

/** The program using the most CPU or memory right now ("ffmpeg"), or null; never this dashboard itself. */
function topLabel(s, list, key) {
  const label = grouped((s.processes?.[list] ?? []).filter((p) => isNum(p[key])), key)[0]?.label ?? null;
  return label && !/^Dashboard\b/.test(label) ? label : null;
}

/** "a; b; and c": a list whose items have commas of their own. */
const joinClauses = (list) => (list.length <= 1 ? list[0] ?? '' : `${list.slice(0, -1).join('; ')}; and ${list[list.length - 1]}`);

/** One practical step the owner can take himself for a health item, or null. */
function remedy(item, s) {
  const id = item.id;
  const cpuTop = topLabel(s, 'topCpu', 'cpuPct');
  if (id === 'cpu.temp') return `check that the fans are spinning and nothing blocks the vents${cpuTop ? `; closing ${cpuTop} would cool it down` : ''}`;
  if (id === 'gpu.temp') return "close any game or video program, and check the graphics card's fan and the airflow around the case";
  if (id === 'cpu.load' || id === 'cpu.process') {
    const who = id === 'cpu.process' ? String(item.message).replace(/ has (been using|kept) .*$/, '') : cpuTop;
    return who ? `close ${who} if you don't need it` : "close programs you don't need";
  }
  if (id === 'memory' || id === 'swap') {
    const memTop = topLabel(s, 'topMem', 'memBytes');
    return `close programs you aren't using${memTop ? `, starting with ${memTop}` : ''}`;
  }
  if (id.startsWith('disk:')) return id === 'disk:/' ? 'empty the Trash and delete big files you no longer need, such as old downloads' : 'delete files you no longer need from that drive';
  if (id === 'disk.health') return item.level === 'alert' ? 'copy anything important to another drive now; the drive needs replacing' : 'keep your files backed up, and plan to replace the drive';
  if (id === 'gpu.driver') return 'run "sudo ubuntu-drivers install" in Terminal to install it, then restart the computer';
  if (id === 'internet') return 'check the router and the network cable; restarting the router often helps';
  if (id === 'api') return "nothing to do on this computer: it's usually on Anthropic's side and clears by itself";
  if (id === 'site') return 'nothing to do on this computer: GitHub Pages usually comes back by itself';
  if (id === 'tailscale') {
    if (/service not running/i.test(item.message)) return 'run "sudo systemctl start tailscaled" in Terminal';
    if (/approval/i.test(item.message)) return 'approve this computer in the Tailscale admin console';
    return 'run "sudo tailscale up" in Terminal';
  }
  return null;
}

/** "The CPU is overheating at 91 °C: check that the fans ...", one per item, the same step only once. */
function remedyLines(list, s, max = 3) {
  const seen = new Set();
  const lines = [];
  for (const item of list) {
    const step = remedy(item, s);
    if (!step || seen.has(step)) continue;
    seen.add(step);
    lines.push(`${cap(spoken(item, s))}: ${step}.`);
    if (lines.length >= max) break;
  }
  return lines;
}

/** An event message as prose: "Graphics card running hot: 81 °C" → "graphics card running hot (81 °C)". */
function proseEvent(message) {
  const m = lowerFirst(String(message));
  const i = m.indexOf(': ');
  return i > 0 ? `${m.slice(0, i)} (${m.slice(i + 2)})` : m;
}

/** "Dashboard (Chrome GPU)" and "Dashboard (Chrome)" are one family in conversation. */
const family = (label) => String(label).replace(/ \(Chrome(?: GPU| helper)?\)$/, ' (Chrome)');

function grouped(list, key) {
  const m = new Map();
  for (const p of list) {
    const k = family(p.label);
    const g = m.get(k) ?? { label: k, value: 0, count: 0 };
    g.value += isNum(p[key]) ? p[key] : 0;
    g.count += 1;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
}

function tempVerdict(c, alert = 90) {
  const w = tempWord(c, alert);
  return { cool: ', nice and cool', comfortable: ', a comfortable temperature', 'warm but fine': ', warm but fine', 'running hot': ', which is running hot', overheating: ', which is too hot' }[w] ?? '';
}

function cpuPhrase(s) {
  const u = s.cpu?.usagePct;
  return isNum(u) ? `CPU at ${fmtPercentWords(u)}` : 'CPU reading in a moment';
}

function gpuPhrase(s) {
  if (gpuOk(s)) return isNum(s.gpu.tempC) ? `graphics card at ${fmtTemp(s.gpu.tempC)}` : `graphics card at ${fmtPercentWords(s.gpu.utilPct)}`;
  if (s.gpu?.status === 'pending') return 'graphics card being checked';
  return 'graphics driver not loaded';
}

function diskPhrase(s) {
  const m = rootMount(s);
  return m ? `${fmtBytes(m.freeBytes)} free on the main drive` : 'drive space not read yet';
}

function levelFacts(s) {
  return { level: s.health?.level ?? null, alerts: s.health?.counts?.alert ?? 0, warnings: s.health?.counts?.warn ?? 0 };
}

// ------------------------------------------------------------------------------------------------- conversation

export function howAreYou(ctx, cls) {
  const s = ctx.s;
  const bad = problems(s);
  const hello = cls.greeted ? `${partOfDay(ctx)}${named(ctx)}. ` : '';
  const facts = { ...levelFacts(s), cpuPct: r1(s.cpu?.usagePct), cpuTempC: s.cpu?.temp?.packageC ?? null, gpuTempC: gpuOk(s) ? s.gpu.tempC : null, diskFreeBytes: rootMount(s)?.freeBytes ?? null };
  let answer;
  if (!bad.length) {
    answer = `${hello}${hello ? 'All systems normal' : `All systems normal${named(ctx)}`}. ${cap(cpuPhrase(s))}, ${gpuPhrase(s)}, and ${diskPhrase(s)}.`;
  } else if (s.health.level === 'warn') {
    const n = bad.length;
    answer = `${hello}${hello ? 'Mostly fine' : `Mostly fine${named(ctx)}`}, but ${n === 1 ? 'one thing needs' : `${n} things need`} a look: ${joinWords(bad.slice(0, 3).map((i) => spoken(i, s)))}${n > 3 ? `, and ${n - 3} more` : ''}.`;
  } else {
    const alerts = bad.filter((i) => i.level === 'alert');
    const warns = bad.filter((i) => i.level === 'warn');
    answer = `${hello}${hello ? "Not great, I'm afraid" : `Not great${named(ctx)}, I'm afraid`}: ${joinWords(alerts.slice(0, 3).map((i) => spoken(i, s)))}${alerts.length > 3 ? `, and ${alerts.length - 3} more` : ''}.${warns.length ? ` Also ${warns.length === 1 ? 'one warning' : `${warns.length} warnings`}: ${joinWords(warns.slice(0, 2).map((i) => spoken(i, s)))}${warns.length > 2 ? `, and ${warns.length - 2} more` : ''}.` : ''}`;
  }
  return { answer, facts, suggestions: bad.length ? ['Anything wrong?', 'Status report', 'What happened?'] : ['Status report', 'GPU temp?', 'Anything wrong?'] };
}

export function greeting(ctx) {
  const s = ctx.s;
  const bad = problems(s);
  const tail = !bad.length ? 'All systems normal.' : bad.length === 1 ? `One thing needs a look: ${spoken(bad[0], s)}.` : `${bad.length} things need a look; ask me what's wrong.`;
  return { answer: `${partOfDay(ctx)}${named(ctx)}. ${tail}`, facts: levelFacts(s), suggestions: ['How are you?', 'Status report', 'Anything wrong?'] };
}

export function status(ctx, cls) {
  const s = ctx.s;
  const m = rootMount(s);
  const bad = problems(s);
  const parts = [];
  const cpuTemp = s.cpu?.temp?.packageC;
  parts.push(`the processor is at ${isNum(s.cpu?.usagePct) ? fmtPercentWords(s.cpu.usagePct) : 'an unread level'}${isNum(cpuTemp) ? ` and ${fmtTemp(cpuTemp)}` : ''}`);
  if (gpuOk(s)) parts.push(`the graphics card is at ${fmtPercentWords(s.gpu.utilPct ?? 0)}${isNum(s.gpu.tempC) ? ` and ${fmtTemp(s.gpu.tempC)}` : ''}`);
  else parts.push(`the graphics driver ${s.gpu?.status === 'pending' ? 'is being checked' : 'is not loaded'}`);
  if (s.memory) parts.push(`memory is ${fmtPercentWords(s.memory.usedPct)} used`);
  if (m) parts.push(`the main drive is ${fmtPercentWords(m.usedPct)} full with ${fmtBytes(m.freeBytes)} free`);
  const sv = s.services ?? {};
  const net = [];
  net.push(sv.internet?.status === 'up' ? `internet ${fmtMs(sv.internet.latencyMs)}` : sv.internet?.status === 'down' ? 'internet down' : 'internet not checked yet');
  if (sv.internet?.status !== 'down') net.push(sv.api?.status === 'up' ? 'Claude API reachable' : sv.api?.status === 'down' ? 'Claude API unreachable' : 'Claude API not checked yet');
  const ts = sv.tailscale ?? {};
  net.push(ts.status === 'running' ? `Tailscale with ${ts.online} of ${ts.total} devices online` : ts.status === 'not-installed' ? 'Tailscale not installed' : `Tailscale ${ts.status ?? 'unknown'}`);
  const up = fmtDuration(s.host?.uptimeSec);
  const head = cls?.greeted ? `${partOfDay(ctx)}${named(ctx)}. Here's the report: ` : `Here's the report${named(ctx)}: `;
  const nAlert = s.health?.counts?.alert ?? 0;
  const levelText = !bad.length
    ? 'all systems normal'
    : nAlert
      ? `${nAlert === 1 ? 'one alert' : `${nAlert} alerts`}, as ${joinWords(bad.filter((i) => i.level === 'alert').slice(0, 2).map((i) => spoken(i, s)))}`
      : `${bad.length === 1 ? 'one warning' : `${bad.length} warnings`}, as ${joinWords(bad.slice(0, 2).map((i) => spoken(i, s)))}${bad.length > 2 ? ' among others' : ''}`;
  const answer = `${head}${levelText}. ${cap(joinWords(parts))}. ${cap(joinWords(net))}.${up ? ` Up ${up}.` : ''}`;
  return {
    answer,
    facts: {
      ...levelFacts(s),
      cpuPct: r1(s.cpu?.usagePct),
      cpuTempC: cpuTemp ?? null,
      gpuPct: gpuOk(s) ? s.gpu.utilPct : null,
      gpuTempC: gpuOk(s) ? s.gpu.tempC : null,
      memUsedPct: s.memory?.usedPct ?? null,
      diskUsedPct: m?.usedPct ?? null,
      diskFreeBytes: m?.freeBytes ?? null,
      internet: sv.internet?.status ?? null,
      internetMs: sv.internet?.latencyMs ?? null,
      api: sv.api?.status ?? null,
      tailscale: ts.status ?? null,
      uptimeSec: s.host?.uptimeSec ?? null,
    },
    suggestions: ['Anything wrong?', 'Hotter than usual?', 'What happened today?'],
  };
}

export function problemsAnswer(ctx, cls = {}) {
  const s = ctx.s;
  if (cls.slow) return slowAnswer(ctx);
  const bad = problems(s);
  if (cls.fix) {
    if (!bad.length) return { answer: `Nothing to do${named(ctx)}: all systems normal.`, facts: { ...levelFacts(s), issues: [] }, suggestions: ['Status report'] };
    const lines = remedyLines(bad, s);
    const more = bad.length > lines.length ? ` Ask me what's wrong for the other ${bad.length - lines.length === 1 ? 'one' : bad.length - lines.length}.` : '';
    return { answer: `Here's what would help${named(ctx)}. ${lines.join(' ')}${more}`, facts: { ...levelFacts(s), issues: bad.map((i) => ({ id: i.id, level: i.level, message: i.message, step: remedy(i, s) })) }, suggestions: ['Anything wrong?', 'What is using the CPU?'] };
  }
  const day = ctx.events.between(ctx.now - 86_400_000).filter((e) => e.kind === 'health' && e.level !== 'ok');
  if (!bad.length) {
    let tail = '';
    if (day.length) {
      const last = day[day.length - 1];
      tail = ` Earlier, at ${fmtClock(last.t, ctx.tz)}: ${proseEvent(last.message)}, since resolved.`;
    }
    return { answer: `Nothing wrong${named(ctx)}. Every check is within normal limits.${tail}`, facts: { ...levelFacts(s), issues: [], earlier: day.length }, suggestions: ['Status report', 'What happened today?'] };
  }
  const alerts = bad.filter((i) => i.level === 'alert').map((i) => spoken(i, s));
  const warns = bad.filter((i) => i.level === 'warn').map((i) => spoken(i, s));
  const n = bad.length;
  let answer;
  if (n === 1) answer = `One thing needs attention${named(ctx)}: ${spoken(bad[0], s)}.`;
  else {
    const parts = [];
    if (alerts.length) parts.push(`${alerts.length === 1 ? 'Alert' : 'Alerts'}: ${joinWords(alerts.slice(0, 4))}${alerts.length > 4 ? `, and ${alerts.length - 4} more` : ''}.`);
    if (warns.length) parts.push(`${warns.length === 1 ? 'Warning' : 'Warnings'}: ${joinWords(warns.slice(0, 3))}${warns.length > 3 ? `, and ${warns.length - 3} more` : ''}.`);
    answer = `${n} things need attention${named(ctx)}. ${parts.join(' ')}`;
  }
  return { answer, facts: { ...levelFacts(s), issues: bad.map((i) => ({ id: i.id, level: i.level, message: i.message })) }, suggestions: ['Hotter than usual?', 'What is using the CPU?', 'Status report'] };
}

/** "Why is it slow?": the CPU, memory, swap, the drive and heat, from the live numbers. */
function slowAnswer(ctx) {
  const s = ctx.s;
  const c = s.cpu?.usagePct;
  const m = s.memory;
  const sw = m?.swap;
  const io = (s.disks?.readBps ?? 0) + (s.disks?.writeBps ?? 0);
  const t = s.cpu?.temp?.packageC;
  const cpuTop = topLabel(s, 'topCpu', 'cpuPct');
  const memTop = topLabel(s, 'topMem', 'memBytes');
  const reasons = [];
  if (isNum(c) && c >= 70) reasons.push(`the CPU is at ${fmtPercentWords(c)}${cpuTop ? `, mostly ${cpuTop}` : ''}`);
  if (m && isNum(m.availablePct) && m.availablePct < 15) reasons.push(`memory is ${fmtPercentWords(m.usedPct)} used${memTop ? `, mostly by ${memTop}` : ''}`);
  if (sw?.totalBytes > 0 && sw.usedPct >= 25) reasons.push(`swap is ${fmtPercentWords(sw.usedPct)} used, which is slow on a hard drive`);
  if (io >= 20e6) reasons.push(`the hard drive is busy (${fmtRate(io)})`);
  if (isNum(t) && t >= 90) reasons.push(`the CPU is overheating at ${fmtTemp(t)}, so it slows itself down`);
  const facts = { cpuPct: r1(c), memUsedPct: m?.usedPct ?? null, swapUsedPct: sw?.usedPct ?? null, diskBps: io, cpuTempC: t ?? null, reasons: reasons.length };
  if (!reasons.length) {
    const parts = [isNum(c) ? `the CPU is at ${fmtPercentWords(c)}` : null, m ? `memory is ${fmtPercentWords(m.usedPct)} used` : null, sw?.totalBytes > 0 ? (sw.usedBytes > 0 ? `swap is ${fmtPercentWords(sw.usedPct)} used` : "swap isn't in use") : null];
    const net = s.services?.internet?.status === 'down' ? ' The internet is down, though, so websites and online apps will stall.' : " If one program or website is slow, it's more likely that program or the internet.";
    return { answer: `Nothing here should slow it down${named(ctx)}: ${joinWords(parts)}.${net}`, facts, suggestions: ['Is the internet working?', 'What is using the CPU?'] };
  }
  return { answer: `${reasons.length === 1 ? 'The likely reason' : 'Likely reasons'}${named(ctx)}: ${joinClauses(reasons)}.`, facts, suggestions: ['What should I do?', 'What is using the CPU?', 'What is using the memory?'] };
}

export function eventsAnswer(ctx) {
  const list = ctx.events.between(ctx.now - 86_400_000).filter((e) => e.rule !== 'core.start' || e.t > ctx.now - 86_400_000);
  const shown = list.slice(-5);
  if (!shown.length) return { answer: `Quiet${named(ctx)}: nothing has happened in the last 24 hours.`, facts: { count: 0 }, suggestions: ['Status report', 'Anything wrong?'] };
  const items = shown.map((e) => `${fmtWhen(e.t, ctx.now, ctx.tz).replace(/ today$/, '')}, ${proseEvent(e.message)}`);
  const answer = `In the last 24 hours${list.length > 5 ? ` (latest ${shown.length} of ${list.length})` : ''}: ${items.join('; ')}.`;
  return { answer, facts: { count: list.length, events: shown.map((e) => ({ id: e.id, t: e.t, level: e.level, message: e.message })) }, suggestions: ['Anything wrong?', 'Status report'] };
}

// ------------------------------------------------------------------------------------------------- hardware

function topCpuText(s, n = 3) {
  const top = grouped((s.processes?.topCpu ?? []).filter((p) => isNum(p.cpuPct)), 'cpuPct').slice(0, n);
  if (!top.length) return null;
  return joinWords(top.map((g, i) => `${g.label} ${g.value < 1 ? 'below 1 percent' : `at ${fmtPercentWords(g.value)}`}${i === 0 ? ' of the CPU' : ''}`));
}

export function cpu(ctx, cls) {
  const s = ctx.s;
  const c = s.cpu ?? {};
  const t = c.temp ?? {};
  const a = new Set(cls.aspects);
  const facts = { usagePct: r1(c.usagePct), tempC: t.packageC ?? null, threads: c.threads ?? null, freqMHz: c.freqMHz ?? null, load1: c.load?.[0] ?? null };
  const sugg = ['What is using the CPU?', 'Hotter than usual?', 'GPU temp?'];
  if (a.has('processes')) {
    const text = topCpuText(s);
    facts.top = (s.processes?.topCpu ?? []).slice(0, 3).map((p) => ({ pid: p.pid, label: p.label, cpuPct: p.cpuPct }));
    return { answer: text ? `Using the most right now: ${text}.` : 'I am still measuring the processes; ask again in a couple of seconds.', facts, suggestions: ['Memory?', 'CPU temp?'] };
  }
  if (a.has('temp')) {
    if (!isNum(t.packageC)) return { answer: "I can't read the CPU temperature: no sensor reading (lm-sensors and the coretemp driver provide it).", facts, suggestions: sugg };
    const cores = (t.coresC ?? []).filter(isNum);
    const range = cores.length > 1 ? ` (cores ${Math.round(Math.min(...cores))} to ${Math.round(Math.max(...cores))} °C)` : '';
    return { answer: `The CPU is at ${fmtTemp(t.packageC)}${range}${tempVerdict(t.packageC)}.`, facts, suggestions: sugg };
  }
  if (a.has('freq')) {
    if (!isNum(c.freqMHz)) return { answer: "I can't read the CPU's clock speed on this machine.", facts, suggestions: sugg };
    return { answer: `The processor is running at ${(c.freqMHz / 1000).toFixed(1)} GHz right now${isNum(c.freqMaxMHz) ? `, up to ${(c.freqMaxMHz / 1000).toFixed(1)} GHz` : ''}.`, facts, suggestions: sugg };
  }
  if (!isNum(c.usagePct)) return { answer: 'Give me a second: the first CPU reading needs two samples.', facts, suggestions: sugg };
  const temp = isNum(t.packageC) ? `, at ${fmtTemp(t.packageC)}` : '';
  const busy = c.usagePct >= 85 ? ' It is working very hard.' : c.usagePct >= 50 ? ' Fairly busy.' : '';
  const model = c.model ? c.model.replace(/^Intel\(R\) Core\(TM\) /, '').replace(/ CPU @.*$/, '') : 'processor';
  const load = a.has('usage') && Array.isArray(c.load) ? ` Load average ${c.load[0]}.` : '';
  return { answer: `The ${model} is at ${fmtPercentWords(c.usagePct)} across ${c.threads ?? 'its'} threads${temp}.${busy}${load}`, facts, suggestions: sugg };
}

export function gpu(ctx, cls) {
  const s = ctx.s;
  const g = s.gpu ?? {};
  const a = new Set(cls.aspects);
  const facts = { status: g.status ?? null, name: g.name ?? null, utilPct: g.utilPct ?? null, tempC: g.tempC ?? null, memUsedMB: g.memUsedMB ?? null, memTotalMB: g.memTotalMB ?? null, powerW: g.powerW ?? null, fanPct: g.fanPct ?? null, driver: g.driver ?? null };
  const sugg = ['GPU temp?', 'Status report', 'Anything wrong?'];
  if (g.status === 'pending') return { answer: 'Checking the graphics card now; ask me again in a moment.', facts, suggestions: sugg };
  if (!gpuOk(s)) {
    const which = g.name ? `The ${g.name.replace(/^NVIDIA /, '')} is installed, but its NVIDIA driver isn't loaded` : "The graphics card's NVIDIA driver isn't loaded";
    const fallback = isNum(g.tempC) && g.tempSource ? ` The basic ${g.tempSource} driver does report ${fmtTemp(g.tempC)}.` : '';
    const how = g.status === 'not-installed' || g.status === 'driver-not-loaded' ? ' Installing the NVIDIA driver (580 series) would let me read it.' : '';
    let answer = `${which}, so I can't read its usage or temperature.${fallback}${how}`;
    if (g.status === 'no-device') answer = "I can't find an NVIDIA graphics card on this computer.";
    if (g.status === 'error') answer = `The graphics card isn't answering right now (${g.detail ?? 'nvidia-smi failed'}).`;
    return { answer, facts, suggestions: sugg };
  }
  const short = gpuShort(s);
  if (a.has('temp')) return { answer: isNum(g.tempC) ? `The ${short} is at ${fmtTemp(g.tempC)}${tempVerdict(g.tempC, 88)}.` : `The ${short} isn't reporting a temperature.`, facts, suggestions: sugg };
  if (a.has('vram') || (a.has('usage') && /memory/.test(cls.normalized ?? ''))) {
    return { answer: `${isNum(g.memUsedMB) ? `${fmtBytes(g.memUsedMB * 1048576, { binary: true })} of ${fmtBytes(g.memTotalMB * 1048576, { binary: true })}` : 'An unknown amount of'} video memory in use${isNum(g.memPct) ? ` (${fmtPercentWords(g.memPct)})` : ''}.`, facts, suggestions: sugg };
  }
  if (a.has('driver')) return { answer: `The NVIDIA driver ${g.driver} is loaded and working.`, facts, suggestions: sugg };
  if (a.has('fan')) return { answer: isNum(g.fanPct) ? `The graphics card's fan is at ${fmtPercentWords(g.fanPct)}.` : "The graphics card doesn't report its fan speed.", facts, suggestions: sugg };
  if (a.has('power') && !cls.topics.includes('gpu')) return { answer: isNum(g.powerW) ? `I can only measure the graphics card's power: it's drawing ${Math.round(g.powerW)} W${isNum(g.powerLimitW) ? ` of its ${Math.round(g.powerLimitW)} W limit` : ''}.` : "I can't measure the computer's power; the graphics card doesn't report its own either.", facts, suggestions: sugg };
  if (a.has('power')) return { answer: isNum(g.powerW) ? `The graphics card is drawing ${Math.round(g.powerW)} W${isNum(g.powerLimitW) ? ` of its ${Math.round(g.powerLimitW)} W limit` : ''}.` : "The graphics card doesn't report its power draw.", facts, suggestions: sugg };
  const mem = isNum(g.memUsedMB) && isNum(g.memTotalMB) ? `, using ${fmtBytes(g.memUsedMB * 1048576, { binary: true })} of its ${fmtBytes(g.memTotalMB * 1048576, { binary: true })} memory` : '';
  return { answer: `The ${short} is at ${fmtPercentWords(g.utilPct ?? 0)}${isNum(g.tempC) ? ` and ${fmtTemp(g.tempC)}` : ''}${mem}.`, facts, suggestions: sugg };
}

export function memory(ctx, cls) {
  const s = ctx.s;
  const m = s.memory;
  const a = new Set(cls.aspects);
  if (!m) return { answer: "I can't read the memory figures right now.", facts: {}, suggestions: ['Status report'] };
  const facts = { usedPct: m.usedPct, usedBytes: m.usedBytes, totalBytes: m.totalBytes, availableBytes: m.availableBytes, swapUsedPct: m.swap?.usedPct ?? null };
  const sugg = ['What is using the memory?', 'Status report'];
  if (a.has('processes')) {
    const raw = s.processes?.topMem ?? [];
    const top = grouped(raw, 'memBytes').slice(0, 3);
    facts.top = raw.slice(0, 5).map((p) => ({ pid: p.pid, label: p.label, memBytes: p.memBytes }));
    const text = joinWords(top.map((g) => `${g.label} with ${fmtBytes(g.value, { binary: true })}${g.count > 1 ? ` across ${g.count} processes` : ''}`));
    return { answer: top.length ? `Using the most memory: ${text}.` : 'Still measuring the processes.', facts, suggestions: ['CPU?', 'Status report'] };
  }
  if (a.has('swap')) {
    const sw = m.swap ?? {};
    let text = 'There is no swap on this machine.';
    if (sw.totalBytes > 0) text = sw.usedBytes > 0 ? `Swap is ${fmtPercentWords(sw.usedPct)} used (${fmtBytes(sw.usedBytes, { binary: true })} of ${fmtBytes(sw.totalBytes, { binary: true })}).` : `Swap isn't being used (${fmtBytes(sw.totalBytes, { binary: true })} available).`;
    return { answer: text, facts, suggestions: sugg };
  }
  const swap = m.swap?.totalBytes > 0 && m.swap.usedPct >= 10 ? ` Swap is ${fmtPercentWords(m.swap.usedPct)} used.` : '';
  const verdict = m.availablePct < 5 ? ' That is nearly full.' : m.availablePct < 10 ? ' That is getting low.' : '';
  return { answer: `Memory is ${fmtPercentWords(m.usedPct)} used: ${fmtBytes(m.usedBytes, { binary: true })} of ${fmtBytes(m.totalBytes, { binary: true })}, with ${fmtBytes(m.availableBytes, { binary: true })} available.${verdict}${swap}`, facts, suggestions: sugg };
}

export function disk(ctx, cls) {
  const s = ctx.s;
  const a = new Set(cls.aspects);
  const m = rootMount(s);
  const h = s.disks?.health ?? {};
  const dev = s.disks?.devices?.[0];
  const facts = { usedPct: m?.usedPct ?? null, freeBytes: m?.freeBytes ?? null, totalBytes: m?.totalBytes ?? null, readBps: s.disks?.readBps ?? null, writeBps: s.disks?.writeBps ?? null, health: h.status ?? null };
  const sugg = ['Is the drive healthy?', 'Status report'];
  if (a.has('health')) {
    if (h.status === 'ok') {
      const d = h.devices?.[0];
      return { answer: `The drive passed its SMART health check${d?.model ? ` (${d.model}${isNum(d.powerOnHours) ? `, ${d.powerOnHours.toLocaleString('en-GB')} hours powered on` : ''})` : ''}.`, facts, suggestions: ['Disk space?', 'Status report'] };
    }
    if (h.status === 'warning') return { answer: `The drive is showing wear: ${h.detail}. It still works, but keep your files backed up.`, facts, suggestions: ['Disk space?'] };
    if (h.status === 'failing') return { answer: `The drive is failing its SMART health check (${h.detail}). Back up anything important now.`, facts, suggestions: ['Disk space?'] };
    return { answer: `I haven't checked the drive's health${h.detail ? `: ${h.detail}` : ''}.${m ? ` Space is fine to report: ${fmtBytes(m.freeBytes)} free.` : ''}`, facts, suggestions: ['Disk space?'] };
  }
  if (a.has('activity')) {
    const quiet = (s.disks?.readBps ?? 0) + (s.disks?.writeBps ?? 0) < 5e6 ? ' Quiet.' : ' Fairly busy.';
    return { answer: isNum(s.disks?.readBps) ? `The drive is reading ${fmtRate(s.disks.readBps)} and writing ${fmtRate(s.disks.writeBps)}.${quiet}` : 'Give me a second to measure the drive activity.', facts, suggestions: sugg };
  }
  if (!m) return { answer: "I haven't read the drive space yet; give me a few seconds.", facts, suggestions: sugg };
  const others = (s.disks?.mounts ?? []).filter((x) => x !== m && x.usedPct >= 85);
  const extra = others.length ? ` Also ${joinWords(others.map((x) => `${x.mount} is ${fmtPercentWords(x.usedPct)} full`))}.` : '';
  const verdict = m.usedPct >= 95 ? ' That is nearly full; time to clear some space.' : m.usedPct >= 85 ? ' It is filling up.' : '';
  const model = dev?.model && a.size === 0 ? ` (${dev.model.replace(/\s+/g, ' ')})` : '';
  return { answer: `The main drive${model} is ${fmtPercentWords(m.usedPct)} full: ${fmtBytes(m.freeBytes)} free of ${fmtBytes(m.totalBytes)}.${verdict}${extra}`, facts, suggestions: sugg };
}

export function network(ctx, cls) {
  const s = ctx.s;
  const a = new Set(cls.aspects);
  const n = s.network ?? {};
  const i = s.services?.internet ?? {};
  const facts = { internet: i.status ?? null, latencyMs: i.latencyMs ?? null, dnsMs: i.dnsMs ?? null, rxBps: n.rxBps ?? null, txBps: n.txBps ?? null, interface: n.interface ?? null, ipv4: n.ipv4 ?? null };
  const sugg = ['Can you reach Claude?', 'Is my phone connected?', 'Status report'];
  if (a.has('ip')) {
    const ts = s.services?.tailscale?.ips?.find((x) => x.includes('.'));
    return { answer: `On your home network I'm ${n.ipv4 ?? 'without an address'}${ts ? `, and on Tailscale I'm ${ts}` : ''}.`, facts: { ...facts, tailscaleIp: ts ?? null }, suggestions: sugg };
  }
  if (i.status === 'down') {
    const since = ctx.events.list({ limit: 200 }).find((e) => e.rule === 'internet' && e.to === 'alert');
    return { answer: `The internet is down${named(ctx)}${since ? `, since ${fmtClock(since.t, ctx.tz)}` : ''}. I'm checking again every 30 seconds.`, facts, suggestions: ['Status report'] };
  }
  if (i.status !== 'up') return { answer: "I haven't finished checking the internet yet; give me a moment.", facts, suggestions: sugg };
  const traffic = isNum(n.rxBps) ? `${fmtBits(n.rxBps)} down and ${fmtBits(n.txBps)} up` : 'traffic still being measured';
  const link = n.kind === 'ethernet' ? ` on ${isNum(n.speedMbps) ? `a ${n.speedMbps >= 1000 ? `${n.speedMbps / 1000} Gbit/s` : `${n.speedMbps} Mbit/s`} ` : ''}Ethernet link` : n.kind === 'wifi' ? ' on Wi-Fi' : '';
  if (a.has('latency')) return { answer: `Latency is ${fmtMs(i.latencyMs)}${isNum(i.dnsMs) ? ` (DNS answers in ${fmtMs(i.dnsMs)})` : ''}.`, facts, suggestions: sugg };
  if (a.has('speed')) return { answer: `I don't run speed tests, but right now it's ${traffic}${link}, with ${fmtMs(i.latencyMs)} latency.`, facts, suggestions: sugg };
  return { answer: `The internet is up: ${fmtMs(i.latencyMs)} to Cloudflare. Right now it's ${traffic}${link}.`, facts, suggestions: sugg };
}

export function temperature(ctx) {
  const s = ctx.s;
  const c = s.cpu?.temp?.packageC;
  const g = s.gpu?.tempC;
  const parts = [];
  if (isNum(c)) parts.push(`the CPU is at ${fmtTemp(c)}`);
  else parts.push("the CPU temperature isn't readable");
  if (isNum(g)) parts.push(`the graphics card at ${fmtTemp(g)}${gpuOk(s) ? '' : ` (from the basic ${s.gpu.tempSource} driver)`}`);
  else parts.push(gpuOk(s) ? "the graphics card isn't reporting one" : 'the graphics card has no driver to ask');
  const words = [tempWord(c), tempWord(g, 88)].filter(Boolean);
  const verdict = words.length && words.every((w) => w === 'cool' || w === 'comfortable') ? ' Both comfortable.' : words.some((w) => w === 'overheating' || w === 'running hot') ? ' That is hot; worth a look at the fans and airflow.' : '';
  return { answer: `${cap(joinWords(parts))}.${verdict}`, facts: { cpuTempC: c ?? null, gpuTempC: g ?? null }, suggestions: ['Hotter than usual?', 'What is using the CPU?'] };
}

export function multi(ctx, cls) {
  const map = { cpu, gpu, memory, disk, network };
  const answers = cls.topics.filter((t) => map[t]).slice(0, 3).map((t) => map[t](ctx, cls));
  return { answer: answers.map((a) => a.answer).join(' '), facts: Object.assign({}, ...answers.map((a, k) => ({ [cls.topics[k]]: a.facts }))), suggestions: ['Status report', 'Anything wrong?'] };
}

// ------------------------------------------------------------------------------------------------- services

export function api(ctx) {
  const s = ctx.s;
  const a = s.services?.api ?? {};
  const i = s.services?.internet ?? {};
  const facts = { status: a.status ?? null, host: a.host ?? null, latencyMs: a.latencyMs ?? null, checkedAt: a.checkedAt ?? null };
  if (i.status === 'down') return { answer: "Not while the internet is down. I'll know as soon as it's back.", facts, suggestions: ['Is the internet up?'] };
  if (a.status === 'up') return { answer: `Yes: ${a.host} answered in ${fmtMs(a.latencyMs)}, ${fmtAgo(a.checkedAt, ctx.now)}.`, facts, suggestions: ['Is the website up?', 'Status report'] };
  if (a.status === 'down') return { answer: `No, I can't reach ${a.host} right now (${a.detail ?? 'not answering'}). The internet itself is fine, so it may be on Anthropic's side. I check every 30 seconds.`, facts, suggestions: ['Status report'] };
  return { answer: "I haven't checked the Claude API yet; give me a moment.", facts, suggestions: ['Status report'] };
}

export function site(ctx) {
  const w = ctx.s.services?.site ?? {};
  const facts = { status: w.status ?? null, buildId: w.buildId ?? null, latencyMs: w.latencyMs ?? null, url: w.url ?? null };
  if (w.status === 'up') return { answer: `The Jarvis website is up${w.buildId ? `, on build ${w.buildId}` : ''} (checked ${fmtAgo(w.checkedAt, ctx.now)}).`, facts, suggestions: ['Can you reach Claude?', 'Status report'] };
  if (w.status === 'down') return { answer: `The Jarvis website isn't answering right now${w.detail ? ` (${w.detail})` : ''}.${w.buildId ? ` The last build I saw was ${w.buildId}.` : ''}`, facts, suggestions: ['Is the internet up?'] };
  return { answer: "I haven't checked the Jarvis website yet; give me a moment.", facts, suggestions: ['Status report'] };
}

function deviceLine(p, ctx) {
  const kind = p.kind === 'iPhone' || p.kind === 'iPad' || p.kind === 'Mac' ? `your ${p.kind}` : p.kind;
  return p.online ? `${kind} (${p.name}) is online` : `${kind} (${p.name}) was last seen ${p.lastSeen ? fmtAgo(p.lastSeen, ctx.now) : 'a while ago'}`;
}

/** "What's my Jarvis address?": the one address that works in Jarvis on the iPhone and Mac. */
function addressAnswer(ctx, ts, facts) {
  if (ts.status === 'running' && ts.serve && ts.url) {
    return { answer: `My address is ${ts.url}${named(ctx)}. In Jarvis on your iPhone or Mac, paste it into Settings > Home base.`, facts, suggestions: ['Is my phone connected?', 'Status report'] };
  }
  const why = ts.status === 'not-installed' ? "Tailscale isn't installed yet" : ts.status === 'running' ? "Tailscale isn't sharing me with your devices yet" : ts.status ? "Tailscale isn't connected" : "I haven't checked Tailscale yet";
  return { answer: `${why}, so your iPhone and Mac can't reach me yet. Run "jarvis-core url" in Terminal on this computer: it shows what to do, and then the address to paste into Jarvis.`, facts, suggestions: ['Is Tailscale working?', 'Status report'] };
}

export function tailscale(ctx, cls) {
  const ts = ctx.s.services?.tailscale ?? {};
  const facts = { status: ts.status ?? null, online: ts.online ?? null, total: ts.total ?? null, url: ts.url ?? null, dnsName: ts.dnsName ?? null };
  if (cls.address && ts.status !== 'running') return addressAnswer(ctx, ts, facts);
  if (ts.status === 'not-installed') return { answer: "Tailscale isn't installed yet, so your phone can't reach me from outside the house. The install steps print how to add it.", facts, suggestions: ['Status report'] };
  if (ts.status === 'logged-out') return { answer: 'Tailscale is logged out. Running "sudo tailscale up" on this computer signs it back in.', facts, suggestions: ['Status report'] };
  if (ts.status === 'stopped') return { answer: 'Tailscale is switched off on this computer. "sudo tailscale up" turns it back on.', facts, suggestions: ['Status report'] };
  if (ts.status === 'not-running') return { answer: 'The Tailscale service isn\'t running on this computer. "sudo systemctl start tailscaled" starts it.', facts, suggestions: ['Status report'] };
  if (ts.status !== 'running') return { answer: "I haven't checked Tailscale yet; give me a moment.", facts, suggestions: ['Status report'] };
  if (cls.address) return addressAnswer(ctx, ts, facts);
  const peers = ts.peers ?? [];
  facts.devices = peers.map((p) => ({ name: p.name, kind: p.kind, online: p.online, lastSeen: p.lastSeen }));
  const wanted = cls.device;
  if (wanted) {
    const want = wanted === 'phone' ? ['iPhone', 'Android phone'] : wanted === 'iphone' ? ['iPhone'] : wanted === 'ipad' || wanted === 'tablet' ? ['iPad'] : wanted === 'android' ? ['Android phone'] : ['Mac'];
    const match = peers.filter((p) => want.includes(p.kind));
    if (!match.length) return { answer: `I don't see ${wanted === 'phone' ? 'a phone' : `a ${wanted}`} on your tailnet. ${peers.length ? `There ${peers.length === 1 ? 'is' : 'are'} ${joinWords(peers.map((p) => p.name))}.` : 'No other devices are on it yet.'}`, facts, suggestions: ['Which devices are connected?'] };
    return { answer: `${cap(joinWords(match.map((p) => deviceLine(p, ctx))))}.`, facts, suggestions: ['Which devices are connected?', 'Status report'] };
  }
  const url = ts.serve && ts.url ? ` You can open me at ${ts.url}` : ts.url && ts.serve === false ? ' (Tailscale serve is not set up yet, so other devices cannot open the dashboard.)' : '';
  const devices = peers.length ? ` ${cap(joinWords(peers.slice(0, 4).map((p) => deviceLine(p, ctx))))}.` : ' No other devices are on your tailnet yet.';
  return { answer: `Tailscale is connected: ${ts.online} of ${ts.total} device${ts.total === 1 ? '' : 's'} online.${devices}${url}${url.startsWith(' You') ? '.' : ''}`, facts, suggestions: ['Is my phone connected?', 'Status report'] };
}

// ------------------------------------------------------------------------------------------------- time

export function uptime(ctx) {
  const s = ctx.s;
  const up = s.host?.uptimeSec;
  const core = s.core?.uptimeSec;
  const facts = { machineUptimeSec: up ?? null, bootTime: s.host?.bootTime ?? null, coreUptimeSec: core ?? null, coreStartedAt: s.core?.startedAt ?? null };
  if (!isNum(up)) return { answer: "I can't read the computer's uptime.", facts, suggestions: ['Any restarts?'] };
  const since = fmtWhen(s.host.bootTime, ctx.now, ctx.tz);
  const sameStart = isNum(core) && Math.abs(core - up) < 300;
  const coreText = sameStart ? '' : isNum(core) ? ` I (the Core service) have been running for ${fmtDuration(core)}.` : '';
  return { answer: `${sameStart ? 'The computer and I have' : 'The computer has'} been up ${fmtDuration(up)}, since ${since}.${coreText}`, facts, suggestions: ['Any restarts?', 'Status report'] };
}

export function restarts(ctx) {
  const s = ctx.s;
  const week = ctx.events.between(ctx.now - 7 * 86_400_000);
  const boots = week.filter((e) => e.rule === 'machine.boot');
  const crashes = week.filter((e) => e.rule === 'core.crash' || (e.rule === 'machine.boot' && e.level === 'warn'));
  const since = isNum(s.host?.bootTime) ? fmtWhen(s.host.bootTime, ctx.now, ctx.tz) : null;
  const facts = { bootTime: s.host?.bootTime ?? null, bootsThisWeek: boots.length, unexpected: crashes.length };
  const first = since ? `The computer last started ${since} (${fmtDuration(s.host.uptimeSec, { parts: 1 })} ago).` : "I can't read when the computer last started.";
  const tail = crashes.length ? ` ${crashes.length === 1 ? 'One unexpected stop' : `${crashes.length} unexpected stops`} this week, the last ${fmtWhen(crashes[crashes.length - 1].t, ctx.now, ctx.tz)}.` : ' No unexpected restarts this week.';
  return { answer: `${first}${tail}`, facts, suggestions: ['How long have you been up?', 'Status report'] };
}

const TREND_SERIES = {
  cpuTemp: { label: 'the CPU', unit: '°C', word: ['hotter', 'cooler'], fmt: fmtTemp, margin: 4 },
  gpuTemp: { label: 'the graphics card', unit: '°C', word: ['hotter', 'cooler'], fmt: fmtTemp, margin: 4 },
  cpu: { label: 'CPU use', unit: '%', word: ['busier', 'quieter'], fmt: (v) => fmtPercentWords(v), margin: 5 },
  gpu: { label: 'graphics card use', unit: '%', word: ['busier', 'quieter'], fmt: (v) => fmtPercentWords(v), margin: 5 },
  ram: { label: 'memory use', unit: '%', word: ['higher', 'lower'], fmt: (v) => fmtPercentWords(v), margin: 5 },
  disk: { label: 'the main drive', unit: '%', word: ['fuller', 'emptier'], fmt: (v) => `${fmtPercentWords(v)} full`, margin: 1 },
  netRx: { label: 'download traffic', unit: 'b/s', word: ['higher', 'lower'], fmt: fmtBits, margin: null },
};

export function trend(ctx, cls) {
  const t = new Set(cls.topics);
  const a = new Set(cls.aspects);
  const n = cls.normalized ?? '';
  const hot = a.has('temp') || /\b(hotter|warmer|cooler|colder)\b/.test(n);
  let keys;
  if (t.has('gpu')) keys = [hot || !a.has('usage') ? 'gpuTemp' : 'gpu'];
  else if (t.has('memory')) keys = ['ram'];
  else if (t.has('disk')) keys = ['disk'];
  else if (t.has('network') || a.has('speed')) keys = ['netRx'];
  else if (t.has('cpu')) keys = [hot ? 'cpuTemp' : a.has('usage') || /\b(busier|quieter)\b/.test(n) ? 'cpu' : 'cpuTemp'];
  else if (/\b(busier|quieter|busy)\b/.test(n) || a.has('usage')) keys = ['cpu'];
  else keys = ['cpuTemp', 'gpuTemp'];

  const from = ctx.now - 7 * 86_400_000;
  const to = ctx.now - 3600_000;
  const lines = [];
  const facts = {};
  for (const key of keys) {
    const spec = TREND_SERIES[key];
    const base = ctx.history.stats(key, { from, to });
    const nowV = ctx.history.recent(key, 300, ctx.now);
    facts[key] = { average5m: r1(nowV), average7d: r1(base?.avg), max7d: r1(base?.max), minutes: base?.count ?? 0 };
    if (!isNum(nowV)) {
      lines.push(`I have no current reading for ${spec.label}`);
      continue;
    }
    if (!base || base.count < 60) {
      lines.push(`${spec.label} has averaged ${spec.fmt(nowV)} over the last 5 minutes, but I haven't been watching long enough to know what's usual; ask me again tomorrow`);
      continue;
    }
    const diff = nowV - base.avg;
    const margin = spec.margin ?? Math.max(50_000, base.avg * 0.5);
    if (Math.abs(diff) < margin) {
      lines.push(`${spec.label} is about normal: averaging ${spec.fmt(nowV)} over the last 5 minutes, against a 7-day average of ${spec.fmt(base.avg)}`);
    } else {
      const more = diff > 0;
      const amount = spec.unit === '°C' ? `about ${Math.round(Math.abs(diff))} °C ${more ? spec.word[0] : spec.word[1]} than` : `${more ? spec.word[0] : spec.word[1]} than`;
      lines.push(`${more ? 'yes, ' : ''}${spec.label} is ${amount} usual: averaging ${spec.fmt(nowV)} over the last 5 minutes, against a 7-day average of ${spec.fmt(base.avg)}`);
    }
  }
  return { answer: `${cap(lines.join('; and '))}.`.replace(/^Yes, (\w)/, (m, c) => `Yes, ${c}`), facts, suggestions: ['What is using the CPU?', 'Status report'] };
}

export function time(ctx) {
  return { answer: `It's ${fmtClock(ctx.now, ctx.tz)} on ${fmtDate(ctx.now, ctx.tz)}.`, facts: { now: ctx.now, timeZone: ctx.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone }, suggestions: ['How long have you been up?', 'Status report'] };
}

// ------------------------------------------------------------------------------------------------- small talk and scope

export function thanks(ctx) {
  return { answer: `You're welcome${named(ctx)}. I'll keep an eye on things.`, facts: {}, suggestions: ['Status report'] };
}

export function bye(ctx) {
  return { answer: `Goodbye${named(ctx)}. I'll be here, keeping watch.`, facts: {}, suggestions: ['How are you?'] };
}

export function identity(ctx) {
  return { answer: `I'm the Jarvis Core status reporter${named(ctx)}. I watch this computer around the clock and tell you how it's doing. For anything else, open Jarvis.`, facts: {}, suggestions: ['What can you do?', 'How are you?'] };
}

export function capabilities(ctx) {
  return {
    answer: `I report on this computer${named(ctx)}: how I'm doing, whether anything's wrong, the CPU, graphics card, memory, storage, network, the Claude API, the Jarvis website, your Tailscale devices, uptime and restarts, and whether things are hotter or busier than usual. I can't change anything; for that, open Jarvis.`,
    facts: {},
    suggestions: ['How are you?', 'Anything wrong?', 'GPU temp?'],
  };
}

export function unknown(ctx, cls) {
  const s = ctx.s;
  if (cls.reason === 'empty') return { answer: 'Ask me how the computer is doing.', facts: { reason: 'empty' }, suggestions: ['How are you?', 'Anything wrong?'] };
  if (cls.reason === 'room') {
    const c = s.cpu?.temp?.packageC;
    return { answer: `I can't feel the room${named(ctx)}, only the inside of the case${isNum(c) ? `: the CPU is at ${fmtTemp(c)}` : ''}.`, facts: { reason: 'room', cpuTempC: c ?? null }, suggestions: ['Hotter than usual?'] };
  }
  if (cls.reason === 'action') {
    if (cls.verb === 'fix') {
      const bad = problems(s);
      return {
        answer: bad.length ? `I can't fix things myself${named(ctx)}; I only report. Here's what would help. ${remedyLines(bad, s).join(' ')}` : `I can't fix things myself${named(ctx)}, but there's nothing to fix: all systems normal.`,
        facts: { reason: 'action', verb: 'fix' },
        suggestions: ['Anything wrong?'],
      };
    }
    const open = cls.verb === 'open' || cls.verb === 'launch' ? ' The Open Jarvis button opens the full app.' : ' For that, open Jarvis.';
    return { answer: `I can't do that${named(ctx)}; I only report on how this computer is doing.${open}`, facts: { reason: 'action', verb: cls.verb ?? null }, suggestions: ['How are you?', 'What can you do?'] };
  }
  if (cls.reason === 'offtopic') {
    return { answer: `That's outside my remit${named(ctx)}: I only keep watch over this computer. Jarvis himself can help with that.`, facts: { reason: 'offtopic' }, suggestions: ['How are you?', 'What can you do?'] };
  }
  return { answer: `I didn't catch that${named(ctx)}. I can tell you how this computer is doing: try "How are you?", "Anything wrong?" or "GPU temp?".`, facts: { reason: cls.reason ?? 'no-match' }, suggestions: ['How are you?', 'Anything wrong?', 'GPU temp?'] };
}
