// Entry point: load the styles and boot the app shell. If boot fails, show a minimal,
// readable recovery screen instead of a blank page.

import './styles/app.css';
import { startApp } from './ui/app.js';
import { isScreenMode, startScreenPage } from './ui/screens/screen-page.js';

function showBootError(root, err) {
  console.error('[jarvis] boot failed:', err);
  if (!root) return;
  const box = document.createElement('div');
  box.className = 'boot-error';
  box.setAttribute('role', 'alert');
  const title = document.createElement('h1');
  title.textContent = 'Jarvis couldn’t start';
  const text = document.createElement('p');
  text.textContent = 'Something went wrong while loading. Reloading usually fixes it. If it keeps happening, your browser may be blocking storage for this site.';
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'btn btn-primary';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => location.reload());
  box.append(title, text, reload);
  root.replaceChildren(box);
  root.dataset.ready = 'error';
}

const root = document.getElementById('app');
// Screens (v7): ?screen=<kind> is a window on another monitor showing one panel, not the app.
const start = isScreenMode() ? startScreenPage : startApp;
try {
  Promise.resolve(start(root)).catch((err) => showBootError(root, err));
} catch (err) {
  showBootError(root, err);
}
