// Firestore rules checks for the CCC app (collection ccc/ (staff are PDs, Admin staff and PCs; PCs come from access/)) against the local emulator, fake accounts only.
// Rules: logbook/firestore.rules. Run from the repo root:  tools/test-rules.sh   (or, with the emulator on port 8085,
//   npx firebase emulators:exec --only firestore --project demo-logbook "node ccc/test/rules.emulator.mjs")
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import fs from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'demo-logbook',
  firestore: { rules: fs.readFileSync('logbook/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
});
const as = (email, verified = true) => env.authenticatedContext(email, { email, email_verified: verified }).firestore();
const ADMIN = 'boss@example.com', PD = 'pd@example.com', PC = 'pc@example.com', RES = 'alice@example.com', RES2 = 'bob@example.com';
const FAC = 'dr.fac@example.com', STRANGER = 'stranger@example.com', ADMIN2 = 'admin2@example.com';
const round = (o = {}) => ({ round: 'r1', title: 'CCC round', status: 'open', deadline: '2026-12-01', updatedAt: 1, ...o });
const entry = (email, o = {}) => ({ email, name: 'Someone', noProjects: false, projects: [{ title: 'Audit', status: 'ongoing' }], admin: [], teaching: [], conferences: [], updatedAt: serverTimestamp(), ...o });
const msf = (email, o = {}) => ({ email, name: 'Someone', nominees: [{ id: 'n1', group: 'senior', name: 'Dr Example' }], updatedAt: serverTimestamp(), ...o });
const INV = 'a'.repeat(32), INV_OLD = 'b'.repeat(32), INV_NEW = 'c'.repeat(32), INV_NONE = 'd'.repeat(32);
const invite = (o = {}) => ({ resident: RES2, nomineeId: 'n1', group: 'senior', residentName: 'Bob', raterName: 'Dr Example', createdAt: serverTimestamp(), createdBy: PC, ...o });
const answer = (o = {}) => ({ answers: { q1: 3, q2: 4, q3: 'na', q4: 2, q5: 3, q6: 'no' }, comments: { c1: 'Calm in a crisis.', c2: 'Speak up sooner.' }, declined: false, submittedAt: serverTimestamp(), ...o });
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admins', ADMIN), { name: 'Boss' });
  await setDoc(doc(db, 'admins', ADMIN2), { name: 'Admin Two' });
  await setDoc(doc(db, 'pds', PD), { name: 'PD' });
  await setDoc(doc(db, 'access', PC), { email: PC, name: 'PC', roles: ['pc'], updatedAt: 1, updatedBy: 'x@example.com' });
  await setDoc(doc(db, 'residents', 'R1'), { rid: 'R1', name: 'Alice', email: RES, status: 'ACTIVE', intake: 2024 });
  await setDoc(doc(db, 'residents', 'R2'), { rid: 'R2', name: 'Bob', email: RES2, status: 'ACTIVE', intake: 2024 });
  await setDoc(doc(db, 'members', RES), { rid: 'R1' });
  await setDoc(doc(db, 'members', RES2), { rid: 'R2' });
  await setDoc(doc(db, 'residents', 'R3'), { rid: 'R3', name: 'Carol', email: 'carol@example.com', status: 'ON LEAVE', intake: 2023 });
  await setDoc(doc(db, 'faculty', FAC), { email: FAC, name: 'Dr Fac', status: 'ACTIVE', updatedAt: 1 });
  await setDoc(doc(db, 'ccc', 'r1'), round());
  await setDoc(doc(db, 'ccc', 'old'), round({ round: 'old', status: 'closed' }));
  await setDoc(doc(db, 'ccc', 'r1', 'entries', RES2), entry(RES2, { updatedAt: 1 }));
  await setDoc(doc(db, 'ccc', 'r1', 'msf', RES2), msf(RES2, { updatedAt: 1 }));
  // raters: RES2's nominees n1 Checked, n2 to swap, n3 Emailed; one invite in the open round, one in a closed round
  await setDoc(doc(db, 'ccc', 'r1', 'review', RES2), { email: RES2, marks: { n1: 'ok', n2: 'swap', n3: 'sent' }, updatedAt: 1 });
  await setDoc(doc(db, 'ccc', 'r1', 'invites', INV), invite({ createdAt: 1, createdBy: PC }));
  await setDoc(doc(db, 'ccc', 'old', 'invites', INV_OLD), invite({ createdAt: 1, createdBy: PC }));
});
let n = 0, fail = 0;
async function t(name, p) { n++; try { await p; } catch (e) { fail++; console.log('FAIL', name, e.message.slice(0, 300)); } }
const adm = as(ADMIN), adm2 = as(ADMIN2), pd = as(PD), pc = as(PC), res = as(RES), res2 = as(RES2), fac = as(FAC), str = as(STRANGER);
const anon = env.unauthenticatedContext().firestore();

