// Storage for evaluations: Google sign-in and Cloud Firestore (Firebase, the logbook's project), with
// an offline cache so an assessor can fill in a form without signal and it syncs later. With ?demo in
// the URL, everything goes to an in-browser stand-in instead (demo-backend.js) and Firebase is never
// loaded. Who may read or write what is enforced by logbook/firestore.rules on Google's side.
//
// Data (see SPEC.md):
//   admins/{email}, pds/{email}            roles (added by hand / by admins)
//   residents/{rid}                        { rid, name, email, status, intake, rYear, smo? }   admins or PDs write
//   faculty/{email}                        { email, name, status: ACTIVE|INACTIVE, updatedAt }   admins or PDs write
//   applications/{uid}                     { uid, email, name, role, note, status, createdAt, decidedAt?, decidedBy? }
//   evaluations/{id}                       see EVAL_FIELDS in schema.js
//
// Evaluations are saved through app-sync's write queue (eval-queue.js): a durable outbox on this device, then one
// transaction per record, merged by field onto the server's copy. The other writes (roles, people lists, access)
// go straight to the SDK; they keep the sign-out check shut until the server has them.

import { FIREBASE_CONFIG } from './firebase-config.js';
import * as D from './demo-backend.js';
import { plain, lc, cleanEval, cleanPatch, stampPatch, cleanFaculty, cleanResident, cleanApplication, newRid } from './schema.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const demo = (() => {
  try { return typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'); } catch { return false; }
})();
export const enabled = demo || !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
// Email-link sign-in (hospital addresses) waits for the paid plan; Google only for now.
export const EMAIL_LINK = false;
// Demo role switch (More); harmless no-ops outside the demo.
export const DEMO_USERS = D.DEMO_USERS;
export const demoRole = () => (demo ? D.demoRole() : null);
export const setDemoRole = role => { if (demo) D.setDemoRole(role); };
export const resetDemo = opts => { if (demo) D.resetDemo(opts); };

export const SENT = ['requested', 'submitted', 'declined', 'cancelled'];
const ACK_WAIT = 3000;        // ms to wait for the server before treating a write as queued

let fb = null;
async function sdk() {
  if (fb) return fb;
  fb = (async () => {
    const [app, auth, fs] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js'),
    ]);
    const a = app.initializeApp(FIREBASE_CONFIG);
    return { app: a, auth: auth.getAuth(a), db: openDb(a, fs), A: auth, F: fs };
  })();
  fb.catch(() => { fb = null; });   // e.g. offline on first ever load: try again next time
  return fb;
}

