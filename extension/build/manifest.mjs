// manifest.json for Jarvis for Chrome (Manifest V3).
//
// Permissions, and why:
//   sidePanel  the Jarvis chat lives in Chrome's side panel
//   debugger   screenshots, the page agent and real mouse/keyboard input in the tab Jarvis works
//              in (chrome.debugger is how Jarvis acts on any site without permanent access to
//              all of them; every new site still needs the owner's OK in the side panel)
//   tabs       read the URL and title of the tabs Jarvis works in; open, switch and close them
//   downloads  hold every download that starts while Jarvis works until the owner approves it
//              (nothing is saved meanwhile; a declined one is cancelled)
//   storage    the API key, settings, allowed sites and task history (this computer only)
//   alarms     a tick every 30 s that restarts the link to Jarvis's home base (Voice from Jarvis)
//              when Chrome stopped the service worker
// Host permissions: only api.anthropic.com (and, in development builds, the local mock API).
// Optional host permissions: the owner's home base on Tailscale (https://<machine>.<tailnet>.ts.net),
// asked for by name when the owner links Jarvis for Chrome to Jarvis (side panel → Settings →
// Voice from Jarvis): the relay that carries Jarvis's encrypted messages. Nothing else.
// The page CSP lets extension pages and the service worker connect to the API and to *.ts.net
// (only the home base the owner granted is reachable) and nowhere else.

export const NAME = 'Jarvis for Chrome';

/** The version Jarvis for Chrome ships as (its own, not the web app's). */
export const VERSION = '1.1.1';

/** Where the owner's home base can be: its Tailscale name (see Voice from Jarvis). */
export const HOME_BASE_HOSTS = Object.freeze(['https://*.ts.net/*']);

export function createManifest({ dev = false, version = VERSION } = {}) {
  const apiHosts = ['https://api.anthropic.com', 'https://*.ts.net'];
  const devHosts = dev ? ['http://127.0.0.1:*', 'http://localhost:*'] : [];
  return {
    manifest_version: 3,
    name: dev ? `${NAME} (dev)` : NAME,
    short_name: 'Jarvis',
    version,
    description: 'Jarvis works in your own Chrome tabs: it reads pages, clicks and types for you, and asks before anything that matters.',
    minimum_chrome_version: '120',
    icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    action: {
      default_title: 'Open Jarvis',
      default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
    },
    side_panel: { default_path: 'sidepanel.html' },
    background: { service_worker: 'background.js', type: 'module' },
    permissions: ['sidePanel', 'debugger', 'tabs', 'downloads', 'storage', 'alarms'],
    host_permissions: ['https://api.anthropic.com/*', ...(dev ? ['http://127.0.0.1/*', 'http://localhost/*'] : [])],
    optional_host_permissions: [...HOME_BASE_HOSTS],
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+J', mac: 'Alt+Shift+J' },
        description: 'Open Jarvis',
      },
      'stop-jarvis': {
        suggested_key: { default: 'Ctrl+Shift+Period', mac: 'Command+Shift+Period' },
        description: 'Stop Jarvis right away',
      },
    },
    content_security_policy: {
      extension_pages: [
        "script-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        `connect-src ${[...apiHosts, ...devHosts].join(' ')}`,
        "img-src 'self' data:",
        "media-src 'none'",
        "style-src 'self'",
        "font-src 'self'",
      ].join('; '),
    },
  };
}
