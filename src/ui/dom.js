// Shared DOM helpers for every UI module.
//
// Safety rule: these helpers only ever set text (textContent / text nodes),
// properties and attributes. They never parse HTML. Model, web, user and
// stored text must reach the page through h(...) children or `text`, or
// through src/lib/markdown.js. Never use innerHTML with dynamic content.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g', 'title', 'defs', 'linearGradient', 'radialGradient', 'stop', 'mask', 'use']);

/**
 * Create an element.
 *   h('button', { class: 'btn primary', text: 'Send', attrs: { 'aria-label': 'Send' }, on: { click: fn } })
 *   h('div', { class: ['row', isOn && 'on'] }, h('span', null, 'Hello'), someNode, [a, b])
 *
 * props (all optional):
 *   class    string | array (falsy entries skipped) | { name: boolean }
 *   text     string — sets textContent (use instead of children for plain text)
 *   attrs    { name: value } — setAttribute; null/undefined/false skipped, true => ''
 *   on       { event: handler } — addEventListener
 *   style    { prop: value } — '--custom' props via setProperty, others via el.style[prop]
 *   dataset  { key: value }
 *   ref      (el) => void — called after creation
 *   svg      true — force SVG namespace (automatic for known SVG tags)
 *   anything else — assigned as a DOM property (id, type, value, checked, disabled,
 *                   title, placeholder, tabIndex, hidden, name, min, max, step, rows, href …)
 * children: Node | string | number | null | undefined | false | array (nested ok)
 */
export function h(tag, props, ...children) {
  const isSvg = (props && props.svg) || SVG_TAGS.has(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (value === undefined) continue;
      switch (key) {
        case 'class': {
          const cls = classList(value);
          if (cls) {
            if (isSvg) el.setAttribute('class', cls);
            else el.className = cls;
          }
          break;
        }
        case 'text':
          if (value !== null && value !== false) el.textContent = String(value);
          break;
        case 'attrs':
          if (value) {
            for (const name of Object.keys(value)) {
              const v = value[name];
              if (v === null || v === undefined || v === false) continue;
              el.setAttribute(name, v === true ? '' : String(v));
            }
          }
          break;
        case 'on':
          if (value) for (const type of Object.keys(value)) if (value[type]) el.addEventListener(type, value[type]);
          break;
        case 'style':
          if (value) setStyle(el, value);
          break;
        case 'dataset':
          if (value) for (const k of Object.keys(value)) if (value[k] !== undefined && value[k] !== null) el.dataset[k] = String(value[k]);
          break;
        case 'ref':
        case 'svg':
          break;
        default:
          if (isSvg) {
            if (value !== null && value !== false) el.setAttribute(key, value === true ? '' : String(value));
          } else {
            el[key] = value;
          }
      }
    }
  }
  append(el, children);
  if (props && typeof props.ref === 'function') props.ref(el);
  return el;
}

/** Append children (same rules as h()). Returns the parent. */
export function append(parent, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
  return parent;
}

/** Turn a class spec into a string. */
export function classList(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).map(classList).filter(Boolean).join(' ');
  if (typeof value === 'object') return Object.keys(value).filter((k) => value[k]).join(' ');
  return '';
}

/** Apply a style object. Custom properties (--x) use setProperty. */
export function setStyle(el, styles) {
  for (const prop of Object.keys(styles)) {
    const v = styles[prop];
    if (prop.startsWith('--')) {
      if (v === null || v === undefined || v === false) el.style.removeProperty(prop);
      else el.style.setProperty(prop, String(v));
    } else {
      el.style[prop] = v === null || v === undefined || v === false ? '' : v;
    }
  }
  return el;
}

/** Remove all children. Returns the element. */
export function clear(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Replace all children with the given children. */
export function replaceChildren(el, ...children) {
  clear(el);
  return append(el, ...children);
}

/** Set textContent only when it changed (avoids layout work while streaming). */
export function setText(el, text) {
  const s = text === null || text === undefined ? '' : String(text);
  if (el.textContent !== s) el.textContent = s;
  return el;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** addEventListener that returns an unsubscribe function. */
export function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

/**
 * Coalesce calls into one per animation frame.
 *   const schedule = raf(() => render()); schedule(); schedule(); // render runs once next frame
 * schedule.cancel() cancels a pending frame; schedule.flush() runs it now if pending.
 */
export function raf(fn) {
  let id = 0;
  const run = () => {
    id = 0;
    fn();
  };
  const schedule = () => {
    if (!id) id = requestAnimationFrame(run);
  };
  schedule.cancel = () => {
    if (id) cancelAnimationFrame(id);
    id = 0;
  };
  schedule.flush = () => {
    if (id) {
      cancelAnimationFrame(id);
      run();
    }
  };
  return schedule;
}

/**
 * Throttle with leading and trailing calls: fn runs at most once per `ms`,
 * and the last call in a burst is never lost. throttled.cancel() drops a pending call.
 */
export function throttle(fn, ms) {
  let last = 0;
  let timer = 0;
  let pendingArgs = null;
  const invoke = () => {
    last = Date.now();
    timer = 0;
    const args = pendingArgs;
    pendingArgs = null;
    fn(...args);
  };
  const throttled = (...args) => {
    pendingArgs = args;
    const wait = ms - (Date.now() - last);
    if (wait <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
      invoke();
    } else if (!timer) {
      timer = setTimeout(invoke, wait);
    }
  };
  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    pendingArgs = null;
  };
  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer);
      invoke();
    }
  };
  return throttled;
}

/**
 * Return the URL string if it is an absolute http(s) or mailto URL, else null.
 * Use before putting any non-hard-coded URL into an href.
 */
export function safeUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') return parsed.href;
  } catch {
    /* not a valid absolute URL */
  }
  return null;
}

/** An external link that is always safe: validated href, new tab, no referrer. Falls back to a span. */
export function extLink(url, text, props = {}) {
  const href = safeUrl(url);
  const label = text === undefined || text === null || text === '' ? url : text;
  if (!href) return h('span', { class: props.class }, String(label ?? ''));
  return h('a', { ...props, href, attrs: { target: '_blank', rel: 'noopener noreferrer', ...(props.attrs || {}) } }, String(label));
}
