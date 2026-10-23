// Browser test of CCC in demo mode at phone size, with an axe accessibility check on each screen.
// Run from the repo root (no server needed: files are served from this checkout by route):
//   node ccc/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const root = new URL('../../', import.meta.url).pathname;
const BASE = 'https://apmes.anawj.com/';
const SHOTS = process.env.SHOTS;
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webmanifest: 'application/manifest+json', md: 'text/markdown' };

const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') && !fs.statSync('/opt/pw-browsers/chromium').isDirectory() ? '/opt/pw-browsers/chromium' : null);
const b = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true });
const outside = [];
await ctx.route(/^https:\/\/apmes\.anawj\.com\//, async route => {
  const u = new URL(route.request().url());
  let rel = decodeURIComponent(u.pathname).replace(/^\//, '');
  if (!/^(ccc|evals|nuhsdesign)\//.test(rel)) return route.fulfill({ status: 404, body: 'not found' });
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(root, rel);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
  await route.fulfill({ status: 200, contentType: MIME[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
});
// nothing else may be reached: Firebase and Google are never touched in the demo
// the NUHS design kit (design.anawj.com, styles and scripts only, no data) loads from the network
await ctx.route(/^https:\/\/(?!apmes\.anawj\.com|design\.anawj\.com|fonts\.)/, route => { outside.push(route.request().url()); route.abort(); });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });

const axe = async (label, pg = page) => {
  if (!fs.existsSync(AXE)) return;
  if (!(await pg.evaluate(() => !!window.axe))) await pg.addScriptTag({ path: AXE });
  await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }));
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  assert.equal(bad.length, 0, `axe (${label}): ` + bad.map(v => v.id + ' ' + v.nodes[0]?.target).join('; '));
};
const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); } };
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('ccc-demo-store') || '{}'));
const setStore = fn => page.evaluate(src => { const d = JSON.parse(localStorage.getItem('ccc-demo-store') || '{}'); new Function('d', src)(d); localStorage.setItem('ccc-demo-store', JSON.stringify(d)); }, fn.toString().replace(/^[^{]*\{|\}\s*$/g, ''));

// 1. A resident opens the demo round
await page.goto(BASE + 'ccc/?demo=reset');
await page.locator('main h2', { hasText: 'CCC round (demo)' }).waitFor();
assert.equal(await page.locator('.e-list .e-row').count(), 2);
assert.match(await page.textContent('main'), /Only the programme coordinators and directors see this/);
await axe('home'); await shot('1-home');

// 2. Scholarly projects: add one, fill it, add lines; it is saved on the device as they type
await page.getByRole('button', { name: /Scholarly projects/ }).click();
await page.getByRole('heading', { name: 'Projects you are doing now' }).waitFor();
await page.getByRole('button', { name: 'Add a project' }).click();
await page.getByLabel('Title').fill('Audit of postoperative nausea');
await page.getByLabel('Supervisor').fill('Dr Demo Faculty');
await page.getByLabel('Status').selectOption('Completed');
await page.getByLabel('Started').fill('2026-03');
await page.getByLabel('Expected end or ended').fill('2026-09');
await page.getByLabel('Progress or notes').fill('Data collected; poster accepted.');
await page.getByLabel('Committee / admin work').fill('Quality committee, member\n\nResident forum, secretary');
await page.getByLabel('Conference presentations').fill('<img src=x onerror=window.__xss=1> Anaesthesia meeting, poster');
await page.getByText('Saved on this device. Not sent yet.').waitFor();
assert.equal(await page.locator('#cc-na').isDisabled(), true, 'the “none” box is off while a project exists');
assert.equal(await page.evaluate(() => window.__xss), undefined, 'typed text is never run as HTML');
await axe('projects'); await shot('2-projects');

// 3. Nominees: pick a senior from the faculty list; add an allied-health nominee without an email
await page.getByRole('button', { name: 'Next: feedback nominees' }).click();
await page.getByRole('heading', { name: 'Who should give you feedback?' }).waitFor();
await page.locator('[data-add=senior]').click();
await page.getByLabel('Senior doctor name').fill('hana');
await page.getByRole('button', { name: 'Dr Hana Lee' }).click();
assert.equal(await page.getByLabel('Senior doctor email').inputValue(), 'dr.hana.lee@example.com', 'the picker fills the email');
await page.locator('[data-add=allied]').click();
await page.getByLabel('Allied health name').fill('Nurse Example');
await page.locator('[data-add=peer]').click();
await page.getByLabel('Peer name').fill('aiden');
await page.getByRole('button', { name: 'Aiden Tan' }).click();
assert.equal(await page.getByLabel('Peer email').inputValue(), 'aiden.tan@example.com', 'the peer picker fills the email from the resident list');
await page.locator('[data-add=peer]').click();
await page.getByLabel('Peer name').nth(1).fill('Peer Two');
assert.equal(await page.locator('[data-add=peer]').isDisabled(), true, 'two peers at most');
await axe('nominees'); await shot('3-nominees');

// 4. Review: an allied-health nominee needs an email, so Send is off until it is added
await page.getByRole('button', { name: 'Review and send' }).click();
await page.getByRole('heading', { name: /Feedback nominees \(4\)/ }).waitFor();
assert.match(await page.textContent('main'), /Nurse Example: allied health nominees need an email/);
assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), true);
await axe('review problems'); await shot('4-review-problems');
await page.getByRole('link', { name: 'Fix' }).first().click();
await page.getByLabel('Allied health email').fill('nurse.example@example.com');
await page.getByRole('button', { name: 'Review and send' }).click();
await page.getByRole('heading', { name: /Feedback nominees \(4\)/ }).waitFor();
assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), false);
assert.match(await page.textContent('main'), /Audit of postoperative nausea/);
assert.match(await page.textContent('main'), /Quality committee, member; Resident forum, secretary/, 'blank lines are dropped');
await axe('review'); await shot('5-review');

