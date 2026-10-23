// Unit tests for the CCC 360 logic. Run: node 360/test/model.test.mjs
import assert from 'node:assert/strict';
import {
  GROUPS, TOTAL_MAX, cleanProject, cleanLines, cleanEntry, blankEntry, carryOver, cleanNominee, cleanNominees, nomineeCounts, canAdd,
  problems, warnings, progress, snapshot, entryDoc, msfDoc, suggestFaculty, contactEmail, monthText, dayText, pastDeadline, demoRound,
  PURGE_DAYS, markLabel, roundId, cleanRoundInput, purgeAt, purgeDue, roster, rosterCounts, csvCell, nomineesCSV, projectsCSV, mailto, emailList,
} from '../js/model.js';

// projects
assert.equal(cleanProject({}), null);
assert.equal(cleanProject({ title: '  ' }), null);
let p = cleanProject({ title: '  Audit   of PONV ', supervisor: 'Dr X', status: 'bogus', start: '2026-03', end: '2026-13', note: 'a\tb' });
assert.deepEqual([p.title, p.status, p.start, p.end, p.note], ['Audit of PONV', 'Ongoing', '2026-03', '', 'a b']);
assert.ok(p.id, 'gets an id');
assert.equal(cleanProject({ title: 'x', status: 'Completed' }).status, 'Completed');
assert.equal(cleanProject({ title: 'x'.repeat(500) }).title.length, 200);

// lists
assert.deepEqual(cleanLines(' a \n\n b '), ['a', 'b']);
assert.deepEqual(cleanLines(['x', '', ' y ']), ['x', 'y']);
assert.equal(cleanLines(Array.from({ length: 50 }, (_, i) => 'l' + i)).length, 30);
assert.deepEqual(cleanLines(null), []);

// entry
let e = cleanEntry({ noProjects: true, projects: [{ title: 'A' }], admin: 'one\ntwo' });
assert.equal(e.noProjects, false, 'projects and “none” cannot both be true');
assert.deepEqual(e.admin, ['one', 'two']);
assert.equal(cleanEntry({ noProjects: true }).noProjects, true);
assert.deepEqual(cleanEntry(null), blankEntry());

// carry over: projects only, with fresh ids
const prev = cleanEntry({ projects: [{ id: 'keep', title: 'A', status: 'Completed' }], admin: ['x'], teaching: ['y'] });
const co = carryOver(prev);
assert.equal(co.projects.length, 1);
assert.notEqual(co.projects[0].id, 'keep');
assert.deepEqual([co.projects[0].title, co.projects[0].status], ['A', 'Completed']);
assert.deepEqual([co.admin, co.teaching, co.conferences], [[], [], []]);
assert.deepEqual(carryOver(null), blankEntry());

// nominees
assert.equal(cleanNominee({}), null);
let n = cleanNominee({ group: 'weird', name: ' Sam  Example ', email: ' SAM@Example.COM ', fac: 'Fac@X.com' });
assert.deepEqual([n.group, n.name, n.email, n.fac], ['other', 'Sam Example', 'sam@example.com', 'fac@x.com']);
const many = Array.from({ length: 9 }, (_, i) => ({ group: 'senior', name: 'S' + i }));
assert.equal(cleanNominees(many).length, 6, 'six seniors at most');
const all = GROUPS.flatMap(g => Array.from({ length: g.max + 3 }, (_, i) => ({ group: g.id, name: g.id + i })));
const capped = cleanNominees(all);
assert.deepEqual(nomineeCounts(capped), { senior: 6, peer: 2, allied: 4, other: 2 });
assert.ok(capped.length <= TOTAL_MAX);
assert.ok(!canAdd(capped, 'peer') && !canAdd(capped, 'senior'));
assert.ok(canAdd([], 'allied'));