function openDb(a, fs) {
  try {
    return fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch (e) {
    console.warn('Offline cache unavailable; using memory only', e);
    return fs.getFirestore(a);
  }
}

// ---- writes that work offline ----
// Firestore applies a write to the local cache at once (listeners fire straight away) but the
// promise only settles when the server confirms. Offline that can be hours, so wait a little and
// then return; a later failure (e.g. a rules rejection) is reported to onSyncError listeners.
const syncErrorListeners = new Set();
export function onSyncError(cb) {
  if (demo) return D.onSyncError(cb);
  syncErrorListeners.add(cb);
  return () => syncErrorListeners.delete(cb);
}
function queued(p) {
  let late = false;
  p.catch(e => { if (late) { console.error('Sync failed', e); for (const cb of syncErrorListeners) cb(e); } });
  return Promise.race([p, new Promise(r => setTimeout(() => { late = true; r(); }, ACK_WAIT))]);
}
// ---- the evaluations write queue ----
// Loaded at the first sign-in, never in the demo (app-sync comes from core.anawj.com; sw.js keeps it offline), so CCC
// and People, which sign in through this file, load without it until someone signs in.
const KIND = 'evaluation';
let owner = null;   // the signed-in email (the outbox keeps each account's saves apart)
let evq = null, SY = null, loading = null;
const sdkPending = async () => { if (!fb) return false; const { db, F } = await sdk(); let done = false; await Promise.race([F.waitForPendingWrites(db).then(() => { done = true; }, () => { done = true; }), new Promise(r => setTimeout(r, 300))]); return !done; };
function loadQueue() {
  if (!loading) loading = Promise.all([import('./eval-queue.js'), import('./app-sync.js')]).then(([Q, sync]) => {
    SY = sync;
    evq = Q.createEvalQueue({ sdk, store: sync.createOutbox({ name: 'apmes-evals-outbox' }), getOwner: () => owner, otherPending: sdkPending });
    evq.queue.onChange(onQueueChange);
    if (typeof addEventListener === 'function') addEventListener('online', () => evq.queue.kick());
    return evq;
  });
  loading.catch(() => { loading = null; });   // e.g. offline before it was ever saved: try again next time
  return loading;
}
const evalQueue = () => { if (!evq) throw Object.assign(new Error('The save queue has not loaded: check your signal and try again'), { code: 'unavailable' }); return evq; };
// a save the server refused is reported once: to the screen that made it (onError, or the screen waiting for the
// answer: 'wait'), else to onSyncError listeners. errorFor: record id -> onError | 'wait'.
const reported = new Set(), errorFor = new Map();
const queueListeners = new Set();
function onQueueChange() {
  for (const x of evq.queue.entries()) {
    if (x.state !== 'failed' || reported.has(x.key)) continue;
    const cb = errorFor.get(x.record.id);
    if (cb === 'wait') continue;   // save() throws it
    reported.add(x.key);
    const e = new Error(x.error); e.code = evq.codeOf(x.record.id);
    if (cb) { errorFor.delete(x.record.id); cb(e); } else { console.error('Sync failed', e); for (const l of syncErrorListeners) l(e); }
  }
  for (const cb of [...queueListeners]) cb();
}

// ---- sync status (the header chip) ----
// confirmed: a list has come from the server (not the device's copy) since sign-in, so the chip never says synced on
// the strength of the cache alone. persisted: persistGuard's answer (at-risk only while offline: online, a save
// waits seconds).
let heard = false, persisted = true;
export function syncState() {
  if (demo || !owner) return { state: 'synced', count: 0 };
  if (!evq) return { state: 'unknown', count: 0 };
  const q = evq.queue;
  return SY.syncStatus({ online: typeof navigator === 'undefined' || navigator.onLine !== false, pending: q.pending(), attention: SY.attentionCount(q.entries()),
    persisted, confirmed: heard, atRiskOnlyOffline: true });
}
// cb() whenever the chip may change (a save queued, sent or refused, the first answer from the server)
export function onSyncChange(cb) {
  queueListeners.add(cb);
  return () => queueListeners.delete(cb);
}
const changed = () => { for (const cb of [...queueListeners]) cb(); };
// Saves the server refused (or met a change it can't take): the chip's sheet offers Retry or Discard.
export const unsentEntries = () => (demo || !owner || !evq ? [] : evq.queue.entries().filter(x => x.state === 'failed' || x.state === 'pending' || x.state === 'conflict'));
export const retrySave = key => evalQueue().queue.retry(key);
export const discardSave = key => evalQueue().queue.archive(key);
export const pendingSaves = () => (demo || !owner || !evq ? 0 : evq.queue.pending());

// For apps built on evals' sign-in that keep their own collections (selection/): the Firestore handle and the same
// offline-friendly write. Never used in the demo.
export async function firestore() {
  const { db, F } = await sdk();
  return { db, F, queued };
}
// a read that answers null instead of failing when access is denied or the device is offline
const soft = p => p.catch(e => {
  if (!['permission-denied', 'unavailable'].includes(e?.code)) console.warn('Read failed', e);
  return null;
});

// True when this phone holds writes the server hasn't confirmed yet (e.g. a form submitted without
// signal). Signing out would delete them with the offline cache, so the UI asks first.
// The outbox (this account's and another tab's) and the SDK's own pending writes both count.
export async function hasUnsentWrites(ms = 1500) {
  if (demo || !owner) return false;
  if (!evq) return sdkPending();
  return !(await evq.queue.flush(ms));
}
// Resolves once every write made so far has reached the server (outbox empty, SDK writes confirmed).
export async function whenSynced() {
  if (demo) return;
  if (owner && evq) {
    const q = evq.queue;
    await new Promise(resolve => {
      const check = () => { if (!q.pending()) { off(); resolve(); } };
      const off = q.onChange(check); check();
    });
  }
  const { db, F } = await sdk();
  await F.waitForPendingWrites(db);
}

// ---- sign-in ----

// A guest (applicants' passcode sign-in, a custom token) has no email: it is keyed as guest-<uid>, and flagged so apps can treat it as no one in particular.
// role: 'guest' (sends feedback), 'setup' (sets the round up) or 'committee' (reads the results), from the token's claim; older tokens have none, so 'guest'.
const asUser = async u => {
  if (!u) return null;
  if (u.email) return { email: lc(u.email), name: u.displayName || u.email, uid: u.uid };
  let role = 'guest';
  try { const r = (await u.getIdTokenResult()).claims.role; if (r === 'setup' || r === 'committee') role = r; } catch {}
  return { email: 'guest-' + u.uid, name: 'Guest', uid: u.uid, guest: true, role };
};

export async function watchUser(cb) {
  if (demo) return D.watchUser(cb);
  if (!enabled) return;
  const { auth, A } = await sdk();
  // finishes a redirect sign-in (the fallback below) when the page loads again
  A.getRedirectResult(auth).catch(e => console.warn('Redirect sign-in failed', e));
  A.onAuthStateChanged(auth, async u => {
    const user = await asUser(u);
    owner = user && !user.guest ? user.email : null;
    heard = false;
    if (owner) {
      const email = owner;
      await loadQueue().then(q => {
        if (owner !== email) return;
        q.queue.activate(email).then(changed, () => {});
        SY.persistGuard().then(r => { persisted = r.persisted; changed(); });
      }).catch(e => console.warn('Save queue not loaded', e));
    }
    cb(user);
  });
}

// Popup first; redirect when popups are blocked or unsupported (e.g. some home-screen apps).
const REDIRECT_CODES = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported', 'auth/cancelled-popup-request'];
export async function signIn(hint) {
  if (demo) return D.signIn();
  const { auth, A } = await sdk();
  const provider = new A.GoogleAuthProvider();
  // hint: the email an assessor link was sent to (?as=), so Google suggests that account first
  provider.setCustomParameters(hint ? { prompt: 'select_account', login_hint: hint } : { prompt: 'select_account' });
  try {
    await A.signInWithPopup(auth, provider);
  } catch (e) {
    if (!REDIRECT_CODES.includes(e?.code)) throw e;
    await A.signInWithRedirect(auth, provider);
  }
}

// Sign in with a custom token (the applicants' guest passcode; worker/guest.js issues it).
export async function signInWithToken(token) {
  if (demo) return D.signIn();
  const { auth, A } = await sdk();
  await A.signInWithCustomToken(auth, token);
}

// Signing out also wipes this device's offline copy (a shared ward PC keeps nothing): app-sync's forgetDevice, in
// one order: listeners stopped, the outbox of this account, the SDK's cache, then the assessor's answers kept here.
// Callers check hasUnsentWrites first (signOutSafely).
const dropDrafts = () => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('evals-draft-')) localStorage.removeItem(k); } catch {} };
export async function signOut() {
  if (demo) { dropDrafts(); return D.signOut(); }
  const s = await sdk();
  const q = owner && evq ? evq.queue : null;
  for (const stop of [...live]) stop();   // before auth changes, so no listener fails as permission-denied
  await s.A.signOut(s.auth);
  owner = null; heard = false;
  // (app-sync not loaded: nothing of this account is in the outbox here; the SDK's cache still goes)
  const forget = SY ? SY.forgetDevice : async ({ clearBackendCache, extra }) => { await clearBackendCache().catch(e => console.warn(e)); await extra(); };
  await forget({ queue: q, extra: async () => { dropDrafts(); known.clear(); reported.clear(); errorFor.clear(); },
    clearBackendCache: async () => {
      try { await s.F.terminate(s.db); await s.F.clearIndexedDbPersistence(s.db); }
      finally { s.db = openDb(s.app, s.F); }   // a fresh, empty Firestore for the next sign-in
    } });
  changed();
}

