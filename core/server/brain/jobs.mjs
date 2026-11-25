// Jobs: background work the brain does with Claude, one at a time, in a queue that survives restarts
// (brain/jobs-v1.json, 600). Kinds: research (quick | deep), watch-check (one watcher's check) and
// briefing (the full morning briefing's Claude call; it has its own lane so 07:00 never waits behind a
// long research job).
//
// Job: { id: "j_…", kind, title, prompt, depth, status: queued | running | done | failed | cancelled |
//        blocked, createdAt, startedAt, finishedAt, costUsd, summary, error: null | { code, message },
//        result: { markdown, sources: [{ title, url }] } | null, watcherId?, stoppedEarly? }
// A job that was running when the Core stopped is queued again (twice at most), so research asked for
// at night still comes back in the morning.

import { newId, iso, oneLine, usd } from './util.mjs';

export const QUEUE_MAX = 20;
const KEEP_FINISHED = { research: 100, 'watch-check': 40, briefing: 30 };
const MAX_ATTEMPTS = 3;
const FINISHED = new Set(['done', 'failed', 'cancelled', 'blocked']);
const LANE = (kind) => (kind === 'briefing' ? 'priority' : 'main');

export const isFinished = (job) => FINISHED.has(job.status);

/** The public form (the list leaves out `result`). */
export function publicJob(job, { withResult = false } = {}) {
  const out = {
    id: job.id,
    kind: job.kind,
    title: job.title,
    prompt: job.prompt,
    depth: job.depth ?? null,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    costUsd: usd(job.costUsd ?? 0),
    summary: job.summary ?? '',
    error: job.error ?? null,
  };
  if (job.watcherId) out.watcherId = job.watcherId;
  if (job.stoppedEarly) out.stoppedEarly = job.stoppedEarly;
  if (withResult) out.result = job.result ?? null;
  return out;
}

/** "What is the best…" → a title for the list: the first line, at most 80 characters. */
export function titleFrom(prompt) {
  const first = String(prompt ?? '').split('\n').find((l) => l.trim()) ?? '';
  return oneLine(first, 80) || 'Research';
}

/**
 * createJobs({ file, now, log, runners, gate, onChange, onFinish }):
 *   runners[kind](job, ctx) → Promise<{ summary, result, stoppedEarly?, status?, error? }>   (throws BrainError)
 *   gate(job) → null | { status: 'blocked' | 'failed', code, message }   (checked when a job would start)
 *   ctx: { signal, charge(usd, opts), check(estimateUsd) → null | reason }  built with budgetFor/charge/capCheck
 */
