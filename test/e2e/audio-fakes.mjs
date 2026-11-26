// Fake audio devices for the Microphone and speaker scenarios (v8.1, SPEC §28.2-§28.3). An init script added
// AFTER installFakeSpeech and installFakeMic (page.addInitScript(installAudioFakes, options)): it lists a Mac's
// microphones and speakers and a Bluetooth speakerphone, opens "their" tracks through the fake microphone
// (each track carries its device's label and id), and records what the app asked of them:
//
//   window.__audio.devices                       what enumerateDevices lists now (MediaDeviceInfo-like)
//   window.__audio.gets                          every getUserMedia: { deviceId ('' = none asked), ec, ns, agc,
//                                                device (the one opened, '' when it failed), at }
//   window.__audio.sinks                         every setSinkId: { kind: 'george' (the 24 kHz voice context) |
//                                                'context' (another AudioContext) | 'media' (<audio>), id }
//   window.__audio.recStarts                     every recognition.start: { track: bool, label, device }
//   window.__audio.enumerations                  how many times the devices were listed
//   window.__audio.setDevices(list)              plug or unplug: the list changes, tracks on a device that left
//                                                end (as Chrome does), and 'devicechange' fires
//   window.__audio.blip()                        a Bluetooth mode switch: ONE enumeration misses the speakerphone
//                                                (devicechange fires; nothing ends), the next one lists it again
//   window.__audio.failNext                      DOMException names: the next getUserMedia calls fail with them
//   window.__audio.permission                    'granted' | 'prompt' | 'denied' (navigator.permissions.query);
//                                                before 'granted' the list has no names or ids, as in Chrome
//   window.__audio.LISTS                         { mac, speakerphone }: the device sets the scenarios use
//
//   options: { permission = 'granted', speakerphone = true, defaultOutput = 'mac' | 'speakerphone',
//              oldChrome = false (a Chrome 134: no recognition.start(track)) }
// No brand anywhere: the speakerphone is "Desk Speakerphone (Bluetooth)", read from its label like any other.
export function installAudioFakes(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const dev = (kind, deviceId, label, groupId) => ({ kind, deviceId, label, groupId });
  const mac = [dev('audioinput', 'mac-mic', 'MacBook Pro Microphone (Built-in)', 'g-mac'), dev('audiooutput', 'mac-out', 'MacBook Pro Speakers (Built-in)', 'g-mac')];
  const speakerphone = [dev('audioinput', 'sp-mic', 'Desk Speakerphone (Bluetooth)', 'g-sp'), dev('audiooutput', 'sp-out', 'Desk Speakerphone (Bluetooth)', 'g-sp')];
  const A = {
    devices: [],
    gets: [],
    sinks: [],
    recStarts: [],
    enumerations: 0,
    failNext: [],
    permission: opts.permission || 'granted',
    defaultOutput: opts.defaultOutput === 'speakerphone' ? 'sp-out' : 'mac-out',
    LISTS: { mac, speakerphone },
    tracks: [], // { device, track }
    missing: null, // ids one enumeration leaves out (blip)
  };
  window.__audio = A;
  A.devices = opts.speakerphone === false ? mac.slice() : [...mac, ...speakerphone];

  const md = navigator.mediaDevices;
  if (!md) return;

  /** The list as Chrome gives it: the default entries first ("Default - …", id 'default'). */
  function listed() {
    A.enumerations += 1;
    const skip = A.missing;
    A.missing = null;
    const devices = A.devices.filter((d) => !(skip && skip.includes(d.deviceId)));
    if (A.permission !== 'granted') {
      // Before the microphone is allowed: one entry per kind, no names, no ids.
      return [dev('audioinput', '', '', ''), dev('audiooutput', '', '', '')];
    }
    const out = [];
    const defIn = devices.find((d) => d.kind === 'audioinput' && d.deviceId === 'mac-mic') || devices.find((d) => d.kind === 'audioinput');
    const defOut = devices.find((d) => d.kind === 'audiooutput' && d.deviceId === A.defaultOutput) || devices.find((d) => d.kind === 'audiooutput' && d.deviceId === 'mac-out') || devices.find((d) => d.kind === 'audiooutput');
    if (defIn) out.push(dev('audioinput', 'default', `Default - ${defIn.label}`, defIn.groupId));
    out.push(...devices.filter((d) => d.kind === 'audioinput'));
    if (defOut) out.push(dev('audiooutput', 'default', `Default - ${defOut.label}`, defOut.groupId));
    out.push(...devices.filter((d) => d.kind === 'audiooutput'));
    return out.map((d) => ({ ...d }));
  }
  md.enumerateDevices = async () => listed();

  const realGet = md.getUserMedia ? md.getUserMedia.bind(md) : null;
  md.getUserMedia = async (constraints) => {
    const audio = constraints && constraints.audio && typeof constraints.audio === 'object' ? constraints.audio : {};
    const want = audio.deviceId && typeof audio.deviceId === 'object' ? audio.deviceId.exact || audio.deviceId.ideal || '' : typeof audio.deviceId === 'string' ? audio.deviceId : '';
    const entry = { deviceId: want || '', ec: audio.echoCancellation, ns: audio.noiseSuppression, agc: audio.autoGainControl, device: '', at: Math.round(performance.now()) };
    A.gets.push(entry);
    if (A.failNext.length) throw new DOMException('The microphone failed (fake).', A.failNext.shift());
    if (A.permission === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
    const inputs = A.devices.filter((d) => d.kind === 'audioinput');
    const device = want ? inputs.find((d) => d.deviceId === want) : inputs.find((d) => d.deviceId === 'mac-mic') || inputs[0];
    if (!device) throw new DOMException('Requested device not found', want ? 'OverconstrainedError' : 'NotFoundError');
    if (!realGet) throw new DOMException('No microphone (fake)', 'NotFoundError');
    const stream = await realGet(constraints);
    A.permission = 'granted';
    entry.device = device.deviceId;
    for (const track of stream.getAudioTracks()) {
      Object.defineProperty(track, 'label', { value: device.label, configurable: true });
      const settings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...settings(), deviceId: device.deviceId, groupId: device.groupId });
      A.tracks.push({ device: device.deviceId, track });
    }
    return stream;
  };

  /** Plug or unplug: tracks on a device that left end (Chrome ends them), then 'devicechange'. */
  A.setDevices = (list) => {
    A.devices = list.slice();
    for (const t of A.tracks) {
      if (t.track.readyState === 'live' && !A.devices.some((d) => d.deviceId === t.device)) {
        t.track.stop();
        t.track.dispatchEvent(new Event('ended'));
      }
    }
    md.dispatchEvent(new Event('devicechange'));
  };
  /** A Bluetooth mode switch: one enumeration misses the speakerphone; nothing ends. */
  A.blip = () => {
    A.missing = speakerphone.map((d) => d.deviceId);
    md.dispatchEvent(new Event('devicechange'));
  };

  // setSinkId on every AudioContext (George's is the 24 kHz one) and on media elements: recorded, and
  // refused for a speaker that isn't listed, as Chrome does.
  const sinkFor = (kind) =>
    function setSinkId(id) {
      const k = typeof id === 'string' ? id : '';
      A.sinks.push({ kind: kind === 'context' && this.__voice ? 'george' : kind, id: k });
      if (k && !A.devices.some((d) => d.kind === 'audiooutput' && d.deviceId === k)) return Promise.reject(new DOMException('The speaker isn’t there (fake).', 'NotFoundError'));
      Object.defineProperty(this, 'sinkId', { value: k, configurable: true });
      return Promise.resolve();
    };
  const Real = window.AudioContext;
  if (Real) {
    class RecordedAudioContext extends Real {
      constructor(o) {
        super(o);
        this.__voice = !!o && o.sampleRate === 24000;
      }
    }
    RecordedAudioContext.prototype.setSinkId = sinkFor('context');
    window.AudioContext = RecordedAudioContext;
  }
  if (window.HTMLMediaElement) HTMLMediaElement.prototype.setSinkId = sinkFor('media');

  // The microphone permission, as navigator.permissions reports it.
  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (d) => (d && d.name === 'microphone' ? Promise.resolve({ state: A.permission, name: 'microphone', onchange: null, addEventListener() {}, removeEventListener() {} }) : query(d));
  }

  // A Chrome without recognition.start(track): it reports itself as Chrome 134.
  if (opts.oldChrome) {
    const ua = navigator.userAgent.replace(/Chrome\/\d+/, 'Chrome/134');
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
    Object.defineProperty(navigator, 'userAgentData', { value: { brands: [{ brand: 'Chromium', version: '134' }, { brand: 'Google Chrome', version: '134' }], mobile: false, platform: 'macOS' }, configurable: true });
  }

  // What the recognizer was started with (the fake recognizer itself ignores the track).
  const patch = () => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R || !R.prototype || R.prototype.__audioPatched) return;
    const start = R.prototype.start;
    R.prototype.start = function startWithTrack(track) {
      const info = { track: !!track, label: track ? track.label : '', device: track && track.getSettings ? track.getSettings().deviceId || '' : '' };
      A.recStarts.push(info);
      return start.apply(this, arguments);
    };
    R.prototype.__audioPatched = true;
  };
  patch();
  document.addEventListener('DOMContentLoaded', patch);
}