// ---- roles ----

// { admin, pd, owner, pc, resident: residents doc|null (ACTIVE preferred), faculty: faculty doc|null, application: own application|null }
// admin is true for the old admins/ list, Admin staff and programme coordinators (PCs have Admin staff's powers); pd and owner
// likewise count both the older lists (pds/, owners/) and roles kept in the app (access/{email}.roles, People › Access).
export async function getRoles(email) {
  if (demo) return D.getRoles(email);
  email = lc(email);
  const { db, F, auth } = await sdk();
  const uid = auth.currentUser?.uid;
  const [adm, pd, res, fac, app, acc, own] = await Promise.all([
    soft(F.getDoc(F.doc(db, 'admins', email))),
    soft(F.getDoc(F.doc(db, 'pds', email))),
    soft(F.getDocs(F.query(F.collection(db, 'residents'), F.where('email', '==', email), F.limit(5)))),
    soft(F.getDoc(F.doc(db, 'faculty', email))),
    uid ? soft(F.getDoc(F.doc(db, 'applications', uid))) : null,
    soft(F.getDoc(F.doc(db, 'access', email))),
    soft(F.getDoc(F.doc(db, 'owners', email))),
  ]);
  const roles = acc?.exists() && Array.isArray(acc.data().roles) ? acc.data().roles : [];
  const residents = res ? res.docs.map(d => d.data()).sort((a, b) => (b.status === 'ACTIVE') - (a.status === 'ACTIVE')) : [];
  // members/{email} → { rid }: lets the rules tell a resident by email (needed to read the faculty list)
  if (residents[0]) {
    const m = await soft(F.getDoc(F.doc(db, 'members', email)));
    if (!m?.exists() || m.data().rid !== residents[0].rid) await soft(queued(F.setDoc(F.doc(db, 'members', email), { rid: String(residents[0].rid) })));
  }
  return {
    admin: !!adm?.exists() || roles.includes('admin') || roles.includes('pc'),
    pd: !!pd?.exists() || roles.includes('pd'),
    owner: !!own?.exists() || roles.includes('owner'),
    pc: roles.includes('pc'),
    selection: roles.includes('selection'),
    resident: residents[0] || null,
    faculty: fac?.exists() ? fac.data() : null,
    application: app?.exists() ? app.data() : null,
  };
}

