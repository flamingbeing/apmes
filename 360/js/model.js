// APMES CCC 360: what a resident gives the programme coordinators (PCs) before a CCC meeting, and the checks on it.
// Pure logic, no page code (unit tests in test/model.test.mjs). Two halves: the scholar projects (and the other lists on
// the department's form) and the people to ask for multisource feedback (MSF). Storage shapes match the rules in
// logbook/firestore.rules ("CCC 360"): entries/{email} holds the projects, msf/{email} holds the nominees,
// invites/{id} and responses/{id} hold the raters' one-time links and answers (questions in msf-form.js).

import { ITEMS, SCALE_ITEMS, CONCERN, SUMMARY_COMMENTS, VALUES, COMMENT_SLOTS, COMMENT_MAX, REASON_MAX, FORM_ID, SCALE, NOT_OBSERVED } from './msf-form.js';

export const GROUPS = [
  { id: 'senior', label: 'Senior doctors', one: 'Senior doctor', max: 6, emailRequired: false,
    hint: 'Doctors you worked with in the past 5 months who are Associate Consultant or above.' },
  { id: 'peer', label: 'Peers', one: 'Peer', max: 2, emailRequired: false,
    hint: 'Registrars, residents or MOPEX you worked with in the past 5 months. Start typing to pick a resident.' },
  { id: 'allied', label: 'Allied health', one: 'Allied health', max: 4, emailRequired: true,
    hint: 'Nurses, therapists, pharmacists and others you worked with in the past 5 months. Their email is needed.' },
  { id: 'other', label: 'Others', one: 'Other', max: 2, emailRequired: false,
    hint: 'Anyone else who should give feedback.' },
];
export const GROUP = Object.fromEntries(GROUPS.map(g => [g.id, g]));
export const TOTAL_MAX = 20;           // the rules cap the list
export const LIST_MAX = 30;            // and each of the lists
export const STATUSES = ['Planned', 'Ongoing', 'Completed', 'On hold'];
export const LISTS = [
  { key: 'admin', label: 'Committee / admin work', hint: 'One per line: for example a committee you sit on, with your role.' },
  { key: 'teaching', label: 'Teaching / presentations', hint: 'One per line.' },
  { key: 'conferences', label: 'Conference presentations', hint: 'One per line: the meeting, the title and the date.' },
];
export const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lc = v => String(v ?? '').trim().toLowerCase();
const month = v => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v ?? '')) ? String(v) : '');
let counter = 0;
export const newId = () => 'x' + Date.now().toString(36).slice(-4) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5);

// ---- projects and lists ----

export function cleanProject(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {
    id: str(p.id, 20) || newId(), title: str(p.title, 200), supervisor: str(p.supervisor, 120),
    status: STATUSES.includes(p.status) ? p.status : 'Ongoing', start: month(p.start), end: month(p.end),
    note: String(p.note ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, 1000),
  };
  return out.title || out.supervisor || out.note ? out : null;
}
export function cleanLines(v) {
  const list = Array.isArray(v) ? v : String(v ?? '').split(/\r?\n/);
  return list.map(x => str(x, 300)).filter(Boolean).slice(0, LIST_MAX);
}
export function cleanEntry(e) {
  e = e && typeof e === 'object' ? e : {};
  const projects = (Array.isArray(e.projects) ? e.projects : []).map(cleanProject).filter(Boolean).slice(0, LIST_MAX);
  return { noProjects: !!e.noProjects && projects.length === 0, projects, admin: cleanLines(e.admin), teaching: cleanLines(e.teaching), conferences: cleanLines(e.conferences) };
}
export const blankEntry = () => cleanEntry({});

// A new round starts from last round's scholar projects (the resident only updates them). The other lists, and the
// nominees, start empty each round.
export function carryOver(prev) {
  const p = cleanEntry(prev);
  return { ...blankEntry(), noProjects: p.noProjects, projects: p.projects.map(x => ({ ...x, id: newId() })) };
}

