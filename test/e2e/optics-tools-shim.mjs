// v7 split, TEMPORARY: the Optics tools for the E2E build.
//
// Lead tools V5 (V4 + pin_labels + look_through_camera + open_screen) and LEAD_SYSTEM_V4 belong
// to the other half of v7 ("shell", src/engine/prompts.js). Until the halves are merged, new
// conversations in this branch still freeze V4, so the E2E build (test/e2e/run.mjs) swaps in a
// thin wrapper around prompts.js: every module that imports prompts.js gets the same exports,
// except that
//   - leadToolsLatest() also has pin_labels and look_through_camera (src/lib/optics.js), appended
//     when the latest version does not have them yet;
//   - leadToolVersions() and isKnownLeadSetup() also know that list (backups made in a scenario
//     can be imported again).
// Once V5 is the latest version the wrapper changes nothing, and this file and its two lines in
// run.mjs can be deleted. The product build (npm run build, deploy) never uses it.

import path from 'node:path';

const NS = 'e2e-optics-tools';
const ORIGINAL = '?e2e-original';

const WRAPPER = `
export * from './prompts.js${ORIGINAL}';
import * as base from './prompts.js${ORIGINAL}';
import { lookThroughCameraTool, pinLabelsTool } from '../lib/optics.js';

const withOptics = (tools) => {
  const names = new Set(tools.map((t) => t.name));
  return [...tools, ...[pinLabelsTool(), lookThroughCameraTool()].filter((t) => !names.has(t.name))];
};
const sameJson = (a, b) => {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameJson(a[k], b[k]));
};

export const leadToolsLatest = () => withOptics(base.leadToolsLatest());

export function leadToolVersions() {
  const versions = base.leadToolVersions();
  const latest = leadToolsLatest();
  return versions.some((v) => sameJson(v, latest)) ? versions : [...versions, latest];
}

export function isKnownLeadSetup(system, tools) {
  if (base.isKnownLeadSetup(system, tools)) return true;
  return typeof system === 'string' && base.LEAD_SYSTEM_VERSIONS.includes(system) && Array.isArray(tools) && sameJson(leadToolsLatest(), tools);
}
`;

/** The esbuild plugin (pass to build({ plugins })). `root`: the repository root. */
export function opticsToolsShim(root) {
  const prompts = path.join(root, 'src', 'engine', 'prompts.js');
  return {
    name: NS,
    setup(b) {
      b.onResolve({ filter: /prompts\.js(\?e2e-original)?$/ }, (args) => {
        if (args.path.endsWith(ORIGINAL)) return { path: prompts };
        if (!args.resolveDir || path.resolve(args.resolveDir, args.path) !== prompts) return undefined;
        return { path: prompts, namespace: NS };
      });
      b.onLoad({ filter: /.*/, namespace: NS }, () => ({ contents: WRAPPER, resolveDir: path.dirname(prompts), loader: 'js' }));
    },
  };
}