// ---- people lists (admins and PDs write; everyone signed in reads the faculty list) ----

export async function listFaculty() {
  if (demo) return D.listFaculty();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'faculty'))).docs.map(d => d.data())
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function saveFaculty(f) {
  if (demo) return D.saveFaculty(f);
  const { db, F } = await sdk();
  const doc = cleanFaculty(f);
  await queued(F.setDoc(F.doc(db, 'faculty', doc.email), doc));
  return doc;
}

export async function listResidents() {
  if (demo) return D.listResidents();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'residents'))).docs.map(d => d.data())
    .sort((a, b) => String(a.rid).localeCompare(String(b.rid)));
}

// the ACTIVE residents (name, email, year): any resident may read these (rules: residents/); the query must ask for ACTIVE
export async function listActiveResidents() {
  if (demo) return D.listActiveResidents();
  const { db, F } = await sdk();
  return (await F.getDocs(F.query(F.collection(db, 'residents'), F.where('status', '==', 'ACTIVE')))).docs.map(d => d.data())
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function saveResident(r) {
  if (demo) return D.saveResident(r);
  const { db, F } = await sdk();
  const doc = cleanResident(r);
  await queued(F.setDoc(F.doc(db, 'residents', doc.rid), doc));
  return doc;
}

// ---- access: who holds which role (People › Access) ----
// access/{email} = { email, name, roles, updatedAt, updatedBy }; accessLog/{id} = { by, to, change, at } is written in the same batch
// (rules: logbook/firestore.rules). Admin staff, PCs, PDs and owners list; the log is for Admin staff, PCs and owners.

export async function listAccess() {
  if (demo) return D.listAccess();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'access'))).docs.map(d => ({ ...d.data(), id: d.id, email: d.id }))
    .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
}