// 5. Send: stored, and home says so
await page.getByRole('button', { name: 'Send', exact: true }).click();
await page.getByText(/^Sent on /).waitFor();
let st = await store();
const key = 'demo|resident@example.com';
assert.equal(st.entries[key].projects[0].title, 'Audit of postoperative nausea');
assert.equal(st.entries[key].projects[0].status, 'Completed');
assert.equal(st.msf[key].nominees.length, 4);
assert.deepEqual(st.msf[key].nominees.map(n => n.group).sort(), ['allied', 'peer', 'peer', 'senior']);
assert.equal(st.msf[key].nominees.find(n => n.group === 'senior').fac, 'dr.hana.lee@example.com');
assert.equal(await page.evaluate(() => localStorage.getItem('ccc-demo-draft-demo-resident@example.com')), null, 'the device draft is cleared once sent');
await shot('6-sent');

// 6. It is all still there after a reload; change something and the page says it is not sent yet
await page.reload();
await page.getByText(/^Sent on /).waitFor();
await page.getByRole('button', { name: /Scholarly projects/ }).click();
assert.equal(await page.getByLabel('Title').inputValue(), 'Audit of postoperative nausea');
await page.getByLabel('Title').fill('Audit of postoperative nausea and vomiting');
await page.getByText('Saved on this device. Not sent yet.').waitFor();
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.getByText('You have changes that are not sent yet.').waitFor();
await page.getByRole('button', { name: 'Review and send again' }).click();
await page.getByRole('button', { name: 'Send again' }).click();
await page.getByText(/^Sent on /).waitFor();
st = await store();
assert.equal(st.entries[key].projects[0].title, 'Audit of postoperative nausea and vomiting');

// 7. Nothing to report: the box needs no projects, and a new round carries last round's projects but not its nominees
await setStore(() => { d.rounds.demo.status = 'closed'; d.rounds.demo.updatedAt = 1; d.rounds.next = { round: 'next', title: 'Next CCC round', status: 'open', deadline: '', updatedAt: Date.now() }; });
await page.reload();
await page.locator('main h2', { hasText: 'Next CCC round' }).waitFor();
assert.match(await page.textContent('main'), /carried over from “CCC round \(demo\)”/);
await page.getByRole('button', { name: /Scholarly projects/ }).click();
assert.equal(await page.getByLabel('Title').inputValue(), 'Audit of postoperative nausea and vomiting', 'projects carry over');
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.getByText(/0 senior doctors · 0 peers/).waitFor();   // nominees start empty

