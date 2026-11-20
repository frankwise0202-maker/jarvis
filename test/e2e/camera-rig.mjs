// A camera rig for the Optics E2E scenarios: several cameras with real-world labels ("FaceTime
// HD Camera (Built-in) (05ac:8514)", "Logitech BRIO (046d:085e)", "Front Camera") and facing modes,
// all fed by Chromium's one fake camera (--use-fake-device-for-media-stream with a Y4M file gives a
// single device). It answers facingMode and deviceId constraints the way a phone or a Mac does,
// reports each camera's own deviceId and facingMode on its track, and plugs cameras in and out (a
// devicechange event; the unplugged camera's track ends).
//
//   await page.context().addInitScript(installCameraRig, { devices, present })
//     devices: [{ label, facing?: 'user'|'environment' }]   present: indexes plugged in at the start
//   In the page: window.__cameraRig.plug(i) / .unplug(i) / .unplugEndsFirst(i, ms) / .ids() / .live() /
//   .opened (log). unplug: the list changes, then the track ends; unplugEndsFirst: the other order.
//
// The app sees only standard APIs (enumerateDevices, getUserMedia, track events), so this tests the
// real picker, hot-plug and flip code. It runs before the app's scripts (an init script).

export function installCameraRig({ devices = [], present = null } = {}) {
  const md = navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== 'function') return;
  const rig = {
    present: new Set(Array.isArray(present) ? present : devices.map((_, i) => i)),
    allowed: false, // labels and ids appear once a camera has been opened, like the real thing
    tracks: [], // { index, track }
    opened: [], // { index, how: 'deviceId'|'facingMode'|'default', at }
  };
  window.__cameraRig = rig;
  const origEnum = md.enumerateDevices.bind(md);
  const origGum = md.getUserMedia.bind(md);
  const idOf = (index) => `rig-camera-${index}-${(index * 2654435761 >>> 0).toString(16)}`;

  md.enumerateDevices = async () => {
    const list = await origEnum();
    const others = list.filter((d) => d.kind !== 'videoinput');
    const cams = devices
      .map((spec, index) => ({ spec, index }))
      .filter((x) => rig.present.has(x.index))
      .map(({ spec, index }) => ({
        deviceId: rig.allowed ? idOf(index) : '',
        groupId: rig.allowed ? `rig-group-${index}` : '',
        kind: 'videoinput',
        label: rig.allowed ? spec.label : '',
        getCapabilities: () => ({ facingMode: spec.facing ? [spec.facing] : [] }),
        toJSON() {
          return { deviceId: this.deviceId, groupId: this.groupId, kind: this.kind, label: this.label };
        },
      }));
    // Before the camera is allowed a browser shows at most one camera, with no id or label.
    return [...others, ...(rig.allowed ? cams : cams.slice(0, 1))];
  };

  const overconstrained = (what) => Object.assign(new DOMException(`No camera satisfies ${what}`, 'OverconstrainedError'), { constraint: what });
  const wanted = (c) => (c && typeof c === 'object' ? c.exact || c.ideal || null : typeof c === 'string' ? c : null);

  md.getUserMedia = async (constraints) => {
    const v = constraints && constraints.video;
    if (!v) return origGum(constraints);
    const c = typeof v === 'object' ? { ...v } : {};
    const facing = wanted(c.facingMode);
    const exactFacing = !!(c.facingMode && typeof c.facingMode === 'object' && c.facingMode.exact);
    const id = wanted(c.deviceId);
    const exactId = !!(c.deviceId && typeof c.deviceId === 'object' && c.deviceId.exact);
    delete c.facingMode;
    delete c.deviceId;
    const here = devices.map((spec, index) => ({ spec, index })).filter((x) => rig.present.has(x.index));
    let pick = null;
    let how = 'default';
    if (id) {
      pick = here.find((x) => idOf(x.index) === id) || null;
      if (!pick && exactId) throw overconstrained('deviceId');
      if (pick) how = 'deviceId';
    }
    if (!pick && facing) {
      pick = here.find((x) => x.spec.facing === facing) || null;
      if (!pick && exactFacing) throw overconstrained('facingMode');
      if (pick) how = 'facingMode';
    }
    if (!pick) pick = here[0] || null;
    if (!pick) throw new DOMException('Requested device not found', 'NotFoundError');
    const stream = await origGum({ ...constraints, video: c });
    rig.allowed = true;
    const { spec, index } = pick;
    for (const t of stream.getVideoTracks()) {
      const orig = t.getSettings.bind(t);
      t.getSettings = () => ({ ...orig(), deviceId: idOf(index), groupId: `rig-group-${index}`, ...(spec.facing ? { facingMode: spec.facing } : {}) });
      Object.defineProperty(t, 'label', { value: spec.label, configurable: true });
      rig.tracks.push({ index, track: t });
    }
    rig.opened.push({ index, how, at: Date.now() });
    return stream;
  };

  rig.plug = (index) => {
    rig.present.add(index);
    md.dispatchEvent(new Event('devicechange'));
  };
  rig.unplug = (index) => {
    rig.present.delete(index);
    // The camera's track ends (as when a USB camera is pulled out), then the list changes.
    for (const x of rig.tracks) {
      if (x.index !== index || x.track.readyState !== 'live') continue;
      x.track.stop();
      x.track.dispatchEvent(new Event('ended'));
    }
    md.dispatchEvent(new Event('devicechange'));
  };
  // The other order Chrome may use: the track ends first, and the list drops the camera `delayMs` later.
  rig.unplugEndsFirst = (index, delayMs = 400) => {
    for (const x of rig.tracks) {
      if (x.index !== index || x.track.readyState !== 'live') continue;
      x.track.stop();
      x.track.dispatchEvent(new Event('ended'));
    }
    setTimeout(() => {
      rig.present.delete(index);
      md.dispatchEvent(new Event('devicechange'));
    }, delayMs);
  };
  rig.ids = () => devices.map((_, i) => idOf(i));
  rig.live = () => rig.tracks.filter((x) => x.track.readyState === 'live').map((x) => x.index);
}
