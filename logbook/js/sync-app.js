// The logbook's parts from app-sync 1.x (index.js): one write queue (writes.js) on the outbox kept since before
// app-sync (recovery-store.js, "apmes-logbook-recovery"), the device stores (store.js, same names as before) and the
// origin's outbox list, which makes the sign-out check (writes.flush) wait for unsent saves in Evals and CCC too, and
// writes.forget forget this account in theirs (they share the sign-in on this site).
// Built from the parts, not app-sync's modules (createApp + auth + sync): the logbook keeps its own sign-in, sync hub,
// listeners, watchdog, chip and sign-out order (cloud.js, app.js); its demo listener and read counter are not the sync
// module's. Until 1.0 the one-object createApp built these same parts; the stored formats are unchanged (FORMATS.md),
// so saves waiting on a phone when it updates are still sent. The commit is set by ui-core.js once cloud.js loads
// (cloud.commitRecord: app-sync's held conflicts by field, a same-field clash held in Recover, never newest-wins).
import { createWriteQueue, createStores, createOutboxRegistry } from './app-sync.js';
import { recoveryStore } from './recovery-store.js';

export const COLLS = ['cases', 'reflections', 'notes'];
const demo = (() => { try { return typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'); } catch { return false; } })();
// the other apps on this site (their outboxes, as they name them)
const SIBLINGS = [{ name: 'apmes-evals-outbox' }, { name: 'ccc-outbox' }];
// the engine's own fields on a record (save keys, the server's stamp, who changed what: held conflicts), left out when
// the queue compares versions, as createApp had them
const ENGINE = ['_saves', 'serverAt', '_edits'];

// outside.pending: writes sent straight to Firestore (photos, settings, the notes index...) not yet on the server; they
// keep the sign-out check (writes.flush) shut too (otherPending). ui-core.js sets it once cloud.js loads.
export const outside = { pending: async () => false };
export const hooks = {
  commit: async () => { throw Object.assign(new Error('The logbook has not loaded yet'), { code: 'unavailable' }); },
};

export const stores = createStores({ prefix: 'apmes-logbook-store:', colls: COLLS, realm: demo ? 'demo:' : '' });

// the demo's saves stay out of the origin's list (another app's sign-out never waits for them)
let registry = null;
if (!demo) {
  try {
    registry = createOutboxRegistry({ storage: globalThis.localStorage });
    registry.register(recoveryStore);
    for (const o of SIBLINGS) registry.register(o);
  } catch (e) { registry = null; console.warn('outbox registry', e?.message); }
}

const nav = typeof navigator !== 'undefined' ? navigator : null;
// kinds: case, reflection, note (the records) and bin (a record's recycle-bin entry, bin.js; saved before the
// record's delete, which waits for it: cloud.commitRecord)
export const queue = createWriteQueue({
  store: recoveryStore, registry, online: () => nav?.onLine !== false,
  field: 'updatedAt', engine: ENGINE, ignore: ENGINE,
  labels: { recover: 'Recover' }, otherPending: () => outside.pending(),
  backend: (...a) => hooks.commit(...a),
});
// going online sends at once (no waiting out the backoff)
if (typeof window !== 'undefined') window.addEventListener?.('online', () => { void queue.kick(); });
