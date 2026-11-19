#!/usr/bin/env node
// Publish dist/ to the gh-pages branch for GitHub Pages (SPEC §11).
//
//   node scripts/deploy-pages.mjs            build, commit "Deploy <BUILD_ID>" on gh-pages (local only)
//   node scripts/deploy-pages.mjs --push     …and push gh-pages to the remote named origin
//   (npm run deploy -- --push)
//
// Options: --push, --no-build (publish the existing dist/), --keep-worktree (leave
// .gh-pages-worktree/ in place for inspection).
//
// How it works: the gh-pages branch is checked out in a separate git worktree at
// .gh-pages-worktree/ (created as an orphan branch the first time), its files are replaced with
// dist/ plus .nojekyll, and the result is committed there. The main branch, its working tree and
// its index are never touched. With --push the branch is first based on origin/gh-pages when that
// exists, so pushes are always fast-forwards.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, BuildError, ROOT } from './build.mjs';

const BRANCH = 'gh-pages';
const WORKTREE_NAME = '.gh-pages-worktree';

class DeployError extends Error {}

function git(args, { cwd = ROOT, allowFail = false, env } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env });
  if (r.error) throw new DeployError(`Could not run git: ${r.error.message}. Is git installed?`);
  const out = { code: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
  if (out.code !== 0 && !allowFail) {
    throw new DeployError(`git ${args.join(' ')} failed (exit ${out.code}):\n${out.stderr || out.stdout}`);
  }
  return out;
}

const ok = (args, opts) => git(args, { ...opts, allowFail: true }).code === 0;

/** "https://<owner>.github.io/<repo>/" for a GitHub remote URL, or ''. */
export function pagesUrlFor(remoteUrl) {
  const m = String(remoteUrl || '').match(/github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (!m) return '';
  const [, owner, repo] = m;
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${repo.toLowerCase()}/` : `https://${owner.toLowerCase()}.github.io/${repo}/`;
}

/**
 * The reminder printed on every deploy: all GitHub Pages sites of one account share the origin
 * https://<owner>.github.io, and with it Jarvis's storage (API key, history) and its offline
 * cache, so the account must not publish any other Pages site. Returns the lines to print.
 */
export function sharedOriginWarning(pagesUrl = '') {
  let origin = 'https://<owner>.github.io';
  try {
    if (pagesUrl) origin = new URL(pagesUrl).origin;
  } catch {
    /* keep the placeholder */
  }
  return [
    `⚠ Security: Jarvis keeps the API key and the conversation history in browser storage for ${origin}.`,
    '  Every GitHub Pages site published from this GitHub account shares that origin, so it could read them',
    "  (or plant files in Jarvis's offline cache). Keep this account just for Jarvis: don't publish other",
    '  Pages sites from it. Alternatives: a dedicated GitHub account, a custom subdomain for Jarvis, or a host',
    '  with per-project origins (README: "Who can read your key").',
  ];
}

async function readBuildIdFromDist(dist) {
  const html = await readFile(path.join(dist, 'index.html'), 'utf8').catch(() => '');
  return html.match(/app\.js\?v=([0-9a-f]{8})/)?.[1] || '';
}

async function emptyExceptGit(dir) {
  for (const name of await readdir(dir)) {
    if (name === '.git') continue;
    await rm(path.join(dir, name), { recursive: true, force: true });
  }
}

function registeredWorktrees(top) {
  const list = git(['worktree', 'list', '--porcelain'], { cwd: top }).stdout;
  return list.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => path.resolve(l.slice(9)));
}

