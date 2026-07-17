// store.js — the only file that touches localStorage (inherited I-1).
// Holds the last imported Parent App bundle, verbatim, plus an import
// timestamp. Separate storage key from the admin app (`stm:v1`), so the two
// apps never collide even if ever loaded from the same origin.

const STORAGE_KEY = 'stm-parent:v1';
// Color theme is a device-local display preference, not part of the imported
// bundle (which gets overwritten on every import) — its own key so a fresh
// bundle import never resets it.
const THEME_KEY = 'stm-parent:theme';

function readEnvelope() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getBundle() {
  return readEnvelope()?.bundle ?? null;
}

export function getImportedAt() {
  return readEnvelope()?.importedAt ?? null;
}

export function setBundle(bundle) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    bundle,
    importedAt: new Date().toISOString()
  }));
}

export function getThemePreference() {
  return localStorage.getItem(THEME_KEY);
}

export function setThemePreference(themeId) {
  localStorage.setItem(THEME_KEY, themeId);
}
