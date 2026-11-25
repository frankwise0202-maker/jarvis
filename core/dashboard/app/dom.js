// Tiny DOM helpers for a page that updates every second for weeks: every setter remembers what
// it last wrote and touches the DOM only when the value changes (no layout churn, no garbage).

export const $ = (id) => document.getElementById(id);

export function setText(el, text) {
  if (!el) return;
  const s = text === null || text === undefined ? '' : String(text);
  if (el.__text === s) return;
  el.__text = s;
  el.textContent = s;
}

export function setData(el, key, value) {
  if (!el) return;
  const s = value === null || value === undefined ? null : String(value);
  if (s === null) {
    if (key in el.dataset) delete el.dataset[key];
    return;
  }
  if (el.dataset[key] !== s) el.dataset[key] = s;
}

export function setVar(el, name, value) {
  if (!el) return;
  const slot = `__var${name}`;
  if (el[slot] === value) return;
  el[slot] = value;
  el.style.setProperty(name, value);
}

export function setHidden(el, hidden) {
  if (!el) return;
  if (el.hidden !== !!hidden) el.hidden = !!hidden;
}

export function setAttr(el, name, value) {
  if (!el) return;
  if (value === null || value === undefined) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
    return;
  }
  const s = String(value);
  if (el.getAttribute(name) !== s) el.setAttribute(name, s);
}

/** Create an element with a class and optional text. */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/**
 * A figure value: the text when known; otherwise words in the muted style (data-unknown), so a
 * missing value reads "not available", never a made-up number.
 */
export function setFigure(node, text, unknownWords = 'not available') {
  if (!node) return;
  if (text === null || text === undefined || text === '') {
    setText(node, unknownWords);
    setData(node, 'unknown', 'true');
  } else {
    setText(node, text);
    setData(node, 'unknown', null);
  }
}
