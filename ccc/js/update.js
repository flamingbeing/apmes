// CCC's offline copy and updates, on the shared update core (app-update), the exact version sw.js loads. A new version
// takes over at once, but the page reloads only when `canReload` says nobody is typing, no sheet is open and no change is
// sending. Loaded with import() so the app still runs when the core's site can't be reached.
export const UPDATE_CORE = 'https://core.anawj.com/update/0.2.0/register.js';
let core = null;

export async function startUpdates({ canReload, beforeReload } = {}) {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || new URLSearchParams(location.search).has('nosw')) return null;
  try { core = await import(UPDATE_CORE); await core.register({ app: 'ccc', sw: 'sw.js', canReload, beforeReload }); return core; }
  catch (err) { console.warn('Service worker not registered', err); return null; }
}
// after the reason to wait has gone (a sheet closed, the last change sent): take over now if one is owed
export const retryUpdate = () => core ? core.retryUpdate() : Promise.resolve();
// '2026-10-24 (ab12cd34)', or '' when there is no saved copy on this device
export async function versionText() { try { return core ? await core.versionLabel() : ''; } catch { return ''; } }
// throws a short reason (changes still sending, no connection) the caller shows
export async function getLatest({ canReload } = {}) { if (!core) throw new Error('No saved copy on this device'); return core.forceLatest({ canReload }); }

// May a new version reload the page now? Not while a sheet is open, someone is typing, changes are sending or text is
// typed and not saved on this device yet.
export const reloadAllowed = ({ sheetOpen = false, typing = false, unsent = 0, unsaved = false } = {}) => !sheetOpen && !typing && !(unsent > 0) && !unsaved;
