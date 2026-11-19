// Screens (v7): where a screen goes (src/lib/screen-placement.js), decided from stubbed browser
// objects: Chrome on a Mac with and without a second monitor, the Window Management permission
// states, Safari, Firefox, iPhone and Android, and the monitor picked for "screen 2".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectScreenEnv, orderScreens, pickTargetScreen, placementNote, planPlacement, rightHalf, screenWindowFeatures } from '../../src/lib/screen-placement.js';

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.1; rv:145.0) Gecko/20100101 Firefox/145.0',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
};

function stubWindow({ ua = UA.chromeMac, wm = true, pip = true, touch = 0, platform = 'MacIntel', isExtended = undefined, standalone = false } = {}) {
  return {
    navigator: { userAgent: ua, platform, maxTouchPoints: touch },
    open: () => null,
    matchMedia: (q) => ({ matches: standalone && /standalone/.test(q) }),
    screen: { width: 1440, height: 900, availWidth: 1440, availHeight: 875, availLeft: 0, availTop: 25, ...(isExtended === undefined ? {} : { isExtended }) },
    ...(wm ? { getScreenDetails: async () => ({}) } : {}),
    ...(pip ? { documentPictureInPicture: { requestWindow: async () => ({}) } } : {}),
  };
}

const LAPTOP = { left: 0, top: 0, width: 1440, height: 900, availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875, isPrimary: true, isInternal: true, label: 'Built-in Retina Display' };
const DELL = { left: 1440, top: 0, width: 2560, height: 1440, availLeft: 1440, availTop: 0, availWidth: 2560, availHeight: 1415, isPrimary: false, isInternal: false, label: 'DELL U2720Q' };
const LG = { left: -1920, top: 0, width: 1920, height: 1080, availLeft: -1920, availTop: 0, availWidth: 1920, availHeight: 1055, isPrimary: false, isInternal: false, label: 'LG HDR' };

test('environment: Chrome on a Mac, Safari, Firefox, iPhone, iPad, Android', () => {
  const chrome = detectScreenEnv(stubWindow({ isExtended: true }));
  assert.deepEqual([chrome.windowManagement, chrome.pip, chrome.popups, chrome.mobile, chrome.safari, chrome.extended], [true, true, true, false, false, true]);
  const safari = detectScreenEnv(stubWindow({ ua: UA.safariMac, wm: false, pip: false }));
  assert.deepEqual([safari.windowManagement, safari.pip, safari.popups, safari.mobile, safari.safari, safari.extended], [false, false, true, false, true, null]);
  const ff = detectScreenEnv(stubWindow({ ua: UA.firefox, wm: false, pip: false }));
  assert.deepEqual([ff.windowManagement, ff.pip, ff.popups, ff.safari], [false, false, true, false]);
  const iphone = detectScreenEnv(stubWindow({ ua: UA.iphone, wm: false, pip: false, touch: 5, platform: 'iPhone', standalone: true }));
  assert.deepEqual([iphone.mobile, iphone.ios, iphone.popups, iphone.standalone], [true, true, false, true]);
  const ipad = detectScreenEnv(stubWindow({ ua: UA.ipad, wm: false, pip: false, touch: 5 }));
  assert.deepEqual([ipad.mobile, ipad.ios], [true, true], 'iPadOS reports a Mac user agent; touch points give it away');
  const android = detectScreenEnv(stubWindow({ ua: UA.android, wm: true, pip: true, touch: 5, platform: 'Linux armv8l' }));
  assert.deepEqual([android.mobile, android.windowManagement, android.pip, android.popups], [true, false, false, false], 'phones never get windows or panels');
});

test('screens are numbered primary first, then left to right', () => {
  assert.deepEqual(orderScreens([DELL, LG, LAPTOP]).map((s) => s.label), ['Built-in Retina Display', 'LG HDR', 'DELL U2720Q']);
  assert.deepEqual(orderScreens(null), []);
});

test('the other screen: an external monitor when Jarvis is on the laptop, and the other way round', () => {
  let pick = pickTargetScreen({ screens: [LAPTOP, DELL], currentScreen: LAPTOP });
  assert.deepEqual([pick.label, pick.name, pick.same, pick.internal], ['SCREEN 2', 'DELL U2720Q', false, false]);
  pick = pickTargetScreen({ screens: [LAPTOP, DELL], currentScreen: DELL });
  assert.deepEqual([pick.label, pick.internal], ['SCREEN 1', true]);
  // Three monitors from the laptop: the biggest external one.
  pick = pickTargetScreen({ screens: [LAPTOP, DELL, LG], currentScreen: LAPTOP });
  assert.equal(pick.name, 'DELL U2720Q');
  // A number: ordered like people count them.
  assert.equal(pickTargetScreen({ screens: [LAPTOP, DELL, LG], currentScreen: LAPTOP }, { screen: 2 }).name, 'LG HDR');
  assert.equal(pickTargetScreen({ screens: [LAPTOP, DELL, LG], currentScreen: LAPTOP }, { screen: 3 }).name, 'DELL U2720Q');
  // "Screen 2" said while Jarvis is on screen 2: the owner means the other one.
  assert.equal(pickTargetScreen({ screens: [LAPTOP, DELL], currentScreen: DELL }, { screen: 2 }).name, 'Built-in Retina Display');
  // The laptop's own screen.
  assert.equal(pickTargetScreen({ screens: [LAPTOP, DELL], currentScreen: DELL }, { target: 'internal' }).name, 'Built-in Retina Display');
  // A copy of the current screen object (not the same reference) still counts as current.
  assert.equal(pickTargetScreen({ screens: [LAPTOP, DELL], currentScreen: { ...LAPTOP } }).name, 'DELL U2720Q');
  // One screen: itself, marked same.
  assert.equal(pickTargetScreen({ screens: [LAPTOP], currentScreen: LAPTOP }).same, true);
  assert.equal(pickTargetScreen({ screens: [] }), null);
});

