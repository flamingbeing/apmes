// The signed-in counts card: total cases and cases per category, from the resident's own counts summary (the same
// summaries/{rid} the Logbook writes; Firestore rules decide who may read it, nothing here changes them). Read only:
// the home page never writes to Firestore.
// Off by default; turned on per device (ON_KEY). The Firebase SDK loads only when it is on and this browser has signed in
// to the Logbook before (SIGNED_IN_PREFIX), so the page stays instant for everyone else. Same address as the Logbook, so
// its sign-in is seen here; the Logbook's own config picks the test project on beta- hosts.

export const ON_KEY = 'apmes-home-counts';
const SIGNED_IN_PREFIX = 'apmes-logbook-who:';     // the Logbook keeps one per signed-in account (app.js saveWho)
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const WAIT = 8000;                                 // ms before saying the counts need a connection

export const isOn = store => { try { return store.getItem(ON_KEY) === '1'; } catch { return false; } };
export function setOn(store, on) {
  try { on ? store.setItem(ON_KEY, '1') : store.removeItem(ON_KEY); } catch { /* storage blocked: this visit only */ }
}

// true when this browser has a Logbook sign-in (not the demo's)
export function hasSignIn(store) {
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(SIGNED_IN_PREFIX) && !k.startsWith(SIGNED_IN_PREFIX + 'demo:')) return true;
    }
  } catch { /* storage blocked */ }
  return false;
}

// summary { total, counts: { code: n } } + the Logbook's CATEGORIES -> [{ code, name, n }] with n > 0, in category order
export function countRows(summary, categories) {
  const counts = (summary && summary.counts) || {};
  return categories.filter(c => !c.retired && Number(counts[c.code]) > 0).map(c => ({ code: c.code, name: c.name, n: Number(counts[c.code]) }));
}

const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('offline')), ms))]);

// -> { state: 'signed-out' } | { state: 'no-entry' } (no programme entry linked) | { state: 'empty' } |
//    { state: 'ok', total, rows } ; throws when offline or the SDK can't load
export async function loadCounts() {
  const [{ FIREBASE_CONFIG }, { CATEGORIES }, app, auth, fs] = await within(Promise.all([
    import('/logbook/js/firebase-config.js'),
    import('/logbook/js/categories.js'),
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
  ]), WAIT);
  const a = app.getApps().length ? app.getApp() : app.initializeApp(FIREBASE_CONFIG);
  const au = auth.getAuth(a);
  const user = await within(new Promise(done => { const off = auth.onAuthStateChanged(au, u => { off(); done(u); }); }), WAIT);
  if (!user || !user.email) return { state: 'signed-out' };
  const db = fs.getFirestore(a);
  const email = String(user.email).trim().toLowerCase();
  const lb = await within(fs.getDoc(fs.doc(db, 'logbooks', email)), WAIT);
  const rid = lb.exists() ? lb.data().rid : null;
  if (rid == null || rid === '') return { state: 'no-entry' };
  const s = await within(fs.getDoc(fs.doc(db, 'summaries', String(rid))), WAIT);
  if (!s.exists()) return { state: 'empty' };
  const summary = s.data();
  return { state: 'ok', total: Number(summary.total) || 0, rows: countRows(summary, CATEGORIES) };
}