// ---- rounds ----
for (const [who, db] of [['resident', res], ['pc', pc], ['pd', pd], ['admin', adm]]) await t(`${who} reads a round`, assertSucceeds(getDoc(doc(db, 'ccc', 'r1'))));
await t('resident lists rounds', assertSucceeds(getDocs(collection(res, 'ccc'))));
await t('faculty cannot read a round', assertFails(getDoc(doc(fac, 'ccc', 'r1'))));
await t('stranger cannot read a round', assertFails(getDoc(doc(str, 'ccc', 'r1'))));
await t('signed out cannot read a round', assertFails(getDoc(doc(anon, 'ccc', 'r1'))));
await t('pc creates a round', assertSucceeds(setDoc(doc(pc, 'ccc', 'r2'), round({ round: 'r2' }))));
await t('pc closes a round', assertSucceeds(setDoc(doc(pc, 'ccc', 'r2'), round({ round: 'r2', status: 'closed', closedAt: 5 }))));
await t('pd creates a round', assertSucceeds(setDoc(doc(pd, 'ccc', 'r3'), round({ round: 'r3' }))));
await t('admin updates a round', assertSucceeds(setDoc(doc(adm, 'ccc', 'r3'), round({ round: 'r3', status: 'closed' }))));
await t('resident cannot create a round', assertFails(setDoc(doc(res, 'ccc', 'r4'), round({ round: 'r4' }))));
await t('resident cannot change a round', assertFails(setDoc(doc(res, 'ccc', 'r1'), round({ title: 'Mine' }))));
await t('round id must match', assertFails(setDoc(doc(pc, 'ccc', 'r5'), round({ round: 'other' }))));
await t('round status is checked', assertFails(setDoc(doc(pc, 'ccc', 'r6'), round({ round: 'r6', status: 'maybe' }))));
await t('round takes no extra fields', assertFails(setDoc(doc(pc, 'ccc', 'r7'), round({ round: 'r7', secret: 1 }))));
await t('pc deletes a round', assertSucceeds(deleteDoc(doc(pc, 'ccc', 'r2'))));
await t('pd deletes a round', assertSucceeds(deleteDoc(doc(pd, 'ccc', 'r3'))));

