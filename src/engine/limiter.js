// Async semaphore with a capacity that can change at runtime (adaptive slow-down on rate limits).
// Lowering the capacity never preempts running holders; it only delays new admissions.

import { abortError } from './util.js';

const norm = (n) => Math.max(1, Math.floor(Number(n)) || 1);

export function createLimiter(initialCapacity = 4) {
  let capacity = norm(initialCapacity);
  let active = 0;
  let peak = 0;
  const queue = []; // FIFO of waiters

  function grant() {
    active++;
    if (active > peak) peak = active;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
      pump();
    };
  }

  function pump() {
    while (active < capacity && queue.length) {
      const waiter = queue.shift();
      waiter.detach();
      waiter.resolve(grant());
    }
  }

  /** Resolves with an idempotent `release()` once a slot is free; rejects (AbortError) if `signal` aborts first. */
  function acquire(signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    if (active < capacity && queue.length === 0) return Promise.resolve(grant());
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, detach: () => {} };
      if (signal) {
        const onAbort = () => {
          const idx = queue.indexOf(waiter);
          if (idx >= 0) queue.splice(idx, 1);
          reject(abortError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
        waiter.detach = () => signal.removeEventListener('abort', onAbort);
      }
      queue.push(waiter);
    });
  }

  return {
    acquire,
    get capacity() {
      return capacity;
    },
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
    /** Highest number of simultaneous holders seen (diagnostics/tests). */
    get peak() {
      return peak;
    },
    isIdle() {
      return active === 0 && queue.length === 0;
    },
    setCapacity(n) {
      capacity = norm(n);
      pump();
      return capacity;
    },
    /** Lower capacity by one (minimum 1); returns the new capacity. */
    reduce() {
      capacity = Math.max(1, capacity - 1);
      return capacity;
    },
  };
}
