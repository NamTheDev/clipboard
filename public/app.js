import { $, $$ } from './js/ui/dom.js';
import { createDialog } from './js/ui/dialog.js';
import { createSidebar } from './js/ui/sidebar.js';
import { loadPreferences, PREFERENCES_KEY } from './js/core/preferences.js';
import { createApi } from './js/core/api.js';
import { createClipboard } from './js/core/clipboard.js';
import { formatRoomCodeInput, codeFrom, displayCode, dateLabel, timeLabel, ownerStorageKey } from './js/core/room-code.js';
const state = { room: null, items: [], ownerToken: null, selectedId: null, minimized: false, maximized: false, refreshPending: false };
let refreshTimer = null;
let statusTimer = null;

let preferences = loadPreferences();
function applyAppearance() {
  const dark = preferences.theme === 'dark';
  document.body.classList.toggle('dark-mode', dark);
  document.querySelector('.desktop')?.classList.toggle('dark-mode', dark);
  // Publish the native app theme to Dark Reader and other browser integrations.
  window.dispatchEvent(new CustomEvent('app-theme-change', { detail: { dark } }));
}
function savePreferences(next) {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next)); }
  catch { throw new Error('Browser storage is unavailable; settings could not be saved.'); }
  preferences = next;
  applyAppearance();
  if (state.room) startRoomRefresh(state.room.code);
}


function setStatus(text) {
  $('#status-text').textContent = text;
  clearTimeout(statusTimer);
  if (text !== 'Ready') statusTimer = setTimeout(() => { $('#status-text').textContent = 'Ready'; }, 5000);
}
function showError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  setStatus('Error: ' + msg);
  openDialog('clipboard - Error', '<p><strong aria-hidden="true">!</strong> <span id="error-message"></span></p>', [
    { text: 'OK', primary: true, onClick: closeDialog },
  ]);
  $('#error-message').textContent = msg;
}
const api = createApi(() => state.ownerToken);
const { copyText, readClipboard } = createClipboard(setStatus);
function setUrl(code = null) {
  const next = new URL(location.href);
  if (code) next.searchParams.set('room', code);
  else next.searchParams.delete('room');
  history.replaceState(null, '', next);
}
function stopPolling() { clearInterval(refreshTimer); refreshTimer = null; }

function startRoomRefresh(code) {
  stopPolling();
  if (preferences.refreshSeconds === 0) return;
  refreshTimer = setInterval(() => {
    if (!document.hidden && state.room?.code === code) fetchRoom(code, { silent: true }).catch(() => {});
  }, preferences.refreshSeconds * 1000);
}