// ---- project entries ----
await t('resident saves their entry', assertSucceeds(setDoc(doc(res, 'ccc', 'r1', 'entries', RES), entry(RES))));
await t('resident changes it while open', assertSucceeds(setDoc(doc(res, 'ccc', 'r1', 'entries', RES), entry(RES, { name: 'Alice', noProjects: true, projects: [] }))));
await t('resident cannot write as someone else', assertFails(setDoc(doc(res, 'ccc', 'r1', 'entries', RES2), entry(RES2))));
await t('resident cannot claim another email in the body', assertFails(setDoc(doc(res, 'ccc', 'r1', 'entries', RES), entry(RES2))));
await t('faculty cannot write an entry', assertFails(setDoc(doc(fac, 'ccc', 'r1', 'entries', FAC), entry(FAC))));
await t('pc cannot write an entry', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'entries', PC), entry(PC))));
await t('stranger cannot write an entry', assertFails(setDoc(doc(str, 'ccc', 'r1', 'entries', STRANGER), entry(STRANGER))));
await t('no entries to a closed round', assertFails(setDoc(doc(res, 'ccc', 'old', 'entries', RES), entry(RES))));
await t('updatedAt must be the server time', assertFails(setDoc(doc(res, 'ccc', 'r1', 'entries', RES), entry(RES, { updatedAt: 5 }))));
await t('entry takes no extra fields', assertFails(setDoc(doc(res, 'ccc', 'r1', 'entries', RES), entry(RES, { extra: 1 }))));
await t('entry cannot carry nominees', assertFails(setDoc(doc(res, 'ccc', 'r1', 'entries', RES), entry(RES, { nominees: [] }))));
await t('entry needs a name', assertFails(setDoc(doc(res, 'ccc', 'r1', 'entries', RES), entry(RES, { name: '' }))));
await t('entry lists are capped', assertFails(setDoc(doc(res, 'ccc', 'r1', 'entries', RES), entry(RES, { projects: Array.from({ length: 31 }, (_, i) => ({ title: 'p' + i })) }))));
await t('resident reads only their own entry', assertSucceeds(getDoc(doc(res, 'ccc', 'r1', 'entries', RES))));
await t('resident cannot read another entry', assertFails(getDoc(doc(res, 'ccc', 'r1', 'entries', RES2))));
await t('resident cannot list entries', assertFails(getDocs(collection(res, 'ccc', 'r1', 'entries'))));
await t('faculty cannot list entries', assertFails(getDocs(collection(fac, 'ccc', 'r1', 'entries'))));
await t('admin staff lists entries', assertSucceeds(getDocs(collection(adm, 'ccc', 'r1', 'entries'))));
await t('pc lists entries', assertSucceeds(getDocs(collection(pc, 'ccc', 'r1', 'entries'))));
await t('pd lists entries', assertSucceeds(getDocs(collection(pd, 'ccc', 'r1', 'entries'))));
await t('resident cannot delete their entry', assertFails(deleteDoc(doc(res, 'ccc', 'r1', 'entries', RES))));
await t('pd deletes an entry', assertSucceeds(deleteDoc(doc(pd, 'ccc', 'r1', 'entries', RES2))));

// ---- nominees ----
await t('resident saves their nominees', assertSucceeds(setDoc(doc(res, 'ccc', 'r1', 'msf', RES), msf(RES))));
await t('resident cannot write another resident\'s nominees', assertFails(setDoc(doc(res, 'ccc', 'r1', 'msf', RES2), msf(RES2))));
await t('faculty cannot write nominees', assertFails(setDoc(doc(fac, 'ccc', 'r1', 'msf', FAC), msf(FAC))));
await t('no nominees to a closed round', assertFails(setDoc(doc(res, 'ccc', 'old', 'msf', RES), msf(RES))));
await t('nominees updatedAt must be the server time', assertFails(setDoc(doc(res, 'ccc', 'r1', 'msf', RES), msf(RES, { updatedAt: 5 }))));
await t('nominees take no extra fields', assertFails(setDoc(doc(res, 'ccc', 'r1', 'msf', RES), msf(RES, { marks: {} }))));
await t('nominees are capped', assertFails(setDoc(doc(res, 'ccc', 'r1', 'msf', RES), msf(RES, { nominees: Array.from({ length: 21 }, (_, i) => ({ id: 'n' + i })) }))));
await t('resident reads their own nominees', assertSucceeds(getDoc(doc(res, 'ccc', 'r1', 'msf', RES))));
await t('resident cannot read another\'s nominees', assertFails(getDoc(doc(res, 'ccc', 'r1', 'msf', RES2))));
await t('resident cannot list nominees', assertFails(getDocs(collection(res, 'ccc', 'r1', 'msf'))));
await t('admin staff lists nominees', assertSucceeds(getDocs(collection(adm, 'ccc', 'r1', 'msf'))));
await t('pc lists nominees', assertSucceeds(getDocs(collection(pc, 'ccc', 'r1', 'msf'))));
await t('pd lists nominees', assertSucceeds(getDocs(collection(pd, 'ccc', 'r1', 'msf'))));
await t('pc cannot edit nominees', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'msf', RES), msf(RES))));
await t('resident clears their nominees while open', assertSucceeds(deleteDoc(doc(res, 'ccc', 'r1', 'msf', RES))));
await t('resident cannot delete after the round closes', assertFails(deleteDoc(doc(res, 'ccc', 'old', 'msf', RES))));
await t('pc deletes nominees (retention)', assertSucceeds(deleteDoc(doc(pc, 'ccc', 'r1', 'msf', RES2))));
await t('stranger cannot delete nominees', assertFails(deleteDoc(doc(str, 'ccc', 'r1', 'msf', RES))));