// 8. A closed round can be read but not changed
await setStore(() => { d.rounds.next.status = 'closed'; d.rounds.next.updatedAt = 1; d.rounds.demo.updatedAt = 2; });
await page.reload();
await page.getByText(/This round is closed/).waitFor();
assert.equal(await page.getByRole('button', { name: /Review and send/ }).count(), 0);
await page.getByRole('button', { name: /Feedback nominees/ }).click();
assert.equal(await page.getByRole('button', { name: /^Add / }).count(), 0, 'no add buttons on a closed round');
assert.equal(await page.getByLabel('Senior doctor name').isDisabled(), true);
await axe('closed');

// 9. Coordinators: a fresh demo round with two residents who have sent and five who have not
await page.evaluate(() => localStorage.removeItem('ccc-demo-store'));
await page.goto(BASE + 'ccc/?demo=admin');
await page.getByRole('heading', { name: 'Rounds' }).waitFor();
assert.equal(await page.locator('.e-list .e-row').count(), 1);
await axe('rounds'); await shot('7-staff-rounds');
await page.getByRole('button', { name: /CCC round \(demo\)/ }).click();
await page.getByText('2 of 7 active residents have sent · 4 nominees · 4 to check').waitFor();
await axe('round'); await shot('8-staff-round');
await page.getByRole('button', { name: 'Not sent', exact: true }).click();
assert.equal(await page.locator('.e-list .e-row').count(), 5);
assert.match(await page.textContent('main'), /Chandra Rao/);
assert.doesNotMatch(await page.textContent('main'), /Aiden Tan/);
await page.getByRole('button', { name: 'Everyone', exact: true }).click();

