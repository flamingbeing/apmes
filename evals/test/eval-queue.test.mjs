// The evaluations write queue (js/eval-queue.js) against a stand-in Firestore: creates without a read, changes merged
// by field onto the server's copy, a field removed, a draft deleted, offline saves kept and sent later, a resent
// create that had landed, a refusal kept with its code, and the stamp moving forward. Run with the app-sync hook:
//   node --import ./logbook/test/app-sync-hook.mjs evals/test/eval-queue.test.mjs
// Made-up people only.
import assert from 'node:assert/strict';

const { createEvalQueue, KIND } = await import('../js/eval-queue.js');
const { syncStatus } = await import('../js/app-sync.js');
const { SYNC_CHIP } = await import('../js/ui-core.js');

// A small Firestore: one map of path -> data, transactions, and a rules hook (op, id, before, after, who) -> allowed.
function fakeFirestore({ rules = () => true } = {}) {
  const docs = new Map();
  const st = { online: true, reads: 0, txs: 0 };
  const err = code => Object.assign(new Error(code), { code });
  const F = {
    doc: (base, ...segs) => ({ path: [...(base.path || []), ...segs].join('/') }),
    collection: (_db, ...segs) => ({ path: segs }),
    serverTimestamp: () => ({ server: true }),
    async getDocFromServer(ref) {
      if (!st.online) throw err('unavailable');
      const d = docs.get(ref.path);
      return { exists: () => !!d, data: () => structuredClone(d), id: ref.path.split('/').pop() };
    },
    async runTransaction(_db, fn) {
      if (!st.online) throw err('unavailable');
      st.txs++;
      const writes = [];
      const tx = {
        async get(ref) {
          st.reads++;
          const d = docs.get(ref.path);
          if (!rules('read', ref.path, d || null, null)) throw err('permission-denied');
          return { exists: () => !!d, data: () => structuredClone(d), id: ref.path.split('/').pop() };
        },
        set(ref, data) { writes.push([ref.path, structuredClone(data)]); },
        delete(ref) { writes.push([ref.path, null]); },
      };
      const out = await fn(tx);
      for (const [path, data] of writes) {
        const before = docs.get(path) || null;
        if (!rules(data ? (before ? 'update' : 'create') : 'delete', path, before, data)) throw err('permission-denied');
      }
      for (const [path, data] of writes) data ? docs.set(path, data) : docs.delete(path);
      return out;
    },
  };
  return { st, docs, sdk: async () => ({ db: {}, F }) };
}
function memoryOutbox() {
  const m = new Map();
  return {
    put: async j => { m.set(j.key, structuredClone(j)); }, get: async k => structuredClone(m.get(k)),
    list: async o => [...m.values()].filter(j => j.owner === o).map(j => structuredClone(j)),
    remove: async k => { m.delete(k); }, forget: async o => { for (const [k, j] of m) if (j.owner === o) m.delete(k); }, m,
  };
}
const RES = 'res.one@example.com', ASR = 'dr.two@example.com';
const base = { id: 'ev1', rid: 'R1', residentEmail: RES, residentName: 'Res One', assessorEmail: ASR, status: 'requested', source: 'evals', createdAt: 1, updatedAt: 1, requestedAt: 1 };
const setup = ({ rules, who = RES, online } = {}) => {
  const fsx = fakeFirestore({ rules });
  let me = who;
  const store = memoryOutbox();
  const { queue, codeOf } = createEvalQueue({ sdk: fsx.sdk, store, getOwner: () => me, online: online || (() => fsx.st.online), delay: () => new Promise(r => setTimeout(r, 5)), sendTimeout: 2000 });
  return { ...fsx, queue, codeOf, store, as: e => { me = e; } };
};
const settle = q => q.settle(KIND, ['ev1'], 2000);
let n = 0;
const t = async (name, fn) => { await fn(); n++; };

