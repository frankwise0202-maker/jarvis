// Optics cameras: friendly names for the cameras a browser lists, the order the camera picker
// shows them in, which camera to open (the owner's remembered choice), and what to do when a
// camera is plugged in or unplugged. Pure: no DOM, no media APIs (src/platform/camera.js feeds it).
//
//   describeCamera(device, { os, index })  one videoinput -> { id, groupId, label, name, detail,
//                                          facing: 'front'|'rear'|null, kind, known }
//   listCameras(devices, { os })           every videoinput, described, in picker order (names
//                                          made unique: "Logitech webcam (C920)")
//   defaultCamera(cameras, { os })         the camera to fall back to: the main back camera on a
//                                          phone, the built-in one on a computer
//   pickCamera(cameras, remembered, opts)  the remembered camera by device id, else by label, else
//                                          the default: { camera, by: 'id'|'label'|'default' } | null
//   hotplugPlan({ before, after, currentId, remembered, os })
//                                          after a devicechange: { action: 'none'|'switch'|'fallback',
//                                          to?, gone?, added: [], removed: [] }
//   cameraLabelKey(label)                  a label without the USB "(046d:085e)" suffix, lower case
//   isPhoneOs(os)
//
// `os` is parseUserAgent's ('ios', 'android', 'mac', 'windows', 'chromeos', 'linux', 'other').
// Labels are empty until the owner has allowed the camera once; ids may be empty then too (Safari).
//
// Friendly names, from the labels browsers really use:
//   Mac (Chrome adds the USB ids):  "FaceTime HD Camera", "MacBook Pro Camera (0000:0001)",
//     "FaceTime HD Camera (Built-in)" -> "MacBook camera"; "Logitech BRIO (046d:085e)",
//     "HD Pro Webcam C920 (046d:082d)" -> "Logitech webcam"; "Tony's iPhone Camera" -> "iPhone
//     (Continuity Camera)"; "… Desk View Camera" -> "Desk View"; "Studio Display Camera" -> "Studio
//     Display camera"; "OBS Virtual Camera" stays as it is (detail: virtual camera)
//   iPhone (Safari): "Back Camera" -> "Back", "Back Ultra Wide Camera" -> "Back Ultra Wide",
//     "Back Telephoto Camera" -> "Back Telephoto", "Front Camera" -> "Front" (also Dual, Dual Wide,
//     Triple: Safari's lens-switching cameras)
//   Android (Chrome): "camera2 0, facing back" -> "Back camera", "camera2 1, facing front" -> "Front camera"
//   Windows: "Integrated Camera", "HP TrueVision HD Camera" -> "Built-in camera"

const USB_ID = /\s*\(([0-9a-f]{4}):([0-9a-f]{4})\)\s*$/i;
const LOGITECH_VENDOR = '046d';
const APPLE_VENDOR = '05ac';

export function isPhoneOs(os) {
  return os === 'ios' || os === 'android';
}