// 10. One resident: read the projects, check the nominees, invite one (the link is made and the mail app opens with it)
await page.getByRole('button', { name: /Aiden Tan/ }).click();
await page.getByRole('heading', { name: 'Scholarly projects' }).waitFor();
assert.match(await page.textContent('main'), /Audit of ward handover/);
assert.match(await page.textContent('main'), /Intubation workshop/);
assert.match(await page.textContent('main'), /No raters invited yet/);
assert.equal(await page.getByRole('button', { name: /^Invite / }).count(), 0, 'nobody can be invited before they are checked');
assert.equal(await page.getByText('Mark Checked to invite.').count(), 2);
// the test has no mail app: catch mailto: taps and keep the address
const catchMail = () => page.evaluate(() => document.addEventListener('click', e => { const a = e.target.closest?.('a[href^="mailto:"]'); if (a) { e.preventDefault(); (window.__mail ||= []).push(a.href); } }, true));
await catchMail();
for (const who of ['Dr Hana Lee', 'Bea Lim']) {
  await page.getByRole('group', { name: 'Status for ' + who }).getByRole('button', { name: 'Checked' }).click();
  await page.getByRole('group', { name: 'Status for ' + who }).getByRole('button', { name: 'Checked' }).and(page.locator('[aria-pressed=true]')).waitFor();
}
await page.getByRole('button', { name: 'Invite Bea Lim' }).click();
await page.getByRole('link', { name: 'Email the link to Bea Lim' }).waitFor();
let mails = await page.evaluate(() => window.__mail || []);
assert.equal(mails.length, 1, 'Invite opens the mail app once');
const invMail = decodeURIComponent(mails[0]);
assert.match(invMail, /^mailto:bea\.lim@example\.com\?subject=Multisource feedback for Aiden Tan&body=Dear Bea Lim,/);
const beaLink = invMail.match(/https:\/\/apmes\.anawj\.com\/ccc\/rate\/\?demo#demo\/[0-9a-f]{32}/)?.[0];
assert.ok(beaLink, 'the email carries the one-time link');
assert.match(await page.textContent('main'), /Raters: 1 invited · 0 done/);
st = await store();
const marks = Object.values(st.review).find(r => r.email === 'aiden.tan@example.com').marks;
assert.deepEqual(Object.values(marks).sort(), ['ok', 'sent'], 'one checked, one invited (emailed)');
assert.equal(Object.keys(st.invites).length, 1);
const inv = Object.values(st.invites)[0];
assert.deepEqual([inv.resident, inv.group, inv.residentName, inv.raterName], ['aiden.tan@example.com', 'peer', 'Aiden Tan', 'Bea Lim']);
assert.ok(!JSON.stringify(inv).includes('bea.lim@example.com'), "the invite (readable by anyone holding the link) holds no rater email");
await page.getByRole('link', { name: 'Remind Bea Lim' }).click();
mails = await page.evaluate(() => window.__mail);
assert.match(decodeURIComponent(mails[1]), /subject=Reminder: Multisource feedback for Aiden Tan/);
assert.ok(decodeURIComponent(mails[1]).includes(beaLink), 'the reminder carries the same link');
await page.getByRole('button', { name: 'Invite Dr Hana Lee' }).click();
await page.getByRole('link', { name: 'Email the link to Dr Hana Lee' }).waitFor();
const hanaLink = decodeURIComponent((await page.evaluate(() => window.__mail))[2]).match(/https:\/\/apmes\.anawj\.com\/ccc\/rate\/\?demo#demo\/[0-9a-f]{32}/)[0];
assert.equal(await page.getByText('Invited', { exact: true }).count(), 2);
await axe('resident detail'); await shot('9-staff-resident');
await page.reload();
await page.getByRole('heading', { name: 'Scholarly projects' }).waitFor();
assert.equal(await page.getByText('Emailed', { exact: true }).count(), 2, 'marks are kept: invited means emailed');
assert.equal(await page.getByRole('button', { name: /^Invite / }).count(), 0, 'invited raters are not invited twice');

// 10a. The rater (no sign-in) opens the link on a phone: who, as which group, the form; nothing sent until every rating is answered
const rater = await ctx.newPage();
rater.on('pageerror', e => errors.push(String(e)));
rater.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
await rater.goto(beaLink);
await rater.getByRole('heading', { name: 'Feedback for Aiden Tan' }).waitFor();
assert.match(await rater.textContent('main'), /You are answering as: Peer/);
assert.match(await rater.textContent('main'), /seen by the programme staff; the resident sees only a summary/);
assert.equal(await rater.locator('input[type=range], .e-scale9').count(), 0, 'a labelled radio list, no sliders');
await axe('rater form', rater); if (SHOTS) await rater.screenshot({ path: path.join(SHOTS, '10-rater.png'), fullPage: true });
await rater.getByRole('button', { name: 'Submit feedback' }).click();
await rater.getByRole('alert').filter({ hasText: 'Please answer every rating' }).waitFor();
assert.match(await rater.getByRole('alert').textContent(), /Clinical care.*Teamwork.*Any concern/);
await axe('rater problems', rater);
const q = t => rater.getByRole('group', { name: t });
await q('Clinical care').getByLabel('Above expectations').check();
await q('Communication with patients and families').getByLabel('Meets expectations').check();
await q('Teamwork').getByLabel('Meets expectations').check();
await q('Professionalism').getByLabel('Borderline').check();
await rater.getByLabel('One thing to keep doing (optional)').fill('Calm in a crisis <b>really</b>');
await rater.reload();   // kept on this device until Submit
await rater.getByText('Your earlier answers on this device are back').waitFor();
assert.equal(await q('Clinical care').getByLabel('Above expectations').isChecked(), true);
assert.equal(await rater.getByLabel('One thing to keep doing (optional)').inputValue(), 'Calm in a crisis <b>really</b>');
await q('Teaching and supervision').getByLabel('Not observed').check();
await q("Any concern about this resident's conduct or patient safety?").getByLabel('No').check();
await rater.getByRole('button', { name: 'Submit feedback' }).click();
await rater.getByRole('heading', { name: 'Thank you' }).waitFor();
assert.match(await rater.textContent('main'), /Your feedback for Aiden Tan is sent/);
await axe('rater done', rater);
st = await store();
const resp = st.responses['demo|' + beaLink.split('/').pop()];
assert.deepEqual(resp.answers, { q1: 4, q2: 3, q3: 3, q4: 2, q5: 'na', q6: 'no' });
assert.deepEqual(resp.comments, { c1: 'Calm in a crisis <b>really</b>' });
assert.equal(resp.declined, false);
assert.ok(!Object.keys(await rater.evaluate(() => ({ ...localStorage }))).some(k => k.includes('-draft-demo-')), 'the device draft is gone once sent');
// the same link again: on this phone it says thank you; elsewhere (no device note) a second submit is refused kindly
await rater.reload();
await rater.getByRole('heading', { name: 'Thank you' }).waitFor();
await rater.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('ccc-demo-rate-')) localStorage.removeItem(k); });
await rater.reload();
await rater.getByRole('heading', { name: 'Feedback for Aiden Tan' }).waitFor();
for (const t of ['Clinical care', 'Communication with patients and families', 'Teamwork', 'Professionalism', 'Teaching and supervision']) await q(t).getByLabel('Not observed').check();
await q("Any concern about this resident's conduct or patient safety?").getByLabel('No').check();
await rater.getByRole('button', { name: 'Submit feedback' }).click();
await rater.getByRole('heading', { name: 'This link has already been used' }).waitFor();
assert.equal((await store()).responses['demo|' + beaLink.split('/').pop()].answers.q1, 4, 'the first answers stand');
await axe('rater used', rater);

