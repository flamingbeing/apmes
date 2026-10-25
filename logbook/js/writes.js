// The logbook's write queue (app-sync's createWriteQueue): every case, reflection and note save goes to the outbox on
// this device first (recovery-store.js), then to Firestore one record at a time, in order (cloud.commitRecord). A save
// that fails or meets a change made elsewhere is kept in Recover until the resident chooses; it never expires.
// ui-core.js configures the backend once cloud.js has loaded.
import { createWriteQueue } from './app-sync.js';
import { recoveryStore } from './recovery-store.js';
export { createWriteQueue };

// outside.pending: writes sent straight to Firestore (photos, settings, the notes index...) not yet on the server; they
// keep the sign-out check (writes.flush) shut too (app-sync 0.4.0 otherPending). ui-core.js sets it once cloud.js loads.
export const outside = { pending: async () => false };
export const writes = createWriteQueue({ store: recoveryStore, online: () => typeof navigator === 'undefined' || navigator.onLine !== false, labels: { recover: 'Recover' }, otherPending: () => outside.pending() });
if (typeof window !== 'undefined') window.addEventListener('online', () => writes.kick());
