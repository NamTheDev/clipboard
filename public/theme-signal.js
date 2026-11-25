/* Fixed native dark theme; never restore legacy light preferences. */
(() => {
  const root = document.documentElement;
  root.dataset.theme = 'dark';
  root.dataset.bsTheme = 'dark';
  root.style.colorScheme = 'dark';
})();
