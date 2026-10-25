// Stand-in for Cloud Firestore (tests only): one map of path -> data on globalThis.fakeFS, live queries with simple
// '==' and 'in' filters, transactions, a rules hook (op, path, before, after) -> allowed, and an online switch.
const fs = globalThis.fakeFS = { docs: new Map(), online: true, rules: () => true, terminated: 0, cleared: 0, watchers: new Set() };
const err = code => Object.assign(new Error(code), { code });
const snapOf = (path, d) => ({ id: path.split('/').pop(), exists: () => !!d, data: () => structuredClone(d), metadata: { hasPendingWrites: false } });
const notify = () => { for (const w of fs.watchers) w(); };
export const initializeFirestore = () => ({});
export const getFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const serverTimestamp = () => Date.now();
export const deleteField = () => undefined;
export const doc = (base, ...segs) => ({ path: [...(base.path ? [base.path] : []), ...segs].join('/') });
export const collection = (_db, ...segs) => ({ path: segs.join('/'), filters: [] });
export const where = (field, op, value) => ({ field, op, value });
export const limit = () => null;
export const orderBy = () => null;
export const query = (col, ...fs) => ({ path: col.path, filters: [...col.filters, ...fs.filter(Boolean)] });
const match = (q, d) => q.filters.every(f => f.op === '==' ? d[f.field] === f.value : f.op === 'in' ? f.value.includes(d[f.field]) : true);
const inColl = (q, path) => path.startsWith(q.path + '/') && !path.slice(q.path.length + 1).includes('/');
export async function getDoc(ref) { return snapOf(ref.path, fs.docs.get(ref.path)); }
export async function getDocFromServer(ref) { if (!fs.online) throw err('unavailable'); return getDoc(ref); }
export async function getDocs(q) { const docs = [...fs.docs].filter(([p, d]) => inColl(q, p) && match(q, d)).map(([p, d]) => snapOf(p, d)); return { docs, size: docs.length }; }
export async function setDoc(ref, data) { fs.docs.set(ref.path, structuredClone(data)); notify(); }
export async function waitForPendingWrites() {}
export async function terminate() { fs.terminated++; }
export async function clearIndexedDbPersistence() { fs.cleared++; }
export function onSnapshot(q, _opts, next) {
  const run = () => { if (!fs.online) return; getDocs(q).then(s => next({ ...s, metadata: { fromCache: false, hasPendingWrites: false } })); };
  fs.watchers.add(run); run();
  return () => fs.watchers.delete(run);
}
export async function runTransaction(_db, fn) {
  if (!fs.online) throw err('unavailable');
  const writes = [];
  const tx = {
    async get(ref) { const d = fs.docs.get(ref.path); if (!fs.rules('read', ref.path, d || null, null)) throw err('permission-denied'); return snapOf(ref.path, d); },
    set(ref, data) { writes.push([ref.path, structuredClone(data)]); },
    delete(ref) { writes.push([ref.path, null]); },
  };
  const out = await fn(tx);
  for (const [p, d] of writes) { const before = fs.docs.get(p) || null; if (!fs.rules(d ? (before ? 'update' : 'create') : 'delete', p, before, d)) throw err('permission-denied'); }
  for (const [p, d] of writes) d ? fs.docs.set(p, d) : fs.docs.delete(p);
  notify();
  return out;
}
export function writeBatch() { const w = []; return { set: (r, d) => w.push([r.path, d]), delete: r => w.push([r.path, null]), update: (r, d) => w.push([r.path, { ...fs.docs.get(r.path), ...d }]), commit: async () => { for (const [p, d] of w) d ? fs.docs.set(p, d) : fs.docs.delete(p); notify(); } }; }