// checks
assert.deepEqual(problems(blankEntry(), []), []);
assert.equal(problems({ ...blankEntry(), projects: [{ id: 'p', title: '' }] }, []).length, 1);
let ns = [
  { id: '1', group: 'allied', name: 'Nurse N', email: '' },
  { id: '2', group: 'senior', name: 'Dr A', email: 'bad' },
  { id: '3', group: 'peer', name: '', email: 'x@y.co' },
  { id: '4', group: 'senior', name: 'Dr B', email: '' },
];
const pr = problems(blankEntry(), ns);
assert.equal(pr.length, 3);
assert.ok(pr.some(x => x.id === '1' && /need an email/.test(x.text)));
assert.ok(pr.some(x => x.id === '2' && /doesn’t look right/.test(x.text)));
assert.ok(pr.some(x => x.id === '3' && /add a name/.test(x.text)));
let w = warnings(blankEntry(), []);
assert.equal(w.length, 2, 'no projects and no nominees');
assert.equal(warnings({ ...blankEntry(), noProjects: true }, [{ group: 'senior', name: 'A', email: 'a@b.co', id: 'q' }]).length, 0);
assert.ok(warnings({ ...blankEntry(), noProjects: true }, [{ group: 'peer', name: 'A', email: 'a@b.co', id: 'q' }]).some(x => /senior/.test(x.text)));
assert.ok(warnings({ ...blankEntry(), noProjects: true }, [{ group: 'senior', name: 'A', email: 'a@b.co', id: 'q' }, { group: 'senior', name: 'B', email: 'a@b.co', id: 'r' }]).some(x => /twice/.test(x.text)));
assert.ok(warnings(cleanEntry({ projects: [{ title: 'T', start: '2026-05', end: '2026-01' }] }), [{ group: 'senior', name: 'A', id: 'q' }]).some(x => /before the start/.test(x.text)));
assert.deepEqual(progress(blankEntry(), []), { projects: 'empty', nominees: 'empty' });
assert.equal(progress(cleanEntry({ noProjects: true }), []).projects, 'none');
assert.equal(progress(cleanEntry({ admin: ['x'] }), [{}]).projects, 'partial');
assert.equal(progress(cleanEntry({ projects: [{ title: 'A' }] }), [{}]).projects, 'filled');

// snapshots change when content changes
const s1 = snapshot(cleanEntry({ projects: [{ id: 'a', title: 'A' }] }), []);
assert.equal(s1, snapshot(cleanEntry({ projects: [{ id: 'a', title: ' A ' }] }), []));
assert.notEqual(s1, snapshot(cleanEntry({ projects: [{ id: 'a', title: 'B' }] }), []));

// documents match the rules' shapes
const d = entryDoc('Me@X.com', '', cleanEntry({ projects: [{ title: 'A' }] }));
assert.deepEqual(Object.keys(d).sort(), ['admin', 'conferences', 'email', 'name', 'noProjects', 'projects', 'teaching']);
assert.equal(d.email, 'me@x.com'); assert.equal(d.name, 'me@x.com');
const md = msfDoc('me@x.com', 'Me', many.map(x => ({ ...x, id: undefined })));
assert.deepEqual(Object.keys(md).sort(), ['email', 'name', 'nominees']);
assert.equal(md.nominees.length, 6);

// the faculty picker
const fac = [
  { email: 'a@x.com', name: 'Dr Ann Lee', status: 'ACTIVE' },
  { email: 'b@x.com', name: 'Dr Ben Lim', status: 'ACTIVE', core: true, workEmail: 'ben_lim@nuhs.example' },
  { email: 'c@x.com', name: 'Dr Cara Leong', status: 'INACTIVE' },
  { email: 'd@x.com', name: 'Dr Dev Lee', status: 'ACTIVE', core: true },
];
assert.deepEqual(suggestFaculty(fac, ''), []);
assert.deepEqual(suggestFaculty(fac, 'le').map(f => f.email), ['d@x.com', 'a@x.com'], 'core first, inactive left out');
assert.deepEqual(suggestFaculty(fac, 'lee ann').map(f => f.email), ['a@x.com'], 'any order');
assert.deepEqual(suggestFaculty(fac, 'dr li').map(f => f.email), ['b@x.com'], 'titles ignored');
assert.equal(contactEmail(fac[1]), 'ben_lim@nuhs.example');
assert.equal(contactEmail(fac[0]), 'a@x.com');
assert.equal(suggestFaculty(fac, 'l', 1).length, 1);

// dates
assert.equal(monthText('2026-03'), 'Mar 2026');
assert.equal(monthText('x'), '');
assert.equal(dayText('2026-12-01'), '1 Dec 2026');
assert.equal(dayText(''), '');
assert.ok(pastDeadline({ deadline: '2026-01-01' }, '2026-02-01'));
assert.ok(!pastDeadline({ deadline: '2026-03-01' }, '2026-02-01'));
assert.ok(!pastDeadline({}, '2026-02-01'));
const dr = demoRound(new Date('2026-10-17T00:00:00Z'));
assert.deepEqual([dr.round, dr.status, dr.deadline], ['demo', 'open', '2026-11-07']);

