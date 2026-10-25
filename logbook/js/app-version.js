// Which app version this device runs, and a forced fresh copy (Settings, bottom; owner, 14 Oct 2026, as in the
// prewarming app). The version is the service worker's cache name, stamped at deploy ('logbook-2026-10-14-3f9a2c1d'
// or the older 'logbook-v41-3f9a2c1d'; tools/stamp-versions.mjs). startUpdates(canReload) registers sw.js through the
// shared update core (app-update): a new version installs in the background and waits until canReload() says yes (no
// one typing, nothing sending), then takes over and the page reloads once; checked on every return to the app, on
// coming back online and every 3 h. retryUpdate(): try an update that is waiting now (the reason to wait has gone).

// the page module of the update core, the exact version sw.js loads (and keeps offline in SHELL)
export const UPDATE_CORE = 'https://core.anawj.com/update/0.2.0/register.js';

// loaded with import() so the app still runs when the core's site can't be reached (the worker then stays as it is)
let core = null;
export async function startUpdates(canReload) {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || new URLSearchParams(location.search).has('nosw')) return null;
  try { core = await import(UPDATE_CORE); return await core.register({ app: 'logbook', sw: 'sw.js', canReload }); }
  catch (err) { console.warn('Service worker not registered', err); return null; }
}
export function retryUpdate() { return core ? core.retryUpdate().catch(() => {}) : Promise.resolve(); }

// '2026-10-14 (3f9a2c1d)' for a stamped name; anything else (a local copy, no service worker) as it is
export function versionLabel(name) {
  const v = String(name || '').replace(/^logbook-/, '');
  const d = /^(\d{4}-\d{2}-\d{2})-([0-9a-f]{8})$/.exec(v);
  return d ? `${d[1]} (${d[2]})` : v || 'unknown';
}

// the saved copy's name ('no-sw' without one): the dated names first, so a leftover older-style copy doesn't win
export async function appVersion() {
  try {
    const ks = (await caches.keys()).filter(k => k.startsWith('logbook-') && !k.startsWith('logbook-rt-'));   // not the files kept on first use
    return ks.filter(k => /^logbook-\d{4}-/.test(k)).sort().pop() || ks.sort().pop() || 'no-sw';
  } catch { return 'no-sw'; }
}

// Throws the saved copy of the app away (this app's service worker and its cache: never the logbook's data, drafts or
// this device's settings, and never the other apps on the site) and reloads from the server. Only when the server
// answers: offline, the saved copy is what lets the app open, so it stays (returns false).
export async function freshCopy() {
  try { if (!(await fetch('index.html', { cache: 'no-store' })).ok) return false; } catch { return false; }
  const scope = new URL('./', location.href).href;
  try { for (const r of await navigator.serviceWorker.getRegistrations()) if (r.scope === scope) await r.unregister(); } catch { /* reload anyway */ }
  try { for (const k of await caches.keys()) if (k.startsWith('logbook-')) await caches.delete(k); } catch { /* reload anyway */ }
  location.reload();
  return true;
}
