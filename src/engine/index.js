// Public entry point of the Jarvis engine (SPEC 7). UI-independent: no DOM access anywhere in
// src/engine, so the same engine can run in the browser app or a future device build.

export { createJarvis } from './jarvis.js';
export { MODELS, DEPTHS, MODES, DEFAULT_LEAD_MODEL, DEFAULT_WORKER_MODEL, costOf } from './models.js';
