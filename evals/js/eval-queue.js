// Saves of evaluations through app-sync's write queue (cloud.js uses it; People and CCC sign in through cloud.js too).
// Every create, change and draft delete goes to a durable outbox on this device first, then to Firestore one record
// at a time in a transaction, so a form filled in without signal is kept even if the browser drops the SDK's cache,
// the status chip can tell what is still unsent, and sign-out can refuse while anything is.
//
// createEvalQueue({ sdk, store, getOwner, online, otherPending, delay, sendTimeout })
//   sdk: async () => ({ db, F }) (cloud.js). store: the outbox (createOutbox, or a stand-in in tests). getOwner: the
//   signed-in email. otherPending: writes sent straight to the SDK (People's batches, roles) not yet on the server.
// -> { queue, fs, codeOf(id) }
//   Changes are merged by field onto the server's copy (mergeEval): the resident and the assessor change different
//   fields of one evaluation, and the rules (logbook/firestore.rules) decide who may change what. When the status
//   flow moved on elsewhere since the edit started (the resident cancelled or reassigned while the assessor answered
//   offline, the assessor submitted while the resident edited), the save is a conflict (kept, shown in Unsent
//   changes with the server's copy) instead of a refusal that would block the sign-out check for good. A new
//   evaluation already on the server is left as it is (a resend whose answer was lost); otherwise it is written
//   without a transaction read (the rules can't answer a non-staff read of a document that isn't there yet).
import { createWriteQueue, createFirestoreBackend, mergeFields, recordSignature } from './app-sync.js';
import { stampPatch } from './schema.js';

export const KIND = 'evaluation';
export const COLL = 'evaluations';

// who holds the evaluation and where it is in its flow: a change made on a copy where these differ from the server's
// was made on a request that has moved on
const FLOW = ['status', 'assessorEmail', 'residentEmail'];
const same = (a, b) => recordSignature(a ?? null) === recordSignature(b ?? null);
export const CONFLICT = 'This request changed on another device (cancelled, reassigned or sent). Your version is kept in Unsent changes';
// merge function for the adapter: (server copy, this device's record, the copy it started from) -> what to write
export function mergeEval(current, record, base) {
  if (!current || !base) return mergeFields(current, record, base);
  if (FLOW.some(k => !same(current[k], base[k]))) {
    const e = new Error(CONFLICT); e.code = 'write-conflict'; e.remote = current; throw e;
  }
  // the change itself, with the transition times stamped again against the server's copy (stampPatch)
  const patch = {};
  for (const k of new Set([...Object.keys(record), ...Object.keys(base)])) if (k !== 'updatedAt' && !same(record[k], base[k])) patch[k] = k in record ? record[k] : null;
  const stamped = stampPatch(current, patch);
  const next = { ...record };
  for (const [k, v] of Object.entries(stamped)) { if (v === null) delete next[k]; else if (!(k in patch)) next[k] = v; }
  return mergeFields(current, next, base);
}

export function createEvalQueue({ sdk, store, getOwner, online = () => typeof navigator === 'undefined' || navigator.onLine !== false, otherPending = null, delay, sendTimeout }) {
  const fs = createFirestoreBackend({ sdk, path: () => [COLL], merge: { [COLL]: mergeEval } });
  const codes = new Map();   // record id -> the code of its last refused save ('permission-denied', …), for the screens
  async function create(record) {
    const { db, F } = await sdk();
    const ref = F.doc(db, COLL, String(record.id));
    const found = async () => { const snap = await F.getDocFromServer(ref).catch(e => { if (e?.code === 'permission-denied') return null; throw e; }); return snap?.exists() ? { ...snap.data(), id: snap.id } : null; };
    // already there (sent before, its answer lost): nothing to do. Not readable: not there yet, or not ours
    const there = await found();
    if (there) return there;
    try {
      // a transaction never waits in the SDK's own offline queue: offline it fails and the outbox keeps the save
      await F.runTransaction(db, async tx => { tx.set(ref, record); });
      return record;
    } catch (e) {
      // sent before, and that one landed (its answer was lost): a second create is an update the rules may refuse
      if (e?.code === 'permission-denied') { const now = await found().catch(() => null); if (now) return now; }
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
