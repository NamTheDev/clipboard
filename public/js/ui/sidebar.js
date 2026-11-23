/** Mobile drawer behavior, independent of room state. */
export function createSidebar($) {
return function closeSidebar() {
  $('#sidebar').classList.remove('mobile-open');
  $('#mobile-scrim').classList.remove('show');
  $('#toggle-nav').setAttribute('aria-expanded','false');
}
}