/** A label without the USB "(vendor:product)" suffix and extra spaces, lower case. */
export function cameraLabelKey(label) {
  return String(label || '')
    .replace(USB_ID, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function clean(label) {
  return String(label || '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .replace(USB_ID, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// iPhone and iPad (Safari): the back lenses in the order the picker lists them.
const IOS_LENSES = [
  [/^back camera$/i, 'Back', 0],
  [/^back ultra wide camera$/i, 'Back Ultra Wide', 1],
  [/^back telephoto camera$/i, 'Back Telephoto', 2],
  [/^back dual wide camera$/i, 'Back Dual Wide', 3],
  [/^back dual camera$/i, 'Back Dual', 4],
  [/^back triple camera$/i, 'Back Triple', 5],
  [/^back truedepth camera$/i, 'Back TrueDepth', 6],
  [/^front camera$/i, 'Front', 10],
  [/^front truedepth camera$/i, 'Front TrueDepth', 11],
  [/^front ultra wide camera$/i, 'Front Ultra Wide', 12],
];

/**
 * One videoinput (a MediaDeviceInfo or a plain { deviceId, groupId, label, facing? }) as the picker
 * shows it. `facing` may come from InputDeviceInfo.getCapabilities().facingMode (the caller
 * passes it in when the browser has it). `index`: its position in the browser's list (for "Camera 2").
 */
export function describeCamera(device, { os = 'other', index = 0 } = {}) {
  const d = device && typeof device === 'object' ? device : {};
  const id = typeof d.deviceId === 'string' ? d.deviceId : '';
  const groupId = typeof d.groupId === 'string' ? d.groupId : '';
  const label = typeof d.label === 'string' ? d.label.trim().slice(0, 200) : '';
  const base = clean(label);
  const usb = USB_ID.exec(label);
  const vendor = usb ? usb[1].toLowerCase() : '';
  const facingHint = d.facing === 'user' || d.facing === 'front' ? 'front' : d.facing === 'environment' || d.facing === 'rear' ? 'rear' : null;
  const out = { id, groupId, label, name: '', detail: '', facing: facingHint, kind: 'other', known: false, order: 50 };

  if (!base) {
    out.name = `Camera ${index + 1}`;
    if (out.facing === 'front') out.name = 'Front camera';
    else if (out.facing === 'rear') out.name = 'Back camera';
    return out;
  }

  // iPhone / iPad lenses (Safari's English labels).
  for (const [re, name, order] of IOS_LENSES) {
    if (re.test(base)) {
      return { ...out, name, detail: '', facing: name.startsWith('Front') ? 'front' : 'rear', kind: 'lens', known: true, order };
    }
  }
  // Android Chrome: "camera2 1, facing front".
  const android = /^camera\d*\s+(\d+),\s*facing\s+(front|back)$/i.exec(base);
  if (android) {
    const front = android[2].toLowerCase() === 'front';
    return { ...out, name: front ? 'Front camera' : 'Back camera', detail: '', facing: front ? 'front' : 'rear', kind: 'lens', known: true, order: front ? 10 : 0 };
  }
  // Generic phone wording ("Front camera", "Rear camera", "Back camera 2").
  if (isPhoneOs(os)) {
    const m = /^(front|back|rear)\b/i.exec(base);
    if (m) {
      const front = m[1].toLowerCase() === 'front';
      return { ...out, name: base, facing: front ? 'front' : 'rear', kind: 'lens', known: true, order: front ? 10 : 1 };
    }
  }

  // Computers.
  if (/desk view/i.test(base)) return { ...out, name: 'Desk View', detail: 'iPhone desk camera', kind: 'continuity', known: true, order: 30 };
  if (/\biphone\b/i.test(base)) return { ...out, name: 'iPhone (Continuity Camera)', detail: base, kind: 'continuity', known: true, order: 29 };
  if (/studio display/i.test(base)) return { ...out, name: 'Studio Display camera', detail: '', kind: 'display', known: true, order: 5 };
  if (vendor === LOGITECH_VENDOR || /\blogi(tech)?\b/i.test(base) || /^logi /i.test(base)) {
    const model = base.replace(/\blogitech\b|\blogi\b/gi, '').replace(/\s+/g, ' ').trim();
    return { ...out, name: 'Logitech webcam', detail: model || 'USB webcam', kind: 'usb', known: true, order: 20 };
  }
  if (/facetime|macbook|imac/i.test(base) || vendor === APPLE_VENDOR) {
    return { ...out, name: os === 'mac' || /macbook/i.test(base) ? 'MacBook camera' : 'Built-in camera', detail: base, kind: 'builtin', known: true, order: 0 };
  }
  if (/integrated (camera|webcam)|built-?in|truevision|^hd (web)?cam(era)?$|^front camera$/i.test(base)) {
    return { ...out, name: 'Built-in camera', detail: base, kind: 'builtin', known: true, order: 1 };
  }
  if (/\b(virtual|obs|snap camera|manycam|xsplit|mmhmm|camo|nvidia broadcast)\b/i.test(base)) {
    return { ...out, name: base, detail: 'Virtual camera', kind: 'virtual', known: true, order: 40 };
  }
  if (usb) return { ...out, name: base, detail: 'USB camera', kind: 'usb', known: true, order: 21 };
  return { ...out, name: base, detail: '', kind: 'other', known: false, order: 50 };
}

/** Every videoinput, described and sorted for the picker; duplicate names get their model or a number. */
export function listCameras(devices, { os = 'other' } = {}) {
  const list = (Array.isArray(devices) ? devices : [])
    .filter((d) => d && (d.kind === undefined || d.kind === 'videoinput'))
    .map((d, index) => ({ ...describeCamera(d, { os, index }), index }));
  // The same device listed twice (some browsers before permission): keep the first.
  const seen = new Set();
  const unique = list.filter((c) => {
    const key = c.id || `#${c.index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.order - b.order || a.index - b.index);
  const counts = new Map();
  for (const c of unique) counts.set(c.name, (counts.get(c.name) || 0) + 1);
  const numbered = new Map();
  for (const c of unique) {
    if (counts.get(c.name) < 2) continue;
    const n = (numbered.get(c.name) || 0) + 1;
    numbered.set(c.name, n);
    // "Logitech webcam (C920)" when the models differ, else "Logitech webcam 2".
    const model = c.detail && c.detail !== 'USB webcam' && c.detail !== c.name ? c.detail : '';
    c.name = model && unique.filter((x) => x.detail === model).length < 2 ? `${c.name} (${model})` : n === 1 ? c.name : `${c.name} ${n}`;
  }
  return unique.map(({ order, index, ...c }) => c);
}

/** The camera to fall back to: the main back camera on a phone, the built-in one on a computer. */
export function defaultCamera(cameras, { os = 'other' } = {}) {
  const list = Array.isArray(cameras) ? cameras : [];
  if (!list.length) return null;
  if (isPhoneOs(os)) return list.find((c) => c.facing === 'rear') || list[0];
  return list.find((c) => c.kind === 'builtin') || list.find((c) => c.kind === 'display') || list[0];
}

/**
 * The camera to open: the remembered one by device id, else by label (ids change when the owner
 * clears site data, and between browsers), else the default. Null when there is no camera.
 * `remembered`: { id, label } | null.
 */
export function pickCamera(cameras, remembered, { os = 'other' } = {}) {
  const list = Array.isArray(cameras) ? cameras : [];
  if (!list.length) return null;
  const r = remembered && typeof remembered === 'object' ? remembered : null;
  if (r && r.id) {
    const byId = list.find((c) => c.id && c.id === r.id);
    if (byId) return { camera: byId, by: 'id' };
  }
  if (r && r.label) {
    const key = cameraLabelKey(r.label);
    const byLabel = key && list.find((c) => c.label && cameraLabelKey(c.label) === key);
    if (byLabel) return { camera: byLabel, by: 'label' };
  }
  const camera = defaultCamera(list, { os });
  return camera ? { camera, by: 'default' } : null;
}

const sameCamera = (a, b) => !!a && !!b && ((a.id && b.id && a.id === b.id) || (!a.id && !b.id && a.label && a.label === b.label));

/**
 * What to do after the camera list changed (devicechange, or the camera in use stopped):
 *   'fallback'  the camera in use is gone (unplugged): open `to` (the remembered camera if it is
 *               still there, else the default) and tell the owner which one went away (`gone`)
 *   'switch'    the remembered camera has just been plugged in and another one is in use: open it
 *   'none'      nothing to do (the picker still shows `added` / `removed`)
 * `before` / `after`: listCameras() results; `currentId`: the device id in use ('' when none).
 */
export function hotplugPlan({ before = [], after = [], currentId = '', remembered = null, os = 'other' } = {}) {
  const added = after.filter((c) => !before.some((b) => sameCamera(b, c)));
  const removed = before.filter((c) => !after.some((a) => sameCamera(a, c)));
  const current = currentId ? before.find((c) => c.id === currentId) || after.find((c) => c.id === currentId) || null : null;
  const stillThere = !!currentId && after.some((c) => c.id === currentId);
  if (currentId && !stillThere) {
    const pick = pickCamera(after.filter((c) => c.id !== currentId), remembered, { os });
    return { action: pick ? 'fallback' : 'none', to: pick ? pick.camera : null, gone: current, added, removed };
  }
  if (remembered && added.length) {
    const pick = pickCamera(added, remembered, { os });
    if (pick && pick.by !== 'default' && pick.camera.id !== currentId) return { action: 'switch', to: pick.camera, added, removed };
  }
  return { action: 'none', added, removed };
}