// ---- the PCs' marks ----
const rev = (email, o = {}) => ({ email, marks: { n1: 'ok' }, updatedAt: 1, ...o });
await t('pc writes marks', assertSucceeds(setDoc(doc(pc, 'ccc', 'r1', 'review', RES), rev(RES))));
await t('pd reads marks', assertSucceeds(getDoc(doc(pd, 'ccc', 'r1', 'review', RES))));
await t('resident cannot read marks', assertFails(getDoc(doc(res, 'ccc', 'r1', 'review', RES))));
await t('resident cannot write marks', assertFails(setDoc(doc(res, 'ccc', 'r1', 'review', RES), rev(RES))));
await t('admin staff writes marks', assertSucceeds(setDoc(doc(adm, 'ccc', 'r1', 'review', RES), rev(RES))));
await t('faculty cannot write marks', assertFails(setDoc(doc(fac, 'ccc', 'r1', 'review', RES), rev(RES))));
await t('marks take no extra fields', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'review', RES), rev(RES, { x: 1 }))));
await t('pc clears marks', assertSucceeds(deleteDoc(doc(pc, 'ccc', 'r1', 'review', RES))));

// ---- raters: invites (one-time links) ----
await t('pc invites a Checked nominee', assertSucceeds(setDoc(doc(pc, 'ccc', 'r1', 'invites', INV_NEW), invite())));
await t('pd invites an Emailed nominee', assertSucceeds(setDoc(doc(pd, 'ccc', 'r1', 'invites', 'e'.repeat(32)), invite({ nomineeId: 'n3', createdBy: PD }))));
await t('no invite for a nominee to swap', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'invites', 'f'.repeat(32)), invite({ nomineeId: 'n2' }))));
await t('no invite for an unchecked nominee', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'invites', 'f'.repeat(32)), invite({ nomineeId: 'n9' }))));
await t('no invite without the PCs\' marks', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'invites', 'f'.repeat(32)), invite({ resident: RES }))));
await t('invite id must be 32 hex characters', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'invites', 'guessable'), invite())));
await t('invite createdBy must be the writer', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'invites', 'f'.repeat(32)), invite({ createdBy: PD }))));
await t('invite createdAt must be the server time', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'invites', 'f'.repeat(32)), invite({ createdAt: 5 }))));
await t('invite takes no extra fields', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'invites', 'f'.repeat(32)), invite({ email: 'x@example.com' }))));
await t('invite group is checked', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'invites', 'f'.repeat(32)), invite({ group: 'boss' }))));
await t('pc cannot change an invite', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'invites', INV), invite({ raterName: 'Someone else' }))));
for (const [who, db] of [['resident', res], ['resident whose invite it is', res2], ['faculty', fac], ['stranger', str], ['signed out', anon]]) {
  await t(`${who} cannot invite`, assertFails(setDoc(doc(db, 'ccc', 'r1', 'invites', 'f'.repeat(32)), invite({ createdBy: who === 'signed out' ? PC : RES }))));
}
await t('signed out reads one invite by its link', assertSucceeds(getDoc(doc(anon, 'ccc', 'r1', 'invites', INV))));
await t('signed out cannot list invites', assertFails(getDocs(collection(anon, 'ccc', 'r1', 'invites'))));
await t('resident cannot list invites', assertFails(getDocs(collection(res2, 'ccc', 'r1', 'invites'))));
await t('faculty cannot list invites', assertFails(getDocs(collection(fac, 'ccc', 'r1', 'invites'))));
await t('pc lists invites', assertSucceeds(getDocs(collection(pc, 'ccc', 'r1', 'invites'))));
await t('admin staff lists invites', assertSucceeds(getDocs(collection(adm, 'ccc', 'r1', 'invites'))));
await t('signed out cannot delete an invite', assertFails(deleteDoc(doc(anon, 'ccc', 'r1', 'invites', INV_NEW))));
await t('pc deletes an invite', assertSucceeds(deleteDoc(doc(pc, 'ccc', 'r1', 'invites', INV_NEW))));