// `strays`: capitalised copies of the same email (see mergeAccess in people/js/access.js), deleted in the same batch
export async function saveAccess({ email, name, roles, change, strays = [] } = {}) {
  if (demo) return D.saveAccess({ email, name, roles, change });
  const { db, F, auth } = await sdk();
  const e = lc(email), by = lc(auth.currentUser?.email);
  const doc = { email: e, name: String(name ?? '').slice(0, 200), roles: [...new Set(roles || [])], updatedAt: F.serverTimestamp(), updatedBy: by };
  const b = F.writeBatch(db);
  b.set(F.doc(db, 'access', e), doc);
  for (const id of strays) if (id !== e) b.delete(F.doc(db, 'access', id));
  b.set(F.doc(F.collection(db, 'accessLog')), { by, to: e, change: String(change || 'changed').slice(0, 300), at: F.serverTimestamp() });
  await queued(b.commit());
}

export async function removeAccess(email, change, strays = []) {
  if (demo) return D.removeAccess(email, change);
  const { db, F, auth } = await sdk();
  const e = lc(email), by = lc(auth.currentUser?.email);
  const b = F.writeBatch(db);
  b.delete(F.doc(db, 'access', e));
  for (const id of strays) if (id !== e) b.delete(F.doc(db, 'access', id));
  b.set(F.doc(F.collection(db, 'accessLog')), { by, to: e, change: String(change || 'removed').slice(0, 300), at: F.serverTimestamp() });
  await queued(b.commit());
}

// newest first; { by, to, change, at (ms) }
export async function listAccessLog(n = 50) {
  if (demo) return D.listAccessLog(n);
  const { db, F } = await sdk();
  const snap = await F.getDocs(F.query(F.collection(db, 'accessLog'), F.orderBy('at', 'desc'), F.limit(n)));
  return snap.docs.map(d => { const x = d.data(); return { by: x.by, to: x.to, change: x.change, at: x.at?.toMillis ? x.at.toMillis() : Number(x.at) || 0 }; });
}

// ---- applications to join as faculty or resident ----

// programme directors (pds/{email} → { name }): admins and PDs read the list; only admins change it (rules)
export async function listPDs() {
  if (demo) return D.listPDs();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'pds'))).docs.map(d => ({ email: d.id, name: d.data().name || '' }))
    .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
}
export async function savePD({ email, name } = {}) {
  if (demo) return D.savePD({ email, name });
  const { db, F } = await sdk();
  const e = lc(email);
  await queued(F.setDoc(F.doc(db, 'pds', e), { name: String(name ?? '').slice(0, 200) }));
  return { email: e, name };
}
export async function removePD(email) {
  if (demo) return D.removePD(email);
  const { db, F } = await sdk();
  await queued(F.deleteDoc(F.doc(db, 'pds', lc(email))));
}

export async function applyForRole({ role, name, note } = {}) {
  if (demo) return D.applyForRole({ role, name, note });
  const { db, F, auth } = await sdk();
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first');
  const ref = F.doc(db, 'applications', u.uid);
  const prev = await soft(F.getDoc(ref));
  const doc = cleanApplication({ uid: u.uid, email: u.email, name: name || u.displayName || '', role, note, status: 'pending',
    createdAt: prev?.exists() ? prev.data().createdAt : undefined });
  await queued(F.setDoc(ref, doc));
  return doc;
}

export async function listApplications() {
  if (demo) return D.listApplications();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'applications'))).docs.map(d => d.data())
    .sort((a, b) => (a.status !== 'pending') - (b.status !== 'pending') || (b.createdAt || 0) - (a.createdAt || 0));
}

