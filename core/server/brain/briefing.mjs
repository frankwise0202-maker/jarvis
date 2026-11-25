// The morning briefing, at the configured local time (07:00 by default) and on demand.
//   free (no key): greeting, Open-Meteo weather, up to 6 headlines from public feeds, the home base's
//                  overnight report, research and watchers that finished overnight, what's new in Jarvis
//                  (core/whats-new.json) and a music suggestion.
//   full (a key):  the same facts plus one Claude call (web search, 3 uses at most, $0.30 a day at most)
//                  that writes it in Jarvis's voice and picks the top stories. Any problem: the free one.
// Kept in brain/briefing-v1.json: the latest briefing and the day of the last scheduled one, so a restart
// neither repeats nor (within 3 hours) misses the morning's briefing. After a start (a boot at 08:00 that
// missed 07:00, an update at 06:59) the scheduled briefing waits until `ready()` says the Core has its
// first readings and the network (2 minutes at most). A scheduled briefing that came out without its
// weather or its headlines (a fetch failed) is made once more 7 minutes later, quietly (no second push).

import fs from 'node:fs';
import { dayKey, lastDailyAt, nextDailyAt, zonedParts } from './schedule.mjs';
import { fetchWeather } from './weather.mjs';
import { fetchHeadlines } from './rss.mjs';
import { overnightReport } from './homebase.mjs';
import { musicFor } from './music.mjs';
import { iso, fromIso, oneLine } from './util.mjs';
import { fmtDate } from '../format.mjs';

export const BRIEFING_DAILY_CAP_USD = 0.3;
const CATCH_UP_MS = 3 * 3600_000;
export const REDO_AFTER_MS = 7 * 60_000;

/** core/whats-new.json: [{ date: "2026-11-25", title, detail }]; the last 3 days' entries, at most 4. */
export function readWhatsNew(file, today) {
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(list)) return [];
    const t = Date.parse(`${today}T12:00:00Z`);
    return list
      .filter((e) => e && typeof e.title === 'string' && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .filter((e) => {
        const d = Date.parse(`${e.date}T12:00:00Z`);
        return Number.isFinite(d) && t - d <= 2 * 86_400_000 && d - t <= 86_400_000;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 4)
      .map((e) => ({ title: oneLine(e.title, 120), detail: oneLine(typeof e.detail === 'string' ? e.detail : '', 400) }));
  } catch {
    return [];
  }
}

