// Screens (v7): the floating HUD panel, a Document Picture-in-Picture window (Chrome and Edge on
// desktop). It stays on top of every app, and the owner can move and resize it.
//
//   const pip = await openPipWindow({ width, height })   // needs a user gesture (NotAllowedError)
//   copyStylesInto(document, pip.document)               // the app's stylesheets, URLs made absolute
//
// The opener renders the panel's DOM into the PiP document (frame.js, panels.js, with `win` = the
// PiP window, so frames and timers keep running while the app's tab is hidden). The hologram draws
// into a canvas in that document (hologram.js takes its window from the container); when WebGL
// fails there, the panel shows a snapshot the app re-renders as the model changes.

export function pipSupported(win = window) {
  return !!(win && win.documentPictureInPicture && typeof win.documentPictureInPicture.requestWindow === 'function');
}

/** The open PiP window of this page, or null. */
export function currentPipWindow(win = window) {
  try {
    const w = win.documentPictureInPicture && win.documentPictureInPicture.window;
    return w && !w.closed ? w : null;
  } catch {
    return null;
  }
}

/** url(...) in copied CSS text, made absolute against the stylesheet's own URL. */
export function absolutizeCssUrls(cssText, baseHref) {
  if (!baseHref) return cssText;
  return String(cssText).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q, url) => {
    if (/^(?:data:|blob:|https?:|#)/i.test(url)) return all;
    try {
      return `url("${new URL(url, baseHref).href}")`;
    } catch {
      return all;
    }
  });
}

/** Copy every stylesheet of `src` into `dst` (rules as text; a link when the rules can't be read). */
export function copyStylesInto(src, dst) {
  const head = dst.head || dst.documentElement;
  let copied = 0;
  for (const sheet of Array.from(src.styleSheets || [])) {
    try {
      const rules = Array.from(sheet.cssRules || []);
      const text = rules.map((r) => r.cssText).join('\n');
      const style = dst.createElement('style');
      style.textContent = absolutizeCssUrls(text, sheet.href || src.baseURI);
      if (sheet.media && sheet.media.mediaText) style.media = sheet.media.mediaText;
      head.appendChild(style);
      copied += 1;
    } catch {
      if (!sheet.href) continue;
      const link = dst.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      if (sheet.media && sheet.media.mediaText) link.media = sheet.media.mediaText;
      head.appendChild(link);
      copied += 1;
    }
  }
  return copied;
}

/** Make the PiP document look like the app: styles, theme, color scheme, body class. */
export function preparePipDocument(pipWin, src = document) {
  const doc = pipWin.document;
  copyStylesInto(src, doc);
  const root = doc.documentElement;
  for (const name of ['data-theme', 'data-motion', 'data-density', 'lang', 'dir']) {
    const v = src.documentElement.getAttribute(name);
    if (v !== null) root.setAttribute(name, v);
  }
  root.classList.add('is-screen-mode', 'is-pip');
  root.style.colorScheme = 'dark';
  if (doc.body) doc.body.className = 'scr-pip-body';
  return doc;
}

/** Open the floating panel (rejects without a user gesture, like the browser does). */
export async function openPipWindow({ width = 460, height = 360, win = window } = {}) {
  if (!pipSupported(win)) throw Object.assign(new Error('Floating panels are not supported in this browser.'), { name: 'NotSupportedError' });
  const pipWin = await win.documentPictureInPicture.requestWindow({ width: Math.round(width), height: Math.round(height) });
  preparePipDocument(pipWin, win.document);
  return pipWin;
}