// Approve (adds the faculty or resident entry in the same batch; an existing resident with that
// email keeps their rid) or reject. Returns the updated application.
export async function decideApplication(uid, { approve, rid, rYear, intake } = {}) {
  if (demo) return D.decideApplication(uid, { approve, rid, rYear, intake });
  const { db, F, auth } = await sdk();
  const ref = F.doc(db, 'applications', String(uid));
  const snap = await F.getDoc(ref);
  if (!snap.exists()) throw new Error('No such application');
  const a = snap.data();
  const b = F.writeBatch(db);
  if (approve && a.role === 'faculty') {
    const f = cleanFaculty({ email: a.email, name: a.name, status: 'ACTIVE' });
    b.set(F.doc(db, 'faculty', f.email), f);
  } else if (approve) {
    const old = (await F.getDocs(F.query(F.collection(db, 'residents'), F.where('email', '==', a.email), F.limit(1)))).docs[0]?.data();
    // never overwrite someone else's entry with a rid that is already taken
    if (!old && rid && (await F.getDoc(F.doc(db, 'residents', String(rid)))).exists()) throw new Error(`Resident ID ${rid} is already in use`);
    const r = cleanResident({ ...(old || {}), rid: rid || old?.rid || newRid(), name: old?.name || a.name, email: a.email, status: 'ACTIVE',
      rYear: rYear ?? old?.rYear ?? null, intake: intake ?? old?.intake ?? null });
    b.set(F.doc(db, 'residents', r.rid), r);
  }
  const decision = { status: approve ? 'approved' : 'rejected', decidedAt: Date.now(), decidedBy: lc(auth.currentUser?.email) };
  b.update(ref, decision);
  await queued(b.commit());
  return { ...a, ...decision };
}

// ---- evaluations ----

// Last known copy of each evaluation (from watchers and reads), to stamp transitions without a read.
const known = new Map();
const remember = list => { for (const d of list) known.set(d.id, d); return list; };

export const newEvaluationId = () => D.newEvaluationId();

// save(record, base, { wait, onError }): through the queue. wait: up to ACK_WAIT for the server's answer, so a
// refusal (rules: the request is closed, the edit window passed) is thrown with its code as before; offline or slow it
// returns and the outbox sends it later. onError (no wait): called if the server refuses it later.
async function save(record, base, { wait = true, onError = null } = {}) {
  const q = (evq || await loadQueue()).queue, id = String(record.id), email = signedInAs();
  errorFor.set(id, wait ? 'wait' : onError);
  if (!wait && !onError) errorFor.delete(id);
  const refused = () => {
    const key = q.jobKey(KIND, id), job = q.entries().find(x => x.key === key);
    reported.add(key);
    const e = new Error(job?.error || 'Could not save'); e.code = evq.codeOf(id); return e;
  };
  try { await q.save(KIND, email, record, base); }
  catch (e) { if (errorFor.get(id) === 'wait') errorFor.delete(id); if (!e.code) e.code = evq.codeOf(id); reported.add(q.jobKey(KIND, id)); throw e; }
  if (!wait) return;
  try {
    await q.settle(KIND, [id], ACK_WAIT);
    if (q.stateOf(q.jobKey(KIND, id)) === 'failed') throw refused();
  } finally { if (errorFor.get(id) === 'wait') errorFor.delete(id); onQueueChange(); }
}
function signedInAs() {
  if (!owner) throw new Error('Sign in first');
  return owner;
}

export async function createEvaluation(ev) {
  if (demo) return D.createEvaluation(ev);
  const doc = cleanEval(ev);
  known.set(doc.id, doc);
  await save(doc, null);
  return doc;
}

