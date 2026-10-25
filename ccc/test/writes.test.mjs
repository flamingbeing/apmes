// The coordinators' write queue (js/writes.js) against a fake Firestore: made-up people only.
// Run: node --import ./logbook/test/app-sync-hook.mjs ccc/test/writes.test.mjs
import assert from 'node:assert/strict';
const { createStaffWrites, mergeMarks, SIBLINGS } = await import('../js/writes.js');
const { createOutboxRegistry } = await import('../js/app-sync.js');
const { overlayRounds, overlayReviews, overlayNominees, overlayInvites } = await import('../js/overlay.js');

// ---- a fake Firestore: documents by path, transactions, server timestamps, and a switch for "no connection" ----
function fake() {
  const docs = new Map(), log = [];
  const st = { offline: false, deny: false };
  const F = {
    doc: (_db, ...p) => ({ path: p.join('/') }),
    serverTimestamp: () => ({ __server: true }),
    runTransaction: async (_db, fn) => {
      if (st.offline) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      if (st.deny) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
      const writes = [];
      const tx = {
        get: async ref => { const d = docs.get(ref.path); return { exists: () => !!d, data: () => d && JSON.parse(JSON.stringify(d)) }; },
        set: (ref, data) => writes.push(['set', ref.path, data]),
        delete: ref => writes.push(['delete', ref.path]),
      };
      const out = await fn(tx);
      for (const [op, path, data] of writes) { log.push([op, path]); if (op === 'set') docs.set(path, data); else docs.delete(path); }
      return out;
    },
  };
  return { docs, log, st, sdk: async () => ({ db: {}, F }) };
}
// an outbox kept in memory (the real one is IndexedDB; node has none)
function memoryOutbox() {
  const m = new Map();
  return { async put(r) { m.set(r.key, JSON.parse(JSON.stringify(r))); return r; }, async list(o) { return [...m.values()].filter(x => x.owner === o); },
    async get(k) { return m.get(k) || null; }, async remove(k) { m.delete(k); }, async forget(o) { for (const [k, v] of m) if (v.owner === o) m.delete(k); }, size: () => m.size };
}
function memoryStorage() { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }
const setup = (f = fake(), extra = {}) => {
  const outbox = memoryOutbox();
  let online = true;
  const { siblings = null, ...rest } = extra;
  // the origin's outbox list, kept in memory; every other app's outbox opens as `siblings(name)`
  const registry = siblings ? createOutboxRegistry({ storage: memoryStorage(), open: siblings }) : null;
  const w = createStaffWrites({ sdk: f.sdk, getOwner: () => 'pc@example.com', online: () => online, outbox, guard: async () => ({ persisted: true }), registry, storage: null, ...rest });
  return { f, w, outbox, setOnline: v => { online = v; } };
};
const settled = async w => { for (let i = 0; i < 40 && w.queue.pending(); i++) { w.queue.kick(); await new Promise(r => setTimeout(r, 25)); } };

// ---- marks: this device's changes applied onto the server's marks ----
assert.deepEqual(mergeMarks({ a: 'ok', b: 'swap' }, { a: 'ok', b: 'swap', c: 'ok' }, { a: 'ok', b: 'swap' }), { a: 'ok', b: 'swap', c: 'ok' }, 'a new mark is added');
assert.deepEqual(mergeMarks({ a: 'ok', x: 'sent' }, { a: 'swap' }, { a: 'ok' }), { a: 'swap', x: 'sent' }, 'another coordinator’s mark is kept');
assert.deepEqual(mergeMarks({ a: 'ok', b: 'ok' }, { b: 'ok' }, { a: 'ok', b: 'ok' }), { b: 'ok' }, 'a mark taken away is removed');
assert.deepEqual(mergeMarks(null, { a: 'ok' }, null), { a: 'ok' }, 'no server copy and no base: all of it');

