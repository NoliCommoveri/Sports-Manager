// theme.js — color theme: applies the saved choice to <html data-theme> and
// wires the footer swatch switcher. A device-local preference (see store.js),
// separate from the imported bundle — it's not something the team admin sets.
import { getThemePreference, setThemePreference } from './store.js';

export const THEMES = [
  { id: 'field-green',         label: 'Field Green',   primary: '#1f6f43', accent: '#d97706' },
  { id: 'friday-night-lights', label: 'Friday Lights', primary: '#13294b', accent: '#ffb81c' },
  { id: 'end-zone-crimson',    label: 'End Zone',      primary: '#8a1538', accent: '#c9971f' },
  { id: 'turf-slate',          label: 'Turf Slate',    primary: '#2c2f2b', accent: '#7cb518' },
];

function applyTheme(themeId) {
  document.documentElement.dataset.theme = themeId;
  const theme = THEMES.find(t => t.id === themeId);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && theme) meta.content = theme.primary;
}

export function initTheme() {
  applyTheme(getThemePreference() || 'field-green');
}

export function initThemeSwitcher(containerEl) {
  const current = getThemePreference() || 'field-green';
  containerEl.innerHTML = '<span class="theme-switcher-label">Theme</span>' + THEMES.map(t => `
    <button type="button" class="theme-swatch${t.id === current ? ' active' : ''}"
      data-theme-id="${t.id}" title="${t.label}" aria-label="${t.label} theme"
      aria-pressed="${t.id === current}"
      style="--swatch-primary:${t.primary};--swatch-accent:${t.accent}"></button>
  `).join('');

  containerEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.theme-swatch');
    if (!btn) return;
    const id = btn.dataset.themeId;
    setThemePreference(id);
    applyTheme(id);
    containerEl.querySelectorAll('.theme-swatch').forEach(b => {
      const active = b.dataset.themeId === id;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  });
}
