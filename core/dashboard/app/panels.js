// The panels of the system report. Built once at start (fixed rows for threads, processes and
// filesystems), then updated in place from the view model; the event log keeps a bounded number
// of rows. Words for missing values come from here: "not available", "not checked",
// "driver not loaded", never an invented number.

import { $, el, setData, setFigure, setHidden, setText } from './dom.js';
import {
  fmtAgo,
  fmtBits,
  fmtDisk,
  fmtEventTime,
  fmtFreq,
  fmtInt,
  fmtLatency,
  fmtLoad,
  fmtMem,
  fmtMemInstalled,
  fmtPair,
  fmtPct,
  fmtRate,
  fmtTemp,
  fmtUptime,
  fmtWatts,
  keepUnits,
  num,
  pctNumber,
} from './format.js';
import { meterLevel, peerLabel, shortCpuName, sortPeers, stateWord, worst } from './model.js';

export const MAX_EVENTS = 40;
const MOUNT_NAMES = { '/': 'System', '/home': 'Home', '/boot': 'Boot', '/boot/efi': 'Boot (EFI)' };
const MAX_FS = 2;
const MAX_PEERS = 8;
const PROC_ROWS = 5;

const LEVEL_WORD = { ok: 'OK', warn: 'WARNING', alert: 'ALERT', offline: 'OFFLINE', unknown: 'UNKNOWN', off: 'OFF' };

function chip(node, level, word) {
  if (!node) return;
  setData(node, 'level', level);
  setText(node.lastElementChild, word || LEVEL_WORD[level] || level.toUpperCase());
}

function meter(node, pct, level) {
  if (!node) return;
  setData(node, 'level', level);
  const f = pct === null || pct === undefined ? 0 : Math.max(0, Math.min(1, pct / 100));
  setTransform(node.firstElementChild, `scaleX(${f.toFixed(4)})`);
}

/** Set a transform through the style property (CSP-safe; cached by setVar). */
function setTransform(node, value) {
  if (!node || node.__tf === value) return;
  node.__tf = value;
  node.style.transform = value;
}

