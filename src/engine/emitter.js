// Tiny synchronous event emitter. Listener errors are contained so a UI bug can never break a run.

export function createEmitter() {
  const listeners = new Map(); // type -> Set<fn>

  function on(type, fn) {
    if (typeof fn !== 'function') throw new TypeError('listener must be a function');
    let set = listeners.get(type);
    if (!set) listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  /**
   * Calls `type` listeners, then '*' listeners, each as fn(payload, type). The payload also
   * carries `type`, so a wildcard listener can switch on `event.type`.
   */
  function emit(type, payload = {}) {
    const event = { ...payload, type };
    for (const key of [type, '*']) {
      const set = listeners.get(key);
      if (!set || set.size === 0) continue;
      for (const fn of [...set]) {
        try {
          fn(event, type);
        } catch (err) {
          console.error(`[jarvis] "${type}" listener failed:`, err);
        }
      }
    }
  }

  function clear() {
    listeners.clear();
  }

  return { on, emit, clear };
}