const closeSidebar = createSidebar($);
const { openDialog, closeDialog } = createDialog($);
function renderHome() {
  state.room = null; state.items = []; state.ownerToken = null; state.selectedId = null;
  stopPolling(); setUrl();
  $('#home-screen').hidden = false;
  $('#room-screen').hidden = true;
  $('#sidebar-room-actions').hidden = true;
  $('#sidebar-active').hidden = true; $('#sidebar-none').hidden = false;
  $('#status-count').textContent = '0 item(s)';
  $('#status-mode').textContent = 'Vault Explorer';
  $('#sidebar-home').classList.add('active');
  $('#sidebar-active').classList.remove('active');
  closeSidebar();
  syncButtons();
  setStatus('Ready');
}
function syncButtons() {
  const canEdit = Boolean(state.room && state.ownerToken);
  const selected = Boolean(state.room && state.selectedId && state.items.some(x => x.id === state.selectedId));
  $('#add-item').hidden = !canEdit;
  $('#paste-item').hidden = !canEdit;
  $('#delete-room').hidden = !canEdit;
  $('#copy-selected').disabled = !selected;
  $('#edit-selected').hidden = !canEdit;
  $('#delete-selected').hidden = !canEdit;
  $('#edit-selected').disabled = !selected;
  $('#delete-selected').disabled = !selected;
}
function renderRoom() {
  const room = state.room;
  if (!room) return;
  $('#home-screen').hidden = true;
  $('#room-screen').hidden = false;
  $('#sidebar-room-actions').hidden = false;
  $('#sidebar-active').hidden = false;
  $('#sidebar-none').hidden = true;
  $('#sidebar-room').textContent = displayCode(room.code);
  $('#sidebar-home').classList.remove('active');
  $('#sidebar-active').classList.add('active');
  $('#room-title').textContent = room.title;
  $('#room-caption').textContent = `Created ${timeLabel(room.createdAt)}`;
  $('#room-code').textContent = displayCode(room.code);
  $('#room-expiry').textContent = `Expires ${timeLabel(room.expiresAt)}`;
  $('#status-count').textContent = `${state.items.length} item(s)`;
  $('#status-mode').textContent = state.ownerToken ? 'Owner' : 'Read only';
  $('#access-badge').textContent = state.ownerToken ? 'OWNER' : 'READ ONLY';
  $('#access-badge').classList.toggle('owner', Boolean(state.ownerToken));
  renderItems();
}
function renderItems() {
  const list = $('#file-list');
  list.replaceChildren();
  if (!state.items.length) {
    const empty = document.createElement('p');
    empty.className = 'file-empty fg-2';
    empty.textContent = state.ownerToken ? 'This vault is empty. Select "New item" to add your first snippet.' : 'This vault is empty. Its creator has not added any items yet.';
    list.append(empty);
  } else {
    for (const item of state.items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'file-row note-window card';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(state.selectedId === item.id));
      row.dataset.itemId = item.id;
      const top = document.createElement('span'); top.className = 'note-titlebar d-flex align-items-center gap-3 fg-2';
      const fileIcon = document.createElement('span'); fileIcon.className = 'ui-icon material-symbols-rounded'; fileIcon.textContent = 'description'; fileIcon.setAttribute('aria-hidden','true');
      const descriptor = document.createElement('span'); descriptor.className = 'note-titlebar-text flex-grow-1 text-truncate'; descriptor.textContent = '';
      const date = document.createElement('span'); date.className = 'note-titlebar-text file-date flex-grow-1 text-truncate fg-2'; date.textContent = dateLabel(item.created_at);
      top.append(fileIcon, descriptor, date);
      const paper = document.createElement('span'); paper.className = 'note-paper card-body';
      const name = document.createElement('span'); name.className = 'note-heading file-name card-title fw-medium mb-1'; name.textContent = item.title;
      const excerpt = document.createElement('span'); excerpt.className = 'note-text file-excerpt mb-0'; excerpt.textContent = item.content.length > 175 ? item.content.slice(0,175) + '…' : item.content;
      paper.append(name,excerpt);
      row.append(top,paper);
      row.addEventListener('click', () => { state.selectedId = item.id; renderItems(); });
      row.addEventListener('dblclick', () => copyText(item.content).catch(showError));
      list.append(row);
    }
  }
  const selected = state.items.find(item => item.id === state.selectedId);
  $('#preview-meta').textContent = selected ? `${selected.title} · ${timeLabel(selected.updated_at)}` : 'Select an item';
  $('#preview-content').textContent = selected ? selected.content : 'No item selected.';
  syncButtons();
}
async function fetchRoom(code, { announce = false, silent = false } = {}) {
  if (state.refreshPending) return;
  state.refreshPending = true;
  try {
    const result = await api('/api/rooms/' + code);
    if (state.room && state.room.code !== code) return;
    state.room = result.room;
    state.items = result.items;
    if (!state.items.some(x => x.id === state.selectedId)) state.selectedId = state.items[0]?.id || null;
    renderRoom();
    if (announce) setStatus('Connected to room ' + displayCode(code));
    else if (!silent) setStatus('Vault refreshed');
  } catch (e) {
    if (silent) { setStatus('Vault unavailable: ' + e.message); stopPolling(); }
    else showError(e);
    throw e;
  } finally { state.refreshPending = false; }
}
async function joinRoom(rawCode) {
  const code = codeFrom(rawCode);
  if (!code) throw new Error('Enter a six-character room ID using letters A-Z or digits 2-9 (no I, L, O).');
  const check = await api('/api/rooms/' + code); // Validate first; preserve current room on failure.
  stopPolling();
  state.room = check.room;
  state.items = check.items;
  state.selectedId = check.items[0]?.id || null;
  state.ownerToken = localStorage.getItem(ownerStorageKey(code));
  setUrl(code);
  renderRoom();
  closeSidebar();
  setStatus('Connected to ' + displayCode(code));
  startRoomRefresh(code);
}
function createVaultDialog() {
  openDialog('Create a New Vault', `
    <p>Create a temporary vault. Anyone with its code can read and copy its contents.</p>
    <div class="modal-field"><label for="new-vault-name">Vault name:</label><input id="new-vault-name" maxlength="60" value="My Clipboard" required class="form-control"></div>
    <div class="modal-field"><label for="new-vault-duration">Keep vault for:</label><select id="new-vault-duration" class="form-control"><option value="24h">24 hours</option><option value="7d">7 days</option></select></div>
    <p class="modal-hint">Only this browser will have the owner key for adding and removing items.</p>
  `, [
    { text: 'Create', primary: true, onClick: async () => {
      try {
        const title = $('#new-vault-name').value.trim();
        if (!title) throw new Error('Enter a vault name.');
        const response = await api('/api/rooms', { method: 'POST', body: { title, duration: $('#new-vault-duration').value } });
        localStorage.setItem(ownerStorageKey(response.room.code), response.ownerToken);
        closeDialog();
        await joinRoom(response.room.code);
        setStatus('Vault created. Share only its room ID or link.');
      } catch(e) { showError(e); }
    }}, { text: 'Cancel', onClick: closeDialog },
  ]);
  $('#new-vault-duration').value = preferences.defaultDuration;
  $('#new-vault-name').select();
}
function joinVaultDialog() {
  openDialog('Join a Vault', `
    <p>Type the room ID provided by the vault creator.</p>
    <div class="modal-field"><label for="modal-join-code">Room ID:</label><input id="modal-join-code" class="code-input form-control" maxlength="7" placeholder="K7P-4MX" autocomplete="off" spellcheck="false" required></div>
    <p class="modal-hint">Room codes are case-insensitive. You can copy items without an account.</p>
  `, [
    { text: 'Join', primary: true, onClick: async () => {
      try { await joinRoom($('#modal-join-code').value); closeDialog(); }
      catch(e) { showError(e); }
    }}, { text: 'Cancel', onClick: closeDialog },
  ]);
  $('#modal-join-code').addEventListener('input', formatRoomCodeInput);
}
function itemDialog(editing = false, pasted = '') {
  if (!state.room || !state.ownerToken) return setStatus('Only the vault creator can add or edit items.');
  const old = editing ? state.items.find(x => x.id === state.selectedId) : null;
  if (editing && !old) return;
  openDialog(editing ? 'Edit Clipboard Item' : 'New Clipboard Item', `
    <div class="modal-field"><label for="item-title">Item name:</label><input id="item-title" maxlength="80" placeholder="Snippet name" required class="form-control"></div>
    <div class="modal-field"><label for="item-content">Text content:</label><textarea id="item-content" maxlength="16000" placeholder="Paste text here (Ctrl+V)..." required class="form-control"></textarea></div>
    <p class="modal-hint">Text only · 16,000 characters per item · 100 items per vault.</p>
    <p id="item-form-error" role="alert" hidden></p>
  `, [
    { text: 'Paste', onClick: async () => {
      try { $('#item-content').value = await readClipboard(); $('#item-content').focus(); setStatus('Pasted clipboard text into editor'); }
      catch(e) { setStatus(e.message); $('#item-content').focus(); }
    }},
    { text: editing ? 'Save' : 'Add Item', primary: true, onClick: async () => {
      try {
        const title = $('#item-title').value.trim();
        const content = $('#item-content').value;
        if (!title || !content.trim()) throw new Error('Item name and text cannot be empty.');
        if (content.length > 16000) throw new Error('Text is too long (max 16,000 characters).');
        const code = state.room.code;
        const result = await api(`/api/rooms/${code}/items${editing ? '/' + old.id : ''}`, { method: editing ? 'PATCH' : 'POST', authorize: true, body: { title, content } });
        closeDialog();
        state.selectedId = result.item.id;
        await fetchRoom(code, { silent: true });
        setStatus(editing ? 'Item saved' : 'Item added to vault');
      } catch (e) {
        const warning = $('#item-form-error');
        if (warning) { warning.textContent = e.message; warning.hidden = false; }
        setStatus('Save failed: ' + e.message);
      }
    }}, { text: 'Cancel', onClick: closeDialog },
  ]);
  $('#item-title').value = old?.title ?? 'Text item';
  $('#item-content').value = old?.content ?? pasted;
  if (pasted) $('#item-title').focus();
  else $('#item-content').focus();
}
function deleteSelectedDialog() {
  if (!state.ownerToken || !state.selectedId) return;
  const item = state.items.find(x => x.id === state.selectedId);
  if (!item) return;
  openDialog('Confirm Delete', `<p>Delete this item from the shared vault? This cannot be undone.</p>`, [
    { text: 'Delete', primary: true, onClick: async () => {
      try { const code = state.room.code; await api(`/api/rooms/${code}/items/${item.id}`, { method: 'DELETE', authorize: true }); closeDialog(); await fetchRoom(code, { silent: true }); setStatus('Item deleted'); }
      catch(e) { showError(e); }
    }}, { text: 'Cancel', onClick: closeDialog },
  ]);
}
function deleteVaultDialog() {
  if (!state.ownerToken || !state.room) return setStatus('Only the vault creator can delete this room.');
  openDialog('Delete Vault', `<p>Delete this vault and every item inside it? Room IDs and copied links will stop working immediately.</p>`, [
    { text: 'Delete Vault', primary: true, onClick: async () => {
      try { const code = state.room.code; await api(`/api/rooms/${code}`, { method: 'DELETE', authorize: true }); localStorage.removeItem(ownerStorageKey(code)); closeDialog(); renderHome(); setStatus('Vault deleted'); }
      catch(e) { showError(e); }
    }}, { text: 'Cancel', onClick: closeDialog },
  ]);
}