// ---- the coordinators' side ----
assert.equal(PURGE_DAYS, 365);
assert.equal(markLabel('ok'), 'Checked'); assert.equal(markLabel(undefined), 'To check'); assert.equal(markLabel('x'), 'To check');
assert.equal(roundId([], new Date('2026-10-17T00:00:00Z')), 'r2026-10');
assert.equal(roundId(['r2026-10'], new Date('2026-10-17T00:00:00Z')), 'r2026-10-2');
assert.equal(roundId(['r2026-10', 'r2026-10-2'], new Date('2026-10-17T00:00:00Z')), 'r2026-10-3');
assert.ok(roundId([], new Date()).length <= 20);
assert.equal(cleanRoundInput({ title: '  ' }), null);
assert.deepEqual(cleanRoundInput({ title: ' CCC  Dec ', deadline: '2026-12-01' }), { title: 'CCC Dec', deadline: '2026-12-01' });
assert.equal(cleanRoundInput({ title: 'x', deadline: 'soon' }).deadline, '');
// retention: nominees go a year after a round closes
const day = 86400000, t0 = Date.UTC(2026, 0, 1);
assert.equal(purgeAt({ status: 'open', closedAt: t0 }), 0);
assert.equal(purgeAt({ status: 'closed' }), 0, 'no close time: never purged by guesswork');
assert.equal(purgeAt({ status: 'closed', closedAt: t0 }), t0 + 365 * day);
assert.equal(purgeAt({ status: 'closed', closedAt: 0, updatedAt: t0 }), t0 + 365 * day, 'falls back to the last update');
assert.ok(!purgeDue({ status: 'closed', closedAt: t0 }, t0 + 364 * day));
assert.ok(purgeDue({ status: 'closed', closedAt: t0 }, t0 + 365 * day));
assert.ok(!purgeDue({ status: 'open', closedAt: t0 }, t0 + 999 * day));

// the roster: active residents, who has sent, nominee marks
const people = [
  { rid: 'R1', name: 'Zed Last', email: 'zed@x.com', status: 'ACTIVE' },
  { rid: 'R2', name: 'Amy First', email: 'AMY@x.com', status: 'ACTIVE' },
  { rid: 'R3', name: 'Gone', email: 'gone@x.com', status: 'GRADUATED' },
  { rid: 'R4', name: 'Bob Mid', email: 'bob@x.com', status: 'ACTIVE' },
];
const ents = { 'amy@x.com': { name: 'Amy First', projects: [{ title: 'P1' }, { title: 'P2' }] }, 'bob@x.com': { name: 'Bob Mid', noProjects: true }, 'new@x.com': { name: 'Not On List' } };
const ms = { 'amy@x.com': { nominees: [{ id: 'a', group: 'senior', name: 'S1', email: 's1@x.com' }, { id: 'b', group: 'peer', name: 'P1', email: 'p1@x.com' }, { id: 'c', group: 'allied', name: 'A1', email: 'a1@x.com' }] } };
const rv = { 'amy@x.com': { marks: { a: 'ok', b: 'swap' } } };
const rows = roster(people, ents, ms, rv);
assert.deepEqual(rows.map(r => r.email), ['zed@x.com', 'amy@x.com', 'bob@x.com', 'new@x.com'], 'not sent first, then by name');
assert.ok(!rows.some(r => r.email === 'gone@x.com'), 'graduated residents are left out');
const amy = rows.find(r => r.email === 'amy@x.com');
assert.deepEqual([amy.sent, amy.projects, amy.nominees], [true, 2, 3]);
assert.deepEqual(amy.marks, { ok: 1, swap: 1, sent: 0, todo: 1 });
assert.equal(rows.find(r => r.email === 'bob@x.com').noProjects, true);
assert.ok(rows.find(r => r.email === 'new@x.com').extra, 'someone not on the list is flagged');
assert.deepEqual(rosterCounts(rows), { total: 4, sent: 3, nominees: 3, toCheck: 1 });

