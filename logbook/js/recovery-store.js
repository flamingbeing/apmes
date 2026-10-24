// Private device recovery records: the write queue's outbox (app-sync's createOutbox). A completed transaction (or a
// successful localStorage fallback) is required before an editor may discard its input. Same database and keys as
// before app-sync ("apmes-logbook-recovery"), so saves waiting on a device when it updates are still sent.
import { createOutbox, checkWrite as check } from './app-sync.js';
export { recordSignature } from './app-sync.js';

export const CONFLICT = 'This record changed elsewhere. Both versions are kept in Recover';
export const checkWrite = (current, desired, base) => check(current, desired, base, CONFLICT);

const realm = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo') ? 'demo' : 'account';
export const recoveryStore = createOutbox({ name: 'apmes-logbook-recovery', realm });
