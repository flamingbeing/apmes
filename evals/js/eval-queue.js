// Saves of evaluations through app-sync's write queue (cloud.js uses it; People and CCC sign in through cloud.js too).
// Every create, change and draft delete goes to a durable outbox on this device first, then to Firestore one record
// at a time in a transaction, so a form filled in without signal is kept even if the browser drops the SDK's cache,
// the status chip can tell what is still unsent, and sign-out can refuse while anything is.
//
// createEvalQueue({ sdk, store, getOwner, online, otherPending, delay, sendTimeout })
//   sdk: async () => ({ db, F }) (cloud.js). store: the outbox (createOutbox, or a stand-in in tests). getOwner: the
//   signed-in email. otherPending: writes sent straight to the SDK (People's batches, roles) not yet on the server.
// -> { queue, fs, codeOf(id), clearCache }
//   Changes are merged by field onto the server's copy (app-sync merge: true): the resident and the assessor change
//   different fields of one evaluation, and the rules (logbook/firestore.rules) decide who may change what. A new
//   evaluation is written without reading first (the rules can't answer a read of a document that isn't there yet
//   for anyone but staff); a resend whose first copy did land is answered from the server's copy.
import { createWriteQueue, createFirestoreBackend } from './app-sync.js';

export const KIND = 'evaluation';
export const COLL = 'evaluations';

export function createEvalQueue({ sdk, store, getOwner, online = () => typeof navigator === 'undefined' || navigator.onLine !== false, otherPending = null, delay, sendTimeout }) {
  const fs = createFirestoreBackend({ sdk, path: () => [COLL], merge: { [COLL]: true } });
  const codes = new Map();   // record id -> the code of its last refused save ('permission-denied', …), for the screens
  async function create(record) {
    const { db, F } = await sdk();
    const ref = F.doc(db, COLL, String(record.id));
    try {
      // a transaction never waits in the SDK's own offline queue: offline it fails and the outbox keeps the save
      await F.runTransaction(db, async tx => { tx.set(ref, record); });
      return record;
    } catch (e) {
      // sent before, and that one landed (its answer was lost): a second create is an update the rules may refuse
      if (e?.code === 'permission-denied') {
        const snap = await F.getDocFromServer(ref).catch(() => null);
        if (snap?.exists() && snap.data().residentEmail === record.residentEmail) return { ...snap.data(), id: snap.id };
      }
      throw e;
    }
  }
  async function backend(owner, kind, record, base, extra) {
    if (kind !== KIND) throw new Error('Unknown kind ' + kind);
    try {
      const out = !base && !record._deleted ? await create(record) : await fs.commit(owner, COLL, record, base, extra);
      codes.delete(String(record.id));
      return out;
    } catch (e) { codes.set(String(record.id), e?.code || ''); throw e; }
  }
  const queue = createWriteQueue({ store, backend, getOwner, online, otherPending, labels: { recover: 'Unsent changes' },
    ...(delay ? { delay } : {}), ...(sendTimeout ? { sendTimeout } : {}) });
  return { queue, fs, codeOf: id => codes.get(String(id)) || '' };
}
