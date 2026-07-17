// app.js — bootstrap: import any link hash, brand the header from the
// bundle, then start the router. Also runs the iOS "you're in the browser,
// not the installed app" hint (§6 of PARENT-APP-SPEC.md).
import { importFromHash } from './import.js';
import { initRouter } from './router.js';
import { getBundle } from './store.js';

export async function boot() {
  const result = await importFromHash();
  applyBranding();
  showImportBanner(result);
  initRouter(document.getElementById('outlet'), document.getElementById('main-nav'));
  showBrowserTabBanner();
}

function applyBranding() {
  const bundle = getBundle();
  const teamName = bundle?.team?.name?.trim();
  const title = teamName ? `${teamName} Parent App` : 'Team Parent App';
  document.title = title;
  document.getElementById('app-title').textContent = title;
}

function showImportBanner(result) {
  const el = document.getElementById('import-banner');
  if (result === 'refused-too-new') {
    el.hidden = false;
    el.textContent = "This link was made by a newer version of the app than this device has. "
      + "Reopen this page while online so it can update, then tap the link again.";
  } else if (result === 'invalid') {
    el.hidden = false;
    el.textContent = "That link couldn't be opened — it may be incomplete or corrupted. "
      + 'Ask your team admin to resend it.';
  } else {
    el.hidden = true;
  }
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function showBrowserTabBanner() {
  const el = document.getElementById('browser-tab-banner');
  if (isStandalone()) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = "You're viewing this in your browser — Safari and a home-screen app keep "
    + 'separate copies. Tap Share → Add to Home Screen to save this; do that again each time '
    + 'you get a new link to keep your home-screen app up to date.';
}