// ---- a round: written without the outbox id; an older copy never replaces a newer one ----
{
  const { f, w } = setup(); await w.start();
  await w.saveRound({ round: 'r1', title: 'CCC', status: 'open', updatedAt: 200 });
  await settled(w);
  assert.deepEqual(f.docs.get('ccc/r1'), { round: 'r1', title: 'CCC', status: 'open', updatedAt: 200 }, 'the rules list a round’s fields: no id');
  await w.saveRound({ round: 'r1', title: 'Older', status: 'open', updatedAt: 100 }); await settled(w);
  assert.equal(f.docs.get('ccc/r1').title, 'CCC', 'a copy older than the server’s is skipped');
}

// ---- marks from two coordinators on one resident both survive ----
{
  const { f, w } = setup(); await w.start();
  f.docs.set('ccc/r1/review/amy@example.com', { email: 'amy@example.com', marks: { n1: 'ok', n2: 'ok' }, updatedAt: 50 });
  await w.saveMarks('r1', 'amy@example.com', { n1: 'ok', n2: 'ok', n3: 'swap' }, { n1: 'ok', n2: 'ok' });
  f.docs.get('ccc/r1/review/amy@example.com').marks.n9 = 'ok';   // another coordinator marked n9 meanwhile
  await settled(w);
  const got = f.docs.get('ccc/r1/review/amy@example.com');
  assert.deepEqual(got.marks, { n1: 'ok', n2: 'ok', n3: 'swap', n9: 'ok' });
  assert.ok(got.updatedAt > 50 && Object.keys(got).sort().join() === 'email,marks,updatedAt', 'stamped forward, only the rule’s fields');
  // the next save’s base is what this device saved last, so a mark it took away is removed and n9 stays
  await w.saveMarks('r1', 'amy@example.com', { n1: 'ok', n3: 'swap' }, { n1: 'ok', n2: 'ok' }); await settled(w);
  assert.deepEqual(f.docs.get('ccc/r1/review/amy@example.com').marks, { n1: 'ok', n3: 'swap', n9: 'ok' });
}

// ---- a rater link: made once (a resend changes nothing), time and writer stamped, after its mark is on the server ----
{
  const { f, w } = setup(); await w.start();
  const doc = { resident: 'amy@example.com', nomineeId: 'n1', group: 'senior', residentName: 'Amy Example', raterName: 'Dr Rater' };
  await w.saveMarks('r1', 'amy@example.com', { n1: 'sent' }, {});
  await w.saveInvite('r1', 'a'.repeat(32), doc, 'pc@example.com');
  assert.equal(await w.sent('invite', 'a'.repeat(32)), true, 'sent: the server has it');
  const inv = f.docs.get('ccc/r1/invites/' + 'a'.repeat(32));
  assert.deepEqual(inv, { ...doc, createdAt: { __server: true }, createdBy: 'pc@example.com' });
  const order = f.log.map(l => l[1].split('/')[2]);
  assert.ok(order.indexOf('review') < order.indexOf('invites'), 'the mark reaches the server before the link');
  inv.createdBy = 'someone@example.com';
  await w.queue.save('invite', 'pc@example.com', { id: 'a'.repeat(32), round: 'r1', ...doc, createdBy: 'pc@example.com' }, null); await settled(w);
  assert.equal(f.docs.get('ccc/r1/invites/' + 'a'.repeat(32)).createdBy, 'someone@example.com', 'sent again, the link already there is left as it is');
}