function greetingWord(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const deg = (units) => (units === 'C' ? '°C' : '°F');

/** The free briefing's Markdown. */
export function freeMarkdown(b, { dateWords, noLocation = false }) {
  const out = [`**${b.greeting}** It's ${dateWords}.`];
  const w = b.weather;
  if (!w && noLocation) out.push('**Weather:** share your location from Jarvis (Settings, Home base, morning briefing) to see it here.');
  if (w) {
    const now = w.now.temp !== null ? `${w.now.summary}, ${w.now.temp}${deg(w.units)} now` : w.now.summary;
    const today = w.today.summary ? `${w.today.summary[0].toLowerCase()}${w.today.summary.slice(1)}` : '';
    out.push(`**Weather${w.label && w.label !== 'Your location' ? ` in ${w.label}` : ''}:** ${now}${today ? `; ${today}` : ''}.`);
  }
  if (b.headlines.length) out.push(`**Headlines**\n${b.headlines.map((h) => `- [${h.title}](${h.url}) (${h.source})`).join('\n')}`);
  out.push(`**Home base:** ${b.homebase.summary}${b.homebase.notes.length ? ` ${b.homebase.notes.slice(0, 2).join('. ')}.` : ''}`);
  if (b.jobs.length) out.push(`**Research done overnight**\n${b.jobs.map((j) => `- ${j.title}${j.summary ? `: ${j.summary}` : ''}`).join('\n')}`);
  if (b.watchers.length) out.push(`**Watching**\n${b.watchers.map((w2) => `- ${w2.what}: ${w2.summary || w2.status}`).join('\n')}`);
  if (b.whatsNew.length) out.push(`**What's new in Jarvis**\n${b.whatsNew.map((n) => `- ${n.title}${n.detail ? `: ${n.detail}` : ''}`).join('\n')}`);
  if (b.music) out.push(`**Music:** ${b.music.suggestion} ([Apple Music](${b.music.appleMusicUrl}))`);
  return out.join('\n\n');
}

const sentence = (s) => {
  const t = oneLine(s, 300).replace(/[.!?…]+$/, '');
  return t ? `${t}.` : '';
};

/** The free briefing read aloud: plain sentences. */
export function freeSpoken(b, { dateWords }) {
  const out = [b.greeting, `It's ${dateWords}.`];
  const w = b.weather;
  if (w) {
    const bits = [];
    if (w.now.temp !== null) bits.push(`${w.now.summary.toLowerCase()} and ${w.now.temp} degrees`);
    if (w.today.high !== null) bits.push(`a high of ${w.today.high}`);
    let line = bits.length ? `It's ${bits.join(', with ')}.` : '';
    if (w.today.rainChancePct !== null && w.today.rainChancePct >= 40) line += ` There's a ${w.today.rainChancePct} percent chance of rain.`;
    if (line) out.push(line.trim());
  }
  if (b.headlines.length) out.push(`In the news: ${b.headlines.slice(0, 3).map((h) => h.title.replace(/[.!?]+$/, '')).join('; ')}.`);
  out.push(b.homebase.level === 'ok' && /normal/i.test(b.homebase.summary) ? 'The home base had a quiet night.' : sentence(b.homebase.summary));
  const done = b.jobs.filter((j) => j.status === 'done');
  if (done.length === 1) out.push(`Your research on ${done[0].title.replace(/[.!?]+$/, '')} is ready.`);
  else if (done.length > 1) out.push(`${done.length} pieces of research are ready for you.`);
  const met = b.watchers.filter((x) => x.status === 'met');
  if (met.length) out.push(`Good news from your watchers: ${met.map((x) => sentence(x.summary || x.what)).join(' ')}`);
  if (b.whatsNew.length) out.push(`New in Jarvis: ${b.whatsNew.map((n) => n.title.replace(/[.!?]+$/, '')).join('; ')}.`);
  return out.filter(Boolean).join(' ');
}

export function createBriefings({ file, now, timeZone, getSettings, fetchFn, getCore, jobs, watchers, spend, fullAvailable, whatsNewFile, ready = () => true, onReady = () => {}, log = () => {} }) {
  let state = { v: 1, latest: null, lastScheduledDay: null, redo: null };
  const loaded = file.load();
  if (loaded?.v === 1) {
    const redo = loaded.redo && Number.isFinite(loaded.redo.at) && typeof loaded.redo.of === 'string' ? { at: loaded.redo.at, of: loaded.redo.of } : null;
    state = { v: 1, latest: loaded.latest && typeof loaded.latest === 'object' ? loaded.latest : null, lastScheduledDay: typeof loaded.lastScheduledDay === 'string' ? loaded.lastScheduledDay : null, redo };
  }
  let nextAt = null;
  let running = null;

  function computeNext() {
    const b = getSettings().briefing;
    if (!b.enabled) {
      nextAt = null;
      return;
    }
    const t = now();
    const last = lastDailyAt(b.time, timeZone, t);
    if (last !== null && t - last < CATCH_UP_MS && state.lastScheduledDay !== dayKey(last, timeZone) && !(state.latest && fromIso(state.latest.generatedAt) >= last)) nextAt = last;
    else nextAt = nextDailyAt(b.time, timeZone, t);
  }
  computeNext();

  async function gather() {
    const s = getSettings();
    const t = now();
    const day = dayKey(t, timeZone);
    const hour = zonedParts(t, timeZone).hour;
    const name = s.owner.name;
    const loc = s.briefing.location;
    const prevAt = state.latest ? fromIso(state.latest.generatedAt) : null;
    const since = Math.max(t - 24 * 3600_000, Math.min(t - 6 * 3600_000, prevAt ?? t - 12 * 3600_000));
    const [weather, candidates] = await Promise.all([
      loc ? fetchWeather(fetchFn, { lat: loc.lat, lon: loc.lon, units: s.briefing.units, label: loc.label }).catch(() => null) : Promise.resolve(null),
      fetchHeadlines(fetchFn, { now: t, max: 12 }).catch(() => []),
    ]);
    const finished = jobs.finishedSince(since).filter((j) => j.kind === 'research').slice(-5);
    const ws = watchers.list().filter((w) => w.lastCheckAt && fromIso(w.lastCheckAt) >= since);
    ws.sort((a, b) => (a.status === 'met' ? -1 : 0) - (b.status === 'met' ? -1 : 0));
    return {
      t,
      day,
      candidates,
      briefing: {
        date: day,
        generatedAt: iso(t),
        kind: 'free',
        greeting: `${greetingWord(hour)}, ${name}.`,
        weather,
        headlines: candidates.slice(0, 6),
        homebase: overnightReport({ core: getCore(), now: t, fromMs: since, timeZone }),
        jobs: finished.map((j) => ({ id: j.id, title: j.title, status: j.status, summary: j.summary ?? '' })),
        watchers: ws.slice(0, 5).map((w) => ({ id: w.id, what: w.what, status: w.status, summary: w.lastResult?.summary ?? '' })),
        whatsNew: readWhatsNew(whatsNewFile, day),
        music: musicFor(day),
        markdown: '',
        spoken: '',
      },
    };
  }

  async function makeFull(g) {
    const left = BRIEFING_DAILY_CAP_USD - spend.totals().briefingTodayUsd;
    if (!fullAvailable() || left < 0.02 || spend.capReached()) return null;
    const b = g.briefing;
    const facts = {
      date: fmtDate(g.t, timeZone),
      greeting: b.greeting,
      weather: b.weather,
      headlines: g.candidates,
      homebase: b.homebase,
      research: b.jobs,
      watchers: b.watchers,
      whatsNew: b.whatsNew,
      music: b.music,
    };
    const job = jobs.create({ kind: 'briefing', prompt: `Morning briefing for ${b.date}`, title: 'Morning briefing', facts, budgetUsd: left });
    const done = await jobs.waitFor(job.id);
    if (done.status !== 'done' || !done.output) {
      log(`the full briefing was not written (${done.error?.code ?? done.status}); using the free one`);
      return null;
    }
    return done.output;
  }

  async function generate({ scheduled = false } = {}) {
    if (running) return running;
    running = (async () => {
      const g = await gather();
      const b = g.briefing;
      const dateWords = fmtDate(g.t, timeZone);
      let full = null;
      try {
        full = await makeFull(g);
      } catch (err) {
        log(`the full briefing failed: ${err?.message ?? err}`);
      }
      if (full) {
        b.kind = 'full';
        b.markdown = full.markdown;
        b.spoken = full.spoken || freeSpoken(b, { dateWords });
        if (full.headlines.length) b.headlines = full.headlines.slice(0, 6);
      } else {
        b.markdown = freeMarkdown(b, { dateWords, noLocation: !getSettings().briefing.location });
        b.spoken = freeSpoken(b, { dateWords });
      }
      state.latest = b;
      if (scheduled) {
        state.lastScheduledDay = g.day;
        // No weather (a location is set) or no headlines: a fetch failed; try once more in a while.
        const missing = (Boolean(getSettings().briefing.location) && !g.briefing.weather) || !g.candidates.length;
        state.redo = missing ? { at: g.t + REDO_AFTER_MS, of: b.generatedAt } : null;
        if (missing) log(`the morning briefing is missing its ${!g.candidates.length ? 'headlines' : 'weather'}; it is made again in ${REDO_AFTER_MS / 60_000} minutes`);
      }
      await file.save(state);
      try {
        onReady(b, { scheduled });
      } catch (err) {
        log(`briefing listener failed: ${err?.message ?? err}`);
      }
      return b;
    })().finally(() => {
      running = null;
    });
    return running;
  }

  /** Run the scheduled briefing (or its one quiet redo) when it is due. Returns the promise when one started, else null. */
  function tick() {
    if (running) return null;
    const t = now();
    if (nextAt !== null && t >= nextAt) {
      // Just started: wait for the first readings and the network (ready() has a deadline).
      if (!ready()) return null;
      const due = nextAt;
      nextAt = nextDailyAt(getSettings().briefing.time, timeZone, Math.max(t, due + 60_000));
      state.lastScheduledDay = dayKey(due, timeZone);
      return generate({ scheduled: true }).catch((err) => {
        log(`the morning briefing failed: ${err?.message ?? err}`);
        return null;
      });
    }
    if (state.redo && t >= state.redo.at) {
      const { of } = state.redo;
      state.redo = null;
      // Only if nothing newer came since (a briefing asked for by hand is fresher anyway).
      if (state.latest?.generatedAt !== of) {
        file.save(state);
        return null;
      }
      return generate({ scheduled: false }).catch((err) => {
        log(`the morning briefing could not be made again: ${err?.message ?? err}`);
        return null;
      });
    }
    return null;
  }

  return {
    latest: () => state.latest,
    generate,
    tick,
    reschedule: computeNext,
    info() {
      const b = getSettings().briefing;
      return { enabled: b.enabled, time: b.time, units: b.units, location: b.location, lastAt: state.latest?.generatedAt ?? null, nextAt: iso(nextAt) };
    },
    get nextAt() {
      return nextAt;
    },
    get busy() {
      return running !== null;
    },
  };
}