await t('a new evaluation is written without reading first (the rules refuse a read of a missing doc)', async () => {
  const { queue, docs, st } = setup({ rules: (op, _p, before) => op !== 'read' || !!before });
  await queue.save(KIND, RES, base, null);
  await settle(queue);
  assert.deepEqual(docs.get('evaluations/ev1').residentEmail, RES);
  assert.equal(st.reads, 0);
  assert.equal(queue.pending(), 0);
});

await t('a create goes through app-sync\'s adapter (fs.create, 0.5.1): stamped as every other save, no SDK call here', async () => {
  const { queue, docs } = setup({ rules: (op, _p, before) => op !== 'read' || !!before });
  const before = Date.now();
  await queue.save(KIND, RES, { ...base, updatedAt: 1 }, null);
  await settle(queue);
  assert.ok(docs.get('evaluations/ev1').updatedAt >= before, 'stamped at the commit, like a change');
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/eval-queue.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\bF\.\w+\(|runTransaction|getDocFromServer/, 'no Firestore SDK call beside the adapter');
});

await t('a change is merged by field: another device\'s change to another field stays', async () => {
  const { queue, docs } = setup({ who: ASR });
  docs.set('evaluations/ev1', { ...base });
  const seen = { ...base };
  docs.set('evaluations/ev1', { ...base, chasedAt: 5, updatedAt: 5 });   // the resident nudged meanwhile
  await queue.save(KIND, ASR, { ...seen, assessment: { q1: 3 }, updatedAt: 6 }, seen);
  await settle(queue);
  const d = docs.get('evaluations/ev1');
  assert.deepEqual(d.assessment, { q1: 3 });
  assert.equal(d.chasedAt, 5);
});

await t('a field left out of the record is removed on the server (a patch with null)', async () => {
  const { queue, docs } = setup();
  docs.set('evaluations/ev1', { ...base, status: 'submitted', seenAt: 9 });
  const cur = { ...base, status: 'submitted', seenAt: 9 };
  const { seenAt, ...rest } = cur;
  await queue.save(KIND, RES, { ...rest, status: 'requested' }, cur);
  await settle(queue);
  const d = docs.get('evaluations/ev1');
  assert.equal(d.status, 'requested');
  assert.ok(!('seenAt' in d));
});

await t('a draft delete goes through the queue', async () => {
  const { queue, docs } = setup();
  docs.set('evaluations/ev1', { ...base, status: 'draft' });
  await queue.save(KIND, RES, { id: 'ev1', _deleted: true }, { ...base, status: 'draft' });
  await settle(queue);
  assert.ok(!docs.has('evaluations/ev1'));
});

await t('offline: the save waits in the outbox, sign-out is refused, and it is sent once back online', async () => {
  const x = setup();
  x.st.online = false;
  await x.queue.save(KIND, RES, base, null);
  assert.equal(x.queue.pending(), 1);
  assert.equal(x.store.m.size, 1, 'kept in the outbox on this device');
  assert.equal(await x.queue.flush(50), false, 'sign-out check stays shut');
  assert.equal(syncStatus({ online: false, pending: x.queue.pending() }).state, 'offline');
  x.st.online = true; x.queue.kick();
  await settle(x.queue);
  assert.equal(x.queue.pending(), 0);
  assert.ok(x.docs.has('evaluations/ev1'));
  assert.equal(await x.queue.flush(50), true);
});

await t('a resent create whose first copy landed (an update the rules refuse) counts as sent', async () => {
  const { queue, docs } = setup({ rules: (op, _p, before) => op !== 'update' || !before });
  docs.set('evaluations/ev1', { ...base, assessment: { q1: 2 } });   // landed, and the assessor has started since
  await queue.save(KIND, RES, base, null);
  await settle(queue);
  assert.equal(queue.pending(), 0);
  assert.equal(queue.status(KIND, 'ev1'), 'synced');
  assert.deepEqual(docs.get('evaluations/ev1').assessment, { q1: 2 }, 'nothing overwritten');
});