// 10b. A decline, with a reason; then an unknown and a broken link
await rater.goto(hanaLink);
await rater.getByRole('heading', { name: 'Feedback for Aiden Tan' }).waitFor();
assert.match(await rater.textContent('main'), /You are answering as: Senior doctor/);
await q('Clinical care').getByLabel('Below expectations').check();
await rater.getByRole('button', { name: 'I can’t give feedback' }).click();
await rater.getByLabel('Reason (optional)').fill('Only worked together once');
await axe('rater decline', rater);
await rater.getByRole('button', { name: 'Decline', exact: true }).click();
await rater.getByRole('heading', { name: 'Thank you for letting us know' }).waitFor();
const dec = (await store()).responses['demo|' + hanaLink.split('/').pop()];
assert.deepEqual(dec, { answers: {}, comments: {}, declined: true, reason: 'Only worked together once', submittedAt: dec.submittedAt }, 'a decline sends no ratings');
await rater.goto(BASE + 'ccc/rate/?demo#demo/' + 'f'.repeat(32));
await rater.getByRole('heading', { name: 'This link doesn’t work' }).waitFor();
await axe('rater unknown', rater);
await rater.goto(BASE + 'ccc/rate/?demo#demo/abc');
await rater.getByRole('heading', { name: 'This link doesn’t work' }).waitFor();
await rater.close();

// 10c. Back with the coordinators: each rater's status, counts, the emails of raters not done
await page.reload();
await page.getByRole('heading', { name: 'Scholarly projects' }).waitFor();
assert.match(await page.textContent('main'), /Raters: 2 invited · 1 done · 1 declined/);
assert.equal(await page.getByText('Done', { exact: true }).count(), 1);
assert.equal(await page.getByText('Declined', { exact: true }).count(), 1);
assert.equal(await page.getByRole('link', { name: /^Remind / }).count(), 0, 'no reminders once answered');
await axe('resident raters');
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.locator('main h2', { hasText: 'CCC round (demo)' }).waitFor();
assert.match(await page.textContent('main'), /Raters: 2 invited · 1 done · 1 declined/);
assert.match(await page.getByRole('button', { name: /Aiden Tan/ }).textContent(), /2 invited · 1 done · 1 declined/);
await page.getByRole('button', { name: /Aiden Tan/ }).click();
await page.getByRole('heading', { name: 'Scholarly projects' }).waitFor();

