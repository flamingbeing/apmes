// This device's own copy of an account's cases, reflections and notes (app-sync's stores, through createApp in
// sync-app.js; the sync engine keeps it in step with Firestore). One IndexedDB database per account and mode,
// "apmes-logbook-store:<email>" (the demo: "apmes-logbook-store:demo:<email>"), with an object store per collection and
// a meta record per collection; the bin keeps only its meta record. Falls back to memory where IndexedDB is missing or
// refused. Signing out deletes every store on the device (wipeStores), and tells other tabs. Same names as before
// app-sync, so copies already on a device carry on.
import { app, COLLS } from './sync-app.js';

export { COLLS };
export const { openStore, wipeStores, storeName } = app.parts.stores;