await t('a change the rules refuse is kept as failed, with its code for the screen', async () => {
  const { queue, codeOf, docs } = setup({ rules: op => op !== 'update' });
  docs.set('evaluations/ev1', { ...base });
  await assert.rejects(queue.save(KIND, RES, { ...base, status: 'cancelled' }, base).then(() => settle(queue)).then(() => {
    if (queue.status(KIND, 'ev1') === 'failed') throw new Error('failed');
  }));
  assert.equal(queue.status(KIND, 'ev1'), 'failed');
  assert.equal(codeOf('ev1'), 'permission-denied');
  assert.equal(docs.get('evaluations/ev1').status, 'requested');
});

await t('the stamp moves past the server copy\'s even when this clock is behind', async () => {
  const { queue, docs } = setup();
  const future = Date.now() + 3600e3;
  docs.set('evaluations/ev1', { ...base, updatedAt: future });
  await queue.save(KIND, RES, { ...base, chasedAt: 3, updatedAt: future }, { ...base, updatedAt: future });
  await settle(queue);
  assert.ok(docs.get('evaluations/ev1').updatedAt > future);
});

await t('the resident cancelled while the assessor answered offline: a conflict with the server copy, not a refusal', async () => {
  const x = setup({ who: ASR });
  x.docs.set('evaluations/ev1', { ...base });
  x.st.online = false;
  await x.queue.save(KIND, ASR, { ...base, assessment: { q1: 4 } }, base);   // answered offline
  x.docs.set('evaluations/ev1', { ...base, status: 'cancelled', updatedAt: 7 });   // meanwhile, on the resident's phone
  x.st.online = true; x.queue.kick();
  await settle(x.queue);
  assert.equal(x.queue.status(KIND, 'ev1'), 'conflict');
  const [job] = x.queue.entries();
  assert.equal(job.remote.status, 'cancelled', 'the server copy is kept to show');
  assert.ok(!('assessment' in x.docs.get('evaluations/ev1')), 'nothing written over the cancel');
  await x.queue.archive(job.key);   // Discard
  assert.equal(await x.queue.flush(50), true, 'and sign-out is no longer blocked');
});

await t('a create already on the server is left as it is (even where the rules would allow the write)', async () => {
  const { queue, docs, st } = setup();
  docs.set('evaluations/ev1', { ...base, chasedAt: 4 });
  await queue.save(KIND, RES, base, null);
  await settle(queue);
  assert.equal(queue.status(KIND, 'ev1'), 'synced');
  assert.equal(docs.get('evaluations/ev1').chasedAt, 4);
  assert.equal(st.txs, 0, 'no write');
});

await t('mergeEval: the flow unchanged, the change applies with its times stamped against the server copy', async () => {
  const { mergeEval } = await import('../js/eval-queue.js');
  const cur = { ...base, chasedAt: 5 };
  const out = mergeEval(cur, { ...base, status: 'submitted', assessment: { q1: 1 } }, base);
  assert.equal(out.status, 'submitted');
  assert.ok(out.submittedAt > 0, 'submittedAt stamped');
  assert.equal(out.chasedAt, 5);
  assert.throws(() => mergeEval({ ...base, assessorEmail: 'dr.three@example.com' }, { ...base, assessment: {} }, base), e => e.code === 'write-conflict');
});

await t('the chip has words for every app-sync state', async () => {
  for (const state of ['attention', 'at-risk', 'offline', 'saving', 'stale', 'unknown', 'synced']) assert.ok(SYNC_CHIP[state], state);
  assert.equal(syncStatus({ confirmed: false }).state, 'unknown', 'not synced before the server answered');
  assert.equal(SYNC_CHIP.offline.text(2), '⏳ 2 to send');
});

console.log(`eval-queue: ${n} checks passed`);