// Merge a patch into evaluations/{id} (null removes assessment, metrics, declineReason, …). Submit,
// decline and resend times are stamped here. Returns the merged document as far as it is known.
// { wait: false } returns once the write is in the local cache (autosaves), without waiting for the server.
export async function updateEvaluation(id, patch, { wait = true, onError = null } = {}) {
  if (demo) return D.updateEvaluation(id, patch);
  id = String(id);
  signedInAs();
  const cur = known.get(id) || await getEvaluation(id);
  if (!cur) { const e = new Error('This evaluation is not on this device'); e.code = 'not-found'; throw e; }
  const { set, remove } = cleanPatch(stampPatch(cur, patch));
  const merged = { ...cur, ...set, id };
  for (const k of remove) delete merged[k];
  // the whole record as this device now has it, against the copy the change started from: only the fields that
  // differ are applied to the server's copy (the queue's merge), so another phone's change to other fields stays
  await save(plain(merged), plain(cur), { wait, onError });
  known.set(id, merged);
  return plain(merged);
}

// null when it does not exist or is not yours to see (the rules answer both the same way)
export async function getEvaluation(id) {
  if (demo) return D.getEvaluation(id);
  const { db, F } = await sdk();
  const snap = await soft(F.getDoc(F.doc(db, 'evaluations', String(id))));
  if (!snap || !snap.exists()) return null;
  const d = { ...snap.data(), id: snap.id };
  known.set(d.id, d);
  return d;
}

// Removes a resident's own unsent draft (the only delete the UI offers).
export async function deleteDraft(id) {
  if (demo) return D.deleteDraft(id);
  id = String(id);
  const cur = known.get(id) || await getEvaluation(id);
  await save({ id, _deleted: true }, cur ? plain(cur) : null);
  known.delete(id);
}

// Live lists, newest change first, served from the offline cache when there is no signal.
// cb(list, { fromCache, hasPendingWrites }). Returns an unsubscribe function.
const byNewest = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || String(a.id).localeCompare(String(b.id));
const live = new Set();   // stop functions of open listeners (signOut closes them first)
// The list shows this device's saves not yet on the server (the queue's overlay), limited to what the query asks
// for (keep); hasPendingWrites is also true while the outbox holds a save, so pruneDrafts keeps the answers here.
function watch(build, cb, what, keep = () => true) {
  let stop = null, stopped = false, docs = null, meta = null;
  const show = () => {
    if (stopped || !docs) return;
    const q = owner && evq ? evq.queue : null;
    const list = remember((q ? q.overlay(KIND, owner, docs) : docs).filter(keep)).sort(byNewest);
    cb(list, { fromCache: meta.fromCache, hasPendingWrites: meta.hasPendingWrites || !!(q && q.pending()) });
  };
  const offQueue = onSyncChange(show);
  const end = () => { stopped = true; live.delete(end); offQueue(); if (stop) stop(); };
  live.add(end);
  sdk().then(({ db, F }) => {
    if (stopped) return;
    stop = F.onSnapshot(build(db, F), { includeMetadataChanges: true }, snap => {
      docs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      meta = { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites };
      if (!meta.fromCache && !heard) { heard = true; changed(); }
      show();
    }, e => {
      if (stopped) return;   // e.g. signing out
      console.error(what + ' listener failed', e); for (const l of syncErrorListeners) l(e);
    });
  }).catch(e => { console.error('Firebase did not load', e); for (const l of syncErrorListeners) l(e); });
  return end;
}

export function watchMine(email, cb) {
  if (demo) return D.watchMine(email, cb);
  const me = lc(email);
  return watch((db, F) => F.query(F.collection(db, 'evaluations'), F.where('residentEmail', '==', me)), cb, 'My evaluations', ev => ev.residentEmail === me);
}
export function watchAssigned(email, cb) {
  if (demo) return D.watchAssigned(email, cb);
  // never the resident's unsent drafts (the rules hide those from the assessor)
  return watch((db, F) => F.query(F.collection(db, 'evaluations'), F.where('assessorEmail', '==', lc(email)),
    F.where('status', 'in', SENT)), cb, 'Assigned evaluations', ev => ev.assessorEmail === lc(email) && SENT.includes(ev.status));
}
// PDs and admins only
export function watchAll(cb) {
  if (demo) return D.watchAll(cb);
  return watch((db, F) => F.collection(db, 'evaluations'), cb, 'All evaluations');
}
