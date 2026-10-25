// The logbook on app-sync's createApp: one write queue (writes.js) on the outbox kept since before app-sync
// (recovery-store.js, "apmes-logbook-recovery"), the device stores (store.js, same names as before) and the origin's
// outbox list, which makes the sign-out check (writes.flush) wait for unsent saves in Evals and CCC too, and
// writes.forget forget this account in theirs (they share the sign-in on this site).
// The logbook keeps its own sync hub, listeners, watchdog, chip and sign-out order (cloud.js): its demo listener,
// read counter and late restamps are not createApp's. The commit and the SDK are set by ui-core.js once cloud.js loads
// (cloud.commitRecord: the logbook's own transaction, conflicts held in Recover, never newest-wins).
import { createApp } from './app-sync.js';
import { recoveryStore } from './recovery-store.js';

export const COLLS = ['cases', 'reflections', 'notes'];
const demo = (() => { try { return typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'); } catch { return false; } })();
// the other apps on this site (their outboxes, as they name them)
const SIBLINGS = [{ name: 'apmes-evals-outbox' }, { name: 'ccc-outbox' }];

// outside.pending: writes sent straight to Firestore (photos, settings, the notes index...) not yet on the server; they
// keep the sign-out check (writes.flush) shut too (otherPending). ui-core.js sets it once cloud.js loads.
export const outside = { pending: async () => false };
export const hooks = {
  commit: async () => { throw Object.assign(new Error('The logbook has not loaded yet'), { code: 'unavailable' }); },
  sdk: async () => { throw new Error('The logbook has not loaded yet'); },
};

export const app = createApp({
  name: 'apmes-logbook', colls: COLLS, kinds: { case: 'cases', reflection: 'reflections', note: 'notes' },
  path: (email, coll) => ['logbooks', email, coll], sdk: () => hooks.sdk(),
  outbox: recoveryStore, commit: (...a) => hooks.commit(...a), watchEvery: 0,
  stores: { prefix: 'apmes-logbook-store:', realm: demo ? 'demo:' : '' },
  queue: { labels: { recover: 'Recover' }, otherPending: () => outside.pending() },
  // the demo's saves stay out of the origin's list (another app's sign-out never waits for them)
  ...(demo ? { storage: null } : {}),
});
for (const o of SIBLINGS) app.parts.registry?.register(o);
