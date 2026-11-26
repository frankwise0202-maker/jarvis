// The lines Jarvis says before the wake greeting (v8.1, SPEC §28.1; lead decision D3): the one hook for
// anything that waited for the owner while Jarvis was on Standby. app.js holds one instance; the wake
// routine (Voice Mode's greetWake, through wake.pending()) asks it at each wake, two claps or "Hey Jarvis".
//
//   const pending = createWakePending();
//   const remove = pending.add(fn, { waits = false })
//       fn() -> string | null   asked at each wake: a line to say now, or null (nothing now). It never throws
//                               out (a failing fn counts as null). Keep it short: one sentence.
//       waits                   the line asks something and waits for the owner's answer ("Chrome is waiting
//                               for you: …"): such lines come first
//   pending.lines() -> string[] the lines now: those that wait first, then the others, each group in the
//                               order added; empty ones are left out
//
// Who registers (D3): chrome-voice, { waits: true }, "Chrome is waiting for you: …"; mac-dev, "I'm on the
// Mac's speakers; the speakerphone isn't connected.". They are said in that order, then the greeting.

const MAX_LINE = 240; // characters: a line is a sentence or two

export function createWakePending() {
  const entries = []; // { fn, waits }
  return {
    add(fn, { waits = false } = {}) {
      if (typeof fn !== 'function') return () => {};
      const entry = { fn, waits: waits === true };
      entries.push(entry);
      return () => {
        const i = entries.indexOf(entry);
        if (i >= 0) entries.splice(i, 1);
      };
    },
    lines() {
      const out = [];
      for (const group of [true, false]) {
        for (const e of entries) {
          if (e.waits !== group) continue;
          let v = null;
          try {
            v = e.fn();
          } catch {
            v = null;
          }
          const line = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE) : '';
          if (line) out.push(line);
        }
      }
      return out;
    },
  };
}
