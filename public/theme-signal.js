/* Advertise the selected NATIVE theme, not the OS preference.
   Dark Reader recommends <meta name="color-scheme" content="dark">.
   Do not force-disable dark-mode extensions with darkreader-lock. */
(() => {
  const root = document.documentElement;
  const schemeMeta = document.querySelector('meta[name="color-scheme"]');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  function signal(dark) {
    const scheme = dark ? 'dark' : 'light';
    root.dataset.theme = scheme;
    root.style.colorScheme = scheme;
    schemeMeta?.setAttribute('content', scheme);
    themeColor?.setAttribute('content', dark ? '#181818' : '#008080');
  }
  window.addEventListener('app-theme-change', (event) => {
    signal(event.detail?.dark === true);
  });
  try {
    const saved = JSON.parse(localStorage.getItem('clipboard.preferences.v1') || 'null');
    signal(saved?.theme === 'dark');
  } catch {
    signal(false);
  }
})();
