// Run with: node --import ./logbook/test/app-sync-hook.mjs logbook/test/adapter-paths.test.mjs  (fake data only)
// The import, restore and admin paths of cloud.js's real Firestore code (not the demo backend), against the stand-in
// SDK (fake-firebase.mjs): a restore asks app-sync's adapter which records the server has (fs.existing); the Google
// Form pick-up, the admin import and the initials fix stay single batches (all or nothing) and carry the adapter's
// stamps (serverAt) like every other write; the blind batch writers (saveCases, deleteCases) are gone: new cases and
// deletes for good go through the write queue (queue-paths.test.mjs).
import assert from 'node:assert/strict';
import { register } from 'node:module';

const fakeUrl = new URL('./fake-firebase.mjs', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
  let fake;
  export function initialize(d) { fake = d.fake; }
  export async function resolve(spec, ctx, next) {
    if (/^https:\\/\\/www\\.gstatic\\.com\\/firebasejs\\/[^/]+\\/firebase-(app|auth|firestore)\\.js$/.test(spec)) return { url: fake, shortCircuit: true };
    return next(spec, ctx);
  }`), { data: { fake: fakeUrl } });

globalThis.location = { search: '', hostname: 'apmes.anawj.com' };
const device = new Map();
globalThis.localStorage = { getItem: k => device.get(k) ?? null, setItem: (k, v) => device.set(k, String(v)), removeItem: k => device.delete(k) };

const F = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
const cloud = await import('../js/cloud.js');
assert.equal(cloud.demo, false);

const E = 'fake.resident@example.com';
const at = (coll, id, email = E) => F.server.get(`logbooks/${email}/${coll}/${id}`);
const reset = () => { F.server.clear(); F.net.delays = []; F.net.fail.clear(); };
let n = 0;
const t = async (name, fn) => { reset(); try { await fn(); n++; } catch (e) { console.error('FAILED: ' + name); throw e; } };

await t('a restore asks the adapter which records the server has; only the missing ones come back, once each', async () => {
  F.server.set(`logbooks/${E}/cases/c1`, { id: 'c1', details: 'Fake, edited since the backup', updatedAt: 9 });
  const recs = [{ id: 'c1', details: 'Fake, old', cats: [] }, { id: 'c2', details: 'Fake two', cats: [] }, { id: 'c2', details: 'Fake two', cats: [] }];
  const missing = await cloud.missingOf(E, 'case', recs);
  assert.deepEqual(missing.map(c => c.id), ['c2']);
  assert.equal(at('cases', 'c1').details, 'Fake, edited since the backup', 'nothing written by the lookup');
  assert.equal(at('cases', 'c2'), undefined, 'the writes are the queue\'s (ui-core addMissing)');
  const many = Array.from({ length: 75 }, (_, i) => ({ id: 'r' + i, title: 'Fake', summary: '' }));
  F.server.set(`logbooks/${E}/reflections/r40`, { id: 'r40', updatedAt: 1 });
  assert.equal((await cloud.missingOf(E, 'reflection', many)).length, 74, 'across several lookups of 30');
  assert.deepEqual(await cloud.missingOf(E, 'case', []), []);
  F.net.fail.add(`logbooks/${E}/cases`);
  await assert.rejects(cloud.missingOf(E, 'case', recs), 'no signal: it cannot tell what is there');
});

await t('the blind batch writers are gone (new cases and deletes for good go through the write queue)', async () => {
  assert.equal(cloud.saveCases, undefined);
  assert.equal(cloud.deleteCases, undefined);
  assert.equal(cloud.addMissing, undefined);
});

await t('the Google Form pick-up writes the case and the inbox delete in one batch, stamped by the adapter', async () => {
  F.server.set('formInbox/f1', { id: 'f1', email: E });
  F.server.set('formInbox/f2', { id: 'f2', email: E });
  F.server.set(`logbooks/${E}/cases/k2`, { id: 'k2', details: 'Fake kept', importKey: 'form:f2@1', updatedAt: 3 });
  const done = await cloud.commitFormPickup(E, [
    { id: 'f1', case: { id: 'k1', details: 'Fake from the form', cats: [], source: 'form', importKey: 'form:f1@1', updatedAt: 5 } },
    { id: 'f2', case: null, mark: { id: 'k2', importKey: 'form:f2@7', updatedAt: 3 } },
  ]);
  assert.deepEqual(done, ['f1', 'f2']);
  assert.deepEqual(at('cases', 'k1').serverAt, F.SERVER_TIME, 'a new case: serverAt');
  assert.deepEqual(at('cases', 'k2').serverAt, F.SERVER_TIME, 'a key mark: serverAt');
  assert.equal(at('cases', 'k2').details, 'Fake kept');
  assert.equal(F.server.has('formInbox/f1') || F.server.has('formInbox/f2'), false);
});

await t('the admin import writes its cases with the adapter\'s stamps, the progress record in the same batch', async () => {
  const rows = [{ importKey: 'h1#0', date: '2026-01-01', details: 'Fake A', cats: [] }, { importKey: 'h2#0', date: '2026-01-02', details: 'Fake B', cats: [] }];
  assert.deepEqual(await cloud.importCases('Other@Example.com', 'R1', rows), { written: 2, skipped: 0 });
  const mine = [...F.server].filter(([p]) => p.startsWith('logbooks/other@example.com/cases/')).map(([, d]) => d);
  assert.equal(mine.length, 2);
  for (const d of mine) { assert.deepEqual(d.serverAt, F.SERVER_TIME); assert.equal(typeof d.updatedAt, 'number'); }
  assert.deepEqual(F.server.get('imports/R1').keys.sort(), ['h1#0', 'h2#0']);
});

await t('the initials fix stamps each case it changes (updatedAt and serverAt), so other devices see it', async () => {
  F.server.set(`logbooks/${E}/cases/i1`, { id: 'i1', initials: 'ab', details: 'ab fake', updatedAt: 4 });
  assert.equal(await cloud.fixCaseInitials(E, [{ id: 'i1', initials: 'AB', details: 'AB fake' }]), 1);
  const d = at('cases', 'i1');
  assert.equal(d.initials, 'AB'); assert.ok(d.updatedAt > 4); assert.deepEqual(d.serverAt, F.SERVER_TIME);
});

console.log(`adapter paths: ${n} checks passed`);
process.exit(0);
