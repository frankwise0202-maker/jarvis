// DOM helpers for the side panel: a copy of the app's src/ui/dom.js essentials (same rules).
//
// Safety rule: these helpers only ever set text (textContent / text nodes), properties and
// attributes. They never parse HTML. Model, web, user and stored text reach the page only through
// h(...) children or `text`. Never use innerHTML with dynamic content.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g', 'title', 'defs', 'linearGradient', 'radialGradient', 'stop', 'mask', 'use']);

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

export function append(parent, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
  return parent;
}

export function classList(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).map(classList).filter(Boolean).join(' ');
  if (typeof value === 'object') return Object.keys(value).filter((k) => value[k]).join(' ');
  return '';
}

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

export function clear(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function replaceChildren(el, ...children) {
  clear(el);
  return append(el, ...children);
}

export function setText(el, text) {
  const s = text === null || text === undefined ? '' : String(text);
  if (el.textContent !== s) el.textContent = s;
  return el;
}

/** The URL string if it is an absolute http(s) URL, else null. */
export function safeUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    /* not a URL */
  }
  return null;
}
