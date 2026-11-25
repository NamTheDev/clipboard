/** Dialog DOM lifecycle and focus restoration. */
export function createDialog($) {
  let previousFocus = null;
function openDialog(title, html, actions = []) {
  previousFocus = document.activeElement;
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = html; // Only application-owned constant markup; never untrusted vault content.
  $('#dialog-body').querySelectorAll('.modal-field').forEach(field => field.classList.add('field','form-field'));
  $('#dialog-body').querySelectorAll('.modal-field label').forEach(label => label.classList.add('field-label','form-label'));
  $('#dialog-body').querySelectorAll('.modal-field input, .modal-field textarea, .modal-field select').forEach(input => input.classList.add('win-input','form-control','rounded-5'));
  $('#dialog-body').querySelectorAll('.modal-hint').forEach(hint => hint.classList.add('dialog-note','form-text'));
  $('#dialog-actions').replaceChildren();
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.text;
    button.className = action.primary ? 'chrome-btn btn primary btn-solid theme-primary rounded-5' : 'chrome-btn btn btn-outline theme-secondary rounded-5';
    button.addEventListener('click', action.onClick);
    $('#dialog-actions').append(button);
  }
  $('#modal-backdrop').hidden = false;
  const first = $('#dialog-body input, #dialog-body textarea, #dialog-body select') || $('#dialog-actions button');
  first?.focus();
}
function closeDialog() {
  $('#modal-backdrop').hidden = true;
  $('#dialog-body').replaceChildren();
  $('#dialog-actions').replaceChildren();
  previousFocus?.focus?.();
}
  return { openDialog, closeDialog };
}