// 11. Hostile text from a resident is shown as text and made safe in the CSV
await setStore(() => { const k = 'demo|aiden.tan@example.com'; d.msf[k].nominees.push({ id: 'evil', group: 'other', name: '=HYPERLINK("http://x")', email: 'evil@example.com' }, { id: 'evil2', group: 'other', name: '<img src=x onerror=window.__x2=1>', email: 'evil2@example.com' }); });
await page.reload();
await page.getByText('<img src=x onerror=window.__x2=1>').waitFor();
assert.equal(await page.evaluate(() => window.__x2), undefined, 'nominee text is never run as HTML');
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.locator('main h2', { hasText: 'CCC round (demo)' }).waitFor();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Nominees (CSV)' }).click()]);
const csv = fs.readFileSync(await dl.path(), 'utf8');
assert.match(csv, /^Round,Resident,Resident email,Group,Nominee,Nominee email,Status\r\n/);
assert.match(csv, /Dr Hana Lee,dr\.hana\.lee@example\.com,Emailed/);
assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/, 'a nominee cannot inject a formula');
assert.equal(dl.suggestedFilename(), 'ccc-nominees-demo.csv');
const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Projects (CSV)' }).click()]);
assert.match(fs.readFileSync(await dl2.path(), 'utf8'), /Scholarly project,Audit of ward handover,Dr Hana Lee,Ongoing,2026-02/);

// 12. Close the round (residents are locked out of editing), reopen it, edit it
await page.getByRole('button', { name: 'Close the round' }).click();
await page.getByRole('button', { name: 'Close the round' }).last().click();
await page.getByText(/Nominees' contact details are deleted on /).waitFor();
assert.equal((await store()).rounds.demo.status, 'closed');
assert.ok((await store()).rounds.demo.closedAt > 0);
await page.getByRole('button', { name: 'Reopen' }).click();
await page.getByText(/deleted three years after you close the round/).waitFor();
assert.equal((await store()).rounds.demo.closedAt, undefined, 'reopening clears the close time');
await page.getByRole('button', { name: 'Edit', exact: true }).click();
await page.getByLabel('Name').fill('CCC round, renamed');
await page.getByRole('button', { name: 'Save' }).click();
await page.locator('main h2', { hasText: 'CCC round, renamed' }).waitFor();

// 13. Open a new round
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.getByRole('button', { name: 'Open a new round' }).click();
await page.getByLabel('Name').fill('CCC round, next');
await page.getByRole('button', { name: 'Open the round' }).click();
await page.locator('main h2', { hasText: 'CCC round, next' }).waitFor();
st = await store();
assert.equal(Object.keys(st.rounds).length, 2);
assert.match(Object.keys(st.rounds).find(k => k !== 'demo'), /^r\d{4}-\d{2}/);

// 14. Delete one resident's nominees, then the rest of a round's
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.getByRole('button', { name: /CCC round, renamed/ }).click();
await page.getByRole('button', { name: /Bea Lim/ }).click();
await page.getByRole('button', { name: 'Delete these nominees now' }).click();
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.locator('main h2', { hasText: 'CCC round, renamed' }).waitFor();
st = await store();
assert.equal(st.msf['demo|bea.lim@example.com'], undefined);
assert.ok(st.entries['demo|bea.lim@example.com'], 'projects are kept');
await page.getByRole('button', { name: 'Delete nominees now' }).click();
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('ccc-demo-store')).msf).length === 0);

// 15. The three-year clean-up: a round closed 1096 days ago loses its nominees when staff open the app; projects stay
await page.evaluate(() => localStorage.removeItem('ccc-demo-store'));
await page.goto(BASE + 'ccc/?demo=admin');
await page.getByRole('heading', { name: 'Rounds' }).waitFor();
await setStore(() => { d.rounds.demo.status = 'closed'; d.rounds.demo.closedAt = Date.now() - 1096 * 86400000; });
await page.reload();
await page.getByText(/Deleted 2 nominee lists from rounds closed more than three years ago/).waitFor();
st = await store();
assert.deepEqual(Object.keys(st.msf), [], 'old nominees are gone');
assert.equal(Object.keys(st.entries).length, 2, 'projects are kept');
await page.evaluate(() => localStorage.removeItem('ccc-demo-store'));
await page.goto(BASE + 'ccc/?demo=admin');
await setStore(() => { d.rounds.demo.status = 'closed'; d.rounds.demo.closedAt = Date.now() - 364 * 86400000; });
await page.reload();
await page.getByRole('heading', { name: 'Rounds' }).waitFor();
assert.equal(Object.keys((await store()).msf).length, 2, 'a round closed 364 days ago keeps its nominees');

