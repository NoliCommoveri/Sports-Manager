// parent-link.js — turns a Parent App bundle (see data.js exportParentBundle)
// into a shareable link. No localStorage access (I-1 doesn't apply here; this
// file never touches storage). Uses only the built-in CompressionStream — no
// vendored/CDN library, honoring I-2 (zero third-party origins at runtime).

async function compress(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Serializes `bundle`, deflates it, and appends it as a URL-safe `#b=...`
// fragment on `baseUrl` (the deployed Parent App URL, e.g. from settings).
// The payload lives entirely in the `#hash` (D-3): fragments are never sent
// to the GitHub Pages host, so the parent/child names and balance inside
// never reach a server log.
export async function bundleToHashUrl(bundle, baseUrl) {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  const compressed = await compress(bytes);
  return `${baseUrl}#b=${toBase64Url(compressed)}`;
}

// The deployed Parent App's URL, derived relative to this page (I-5) — the
// two apps are sibling folders under the same Pages site, whatever that
// site's own base path happens to be.
export function parentAppBaseUrl() {
  return new URL('../Parent/', window.location.href).href;
}