// ---- deleted nominees and the clean-up ----
{
  const { f, w } = setup(); await w.start();
  f.docs.set('ccc/r1/msf/amy@example.com', { email: 'amy@example.com' }); f.docs.set('ccc/r1/review/amy@example.com', { email: 'amy@example.com' });
  await w.deleteNominees('r1', 'amy@example.com'); await settled(w);
  assert.equal(f.docs.has('ccc/r1/msf/amy@example.com') || f.docs.has('ccc/r1/review/amy@example.com'), false, 'both gone');
  f.docs.set('ccc/r1/responses/x', {}); f.docs.set('ccc/r1/invites/y', {});
  await w.purgeRaters('r1', { email: 'amy@example.com', report: { email: 'amy@example.com', name: 'Amy Example' }, inviteIds: ['y'], responseIds: ['x'] }); await settled(w);
  assert.deepEqual(f.docs.get('ccc/r1/report/amy@example.com'), { email: 'amy@example.com', name: 'Amy Example', savedAt: { __server: true } });
  assert.equal(f.docs.has('ccc/r1/responses/x') || f.docs.has('ccc/r1/invites/y'), false, 'answers and links deleted with the summary');
}

// ---- the chip: offline saves are kept and reported; the chip says synced only after the server answered ----
{
  const { f, w, setOnline } = setup(); await w.start();
  assert.equal(w.status().state, 'unknown', 'nothing sent, server not heard yet');
  w.hear(); assert.equal(w.status().state, 'synced');
  f.st.offline = true; setOnline(false);
  await w.saveRound({ round: 'r2', title: 'Offline', status: 'open', updatedAt: 300 });
  assert.deepEqual(w.status(), { state: 'offline', count: 1 }, 'saved on this device, not sent');
  assert.equal(w.open().length, 1);
  const risky = setup(fake(), { guard: async () => ({ persisted: false }) }); await risky.w.start(); risky.setOnline(false); risky.f.st.offline = true;
  await risky.w.saveRound({ round: 'r5', title: 'x', status: 'open', updatedAt: 1 });
  assert.equal(risky.w.status().state, 'at-risk', 'offline and the browser may clear this site’s storage');
  assert.equal(await w.canSignOut(), false, 'sign-out refuses while a change is unsent');
  f.st.offline = false; setOnline(true);
  await settled(w);
  assert.equal(f.docs.get('ccc/r2').title, 'Offline', 'sent when the connection came back');
  assert.equal(w.status().state, 'synced');
  assert.equal(await w.canSignOut(), true);
}

// ---- a refused change needs the user, and can be tried again or discarded ----
{
  const { f, w } = setup(); await w.start(); w.hear();
  f.st.deny = true;
  await assert.rejects(w.saveRound({ round: 'r3', title: 'Refused', status: 'open', updatedAt: 1 }), /denied — a copy is kept in Changes on this device/, 'the screen is told, and the copy stays in the chip’s sheet');
  await new Promise(r => setTimeout(r, 50));
  assert.equal(w.status().state, 'attention'); assert.equal(w.status().count, 1);
  assert.equal(await w.canSignOut(), false);
  f.st.deny = false;
  await w.queue.retry(w.queue.entries()[0].key); await settled(w); await new Promise(r => setTimeout(r, 50));
  assert.equal(f.docs.get('ccc/r3').title, 'Refused'); assert.equal(w.status().state, 'synced');
}

// ---- a refused marks save replaced by the next one keeps its changes ----
{
  const { f, w } = setup(); await w.start(); w.hear();
  f.docs.set('ccc/r1/review/amy@example.com', { email: 'amy@example.com', marks: { n1: 'ok' }, updatedAt: 5 });
  f.st.deny = true;
  await assert.rejects(w.saveMarks('r1', 'amy@example.com', { n1: 'ok', n2: 'swap' }, { n1: 'ok' }));
  f.st.deny = false;
  await w.saveMarks('r1', 'amy@example.com', { n1: 'ok', n2: 'swap', n3: 'ok' }, { n1: 'ok' }); await settled(w);
  assert.deepEqual(f.docs.get('ccc/r1/review/amy@example.com').marks, { n1: 'ok', n2: 'swap', n3: 'ok' }, 'the refused mark (n2) is not lost');
}

