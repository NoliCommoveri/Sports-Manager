// import.js — hash -> decode -> validate -> store. The imported bundle is
// untrusted input (inherited I-3): every field is escaped at render time in
// the views, never trusted here beyond shape-checking.
import { setBundle } from './store.js';

const MAX_SUPPORTED_BUNDLE_VERSION = 1;

async function decompress(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();

  const chunks = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(str.length + (4 - (str.length % 4)) % 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isValidBundle(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
  if (typeof b.bundleVersion !== 'number') return false;
  if (!b.team || typeof b.team !== 'object') return false;
  return Array.isArray(b.children) && Array.isArray(b.schedule) && Array.isArray(b.fundraisers);
}

// Reads location.hash (if it's a `#b=...` bundle link), decodes it, and
// stores it. Returns one of:
//   'imported'         — new bundle stored
//   'refused-too-new'  — bundleVersion is newer than this app understands;
//                         existing store left untouched (mirrors the admin's
//                         importBackup "newer version" refusal)
//   'invalid'          — link was malformed/corrupt; existing store untouched
//   'none'             — no `#b=` hash present at all
// The hash is cleared from the address bar in every case (not just success)
// so the payload never lingers in browser history.
export async function importFromHash() {
  const hash = window.location.hash;
  if (!hash.startsWith('#b=')) return 'none';

  const payload = hash.slice(3);
  history.replaceState(null, '', window.location.pathname + window.location.search);

  let bundle;
  try {
    const compressed = fromBase64Url(payload);
    const decompressed = await decompress(compressed);
    bundle = JSON.parse(new TextDecoder().decode(decompressed));
  } catch {
    return 'invalid';
  }

  if (!isValidBundle(bundle)) return 'invalid';
  if (bundle.bundleVersion > MAX_SUPPORTED_BUNDLE_VERSION) return 'refused-too-new';

  setBundle(bundle);
  return 'imported';
}