// CSV is safe to open in a spreadsheet
assert.equal(csvCell('plain'), 'plain');
assert.equal(csvCell('a,b'), '"a,b"');
assert.equal(csvCell('say "hi"'), '"say ""hi"""');
assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
assert.equal(csvCell('=1,2'), '"\'=1,2"');
assert.equal(csvCell('+1'), "'+1"); assert.equal(csvCell('-2'), "'-2"); assert.equal(csvCell('@x'), "'@x");
assert.equal(csvCell('one\ntwo'), 'one two');
assert.equal(csvCell(null), '');
const round = { title: 'CCC Dec', status: 'open' };
const items = [{ resident: { name: '=Evil', email: 'amy@x.com' }, nominees: ms['amy@x.com'].nominees, marks: rv['amy@x.com'].marks }];
const nc = nomineesCSV(round, items).split('\r\n');
assert.equal(nc[0], 'Round,Resident,Resident email,Group,Nominee,Nominee email,Status');
assert.equal(nc.length, 5, 'header, three nominees, trailing newline');
assert.ok(nc[1].includes("'=Evil") && nc[1].endsWith('Checked'), 'the resident name cannot run as a formula');
assert.ok(nc[2].endsWith('Ask for a different person') && nc[3].endsWith('To check'));
const pc = projectsCSV(round, [{ resident: { name: 'Amy', email: 'amy@x.com' }, entry: { projects: [{ title: 'P1', supervisor: 'Dr S', status: 'Completed', start: '2026-01', end: '2026-06', note: 'n' }], admin: ['Quality committee'] } }, { resident: { name: 'Bob', email: 'bob@x.com' }, entry: { noProjects: true } }]).split('\r\n');
assert.equal(pc.length, 5);
assert.ok(pc[1].includes('Scholarly project,P1,Dr S,Completed,2026-01,2026-06,n'));
assert.ok(pc[2].includes('Committee / admin work,Quality committee'));
assert.ok(pc[3].includes('None to report'));
// mailto
const m = mailto({ name: 'Dr S', email: 'dr.s+x@y.com' }, 'Amy First', { title: 'CCC Dec' });
assert.ok(m.startsWith('mailto:dr.s%2Bx%40y.com?subject='));
assert.ok(decodeURIComponent(m).includes('Amy First has nominated you') && decodeURIComponent(m).includes('(CCC Dec)'));
assert.equal(emailList(['A@x.com', 'a@x.com', 'bad', ' b@y.co ']), 'a@x.com, b@y.co');
console.log('ccc 360 model: all checks passed');

