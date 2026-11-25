// The brain's settings (PUT /api/brain/settings), kept in brain/settings-v1.json:
//   limits   { dailyUsd 0-50 (default 5), monthlyUsd 0-500 (default 50) }
//   briefing { enabled, time "HH:MM" (default 07:00), units "F" | "C", location { lat, lon, label } | null }
//   owner    { name }
// Coordinates are rounded to 2 decimals (about 1 km) before they are stored. They stay on this computer.

import { isObj, oneLine } from './util.mjs';
import { parseHm } from './schedule.mjs';

export const LIMITS = Object.freeze({ dailyMax: 50, monthlyMax: 500 });

export function defaultSettings({ ownerName = 'Frank', units = 'F' } = {}) {
  return {
    v: 1,
    limits: { dailyUsd: 5, monthlyUsd: 50 },
    briefing: { enabled: true, time: '07:00', units, location: null },
    owner: { name: ownerName || 'Frank' },
  };
}

const bad = (code, message) => ({ ok: false, status: 400, code, message });
const round2 = (v) => Math.round(v * 100) / 100;

function cleanLocation(loc) {
  const lat = Number(loc.lat);
  const lon = Number(loc.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { label: oneLine(typeof loc.label === 'string' ? loc.label : '', 80) || 'Your location', lat: round2(lat), lon: round2(lon) };
}

/** A stored settings object made safe (anything odd falls back to the default). */
export function normalizeSettings(raw, defaults) {
  const s = structuredClone(defaults);
  if (!isObj(raw)) return s;
  const l = raw.limits;
  if (isObj(l)) {
    if (Number.isFinite(l.dailyUsd) && l.dailyUsd >= 0 && l.dailyUsd <= LIMITS.dailyMax) s.limits.dailyUsd = l.dailyUsd;
    if (Number.isFinite(l.monthlyUsd) && l.monthlyUsd >= 0 && l.monthlyUsd <= LIMITS.monthlyMax) s.limits.monthlyUsd = l.monthlyUsd;
  }
  const b = raw.briefing;
  if (isObj(b)) {
    if (typeof b.enabled === 'boolean') s.briefing.enabled = b.enabled;
    if (typeof b.time === 'string' && parseHm(b.time)) s.briefing.time = normHm(b.time);
    if (b.units === 'F' || b.units === 'C') s.briefing.units = b.units;
    if (isObj(b.location)) s.briefing.location = cleanLocation(b.location);
  }
  if (isObj(raw.owner) && typeof raw.owner.name === 'string' && oneLine(raw.owner.name, 40)) s.owner.name = oneLine(raw.owner.name, 40);
  return s;
}

const normHm = (t) => {
  const p = parseHm(t);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

/**
 * Check a PUT body. Returns { ok: true, patch, city } (city: a place name to geocode first) or
 * { ok: false, status, code, message }. Unknown keys are refused, so a typo never silently does nothing.
 */
export function validateSettingsBody(body) {
  if (!isObj(body)) return bad('bad_settings', 'send a JSON object such as {"limits": {"dailyUsd": 5}}');
  const patch = {};
  let city = null;
  for (const k of Object.keys(body)) if (!['limits', 'briefing', 'owner'].includes(k)) return bad('bad_settings', `unknown setting "${oneLine(k, 40)}" (limits, briefing, owner)`);
  if (body.limits !== undefined) {
    if (!isObj(body.limits)) return bad('bad_limits', 'limits must be an object: {"dailyUsd": 5, "monthlyUsd": 50}');
    patch.limits = {};
    for (const k of Object.keys(body.limits)) if (!['dailyUsd', 'monthlyUsd'].includes(k)) return bad('bad_limits', `unknown limit "${oneLine(k, 40)}" (dailyUsd, monthlyUsd)`);
    const { dailyUsd, monthlyUsd } = body.limits;
    if (dailyUsd !== undefined) {
      if (typeof dailyUsd !== 'number' || !Number.isFinite(dailyUsd) || dailyUsd < 0 || dailyUsd > LIMITS.dailyMax) return bad('bad_limits', `dailyUsd must be a number from 0 to ${LIMITS.dailyMax}`);
      patch.limits.dailyUsd = Math.round(dailyUsd * 100) / 100;
    }
    if (monthlyUsd !== undefined) {
      if (typeof monthlyUsd !== 'number' || !Number.isFinite(monthlyUsd) || monthlyUsd < 0 || monthlyUsd > LIMITS.monthlyMax) return bad('bad_limits', `monthlyUsd must be a number from 0 to ${LIMITS.monthlyMax}`);
      patch.limits.monthlyUsd = Math.round(monthlyUsd * 100) / 100;
    }
  }
  if (body.briefing !== undefined) {
    const b = body.briefing;
    if (!isObj(b)) return bad('bad_briefing', 'briefing must be an object');
    patch.briefing = {};
    for (const k of Object.keys(b)) if (!['enabled', 'time', 'units', 'location'].includes(k)) return bad('bad_briefing', `unknown briefing setting "${oneLine(k, 40)}" (enabled, time, units, location)`);
    if (b.enabled !== undefined) {
      if (typeof b.enabled !== 'boolean') return bad('bad_briefing', 'briefing.enabled must be true or false');
      patch.briefing.enabled = b.enabled;
    }
    if (b.time !== undefined) {
      if (typeof b.time !== 'string' || !parseHm(b.time)) return bad('bad_time', 'briefing.time must look like "07:00" (24-hour clock)');
      patch.briefing.time = normHm(b.time);
    }
    if (b.units !== undefined) {
      if (b.units !== 'F' && b.units !== 'C') return bad('bad_units', 'briefing.units must be "F" or "C"');
      patch.briefing.units = b.units;
    }
    if (b.location !== undefined) {
      if (b.location === null) patch.briefing.location = null;
      else if (isObj(b.location) && typeof b.location.city === 'string') {
        const name = oneLine(b.location.city, 100);
        if (name.length < 2) return bad('bad_location', 'briefing.location.city is empty');
        city = name;
      } else if (isObj(b.location) && b.location.lat !== undefined && b.location.lon !== undefined) {
        if (typeof b.location.lat !== 'number' || typeof b.location.lon !== 'number') return bad('bad_location', 'lat and lon must be numbers');
        const loc = cleanLocation(b.location);
        if (!loc) return bad('bad_location', 'lat must be -90 to 90 and lon -180 to 180');
        patch.briefing.location = loc;
      } else return bad('bad_location', 'briefing.location must be {"lat", "lon", "label"}, {"city": "..."} or null');
    }
  }
  if (body.owner !== undefined) {
    if (!isObj(body.owner) || typeof body.owner.name !== 'string' || !oneLine(body.owner.name, 40)) return bad('bad_owner', 'owner.name must be a name (up to 40 characters)');
    patch.owner = { name: oneLine(body.owner.name, 40) };
  }
  return { ok: true, patch, city };
}

/** Apply a validated patch to settings (returns a new object). */
export function applySettingsPatch(settings, patch) {
  const s = structuredClone(settings);
  if (patch.limits) Object.assign(s.limits, patch.limits);
  if (patch.briefing) Object.assign(s.briefing, patch.briefing);
  if (patch.owner) Object.assign(s.owner, patch.owner);
  return s;
}
