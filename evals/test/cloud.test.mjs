// cloud.js (the real backend, not the demo) against a stand-in Firebase SDK: evaluation saves go through the outbox,
// the list shows a save not yet sent, the chip says "unknown" until the server answers, offline saves keep sign-out
// shut, a refusal reaches the screen with its code, and sign-out forgets the device (outbox, SDK cache, drafts).
// Made-up people only. Run from the repo root (the Firebase SDK addresses load test/fake-firebase/ instead):
//   node --import ./logbook/test/app-sync-hook.mjs evals/test/cloud.test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./fake-firebase/loader.mjs', import.meta.url);

// a browser-ish global: localStorage (the outbox's fallback when there is no IndexedDB)
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
const keys = () => [...mem.keys()];
// Object.keys(localStorage) is what cloud.js and the outbox use: make it list the stored keys
globalThis.localStorage = new Proxy(globalThis.localStorage, { ownKeys: () => keys(), getOwnPropertyDescriptor: (_t, k) => (mem.has(k) ? { enumerable: true, configurable: true, value: mem.get(k) } : undefined) });

const cloud = await import('../js/cloud.js');
const wait = (ms = 20) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('timed out'); await wait(10); } };

const RES = 'res.one@example.com', ASR = 'dr.two@example.com';
let n = 0;
const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error('FAIL ' + name); throw e; } };

let user = null;
cloud.watchUser(u => { user = u; });
await until(() => globalThis.fakeAuth && globalThis.fakeFS);
const FS = globalThis.fakeFS, AUTH = globalThis.fakeAuth;
AUTH.emit({ email: RES, displayName: 'Res One', uid: 'u1', getIdTokenResult: async () => ({ claims: {} }) });
await until(() => user?.email === RES);

let list = null, lastMeta = null;
await t('the chip says unknown until a list has come from the server', async () => {
  FS.online = false;
  const stop = cloud.watchMine(RES, (l, m) => { list = l; lastMeta = m; });
  await wait();
  assert.equal(cloud.syncState().state, 'unknown');
  FS.online = true; stop();
  cloud.watchMine(RES, (l, m) => { list = l; lastMeta = m; });
  await until(() => cloud.syncState().state === 'synced');
});

const ev = { id: 'ev1', rid: 'R1', residentEmail: RES, residentName: 'Res One', assessorEmail: ASR, assessorName: 'Dr Two', status: 'requested', formId: 'dops', createdAt: Date.now() };
await t('a new evaluation goes through the outbox to the server', async () => {
  await cloud.createEvaluation(ev);
  await until(() => FS.docs.has('evaluations/ev1'));
  assert.equal(FS.docs.get('evaluations/ev1').status, 'requested');
  await until(() => list?.some(x => x.id === 'ev1'));
  assert.equal(await cloud.hasUnsentWrites(100), false);
});

await t('offline: the change shows in the list, is kept on this device and keeps sign-out shut; sent once online', async () => {
  FS.online = false;
  await cloud.updateEvaluation('ev1', { chasedAt: Date.now() });
  assert.equal(cloud.pendingSaves(), 1);
  assert.ok(keys().some(k => k.startsWith('apmes-evals-outbox:')), 'in the outbox');
  assert.equal(await cloud.hasUnsentWrites(100), true);
  FS.watchers.forEach(w => w());   // a cached list again: the overlay keeps the unsent change
  await wait();
  assert.ok(list.find(x => x.id === 'ev1').chasedAt, 'the list shows the change not yet sent');
  assert.equal(lastMeta.hasPendingWrites, true, 'pruneDrafts keeps the device copy');
  assert.equal(cloud.unsentEntries().length, 1);
  FS.online = true;
  globalThis.dispatchEvent?.(new Event('online'));
  await cloud.retrySave(cloud.unsentEntries()[0].key).catch(() => {});
  await until(() => cloud.pendingSaves() === 0);
  assert.ok(FS.docs.get('evaluations/ev1').chasedAt);
  assert.equal(await cloud.hasUnsentWrites(100), false);
});

