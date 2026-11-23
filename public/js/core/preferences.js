export const PREFERENCES_KEY = 'clipboard.preferences.v1';
const DEFAULT_PREFERENCES = Object.freeze({ theme: 'dark', defaultDuration: '24h', refreshSeconds: 5 });
export function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    return {
      theme: saved.theme === 'light' ? 'light' : 'dark',
      defaultDuration: saved.defaultDuration === '7d' ? '7d' : '24h',
      refreshSeconds: [0, 5, 15, 30].includes(saved.refreshSeconds) ? saved.refreshSeconds : 5
    };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
