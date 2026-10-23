// tools/ccc-import-form.mjs: the old Google Form's response sheet -> earlier rounds. Made-up people only.
// Run: node ccc/test/import.test.mjs
import assert from 'node:assert/strict';
import { parseCSV, sentAt, roundOf, projectsOf, plan } from '../../tools/ccc-import-form.mjs';

// CSV: quotes, doubled quotes, line breaks inside a cell
assert.deepEqual(parseCSV('a,b\n"x, y","say ""hi""\nthere"\n'), [['a', 'b'], ['x, y', 'say "hi"\nthere']]);

// times are Singapore time
assert.equal(new Date(sentAt('06/10/2025 20:48:05')).toISOString(), '2025-10-06T12:48:05.000Z');

// rounds: the form's answer wins, else the half-year from the date (January still counts for Jul-Dec)
assert.equal(roundOf('Jan-Jun 2025', sentAt('06/10/2025 10:00:00')).id, 'r2025-h1');
assert.equal(roundOf('', sentAt('06/10/2025 10:00:00')).id, 'r2025-h2');
assert.equal(roundOf('', sentAt('10/01/2026 10:00:00')).id, 'r2025-h2');
assert.equal(roundOf('', sentAt('20/04/2026 10:00:00')).title, 'CCC Jan–Jun 2026');

// projects: numbered items split, blank lines do not, nothing is lost
assert.deepEqual(projectsOf('NA'), []);
assert.deepEqual(projectsOf('1. Audit A. Dr X. Ongoing\n2. Paper B. Dr Y. Completed and published').map(p => [p.title, p.status]),
  [['Audit A. Dr X. Ongoing', 'Ongoing'], ['Paper B. Dr Y. Completed and published', 'Completed']]);
const one = projectsOf('Safety project\nDr Z\n\nWorking with nurses');
assert.equal(one.length, 1); assert.equal(one[0].title, 'Safety project'); assert.match(one[0].note, /Dr Z\n\nWorking with nurses/);
const long = projectsOf('T\n' + 'word '.repeat(300));
assert.ok(long.length === 2 && long[1].title === 'T (continued)' && long.every(p => p.note.length <= 1000));

// a sheet: two sends from one resident merge (newest non-empty wins), "NA" is empty, a skipped address is left out
const head = ['Timestamp', 'CCC Meeting', "Resident's Full Name (As in NRIC)", 'Email address', 'Scholarly Project\nSupervisor\nProgress',
  'Committee / Admin Work', 'Teaching / Presentations', 'Conference presentations',
  ...[1, 2, 3, 4, 5, 6].map(i => `Medical Staff (Senior) ${i} of 6: Name`), 'Medical Staff (Peer) 1 of 2: Name', 'Medical Staff (Peer) 2 of 2: Name',
  ...[1, 2, 3, 4].flatMap(i => [`Allied Health ${i} of 4: Name`, `Allied Health ${i} of 4: Email`])];
const row = (at, name, email, proj, admin, seniors, allied) => [at, '', name, email, proj, admin, 'NA', 'Nil',
  ...seniors.concat(Array(6).fill('.')).slice(0, 6), '.', '.', ...allied.concat(Array(8).fill('.')).slice(0, 8)];
const csv = [head, row('06/10/2025 10:00:00', 'Demo One', 'one@example.com', 'Audit A', 'Rota planner', ['Dr A', 'Dr B'], ['Nurse C', 'c@example.com', 'Nurse D', 'not an email']),
  row('08/10/2025 10:00:00', 'Demo One', 'One@Example.com', 'Audit A\nnow writing up', 'NA', ['.'], []),
  row('20/04/2026 10:00:00', 'Demo Two', 'two@example.com', 'NA', '', [], []),
  row('21/04/2026 10:00:00', 'Tester', 'pc@example.com', 'x', 'x', ['x'], [])]
  .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
const p = plan(csv, { skip: ['pc@example.com'] });
const doc = path => p.docs.find(d => d.path === path)?.data;
assert.deepEqual(p.report.rounds.map(r => [r.id, r.status, r.residents]), [['r2025-h2', 'closed', 1], ['r2026-h1', 'open', 1]]);
assert.equal(doc('ccc/r2025-h2').closedAt, sentAt('08/10/2025 10:00:00'));
assert.equal(doc('ccc/r2026-h1').status, 'open');
const e1 = doc('ccc/r2025-h2/entries/one@example.com');
assert.equal(e1.projects[0].note, 'now writing up', 'the newer project text');
assert.deepEqual(e1.admin, ['Rota planner'], '"NA" later does not wipe it');
assert.deepEqual(doc('ccc/r2025-h2/msf/one@example.com').nominees.map(n => [n.group, n.name, n.email]),
  [['senior', 'Dr A', ''], ['senior', 'Dr B', ''], ['allied', 'Nurse C', 'c@example.com'], ['allied', 'Nurse D', '']], 'nominees from the send that had them');
assert.equal(p.report.badEmails.length, 1);
assert.equal(doc('ccc/r2026-h1/entries/two@example.com').noProjects, true);
assert.equal(doc('ccc/r2026-h1/msf/two@example.com'), undefined, 'no nominees, no list');
assert.equal(p.docs.some(d => d.path.includes('pc@example.com')), false);
assert.equal(p.report.merged, 1);

console.log('ccc import: all checks passed');