function settingsDialog() {
  openDialog('clipboard - Settings', [
    '<fieldset class="settings-group d-grid gap-3 mb-3"><legend>Appearance</legend>',
    '<label class="simple-choice d-flex align-items-center gap-3" for="setting-dark"><input type="checkbox" id="setting-dark" class="check"> Dark mode</label>',
    '</fieldset>',
    '<fieldset class="settings-group d-grid gap-3 mb-3"><legend>Vault defaults</legend>',
    '<label for="setting-duration">New vault expires after</label>',
    '<select id="setting-duration" class="form-control"><option value="24h">24 hours</option><option value="7d">7 days</option></select>',
    '<label for="setting-refresh">Auto-refresh shared items</label>',
    '<select id="setting-refresh" class="form-control"><option value="5">Every 5 seconds</option><option value="15">Every 15 seconds</option><option value="30">Every 30 seconds</option><option value="0">Off (manual refresh)</option></select>',
    '</fieldset>',
    '<p class="modal-hint">Preferences are stored in this browser only. The Catppuccin theme is shared by both apps.</p>'
  ].join(''), [
    { text: 'Save', primary: true, onClick: () => {
      try {
        savePreferences({
          theme: $('#setting-dark').checked ? 'dark' : 'light',
          defaultDuration: $('#setting-duration').value,
          refreshSeconds: Number($('#setting-refresh').value)
        });
        closeDialog();
        setStatus('Settings saved');
      } catch (error) { showError(error); }
    }},
    { text: 'Cancel', onClick: closeDialog }
  ]);
  $('#setting-dark').checked = preferences.theme === 'dark';
  $('#setting-duration').value = preferences.defaultDuration;
  $('#setting-refresh').value = String(preferences.refreshSeconds);
}

