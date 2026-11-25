// Slower checks that run beside the 1-second collector, each on its own interval and never more than one
// at a time (a slow answer is skipped, not queued):
//
//   gpu       nvidia-smi, at most every 2 s with a 1.5 s timeout. When the driver is missing it backs
//             off (every 30-60 s) instead of spawning a failing process every 2 s forever.
//   services  every 30 s: internet (DNS + HTTPS HEAD to 1.1.1.1, then 8.8.8.8), the Claude API host
//             (HEAD, no key), the Jarvis site's sw.js (conditional GET, parsed for the build id), and
//             `tailscale status --json` (plus `tailscale serve status --json` every 5 minutes).
//   smart     smartctl health for whole disks, every 6 hours; "not checked" when smartctl is missing or
//             needs a password (tries `sudo -n`, which never prompts, when allowed by config).
//   mounts    statfs of real mounts every 10 s (asks the collector).
//
// Every check works with either answer style of the IO: plain values (the fixture simulator, so whole
// simulated days run synchronously) or promises (the live machine).

import * as P from './parse.mjs';
import { isNum, round } from '../util.mjs';

/** Call fn with the value of v, which may be a plain value or a promise; returns what fn returns. */
const then = (v, fn) => (v && typeof v.then === 'function' ? v.then((x) => fn(x, null), (e) => fn(undefined, e)) : fn(v, null));

/** Plain words for a network error code ("TIMEOUT" → "not answering"). */
export function humanError(code) {
  const c = String(code ?? '');
  if (c === 'TIMEOUT' || c === 'ETIMEDOUT' || c === 'ETIMEOUT' || c === 'UND_ERR_CONNECT_TIMEOUT') return 'not answering';
  if (c === 'ENOTFOUND' || c === 'EAI_AGAIN' || c === 'ESERVFAIL') return 'its address could not be looked up';
  if (c === 'ENETUNREACH' || c === 'EHOSTUNREACH') return 'no network route';
  if (c === 'ECONNREFUSED') return 'connection refused';
  if (c === 'ECONNRESET' || c === 'UND_ERR_SOCKET') return 'connection dropped';
  if (/CERT|SSL|TLS/i.test(c)) return 'a security certificate problem';
  return c ? `failed (${c})` : 'failed';
}

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

