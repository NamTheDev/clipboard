/** Network adapter. Ownership is read when each request is sent, never cached. */
export function createApi(getOwnerToken) {
return async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...options.headers };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.authorize && getOwnerToken()) headers.Authorization = 'Bearer ' + getOwnerToken();
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
}
