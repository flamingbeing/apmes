// Run with: node --import ./logbook/test/app-sync-hook.mjs logbook/test/queue-paths.test.mjs  (demo backend, fake data)
// New cases (pasted lists, plans, a spreadsheet's new rows), their Undo (deletes for good), a backup's missing cases
// and reflections, and reflections imported from Word all go through the write queue (app-sync): each is kept in the
// outbox on this device until the server has it, the sync chip counts it, sign-out waits for it, and one that fails
// is kept in Recover instead of being lost in a blind batch.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.location = { search: '?demo' };
const device = new Map();
globalThis.localStorage = { getItem: k => device.get(k) || null, setItem: (k, v) => { device.set(k, String(v)); }, removeItem: k => { device.delete(k); } };
const cloud = await import('../js/cloud.js');
const D = await import('../js/demo-backend.js');
const { S, setCases, saveMany, deleteMany, addMissingCases, addMissing, writes, resetCaches } = await import('../js/ui-core.js');

D.resetDemo({ seeded: true });
const email = D.DEMO_USER.email;
S.user = { ...D.DEMO_USER };
S.logbook = { name: 'Fake', settings: {}, templates: [] };
setCases(await cloud.listCases(email));
const queued = (kind, id) => writes.entries().filter(x => x.kind === kind && String(x.record.id) === id);

// new cases: one queue save each, with no base (never over a case the server has)
const fresh = [1, 2, 3].map(i => ({ id: 'fake-new' + i, date: '2026-10-0' + i, details: 'XY fake case ' + i, cats: [] }));
await saveMany(fresh);
await writes.settle('case', fresh.map(c => c.id), 3000);
for (const c of fresh) {
  const q = queued('case', c.id);
  assert.equal(q.length, 1, c.id + ' went through the queue');
  assert.equal(q[0].base, null);
  assert.equal(writes.status('case', c.id), 'synced');
}
assert.deepEqual((await cloud.listCases(email)).filter(c => c.id.startsWith('fake-new')).map(c => c.id).sort(), fresh.map(c => c.id));
assert.ok(fresh.every(c => S.cases.some(x => x.id === c.id)), 'shown at once');

// Undo: deletes for good through the queue, each made on the case as it was saved
await deleteMany(fresh.map(c => c.id));
await writes.settle('case', fresh.map(c => c.id), 3000);
for (const c of fresh) {
  const del = queued('case', c.id).find(x => x.record._deleted);
  assert.ok(del, c.id + ' delete went through the queue');
  assert.equal(del.base.id, c.id, 'made on the saved copy');
}
assert.equal((await cloud.listCases(email)).filter(c => c.id.startsWith('fake-new')).length, 0);
assert.ok(!S.cases.some(c => c.id.startsWith('fake-new')));

// a backup's missing cases and reflections: only what the server lacks, then through the queue
const [c1] = S.cases;
const added = await addMissingCases([{ ...c1, details: 'Fake older copy' }, { id: 'fake-back1', date: '2026-09-01', details: 'ZZ fake restored', cats: [] }]);
assert.deepEqual(added.map(c => c.id), ['fake-back1']);
await writes.settle('case', ['fake-back1'], 3000);
assert.equal(queued('case', 'fake-back1').length, 1);
assert.equal(queued('case', c1.id).length, 0, 'the case already there is not saved at all');
const refl = await addMissing('reflection', [{ id: 'fake-rb1', headingId: 'thyroid', initials: 'AB', title: 'Fake', summary: 'restored', status: 'draft' }]);
assert.deepEqual(refl.map(r => r.id), ['fake-rb1']);
await writes.settle('reflection', ['fake-rb1'], 3000);
assert.equal(queued('reflection', 'fake-rb1').length, 1);
assert.equal(D.reflectionsOf(email.toLowerCase()).find(r => r.id === 'fake-rb1').summary, 'restored');

// the Word import and the restore screen call the queue, not the SDK writers
const src = f => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
assert.doesNotMatch(src('ui-reflect-import.js'), /cloud\.saveReflection\(/, 'Word import: writes.save');
assert.doesNotMatch(src('backup.js'), /cloud\.addMissing\(/, 'restore: ui-core addMissing');

resetCaches();
console.log('queue paths tests passed');
process.exit(0);
