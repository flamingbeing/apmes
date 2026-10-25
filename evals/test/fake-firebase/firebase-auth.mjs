// Stand-in for Firebase Auth (tests only): globalThis.fakeAuth.emit(user) signs someone in or out.
const listeners = new Set();
const state = globalThis.fakeAuth = { user: null, emit(u) { state.user = u; for (const l of listeners) l(u); } };
export const getAuth = () => ({ get currentUser() { return state.user; } });
export const getRedirectResult = async () => null;
export const onAuthStateChanged = (_a, cb) => { listeners.add(cb); cb(state.user); return () => listeners.delete(cb); };
export const signOut = async () => state.emit(null);
export class GoogleAuthProvider { setCustomParameters() {} }