await t('a change the rules refuse is thrown with its code, and listed for Retry / Discard', async () => {
  FS.rules = op => op !== 'update';
  await assert.rejects(cloud.updateEvaluation('ev1', { status: 'cancelled' }), e => e.code === 'permission-denied');
  assert.equal(cloud.syncState().state, 'attention');
  const [x] = cloud.unsentEntries();
  assert.equal(x.state, 'failed');
  await cloud.discardSave(x.key);
  assert.equal(cloud.syncState().state, 'synced');
  FS.rules = () => true;
});

await t('the origin\'s outbox list names this app\'s outbox and the other apps\' (createApp registry)', async () => {
  const names = JSON.parse(localStorage.getItem('app-sync:outboxes') || '[]').map(x => x.name);
  for (const n of ['apmes-evals-outbox', 'apmes-logbook-recovery', 'ccc-outbox']) assert.ok(names.includes(n), n);
});

await t('sign-out is refused while CCC has unsent saves for this account', async () => {
  localStorage.setItem('ccc-outbox:k9', JSON.stringify({ key: 'k9', owner: RES, kind: 'review', record: { id: 'r1' }, state: 'pending', realm: 'default', at: 1 }));
  assert.equal(await cloud.hasUnsentWrites(100), true);
  await assert.rejects(cloud.signOut(), e => e.code === 'unsent-saves');
  localStorage.removeItem('ccc-outbox:k9');
});

await t('sign-out is refused while another app on the site (the logbook) has unsent saves for this account', async () => {
  localStorage.setItem('apmes-logbook-recovery:k1', JSON.stringify({ key: 'k1', owner: RES, kind: 'case', record: { id: 'c1' }, state: 'pending', realm: 'account', at: 1 }));
  assert.equal(await cloud.hasUnsentWrites(100), true);
  await assert.rejects(cloud.signOut(), e => e.code === 'unsent-saves');
  assert.equal(AUTH.user?.email, RES, 'still signed in');
});

await t('sign-out forgets the device: outbox, the SDK cache and the drafts', async () => {
  FS.online = false;
  await cloud.updateEvaluation('ev1', { chasedAt: Date.now() + 1 });
  localStorage.setItem('evals-draft-ev1', '{}');
  FS.online = true;
  FS.hang = true;   // another tab holds the shared IndexedDB: clearing the cache never finishes
  const t0 = Date.now();
  await cloud.signOut({ force: true });   // (the screens ask first: signOutSafely)
  assert.ok(Date.now() - t0 < 6000, 'does not hang');
  assert.ok(!keys().some(k => k.startsWith('apmes-evals-outbox:')), 'outbox wiped');
  assert.ok(!keys().some(k => k.startsWith('apmes-logbook-recovery:')), 'the other apps\' outboxes for this account too');
  assert.ok(!keys().some(k => k.startsWith('evals-draft-')), 'drafts wiped');
  assert.equal(FS.terminated, 1);
  assert.equal(cloud.pendingSaves(), 0);
});

await t('signed in again: saves reach the server (a fresh Firestore), and a sign-out with nothing unsent goes ahead', async () => {
  AUTH.emit({ email: ASR, displayName: 'Dr Two', uid: 'u2', getIdTokenResult: async () => ({ claims: {} }) });
  await until(() => user?.email === ASR);
  await cloud.createEvaluation({ ...ev, id: 'ev2' });
  await until(() => FS.docs.has('evaluations/ev2'));
  assert.equal(await cloud.hasUnsentWrites(100), false);
  FS.hang = false;
  await cloud.signOut();
  assert.equal(AUTH.user, null, 'signed out');
  assert.equal(FS.terminated, 2);
});

console.log(`cloud: ${n} checks passed`);
process.exit(0);
