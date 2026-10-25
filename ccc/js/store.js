// The CCC store: rounds, a resident's own entry and nominees, and (for staff) everyone's.
// Live: Firestore in the logbook project (rules: logbook/firestore.rules, "CCC 360"):
//   ccc/{round}                      { round, title, status: 'open'|'closed', deadline?, closedAt?, updatedAt }
//   ccc/{round}/entries/{email}      { email, name, noProjects, projects, admin, teaching, conferences, updatedAt }
//   ccc/{round}/msf/{email}          { email, name, nominees, updatedAt }       (third parties' contact details)
//   ccc/{round}/review/{email}       { email, marks, updatedAt }                 (staff only)
//   ccc/{round}/invites/{id}         { resident, nomineeId, group, residentName, raterName, createdAt, createdBy }
//   ccc/{round}/responses/{id}       { answers, comments, declined, reason?, submittedAt }   (PDs and PCs read)
//   ccc/{round}/report/{email}       the resident's CCC summary, kept when the answers are deleted (PDs and PCs)
// With ?demo: the same calls against this browser's localStorage (made-up people), so the screens are the same.

import { cloud } from '../../evals/js/ui-core.js';
import { overlayRounds, overlayReviews, overlayNominees, overlayInvites } from './overlay.js';
import { entryDoc, msfDoc, cleanEntry, cleanNominees, demoRound, purgeDue, inviteDoc, newInviteId, purgePlan } from './model.js';

const lc = s => String(s || '').trim().toLowerCase();

// The coordinators' writes go through the write queue (writes.js) once the staff screen has set it up (not in the demo,
// which writes to localStorage, and never on the rater's page). Reads below put this device's unsent saves over what the
// server gave, and tell the chip when the server (not the device's copy) answered.
let writes = null;
export const useWrites = w => { writes = w; };
const need = () => { if (!writes) throw new Error('Saving is not ready. Reload the page and try again.'); return writes; };
const unsent = () => writes ? writes.open() : [];
const heard = snap => { if (writes && !snap.metadata?.fromCache) writes.hear(); return snap; };
const KEY = 'ccc-demo-store';
const demoRead = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const demoWrite = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };
const demoDb = () => {
  const d = demoRead(); d.rounds ||= {}; d.entries ||= {}; d.msf ||= {}; d.review ||= {}; d.invites ||= {}; d.responses ||= {}; d.reports ||= {};
  if (!Object.keys(d.rounds).length) {
    // a made-up round with two residents who have sent and one who has not, so the coordinators' view has something to show
    const r = demoRound(); d.rounds[r.round] = r; const t = Date.now() - 86400000;
    const put = (email, name, entry, nominees) => { d.entries[r.round + '|' + email] = { ...entryDoc(email, name, entry), updatedAt: t }; d.msf[r.round + '|' + email] = { ...msfDoc(email, name, nominees), updatedAt: t }; };
    put('aiden.tan@example.com', 'Aiden Tan', { projects: [{ title: 'Audit of ward handover', supervisor: 'Dr Hana Lee', status: 'Ongoing', start: '2026-02' }], teaching: ['Intubation workshop for new MOs'] },
      [{ group: 'senior', name: 'Dr Hana Lee', email: 'dr.hana.lee@example.com' }, { group: 'peer', name: 'Bea Lim', email: 'bea.lim@example.com' }]);
    put('bea.lim@example.com', 'Bea Lim', { noProjects: true }, [{ group: 'senior', name: 'Dr Ivan Chua', email: 'dr.ivan.chua@example.com' }, { group: 'allied', name: 'Nurse Demo', email: 'nurse.demo@example.com' }]);
    demoWrite(d);
  }
  return d;
};
const ms = t => (t?.toMillis ? t.toMillis() : Number(t) || 0);
const toRound = (id, d) => ({ round: id, title: String(d.title || id), status: d.status === 'closed' ? 'closed' : 'open', deadline: d.deadline || '', closedAt: ms(d.closedAt), updatedAt: ms(d.updatedAt) });
const byNewest = (a, b) => b.updatedAt - a.updatedAt || String(b.round).localeCompare(String(a.round));

