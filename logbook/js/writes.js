// The logbook's write queue (app-sync's createWriteQueue): every case, reflection and note save goes to the outbox on
// this device first (recovery-store.js), then to Firestore one record at a time, in order (cloud.commitRecord). A save
// that fails or meets a change made elsewhere is kept in Recover until the resident chooses; it never expires.
// ui-core.js configures the backend once cloud.js has loaded.
import { createWriteQueue } from './app-sync.js';
import { recoveryStore } from './recovery-store.js';
export { createWriteQueue };

export const writes = createWriteQueue({ store: recoveryStore, online: () => typeof navigator === 'undefined' || navigator.onLine !== false, labels: { recover: 'Recover' } });
if (typeof window !== 'undefined') window.addEventListener('online', () => writes.kick());