test('second monitor with permission: a maximized window on it', () => {
  const env = detectScreenEnv(stubWindow({ isExtended: true }));
  const plan = planPlacement({ where: 'other', kind: 'hologram', env, permission: 'granted', details: { screens: [LAPTOP, DELL], currentScreen: LAPTOP }, currentScreen: LAPTOP });
  assert.equal(plan.mode, 'screen');
  assert.equal(plan.label, 'SCREEN 2');
  assert.equal(plan.screenName, 'DELL U2720Q');
  assert.equal(plan.features, 'popup=1,left=1440,top=0,width=2560,height=1415');
  assert.equal(plan.note, null);
  const fs = planPlacement({ where: 'other', kind: 'answer', env, permission: 'granted', details: { screens: [LAPTOP, DELL], currentScreen: LAPTOP }, fullscreen: true });
  assert.match(fs.features, /,fullscreen=1$/);
  const nine = planPlacement({ where: 'other', kind: 'answer', env, permission: 'granted', details: { screens: [LAPTOP, DELL], currentScreen: LAPTOP }, screen: 9 });
  assert.deepEqual([nine.mode, nine.label, nine.note], ['screen', 'SCREEN 2', 'no-such-screen']);
});

test('second monitor: ask first, fall back when denied or alone', () => {
  const env = detectScreenEnv(stubWindow({ isExtended: true }));
  assert.deepEqual(planPlacement({ where: 'other', env, permission: 'prompt' }), { mode: 'ask', label: 'SCREEN', note: 'needs-permission' });
  const denied = planPlacement({ where: 'other', kind: 'answer', env, permission: 'denied', currentScreen: LAPTOP });
  assert.deepEqual([denied.mode, denied.note], ['window', 'wm-denied']);
  // Only one screen connected (Chrome says so without asking): float beside instead, no prompt.
  const alone = detectScreenEnv(stubWindow({ isExtended: false }));
  assert.deepEqual([planPlacement({ where: 'other', kind: 'answer', env: alone, permission: 'prompt' }).mode, planPlacement({ where: 'other', kind: 'answer', env: alone, permission: 'prompt' }).note], ['pip', 'single-screen']);
  const one = planPlacement({ where: 'other', kind: 'hologram', env, permission: 'granted', details: { screens: [LAPTOP], currentScreen: LAPTOP } });
  assert.deepEqual([one.mode, one.width, one.height, one.note], ['pip', 640, 480, 'single-screen']);
});

test('beside: a floating panel sized for the content; a window where there are no panels; links never float', () => {
  const env = detectScreenEnv(stubWindow());
  assert.deepEqual(['hologram', 'answer', 'mission', 'link'].map((kind) => planPlacement({ where: 'beside', kind, env, currentScreen: LAPTOP }).mode), ['pip', 'pip', 'pip', 'window']);
  const p = planPlacement({ where: 'beside', kind: 'answer', env });
  assert.deepEqual([p.width, p.height, p.label], [460, 540, 'FLOAT']);
  const safari = detectScreenEnv(stubWindow({ ua: UA.safariMac, wm: false, pip: false }));
  const s = planPlacement({ where: 'beside', kind: 'hologram', env: safari, currentScreen: LAPTOP });
  assert.deepEqual([s.mode, s.note, s.features], ['window', 'no-pip', 'popup=1,left=720,top=25,width=720,height=875']);
});

test('window: the right half of the current screen', () => {
  const env = detectScreenEnv(stubWindow());
  const w = planPlacement({ where: 'window', kind: 'blueprint', env, currentScreen: DELL });
  assert.equal(w.mode, 'window');
  assert.deepEqual(w.rect, { left: 2720, top: 0, width: 1280, height: 1415 });
  assert.deepEqual(rightHalf({ availWidth: 600, availHeight: 400 }), { left: 180, top: 0, width: 420, height: 400 }, 'never narrower than 420');
  assert.equal(screenWindowFeatures({ left: -1920.4, top: 0, width: 100, height: 100 }), 'popup=1,left=-1920,top=0,width=320,height=240');
});

test('Safari and Firefox on a Mac: a window to drag across; phones: the app\'s own full screen', () => {
  const safari = detectScreenEnv(stubWindow({ ua: UA.safariMac, wm: false, pip: false }));
  const o = planPlacement({ where: 'other', kind: 'answer', env: safari, currentScreen: LAPTOP });
  assert.deepEqual([o.mode, o.note], ['window', 'no-wm']);
  const iphone = detectScreenEnv(stubWindow({ ua: UA.iphone, wm: false, pip: false, touch: 5, platform: 'iPhone' }));
  for (const where of ['other', 'beside', 'window']) {
    assert.deepEqual(planPlacement({ where, kind: 'hologram', env: iphone }), { mode: 'inapp', label: 'SCREEN', note: 'phone' }, where);
    assert.equal(planPlacement({ where, kind: 'link', env: iphone }).mode, 'tab', `${where}: a link opens as a tab`);
  }
});

test('notes for the owner', () => {
  assert.match(placementNote('single-screen'), /Only one screen/);
  assert.match(placementNote('no-wm'), /Drag it to your other screen/);
  assert.match(placementNote('phone'), /one screen/);
  assert.equal(placementNote(null), '');
});