// every round, newest first (residents and staff read them)
export async function listRounds() {
  if (cloud.demo) return Object.entries(demoDb().rounds).map(([id, d]) => toRound(id, d)).sort(byNewest);
  const { db, F } = await cloud.firestore();
  const list = heard(await F.getDocs(F.collection(db, 'ccc'))).docs.map(d => toRound(d.id, d.data()));
  return overlayRounds(list, unsent(), toRound).sort(byNewest);
}

// a resident's own entry and nominees for a round: { entry, nominees, sentAt } or null if nothing was sent
export async function mine(round, email) {
  email = lc(email);
  if (cloud.demo) {
    const d = demoDb(), e = d.entries[round + '|' + email], m = d.msf[round + '|' + email];
    return e || m ? { entry: cleanEntry(e), nominees: cleanNominees(m?.nominees), sentAt: Math.max(ms(e?.updatedAt), ms(m?.updatedAt)) } : null;
  }
  const { db, F } = await cloud.firestore();
  const get = async col => { try { const s = await F.getDoc(F.doc(db, 'ccc', round, col, email)); return s.exists() ? s.data() : null; } catch (e) { if (e?.code === 'permission-denied') return null; throw e; } };
  const [e, m] = await Promise.all([get('entries'), get('msf')]);
  return e || m ? { entry: cleanEntry(e), nominees: cleanNominees(m?.nominees), sentAt: Math.max(ms(e?.updatedAt), ms(m?.updatedAt)) } : null;
}

// the newest earlier round in which this resident sent an entry (for carrying projects over)
export async function previousEntry(rounds, current, email) {
  for (const r of rounds) {
    if (r.round === current) continue;
    const got = await mine(r.round, email);
    if (got && (got.entry.projects.length || got.entry.noProjects)) return { round: r, entry: got.entry };
  }
  return null;
}

// Send: the entry and the nominees go together in one write. A plain await, so “sent” means the server has it.
export async function send(round, user, name, entry, nominees) {
  const e = entryDoc(user.email, name, entry), m = msfDoc(user.email, name, nominees);
  if (cloud.demo) {
    const d = demoDb(); const key = round + '|' + e.email, t = Date.now();
    d.entries[key] = { ...e, updatedAt: t }; d.msf[key] = { ...m, updatedAt: t }; demoWrite(d); return t;
  }
  const { db, F } = await cloud.firestore();
  const b = F.writeBatch(db);
  b.set(F.doc(db, 'ccc', round, 'entries', e.email), { ...e, updatedAt: F.serverTimestamp() });
  b.set(F.doc(db, 'ccc', round, 'msf', m.email), { ...m, updatedAt: F.serverTimestamp() });
  await b.commit();
  return Date.now();
}

// ---- the coordinators' side (PDs, Admin staff and PCs; the rules allow nobody else to read these) ----

const stamp = (d, t) => ({ ...d, updatedAt: ms(t) });
const byEmail = list => Object.fromEntries(list.map(d => [d.email, d]));
const demoOf = (map, round) => byEmail(Object.entries(map).filter(([k]) => k.startsWith(round + '|')).map(([, v]) => ({ ...v, updatedAt: ms(v.updatedAt) })));
const liveOf = async (round, col) => {
  const { db, F } = await cloud.firestore();
  return byEmail(heard(await F.getDocs(F.collection(db, 'ccc', round, col))).docs.map(d => stamp({ email: d.id, ...d.data() }, d.data().updatedAt)));
};

// open (or change, close, reopen) a round. A round id is chosen once and never changes.
export async function saveRound({ round, title, deadline = '', status = 'open', closedAt = 0 }) {
  const doc = { round, title, status, updatedAt: Date.now() };
  if (deadline) doc.deadline = deadline;
  if (status === 'closed' && closedAt) doc.closedAt = closedAt;
  if (cloud.demo) { const d = demoDb(); d.rounds[round] = doc; demoWrite(d); return toRound(round, doc); }
  await need().saveRound(doc);
  return toRound(round, doc);
}
export const listEntries = round => cloud.demo ? Promise.resolve(demoOf(demoDb().entries, round)) : liveOf(round, 'entries');
export const listNominees = async round => cloud.demo ? demoOf(demoDb().msf, round) : overlayNominees(round, await liveOf(round, 'msf'), unsent());
export const listReviews = async round => cloud.demo ? demoOf(demoDb().review, round) : overlayReviews(round, await liveOf(round, 'review'), unsent());

