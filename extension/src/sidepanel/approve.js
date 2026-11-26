// The small approval window (Voice from Jarvis, G7). When a task from Jarvis has a question that
// needs a click, or Jarvis asked to open an address that does something, and no side panel is
// open, the service worker opens this window and focuses it. It shows the same card as the side
// panel (cards.js), sends the same answers, and has the same Stop. It closes itself once nothing
// waits. It is an extension page, as trusted as the side panel; web pages can't reach it.

import { h, replaceChildren, setText } from './dom.js';
import { emblem, icon } from './icons.js';
import { openCard, promptCard } from './cards.js';
import { APPROVE_PORT_NAME, FINAL_STATUSES } from '../shared/protocol.js';
import { displayText } from '../shared/util.js';

const app = document.getElementById('app');
const state = { tasks: [], cards: [], port: null, idleSince: 0 };
const CLOSE_AFTER_MS = 1500;
// The window appears in front of whatever the owner was doing: a click meant for that spot must
// not answer. A new card's answers take clicks only after this long (Stop always does).
const ARM_MS = 1000;
let renderGen = 0;

function connect() {
  const port = chrome.runtime.connect({ name: APPROVE_PORT_NAME });
  state.port = port;
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    state.port = null;
    setTimeout(connect, 500);
  });
  send({ type: 'hello' });
}

function send(msg) {
  try {
    state.port?.postMessage(msg);
  } catch {
    /* reconnecting */
  }
}

function onMessage(msg) {
  if (msg.type === 'snapshot') state.tasks = msg.tasks || [];
  else if (msg.type === 'task') {
    const i = state.tasks.findIndex((t) => t.id === msg.task.id);
    if (i >= 0) state.tasks[i] = msg.task;
    else state.tasks.push(msg.task);
  } else if (msg.type === 'cards') state.cards = Array.isArray(msg.cards) ? msg.cards : [];
  else return;
  render();
}

let shownSig = '';
function render() {
  const task = state.tasks.find((t) => !FINAL_STATUSES.has(t.status));
  const prompt = task?.prompt || null;
  const sig = `${prompt?.id || ''}|${state.cards.map((c) => c.id).join(',')}|${task?.id || ''}|${task?.status || ''}`;
  if (sig === shownSig) return;
  shownSig = sig;
  const waiting = !!prompt || state.cards.length > 0;
  state.idleSince = waiting ? 0 : Date.now();
  const stop = task
    ? h('button', { class: 'btn btn--danger btn--sm', type: 'button', attrs: { 'data-testid': 'approve-stop' }, on: { click: () => send({ type: 'stop' }) } }, icon('stop', { size: 14 }), 'Stop')
    : null;
  replaceChildren(
    app,
    h(
      'main',
      { class: 'approve-shell', attrs: { 'data-testid': 'approve-window' } },
      h('div', { class: 'approve-head' }, emblem({ size: 26, live: !!task }), h('h1', { text: 'Jarvis for Chrome needs you' })),
      task ? h('div', { class: 'bubble-row' }, h('div', { class: 'bubble', attrs: { 'data-testid': 'approve-task' }, text: displayText(task.text) })) : null,
      task?.from === 'voice' ? h('span', { class: 'chip chip--voice', text: 'From Jarvis (voice)' }) : null,
      prompt ? promptCard(prompt, { onChoose: (choice) => send({ type: 'decide', promptId: prompt.id, choice }) }) : null,
      ...state.cards.map((card) => openCard(card, { onChoose: (choice) => send({ type: 'open-card', cardId: card.id, choice }) })),
      waiting ? null : h('p', { class: 'approve-empty', attrs: { 'data-testid': 'approve-empty' }, text: 'Nothing is waiting for you.' }),
      stop ? h('div', { class: 'row-btns' }, stop) : null,
    ),
  );
  document.title = waiting ? 'Jarvis for Chrome needs you' : 'Jarvis for Chrome';
  // (No button takes the focus: the window appears in front while the owner may be typing
  // elsewhere, and a Space or Enter meant for that must not press Approve. A click answers.)
  const gen = ++renderGen;
  const answers = () => app.querySelectorAll('.prompt__choices button');
  for (const b of answers()) b.disabled = true;
  setTimeout(() => {
    if (gen === renderGen) for (const b of answers()) b.disabled = false;
  }, ARM_MS);
}

// Nothing has waited for a moment: the window goes (the service worker opens it again if needed).
setInterval(() => {
  if (state.idleSince && Date.now() - state.idleSince >= CLOSE_AFTER_MS) window.close();
}, 250);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.tasks.some((t) => !FINAL_STATUSES.has(t.status))) {
    e.preventDefault();
    send({ type: 'stop' });
  }
});

setText(app, '');
connect();