// ---- raters (one-time links, answers, the CCC summary) ----
{
  const { newInviteId, isInviteId, rateLink, inviteDoc, invitable, cleanAnswers, answerProblems, responseDoc, declineDoc, raterStatus, summarise } = await import('../js/model.js');
  const form = await import('../js/msf-form.js');
  assert.equal(form.DRAFT, true, 'the made-up questions stay marked draft');
  assert.deepEqual(form.SCALE_ITEMS.map(i => i.id), ['q1', 'q2', 'q3', 'q4', 'q5']);
  assert.ok(form.ITEMS.every(i => i.kind !== 'comment' || form.COMMENT_SLOTS.includes(i.id)), 'comment ids are rule slots');
  assert.ok(form.COMMENT_SLOTS.includes(form.CONCERN.comment) && form.CONCERN.staffOnly);

  const id = newInviteId();
  assert.ok(isInviteId(id) && id.length === 32);
  assert.notEqual(newInviteId(), id);
  assert.equal(newInviteId(a => a.fill(255)), 'f'.repeat(32));
  assert.ok(!isInviteId('abc') && !isInviteId('A'.repeat(32)) && !isInviteId(null));
  assert.equal(rateLink("r2026-10", id), `https://apmes.anawj.com/360/rate/#r2026-10/${id}`);
  assert.deepEqual(inviteDoc({ email: ' Bob@Example.com ', name: ' Bob  Tan ' }, { id: 'n1', group: 'allied', name: 'Nurse Lee', email: 'lee@example.com' }),
    { resident: 'bob@example.com', nomineeId: 'n1', group: 'allied', residentName: 'Bob Tan', raterName: 'Nurse Lee' });
  assert.equal(inviteDoc({ email: 'b@example.com' }, { id: 'n2', group: 'x', email: 'only@example.com' }).raterName, 'only@example.com');
  assert.deepEqual(['ok', 'sent', 'swap', undefined].map(invitable), [true, true, false, false]);

  const full = { answers: { q1: 3, q2: 4, q3: 'na', q4: 2, q5: 1, q6: 'no', q9: 4 }, comments: { c1: '  Calm   in a crisis ', c2: '', c3: 'x', c9: 'name' } };
  const clean = cleanAnswers(full);
  assert.deepEqual(clean.answers, { q1: 3, q2: 4, q3: 'na', q4: 2, q5: 1, q6: 'no' }, 'unknown items dropped');
  assert.deepEqual(clean.comments, { c1: 'Calm in a crisis', c3: 'x' }, 'empty and unknown slots dropped');
  assert.deepEqual(cleanAnswers({ answers: { q1: 5, q2: '3', q6: 'maybe' } }).answers, {}, 'bad values dropped');
  assert.equal(cleanAnswers({ comments: { c1: 'y'.repeat(5000) } }).comments.c1.length, form.COMMENT_MAX);
  assert.deepEqual(answerProblems(full), []);
  assert.deepEqual(answerProblems({ answers: { q1: 3 } }).length, 5, 'q2-q5 and the concern question unanswered');
  assert.equal(responseDoc(full).declined, false);
  assert.deepEqual(declineDoc('  '), { answers: {}, comments: {}, declined: true });
  assert.equal(declineDoc('r'.repeat(2000)).reason.length, form.REASON_MAX);
  assert.deepEqual([raterStatus(null), raterStatus({}), raterStatus({}, { declined: false }), raterStatus({}, { declined: true })], ['not invited', 'invited', 'done', 'declined']);

  // summary fixtures: invites i<n> by group, answers all q1..q5 = score
  const inv = {}, rsp = {};
  const add = (group, score, extra = {}) => { const k = 'i' + Object.keys(inv).length; inv[k] = { group }; if (score !== undefined) rsp[k] = score === 'declined' ? declineDoc() : { answers: { q1: score, q2: score, q3: score, q4: score, q5: score, q6: 'no' }, comments: {}, ...extra }; return k; };
  const noShuffle = () => 0.999999;

  // 0 responses
  let s = summarise({}, {});
  assert.deepEqual([s.counts.invited, s.counts.done, s.enough, s.items.length, s.groups.length], [0, 0, false, 0, 0]);
  add('senior'); add('peer');
  s = summarise(rsp, inv);
  assert.deepEqual([s.counts.invited, s.counts.waiting, s.enough], [2, 2, false]);

  // all declined
  for (const k of Object.keys(inv)) delete inv[k];
  add('senior', 'declined'); add('senior', 'declined'); add('allied', 'declined');
  s = summarise(rsp, inv);
  assert.deepEqual([s.counts.declined, s.counts.done, s.enough, s.items.length], [3, 0, false, 0]);
  assert.equal(s.counts.byGroup.senior.declined, 2);

  // fewer than 3 answers in all: counts only, no means or comments
  for (const k of Object.keys(inv)) { delete inv[k]; delete rsp[k]; }
  add('senior', 4, { comments: { c1: 'Great' } }); add('senior', 2);
  s = summarise(rsp, inv);
  assert.deepEqual([s.counts.done, s.enough, s.items.length, s.comments.length], [2, false, 0, 0]);

  // 4 seniors and 3 allied stand alone; 2 peers + 1 other fold into Others (3)
  for (const k of Object.keys(inv)) { delete inv[k]; delete rsp[k]; }
  for (const x of [4, 4, 3, 3]) add('senior', x);
  for (const x of [2, 2, 2]) add('allied', x);
  add('peer', 1); add('peer', 3); add('other', 2); add('peer'); add('senior', 'declined');
  s = summarise(rsp, inv);
  assert.deepEqual(s.groups.map(g => [g.id, g.n]), [['senior', 4], ['allied', 3], ['others', 3]]);
  assert.deepEqual([s.counts.invited, s.counts.done, s.counts.declined, s.counts.waiting], [12, 10, 1, 1]);
  const q1 = s.items.find(i => i.id === 'q1');
  assert.deepEqual([q1.groups.senior.mean, q1.groups.allied.mean, q1.groups.others.mean, q1.overall.mean, q1.overall.n], [3.5, 2, 2, 2.6, 10]);
  assert.ok(!('peer' in q1.groups), 'peers never shown alone with 2');

  // one group under 3 and Others too small: it joins the smallest shown group, so nothing can be worked out by subtraction
  for (const k of Object.keys(inv)) { delete inv[k]; delete rsp[k]; }
  for (const x of [4, 4, 4, 4]) add('senior', x);
  for (const x of [3, 3, 3]) add('allied', x);
  add('peer', 1);
  s = summarise(rsp, inv);
  assert.deepEqual(s.groups.map(g => [g.id, g.label, g.n]), [['senior', 'Senior doctors', 4], ['allied', 'Allied health and others', 4]]);
  assert.equal(s.items[0].groups.allied.mean, 2.5);
  assert.equal(s.groups.reduce((n, g) => n + g.n, 0), s.counts.done, 'every answer counted in exactly one group');

  // only small groups: all fold into Others when together they reach 3
  for (const k of Object.keys(inv)) { delete inv[k]; delete rsp[k]; }
  add('senior', 4); add('senior', 2); add('peer', 3);
  s = summarise(rsp, inv);
  assert.deepEqual(s.groups.map(g => [g.id, g.n]), [['others', 3]]);
  assert.equal(s.items[0].overall.mean, 3);

  // "Not observed" leaves the mean and is counted; comments shuffled, nameless; the concern kept apart
  for (const k of Object.keys(inv)) { delete inv[k]; delete rsp[k]; }
  add('senior', 4, { comments: { c1: 'A', c2: 'X' } }); add('senior', 2, { comments: { c1: 'B' } });
  const k3 = add('senior', 'na', { comments: { c1: 'C' } });
  rsp[k3].answers.q6 = 'yes'; rsp[k3].comments.c3 = 'Late twice';
  s = summarise(rsp, inv, { rand: noShuffle });
  assert.deepEqual([s.items[0].overall.mean, s.items[0].overall.n, s.items[0].overall.notObserved], [3, 2, 1]);
  assert.deepEqual(s.comments.map(c => c.slot), ['c1', 'c2']);
  assert.deepEqual(s.comments[0].texts.slice().sort(), ['A', 'B', 'C']);
  assert.deepEqual(s.concerns, { yes: 1, texts: ['Late twice'] });
  assert.ok(!JSON.stringify(s).includes('Dr '), 'no rater names');
  const orders = new Set(Array.from({ length: 30 }, () => summarise(rsp, inv).comments[0].texts.join('')));
  assert.ok(orders.size > 1, 'comment order varies');

  // a response without an invite is ignored (it cannot be placed in a group)
  s = summarise({ ...rsp, stray: { answers: { q1: 1 }, comments: {} } }, inv);
  assert.equal(s.counts.done, 3);
}
// ---- the rater page's link and the coordinators' invite flow ----
{
  const { parseRateHash, raterRows, raterCounts, notDoneEmails, inviteMailto, reminderMailto, rateLink } = await import('../js/model.js');
  const id = 'a'.repeat(32);
  assert.deepEqual(parseRateHash('#r2026-10/' + id), { round: 'r2026-10', id });
  assert.deepEqual(parseRateHash('#demo/' + id.toUpperCase()), { round: 'demo', id }, 'ids are matched in lower case');
  assert.deepEqual(parseRateHash(new URL(rateLink('r2026-10-2', id)).hash), { round: 'r2026-10-2', id });
  for (const bad of ['', '#', '#' + id, '#r2026-10/abc', '#r2026-10/' + id + 'x', '#a b/' + id, '#' + 'r'.repeat(21) + '/' + id, null]) assert.equal(parseRateHash(bad), null, String(bad));

  const nominees = [{ id: 'n1', group: 'senior', name: 'Dr A', email: 'a@x.com' }, { id: 'n2', group: 'peer', name: 'B', email: 'b@x.com' },
    { id: 'n3', group: 'allied', name: 'C', email: 'c@x.com' }, { id: 'n4', group: 'other', name: 'D', email: '' }, { id: 'n5', group: 'senior', name: 'E', email: 'e@x.com' }];
  const invites = {
    i1: { resident: 'amy@x.com', nomineeId: 'n1', group: 'senior', createdAt: 1 },
    i2: { resident: 'amy@x.com', nomineeId: 'n2', group: 'peer', createdAt: 2 },
    i3: { resident: 'amy@x.com', nomineeId: 'n3', group: 'allied', createdAt: 3 },
    i4: { resident: 'amy@x.com', nomineeId: 'n4', group: 'other', createdAt: 4 },
    i5old: { resident: 'amy@x.com', nomineeId: 'n5', group: 'senior', createdAt: 5 },
    i5new: { resident: 'amy@x.com', nomineeId: 'n5', group: 'senior', createdAt: 6 },
    other: { resident: 'bob@x.com', nomineeId: 'n1', group: 'senior', createdAt: 7 },
  };
  const responses = { i2: { answers: { q1: 3 }, declined: false }, i3: { answers: {}, declined: true }, i5old: { answers: { q1: 4 }, declined: false }, other: { answers: {}, declined: true } };
  const rows = raterRows(' Amy@x.com ', nominees, { n1: 'sent' }, invites, responses);
  assert.deepEqual(rows.map(r => r.status), ['invited', 'done', 'declined', 'invited', 'done'], "another resident's invite for the same nominee id is ignored");
  assert.equal(rows[4].invite.id, 'i5old', 'of two invites for one nominee, the answered one counts');
  assert.equal(raterRows('amy@x.com', nominees, {}, { a: invites.i5old, b: invites.i5new }, {})[4].invite.id, 'b', 'else the newest');
  assert.deepEqual(raterCounts(rows), { invited: 5, done: 2, declined: 1, waiting: 2 });
  assert.equal(notDoneEmails(rows), 'a@x.com', 'only invited raters with an email who have not answered');
  // Admin staff may not read answers: statuses stay invited / not invited
  const blind = raterRows('amy@x.com', nominees, {}, invites, null);
  assert.deepEqual(blind.map(r => r.status), ['invited', 'invited', 'invited', 'invited', 'invited']);
  assert.deepEqual(raterRows('amy@x.com', nominees, {}, {}, {}).map(r => r.status), Array(5).fill('not invited'));
  assert.deepEqual(raterCounts(raterRows('amy@x.com', [], {}, invites, responses)), { invited: 0, done: 0, declined: 0, waiting: 0 });

  const link = rateLink('r2026-10', id);
  const m = decodeURIComponent(inviteMailto(nominees[2], 'Amy First', { title: 'CCC Dec' }, link));
  assert.ok(m.startsWith('mailto:c@x.com?subject=Multisource feedback for Amy First&body=Dear C,'));
  assert.ok(m.includes(link) && m.includes('as an allied health colleague'), 'the link and the group are in the email');
  assert.ok(m.includes('(CCC Dec)') && m.includes('Decline'));
  const r = decodeURIComponent(reminderMailto(nominees[0], 'Amy First', { title: 'CCC Dec' }, link));
  assert.ok(r.includes('subject=Reminder: Multisource feedback for Amy First') && r.includes(link));
  assert.ok(decodeURIComponent(inviteMailto(nominees[3], 'Amy', {}, link)).startsWith('mailto:?subject='), 'no email: the coordinator fills in the address');
  assert.ok(!/[<>]/.test(m), 'plain text only');
}

