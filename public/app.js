const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { room: null, items: [], ownerToken: null, selectedId: null, minimized: false, maximized: false, refreshPending: false };
let refreshTimer = null;
let statusTimer = null;
let previousFocus = null;
const CODE_RE = /^[A-HJ-KM-NP-Z2-9]{6}$/;

function codeFrom(value) {
  const code = String(value || '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(code) ? code : null;
}
function displayCode(code) { return code.slice(0, 3) + '-' + code.slice(3); }
function dateLabel(value) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function timeLabel(value) { return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
function ownerStorageKey(code) { return 'clipboard.owner.' + code; }
function setStatus(text) {
  $('#status-text').textContent = text;
  clearTimeout(statusTimer);
  if (text !== 'Ready') statusTimer = setTimeout(() => { $('#status-text').textContent = 'Ready'; }, 5000);
}
function showError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  setStatus('Error: ' + msg);
  openDialog('clipboard - Error', '<p>⚠ <span id="error-message"></span></p>', [
    { text: 'OK', primary: true, onClick: closeDialog },
  ]);
  $('#error-message').textContent = msg;
}
async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...options.headers };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.authorize && state.ownerToken) headers.Authorization = 'Bearer ' + state.ownerToken;
  const configuredBase = String(window.CLIPBOARD_API_BASE || '').trim();
  if (location.hostname.endsWith('.github.io') && !configuredBase) {
    throw new Error('Sharing backend not configured. Deploy the API and set the GitHub repository variable CLIPBOARD_API_BASE.');
  }
  const baseUrl = configuredBase ? configuredBase.replace(/\/+$/, '') : location.origin;
  const endpoint = new URL(baseUrl + path);
  if (configuredBase && endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost') {
    throw new Error('The sharing API must use HTTPS.');
  }
  const response = await fetch(endpoint, { method: options.method || 'GET', headers, body: options.body ? JSON.stringify(options.body) : undefined, cache: 'no-store', credentials: 'omit' });
  let body;
  try { body = await response.json(); } catch { throw new Error('Server returned an invalid response.'); }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
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
function setUrl(code = null) {
  const next = new URL(location.href);
  if (code) next.searchParams.set('room', code);
  else next.searchParams.delete('room');
  history.replaceState(null, '', next);
}
function stopPolling() { clearInterval(refreshTimer); refreshTimer = null; }
function setWindowVisible(visible) {
  state.minimized = !visible;
  $('#app-window').hidden = !visible;
  $('#taskbar-app').classList.toggle('win98-sunken', visible);
  $('#taskbar-app').classList.toggle('win98-raised', !visible);
  if (visible) $('#app-window').focus?.();
  closeMenus();
}
function toggleMaximize() {
  if (matchMedia('(max-width: 650px)').matches) return;
  state.maximized = !state.maximized;
  $('#app-window').classList.toggle('maximized', state.maximized);
  $('#win-max').textContent = state.maximized ? '❐' : '□';
  $('#win-max').title = state.maximized ? 'Restore' : 'Maximize';
}
function closeMenus() {
  $$('[data-menu-popup]').forEach(x => { x.hidden = true; });
  $$('[data-menu]').forEach(x => x.setAttribute('aria-expanded', 'false'));
  $('#start-menu').hidden = true;
}
function openMenu(name) {
  const popup = $(`[data-menu-popup="${name}"]`);
  const isOpen = !popup.hidden;
  closeMenus();
  popup.hidden = isOpen;
  $(`[data-menu="${name}"]`).setAttribute('aria-expanded', String(!isOpen));
}
function openDialog(title, html, actions = []) {
  closeMenus();
  previousFocus = document.activeElement;
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = html; // Only application-owned constant markup; never untrusted vault content.
  $('#dialog-actions').replaceChildren();
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.text;
    button.className = 'win98-button' + (action.primary ? ' primary' : '');
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
function renderHome() {
  state.room = null; state.items = []; state.ownerToken = null; state.selectedId = null;
  stopPolling(); setUrl();
  $('#home-screen').hidden = false;
  $('#room-screen').hidden = true;
  $('#sidebar-active').hidden = true; $('#sidebar-none').hidden = false;
  $('#breadcrumb').textContent = 'C:\\Clipboard\\';
  $('#window-title').textContent = 'clipboard - Vault Explorer';
  $('#status-count').textContent = '0 item(s)';
  $('#status-mode').textContent = 'Vault Explorer';
  syncButtons();
  setStatus('Ready');
  setWindowVisible(true);
}
function syncButtons() {
  const canEdit = Boolean(state.room && state.ownerToken);
  const selected = Boolean(state.room && state.selectedId && state.items.some(x => x.id === state.selectedId));
  $('#toolbar-add').disabled = !canEdit;
  $('#toolbar-copy').disabled = !selected;
  $('#toolbar-refresh').disabled = !state.room;
  $('#add-item').hidden = !canEdit;
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
  $('#sidebar-active').hidden = false;
  $('#sidebar-none').hidden = true;
  $('#sidebar-room').textContent = displayCode(room.code);
  $('#room-title').textContent = room.title;
  $('#room-caption').textContent = `Created ${timeLabel(room.createdAt)}`;
  $('#room-code').textContent = displayCode(room.code);
  $('#room-expiry').textContent = `Expires ${timeLabel(room.expiresAt)}`;
  $('#breadcrumb').textContent = `C:\\Clipboard\\${displayCode(room.code)}\\`;
  $('#window-title').textContent = `${room.title} - clipboard`;
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
    empty.className = 'file-empty';
    empty.textContent = state.ownerToken ? 'This vault is empty. Select "New item" to add your first snippet.' : 'This vault is empty. Its creator has not added any items yet.';
    list.append(empty);
  } else {
    for (const item of state.items) {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'file-row'; row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(state.selectedId === item.id));
      row.dataset.itemId = item.id;
      const name = document.createElement('span'); name.className = 'file-name';
      name.textContent = '▤ ' + item.title;
      const date = document.createElement('span'); date.className = 'file-date'; date.textContent = dateLabel(item.created_at);
      row.append(name, date);
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
  setWindowVisible(true);
  setStatus('Connected to ' + displayCode(code));
  refreshTimer = setInterval(() => {
    if (!document.hidden && state.room?.code === code) fetchRoom(code, { silent: true }).catch(() => {});
  }, 5000);
}
function createVaultDialog() {
  openDialog('Create a New Vault', `
    <p>Create a temporary vault. Anyone with its code can read and copy its contents.</p>
    <div class="modal-field"><label for="new-vault-name">Vault name:</label><input id="new-vault-name" maxlength="60" value="My Clipboard" required></div>
    <div class="modal-field"><label for="new-vault-duration">Keep vault for:</label><select id="new-vault-duration"><option value="24h">24 hours</option><option value="7d">7 days</option></select></div>
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
  $('#new-vault-name').select();
}
function joinVaultDialog() {
  openDialog('Join a Vault', `
    <p>Type the room ID provided by the vault creator.</p>
    <div class="modal-field"><label for="modal-join-code">Room ID:</label><input id="modal-join-code" class="code-input" maxlength="7" placeholder="K7P-4MX" autocomplete="off" spellcheck="false" required></div>
    <p class="modal-hint">Room codes are case-insensitive. You can copy items without an account.</p>
  `, [
    { text: 'Join', primary: true, onClick: async () => {
      try { await joinRoom($('#modal-join-code').value); closeDialog(); }
      catch(e) { showError(e); }
    }}, { text: 'Cancel', onClick: closeDialog },
  ]);
}
function itemDialog(editing = false, pasted = '') {
  if (!state.room || !state.ownerToken) return setStatus('Only the vault creator can add or edit items.');
  const old = editing ? state.items.find(x => x.id === state.selectedId) : null;
  if (editing && !old) return;
  openDialog(editing ? 'Edit Clipboard Item' : 'New Clipboard Item', `
    <div class="modal-field"><label for="item-title">Item name:</label><input id="item-title" maxlength="80" placeholder="Snippet name" required></div>
    <div class="modal-field"><label for="item-content">Text content:</label><textarea id="item-content" maxlength="16000" placeholder="Paste text here (Ctrl+V)..." required></textarea></div>
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
function infoDialog(privacy = false) {
  openDialog(privacy ? 'Privacy & Sharing' : 'About clipboard', privacy ? `
    <p>Vaults are <strong>not encrypted end-to-end</strong>. Anyone who knows or guesses a room ID can read its items.</p>
    <p>A random owner key is stored only in the creator's browser. It is never included in the share link. Anyone who obtains that key can edit the vault.</p>
    <p>Rooms expire after 24 hours or 7 days. Use HTTPS when running on the internet. Do not store secrets, passwords, or sensitive personal information.</p>
  ` : `
    <p><strong>clipboard 1.0</strong></p><p>A tiny cross-device clipboard vault with a Windows 95/98 interface.</p>
    <p>Create a room, paste text items, then enter the six-character room ID on another device.</p>
    <p class="modal-hint">Visual style follows Chris Lemke's Windows 95/98 design reference.</p>
  `, [{ text: 'OK', primary: true, onClick: closeDialog }]);
}
async function action(name) {
  closeMenus();
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
      case 'maximize': toggleMaximize(); break;
      case 'about': infoDialog(); break;
      case 'privacy': infoDialog(true); break;
    }
  } catch (e) { showError(e); }
}

// Window chrome and menus.
$$('[data-action]').forEach(el => el.addEventListener('click', () => action(el.dataset.action)));
$$('[data-menu]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); openMenu(el.dataset.menu); }));
document.addEventListener('click', event => {
  if (!event.target.closest('.menu-wrap') && !event.target.closest('.taskbar-start-wrap')) closeMenus();
});
$('#start-button').addEventListener('click', e => { e.stopPropagation(); const open = $('#start-menu').hidden; closeMenus(); $('#start-menu').hidden = !open; });
$('#taskbar-app').addEventListener('click', () => setWindowVisible(state.minimized));
$('#desktop-shortcut').addEventListener('click', () => setWindowVisible(true));
$('#win-min').addEventListener('click', () => setWindowVisible(false));
$('#win-close').addEventListener('click', () => setWindowVisible(false));
$('#win-max').addEventListener('click', toggleMaximize);
$('#dialog-close').addEventListener('click', closeDialog);
$('#modal-backdrop').addEventListener('click', e => { if (e.target === $('#modal-backdrop')) closeDialog(); });
$('#join-form').addEventListener('submit', async e => { e.preventDefault(); try { await joinRoom($('#join-code').value); } catch(error) { showError(error); } });
$('#sidebar-active').addEventListener('click', () => state.room && renderRoom());
$('#copy-code').addEventListener('click', () => state.room && copyText(displayCode(state.room.code), 'Room ID copied').catch(showError));
$('#copy-link').addEventListener('click', () => {
  if (!state.room) return;
  const url = new URL(location.href); url.searchParams.set('room', state.room.code);
  copyText(url.toString(), 'Room link copied').catch(showError);
});
$('#copy-selected').addEventListener('click', () => action('copy'));
$('#edit-selected').addEventListener('click', () => action('edit'));
$('#delete-selected').addEventListener('click', () => action('remove'));
$('#add-item').addEventListener('click', () => action('add'));
$('#file-list').addEventListener('keydown', e => {
  const index = state.items.findIndex(x => x.id === state.selectedId);
  const next = e.key === 'ArrowDown' ? Math.min(state.items.length - 1, index + 1) : e.key === 'ArrowUp' ? Math.max(0, index - 1) : -1;
  if (next >= 0 && state.items[next]) { e.preventDefault(); state.selectedId = state.items[next].id; renderItems(); $(`[data-item-id="${state.selectedId}"]`)?.focus(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#modal-backdrop').hidden) closeDialog(); else closeMenus(); return; }
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
function updateClock() { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
updateClock(); setInterval(updateClock, 15000);
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
