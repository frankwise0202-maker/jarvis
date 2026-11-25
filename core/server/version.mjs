import { readFileSync } from 'node:fs';

/** The Core's version, from core/package.json. */
export const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/** Bumped when the JSON shapes change incompatibly. */
export const API_VERSION = 1;