// ---- nominees ----

export function cleanNominee(n) {
  if (!n || typeof n !== 'object') return null;
  const email = lc(n.email).slice(0, 200);
  const out = { id: str(n.id, 20) || newId(), group: GROUP[n.group] ? n.group : 'other', name: str(n.name, 120), email };
  if (n.fac) out.fac = lc(n.fac).slice(0, 200);
  return out.name || out.email ? out : null;
}
// keeps each group within its limit and the whole list within the cap
export function cleanNominees(list) {
  const seen = {}; const out = [];
  for (const n of (Array.isArray(list) ? list : []).map(cleanNominee)) {
    if (!n) continue;
    seen[n.group] = (seen[n.group] || 0) + 1;
    if (seen[n.group] > GROUP[n.group].max || out.length >= TOTAL_MAX) continue;
    out.push(n);
  }
  return out;
}
export const nomineeCounts = list => Object.fromEntries(GROUPS.map(g => [g.id, (list || []).filter(n => n.group === g.id).length]));
export const canAdd = (list, group) => nomineeCounts(list)[group] < GROUP[group].max && (list || []).length < TOTAL_MAX;

// ---- checks ----

// Things that stop Send (the PCs could not use the entry)
export function problems(entry, nominees) {
  const out = [];
  const e = entry || blankEntry();
  (e.projects || []).forEach((p, i) => { if (!p.title) out.push({ where: 'projects', id: p.id, text: `Project ${i + 1} has no title.` }); });
  for (const n of nominees || []) {
    const g = GROUP[n.group] || GROUP.other;
    const who = n.name || n.email || 'A nominee';
    if (!n.name) out.push({ where: 'nominees', id: n.id, text: `${g.one} nominee ${n.email}: add a name.` });
    else if (n.email && !EMAIL_RE.test(n.email)) out.push({ where: 'nominees', id: n.id, text: `${who}: that email doesn’t look right.` });
    else if (g.emailRequired && !n.email) out.push({ where: 'nominees', id: n.id, text: `${who}: ${g.one.toLowerCase()} nominees need an email.` });
  }
  return out;
}
// Worth a second look, but Send still works
export function warnings(entry, nominees) {
  const out = [];
  const e = entry || blankEntry();
  if (!e.projects.length && !e.noProjects) out.push({ where: 'projects', text: 'No scholarly projects yet. Add one, or tick “I have no scholarly projects”.' });
  for (const p of e.projects) if (p.start && p.end && p.end < p.start) out.push({ where: 'projects', id: p.id, text: `${p.title || 'A project'}: the end is before the start.` });
  const c = nomineeCounts(nominees);
  if (!(nominees || []).length) out.push({ where: 'nominees', text: 'No nominees yet. The coordinators will have nobody to ask for feedback.' });
  else if (!c.senior) out.push({ where: 'nominees', text: 'No senior doctor yet.' });
  const seen = new Map();
  for (const n of nominees || []) if (n.email) { if (seen.has(n.email)) out.push({ where: 'nominees', id: n.id, text: `${n.name || n.email} is listed twice.` }); seen.set(n.email, 1); }
  return out;
}
export function progress(entry, nominees) {
  const e = entry || blankEntry();
  const projects = e.projects.length ? 'filled' : e.noProjects ? 'none' : (e.admin.length || e.teaching.length || e.conferences.length) ? 'partial' : 'empty';
  return { projects, nominees: (nominees || []).length ? 'filled' : 'empty' };
}
// compare to what was sent, to show “changes not sent”
export const snapshot = (entry, nominees) => JSON.stringify([cleanEntry(entry), cleanNominees(nominees)]);

// ---- documents (the shapes the rules check; the store adds the server time) ----

