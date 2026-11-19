// Applies the owner's saved theme (SPEC §14.3) before the stylesheet paints, so a non-default
// theme never flashes the default cyan at launch. A separate file because the CSP allows no
// inline scripts. src/ui/themes.js takes over once the app has booted; keep this list of
// background colors in step with THEMES there.
(function () {
  try {
    var raw = window.localStorage.getItem('jarvis.settings.v1');
    var theme = raw ? JSON.parse(raw).theme : '';
    var bg = { ember: '#08060a', verdant: '#04080a', aurora: '#07050e', solar: '#07070a', mono: '#050608' }[theme];
    if (typeof theme !== 'string' || !bg) return;
    document.documentElement.setAttribute('data-theme', theme);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', bg);
  } catch (e) {
    /* storage blocked or unreadable settings: keep the default theme */
  }
})();
