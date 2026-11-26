// Fakes for the Standby unit tests (not a test file itself).
//
//   createFakeLocks()   a LockManager with the Web Locks rules, shared by several "windows":
//                       locks.as('A').request(name, options, callback) as navigator.locks in window A.
//                       Exclusive (one holder) and shared (any number of holders) modes, a FIFO line,
//                       ifAvailable (the callback gets null when it can't be granted at once), an AbortSignal
//                       that withdraws a waiting request (AbortError), and steal (the holders' requests then
//                       fail with AbortError). locks.holder(name) (the first holder), locks.holders(name),
//                       locks.waiting(name); locks.close('A'): window A goes away (a closed tab: its locks are
//                       let go and its requests dropped, and nothing more runs in it).

const abortError = (message) => Object.assign(new Error(message), { name: 'AbortError' });

export function createFakeLocks() {
  const held = new Map(); // name -> [{ entry, mode, gone }]
  const lines = new Map(); // name -> [entry]
  const closed = new Set(); // windows that went away
  const holding = (name) => held.get(name) || held.set(name, []).get(name);
  const line = (name) => lines.get(name) || lines.set(name, []).get(name);
  const fits = (name, mode) => {
    const h = holding(name);
    return h.length === 0 || (mode === 'shared' && h.every((x) => x.mode === 'shared'));
  };
  function grant(name, entry) {
    const h = { entry, mode: entry.mode, gone: false };
    holding(name).push(h);
    Promise.resolve()
      .then(() => (closed.has(entry.who) ? new Promise(() => {}) : entry.cb({ name, mode: entry.mode })))
      .then(
        (v) => {
          if (h.gone) return;
          free(name, h);
          entry.resolve(v);
        },
        (e) => {
          if (h.gone) return;
          free(name, h);
          entry.reject(e);
        },
      );
  }
  function free(name, h) {
    const list = holding(name);
    const i = list.indexOf(h);
    if (i < 0) return;
    list.splice(i, 1);
    pump(name);
  }
  function pump(name) {
    const q = line(name);
    while (q.length && fits(name, q[0].mode)) grant(name, q.shift());
  }
  return {
    holder: (name) => (holding(name).length ? holding(name)[0].entry.who : null),
    holders: (name) => holding(name).map((h) => h.entry.who),
    waiting: (name) => line(name).map((e) => e.who),
    close(who) {
      closed.add(who);
      for (const [name, list] of held) {
        for (const h of list.filter((x) => x.entry.who === who)) {
          h.gone = true;
          list.splice(list.indexOf(h), 1);
        }
        const q = line(name);
        for (let i = q.length - 1; i >= 0; i--) if (q[i].who === who) q.splice(i, 1);
        pump(name);
      }
    },
    as(who) {
      return {
        request(name, options, cb) {
          if (typeof options === 'function') {
            cb = options;
            options = {};
          }
          const mode = options.mode === 'shared' ? 'shared' : 'exclusive';
          return new Promise((resolve, reject) => {
            const entry = { cb, resolve, reject, who, mode };
            if (options.steal) {
              for (const h of holding(name).splice(0)) {
                h.gone = true;
                h.entry.reject(abortError('Lock broken by another request with the steal option.'));
              }
              grant(name, entry);
              return;
            }
            if (options.ifAvailable) {
              if (!fits(name, mode) || line(name).length) {
                Promise.resolve()
                  .then(() => cb(null))
                  .then(resolve, reject);
                return;
              }
              grant(name, entry);
              return;
            }
            if (options.signal) {
              if (options.signal.aborted) {
                reject(abortError('aborted'));
                return;
              }
              options.signal.addEventListener('abort', () => {
                const q = line(name);
                const i = q.indexOf(entry);
                if (i >= 0) {
                  q.splice(i, 1);
                  reject(abortError('aborted'));
                }
              });
            }
            if (!line(name).length && fits(name, mode)) grant(name, entry);
            else line(name).push(entry);
          });
        },
      };
    },
  };
}
