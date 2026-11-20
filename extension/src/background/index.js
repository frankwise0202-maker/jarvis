// Jarvis for Chrome: the service worker (MV3 background). Wires Chrome's events to the
// controller, which runs tasks with the Claude API and drives the owner's tabs.

import PAGE_AGENT from 'virtual:page-agent';
import { Controller } from './controller.js';
import { createClient } from './api.js';
import { decodeImage, encodeImage } from './images.js';
import { createStore } from '../shared/storage.js';

const platform = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '') ? 'mac' : 'other';

const controller = new Controller({
  chrome,
  store: createStore(chrome),
  pageSource: PAGE_AGENT,
  createClient,
  encoder: { decode: decodeImage, encode: encodeImage },
  platform,
});
const ready = controller.restore().catch(() => {});

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
// written meanwhile); downloads while no task runs, or during Take over, are left alone.
chrome.downloads?.onDeterminingFilename?.addListener((item, suggest) => (controller.holdDownload(item, suggest) ? true : undefined));

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === 'local') controller.onStorageChanged(changes);
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
}
