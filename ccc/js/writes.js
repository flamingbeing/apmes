// The coordinators' writes (rounds, marks, rater links, deleted nominee lists, the clean-up) go through app-sync's write
// queue: each one is kept in an outbox on this device first, then sent in order, and sent again after a dropped
// connection or a reload, so "saved" never depends on the signal. What each kind writes (one transaction each, so a send
// that is repeated lands once):
//   round     ccc/{round}            newest change wins (a copy older than the server's is skipped)
//   review    ccc/{round}/review/{email}  the marks this device changed, applied onto the server's marks
//   invite    ccc/{round}/invites/{id}    made once; sent again it changes nothing (the rules stamp the time and writer)
//   nominees  msf and review of one resident deleted
//   purge     one resident's summary saved and the raters' answers and links deleted together
// Records carry no `id` field on the server (the rules list their fields), only in the outbox: ids are 'round|email'.
// The anonymous rater page (rate.js) never loads this file.
import { createWriteQueue, createOutbox, persistGuard, syncStatus, attentionCount, forgetDevice } from './app-sync.js';

export const KINDS = ['round', 'review', 'invite', 'nominees', 'purge'];
const terminal = s => s === 'synced' || s === 'archived';
const plain = v => JSON.parse(JSON.stringify(v));

// the marks to write: the server's marks with what this device changed since `base` (a mark added or changed is set,
// one taken away is removed), so two coordinators marking different nominees of one resident keep both
export function mergeMarks(current, marks, base) {
  const out = { ...(current || {}) };
  for (const [k, v] of Object.entries(marks || {})) if (!base || base[k] !== v) out[k] = v;
  if (base) for (const k of Object.keys(base)) if (!(k in (marks || {}))) delete out[k];
  return out;
}

export function createBackend(sdk) {
  return async function backend(_owner, kind, r) {
    const { db, F } = await sdk();
    const ref = (...p) => F.doc(db, ...p.map(String));
    const run = fn => F.runTransaction(db, fn);
    if (kind === 'round') {
      const { id: _id, ...doc } = r;
      return run(async tx => {
        const cur = await tx.get(ref('ccc', r.round));
        if (cur.exists() && Number(cur.data().updatedAt) > Number(doc.updatedAt)) return cur.data();   // a newer change is there
        tx.set(ref('ccc', r.round), doc); return doc;
      });
    }
    if (kind === 'review') {
      return run(async tx => {
        const rv = ref('ccc', r.round, 'review', r.email), cur = await tx.get(rv), have = cur.exists() ? cur.data() : null;
        const doc = { email: r.email, marks: mergeMarks(have?.marks, r.marks, r.baseMarks), updatedAt: Math.max(Date.now(), Number(have?.updatedAt) + 1 || 0) };
        tx.set(rv, doc); return doc;
      });
    }
    if (kind === 'invite') {
      return run(async tx => {
        const iv = ref('ccc', r.round, 'invites', r.id), cur = await tx.get(iv);
        if (cur.exists()) return cur.data();
        const doc = { resident: r.resident, nomineeId: r.nomineeId, group: r.group, residentName: r.residentName, raterName: r.raterName, createdAt: F.serverTimestamp(), createdBy: r.createdBy };
        tx.set(iv, doc); return doc;
      });
    }
    if (kind === 'nominees') {
      return run(async tx => { tx.delete(ref('ccc', r.round, 'msf', r.email)); tx.delete(ref('ccc', r.round, 'review', r.email)); return null; });
    }
    if (kind === 'purge') {
      return run(async tx => {
        if (r.report) tx.set(ref('ccc', r.round, 'report', r.email), { ...r.report, savedAt: F.serverTimestamp() });
        for (const id of r.responseIds || []) tx.delete(ref('ccc', r.round, 'responses', id));
        for (const id of r.inviteIds || []) tx.delete(ref('ccc', r.round, 'invites', id));
        return null;
      });
    }
    throw new Error('Unknown write: ' + kind);
  };
}

// -> the staff side's writer. sdk: async () => ({ db, F }). getOwner: () => the signed-in email (lower case).
export function createStaffWrites({ sdk, getOwner, online = () => navigator.onLine !== false, name = 'ccc-outbox', outbox = createOutbox({ name }), guard = persistGuard }) {
  const send = createBackend(sdk);
  // a rater link is checked against the resident's mark on the server, so it waits for that mark's own save first
  const backend = async (o, kind, r) => { if (kind === 'invite') await queue.settle('review', [r.round + '|' + r.resident], 8000); return send(o, kind, r); };
  const queue = createWriteQueue({ store: outbox, backend, getOwner, online, labels: { recover: 'Changes on this device' } });   // the chip’s sheet
  let heard = false, persisted = true;
  const listeners = new Set();
  const tell = () => listeners.forEach(fn => { try { fn(); } catch {} });
  queue.onChange(tell);
  const last = new Map();   // the marks this device saved last, per resident: the next save's base
  const owner = () => getOwner();
  const api = {
    queue,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // the server has answered a read (not the device's copy): the chip may say synced
    hear() { if (!heard) { heard = true; tell(); } },
    heard: () => heard,
    async start() { await queue.activate(owner()); const g = await guard(); persisted = g.persisted !== false; tell(); queue.kick(); },
    status() {
      return syncStatus({ online: online(), pending: queue.pending(), attention: attentionCount(queue.entries()), persisted, confirmed: heard, atRiskOnlyOffline: true });
    },
    // what each screen asks to be saved
    saveRound(doc) { return queue.save('round', owner(), { id: doc.round, ...doc }, null); },
    saveMarks(round, email, marks, base) {
      const id = round + '|' + email, prev = last.get(id) ?? base ?? null;
      last.set(id, plain(marks || {}));
      return queue.save('review', owner(), { id, round, email, marks: plain(marks || {}), baseMarks: prev ? plain(prev) : null }, null);
    },
    saveInvite(round, id, doc, createdBy) { return queue.save('invite', owner(), { id, round, ...doc, createdBy }, null); },
    deleteNominees(round, email) { last.delete(round + '|' + email); return queue.save('nominees', owner(), { id: round + '|' + email, round, email, _deleted: true }, null); },
    purgeRaters(round, step) { return queue.save('purge', owner(), { id: round + '|' + step.email, round, ...step }, null); },
    // is this save on the server? (false: offline or waiting; the caller says "saved on this device")
    async sent(kind, id) { await queue.settle(kind, [id]); return queue.status(kind, id) === 'synced'; },
    // the saves not on the server yet, newest first
    open: () => queue.entries().filter(x => !terminal(x.state)),
    // sign-out: false while anything is unsent (nothing is wiped)
    canSignOut: () => queue.flush(),
    async forget({ extra, proceed } = {}) { return forgetDevice({ queue, proceed, extra }); },
  };
  return api;
}
