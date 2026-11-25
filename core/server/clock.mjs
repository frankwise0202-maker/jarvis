// Clocks. now() is the epoch time stamped on samples; mono() is a monotonic clock in ms for rates.
//
//   real    the wall clock (live machine)
//   scaled  fixture mode: starts at startMs and runs `scale` times faster than real time
//   manual  tests and fast simulations: time moves only when told to

export function createRealClock() {
  return { kind: 'real', scale: 1, now: () => Date.now(), mono: () => performance.now() };
}

export function createScaledClock({ startMs = Date.now(), scale = 1 } = {}) {
  const r0 = performance.now();
  const now = () => startMs + (performance.now() - r0) * scale;
  return { kind: 'scaled', scale, startMs, now, mono: now };
}

export function createManualClock(startMs = Date.now()) {
  let t = startMs;
  return {
    kind: 'manual',
    scale: 1,
    now: () => t,
    mono: () => t,
    set(v) {
      t = v;
    },
    advance(ms) {
      t += ms;
    },
  };
}
