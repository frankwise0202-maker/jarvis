// Library thumbnails for the chat cards and the Blueprints sheet.
//
//   const thumbs = createThumbs(lib)    lib: { get(id), setThumbnail(id, dataUrl), onChange(cb) }
//   thumbs.get(id)       -> Promise<dataUrl|null>   the saved thumbnail (cached until the item changes)
//   thumbs.ensure(id)    -> Promise<dataUrl|null>   the saved one, or make one now: a blueprint from
//                           its SVG, a hologram with a short offscreen 3D render (one at a time)
//   thumbs.onChange(fn)  -> unsubscribe              fn(id|null) after a library change
//
// Thumbnails are small data: URLs (≤ 60 KB, PNG or JPEG). A failure is remembered for the session,
// so a device without WebGL never retries a hologram render.

import { renderHologramImage } from './hologram/viewer.js';
import { ensureBlueprintThumbnail } from './blueprint/open.js';

const MAX_CHARS = 60000;
const SAFE_THUMB = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

export function isSafeThumbnail(url) {
  return typeof url === 'string' && url.length <= MAX_CHARS && SAFE_THUMB.test(url);
}

export function thumbnailOf(item) {
  if (!item || typeof item !== 'object') return null;
  const url = item.thumbnail || item.thumb || null;
  return isSafeThumbnail(url) ? url : null;
}

export function createThumbs(lib) {
  const cache = new Map(); // id -> Promise<url|null>
  const making = new Map(); // id -> Promise<url|null>
  const failed = new Set();
  const listeners = new Set();
  let chain = Promise.resolve();

  if (lib && typeof lib.onChange === 'function') {
    try {
      lib.onChange((change) => {
        const id = change && typeof change === 'object' ? change.id : typeof change === 'string' ? change : null;
        if (id) cache.delete(id);
        else cache.clear();
        for (const fn of Array.from(listeners)) {
          try {
            fn(id || null);
          } catch {
            /* a card went away */
          }
        }
      });
    } catch {
      /* no change feed: thumbnails still load, they just don't refresh by themselves */
    }
  }

  function get(id) {
    if (!id || !lib || typeof lib.get !== 'function') return Promise.resolve(null);
    if (!cache.has(id)) {
      cache.set(
        id,
        Promise.resolve()
          .then(() => lib.get(id))
          .then((item) => thumbnailOf(item))
          .catch(() => null),
      );
    }
    return cache.get(id);
  }

  async function make(id) {
    const item = await lib.get(id);
    if (!item) return null;
    const existing = thumbnailOf(item);
    if (existing) return existing;
    if (item.kind === 'blueprint') return ensureBlueprintThumbnail({ id, spec: item.spec, library: lib });
    if (item.kind === 'hologram') {
      const url = await renderHologramImage(item.spec, { width: 320, height: 240, type: 'image/jpeg', quality: 0.82 });
      if (!isSafeThumbnail(url)) return null;
      await lib.setThumbnail(id, url);
      return url;
    }
    return null;
  }

  function ensure(id) {
    if (!id || failed.has(id) || !lib) return Promise.resolve(null);
    if (making.has(id)) return making.get(id);
    const p = get(id).then((url) => {
      if (url) return url;
      const job = chain.then(() => make(id));
      chain = job.catch(() => null);
      return job;
    });
    const tracked = p
      .catch((err) => {
        failed.add(id);
        console.warn('[jarvis] thumbnail failed:', err && err.message);
        return null;
      })
      .then((url) => {
        making.delete(id);
        if (!url) failed.add(id);
        else cache.set(id, Promise.resolve(url));
        return url;
      });
    making.set(id, tracked);
    return tracked;
  }

  return {
    get,
    ensure,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
