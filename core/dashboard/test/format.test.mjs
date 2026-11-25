// Unit tests for app/format.js: node --test core/dashboard/test/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clockParts,
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
  minutesOfDay,
  num,
  pctNumber,
} from '../app/format.js';

const S = ' ';

test('num accepts numbers and numeric strings, rejects the rest', () => {
  assert.equal(num(41), 41);
  assert.equal(num('41.5'), 41.5);
  assert.equal(num(' 7 '), 7);
  for (const bad of [null, undefined, '', 'N/A', '[N/A]', NaN, Infinity, true, {}, []]) assert.equal(num(bad), null, String(bad));
});

test('percentages: whole numbers, a tiny share reads <1%, unknown is null', () => {
  assert.equal(fmtPct(9.4), '9%');
  assert.equal(fmtPct(9.5), '10%');
  assert.equal(fmtPct(0), '0%');
  assert.equal(fmtPct(0.2), '<1%');
  assert.equal(fmtPct(100), '100%');
  assert.equal(fmtPct(-3), '0%');
  assert.equal(fmtPct(null), null);
  assert.equal(pctNumber(41.6), '42');
  assert.equal(pctNumber(0.3), '<1');
  assert.equal(pctNumber('x'), null);
});

test('memory is binary (GB as the OS writes it), disks decimal', () => {
  assert.equal(fmtMem(16.71e9), `15.6${S}GB`);
  assert.equal(fmtMem(12.94 * 1024 ** 3), `12.9${S}GB`);
  assert.equal(fmtMemInstalled(15.57 * 1024 ** 3), `16${S}GB`);
  assert.equal(fmtMemInstalled(0), null);
  assert.equal(fmtMem(512 * 1024 * 1024), `512${S}MB`);
  assert.equal(fmtMem(4096 * 1024 * 1024), `4.0${S}GB`);
  assert.equal(fmtMem(1023.97 * 1024 * 1024), `1.0${S}GB`, 'rounds up into the next unit, never 1024 MB');
  assert.equal(fmtMem(0), `0${S}B`);
  assert.equal(fmtMem(null), null);
  assert.equal(fmtDisk(1000204886016), `1.0${S}TB`);
  assert.equal(fmtDisk(212e9), `212${S}GB`);
  assert.equal(fmtDisk(999.7e9), `1.0${S}TB`);
  assert.equal(fmtDisk(-1), null);
});

test('network in bits per second, disk activity in bytes per second', () => {
  assert.equal(fmtBits(0), `0${S}b/s`);
  assert.equal(fmtBits(22500), `180${S}kb/s`);
  assert.equal(fmtBits(300000), `2.4${S}Mb/s`);
  assert.equal(fmtBits(125e6), `1.0${S}Gb/s`);
  assert.equal(fmtBits(null), null);
  assert.equal(fmtRate(120000), `120${S}kB/s`);
  assert.equal(fmtRate(48e6), `48${S}MB/s`);
  assert.equal(fmtRate(0), `0${S}B/s`);
});

test('temperatures, latency, frequency and power', () => {
  assert.equal(fmtTemp(41.4), `41${S}°C`);
  assert.equal(fmtTemp('N/A'), null);
  assert.equal(fmtLatency(18.2), `18${S}ms`);
  assert.equal(fmtLatency(0.4), `<1${S}ms`);
  assert.equal(fmtLatency(1500), `1.5${S}s`);
  assert.equal(fmtFreq(3400), `3.40${S}GHz`);
  assert.equal(fmtFreq(800), `800${S}MHz`);
  assert.equal(fmtFreq(0), null);
  assert.equal(fmtWatts(7.42), `7.4${S}W`);
  assert.equal(fmtWatts(17.6), `18${S}W`);
  assert.equal(fmtWatts(151.2), `151${S}W`);
});

test('uptime stays short at every length', () => {
  assert.equal(fmtUptime(42), '42s');
  assert.equal(fmtUptime(12 * 60), '12m');
  assert.equal(fmtUptime(4 * 3600 + 12 * 60), '4h 12m');
  assert.equal(fmtUptime(3 * 86400 + 4 * 3600 + 12 * 60), '3d 04h');
  assert.equal(fmtUptime(214 * 86400 + 7 * 3600), '214d 07h');
  assert.equal(fmtUptime(null), null);
});

test('time ago', () => {
  const now = 1_000_000_000_000;
  assert.equal(fmtAgo(now - 2000, now), 'just now');
  assert.equal(fmtAgo(now - 42000, now), `42${S}s ago`);
  assert.equal(fmtAgo(now - 5 * 60000, now), `5${S}min ago`);
  assert.equal(fmtAgo(now - 3 * 3600000, now), `3${S}h ago`);
  assert.equal(fmtAgo(now - 3 * 86400000, now), '3 days ago');
  assert.equal(fmtAgo(now + 5000, now), 'just now', 'a clock a little ahead never reads negative');
  assert.equal(fmtAgo(null, now), null);
});

test('load averages, integers and pairs', () => {
  assert.equal(fmtLoad([0.42, 0.38, 0.31]), '0.42  ·  0.38  ·  0.31');
  assert.equal(fmtLoad([0.42, null, 0.31]), null);
  assert.equal(fmtLoad(null), null);
  assert.equal(fmtInt(1234567), '1,234,567');
  assert.equal(fmtPair(6.2 * 1024 ** 3, 15.6 * 1024 ** 3), `6.2 / 15.6${S}GB`);
  assert.equal(fmtPair(412 * 1024 ** 2, 4096 * 1024 ** 2), `412${S}MB / 4.0${S}GB`);
  assert.equal(fmtPair(null, 1), null);
});

test('clock parts follow the locale (12 or 24 hours) and a time zone', () => {
  const d = new Date('2026-11-25T21:47:00Z');
  assert.deepEqual(clockParts(d, 'en-US', { timeZone: 'UTC' }), { time: '9:47', period: 'PM' });
  assert.deepEqual(clockParts(d, 'en-GB', { timeZone: 'UTC' }), { time: '21:47', period: '' });
  assert.deepEqual(clockParts(d, 'en-US', { timeZone: 'America/New_York' }), { time: '4:47', period: 'PM' });
  assert.deepEqual(clockParts(d, 'en-US', { timeZone: 'UTC', hour12: false }), { time: '21:47', period: '' });
});

test('event times: time of day today, a date on other days', () => {
  const now = Date.parse('2026-11-25T21:47:00Z');
  assert.match(fmtEventTime(now - 60000, now, 'en-US', 'UTC'), /^9:46:00\sPM$/); // ICU may put a narrow space before PM
  assert.match(fmtEventTime(now - 60000, now, 'en-GB', 'UTC'), /^21:46:00$/);
  assert.match(fmtEventTime(now - 26 * 3600000, now, 'en-US', 'UTC'), /^Nov 24, 7:47/);
  assert.equal(fmtEventTime(null, now), '');
});

test('minutes of the day in a time zone', () => {
  const d = new Date('2026-11-25T23:30:00Z');
  assert.equal(minutesOfDay(d, 'UTC'), 23 * 60 + 30);
  assert.equal(minutesOfDay(d, 'America/New_York'), 18 * 60 + 30);
  assert.equal(minutesOfDay(new Date('2026-11-26T00:05:00Z'), 'UTC'), 5);
});