// ---- sign-out: forgetDevice empties the outbox and runs the app’s own clean-up ----
{
  const { f, w, outbox } = setup(); await w.start();
  await w.saveRound({ round: 'r4', title: 'Sent', status: 'open', updatedAt: 1 }); await settled(w);
  assert.equal(await w.canSignOut(), true);
  let extra = 0, kept = true;
  const r = await w.forget({ extra: async () => { extra++; } });
  assert.equal(r.wiped, true); assert.deepEqual(r.failed, []); assert.equal(extra, 1);
  assert.equal(outbox.size(), 0, 'the outbox is forgotten');
  const stopped = await w.forget({ proceed: async () => false });
  assert.equal(stopped.wiped, false, 'proceed can stop it');
}

// ---- shared sign-in: the logbook's and evals' outboxes count too, and are forgotten with ours ----
{
  const sib = memoryOutbox();
  const { w } = setup(fake(), { siblings: () => sib }); await w.start();
  await sib.put({ key: 'k1', owner: 'pc@example.com', state: 'pending' });
  await sib.put({ key: 'k2', owner: 'other@example.com', state: 'pending' });
  assert.equal(await w.canSignOut(), false, 'another app has an unsent change for this user');
  await sib.put({ key: 'k1', owner: 'pc@example.com', state: 'synced' });
  assert.equal(await w.canSignOut(), true, 'only finished entries, and another user’s, are left');
  await w.forget();
  assert.deepEqual((await sib.list('pc@example.com')), [], 'the other app’s copy for this user is forgotten');
  assert.equal((await sib.list('other@example.com')).length, 1, 'another user’s is not');
  const broken = { list: async () => { throw new Error('blocked'); }, forget: async () => {} };
  const wb = setup(fake(), { siblings: () => broken }).w; await wb.start();   // (app.js asks only once it has started)
  assert.equal(await wb.canSignOut(), false, 'an outbox that can’t be read keeps sign-out shut');
}

// ---- the origin's outbox list (createApp's registry) names the logbook's and evals' outboxes ----
{
  const storage = memoryStorage();
  const registry = createOutboxRegistry({ storage, open: () => memoryOutbox() });
  createStaffWrites({ sdk: fake().sdk, getOwner: () => 'pc@example.com', online: () => true, outbox: memoryOutbox(), guard: async () => ({ persisted: true }), registry, storage: null });
  assert.deepEqual(registry.list().map(x => x.name).sort(), SIBLINGS.map(x => x.name).sort(), 'the other apps’ outboxes are on the list');
  assert.equal(registry.list().find(x => x.name === 'apmes-logbook-recovery').realm, 'account', 'with the logbook’s realm');
}

// ---- unsent saves shown over the server’s lists ----
{
  const toRound = (id, d) => ({ round: id, title: d.title });
  const open = [{ kind: 'round', record: { id: 'r9', round: 'r9', title: 'New' } }, { kind: 'round', record: { id: 'r1', round: 'r1', title: 'Renamed' } }];
  assert.deepEqual(overlayRounds([{ round: 'r1', title: 'Old' }], open, toRound).map(r => r.title).sort(), ['New', 'Renamed']);
  const rv = overlayReviews('r1', { 'a@x': { email: 'a@x', marks: { n1: 'ok' }, updatedAt: 5 } }, [{ kind: 'review', record: { round: 'r1', email: 'a@x', marks: { n1: 'ok', n2: 'ok' } } }, { kind: 'review', record: { round: 'r2', email: 'z@x', marks: {} } }]);
  assert.deepEqual(rv['a@x'].marks, { n1: 'ok', n2: 'ok' }); assert.equal(rv['z@x'], undefined, 'other rounds are left out');
  assert.deepEqual(Object.keys(overlayNominees('r1', { 'a@x': {}, 'b@x': {} }, [{ kind: 'nominees', record: { round: 'r1', email: 'a@x' } }])), ['b@x'], 'a list deleted here is not shown');
  assert.deepEqual(Object.keys(overlayInvites('r1', {}, [{ kind: 'invite', record: { id: 'abc', round: 'r1', resident: 'a@x' } }])), ['abc'], 'a link made here shows');
}
console.log('ccc writes: all checks passed');