function infoDialog(privacy = false) {
  openDialog(privacy ? 'Privacy & Sharing' : 'About clipboard', privacy ? `
    <p>Vaults are <strong>not encrypted end-to-end</strong>. Anyone who knows or guesses a room ID can read its items.</p>
    <p>A random owner key is stored only in the creator's browser. It is never included in the share link. Anyone who obtains that key can edit the vault.</p>
    <p>Rooms expire after 24 hours or 7 days. Use HTTPS when running on the internet. Do not store secrets, passwords, or sensitive personal information.</p>
  ` : `
    <p><strong>clipboard 1.0</strong></p><p>A compact cross-device clipboard vault with a minimal Catppuccin interface.</p>
    <p>Create a room, paste text items, then enter the six-character room ID on another device.</p>
    <p class="modal-hint">Visual style uses the shared Catppuccin Bootstrap 6 configuration.</p>
  `, [{ text: 'OK', primary: true, onClick: closeDialog }]);
}
async function action(name) {
  closeSidebar();
  try {
    switch (name) {
      case 'new': createVaultDialog(); break;
      case 'join': joinVaultDialog(); break;
      case 'home': case 'leave': renderHome(); break;
      case 'add': itemDialog(); break;
      case 'paste': {
        if (!state.ownerToken) return setStatus('Open a vault you created to add clipboard text.');
        try { itemDialog(false, await readClipboard()); }
        catch (e) { itemDialog(); setStatus(e.message); }
        break;
      }
      case 'copy': if (state.selectedId) await copyText(state.items.find(x => x.id === state.selectedId)?.content || ''); break;
      case 'edit': itemDialog(true); break;
      case 'remove': deleteSelectedDialog(); break;
      case 'delete-room': deleteVaultDialog(); break;
      case 'refresh': if (state.room) await fetchRoom(state.room.code); break;
      case 'settings': settingsDialog(); break;
      case 'about': infoDialog(); break;
      case 'privacy': infoDialog(true); break;
    }
  } catch (e) { showError(e); }
}

