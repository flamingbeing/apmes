#!/usr/bin/env node
// One-off: give every Logbook record and bin entry without a server stamp one (serverAt, app-sync 0.3.0 server
// stamps), so devices can later read changes by the server's clock (logbook/NOTES.md, "Sync", Server stamps).
// Dry run by default: counts only, writes nothing. Run with Google credentials for the project (Admin SDK, e.g.
// GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default login`); firebase-admin is not a dependency of
// this repo, so install it beside the run (npm install --no-save firebase-admin).
//
//   node tools/backfill-server-at.mjs --project apmes-logbook            # dry run: counts per collection
//   node tools/backfill-server-at.mjs --project apmes-logbook --write    # stamps them, then counts again
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node tools/backfill-server-at.mjs --project demo-logbook --write   # emulator
//
// Only serverAt is set (an update with the server's time); updatedAt, deletedAt and every other field stay, so no
// device sees a change and nothing is overwritten (a record deleted meanwhile is skipped, never brought back). It
// prints counts only: never a record, an email or an id.
export const COLLECTIONS = ['cases', 'reflections', 'notes', 'bin'];
export const FIELD = 'serverAt';
const PAGE = 400;   // documents read per page; writes go in batches of the same size (Firestore allows 500)

// -> { [coll]: { total, missing, stamped } } over every logbooks/{email}/{coll}
export async function backfill(db, { write = false, FieldValue, log = () => {} } = {}) {
  const out = Object.fromEntries(COLLECTIONS.map(c => [c, { total: 0, missing: 0, stamped: 0 }]));
  for (const coll of COLLECTIONS) {
    const n = out[coll];
    let last = null;
    for (;;) {
      let q = db.collectionGroup(coll).orderBy('__name__').limit(PAGE);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      last = snap.docs[snap.docs.length - 1];
      // only logbooks/{email}/{coll}: a collection of the same name elsewhere (submissions/{email}/reflections) is not synced
      const docs = snap.docs.filter(d => d.ref.parent.parent?.parent?.id === 'logbooks');
      n.total += docs.length;
      const todo = docs.filter(d => d.get(FIELD) == null);
      n.missing += todo.length;
      if (write && todo.length) {
        const batch = db.batch();
        for (const d of todo) batch.update(d.ref, { [FIELD]: FieldValue.serverTimestamp() }, { lastUpdateTime: d.updateTime });
        try { await batch.commit(); n.stamped += todo.length; }
        catch (e) {
          // one changed or deleted since it was read: stamp the rest one by one (a changed one was stamped by the app)
          for (const d of todo) {
            try { await d.ref.update({ [FIELD]: FieldValue.serverTimestamp() }, { lastUpdateTime: d.updateTime }); n.stamped++; }
            catch { /* changed or deleted since: left as it is */ }
          }
        }
      }
      log(`${coll}: ${n.total} read, ${n.missing} without ${FIELD}${write ? `, ${n.stamped} stamped` : ''}`);
    }
  }
  return out;
}

async function main(argv) {
  const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const project = arg('--project');
  const write = argv.includes('--write');
  if (!project) { console.error('Usage: node tools/backfill-server-at.mjs --project <id> [--write]'); process.exit(2); }
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const app = initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: project } : { projectId: project, credential: applicationDefault() });
  const db = getFirestore(app);
  console.log(`${write ? 'Stamping' : 'Dry run (no writes; add --write to stamp)'}: ${project}${process.env.FIRESTORE_EMULATOR_HOST ? ' (emulator)' : ''}`);
  const first = await backfill(db, { write, FieldValue });
  for (const [c, n] of Object.entries(first)) console.log(`${c}: ${n.total} total, ${n.missing} without ${FIELD}${write ? `, ${n.stamped} stamped` : ''}`);
  if (write) {
    const after = await backfill(db, { write: false });
    const left = Object.values(after).reduce((s, n) => s + n.missing, 0);
    console.log(`After: ${left} left without ${FIELD}`);
    process.exit(left ? 1 : 0);
  }
}

if (process.argv[1]?.endsWith('backfill-server-at.mjs')) {
  main(process.argv.slice(2)).catch(e => { console.error(e.message || e); process.exit(1); });
}