export function createPollers({ io, config, collector, now = () => Date.now(), log = () => {} }) {
  const iv = config.intervals;
  const state = {
    gpu: { status: 'pending', detail: 'checking the graphics card', gpus: [], checkedAt: null, errors: 0 },
    services: {
      rev: 0,
      internet: { status: 'unknown', latencyMs: null, dnsMs: null, dnsOk: null, target: null, checkedAt: null, detail: 'not checked yet', error: null, failures: 0 },
      api: { status: 'unknown', host: hostOf(config.apiUrl), latencyMs: null, httpStatus: null, checkedAt: null, detail: 'not checked yet', error: null, failures: 0 },
      site: { status: 'unknown', url: config.siteUrl, buildId: null, latencyMs: null, httpStatus: null, checkedAt: null, detail: 'not checked yet', error: null, failures: 0, etag: null },
      tailscale: { status: 'unknown', detail: 'not checked yet', checkedAt: null, serve: null, serveCheckedAt: null, failures: 0 },
    },
    smart: { status: 'not-checked', detail: 'not checked yet', devices: [], checkedAt: null },
  };
  const due = { gpu: -Infinity, services: -Infinity, tailscale: -Infinity, serve: -Infinity, smart: -Infinity, mounts: -Infinity };
  const busy = { gpu: false, services: 0, smart: false, mounts: false, serve: false };

  // ---------------------------------------------------------------------------------------------- GPU

  function pollGpu(mono) {
    busy.gpu = true;
    then(io.run('nvidia-smi', P.NVIDIA_ARGS, { timeoutMs: iv.gpuTimeoutMs ?? 1500 }), (r, err) => {
      busy.gpu = false;
      const t = now();
      const g = state.gpu;
      const gpus = r?.ok ? P.parseNvidiaSmi(r.stdout) : [];
      if (gpus.length) {
        g.status = 'ok';
        g.detail = null;
        g.gpus = gpus;
        g.errors = 0;
        due.gpu = mono + iv.gpuMs;
      } else {
        const f = r?.ok ? { status: 'error', detail: 'nvidia-smi gave no readable data' } : P.classifyNvidiaFailure(r ?? { error: String(err?.message ?? err) });
        g.status = f.status;
        g.detail = f.detail;
        g.gpus = [];
        g.errors += 1;
        due.gpu = mono + (f.status === 'not-installed' ? 60_000 : f.status === 'error' ? 10_000 : 30_000);
      }
      g.checkedAt = t;
    });
  }

  // ---------------------------------------------------------------------------------------------- services

  function finishService(name) {
    busy.services -= 1;
    if (busy.services === 0) state.services.rev += 1;
    return name;
  }

  function checkInternet() {
    const s = state.services.internet;
    const urls = config.internetUrls;
    then(io.dnsLookup(config.dnsHost, { timeoutMs: 3000 }), (dnsRes) => {
      then(io.httpRequest(urls[0], { method: 'HEAD', timeoutMs: 5000 }), (r1) => {
        const finish = (r, target) => {
          s.checkedAt = now();
          s.dnsOk = dnsRes?.ok ?? false;
          s.dnsMs = dnsRes?.ok ? round(dnsRes.ms, 0) : null;
          if (r?.ok) {
            s.status = 'up';
            s.latencyMs = round(r.ms, 0);
            s.target = target;
            s.detail = s.dnsOk ? null : 'DNS is not answering, but the internet is reachable';
            s.error = null;
            s.failures = 0;
          } else {
            s.status = 'down';
            s.latencyMs = null;
            s.target = target;
            s.error = r?.error ?? 'failed';
            s.detail = s.dnsOk ? `${hostOf(target)}: ${humanError(r?.error)}` : 'no DNS and no answer from the internet';
            s.failures += 1;
          }
          finishService('internet');
        };
        if (r1?.ok || urls.length < 2) return finish(r1, urls[0]);
        then(io.httpRequest(urls[1], { method: 'HEAD', timeoutMs: 5000 }), (r2) => finish(r2?.ok ? r2 : r1, r2?.ok ? urls[1] : urls[0]));
      });
    });
  }

  function checkApi() {
    const s = state.services.api;
    then(io.httpRequest(config.apiUrl, { method: 'HEAD', timeoutMs: 6000 }), (r) => {
      s.checkedAt = now();
      if (r?.ok) {
        s.status = 'up';
        s.latencyMs = round(r.ms, 0);
        s.httpStatus = r.status;
        s.detail = null;
        s.error = null;
        s.failures = 0;
      } else {
        s.status = 'down';
        s.latencyMs = null;
        s.httpStatus = null;
        s.error = r?.error ?? 'failed';
        s.detail = humanError(r?.error);
        s.failures += 1;
      }
      finishService('api');
    });
  }

  function checkSite() {
    const s = state.services.site;
    const headers = s.etag && s.buildId ? { 'If-None-Match': s.etag } : {};
    then(io.httpRequest(config.siteSwUrl, { method: 'GET', timeoutMs: 8000, headers, maxBytes: 512 * 1024 }), (r) => {
      s.checkedAt = now();
      s.httpStatus = r?.status ?? null;
      if (r?.ok && (r.status === 200 || r.status === 304)) {
        if (r.status === 200) {
          const id = P.parseSwBuildId(r.text);
          s.buildId = id;
          s.etag = r.headers?.etag ?? null;
        }
        s.status = 'up';
        s.latencyMs = round(r.ms, 0);
        s.detail = s.buildId ? null : 'the site answered but its build id was not found';
        s.error = null;
        s.failures = 0;
      } else {
        s.status = 'down';
        s.latencyMs = null;
        s.error = r?.ok ? `HTTP ${r.status}` : r?.error ?? 'failed';
        s.detail = r?.ok ? `the site answered ${r.status}` : humanError(r?.error);
        s.failures += 1;
      }
      finishService('site');
    });
  }

  function checkTailscale(mono) {
    const s = state.services.tailscale;
    then(io.run('tailscale', ['status', '--json'], { timeoutMs: 5000, maxBytes: 4 << 20 }), (r) => {
      const t = now();
      let next;
      if (r?.ok) next = P.parseTailscaleStatus(r.stdout);
      else next = P.classifyTailscaleFailure(r ?? { error: 'failed' });
      const serve = s.serve;
      const serveCheckedAt = s.serveCheckedAt;
      // Consecutive checks in a bad state, so a Tailscale restart never raises a warning on its own.
      const bad = ['logged-out', 'needs-approval', 'stopped', 'not-running'].includes(next.status);
      const failures = bad ? (s.failures ?? 0) + 1 : 0;
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, { detail: null, ...next, serve, serveCheckedAt, failures, checkedAt: t });
      // Not installed (yet): look again every 5 minutes rather than every 30 s.
      due.tailscale = mono + (s.status === 'not-installed' ? 300_000 : 0);
      if (s.status === 'running' && !busy.serve && mono >= due.serve) {
        busy.serve = true;
        then(io.run('tailscale', ['serve', 'status', '--json'], { timeoutMs: 5000 }), (sr) => {
          busy.serve = false;
          due.serve = mono + (iv.serveMs ?? 300_000);
          s.serve = sr?.ok ? P.parseTailscaleServe(sr.stdout, config.port).configured : null;
          s.serveCheckedAt = now();
          finishService('tailscale');
        });
      } else {
        finishService('tailscale');
      }
    });
  }

  function pollServices(mono) {
    due.services = mono + iv.servicesMs;
    const withTailscale = mono >= due.tailscale;
    busy.services = withTailscale ? 4 : 3;
    checkInternet();
    checkApi();
    checkSite();
    if (withTailscale) checkTailscale(mono);
  }

  // ---------------------------------------------------------------------------------------------- SMART

  function pollSmart(mono, disks) {
    const names = disks.filter((d) => /^(sd|nvme|hd)/.test(d));
    busy.smart = true;
    const results = [];
    let notInstalled = false;
    let needsPermission = false;
    const next = (i) => {
      if (i >= names.length) return done();
      const dev = `/dev/${names[i]}`;
      const args = ['-j', '-H', '-A', '-i', dev];
      return then(io.run('smartctl', args, { timeoutMs: 20_000 }), (r) => {
        if (r?.error === 'ENOENT') {
          notInstalled = true;
          return done();
        }
        const parsed = P.parseSmartctl(r?.stdout ?? '');
        if (parsed.passed === null && parsed.permissionDenied && config.smartSudo) {
          return then(io.run('sudo', ['-n', 'smartctl', ...args], { timeoutMs: 20_000 }), (r2) => {
            const p2 = P.parseSmartctl(r2?.stdout ?? '');
            if (p2.passed === null) needsPermission = true;
            else results.push({ name: names[i], ...p2 });
            return next(i + 1);
          });
        }
        if (parsed.passed === null) needsPermission = needsPermission || parsed.permissionDenied;
        else results.push({ name: names[i], ...parsed });
        return next(i + 1);
      });
    };
    const done = () => {
      busy.smart = false;
      const s = state.smart;
      s.checkedAt = now();
      s.devices = results.map((d) => ({
        name: d.name,
        model: d.model,
        passed: d.passed,
        reallocated: d.reallocated,
        pending: d.pending,
        uncorrectable: d.uncorrectable,
        powerOnHours: d.powerOnHours,
        tempC: d.tempC,
      }));
      if (!results.length) {
        s.status = 'not-checked';
        s.detail = notInstalled ? 'smartctl is not installed' : needsPermission ? 'smartctl needs permission (sudo) to read the disk' : 'no disks to check';
        due.smart = mono + 24 * 3600_000;
        return;
      }
      const failing = results.find((d) => d.passed === false);
      const worn = results.find((d) => [d.reallocated, d.pending, d.uncorrectable].some((v) => isNum(v) && v > 0));
      if (failing) {
        s.status = 'failing';
        s.detail = `${failing.name} failed its SMART health check`;
      } else if (worn) {
        s.status = 'warning';
        const parts = [];
        if (worn.reallocated > 0) parts.push(`${worn.reallocated} reallocated sectors`);
        if (worn.pending > 0) parts.push(`${worn.pending} pending sectors`);
        if (worn.uncorrectable > 0) parts.push(`${worn.uncorrectable} unreadable sectors`);
        s.detail = `${worn.name}: ${parts.join(', ')}`;
      } else {
        s.status = 'ok';
        s.detail = null;
      }
      due.smart = mono + (iv.smartMs ?? 6 * 3600_000);
    };
    next(0);
  }

  // ---------------------------------------------------------------------------------------------- tick

  /** Start whatever is due. `disks` is the list of whole-disk names from the latest sample. */
  function tick(mono, { disks = [] } = {}) {
    if (!busy.mounts && mono >= due.mounts) {
      busy.mounts = true;
      due.mounts = mono + iv.disksMs;
      then(collector.pollMounts(now()), () => {
        busy.mounts = false;
      });
    }
    if (!busy.gpu && mono >= due.gpu) pollGpu(mono);
    if (busy.services === 0 && mono >= due.services) pollServices(mono);
    if (!busy.smart && mono >= due.smart && disks.length) pollSmart(mono, disks);
  }

  /** Forget timers and results (fixture scenario switch). */
  function reset() {
    for (const k of Object.keys(due)) due[k] = -Infinity;
  }

  return { state, tick, reset };
}
