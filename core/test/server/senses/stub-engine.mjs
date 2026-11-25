// A stand-in speech engine for the senses' unit tests: same interface as server/senses/engines.mjs, no
// libraries and no downloads. It runs inside the real engine process (server/senses/worker.mjs), so the
// tests cover the process, the queue, the deadlines and the idle unload for real. Behaviour comes from the
// options the test passes:
//   { delayMs, loadMs, failLoad: 'message', crashOnRun: true, abortOnRun: true, hangMs, writeFiles: true, text }

import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The nice value of every thread of this process (Linux), e.g. [10, 10, 10, …]. */
function threadNice() {
  try {
    return fs.readdirSync('/proc/self/task').map((tid) => {
      const stat = fs.readFileSync(`/proc/self/task/${tid}/stat`, 'utf8');
      return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[16]);
    });
  } catch {
    return null;
  }
}

export async function createEngine(kind, { repo, revision, files, cacheDir, onProgress, options = {} }) {
  const loadMs = options.loadMs ?? 20;
  if (options.failLoad) {
    await sleep(loadMs);
    throw new Error(options.failLoad);
  }
  // "Download": write each file at its catalog size, reporting progress, unless it is already there.
  if (options.writeFiles !== false) {
    const dir = path.join(cacheDir, ...repo.split('/'), revision);
    for (const [file, size] of files) {
      const p = path.join(dir, file);
      let have = -1;
      try {
        have = fs.statSync(p).size;
      } catch {
        have = -1;
      }
      if (have !== size) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const fd = fs.openSync(p, 'w');
        fs.ftruncateSync(fd, size); // sparse: costs no disk
        fs.closeSync(fd);
        onProgress?.({ file, loaded: Math.floor(size / 2), total: size });
        await sleep(loadMs / 2);
      }
      onProgress?.({ file, loaded: size, total: size });
    }
  }
  await sleep(loadMs);
  return {
    async warmUp() {},
    async run(input) {
      if (options.crashOnRun) process.exit(3);
      if (options.abortOnRun) process.abort(); // what a native crash inside onnxruntime looks like
      if (options.hangMs) await sleep(options.hangMs);
      await sleep(options.delayMs ?? 10);
      if (kind === 'hear') {
        const words = options.text ?? 'hello from the stub';
        return { text: `${words} (${input.audio.length} samples${input.prompt ? `; prompt: ${input.prompt}` : ''})`, threadNice: threadNice() };
      }
      const sentences = input.sentences ?? [input.text];
      const rate = 24000;
      const audio = new Float32Array(Math.round(rate * 0.25 * sentences.length));
      for (let i = 0; i < audio.length; i++) audio[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / rate);
      return { audio, sampleRate: rate, voice: input.voice, speed: input.speed };
    },
    async dispose() {},
  };
}