export function createJobs({ file, now, log = () => {}, runners, gate, budgetFor, charge, capCheck, onChange = () => {}, onFinish = () => {} }) {
  let jobs = [];
  const running = new Map(); // lane → { job, ac }
  const extras = new Map(); // job id → { facts, budgetUsd } (memory only: what a briefing job needs)
  const waiters = new Map(); // job id → [resolve]
  let saveTimer = null;
  let stopped = false;

  const loaded = file.load();
  if (loaded?.v === 1 && Array.isArray(loaded.jobs)) {
    for (const j of loaded.jobs) {
      if (!j || typeof j.id !== 'string' || !/^j_[a-z0-9]{6,20}$/.test(j.id) || !runners[j.kind]) continue;
      const job = { ...j };
      if (job.status === 'running') {
        job.attempts = job.attempts ?? 1;
        if (job.attempts >= MAX_ATTEMPTS) {
          job.status = 'failed';
          job.finishedAt = iso(now());
          job.error = { code: 'interrupted', message: 'The home base restarted while this was running, more than once; it was not tried again.' };
        } else {
          job.status = 'queued';
          job.startedAt = null;
        }
      }
      jobs.push(job);
    }
  }

  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      file.save({ v: 1, jobs });
    }, 200);
    saveTimer.unref?.();
  }

  function changed(job) {
    save();
    try {
      onChange(publicJob(job));
    } catch (err) {
      log(`job listener failed: ${err?.message ?? err}`);
    }
  }

  function prune() {
    const byKind = {};
    for (let i = jobs.length - 1; i >= 0; i -= 1) {
      const j = jobs[i];
      if (!isFinished(j)) continue;
      byKind[j.kind] = (byKind[j.kind] ?? 0) + 1;
      if (byKind[j.kind] > (KEEP_FINISHED[j.kind] ?? 50)) jobs.splice(i, 1);
    }
  }

  const queued = () => jobs.filter((j) => j.status === 'queued');

  function create({ kind, prompt, title, depth = null, watcherId = null, facts = null, budgetUsd = null }) {
    if (!runners[kind]) throw new Error(`unknown job kind ${kind}`);
    if (queued().length >= QUEUE_MAX) {
      const e = new Error(`the queue is full (${QUEUE_MAX} jobs waiting); try again when some have finished`);
      e.code = 'queue_full';
      throw e;
    }
    const job = {
      id: newId('j'),
      kind,
      title: oneLine(title ?? '', 80) || titleFrom(prompt),
      prompt: String(prompt ?? ''),
      depth,
      status: 'queued',
      createdAt: iso(now()),
      startedAt: null,
      finishedAt: null,
      costUsd: 0,
      summary: '',
      error: null,
      result: null,
      attempts: 0,
    };
    if (watcherId) job.watcherId = watcherId;
    if (facts || budgetUsd !== null) extras.set(job.id, { facts, budgetUsd });
    jobs.push(job);
    prune();
    changed(job);
    queueMicrotask(pump);
    return job;
  }

  function finish(job, fields, output = null) {
    Object.assign(job, fields, { finishedAt: iso(now()) });
    changed(job);
    const ws = waiters.get(job.id);
    waiters.delete(job.id);
    extras.delete(job.id);
    for (const resolve of ws ?? []) resolve({ status: job.status, error: job.error, output, job });
    try {
      onFinish(job);
    } catch (err) {
      log(`job finish listener failed: ${err?.message ?? err}`);
    }
  }

  function pump() {
    if (stopped) return;
    for (const lane of ['priority', 'main']) {
      if (running.has(lane)) continue;
      const next = jobs.find((j) => j.status === 'queued' && LANE(j.kind) === lane);
      if (next) start(next, lane).catch((err) => log(`a job could not start: ${err?.stack ?? err}`));
    }
  }

  async function start(job, lane) {
    const refusal = gate(job);
    if (refusal) {
      finish(job, { status: refusal.status, error: { code: refusal.code, message: refusal.message }, summary: refusal.message });
      queueMicrotask(pump);
      return;
    }
    const ac = new AbortController();
    running.set(lane, { job, ac });
    job.status = 'running';
    job.startedAt = iso(now());
    job.attempts = (job.attempts ?? 0) + 1;
    changed(job);
    const extra = extras.get(job.id) ?? null;
    const budget = extra?.budgetUsd ?? budgetFor(job);
    let lastEmit = 0;
    const ctx = {
      signal: ac.signal,
      charge(amount, opts = {}) {
        const v = Number.isFinite(amount) && amount > 0 ? amount : 0;
        job.costUsd = (job.costUsd ?? 0) + v;
        charge(v, job, opts);
        const t = Date.now();
        if (t - lastEmit > 1000) {
          lastEmit = t;
          changed(job);
        } else save();
      },
      /** Stop reason for a conversation whose cost (charged + live estimate) is `estimateUsd`. */
      check(estimateUsd) {
        if (ac.signal.aborted) return 'cancelled';
        const total = Math.max(estimateUsd, job.costUsd ?? 0);
        if (budget !== null && total >= budget) return 'budget';
        return capCheck(Math.max(0, total - (job.costUsd ?? 0)), job);
      },
    };
    try {
      const out = await runners[job.kind](job, ctx, extra);
      if (job.status === 'cancelled') return;
      finish(
        job,
        {
          status: out.status ?? 'done',
          summary: oneLine(out.summary ?? '', 200),
          result: out.result ?? null,
          error: out.error ?? null,
          ...(out.stoppedEarly ? { stoppedEarly: out.stoppedEarly } : {}),
        },
        out.output ?? null,
      );
    } catch (err) {
      if (job.status === 'cancelled') return;
      if (err?.code === 'cancelled' || ac.signal.aborted) {
        if (stopped) {
          // The Core is stopping: the job goes back to the queue (see the constructor).
          job.status = 'running';
          return;
        }
        finish(job, { status: 'cancelled', summary: 'Cancelled.', error: null });
      } else {
        const code = typeof err?.code === 'string' ? err.code : 'internal';
        const message = oneLine(String(err?.message ?? 'Something went wrong.'), 300);
        finish(job, { status: code === 'spend_cap' ? 'blocked' : 'failed', summary: message, error: { code, message } });
      }
    } finally {
      if (running.get(lane)?.job === job) running.delete(lane);
      queueMicrotask(pump);
    }
  }

  /** DELETE /api/jobs/<id>: cancel a queued or running job; remove a finished one. */
  function cancelOrRemove(id) {
    const job = jobs.find((j) => j.id === id);
    if (!job) return { found: false };
    if (job.status === 'queued') {
      finish(job, { status: 'cancelled', summary: 'Cancelled before it started.' });
      return { found: true, cancelled: true, job };
    }
    if (job.status === 'running') {
      for (const [, r] of running) if (r.job === job) r.ac.abort();
      finish(job, { status: 'cancelled', summary: 'Cancelled.' });
      return { found: true, cancelled: true, job };
    }
    jobs = jobs.filter((j) => j !== job);
    save();
    return { found: true, removed: true, job };
  }

  /** Resolves { status, error, output, job } when the job finishes. */
  function waitFor(id) {
    const job = jobs.find((j) => j.id === id);
    if (!job) return Promise.resolve({ status: 'failed', error: { code: 'not_found', message: 'no such job' }, output: null, job: null });
    if (isFinished(job)) return Promise.resolve({ status: job.status, error: job.error, output: null, job });
    return new Promise((resolve) => {
      const list = waiters.get(id) ?? [];
      list.push(resolve);
      waiters.set(id, list);
    });
  }

  return {
    create,
    pump,
    waitFor,
    get: (id) => jobs.find((j) => j.id === id) ?? null,
    list({ limit = 50, kind = null } = {}) {
      const n = Math.max(1, Math.min(200, Math.floor(limit) || 50));
      const out = [];
      for (let i = jobs.length - 1; i >= 0 && out.length < n; i -= 1) if (!kind || jobs[i].kind === kind) out.push(jobs[i]);
      return out;
    },
    all: () => jobs.slice(),
    cancelOrRemove,
    counts() {
      return { running: running.size, queued: queued().length };
    },
    /** Jobs that finished at or after `sinceMs`. */
    finishedSince(sinceMs) {
      return jobs.filter((j) => isFinished(j) && j.finishedAt && Date.parse(j.finishedAt) >= sinceMs);
    },
    /** Stop: running jobs are aborted and go back to the queue at the next start. */
    stop() {
      stopped = true;
      for (const [, r] of running) r.ac.abort();
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      try {
        file.saveSync({ v: 1, jobs });
      } catch (err) {
        log(`saving jobs failed: ${err?.message ?? err}`);
      }
    },
    flushSync() {
      try {
        file.saveSync({ v: 1, jobs });
      } catch (err) {
        log(`saving jobs failed: ${err?.message ?? err}`);
      }
    },
    get running() {
      return [...running.values()].map((r) => r.job);
    },
  };
}