// the coordinators' marks on one resident's nominees: { [nomineeId]: 'ok' | 'swap' | 'sent' }
// base: the marks as the screen loaded them (the next save's base is the marks this device saved last)
export async function saveMarks(round, email, marks, base = null) {
  email = lc(email);
  const doc = { email, marks: marks || {}, updatedAt: Date.now() };
  if (cloud.demo) { const d = demoDb(); d.review[round + '|' + email] = doc; demoWrite(d); return; }
  await need().saveMarks(round, email, marks || {}, base);
}

// Delete a resident's nominees (and the marks on them): the contact details of people who are not in the programme.
export async function deleteNominees(round, email) {
  email = lc(email);
  if (cloud.demo) { const d = demoDb(); delete d.msf[round + '|' + email]; delete d.review[round + '|' + email]; demoWrite(d); return; }
  await need().deleteNominees(round, email);
}

// Every round that closed more than three years ago (PURGE_DAYS): delete the nominees, and the raters' links and answers after saving each
// resident's CCC summary (report/). Runs when staff open the app. Only PDs and PCs read answers, so with Admin staff the
// rater data waits for a PD or PC (the links stay too: without them the answers could not be summed up). Projects are
// kept. Returns { lists, reports }: nominee lists deleted and summaries saved (0 mostly).
export async function purgeExpired(rounds, now = Date.now()) {
  const done = { lists: 0, reports: 0 };
  for (const r of rounds) {
    if (!purgeDue(r, now)) continue;
    const left = Object.keys(await listNominees(r.round));
    for (const email of left) { await deleteNominees(r.round, email); done.lists++; }
    const [invites, responses] = await Promise.all([listInvites(r.round), listResponses(r.round)]);
    if (!responses || !Object.keys(invites).length && !Object.keys(responses).length) continue;
    const queued = new Set(unsent().filter(x => x.kind === 'purge').map(x => x.record.id));
    for (const step of purgePlan(invites, responses)) { if (queued.has(r.round + '|' + step.email)) continue; await purgeRaters(r.round, step); if (step.report) done.reports++; }
  }
  return done;
}
// one resident's step: the summary saved and the answers and links deleted together, so a failure leaves all or nothing
async function purgeRaters(round, { email, report, inviteIds, responseIds }) {
  if (cloud.demo) {
    const d = demoDb();
    if (report) d.reports[round + '|' + email] = { ...report, savedAt: Date.now() };
    for (const id of responseIds) delete d.responses[round + '|' + id];
    for (const id of inviteIds) delete d.invites[round + '|' + id];
    demoWrite(d); return;
  }
  await need().purgeRaters(round, { email, report, inviteIds, responseIds });
}
// the saved summaries of a round, by resident email; null when this reader may not see them (PDs and PCs only)
export async function listReports(round) {
  if (cloud.demo) return Object.fromEntries(Object.entries(demoDb().reports).filter(([k]) => k.startsWith(round + '|')).map(([k, v]) => [k.slice(round.length + 1), { ...v, savedAt: ms(v.savedAt) }]));
  try {
    const { db, F } = await cloud.firestore();
    return Object.fromEntries((await F.getDocs(F.collection(db, 'ccc', round, 'report'))).docs.map(d => [d.id, { ...d.data(), savedAt: ms(d.data().savedAt) }]));
  } catch (e) { if (e?.code === 'permission-denied') return null; throw e; }
}

// ---- raters' one-time links ----