// ---- raters: responses ----
await t('response values are checked', assertFails(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV), answer({ answers: { q1: 5 } }))));
await t('response answers cannot carry long text', assertFails(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV), answer({ answers: { q1: 'x'.repeat(50) } }))));
await t('response comment slots are fixed', assertFails(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV), answer({ comments: { name: 'Dr X' } }))));
await t('response comments are capped', assertFails(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV), answer({ comments: { c1: 'x'.repeat(2001) } }))));
await t('response reason is capped', assertFails(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV), answer({ declined: true, reason: 'x'.repeat(1001) }))));
await t('response takes no extra fields', assertFails(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV), answer({ rater: 'Dr X' }))));
await t('response submittedAt must be the server time', assertFails(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV), answer({ submittedAt: 5 }))));
await t('no response without an invite', assertFails(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV_NONE), answer())));
await t('no response to a closed round', assertFails(setDoc(doc(anon, 'ccc', 'old', 'responses', INV_OLD), answer())));
await t('signed out rater submits once', assertSucceeds(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV), answer())));
await t('a second submit is denied', assertFails(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV), answer({ answers: { q1: 1 } }))));
await t('a decline after submitting is denied', assertFails(setDoc(doc(anon, 'ccc', 'r1', 'responses', INV), answer({ answers: {}, comments: {}, declined: true }))));
await t('pc cannot change a response', assertFails(setDoc(doc(pc, 'ccc', 'r1', 'responses', INV), answer())));
await t('a rater declines with a reason', assertSucceeds(setDoc(doc(anon, 'ccc', 'r1', 'responses', 'e'.repeat(32)), { answers: {}, comments: {}, declined: true, reason: 'On leave', submittedAt: serverTimestamp() })));
for (const [who, db] of [['pc', pc], ['pd', pd]]) {
  await t(`${who} reads a response`, assertSucceeds(getDoc(doc(db, 'ccc', 'r1', 'responses', INV))));
  await t(`${who} lists responses`, assertSucceeds(getDocs(collection(db, 'ccc', 'r1', 'responses'))));
}
for (const [who, db] of [['resident', res2], ['faculty', fac], ['admin staff', adm], ['stranger', str], ['signed out', anon]]) {
  await t(`${who} cannot read a response`, assertFails(getDoc(doc(db, 'ccc', 'r1', 'responses', INV))));
  await t(`${who} cannot list responses`, assertFails(getDocs(collection(db, 'ccc', 'r1', 'responses'))));
}
await t('signed out cannot delete a response', assertFails(deleteDoc(doc(anon, 'ccc', 'r1', 'responses', INV))));

// ---- the CCC report kept after the clean-up (PDs and PCs only) and the clean-up's deletes ----
const report = (o = {}) => ({ email: RES2, name: 'Bob', formId: 'draft-2026-10', counts: { invited: 4, done: 3, declined: 1, waiting: 0 }, enough: true, minGroup: 3,
  overall: { mean: 3.2, n: 12 }, groups: [{ id: 'senior', label: 'Senior doctors', n: 3 }], items: [{ id: 'q1', title: 'Clinical care', overall: { mean: 3, n: 3, notObserved: 0 }, groups: {} }],
  comments: [{ slot: 'c1', title: 'One thing to keep doing', texts: ['Calm.'] }], concerns: { yes: 0, texts: [] }, savedAt: serverTimestamp(), ...o });
