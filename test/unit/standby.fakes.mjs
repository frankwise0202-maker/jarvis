// Fakes for the Standby unit tests (not a test file itself).
//
//   createFakeLocks()   a LockManager with the Web Locks rules, shared by several "windows":
//                       locks.as('A').request(name, options, callback) as navigator.locks in window A.
//                       One holder per name, a FIFO line, ifAvailable (the callback gets null when it is
//                       taken), an AbortSignal that withdraws a waiting request (AbortError), and steal (the
//                       holder's request then fails with AbortError). locks.holder(name), locks.waiting(name).

const abortError = (message) => Object.assign(new Error(message), { name: 'AbortError' });

export function createFakeLocks() {
  const held = new Map(); // name -> { entry, stolen }
  const lines = new Map(); // name -> [entry]
  const line = (name) => lines.get(name) || lines.set(name, []).get(name);
  function grant(name, entry) {
    const h = { entry, stolen: false };
    held.set(name, h);
    Promise.resolve()
      .then(() => entry.cb({ name, mode: 'exclusive' }))
      .then(
        (v) => {
          if (h.stolen) return;
          free(name, h);
          entry.resolve(v);
        },
        (e) => {
          if (h.stolen) return;
          free(name, h);
          entry.reject(e);
        },
      );
  }
  function free(name, h) {
    if (held.get(name) !== h) return;
    held.delete(name);
    const next = line(name).shift();
    if (next) grant(name, next);
  }
  return {
    holder: (name) => (held.get(name) ? held.get(name).entry.who : null),
    waiting: (name) => line(name).map((e) => e.who),
    as(who) {
      return {
        request(name, options, cb) {
          return new Promise((resolve, reject) => {
            const entry = { cb, resolve, reject, who };
            if (options.steal) {
              const h = held.get(name);
              if (h) {
                h.stolen = true;
                held.delete(name);
                h.entry.reject(abortError('Lock broken by another request with the steal option.'));
              }
              grant(name, entry);
              return;
            }
            if (options.ifAvailable) {
              if (held.has(name) || line(name).length) {
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
            if (!held.has(name)) grant(name, entry);
            else line(name).push(entry);
          });
        },
      };
    },
  };
}