const byId = (map, round) => Object.fromEntries(Object.entries(map).filter(([k]) => k.startsWith(round + '|')).map(([k, v]) => [k.slice(round.length + 1), v]));
const liveById = async (round, col) => {
  const { db, F } = await cloud.firestore();
  return Object.fromEntries((await F.getDocs(F.collection(db, 'ccc', round, col))).docs.map(d => { const x = d.data(); return [d.id, { ...x, createdAt: ms(x.createdAt), submittedAt: ms(x.submittedAt) }]; }));
};
// every invite of a round, by id (staff)
export const listInvites = async round => {
  if (cloud.demo) return byId(demoDb().invites, round);
  const list = await liveById(round, 'invites');
  return overlayInvites(round, list, unsent());
};
// every answer of a round, by invite id; null when this reader may not see them (only PDs and PCs do; Admin staff do not)
export async function listResponses(round) {
  if (cloud.demo) return byId(demoDb().responses, round);
  try { return await liveById(round, 'responses'); } catch (e) { if (e?.code === 'permission-denied') return null; throw e; }
}
// Make a rater's link for one Checked nominee: { id, ...invite }. The rules check the mark and stamp the time and writer.
// Live, the link is only good once the server has the invite (a rater who opens it sooner finds nothing): `sent` says so.
export async function createInvite(round, resident, nominee, by) {
  const id = newInviteId(), doc = inviteDoc(resident, nominee);
  if (cloud.demo) { const d = demoDb(); d.invites[round + '|' + id] = { ...doc, createdAt: Date.now(), createdBy: lc(by) }; demoWrite(d); return { id, ...doc, sent: true }; }
  await need().saveInvite(round, id, doc, lc(by));
  return { id, ...doc, sent: await need().sent('invite', id) };
}

// ---- the rater's page (no sign-in) ----

// The demo's ready-made rater link (/ccc/rate/?demo#demo/<DEMO_INVITE>, from the demo's landing page): the first visit
// makes it, for Bea Lim's senior doctor, marked Emailed, so it shows in the coordinators' demo too; with it come four
// made-up raters who have already answered for Bea, so her CCC report has figures to show.
export const DEMO_INVITE = 'de'.repeat(16);
const DEMO_RATERS = [['senior', 'Dr Rater One', 4, 'Calm and organised on a busy list.'], ['senior', 'Dr Rater Two', 3, 'Explains the plan clearly to patients.'],
  ['senior', 'Dr Rater Three', 3, ''], ['allied', 'Nurse Rater', 4, 'Always thanks the team.']];
function demoRaterInvite(d, round) {
  const key = round + '|' + DEMO_INVITE, m = d.msf[round + '|bea.lim@example.com'];
  const n = m?.nominees?.find(x => x.group === 'senior');
  if (d.invites[key] || d.responses[key] || !n) return;
  d.invites[key] = { ...inviteDoc(m, n), createdAt: Date.now(), createdBy: 'admin@example.com' };
  DEMO_RATERS.forEach(([group, raterName, q, c1], i) => {
    const k = round + '|' + 'd' + String(i + 1).repeat(31);
    d.invites[k] = { resident: m.email, nomineeId: 'demo' + i, group, residentName: m.name, raterName, createdAt: Date.now(), createdBy: 'admin@example.com' };
    d.responses[k] = { answers: { q1: q, q2: q, q3: q, q4: q, q5: 'na', q6: 'no' }, comments: c1 ? { c1, c2: 'Speak up earlier when a list is running late.' } : {}, declined: false, submittedAt: Date.now() };
  });
  const rk = round + '|' + m.email, rv = d.review[rk] || { email: m.email, marks: {} };
  d.review[rk] = { ...rv, marks: { ...rv.marks, [n.id]: 'sent' }, updatedAt: Date.now() };
  demoWrite(d);
}

// one invite by its link, or null if there is none (an unknown or deleted link)
export async function getInvite(round, id) {
  if (cloud.demo) { const d = demoDb(); if (id === DEMO_INVITE) demoRaterInvite(d, round); return d.invites[round + '|' + id] || null; }
  const { db, F } = await cloud.firestore();
  const s = await F.getDoc(F.doc(db, 'ccc', round, 'invites', id));
  return s.exists() ? s.data() : null;
}
// Send the answers (or a decline) once. A plain await, so "sent" means the server has it. Throws { code: 'used' } when
// the link was used already or the round has closed (the rules refuse both, and a rater may read neither).
export async function submitResponse(round, id, doc) {
  if (cloud.demo) {
    const d = demoDb(), key = round + '|' + id;
    if (!d.invites[key] || d.responses[key] || d.rounds[round]?.status !== 'open') throw Object.assign(new Error('used'), { code: 'used' });
    d.responses[key] = { ...doc, submittedAt: Date.now() }; demoWrite(d); return;
  }
  const { db, F } = await cloud.firestore();
  try { await F.setDoc(F.doc(db, 'ccc', round, 'responses', id), { ...doc, submittedAt: F.serverTimestamp() }); }
  catch (e) { if (e?.code === 'permission-denied') throw Object.assign(new Error('used'), { code: 'used' }); throw e; }
}