for (const [who, db] of [['pc', pc], ['pd', pd]]) await t(`${who} saves a report`, assertSucceeds(setDoc(doc(db, 'ccc', 'old', 'report', RES2), report())));
await t('pc reads a report', assertSucceeds(getDoc(doc(pc, 'ccc', 'old', 'report', RES2))));
await t('pd lists reports', assertSucceeds(getDocs(collection(pd, 'ccc', 'old', 'report'))));
for (const [who, db] of [['admin staff', adm], ['resident', res2], ['faculty', fac], ['stranger', str], ['signed out', anon]]) {
  await t(`${who} cannot read a report`, assertFails(getDoc(doc(db, 'ccc', 'old', 'report', RES2))));
  await t(`${who} cannot list reports`, assertFails(getDocs(collection(db, 'ccc', 'old', 'report'))));
  await t(`${who} cannot save a report`, assertFails(setDoc(doc(db, 'ccc', 'old', 'report', RES), report({ email: RES }))));
  await t(`${who} cannot delete a report`, assertFails(deleteDoc(doc(db, 'ccc', 'old', 'report', RES2))));
}
await t('report email must match its id', assertFails(setDoc(doc(pc, 'ccc', 'old', 'report', RES), report())));
await t('report id is lower case', assertFails(setDoc(doc(pc, 'ccc', 'old', 'report', 'Bob@example.com'), report({ email: 'Bob@example.com' }))));
await t('report takes no extra fields', assertFails(setDoc(doc(pc, 'ccc', 'old', 'report', RES2), report({ raters: ['Dr X'] }))));
await t('report counts take no names', assertFails(setDoc(doc(pc, 'ccc', 'old', 'report', RES2), report({ counts: { invited: 1, done: 1, declined: 0, waiting: 0, who: 'Dr X' } }))));
await t('report savedAt must be the server time', assertFails(setDoc(doc(pc, 'ccc', 'old', 'report', RES2), report({ savedAt: 5 }))));
await t('report lists are capped', assertFails(setDoc(doc(pc, 'ccc', 'old', 'report', RES2), report({ groups: Array(6).fill({ id: 'x', label: 'x', n: 3 }) }))));
await t('pd deletes a report', assertSucceeds(deleteDoc(doc(pd, 'ccc', 'old', 'report', RES2))));
for (const [who, db] of [['admin staff', adm], ['resident', res2], ['faculty', fac]]) await t(`${who} cannot delete a response`, assertFails(deleteDoc(doc(db, 'ccc', 'r1', 'responses', INV))));
await t('the clean-up batch: pc saves the report and deletes the answers and links together', assertSucceeds((async () => {
  await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), 'ccc', 'old', 'responses', INV_OLD), answer({ submittedAt: 1 })); });
  const b = writeBatch(pc);
  b.set(doc(pc, 'ccc', 'old', 'report', RES2), report());
  b.delete(doc(pc, 'ccc', 'old', 'responses', INV_OLD));
  b.delete(doc(pc, 'ccc', 'old', 'invites', INV_OLD));
  await b.commit();
})()));
await t('the clean-up left only the report', assertSucceeds((async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    if ((await getDoc(doc(db, 'ccc', 'old', 'responses', INV_OLD))).exists() || (await getDoc(doc(db, 'ccc', 'old', 'invites', INV_OLD))).exists()) throw new Error('answers or link left');
    if (!(await getDoc(doc(db, 'ccc', 'old', 'report', RES2))).exists()) throw new Error('no report');
  });
})()));
await t('pc deletes a response', assertSucceeds(deleteDoc(doc(pc, 'ccc', 'r1', 'responses', INV))));

// ---- residents can see each other (owner, 17 Oct 2026) ----
const active = c => query(collection(c, 'residents'), where('status', '==', 'ACTIVE'));
await t('a resident lists the active residents', assertSucceeds(getDocs(active(res))));
await t('a resident reads another active resident', assertSucceeds(getDoc(doc(res, 'residents', 'R2'))));
await t('a resident cannot list every resident (the query must ask for ACTIVE)', assertFails(getDocs(collection(res, 'residents'))));
await t('a resident cannot read someone on leave', assertFails(getDoc(doc(res, 'residents', 'R3'))));
await t('a resident cannot list people on leave', assertFails(getDocs(query(collection(res, 'residents'), where('status', '==', 'ON LEAVE')))));
await t('a resident cannot change another resident', assertFails(setDoc(doc(res, 'residents', 'R2'), { rid: 'R2', name: 'Hacked', email: RES2, status: 'ACTIVE', intake: 2024 })));
await t('a resident cannot add a resident', assertFails(setDoc(doc(res, 'residents', 'R9'), { rid: 'R9', name: 'New', email: 'new@example.com', status: 'ACTIVE', intake: 2024 })));
await t('a resident cannot delete a resident', assertFails(deleteDoc(doc(res, 'residents', 'R2'))));
await t('faculty cannot list the residents', assertFails(getDocs(active(fac))));
await t('a stranger cannot list the residents', assertFails(getDocs(active(str))));
await t('signed out cannot list the residents', assertFails(getDocs(active(anon))));
await t('an admin still lists every resident', assertSucceeds(getDocs(collection(adm, 'residents'))));

await env.cleanup();
console.log(fail ? `ccc rules: ${fail} of ${n} checks failed` : `ccc rules: ${n} checks passed`);
process.exit(fail ? 1 : 0);
