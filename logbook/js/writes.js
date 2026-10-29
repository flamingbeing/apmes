// The logbook's write queue (app-sync's createWriteQueue, sync-app.js): every case, reflection and note save goes to the outbox
// on this device first (recovery-store.js), then to Firestore one record at a time, in order (cloud.commitRecord). A
// save that fails or meets a change made elsewhere is kept in Recover until the resident chooses; it never expires.
// ui-core.js sets the commit once cloud.js has loaded; the queue sends again when the signal returns.
import { createWriteQueue } from './app-sync.js';
import { queue, outside } from './sync-app.js';
export { createWriteQueue, outside };

export const writes = queue;
