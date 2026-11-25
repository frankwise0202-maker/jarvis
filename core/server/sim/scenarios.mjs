// Fixture scenarios for the simulated Alienware (JARVIS_CORE_FIXTURE=ok|warn|alert|nogpu|offline).
// Times are seconds relative to the simulation's start ("now" when the Core started); negative is the past.
// Effects ramp in over `rampSec`, so the 7-day history before them is normal and "hotter than usual?"
// has an honest answer.

const base = {
  label: 'All systems normal',
  cpuTempBase: 40, // °C at idle
  cpuTempPerPct: 0.42, // °C per percent of total CPU
  cpuHot: null, // { offset, start, rampSec }: extra °C (poor cooling)
  gpu: 'ok', // 'ok' | 'missing'
  gpuLoad: null, // { util, memMB, start }
  memUsedGiB: 5.1,
  memPressure: null, // { availablePct, swapPct, start }
  rootUsedPct: 47.3,
  rootGrowthPctPerWeek: 0.6,
  internet: 'up', // 'up' | 'down'
  api: 'up', // 'up' | 'down'
  site: 'up',
  tailscale: 'running', // 'running' | 'logged-out' | 'not-installed'
  peers: { iphone: 'online', mac: { offlineSinceSec: 47 * 60 } },
  smart: 'passed', // 'passed' | 'reallocated' | 'failing' | 'denied'
  procs: {}, // pid → override { threadPct, rssMB, start }
  extraProcs: [], // additional processes
  incidents: [{ kind: 'gpu-hot', start: -35 * 60, dur: 4 * 60 }],
};

export const SCENARIOS = {
  ok: base,
  warn: {
    ...base,
    label: 'Warnings: CPU running hot, disk filling up, a runaway process',
    cpuHot: { offset: 37, start: -30 * 60, rampSec: 8 * 60 },
    rootUsedPct: 88.4,
    rootGrowthPctPerWeek: 3,
    smart: 'reallocated',
    procs: { 1499: { threadPct: 99, start: -22 * 60 } }, // GNOME's file indexer stuck at a full thread
    incidents: [],
  },
  alert: {
    ...base,
    label: 'Alerts: overheating, out of memory, disk full, Claude API unreachable',
    cpuHot: { offset: 14, start: -40 * 60, rampSec: 6 * 60 },
    gpuLoad: { util: 97, memMB: 3650, start: -40 * 60 },
    memPressure: { availablePct: 4, swapPct: 72, start: -38 * 60 },
    rootUsedPct: 96.2,
    rootGrowthPctPerWeek: 4,
    api: 'down',
    extraProcs: [
      {
        pid: 3310,
        comm: 'ffmpeg',
        ppid: 2050,
        threads: 16,
        threadPct: 690,
        rssMB: 2600,
        start: -40 * 60,
        cmd: 'ffmpeg -i /home/owner/Videos/holiday-4k.mov -c:v libx265 -preset slow /home/owner/Videos/holiday.mkv',
      },
    ],
    procs: { 1771: { rssMB: 4300 }, 88: { threadPct: 24, start: -38 * 60 } },
    incidents: [],
  },
  nogpu: {
    ...base,
    label: 'The NVIDIA driver is not installed',
    gpu: 'missing',
    smart: 'denied',
    incidents: [],
  },
  offline: {
    ...base,
    label: 'The internet is down',
    internet: 'down',
    api: 'down',
    site: 'down',
    peers: { iphone: { offlineSinceSec: 6 * 60 }, mac: { offlineSinceSec: 2 * 3600 } },
    incidents: [],
    offlineSince: -9 * 60,
  },
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS);
