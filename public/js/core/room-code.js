const CODE_RE = /^[A-HJ-KM-NP-Z2-9]{6}$/;
export function formatRoomCodeInput(event) {
  const input = event.currentTarget;
  // Display AAA-234 while accepting upper/lowercase letters and pasted codes.
  const raw = input.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
  input.value = raw.length > 3 ? raw.slice(0, 3) + '-' + raw.slice(3) : raw;
}
export function codeFrom(value) {
  const code = String(value || '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(code) ? code : null;
}
export function displayCode(code) { return code.slice(0, 3) + '-' + code.slice(3); }
export function dateLabel(value) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
export function timeLabel(value) { return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
export function ownerStorageKey(code) { return 'clipboard.owner.' + code; }