export const entryDoc = (email, name, entry) => ({ email: lc(email), name: str(name, 120) || lc(email), ...cleanEntry(entry) });
export const msfDoc = (email, name, nominees) => ({ email: lc(email), name: str(name, 120) || lc(email), nominees: cleanNominees(nominees) });

// ---- the faculty picker ----

const TITLES = /\b(dr|drs|prof|a\/prof|assoc|asst|ms|mr|mrs|mdm|miss)\b\.?/gi;
const words = s => String(s || '').replace(TITLES, ' ').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
export const contactEmail = f => lc(f.workEmail) || lc(f.email);
// active faculty whose name starts with every word typed (any order); core faculty first, then A to Z
export function suggestFaculty(faculty, query, limit = 6) {
  const q = words(query);
  if (!q.length) return [];
  return (faculty || []).filter(f => f && f.status !== 'INACTIVE' && f.name).filter(f => {
    const w = words(f.name);
    return q.every(t => w.some(x => x.startsWith(t)));
  }).sort((a, b) => (!!b.core - !!a.core) || String(a.name).localeCompare(String(b.name))).slice(0, limit);
}

// ---- dates ----

export const monthText = v => {
  if (!month(v)) return '';
  const [y, m] = v.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
export const dayText = iso => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? new Date(iso + 'T00:00:00Z') : null;
  return d && !isNaN(d) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
};
export const pastDeadline = (round, today = new Date().toISOString().slice(0, 10)) => !!round?.deadline && round.deadline < today;

// made-up round for ?demo
export function demoRound(today = new Date()) {
  const d = new Date(today.getTime() + 21 * 86400000);
  return { round: 'demo', title: 'CCC round (demo)', status: 'open', deadline: d.toISOString().slice(0, 10), updatedAt: today.getTime() };
}

// ---- the coordinators' side ----

export const PURGE_DAYS = 365;   // nominees' contact details are deleted this long after a round closes (owner, 17 Oct 2026: a year, since CCC meetings may be delayed)
export const PURGE_TEXT = 'a year';
export const MARKS = [['ok', 'Checked'], ['swap', 'Ask for a different person'], ['sent', 'Emailed']];
export const markLabel = m => (MARKS.find(([k]) => k === m) || [, 'To check'])[1];

// A round's id from the month it opens (r2026-10), made unique among `taken`; at most 20 characters (the rules).
export function roundId(taken = [], now = new Date()) {
  const base = 'r' + now.toISOString().slice(0, 7);
  const t = new Set(taken);
  if (!t.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!t.has(base + '-' + i)) return base + '-' + i;
  return base + '-' + Math.random().toString(36).slice(2, 6);
}
export function cleanRoundInput({ title, deadline } = {}) {
  const t = str(title, 200);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(deadline || '')) ? String(deadline) : '';
  return t ? { title: t, deadline: d } : null;
}
// when a closed round's nominees are due to be deleted (ms), or 0 if the round is open or has no close time
export function purgeAt(round) {
  if (!round || round.status !== 'closed') return 0;
  const at = Number(round.closedAt) || Number(round.updatedAt) || 0;
  return at ? at + PURGE_DAYS * 86400000 : 0;
}
export const purgeDue = (round, now = Date.now()) => { const at = purgeAt(round); return !!at && at <= now; };