export async function deploy({ push = false, doBuild = true, keepWorktree = false, log = console.log } = {}) {
  const top = git(['rev-parse', '--show-toplevel'], { allowFail: true });
  if (top.code !== 0) throw new DeployError(`${ROOT} is not a git repository. Run "git init" (and add a remote named origin) first.`);
  const repoTop = path.resolve(top.stdout);
  const worktree = path.join(ROOT, WORKTREE_NAME);
  const dist = path.join(ROOT, 'dist');

  // 1. Build.
  let buildId;
  if (doBuild) {
    log('Building…');
    buildId = (await build({ quiet: true })).buildId;
  } else {
    if (!existsSync(path.join(dist, 'index.html'))) throw new DeployError('dist/ is missing: run without --no-build.');
    buildId = (await readBuildIdFromDist(dist)) || 'manual';
  }
  log(`Build ${buildId} ready.`);

  const origin = git(['remote', 'get-url', 'origin'], { cwd: repoTop, allowFail: true });
  const hasOrigin = origin.code === 0 && !!origin.stdout;
  const pagesUrl = hasOrigin ? pagesUrlFor(origin.stdout) : '';

  // 2. Check out gh-pages in its own worktree (never in the main working tree).
  git(['worktree', 'prune'], { cwd: repoTop });
  if (existsSync(worktree) && !registeredWorktrees(repoTop).includes(path.resolve(worktree))) {
    log(`Removing a stale ${WORKTREE_NAME}/ folder left by an earlier run…`);
    await rm(worktree, { recursive: true, force: true });
  }
  if (push && hasOrigin) {
    // Learn about the published branch so this deploy builds on it (fast-forward push).
    const fetched = git(['fetch', '--quiet', 'origin', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`], { cwd: repoTop, allowFail: true });
    if (fetched.code !== 0 && !/couldn't find remote ref|not found/i.test(fetched.stderr)) {
      throw new DeployError(`Could not fetch from origin:\n${fetched.stderr}`);
    }
  }
  const hasLocal = ok(['show-ref', '--verify', '--quiet', `refs/heads/${BRANCH}`], { cwd: repoTop });
  const hasRemote = ok(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${BRANCH}`], { cwd: repoTop });
  let created = false;
  try {
    if (!existsSync(worktree)) {
      created = true;
      if (hasLocal) {
        git(['worktree', 'add', '--quiet', worktree, BRANCH], { cwd: repoTop });
      } else if (hasRemote) {
        git(['worktree', 'add', '--quiet', '-b', BRANCH, worktree, `origin/${BRANCH}`], { cwd: repoTop });
      } else {
        log(`Creating the ${BRANCH} branch (orphan: no shared history with main)…`);
        if (!ok(['worktree', 'add', '--quiet', '--orphan', '-b', BRANCH, worktree], { cwd: repoTop })) {
          // git < 2.42: detached worktree, then an orphan branch inside it.
          git(['worktree', 'add', '--quiet', '--detach', worktree], { cwd: repoTop });
          git(['checkout', '--quiet', '--orphan', BRANCH], { cwd: worktree });
          git(['rm', '-r', '--quiet', '--cached', '--ignore-unmatch', '.'], { cwd: worktree });
        }
      }
    }
    const current = git(['symbolic-ref', '--short', 'HEAD'], { cwd: worktree, allowFail: true }).stdout;
    if (current !== BRANCH) throw new DeployError(`${WORKTREE_NAME}/ is on "${current || 'a detached HEAD'}", expected ${BRANCH}. Remove the folder and run again.`);

    if (push && hasRemote && ok(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: worktree })) {
      // If the published branch moved on (e.g. a deploy from another machine), start from it.
      if (!ok(['merge-base', '--is-ancestor', `origin/${BRANCH}`, 'HEAD'], { cwd: worktree })) {
        log(`Local ${BRANCH} is behind origin/${BRANCH}; basing this deploy on the published branch.`);
        git(['reset', '--quiet', '--hard', `origin/${BRANCH}`], { cwd: worktree });
      }
    }

    // 3. Replace the branch contents with dist/ (+ .nojekyll so Pages serves files as-is).
    await emptyExceptGit(worktree);
    await cp(dist, worktree, { recursive: true });
    if (!existsSync(path.join(worktree, '.nojekyll'))) await writeFile(path.join(worktree, '.nojekyll'), '');

    git(['add', '--all', '.'], { cwd: worktree });
    const unchanged = ok(['diff', '--cached', '--quiet'], { cwd: worktree }) && ok(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: worktree });
    let committed = false;
    if (unchanged) {
      log(`Nothing new to deploy: ${BRANCH} already contains build ${buildId}.`);
    } else {
      const hasIdentity = ok(['config', 'user.email'], { cwd: worktree }) && ok(['config', 'user.name'], { cwd: worktree });
      const identity = hasIdentity ? [] : ['-c', 'user.name=Jarvis Deploy', '-c', 'user.email=jarvis-deploy@users.noreply.github.com'];
      git([...identity, 'commit', '--quiet', '-m', `Deploy ${buildId}`], { cwd: worktree });
      committed = true;
      log(`Committed "Deploy ${buildId}" on ${BRANCH}.`);
    }

    // 4. Publish (only with --push and a remote named origin).
    const remind = () => {
      log('');
      for (const line of sharedOriginWarning(pagesUrl)) log(line);
    };
    if (push && hasOrigin) {
      log('Pushing to origin…');
      const pushed = git(['push', '--quiet', 'origin', `${BRANCH}:${BRANCH}`], { cwd: worktree, allowFail: true });
      if (pushed.code !== 0) throw new DeployError(`git push failed:\n${pushed.stderr}\n\nCheck that you can push to origin (git remote -v) and try again.`);
      log(`\n✔ Published build ${buildId}.`);
      if (pagesUrl) log(`  Your app: ${pagesUrl}  (GitHub can take a minute to update)`);
      log(`  First time? On GitHub open Settings → Pages and set "Deploy from a branch" → ${BRANCH} / (root).`);
      remind();
    } else if (push) {
      log(`\nThe ${BRANCH} branch is ready, but there is no git remote named "origin" to push to.`);
      log('Add your GitHub repository, then deploy again:');
      log('  git remote add origin https://github.com/<you>/<repo>.git');
      log('  npm run deploy -- --push');
      remind();
      return { buildId, committed, pushed: false, pagesUrl, missingOrigin: true };
    } else {
      log(`\n${committed ? 'Done' : 'Up to date'}: nothing was pushed.`);
      log(hasOrigin ? `To publish it:  npm run deploy -- --push   (or: git push origin ${BRANCH})` : 'To publish it, add a remote named origin, then run:  npm run deploy -- --push');
      if (pagesUrl) log(`It will then be live at ${pagesUrl}`);
      remind();
    }
    return { buildId, committed, pushed: push && hasOrigin, pagesUrl };
  } finally {
    if (!keepWorktree && existsSync(worktree)) {
      // The branch and its commit stay; only the temporary checkout goes away.
      git(['worktree', 'remove', '--force', worktree], { cwd: repoTop, allowFail: true });
      if (existsSync(worktree)) await rm(worktree, { recursive: true, force: true });
      git(['worktree', 'prune'], { cwd: repoTop, allowFail: true });
    } else if (created && keepWorktree) {
      log(`(kept ${WORKTREE_NAME}/ for inspection)`);
    }
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    console.log('Usage: node scripts/deploy-pages.mjs [--push] [--no-build] [--keep-worktree]');
    process.exit(0);
  }
  deploy({ push: args.has('--push'), doBuild: !args.has('--no-build'), keepWorktree: args.has('--keep-worktree') })
    .then((r) => process.exit(r.missingOrigin ? 1 : 0))
    .catch((err) => {
      console.error(`\n✖ ${err instanceof BuildError || err instanceof DeployError ? err.message : err.stack || err}`);
      process.exit(1);
    });
}