// 15b. The CCC report: four raters for Aiden (three seniors, one peer folded in), one decline, one concern
await page.evaluate(() => localStorage.removeItem('ccc-demo-store'));
await page.goto(BASE + 'ccc/?demo=admin');
await page.getByRole('heading', { name: 'Rounds' }).waitFor();
await setStore(() => {
  const A = 'aiden.tan@example.com', raters = [['senior', 'Dr Rater One', 4, 'Steady under pressure.'], ['senior', 'Dr Rater Two', 3, 'Kind to patients.'], ['senior', 'Dr Rater Three', 3, ''], ['peer', 'Peer Rater', 2, 'Shares the load.'], ['allied', 'Allied Rater', 0, '']];
  raters.forEach(([group, raterName, q, c1], i) => {
    const id = String(i + 1).repeat(32);
    d.invites['demo|' + id] = { resident: A, nomineeId: 'n' + i, group, residentName: 'Aiden Tan', raterName, createdAt: 1, createdBy: 'pc@example.com' };
    d.responses['demo|' + id] = q ? { answers: { q1: q, q2: q, q3: 'na', q4: q, q5: q, q6: i === 2 ? 'yes' : 'no' }, comments: { ...(c1 ? { c1 } : {}), ...(i === 2 ? { c3: 'Left a handover unfinished.' } : {}) }, declined: false, submittedAt: 2 }
      : { answers: {}, comments: {}, declined: true, reason: 'Did not work together', submittedAt: 2 };
  });
});
await page.goto(BASE + 'ccc/?demo=admin#staff/demo');
await page.getByRole('link', { name: 'Open the CCC report' }).click();
await page.getByRole('heading', { name: 'CCC report: CCC round (demo)' }).waitFor();
const ovRow = page.locator('.cc-table tbody tr', { hasText: 'Aiden Tan' });
assert.match(await ovRow.textContent(), /Aiden Tan5413\.001/, 'invited 5, answered 4, declined 1, mean 3.00, 1 concern');
await axe('round report'); await shot('10-round-report');
await page.getByRole('link', { name: 'Aiden Tan' }).click();
await page.getByRole('heading', { name: 'Multisource feedback: Aiden Tan' }).waitFor();
const rep = await page.textContent('main');
assert.match(rep, /5 raters invited · 4 answered · 1 declined · 0 waiting/);
assert.match(rep, /Senior doctors and others \(4\)/, 'the one peer folds into the seniors');
assert.match(rep, /Steady under pressure\./);
assert.match(rep, /Left a handover unfinished\./, 'concerns on screen for PDs and PCs');
for (const name of ['Dr Rater One', 'Dr Rater Two', 'Dr Rater Three', 'Peer Rater', 'Allied Rater', 'Did not work together']) assert.ok(!rep.includes(name), `no rater names or reasons on the report (${name})`);
assert.equal(await page.locator('.cc-table tbody tr').count(), 6, 'five items and the total');
await axe('resident report'); await shot('11-resident-report');
// print: no app bar or buttons; concerns only when ticked
await page.emulateMedia({ media: 'print' });
assert.equal(await page.locator('header.e-appbar').isVisible(), false);
assert.equal(await page.getByRole('button', { name: 'Print or save as PDF' }).isVisible(), false);
assert.equal(await page.locator('section.cc-concern').isVisible(), false, 'concerns are left off paper by default');
await page.emulateMedia({ media: 'screen' });
await page.getByLabel('Include concerns when printing').check();
await page.emulateMedia({ media: 'print' });
assert.equal(await page.locator('section.cc-concern').isVisible(), true);
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '12-print.png'), fullPage: true });
await page.emulateMedia({ media: 'screen' });
await page.getByLabel('Include concerns when printing').uncheck();
// raw answers, with names, for PDs and PCs
await page.goto(BASE + 'ccc/?demo=admin#staff/demo/aiden.tan%40example.com/answers');
await page.getByRole('heading', { name: 'Raters’ answers: Aiden Tan' }).waitFor();
const raw = await page.textContent('main');
assert.match(raw, /Dr Rater One/); assert.match(raw, /Reason: Did not work together/); assert.match(raw, /4 Above expectations/);
assert.equal(await page.locator('main section.cc-card').count(), 5);
await axe('raw answers');
// the clean-up three years after closing: the summary is saved, then the answers and links go
await setStore(() => { d.rounds.demo.status = 'closed'; d.rounds.demo.closedAt = Date.now() - 1096 * 86400000; });
await page.goto(BASE + 'ccc/?demo=admin#staff');
await page.reload();
await page.getByText(/Deleted 2 nominee lists and saved 1 CCC summary and deleted the raters’ answers from rounds closed more than three years ago/).waitFor();
st = await store();
assert.deepEqual([Object.keys(st.invites).length, Object.keys(st.responses).length], [0, 0], 'answers and links deleted');
const saved = st.reports['demo|aiden.tan@example.com'];
assert.ok(saved && saved.savedAt > 0, 'summary saved');
assert.ok(!JSON.stringify(saved).includes('Rater'), 'the saved summary has no rater names');
await page.goto(BASE + 'ccc/?demo=admin#staff/demo/aiden.tan%40example.com/report');
await page.getByRole('heading', { name: 'Multisource feedback: Aiden Tan' }).waitFor();
assert.match(await page.textContent('main'), /Summary saved .*when the raters’ answers were deleted/);
assert.match(await page.textContent('main'), /Steady under pressure\./);
await page.goto(BASE + 'ccc/?demo=admin#staff/demo/report');
await page.locator('.cc-table tbody tr', { hasText: 'Aiden Tan' }).waitFor();