// Application navigation and contextual actions.
$$('[data-action]').forEach(el => el.addEventListener('click', () => action(el.dataset.action)));
$('#toggle-nav').addEventListener('click', () => {
  const open = $('#sidebar').classList.toggle('mobile-open');
  $('#mobile-scrim').classList.toggle('show',open);
  $('#toggle-nav').setAttribute('aria-expanded',String(open));
});
$('#mobile-scrim').addEventListener('click', closeSidebar);
$('#modal-backdrop').addEventListener('click', e => { if (e.target === $('#modal-backdrop')) closeDialog(); });
$('#join-form').addEventListener('submit', async e => { e.preventDefault(); try { await joinRoom($('#join-code').value); } catch(error) { showError(error); } });
$('#join-code').addEventListener('input', formatRoomCodeInput);
$('#sidebar-active').addEventListener('click', () => { if (state.room) { renderRoom(); closeSidebar(); } });
$('#copy-code').addEventListener('click', () => state.room && copyText(displayCode(state.room.code), 'Room ID copied').catch(showError));
$('#copy-link').addEventListener('click', () => {
  if (!state.room) return;
  const url = new URL(location.href); url.searchParams.set('room', state.room.code);
  copyText(url.toString(), 'Room link copied').catch(showError);
});
$('#copy-selected').addEventListener('click', () => action('copy'));
$('#edit-selected').addEventListener('click', () => action('edit'));
$('#delete-selected').addEventListener('click', () => action('remove'));
$('#file-list').addEventListener('keydown', e => {
  const index = state.items.findIndex(x => x.id === state.selectedId);
  const next = e.key === 'ArrowDown' ? Math.min(state.items.length - 1, index + 1) : e.key === 'ArrowUp' ? Math.max(0, index - 1) : -1;
  if (next >= 0 && state.items[next]) { e.preventDefault(); state.selectedId = state.items[next].id; renderItems(); $(`[data-item-id="${state.selectedId}"]`)?.focus(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#modal-backdrop').hidden) closeDialog(); else closeSidebar(); return; }
  if (!$('#modal-backdrop').hidden) {
    if (e.key === 'Enter' && (e.ctrlKey || (e.target.tagName === 'INPUT' && !e.shiftKey))) {
      const primary = $('#dialog-actions .primary');
      if (primary) { e.preventDefault(); primary.click(); }
    }
    if (e.key === 'Tab') {
      const focusable = $$('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)', $('#modal-backdrop'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); action('new'); }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); action('join'); }
  if (e.key === 'F5') { e.preventDefault(); action('refresh'); }
});
// Keep the canonical GitHub Pages address free of click-source tracking parameters.
const pageAddress = new URL(location.href);
let cleanTracking = false;
for (const key of [...pageAddress.searchParams.keys()]) {
  if (/^utm_/i.test(key)) { pageAddress.searchParams.delete(key); cleanTracking = true; }
}
if (cleanTracking) history.replaceState(null, '', pageAddress);
applyAppearance();
syncButtons();
const initialCode = new URLSearchParams(location.search).get('room');
if (initialCode) joinRoom(initialCode).catch(e => { renderHome(); setStatus('Room unavailable: ' + e.message); });

// GitHub Pages hosts the UI only. Make missing backend configuration visible.
if (location.hostname.endsWith('.github.io') && !window.CLIPBOARD_API_BASE) {
  const notice = $('#deployment-notice');
  if (notice) {
    notice.hidden = false;
    notice.textContent = 'Sharing service not connected yet. An API endpoint must be configured before creating or joining vaults.';
  }
}