export function createPanels() {
  const n = {
    hostName: $('host-name'),
    stateChip: $('state-chip'),
    stateWord: $('state-word'),
    stateDetail: $('state-detail'),
    uptime: $('uptime'),
    cpuPanel: $('p-cpu'),
    cpuModel: $('cpu-model'),
    cpuChip: $('cpu-chip'),
    cpuUsage: $('cpu-usage'),
    cpuTemp: $('cpu-temp'),
    cpuFreq: $('cpu-freq'),
    cpuLoad: $('cpu-load'),
    cpuThreads: $('cpu-threads'),
    gpuPanel: $('p-gpu'),
    gpuName: $('gpu-name'),
    gpuChip: $('gpu-chip'),
    gpuLive: $('gpu-live'),
    gpuMissing: $('gpu-missing'),
    gpuMissingTitle: $('gpu-missing-title'),
    gpuMissingText: $('gpu-missing-text'),
    gpuUtil: $('gpu-util'),
    gpuTemp: $('gpu-temp'),
    gpuPower: $('gpu-power'),
    gpuPowerNote: $('gpu-power-note'),
    gpuFan: $('gpu-fan'),
    gpuVram: $('gpu-vram'),
    gpuVramMeter: $('gpu-vram-meter'),
    memPanel: $('p-mem'),
    memTotal: $('mem-total'),
    memChip: $('mem-chip'),
    memPct: $('mem-pct'),
    memUsed: $('mem-used'),
    memAvail: $('mem-avail'),
    memSwap: $('mem-swap'),
    memSwapMeter: $('mem-swap-meter'),
    diskPanel: $('p-disk'),
    diskDevice: $('disk-device'),
    diskChip: $('disk-chip'),
    fsList: $('fs-list'),
    ioRead: $('io-read'),
    ioWrite: $('io-write'),
    diskHealth: $('disk-health'),
    diskHealthNote: $('disk-health-note'),
    netPanel: $('p-net'),
    netIface: $('net-iface'),
    netChip: $('net-chip'),
    netDown: $('net-down'),
    netUp: $('net-up'),
    netInternet: $('net-internet'),
    netApi: $('net-api'),
    netTail: $('net-tail'),
    svcPanel: $('p-svc'),
    svcChip: $('svc-chip'),
    peers: $('peers'),
    procsCpu: $('procs-cpu'),
    procsMem: $('procs-mem'),
    events: $('events'),
    eventsEmpty: $('events-empty'),
    coreWord: $('core-word'),
    coreSub: $('core-sub'),
    coreSummary: $('core-summary'),
  };

  // --- fixed rows ---------------------------------------------------------------------------
  let threadNodes = [];
  function buildThreads(count) {
    const c = Math.max(1, Math.min(16, count));
    if (threadNodes.length === c) return;
    n.cpuThreads.textContent = '';
    threadNodes = [];
    for (let i = 0; i < c; i++) {
      const wrap = el('div', 'thread');
      const track = el('div', 'thread-track');
      const fill = el('div', 'thread-fill');
      track.append(fill);
      wrap.append(track, el('span', 'thread-name', `T${i}`));
      n.cpuThreads.append(wrap);
      threadNodes.push(fill);
    }
  }
  buildThreads(8);

  function buildProcRows(list) {
    const rows = [];
    for (let i = 0; i < PROC_ROWS; i++) {
      const li = el('li', 'proc is-empty');
      const name = el('span', 'proc-name', '—');
      const val = el('span', 'proc-val', '');
      li.append(name, val);
      list.append(li);
      rows.push({ li, name, val });
    }
    return rows;
  }
  const procCpuRows = buildProcRows(n.procsCpu);
  const procMemRows = buildProcRows(n.procsMem);

  const fsRows = [];
  for (let i = 0; i < MAX_FS; i++) {
    const li = el('li', 'fs');
    const mount = el('span', 'fs-mount', '');
    const m = el('span', 'meter');
    m.append(el('i'));
    const pct = el('span', 'fs-pct', '');
    const detail = el('span', 'fs-detail', '');
    li.append(mount, m, pct, detail);
    li.hidden = true;
    n.fsList.append(li);
    fsRows.push({ li, mount, meter: m, pct, detail });
  }

  const peerRows = [];
  for (let i = 0; i < MAX_PEERS; i++) {
    const li = el('li', 'peer');
    const name = el('span', '', '');
    li.append(el('i'), name);
    li.hidden = true;
    n.peers.append(li);
    peerRows.push({ li, name });
  }

  const svc = {};
  for (const id of ['core', 'site', 'api', 'ts']) {
    svc[id] = { li: $(`svc-${id}`), state: $(`svc-${id}-state`), detail: $(`svc-${id}-detail`) };
  }

  const gauges = {};
  for (const id of ['cpu', 'gpu', 'ram', 'disk']) {
    const root = $(`g-${id}`);
    const flag = el('span', 'gr-flag');
    flag.append(el('i', 'lv-icon'), el('span', '', ''));
    flag.hidden = true;
    root.append(flag);
    gauges[id] = { root, v: $(`g-${id}-v`), s: $(`g-${id}-s`), flag };
  }

  // --- renderers ----------------------------------------------------------------------------

  /** A big percentage with the % set small: "9" + "%". */
  /** The value a health item is about wears that item's color when it warns or alerts; ok stays plain. */
  function valueLevel(node, vm, id) {
    const lv = (vm.itemLevels && vm.itemLevels[id]) || 'ok';
    setData(node, 'level', lv === 'warn' || lv === 'alert' ? lv : null);
  }

  function setPctFigure(node, value, unknownWords) {
    const s = pctNumber(value);
    if (s === null) {
      setFigure(node, null, unknownWords);
      node.__pct = null;
      return;
    }
    setData(node, 'unknown', null);
    if (node.__pct === s) return;
    node.__pct = s;
    node.__text = undefined;
    node.textContent = '';
    node.append(s, el('small', '', '%'));
  }

  function renderTop(vm, ctx) {
    setText(n.hostName, vm.host.name || '—');
    const sw = stateWord(vm, ctx.online);
    const lv = ctx.online ? sw.level : 'offline';
    setData(n.stateChip, 'level', lv);
    setText(n.stateWord, ctx.online ? sw.word : 'OFFLINE');
    setText(n.stateDetail, ctx.online ? sw.detail : ctx.everOnline ? 'CORE NOT ANSWERING' : 'CONNECTING');
    setText(n.uptime, fmtUptime(vm.uptimeS) ?? '—');
    setText(n.coreWord, ctx.online ? sw.word : ctx.everOnline ? 'OFFLINE' : 'LINKING');
    setText(n.coreSub, ctx.online ? sw.detail : 'NO SIGNAL');
    const line = keepUnits(summaryLine(vm, ctx));
    setText(n.coreSummary, line);
    n.coreSummary.classList.toggle('is-long', line.length > 70);
  }

  function renderCpu(vm) {
    const c = vm.cpu;
    const name = shortCpuName(c.model);
    const shape = c.cores ? `${c.cores} cores` : c.threads ? `${c.threads} threads` : '';
    setText(n.cpuModel, [name, shape].filter(Boolean).join(' · ') || '—');
    const lv = vm.levels.cpu;
    setData(n.cpuPanel, 'level', lv);
    chip(n.cpuChip, lv);
    setPctFigure(n.cpuUsage, c.usage);
    setFigure(n.cpuTemp, fmtTemp(c.temp), 'no sensor');
    valueLevel(n.cpuUsage, vm, 'cpu.load');
    valueLevel(n.cpuTemp, vm, 'cpu.temp');
    setFigure(n.cpuFreq, fmtFreq(c.freqMHz));
    setFigure(n.cpuLoad, fmtLoad(c.load));
    if (c.perThread.length) buildThreads(c.perThread.length);
    for (let i = 0; i < threadNodes.length; i++) {
      const v = num(c.perThread[i]);
      const f = v === null ? 0 : Math.max(0, Math.min(1, v / 100));
      setTransform(threadNodes[i], `scaleY(${f.toFixed(3)})`);
    }
  }

  function renderGpu(vm) {
    const g = vm.gpu;
    const lv = vm.levels.gpu;
    if (g.state !== 'ok') {
      const nodriver = g.state === 'nodriver';
      const pending = g.state === 'pending' || g.state === 'unknown';
      setData(n.gpuPanel, 'level', 'unknown');
      chip(n.gpuChip, 'unknown', nodriver ? 'NO DRIVER' : pending ? 'CHECKING' : 'NO READING');
      setText(n.gpuName, g.name ? g.name.replace(/^NVIDIA\s+/i, '') : 'Graphics card');
      setHidden(n.gpuLive, true);
      setHidden(n.gpuMissing, false);
      setText(n.gpuMissingTitle, nodriver ? 'GPU DRIVER NOT LOADED' : pending ? 'CHECKING THE GRAPHICS CARD' : 'GPU NOT ANSWERING');
      const temp = g.fallbackTemp ? ` The card's own sensor reads ${fmtTemp(g.fallbackTemp.temp)}.` : '';
      setText(
        n.gpuMissingText,
        nodriver
          ? `The NVIDIA driver isn't running, so the graphics card can't be read.${temp} Its numbers appear here once the driver is installed.`
          : pending
            ? 'Waiting for the first reading from the graphics card.'
            : `The graphics card didn't answer${g.detail ? ` (${g.detail})` : ''}. The Core keeps trying every few seconds.${temp}`,
      );
      return;
    }
    setHidden(n.gpuLive, false);
    setHidden(n.gpuMissing, true);
    setData(n.gpuPanel, 'level', lv);
    chip(n.gpuChip, lv);
    const gname = g.name ? g.name.replace(/^NVIDIA\s+/i, '') : null;
    setText(n.gpuName, [gname, g.driver ? `driver ${g.driver}` : null].filter(Boolean).join(' · ') || '—');
    setPctFigure(n.gpuUtil, g.util);
    setFigure(n.gpuTemp, fmtTemp(g.temp));
    valueLevel(n.gpuTemp, vm, 'gpu.temp');
    setFigure(n.gpuPower, fmtWatts(g.power));
    const pl = fmtWatts(g.powerLimit);
    setText(n.gpuPowerNote, pl ? `of ${pl}` : '');
    setFigure(n.gpuFan, fmtPct(g.fan));
    setText(n.gpuVram, fmtPair(g.memUsed, g.memTotal) ?? 'not available');
    meter(n.gpuVramMeter, g.memPct, g.memPct !== null && g.memPct >= 95 ? 'warn' : 'ok');
  }

  function renderMem(vm) {
    const m = vm.mem;
    const lv = vm.levels.mem;
    setData(n.memPanel, 'level', lv);
    chip(n.memChip, lv);
    setText(n.memTotal, m.total !== null ? `${fmtMemInstalled(m.total)} installed` : '—');
    setPctFigure(n.memPct, m.usedPct);
    setFigure(n.memUsed, fmtMem(m.used));
    setFigure(n.memAvail, fmtMem(m.available));
    valueLevel(n.memPct, vm, 'memory');
    valueLevel(n.memAvail, vm, 'memory');
    if (m.swapTotal === 0) {
      setText(n.memSwap, 'no swap');
      meter(n.memSwapMeter, 0, 'ok');
    } else {
      setText(n.memSwap, m.swapTotal !== null ? `${fmtMem(m.swapUsed ?? 0)} of ${fmtMem(m.swapTotal)}` : 'not available');
      meter(n.memSwapMeter, m.swapPct, meterLevel('swap', m.swapPct));
    }
  }

  function renderDisk(vm) {
    const lv = vm.levels.disk;
    setData(n.diskPanel, 'level', lv);
    chip(n.diskChip, lv);
    const h = vm.diskHealth;
    const drv = vm.drive;
    const model = (drv && drv.model) || h.model;
    const size = drv && drv.size ? fmtDisk(drv.size) : null;
    const kind = drv && drv.rotational !== null ? (drv.rotational ? 'hard disk' : 'SSD') : null;
    const dev = [model ? model.replace(/-.*$/, '') : null, [size, kind].filter(Boolean).join(' ') || null].filter(Boolean).join(' · ');
    setText(n.diskDevice, dev || (vm.disks.length ? `${vm.disks.length} filesystem${vm.disks.length === 1 ? '' : 's'}` : '—'));
    // Small system partitions (the 512 MB EFI one) only show when they are filling up.
    const list = vm.disks.filter((d) => d.mount === '/' || !(d.total < 2e9) || (d.usedPct ?? 0) >= 85).slice(0, MAX_FS);
    for (let i = 0; i < MAX_FS; i++) {
      const row = fsRows[i];
      const d = list[i];
      if (!d) {
        setHidden(row.li, true);
        continue;
      }
      setHidden(row.li, false);
      setText(row.mount, MOUNT_NAMES[d.mount] || d.mount);
      const l = meterLevel('disk', d.usedPct);
      meter(row.meter, d.usedPct, l);
      setText(row.pct, fmtPct(d.usedPct) ?? '—');
      valueLevel(row.pct, vm, `disk:${d.mount}`);
      const free = fmtDisk(d.free);
      const total = fmtDisk(d.total);
      setText(row.detail, free && total ? `${free} free of ${total} · ${d.mount}${d.fs ? ` · ${d.fs}` : ''}` : d.mount);
    }
    setFigure(n.ioRead, fmtRate(vm.io.readBps));
    setFigure(n.ioWrite, fmtRate(vm.io.writeBps));
    const hs = h.status;
    const word = hs === 'passed' ? 'PASSED' : hs === 'failed' ? 'FAILING' : hs === 'warning' ? 'WEARING' : hs === 'unknown' ? 'unknown' : 'not checked';
    setText(n.diskHealth, word);
    setData(n.diskHealth, 'unknown', hs === 'not-checked' || hs === 'unknown' ? 'true' : null);
    setData(n.diskHealth, 'level', hs === 'failed' ? 'alert' : hs === 'warning' ? 'warn' : hs === 'passed' ? 'ok' : null);
    const note = hs === 'warning' || hs === 'failed' || hs === 'not-checked' ? h.detail || '' : '';
    setText(n.diskHealthNote, note ? `Drive health: ${note}` : '');
    setHidden(n.diskHealthNote, !note);
  }

  function checkText(c, okWord = 'online', downWord = 'down') {
    if (c.ok === true) return fmtLatency(c.latencyMs) ?? okWord;
    if (c.ok === false) return downWord;
    return null;
  }

  function renderNet(vm) {
    const net = vm.net;
    const lvNet = worst(vm.levels.net, worst(vm.levels.api, vm.levels.tailscale));
    setData(n.netPanel, 'level', lvNet);
    chip(n.netChip, lvNet);
    const KIND = { ethernet: 'Ethernet', wifi: 'Wi-Fi', mobile: 'mobile', vpn: 'VPN' };
    const link = net.speedMbps ? (net.speedMbps >= 1000 ? `${net.speedMbps / 1000} Gb/s` : `${net.speedMbps} Mb/s`) : null;
    setText(n.netIface, [net.iface, [KIND[net.kind] || net.kind, link].filter(Boolean).join(' ') || null].filter(Boolean).join(' · ') || '—');
    setFigure(n.netDown, fmtBits(net.rxBps));
    setFigure(n.netUp, fmtBits(net.txBps));
    setFigure(n.netInternet, checkText(vm.internet, 'online', 'DOWN'), 'not checked');
    setFigure(n.netApi, checkText(vm.api, 'reachable', 'UNREACHABLE'), 'not checked');
    const ts = vm.tailscale;
    if (ts.status === 'not-installed') setFigure(n.netTail, null, 'not installed');
    else if (!ts.status || ts.status === 'unknown') setFigure(n.netTail, null, 'not checked');
    else if (ts.status !== 'running') setFigure(n.netTail, null, 'not connected');
    else setFigure(n.netTail, ts.total ? `${ts.online} / ${ts.total} on` : 'no devices');
  }

  function renderServices(vm, ctx) {
    let all = 'ok';
    // Jarvis Core itself.
    const coreUp = ctx.online;
    const s1 = svc.core;
    setData(s1.li, 'level', coreUp ? 'ok' : 'alert');
    setText(s1.state, coreUp ? 'RUNNING' : 'NOT ANSWERING');
    setText(s1.detail, [vm.core.version ? `v${vm.core.version.replace(/^v/, '')}` : null, vm.core.uptimeS !== null ? `up ${fmtUptime(vm.core.uptimeS)}` : null].filter(Boolean).join(' · '));
    if (!coreUp) all = 'alert';

    const site = vm.site;
    const s2 = svc.site;
    const siteLv = site.ok === false ? worst('warn', vm.levels.site) : site.ok === null ? 'unknown' : vm.levels.site;
    setData(s2.li, 'level', siteLv);
    setText(s2.state, site.ok === true ? 'LIVE' : site.ok === false ? 'UNREACHABLE' : 'NOT CHECKED');
    setText(s2.detail, [site.build ? `build ${site.build}` : null, site.checkedAt ? `checked ${fmtAgo(site.checkedAt, ctx.now)}` : null].filter(Boolean).join(' · '));
    if (siteLv !== 'unknown') all = worst(all, siteLv);

    const api = vm.api;
    const s3 = svc.api;
    const apiLv = api.ok === false ? worst('warn', vm.levels.api) : api.ok === null ? 'unknown' : vm.levels.api;
    setData(s3.li, 'level', apiLv);
    setText(s3.state, api.ok === true ? 'REACHABLE' : api.ok === false ? 'UNREACHABLE' : 'NOT CHECKED');
    setText(s3.detail, [api.ok === true ? fmtLatency(api.latencyMs) : api.detail, api.checkedAt ? `checked ${fmtAgo(api.checkedAt, ctx.now)}` : null].filter(Boolean).join(' · '));
    if (apiLv !== 'unknown') all = worst(all, apiLv);

    const ts = vm.tailscale;
    const s4 = svc.ts;
    const TS_WORD = {
      running: 'CONNECTED',
      'logged-out': 'LOGGED OUT',
      'needs-approval': 'NEEDS APPROVAL',
      stopped: 'STOPPED',
      starting: 'STARTING',
      'not-installed': 'NOT INSTALLED',
      'not-running': 'NOT RUNNING',
      error: 'NOT ANSWERING',
    };
    const st = ts.status || 'unknown';
    let tsLv = vm.levels.tailscale;
    if (st === 'running') tsLv = vm.levels.tailscale;
    else if (st === 'not-installed' || st === 'unknown') tsLv = 'unknown';
    else tsLv = worst('warn', tsLv);
    setData(s4.li, 'level', tsLv);
    setText(s4.state, TS_WORD[st] || 'NOT CHECKED');
    setText(s4.detail, st === 'running' ? ts.dnsName || '' : ts.detail || '');
    if (tsLv !== 'unknown') all = worst(all, tsLv);

    setData(n.svcPanel, 'level', all);
    chip(n.svcChip, all);

    // Devices on the tailnet: this machine first, then online ones.
    const peers = sortPeers(ts.peers).slice(0, MAX_PEERS);
    for (let i = 0; i < MAX_PEERS; i++) {
      const row = peerRows[i];
      const p = peers[i];
      if (!p) {
        setHidden(row.li, true);
        continue;
      }
      setHidden(row.li, false);
      setData(row.li, 'online', p.online === true ? 'true' : 'false');
      const kind = p.kind && p.kind !== 'device' ? ` · ${p.kind}` : '';
      const label = peerLabel(p) + (p.self ? ' (this PC)' : kind);
      const when = p.online === true ? '' : p.lastSeen ? ` · seen ${fmtAgo(p.lastSeen, ctx.now)}` : ' · offline';
      setText(row.name, label + when);
      row.li.classList.toggle('peer-self', !!p.self);
    }
  }

  function renderProcs(vm) {
    fillProcs(procCpuRows, vm.procs.byCpu, (p) => fmtPct(p.cpu) ?? '—');
    fillProcs(procMemRows, vm.procs.byMem, (p) => fmtMem(p.mem) ?? '—');
  }

  function fillProcs(rows, list, value) {
    for (let i = 0; i < PROC_ROWS; i++) {
      const r = rows[i];
      const p = list[i];
      r.li.classList.toggle('is-empty', !p);
      setText(r.name, p ? p.name : '—');
      setText(r.val, p ? value(p) : '');
    }
  }

  function gaugeSet(id, { value, sub, level, unknownWords }) {
    const g = gauges[id];
    setData(g.root, 'level', level);
    if (value === null) {
      setFigure(g.v, null, unknownWords || 'N/A');
      g.v.__pct = null;
    } else setPctFigure(g.v, value);
    setText(g.s, sub || '');
    const flagged = level === 'warn' || level === 'alert';
    setHidden(g.flag, !flagged);
    if (flagged) setText(g.flag.lastElementChild, level === 'alert' ? 'ALERT' : 'WARNING');
  }

  /** The corner readouts around the core (and the values the orb's gauges show). */
  function renderGauges(vm) {
    const c = vm.cpu;
    gaugeSet('cpu', { value: c.usage, sub: c.temp !== null ? fmtTemp(c.temp) : 'temp n/a', level: vm.levels.cpu });
    const g = vm.gpu;
    if (g.state === 'ok') {
      const parts = [fmtTemp(g.temp), g.memUsed !== null ? `${fmtMem(g.memUsed)} VRAM` : null].filter(Boolean);
      gaugeSet('gpu', { value: g.util, sub: parts.join(' · '), level: vm.levels.gpu });
    } else {
      const words = g.state === 'nodriver' ? 'NO DRIVER' : g.state === 'pending' || g.state === 'unknown' ? 'CHECKING' : 'NO DATA';
      const sub = g.fallbackTemp ? fmtTemp(g.fallbackTemp.temp) : g.state === 'nodriver' ? "card can't be read" : 'no reading';
      gaugeSet('gpu', { value: null, unknownWords: words, sub, level: 'unknown' });
    }
    const m = vm.mem;
    gaugeSet('ram', { value: m.usedPct, sub: fmtPair(m.used, m.total) ?? '', level: vm.levels.mem });
    const d = fullest(vm.disks);
    gaugeSet('disk', {
      value: d ? d.usedPct : null,
      unknownWords: 'NO DATA',
      sub: d ? `${d.mount === '/' ? '' : `${d.mount} · `}${fmtDisk(d.free) ?? '?'} free` : '',
      level: vm.levels.disk,
    });
  }

  // --- the event log ------------------------------------------------------------------------
  const evNodes = new Map(); // key → li
  const evOrder = []; // keys, newest first

  function evKey(e) {
    return e.id ? `id:${e.id}` : `t:${e.t}|${e.title}`;
  }

  /** Add events (any order); the log keeps the newest MAX_EVENTS, newest first. */
  function addEvents(list, ctx) {
    if (!Array.isArray(list) || !list.length) return;
    const sorted = [...list].filter((e) => e && e.title).sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
    for (const e of sorted) {
      const key = evKey(e);
      if (evNodes.has(key)) continue;
      // Keep the list ordered by time: find where this one goes (usually the top).
      let idx = 0;
      while (idx < evOrder.length && (evNodes.get(evOrder[idx]).__t ?? 0) > (e.t ?? 0)) idx++;
      if (idx >= MAX_EVENTS) continue; // older than everything we keep
      const li = el('li', 'ev');
      li.__t = e.t ?? 0;
      setData(li, 'level', e.level);
      if (e.word === 'INFO') setData(li, 'info', 'true');
      const time = el('span', 'ev-time', fmtEventTime(e.t, ctx.now, undefined, ctx.timeZone));
      const lv = el('span', 'ev-level');
      lv.append(el('i', 'lv-icon'), e.word || (e.level === 'alert' ? 'ALERT' : e.level === 'warn' ? 'WARN' : 'OK'));
      const text = el('span', 'ev-text', keepUnits(e.title + (e.detail ? ` — ${e.detail}` : '')));
      li.append(time, lv, text);
      const before = idx < evOrder.length ? evNodes.get(evOrder[idx]) : null;
      n.events.insertBefore(li, before);
      evOrder.splice(idx, 0, key);
      evNodes.set(key, li);
      while (evOrder.length > MAX_EVENTS) {
        const old = evOrder.pop();
        const node = evNodes.get(old);
        evNodes.delete(old);
        if (node) node.remove();
      }
    }
    setHidden(n.eventsEmpty, evOrder.length > 0);
  }

  /** Refresh the event times once a minute (a "today" time becomes a dated one after midnight). */
  function refreshEventTimes(ctx) {
    for (const key of evOrder) {
      const li = evNodes.get(key);
      if (li) setText(li.firstElementChild, fmtEventTime(li.__t, ctx.now, undefined, ctx.timeZone));
    }
  }

  function render(vm, ctx) {
    renderTop(vm, ctx);
    renderCpu(vm);
    renderGpu(vm);
    renderMem(vm);
    renderDisk(vm);
    renderNet(vm);
    renderServices(vm, ctx);
    renderProcs(vm);
    renderGauges(vm);
  }

  return { render, renderTop, addEvents, refreshEventTimes, eventCount: () => evOrder.length };
}

/** The real filesystem that is fullest (the DISK gauge shows the one to worry about). */
export function fullest(disks) {
  let best = null;
  for (const d of disks) {
    if (d.usedPct === null) continue;
    if (!best || d.usedPct > best.usedPct) best = d;
  }
  return best;
}

/** One sentence under the core: the Core's own summary when it sends one, else built here. */
export function summaryLine(vm, ctx) {
  if (!ctx.online) {
    if (!ctx.everOnline) return 'Connecting to the Core…';
    return ctx.lastSeenText ? `The Core stopped answering ${ctx.lastSeenText}. Showing the last known values, dimmed.` : 'The Core is not answering.';
  }
  if (vm.health.summary) return vm.health.summary;
  const issues = vm.health.items.filter((i) => i.level !== 'ok');
  if (issues.length) {
    const first = issues.sort((a, b) => (a.level === 'alert' ? -1 : 0) - (b.level === 'alert' ? -1 : 0))[0];
    return issues.length > 1 ? `${first.title} (+${fmtInt(issues.length - 1)} more)` : first.title;
  }
  return 'All systems normal.';
}