// One row per active resident (and anyone who sent but is not on the list): who has sent, and how the nominees stand.
// residents: [{ rid, name, email, status, rYear? }]; entries/msfs/reviews: { [email]: doc }.
export function roster(residents, entries = {}, msfs = {}, reviews = {}) {
  const rows = []; const seen = new Set();
  const row = (email, name, extra = {}) => {
    const e = entries[email] ? cleanEntry(entries[email]) : null;
    const ns = cleanNominees(msfs[email]?.nominees);
    const marks = reviews[email]?.marks || {};
    const count = { ok: 0, swap: 0, sent: 0, todo: 0 };
    for (const n of ns) count[marks[n.id] in count ? marks[n.id] : 'todo']++;
    rows.push({ email, name, sent: !!(entries[email] || msfs[email]), projects: e ? e.projects.length : 0, noProjects: !!e?.noProjects, nominees: ns.length, marks: count, ...extra });
    seen.add(email);
  };
  for (const r of residents || []) {
    const email = lc(r.email);
    if (!email || seen.has(email) || r.status !== 'ACTIVE') continue;
    row(email, r.name || email, { rid: r.rid, rYear: r.rYear });
  }
  for (const email of new Set([...Object.keys(entries), ...Object.keys(msfs)])) if (!seen.has(email)) row(email, entries[email]?.name || msfs[email]?.name || email, { extra: true });
  return rows.sort((a, b) => (a.sent - b.sent) || String(a.name).localeCompare(String(b.name)));
}
export const rosterCounts = rows => ({ total: rows.length, sent: rows.filter(r => r.sent).length, nominees: rows.reduce((n, r) => n + r.nominees, 0), toCheck: rows.reduce((n, r) => n + r.marks.todo, 0) });

// ---- CSV and email links ----

