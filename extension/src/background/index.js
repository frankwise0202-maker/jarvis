// Jarvis for Chrome: the service worker (MV3 background). Wires Chrome's events to the
// controller, which runs tasks with the Claude API and drives the owner's tabs, and to the link
// with Jarvis (the web app) through the owner's home base (Voice from Jarvis: link.js, relay.js).

import PAGE_AGENT from 'virtual:page-agent';
import { Controller } from './controller.js';
import { JarvisLink } from './link.js';
import { ALARM } from './relay.js';
import { createClient } from './api.js';
import { decodeImage, encodeImage } from './images.js';
import { createStore } from '../shared/storage.js';

const platform = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '') ? 'mac' : 'other';

const store = createStore(chrome);
const controller = new Controller({
  chrome,
  store,
  pageSource: PAGE_AGENT,
  createClient,
  encoder: { decode: decodeImage, encode: encodeImage },
  platform,
});
const link = new JarvisLink({ chrome, controller, store, version: chrome.runtime.getManifest().version });
const ready = controller.restore().catch(() => {});
// The link starts after the restore, so a message from Jarvis meets the controller ready.
ready.then(() => link.init()).catch(() => {});

// A tick every 30 s while linked: starts the relay again when Chrome stopped the worker (waking
// the worker is what runs this file again).
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === ALARM) ready.then(() => link.ensureRunning());
});
chrome.windows?.onRemoved?.addListener((windowId) => link.onWindowRemoved(windowId));

function enablePanel() {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
}
chrome.runtime.onInstalled.addListener(enablePanel);
chrome.runtime.onStartup.addListener(enablePanel);
enablePanel();

chrome.runtime.onConnect.addListener((port) => {
  ready.then(() => controller.connect(port));
});

function onCommand(command) {
  if (command === 'stop-jarvis') controller.stop('shortcut');
}
chrome.commands.onCommand.addListener(onCommand);

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source.tabId !== undefined) controller.driver.onCdpEvent(source.tabId, method, params, source.sessionId);
});
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId !== undefined) controller.driver.onDetached(source.tabId, reason);
});

// Every download that starts while a task runs is held until the owner approves it (no file is
// written meanwhile); so is one that an address opened for Jarvis starts in the next 30 s (REDTEAM-LINK-9:
// a redirect to an installer). Other downloads while no task runs, or during Take over, are left alone.
chrome.downloads?.onDeterminingFilename?.addListener((item, suggest) => (controller.holdDownload(item, suggest) || link.holdDownload(item, suggest) ? true : undefined));

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area !== 'local') return;
  controller.onStorageChanged(changes);
  link.onStorageChanged(changes);
});

chrome.tabs.onCreated.addListener((tab) => controller.driver.onTabCreated(tab));
chrome.tabs.onUpdated.addListener((tabId, info, tab) => controller.driver.onTabUpdated(tabId, info, tab));
chrome.tabs.onActivated.addListener((info) => controller.driver.onTabActivated(info));
chrome.tabs.onRemoved.addListener((tabId) => controller.driver.onTabRemoved(tabId));

/* global __DEV__ */
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  // Development builds only: lets the end-to-end tests inspect the worker's state.
  globalThis.__jarvisController = controller;
  globalThis.__jarvisCommand = onCommand;
  globalThis.__jarvisLink = link;
}
