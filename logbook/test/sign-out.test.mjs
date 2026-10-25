// Run with: node --import ./logbook/test/app-sync-hook.mjs logbook/test/sign-out.test.mjs  (fake data only)
// Sign-out on app-sync 0.4.0: the sign-out check (writes.flush) stays shut while writes made outside the write queue
// are not on the server (otherPending), and forgetLocal clears this device in forgetDevice's order (proceed asked once
// syncing has stopped; nothing deleted when it says no).
import assert from 'node:assert/strict';

globalThis.location = { search: '?demo' };
// a browser-like localStorage: stored keys are its own enumerable properties (Object.keys lists them)
const store = {};
for (const [k, fn] of Object.entries({ getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } })) Object.defineProperty(store, k, { value: fn, enumerable: false });
globalThis.localStorage = store;
const device = { has: k => Object.keys(store).includes(k), set: (k, v) => store.setItem(k, v), get: k => store.getItem(k) };

const { writes, outside } = await import('../js/writes.js');
const cloud = await import('../js/cloud.js');

// otherPending: a photo or settings write still on its way keeps sign-out shut; a check that throws does too
{
  outside.pending = async () => true;
  assert.equal(await writes.flush(50), false, 'shut while a write outside the queue is unsent');
  outside.pending = async () => { throw new Error('cannot tell'); };
  assert.equal(await writes.flush(50), false, 'shut when it cannot tell');
  outside.pending = async () => false;
  assert.equal(await writes.flush(50), true, 'open once everything is on the server');
}

// forgetLocal: proceed says no (another tab signed in meanwhile) -> this device's lists stay; yes -> they go
{
  const E = 'fake.resident@example.com';
  device.set('apmes-logbook-late:' + E, '[{"ids":["c1"]}]');
  device.set('apmes-logbook-purged:' + E, '1');
  device.set('apmes-logbook-theme', 'dark');   // the device's own, kept
  let asked = 0;
  await cloud.forgetLocal(() => { asked++; return false; });
  assert.equal(asked, 1);
  assert.ok(device.has('apmes-logbook-late:' + E) && device.has('apmes-logbook-purged:' + E), 'nothing deleted when proceed says no');
  await cloud.forgetLocal(() => true, E);
  assert.ok(!device.has('apmes-logbook-late:' + E) && !device.has('apmes-logbook-purged:' + E), 'the account lists go');
  assert.equal(device.get('apmes-logbook-theme'), 'dark', 'the device settings stay');
}

// the sync chip's confirmed: the demo has no server to wait for
assert.equal(cloud.syncHealth().confirmed, true);

console.log('sign-out tests passed');
