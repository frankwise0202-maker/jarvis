// Weather from Open-Meteo (free, no key): today's forecast for the owner's location, and geocoding for a
// city typed in Settings. Every fetch has a timeout; a failure gives null, never an exception.

import { fetchText, parseJson, oneLine } from './util.mjs';

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const WMO = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorms',
  96: 'Thunderstorms with hail',
  99: 'Thunderstorms with hail',
};

/** A WMO weather code in words ("Partly cloudy"), or "Unknown". */
export const weatherWords = (code) => WMO[code] ?? 'Unknown';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const first = (a) => (Array.isArray(a) && a.length ? a[0] : null);

export function forecastUrl({ lat, lon, units }) {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    temperature_unit: units === 'C' ? 'celsius' : 'fahrenheit',
    timezone: 'auto',
    forecast_days: '1',
  });
  return `${FORECAST_URL}?${q}`;
}

/** Open-Meteo's JSON → the briefing's weather, or null when it has no usable numbers. */
export function parseForecast(data, { label, units }) {
  if (!data || typeof data !== 'object') return null;
  const temp = num(data.current?.temperature_2m);
  const code = num(data.current?.weather_code);
  const high = num(first(data.daily?.temperature_2m_max));
  const low = num(first(data.daily?.temperature_2m_min));
  const rain = num(first(data.daily?.precipitation_probability_max));
  const dayCode = num(first(data.daily?.weather_code));
  if (temp === null && high === null) return null;
  const deg = '°';
  const r = (v) => (v === null ? null : Math.round(v));
  const parts = [weatherWords(dayCode ?? code)];
  if (high !== null) parts.push(`high ${r(high)}${deg}`);
  if (low !== null) parts.push(`low ${r(low)}${deg}`);
  if (rain !== null && rain >= 20) parts.push(`${r(rain)}% chance of rain`);
  return {
    label: oneLine(label ?? '', 80) || 'Your location',
    units: units === 'C' ? 'C' : 'F',
    now: { temp: r(temp), summary: weatherWords(code), code: code ?? null },
    today: { high: r(high), low: r(low), rainChancePct: r(rain), summary: parts.join(', ') },
  };
}

export async function fetchWeather(fetchFn, { lat, lon, units = 'F', label = 'Your location' }, { timeoutMs = 8000 } = {}) {
  const res = await fetchText(fetchFn, forecastUrl({ lat, lon, units }), { timeoutMs, maxBytes: 200_000 });
  if (!res.ok) return null;
  return parseForecast(parseJson(res.text), { label, units });
}

/** "Atlanta" → { label: "Atlanta, Georgia", lat, lon } (2 decimals), null when not found, or { error }. */
export async function geocodeCity(fetchFn, name, { timeoutMs = 8000 } = {}) {
  const q = new URLSearchParams({ name, count: '1', language: 'en', format: 'json' });
  const res = await fetchText(fetchFn, `${GEOCODING_URL}?${q}`, { timeoutMs, maxBytes: 200_000 });
  if (!res.ok) return { error: res.error ?? `HTTP ${res.status}` };
  const data = parseJson(res.text);
  const hit = Array.isArray(data?.results) ? data.results[0] : null;
  const lat = num(hit?.latitude);
  const lon = num(hit?.longitude);
  if (!hit || lat === null || lon === null) return null;
  const place = oneLine(String(hit.name ?? name), 60);
  const region = hit.country_code === 'US' ? hit.admin1 : hit.country;
  return { label: oneLine(region ? `${place}, ${region}` : place, 80), lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}
