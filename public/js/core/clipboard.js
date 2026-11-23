/** Clipboard access and a guarded legacy-copy fallback. */
export function createClipboard(setStatus) {
async function copyText(value, label = 'Copied to clipboard') {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(value);
  } catch {
    const box = document.createElement('textarea');
    box.value = value;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed'; box.style.left = '-9999px';
    document.body.append(box); box.select();
    const copied = document.execCommand('copy');
    box.remove();
    if (!copied) throw new Error('Could not copy automatically. Select the text and copy manually.');
  }
  setStatus(label);
}
async function readClipboard() {
  if (!navigator.clipboard?.readText) throw new Error('Clipboard reading needs HTTPS or localhost. Use Ctrl+V in the editor instead.');
  try { return await navigator.clipboard.readText(); }
  catch { throw new Error('Clipboard access denied. Use Ctrl+V in the editor instead.'); }
}
  return { copyText, readClipboard };
}