// 16. A resident does not see the coordinators' view, even by typing the address
await page.evaluate(() => localStorage.removeItem('ccc-demo-store'));
await page.goto(BASE + 'ccc/?demo');
await page.locator('main h2', { hasText: 'CCC round (demo)' }).waitFor();
assert.equal(await page.getByRole('link', { name: /Coordinators/ }).count(), 0);
await page.goto(BASE + 'ccc/?demo#staff');
await page.locator('main h2', { hasText: 'CCC round (demo)' }).waitFor();
assert.equal(await page.getByRole('heading', { name: 'Rounds' }).count(), 0);

// 17. The demo's landing page (/ccc/demo/): four ways in, each opening the demo as that person; the ready-made rater
// link brings four made-up answers, so Bea Lim's CCC report has figures
await page.evaluate(() => localStorage.removeItem('ccc-demo-store'));
await page.goto(BASE + 'ccc/demo/');
await page.getByRole('heading', { name: 'APMES CCC replaces the Google Form' }).waitFor();
await axe('demo landing');
for (const name of ['Try it as a resident', 'Try it as a coordinator', 'Try it as a nominee', 'Open a CCC report']) await page.getByRole('link', { name }).waitFor();
await page.getByRole('link', { name: 'Try it as a nominee' }).click();
await page.getByRole('heading', { name: 'Feedback for Bea Lim' }).waitFor();
await page.goto(BASE + 'ccc/demo/');
await page.getByRole('link', { name: 'Open a CCC report' }).click();
await page.getByRole('heading', { name: 'Multisource feedback: Bea Lim' }).waitFor();
assert.match(await page.textContent('main'), /5 raters invited · 4 answered · 0 declined · 1 waiting/);
await page.goto(BASE + 'ccc/demo/');
await page.getByRole('button', { name: 'Start the demo again' }).click();
assert.equal(await page.evaluate(() => localStorage.getItem('ccc-demo-store')), null, 'the reset clears the demo store');

assert.deepEqual(outside, [], 'the demo reaches nothing outside the site');
assert.deepEqual(errors, [], 'no console errors');
await b.close();
console.log('ccc e2e: all checks passed');