// A spreadsheet runs a cell that starts with = + - @ as a formula, so those get a leading apostrophe.
export function csvCell(v) {
  let s = String(v ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const csv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
// items: [{ resident: { name, email }, nominees: [...], marks: {} }]
export function nomineesCSV(round, items) {
  const rows = [['Round', 'Resident', 'Resident email', 'Group', 'Nominee', 'Nominee email', 'Status']];
  for (const it of items) for (const n of it.nominees) rows.push([round.title, it.resident.name, it.resident.email, GROUP[n.group]?.one || n.group, n.name, n.email, markLabel(it.marks?.[n.id])]);
  return csv(rows);
}
export function projectsCSV(round, items) {
  const rows = [['Round', 'Resident', 'Resident email', 'Kind', 'Title or line', 'Supervisor', 'Status', 'Start', 'End', 'Notes']];
  for (const it of items) {
    const e = cleanEntry(it.entry);
    if (e.noProjects) rows.push([round.title, it.resident.name, it.resident.email, 'Scholarly project', 'None to report', '', '', '', '', '']);
    for (const p of e.projects) rows.push([round.title, it.resident.name, it.resident.email, 'Scholarly project', p.title, p.supervisor, p.status, p.start, p.end, p.note]);
    for (const l of LISTS) for (const line of e[l.key]) rows.push([round.title, it.resident.name, it.resident.email, l.label, line, '', '', '', '', '']);
  }
  return csv(rows);
}
// a mailto: link to one nominee (the coordinator edits the text in their mail app)
export function mailto(nominee, residentName, round) {
  const subject = `Multisource feedback for ${residentName}`;
  const body = `Dear ${nominee.name},\n\n${residentName} has nominated you to give multisource feedback ahead of the Clinical Competency Committee meeting (${round?.title || 'CCC'}). The programme coordinators will send you the feedback form shortly. Thank you for your time.\n\nProgramme coordinators`;
  return `mailto:${encodeURIComponent(nominee.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export const emailList = list => [...new Set((list || []).map(x => lc(x)).filter(x => EMAIL_RE.test(x)))].join(', ');

// ---- raters: one-time links, answers and the CCC summary ----

// A rater's link is /360/rate/#<id>: 128 random bits as 32 hex characters, in the hash so it never reaches server logs.
// Anyone holding it may read that one invite and answer once (the rules); nobody can list the invites but staff.
export const INVITE_ID_RE = /^[0-9a-f]{32}$/;
export function newInviteId(fill = a => globalThis.crypto.getRandomValues(a)) {
  return [...fill(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const isInviteId = id => INVITE_ID_RE.test(String(id ?? ''));
// The rater cannot list invites, so the link carries the round as well: /360/rate/#<round>/<id> (round ids are not secret).
export const ROUND_RE = /^[A-Za-z0-9_-]{1,20}$/;
export const rateLink = (round, id, origin = 'https://apmes.anawj.com') => `${origin}/360/rate/#${round}/${id}`;
// the round and invite id from a rater page's hash, or null when it is not a link the app made
export function parseRateHash(hash) {
  const m = /^#?\/?([^/]+)\/([^/?#]+)\/?$/.exec(String(hash ?? '').trim());
  if (!m) return null;
  const round = decodeURIComponent(m[1]), id = m[2].toLowerCase();
  return ROUND_RE.test(round) && isInviteId(id) ? { round, id } : null;
}
// the invite for one Checked nominee (the store adds createdAt = server time and createdBy = the signed-in coordinator)
export function inviteDoc(resident, nominee) {
  const n = cleanNominee(nominee);
  return { resident: lc(resident.email).slice(0, 200), nomineeId: n.id, group: n.group, residentName: str(resident.name, 120) || lc(resident.email), raterName: n.name || n.email.slice(0, 120) };
}
// a nominee can be invited once a coordinator has checked them (Emailed comes after Checked)
export const invitable = mark => mark === 'ok' || mark === 'sent';

// Answers as the rules take them: { answers: { itemId: 1-4 | 'na' | 'yes' | 'no' }, comments: { slot: text } }. Unknown
// items, values and empty comments are dropped.
export function cleanAnswers(raw, items = ITEMS) {
  const a = raw?.answers || {}, c = raw?.comments || {};
  const answers = {}, comments = {};
  const text = v => String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, COMMENT_MAX);
  for (const it of items) {
    const v = a[it.id];
    if (it.kind === 'scale' && (VALUES.slice(0, 4).includes(v) || (it.notObserved && v === 'na'))) answers[it.id] = v;
    if (it.kind === 'yesno' && (v === 'yes' || v === 'no')) answers[it.id] = v;
    const slot = it.kind === 'comment' ? it.id : it.comment;
    if (slot && COMMENT_SLOTS.includes(slot) && text(c[slot])) comments[slot] = text(c[slot]);
  }
  return { answers, comments };
}
// what blocks Submit: every rating and yes/no needs an answer ("Not observed" counts)
export function answerProblems(raw, items = ITEMS) {
  const { answers } = cleanAnswers(raw, items);
  return items.filter(it => (it.kind === 'scale' || it.kind === 'yesno') && !(it.id in answers)).map(it => it.title);
}
export const responseDoc = raw => ({ ...cleanAnswers(raw), declined: false });
export const declineDoc = reason => {
  const r = String(reason ?? '').trim().slice(0, REASON_MAX);
  return { answers: {}, comments: {}, declined: true, ...(r ? { reason: r } : {}) };
};
// per rater: 'invited' (link made, no answer yet), 'done' or 'declined'
export const raterStatus = (invite, response) => !invite ? 'not invited' : !response ? 'invited' : response.declined ? 'declined' : 'done';

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const mean = xs => xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length * 100) / 100 : null;

// The anonymised summary for the CCC from the invites and responses passed in (normally one resident's; both are
// { [inviteId]: doc }). A rater group is shown on its own only with `minGroup` or more completed answers; smaller groups
// fold into Others. If Others is then still too small (but not empty), it joins the smallest group shown, so no group's
// mean can be worked out by subtraction from the overall one. With fewer than `minGroup` answers in all, only the counts
// are given. Comments come without names, in random order. The concern question is kept apart (`concerns`): for PDs and
// PCs only, never the resident.
export function summarise(responses = {}, invites = {}, { minGroup = 3, rand = Math.random } = {}) {
  const counts = { invited: 0, done: 0, declined: 0, waiting: 0, byGroup: Object.fromEntries(GROUPS.map(g => [g.id, { invited: 0, done: 0, declined: 0 }])) };
  const done = [];
  for (const [id, inv] of Object.entries(invites || {})) {
    const g = GROUP[inv?.group] ? inv.group : 'other';
    const r = responses?.[id];
    const s = raterStatus(inv, r);
    counts.invited++; counts.byGroup[g].invited++;
    if (s === 'done') { counts.done++; counts.byGroup[g].done++; done.push({ group: g, ...cleanAnswers(r) }); }
    else if (s === 'declined') { counts.declined++; counts.byGroup[g].declined++; }
    else counts.waiting++;
  }
  // which groups stand alone, and what folds into Others
  const by = id => done.filter(d => d.group === id);
  let shown = GROUPS.filter(g => g.id !== 'other' && by(g.id).length >= minGroup).map(g => ({ id: g.id, label: g.label, groups: [g.id] }));
  const rest = GROUPS.map(g => g.id).filter(id => !shown.some(s => s.groups.includes(id)));
  const restN = done.filter(d => rest.includes(d.group)).length;
  if (restN >= minGroup) shown.push({ id: 'others', label: 'Others', groups: rest });
  else if (restN > 0 && shown.length) {
    const small = shown.reduce((a, b) => (done.filter(d => b.groups.includes(d.group)).length < done.filter(d => a.groups.includes(d.group)).length ? b : a));
    small.groups = [...small.groups, ...rest]; small.label += ' and others';
  }
  const enough = done.length >= minGroup;
  if (!enough) shown = [];
  const itemRow = (it, list) => {
    const xs = list.map(d => d.answers[it.id]).filter(v => typeof v === 'number');
    return { mean: mean(xs), n: xs.length, notObserved: list.filter(d => d.answers[it.id] === 'na').length };
  };
  const items = !enough ? [] : SCALE_ITEMS.map(it => ({
    id: it.id, title: it.title,
    overall: itemRow(it, done),
    groups: Object.fromEntries(shown.map(s => [s.id, itemRow(it, done.filter(d => s.groups.includes(d.group)))])),
  }));
  const groups = shown.map(s => ({ id: s.id, label: s.label, n: done.filter(d => s.groups.includes(d.group)).length }));
  const comments = !enough ? [] : SUMMARY_COMMENTS.map(c => ({ ...c, texts: shuffle(done.map(d => d.comments[c.slot]).filter(Boolean), rand) }));
  const concernList = CONCERN ? done.filter(d => d.answers[CONCERN.id] === 'yes') : [];
  const concerns = { yes: concernList.length, texts: shuffle(concernList.map(d => d.comments[CONCERN.comment]).filter(Boolean), rand) };
  // every rating on every item together (the round overview's one number)
  const all = !enough ? [] : done.flatMap(d => SCALE_ITEMS.map(it => d.answers[it.id]).filter(v => typeof v === 'number'));
  const overall = { mean: mean(all), n: all.length };
  return { counts, enough, minGroup, groups, items, comments, concerns, overall };
}

// ---- the CCC report and what is kept after the clean-up ----

// one resident's invites (and their answers) out of a round's: { [inviteId]: doc }
export const invitesOf = (invites, email) => Object.fromEntries(Object.entries(invites || {}).filter(([, v]) => lc(v?.resident) === lc(email)));
// the residents who have raters in this round: [{ email, name }] by name
export function invitedResidents(invites) {
  const by = {};
  for (const inv of Object.values(invites || {})) { const e = lc(inv?.resident); if (e && !by[e]) by[e] = { email: e, name: str(inv.residentName, 120) || e }; }
  return Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
}
// The summary kept at ccc/{round}/report/{email} once the raw answers are deleted (the shape the rules check). Counts
// per group are left out: with a group of one or two they would say who answered what.
export function reportDoc(email, name, sum) {
  const counts = { invited: sum.counts.invited, done: sum.counts.done, declined: sum.counts.declined, waiting: sum.counts.waiting };
  return {
    email: lc(email).slice(0, 200), name: str(name, 120) || lc(email), formId: FORM_ID, counts, enough: !!sum.enough, minGroup: sum.minGroup,
    overall: { mean: sum.overall?.mean ?? null, n: sum.overall?.n || 0 },
    groups: sum.groups.map(g => ({ id: g.id, label: g.label, n: g.n })),
    items: sum.items.map(it => ({ id: it.id, title: it.title, overall: it.overall, groups: it.groups })),
    comments: sum.comments.map(c => ({ slot: c.slot, title: c.title, texts: c.texts })),
    concerns: { yes: sum.concerns.yes, texts: sum.concerns.texts },
  };
}
// a saved summary back in summarise()'s shape, so one screen draws both
export function fromReport(d) {
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const cell = c => ({ mean: typeof c?.mean === 'number' ? c.mean : null, n: num(c?.n), notObserved: num(c?.notObserved) });
  const c = d?.counts || {};
  return {
    counts: { invited: num(c.invited), done: num(c.done), declined: num(c.declined), waiting: num(c.waiting) },
    enough: !!d?.enough, minGroup: num(d?.minGroup) || 3, formId: String(d?.formId || ''), savedAt: num(d?.savedAt),
    overall: { mean: typeof d?.overall?.mean === 'number' ? d.overall.mean : null, n: num(d?.overall?.n) },
    groups: (Array.isArray(d?.groups) ? d.groups : []).map(g => ({ id: String(g.id), label: String(g.label), n: num(g.n) })),
    items: (Array.isArray(d?.items) ? d.items : []).map(it => ({ id: String(it.id), title: String(it.title), overall: cell(it.overall), groups: Object.fromEntries(Object.entries(it.groups || {}).map(([k, v]) => [k, cell(v)])) })),
    comments: (Array.isArray(d?.comments) ? d.comments : []).map(x => ({ slot: String(x.slot), title: String(x.title), texts: (Array.isArray(x.texts) ? x.texts : []).map(String) })),
    concerns: { yes: num(d?.concerns?.yes), texts: (Array.isArray(d?.concerns?.texts) ? d.concerns.texts : []).map(String) },
  };
}
// What the clean-up does to a round's rater data, per resident: save the summary, then delete the answers and links.
// [{ email, report, inviteIds, responseIds }]. A response without an invite (should not happen) is deleted too.
export function purgePlan(invites = {}, responses = {}, opts = {}) {
  const plan = invitedResidents(invites).map(r => {
    const iv = invitesOf(invites, r.email);
    const rs = Object.fromEntries(Object.keys(iv).filter(id => responses?.[id]).map(id => [id, responses[id]]));
    return { email: r.email, report: reportDoc(r.email, r.name, summarise(rs, iv, opts)), inviteIds: Object.keys(iv), responseIds: Object.keys(rs) };
  });
  const orphans = Object.keys(responses || {}).filter(id => !invites?.[id]);
  if (orphans.length) plan.push({ email: '', report: null, inviteIds: [], responseIds: orphans });
  return plan;
}
// the round overview: one row per resident with raters (live) or a saved summary
export function overviewRows(summaries) {
  return Object.entries(summaries || {}).map(([email, s]) => ({ email, name: s.name || email, saved: !!s.saved, ...s.summary.counts, mean: s.summary.overall?.mean ?? null, enough: s.summary.enough, concerns: s.summary.concerns.yes }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
// a 1-4 mean as text: "3.25", or a dash when there is none
export const meanText = m => (typeof m === 'number' ? m.toFixed(2) : '–');
export const SCALE_TEXT = SCALE.map(s => `${s.value} ${s.label}`).join(' · ');
// one rater's answers as label lines, for the raw answers view (PDs and PCs)
export function answerLines(response, items = ITEMS) {
  const r = cleanAnswers(response, items), out = [];
  for (const it of items) {
    const v = r.answers[it.id];
    if (it.kind === 'scale') out.push({ title: it.title, value: v === 'na' ? NOT_OBSERVED.label : v ? `${v} ${SCALE.find(s => s.value === v)?.label || ''}`.trim() : '–' });
    if (it.kind === 'yesno') out.push({ title: it.title, value: v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '–' });
    const slot = it.kind === 'comment' ? it.id : it.comment;
    if (slot && r.comments[slot]) out.push({ title: it.kind === 'comment' ? it.title : 'Comment', value: r.comments[slot], text: true });
  }
  return out;
}

// ---- the coordinators' invite flow (the app makes the link; the coordinator sends it from their own mail) ----

// One row per nominee of one resident: the nominee, the coordinators' mark, the invite (if made), the rater's status.
// invites/responses: { [inviteId]: doc } for the round; responses is null when this reader may not see answers (Admin
// staff: only PDs and PCs read them), and the status is then 'invited' or 'not invited'.
export function raterRows(resident, nominees, marks = {}, invites = {}, responses = {}) {
  const email = lc(resident);
  const byNominee = {};
  for (const [id, inv] of Object.entries(invites || {})) {
    if (lc(inv?.resident) !== email) continue;
    const prev = byNominee[inv.nomineeId];
    // two invites for one nominee (two coordinators at once): the answered one, else the newest
    const score = x => (responses?.[x.id] ? 2 : 0) + (x.createdAt || 0) / 1e15;
    const cur = { id, ...inv, createdAt: Number(inv.createdAt) || 0 };
    if (!prev || score(cur) > score(prev)) byNominee[inv.nomineeId] = cur;
  }
  return cleanNominees(nominees).map(n => {
    const invite = byNominee[n.id] || null;
    const response = invite && responses ? responses[invite.id] || null : null;
    const status = raterStatus(invite, response);
    return { nominee: n, mark: marks[n.id] || '', invite, response, status, known: !!responses || !invite };
  });
}
export const RATER_LABEL = { 'not invited': 'Not invited', invited: 'Invited', done: 'Done', declined: 'Declined' };
// counts for one resident's raters, for the round list
export function raterCounts(rows) {
  const c = { invited: 0, done: 0, declined: 0, waiting: 0 };
  for (const r of rows) {
    if (!r.invite) continue;
    c.invited++;
    if (r.status === 'done') c.done++; else if (r.status === 'declined') c.declined++; else c.waiting++;
  }
  return c;
}
// the emails of invited raters who have not answered yet (to chase them)
export const notDoneEmails = rows => emailList(rows.filter(r => r.invite && r.status === 'invited').map(r => r.nominee.email));

function rateMail(nominee, residentName, round, link, reminder) {
  const g = { senior: 'a senior doctor', peer: 'a peer', allied: 'an allied health colleague' }[nominee.group] || 'a colleague';
  const subject = `${reminder ? 'Reminder: ' : ''}Multisource feedback for ${residentName}`;
  const body = [
    `Dear ${nominee.name || 'colleague'},`, '',
    reminder
      ? `A gentle reminder: ${residentName} would value your multisource feedback (as ${g}) before the Clinical Competency Committee meeting (${round?.title || 'CCC'}). If you have already answered, thank you, and please ignore this.`
      : `${residentName} has nominated you to give multisource feedback, as ${g}, before the Clinical Competency Committee meeting (${round?.title || 'CCC'}). It takes about 5 minutes on a phone, with no sign-in.`,
    '', `Your link (please keep it to yourself; it works once): ${link}`, '',
    'Your answers are seen by the programme staff; the resident sees only a summary, without names. If you can’t give feedback, the same link has a Decline button.',
    '', 'Thank you,', 'Programme coordinators',
  ].join('\n');
  return `mailto:${encodeURIComponent(nominee.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export const inviteMailto = (nominee, residentName, round, link) => rateMail(nominee, residentName, round, link, false);
export const reminderMailto = (nominee, residentName, round, link) => rateMail(nominee, residentName, round, link, true);