// ---- the CCC report, the saved summary and the clean-up plan ----
{
  const { summarise, reportDoc, fromReport, purgePlan, invitesOf, invitedResidents, overviewRows, meanText, answerLines } = await import('../js/model.js');
  const inv = (resident, group, name) => ({ resident, nomineeId: name, group, residentName: resident === 'amy@x.com' ? 'Amy First' : 'Ben Second', raterName: name, createdAt: 1, createdBy: 'pc@x.com' });
  const ans = (q, c1, concern) => ({ answers: { q1: q, q2: q, q3: 'na', q4: q, q5: q, q6: concern ? 'yes' : 'no' }, comments: { c1, ...(concern ? { c3: concern } : {}) }, declined: false, submittedAt: 5 });
  const invites = { a1: inv('amy@x.com', 'senior', 'Dr A'), a2: inv('amy@x.com', 'senior', 'Dr B'), a3: inv('amy@x.com', 'senior', 'Dr C'), a4: inv('amy@x.com', 'peer', 'Pat'), a5: inv('amy@x.com', 'allied', 'Nurse N'), b1: inv('ben@x.com', 'senior', 'Dr A') };
  const responses = { a1: ans(4, 'Calm'), a2: ans(3, 'Kind'), a3: ans(3, '', 'Late twice'), a4: ans(2, 'Quiet'), a5: { answers: {}, comments: {}, declined: true, reason: 'Leave', submittedAt: 6 } };
  assert.deepEqual(Object.keys(invitesOf(invites, 'AMY@x.com')), ['a1', 'a2', 'a3', 'a4', 'a5']);
  assert.deepEqual(invitedResidents(invites), [{ email: 'amy@x.com', name: 'Amy First' }, { email: 'ben@x.com', name: 'Ben Second' }]);
  const s = summarise(Object.fromEntries(['a1', 'a2', 'a3', 'a4', 'a5'].map(k => [k, responses[k]])), invitesOf(invites, 'amy@x.com'), { rand: () => 0 });
  assert.equal(s.overall.n, 16, 'every rating on every item, "not observed" left out');
  assert.equal(s.overall.mean, 3);
  const doc = reportDoc('Amy@x.com', 'Amy First', s);
  assert.deepEqual(Object.keys(doc).sort(), ['comments', 'concerns', 'counts', 'email', 'enough', 'formId', 'groups', 'items', 'minGroup', 'name', 'overall'], 'the rules\' keys (the store adds savedAt)');
  assert.equal(doc.email, 'amy@x.com');
  assert.deepEqual(doc.counts, { invited: 5, done: 4, declined: 1, waiting: 0 }, 'no counts per group');
  assert.ok(!JSON.stringify(doc).match(/Dr A|Dr B|Dr C|Pat|Nurse N|Leave/), 'no rater names or decline reasons in the saved summary');
  assert.deepEqual(doc.concerns, { yes: 1, texts: ['Late twice'] });
  assert.equal(doc.groups.length, 1, 'seniors shown; the one peer folded in');
  assert.equal(doc.groups[0].n, 4);
  // back again: the screen draws the same thing
  const back = fromReport({ ...doc, savedAt: 9 });
  assert.deepEqual([back.counts, back.enough, back.overall, back.groups, back.concerns, back.savedAt], [doc.counts, true, doc.overall, doc.groups, doc.concerns, 9]);
  assert.deepEqual(back.items.map(i => i.overall), s.items.map(i => i.overall));
  assert.deepEqual(back.comments, s.comments);
  const junk = fromReport({ counts: 'x', items: 'y', groups: null, comments: [{ slot: 'c1', title: 't', texts: 'nope' }] });
  assert.deepEqual([junk.counts.done, junk.items, junk.groups, junk.comments[0].texts, junk.minGroup, junk.overall.mean], [0, [], [], [], 3, null], 'a broken document draws as empty');
  // too few answers: only counts survive
  const few = reportDoc('ben@x.com', 'Ben', summarise({ b1: ans(4, 'Fine') }, invitesOf(invites, 'ben@x.com')));
  assert.deepEqual([few.enough, few.items, few.comments, few.groups, few.overall.mean, few.counts.done], [false, [], [], [], null, 1]);
  // the clean-up plan: one step per resident, all links and answers in it, and a stray answer deleted too
  const plan = purgePlan(invites, { ...responses, zz: ans(1, 'stray') }, { rand: () => 0 });
  assert.deepEqual(plan.map(p => p.email), ['amy@x.com', 'ben@x.com', '']);
  assert.deepEqual(plan[0].inviteIds, ['a1', 'a2', 'a3', 'a4', 'a5']);
  assert.deepEqual(plan[0].responseIds, ['a1', 'a2', 'a3', 'a4', 'a5']);
  assert.deepEqual(plan[0].report, doc);
  assert.deepEqual([plan[1].inviteIds, plan[1].responseIds, plan[1].report.counts.waiting], [['b1'], [], 1], 'a rater who never answered: the summary keeps the count');
  assert.deepEqual([plan[2].report, plan[2].responseIds], [null, ['zz']]);
  assert.deepEqual(purgePlan({}, {}), []);
  // the round overview
  const rows = overviewRows({ 'ben@x.com': { name: 'Ben', saved: true, summary: back }, 'amy@x.com': { name: 'Amy', summary: s } });
  assert.deepEqual(rows.map(r => [r.name, r.invited, r.done, r.mean, r.concerns, r.saved]), [['Amy', 5, 4, 3, 1, false], ['Ben', 5, 4, 3, 1, true]]);
  assert.deepEqual([meanText(3), meanText(2.456), meanText(null)], ['3.00', '2.46', '–']);
  // raw answers as lines
  const lines = answerLines(responses.a3);
  assert.equal(lines.find(l => l.title === 'Clinical care').value, '3 Meets expectations');
  assert.equal(lines.find(l => l.title === 'Teamwork').value, 'Not observed');
  assert.ok(lines.some(l => l.value === 'Yes') && lines.some(l => l.value === 'Late twice' && l.text));
}
console.log('360 rater model checks passed');
