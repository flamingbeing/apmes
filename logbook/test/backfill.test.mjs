// Run with: node logbook/test/backfill.test.mjs  (fake data only)
// tools/backfill-server-at.mjs against a stand-in for the Admin SDK's Firestore: a dry run counts and writes nothing;
// --write stamps only what has no serverAt, only under logbooks/, and leaves every other field as it was.
import assert from 'node:assert/strict';
import { backfill, COLLECTIONS } from '../../tools/backfill-server-at.mjs';

const STAMP = { serverTime: true };
function fakeDb(docs) {
  const data = new Map(docs.map(([path, d]) => [path, { ...d }]));
  let writes = 0;
  const snapOf = path => {
    const parts = path.split('/');
    const ref = { path, id: parts.at(-1), parent: { id: parts.at(-2), parent: parts.length > 2 ? { id: parts.at(-3), parent: parts.length > 3 ? { id: parts.at(-4) } : null } : null },
      update: async f => { if (!data.has(path)) throw new Error('gone'); data.set(path, { ...data.get(path), ...f }); writes++; } };
    return { id: ref.id, ref, updateTime: 1, get: k => data.get(path)?.[k] };
  };
  const group = coll => ({
    _after: null, _limit: Infinity,
    orderBy() { return this; },
    limit(n) { return { ...this, _limit: n }; },
    startAfter(d) { return { ...this, _after: d.ref.path }; },
    async get() {
      const all = [...data.keys()].filter(p => p.split('/').at(-2) === coll).sort();
      const from = this._after ? all.indexOf(this._after) + 1 : 0;
      const docs = all.slice(from, from + this._limit).map(snapOf);
      return { empty: !docs.length, docs };
    },
  });
  return {
    data, writes: () => writes,
    collectionGroup: group,
    batch() { const ops = []; return { update(ref, f) { ops.push(() => ref.update(f)); }, async commit() { for (const op of ops) await op(); } }; },
  };
}
const FieldValue = { serverTimestamp: () => STAMP };

const E = 'logbooks/fake@example.com';
const seed = [
  ...Array.from({ length: 450 }, (_, i) => [`${E}/cases/c${String(i).padStart(3, '0')}`, { id: 'c' + i, updatedAt: 5 }]),
  [`${E}/cases/done`, { id: 'done', updatedAt: 6, serverAt: 'already' }],
  [`${E}/reflections/r1`, { id: 'r1', updatedAt: 7 }],
  [`${E}/notes/n1`, { id: 'n1', updatedAt: 8 }],
  [`${E}/bin/b1`, { id: 'b1', kind: 'case', data: { id: 'x' }, deletedAt: 9 }],
  ['submissions/fake@example.com/reflections/r1', { id: 'r1' }],   // not synced: never touched
];

// dry run: counts, no writes
{
  const db = fakeDb(seed);
  const n = await backfill(db, { FieldValue });
  assert.deepEqual(Object.keys(n), COLLECTIONS);
  assert.deepEqual(n.cases, { total: 451, missing: 450, stamped: 0 }, 'pages past the first 400');
  assert.deepEqual(n.reflections, { total: 1, missing: 1, stamped: 0 }, 'submissions/ copies not counted');
  assert.equal(n.notes.missing, 1); assert.equal(n.bin.missing, 1);
  assert.equal(db.writes(), 0, 'a dry run writes nothing');
}
// --write: stamps the missing ones only, other fields kept; a second count finds none left
{
  const db = fakeDb(seed);
  const n = await backfill(db, { write: true, FieldValue });
  assert.equal(n.cases.stamped, 450); assert.equal(n.bin.stamped, 1);
  assert.equal(db.writes(), 453);
  assert.deepEqual(db.data.get(`${E}/cases/c000`), { id: 'c0', updatedAt: 5, serverAt: STAMP });
  assert.equal(db.data.get(`${E}/cases/done`).serverAt, 'already', 'a stamped one is left alone');
  assert.deepEqual(db.data.get(`${E}/bin/b1`), { id: 'b1', kind: 'case', data: { id: 'x' }, deletedAt: 9, serverAt: STAMP });
  assert.deepEqual(db.data.get('submissions/fake@example.com/reflections/r1'), { id: 'r1' });
  const after = await backfill(db, { FieldValue });
  assert.equal(Object.values(after).reduce((s, x) => s + x.missing, 0), 0);
}
console.log('backfill tests passed');
