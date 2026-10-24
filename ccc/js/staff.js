// APMES CCC, the coordinators' view: PDs, Admin staff and programme coordinators (PCs) open and close rounds, see who has
// sent, read each resident's projects and nominees, mark the nominees, export the lists, and invite each Checked nominee to
// answer through a one-time link (/ccc/rate/). The app does not send mail: "Invite" makes the link and opens the
// coordinator's own mail app with the text and link filled in (edit it there); reminders work the same way. PDs and PCs
// also see the CCC report (anonymised summary per resident, round overview, print to PDF) and each rater's raw answers.
// Everything shown comes from residents' own typing, so it is only ever put on the page as text.

import { S, h, fill, toast, cloud, modal, confirmBox, empty, errText, row, download, avatar } from '../../evals/js/ui-core.js';
import {
  GROUPS, GROUP, LISTS, MARKS, PURGE_TEXT, cleanEntry, cleanNominees, markLabel, roundId, cleanRoundInput, purgeAt,
  roster, rosterCounts, nomineesCSV, projectsCSV, emailList, monthText, dayText,
  invitable, rateLink, raterRows, raterCounts, notDoneEmails, inviteMailto, reminderMailto, RATER_LABEL,
  summarise, invitesOf, invitedResidents, fromReport, overviewRows, meanText, SCALE_TEXT, answerLines, raterStatus,
} from './model.js';
import { DRAFT } from './msf-form.js';
import * as store from './store.js';

const lc = s => String(s || '').trim().toLowerCase();
const when = t => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const chip = (kind, text) => h('span', { class: `a-pill ${kind === 'ok' ? 'a-pill--ok' : kind === 'warn' ? 'a-pill--warn' : kind === 'bad' ? 'a-pill--danger' : ''} e-chip e-chip--${kind === 'ok' ? 'submitted' : kind === 'warn' ? 'in-progress' : kind === 'bad' ? 'declined' : 'draft'}` }, text);
const statusChip = r => (r.status === 'open' ? chip('ok', 'Open') : chip('draft', 'Closed'));
const raterChip = s => chip(s === 'done' ? 'ok' : s === 'declined' ? 'bad' : s === 'invited' ? 'warn' : 'draft', RATER_LABEL[s]);
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const raterText = c => c.invited ? `${c.invited} invited · ${c.done} done${c.declined ? ` · ${c.declined} declined` : ''}` : '';
// open a mailto: link the way a tap on it would (the mail app opens; nothing is sent by the app)
const openMail = href => { const a = h('a', { href, hidden: true }); document.body.append(a); a.click(); a.remove(); };
const copy = async (text, done, none) => {
  if (!text) { toast(none); return; }
  try { await navigator.clipboard.writeText(text); toast(done); } catch { toast('Couldn’t copy.'); }
};

let rounds = [];
let purged = false;   // the clean-up of old nominees runs once per visit

// ctx: { app, header, go }. parts: the hash after #staff, e.g. [], ['r2026-10'], ['r2026-10', 'amy@x.com'].
export async function staffScreen(parts, ctx) {
  const { app, header } = ctx;
  fill(app, h('p', { class: 'e-loading' }, 'Loading…'));
  try { rounds = await store.listRounds(); } catch (e) { return fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load the rounds: ' + errText(e))); }
  if (!purged) {
    purged = true;
    try {
      const { lists, reports } = await store.purgeExpired(rounds);
      const said = [lists ? `Deleted ${lists} nominee list${lists === 1 ? '' : 's'}` : '', reports ? `${lists ? 'saved' : 'Saved'} ${reports} CCC summar${reports === 1 ? 'y' : 'ies'} and deleted the raters’ answers` : ''].filter(Boolean).join(' and ');
      if (said) toast(`${said} from rounds closed more than ${PURGE_TEXT} ago.`);
    }
    catch (e) { console.warn('Clean-up of old nominees failed', e); }
  }
  const round = rounds.find(r => r.round === decodeURIComponent(parts[0] || ''));
  if (!round) { header('Coordinators', { back: false }); return roundsScreen(ctx); }
  if (parts[1] === 'report') return roundReport(round, ctx);
  const email = parts[1] ? lc(decodeURIComponent(parts[1])) : '';
  if (email && parts[2] === 'report') return residentReport(round, email, ctx);
  if (email && parts[2] === 'answers') return rawAnswers(round, email, ctx);
  return email ? residentScreen(round, email, ctx) : roundScreen(round, ctx);
}

// ---------- the rounds ----------

function roundsScreen({ app, go }) {
  const newRound = () => {
    const now = new Date();
    const title = h('input', { class: 'e-input', value: `CCC round, ${now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, maxlength: 200, autocomplete: 'off' });
    const due = h('input', { class: 'e-input', type: 'date' });
    const msg = h('p', { class: 'e-alert', hidden: true, role: 'alert' });
    const m = modal('Open a new round', h('form', { onsubmit: async e => {
      e.preventDefault();
      const c = cleanRoundInput({ title: title.value, deadline: due.value });
      if (!c) { msg.hidden = false; msg.textContent = 'Give the round a name.'; return; }
      try { const r = await store.saveRound({ round: roundId(rounds.map(x => x.round)), ...c }); m.close(); toast('Round opened. Residents can see it now.'); go('#staff/' + encodeURIComponent(r.round)); }
      catch (err) { msg.hidden = false; msg.textContent = 'Couldn’t open it. ' + errText(err); }
    } },
      h('label', { class: 'e-label' }, 'Name', title), h('label', { class: 'e-label' }, 'Send by (optional)', due), msg,
      h('p', { class: 'e-hint' }, 'Residents see the open round the next time they open this page. Only one round should be open at a time.'),
      h('div', { class: 'e-actions' }, h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'a-btn', type: 'submit' }, 'Open the round'))));
  };
  const open = rounds.filter(r => r.status === 'open').length;
  fill(app, h('div', { class: 'e-stack cc-col' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Rounds'),
      h('p', { class: 'e-small' }, 'One round for each CCC meeting. Residents fill in their projects and feedback nominees; you see who has sent, check the nominees and email them.'),
      open > 1 ? h('p', { class: 'e-warn-note' }, `${open} rounds are open. Residents see only the newest open one.`) : null,
      h('div', { class: 'e-actions e-actions--start' }, h('button', { class: 'a-btn', type: 'button', onclick: newRound }, 'Open a new round'))),
    rounds.length ? h('div', { class: 'e-card e-card--flush' }, h('div', { class: 'e-list' }, rounds.map(r => row({
      name: r.title, title: r.title, meta: [r.deadline ? `Send by ${dayText(r.deadline)}` : '', purgeAt(r) ? `Nominees deleted ${when(purgeAt(r))}` : ''].filter(Boolean).join(' · ') || ' ',
      chip: statusChip(r), onclick: () => go('#staff/' + encodeURIComponent(r.round)) }))))
      : empty('No rounds yet', 'Open the first round to let residents start.')));
}

// ---------- one round ----------

async function roundScreen(round, ctx) {
  const { app, header, go } = ctx;
  header(round.title, { back: true, to: '#staff' });
  let residents = [], entries = {}, msfs = {}, reviews = {}, invites = {}, responses = null;
  try {
    [entries, msfs, reviews, invites, responses] = await Promise.all([store.listEntries(round.round), store.listNominees(round.round), store.listReviews(round.round), store.listInvites(round.round), store.listResponses(round.round)]);
    try { residents = await cloud.listResidents(); } catch (e) { console.warn('Resident list unavailable', e); }
  } catch (e) { return fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load this round: ' + errText(e))); }
  const rows = roster(residents, entries, msfs, reviews);
  const sums = rosterCounts(rows);
  const raters = Object.fromEntries(rows.map(r => [r.email, raterRows(r.email, msfs[r.email]?.nominees, reviews[r.email]?.marks, invites, responses)]));
  const allRaters = Object.values(raters).flat();
  const rc = raterCounts(allRaters);
  const items = rows.filter(r => r.sent).map(r => ({ resident: { name: r.name, email: r.email }, entry: entries[r.email], nominees: cleanNominees(msfs[r.email]?.nominees), marks: reviews[r.email]?.marks || {} }));
  let filter = 'all';
  const list = h('div', { class: 'e-list' });
  const draw = () => {
    const shown = rows.filter(r => filter === 'all' || (filter === 'unsent' ? !r.sent : r.sent && r.marks.todo > 0));
    fill(list, shown.length ? shown.map(r => row({
      name: r.name, title: r.name, meta: r.sent ? `${r.projects ? `${r.projects} project${r.projects === 1 ? '' : 's'}` : r.noProjects ? 'No projects' : 'No projects listed'} · ${r.nominees} nominee${r.nominees === 1 ? '' : 's'}${raterCounts(raters[r.email]).invited ? ' · ' + raterText(raterCounts(raters[r.email])) : ''}${r.extra ? ' · not on the resident list' : ''}` : 'Has not sent yet',
      chip: !r.sent ? chip('bad', 'Not sent') : r.marks.todo ? chip('warn', `${r.marks.todo} to check`) : r.nominees ? chip('ok', 'All checked') : chip('draft', 'No nominees'),
      onclick: () => go(`#staff/${encodeURIComponent(round.round)}/${encodeURIComponent(r.email)}`) }))
      : [h('p', { class: 'e-small', style: 'padding:12px 16px;margin:0' }, filter === 'unsent' ? 'Everyone has sent.' : 'Nothing to show.')]);
  };
  const seg = h('div', { class: 'a-seg e-segment', role: 'group', 'aria-label': 'Show' }, [['all', 'Everyone'], ['unsent', 'Not sent'], ['todo', 'To check']].map(([id, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(id === filter), onclick: e => { filter = id; seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, label)));
  draw();

  const setStatus = async status => {
    if (status === 'closed' && !await confirmBox('Close this round?', `Residents can no longer change what they sent. Nominees' contact details are deleted ${PURGE_TEXT} after you close it.`, 'Close the round')) return;
    try { await store.saveRound({ round: round.round, title: round.title, deadline: round.deadline, status, closedAt: status === 'closed' ? Date.now() : 0 }); toast(status === 'closed' ? 'Round closed' : 'Round reopened'); ctx.render(); }
    catch (e) { toast('Couldn’t change it. ' + errText(e)); }
  };
  const edit = () => {
    const title = h('input', { class: 'e-input', value: round.title, maxlength: 200 });
    const due = h('input', { class: 'e-input', type: 'date', value: round.deadline || '' });
    const m = modal('Edit the round', h('form', { onsubmit: async e => {
      e.preventDefault();
      const c = cleanRoundInput({ title: title.value, deadline: due.value });
      if (!c) { toast('Give the round a name.'); return; }
      try { await store.saveRound({ round: round.round, ...c, status: round.status, closedAt: round.closedAt }); m.close(); ctx.render(); } catch (err) { toast('Couldn’t save. ' + errText(err)); }
    } }, h('label', { class: 'e-label' }, 'Name', title), h('label', { class: 'e-label' }, 'Send by', due),
      h('div', { class: 'e-actions' }, h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'a-btn', type: 'submit' }, 'Save'))));
  };
  const slug = round.round.replace(/[^A-Za-z0-9_-]/g, '');
  const copyUnsent = async () => {
    const list2 = emailList(rows.filter(r => !r.sent).map(r => r.email));
    if (!list2) { toast('Everyone has sent.'); return; }
    try { await navigator.clipboard.writeText(list2); toast('Copied the emails of residents who have not sent'); } catch { toast('Couldn’t copy.'); }
  };
  const wipe = async () => {
    const n = Object.keys(msfs).length;
    if (!n || !await confirmBox('Delete all nominees now?', `This deletes the nominee lists of ${n} resident${n === 1 ? '' : 's'} for this round, with your marks. Projects are kept. It can’t be undone.`, 'Delete', true)) return;
    try { for (const email of Object.keys(msfs)) await store.deleteNominees(round.round, email); toast('Nominees deleted'); ctx.render(); } catch (e) { toast('Couldn’t delete. ' + errText(e)); }
  };
  fill(app, h('div', { class: 'e-stack cc-col' },
    h('section', { class: 'e-card' },
      h('div', { class: 'cc-head' }, h('h2', { class: 'e-h2', style: 'margin:0' }, round.title), statusChip(round)),
      h('p', { class: 'e-small' }, `${sums.sent} of ${sums.total} active residents have sent · ${sums.nominees} nominees${sums.toCheck ? ` · ${sums.toCheck} to check` : ''}`),
      rc.invited ? h('p', { class: 'e-small' }, `Raters: ${raterText(rc)}${responses ? '' : ' (only PDs and PCs see who has answered)'}`) : null,
      round.deadline ? h('p', { class: 'e-small' }, `Send by ${dayText(round.deadline)}.`) : null,
      h('p', { class: 'e-hint' }, round.status === 'closed' ? (purgeAt(round) ? `Nominees' contact details are deleted on ${when(purgeAt(round))}.` : 'Closed.') : `Nominees' contact details are deleted ${PURGE_TEXT} after you close the round.`),
      h('div', { class: 'e-actions e-actions--start' },
        round.status === 'open' ? h('button', { class: 'a-btn', type: 'button', onclick: () => setStatus('closed') }, 'Close the round') : h('button', { class: 'a-btn', type: 'button', onclick: () => setStatus('open') }, 'Reopen'),
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: edit }, 'Edit'))),
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'CCC report'),
      responses ? h('p', { class: 'e-small' }, 'The anonymised feedback summary per resident, ready to print or save as PDF. Raters’ names are never on it.')
        : h('p', { class: 'e-small' }, 'Only PDs and PCs see the report and the raters’ answers.'),
      responses ? h('div', { class: 'e-actions e-actions--start' }, h('a', { class: 'a-btn', href: `#staff/${encodeURIComponent(round.round)}/report` }, 'Open the CCC report')) : null),
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Export'),
      h('p', { class: 'e-small' }, 'Spreadsheets open these directly. Text that could run as a formula is made safe.'),
      h('div', { class: 'e-actions e-actions--start' },
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', disabled: !items.some(i => i.nominees.length), onclick: () => download(`ccc-nominees-${slug}.csv`, new Blob([nomineesCSV(round, items)], { type: 'text/csv;charset=utf-8' })) }, 'Nominees (CSV)'),
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', disabled: !items.length, onclick: () => download(`ccc-projects-${slug}.csv`, new Blob([projectsCSV(round, items)], { type: 'text/csv;charset=utf-8' })) }, 'Projects (CSV)'),
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: copyUnsent }, 'Copy emails of residents not sent'),
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', disabled: !rc.invited, onclick: () => copy(notDoneEmails(allRaters), 'Copied the emails of raters who have not answered', responses ? 'Every invited rater has answered.' : 'No invited raters with an email.') }, 'Copy emails of raters not done'),
        h('button', { class: 'a-btn a-btn--danger a-btn--tinted', type: 'button', disabled: !Object.keys(msfs).length, onclick: wipe }, 'Delete nominees now'))),
    h('section', { class: 'e-card e-card--flush' }, h('div', { style: 'padding:12px 16px 0' }, seg), list)));
  window.scrollTo(0, 0);
}

// ---------- one resident ----------

async function residentScreen(round, email, ctx) {
  const { app, header } = ctx;
  let entry = null, msf = null, review = null, invites = {}, responses = null;
  try {
    const [es, ms, rs, iv, rp] = await Promise.all([store.listEntries(round.round), store.listNominees(round.round), store.listReviews(round.round), store.listInvites(round.round), store.listResponses(round.round)]);
    [entry, msf, review, invites, responses] = [es[email], ms[email], rs[email], iv, rp];
  } catch (e) { return fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load this resident: ' + errText(e))); }
  const name = entry?.name || msf?.name || email;
  header(name, { back: true, to: '#staff/' + encodeURIComponent(round.round) });
  if (!entry && !msf) return fill(app, h('div', { class: 'e-stack cc-col' }, empty(`${name} has not sent anything yet`, `You can copy the emails of everyone who has not sent from the round page: ${email}`)));
  const e = cleanEntry(entry);
  const nominees = cleanNominees(msf?.nominees);
  const marks = { ...(review?.marks || {}) };
  const setMark = async (id, mark, rerender) => {
    if (mark) marks[id] = mark; else delete marks[id];
    try { await store.saveMarks(round.round, email, marks, review?.marks); rerender?.(); } catch (err) { toast('Couldn’t save the mark. ' + errText(err)); }
  };
  // links point at this host (beta's at beta); the demo's stay in the demo
  const urlOf = inv => (cloud.demo ? `${location.origin}/ccc/rate/?demo#${round.round}/${inv.id}` : rateLink(round.round, inv.id, location.origin));
  let busy = false;
  const invite = async n => {
    if (busy) return;
    busy = true;
    try {
      const inv = await store.createInvite(round.round, { email, name }, n, S.user?.email);
      invites[inv.id] = { ...inv, createdAt: Date.now() };
      marks[n.id] = 'sent';
      await store.saveMarks(round.round, email, marks, review?.marks);
      drawNominees();
      // the link only works once the server has it: offline, it is kept on this device and the mail waits
      if (!inv.sent) { toast(`Link saved on this device for ${n.name || n.email}. Don’t email it yet: it works once the chip says Synced.`); return; }
      openMail(inviteMailto(n, name, round, urlOf(inv)));
      toast(`Link made for ${n.name || n.email}. Your mail app opens with it; send it from there.`);
    } catch (err) { toast('Couldn’t make the link. ' + errText(err)); }
    finally { busy = false; }
  };
  const btn = (label, onclick, attrs = {}) => h('button', { class: 'a-btn a-btn--sm a-btn--tinted', type: 'button', onclick, ...attrs }, label);
  const nomBox = h('div', { class: 'e-stack' });
  const sumEl = h('p', { class: 'e-small', style: 'margin:0' });
  const drawNominees = () => {
    const rows = raterRows(email, nominees, marks, invites, responses);
    const rc = raterCounts(rows);
    sumEl.textContent = rc.invited ? `Raters: ${raterText(rc)}${responses ? '' : '. Only PDs and PCs see who has answered.'}` : 'No raters invited yet.';
    fill(nomBox, nominees.length ? GROUPS.map(g => {
      const list = rows.filter(r => r.nominee.group === g.id);
      return list.length ? h('section', { class: 'e-card cc-card', 'aria-label': g.label },
        h('div', { class: 'cc-head' }, h('h3', {}, g.label), h('span', { class: 'cc-count' }, `${list.length} of ${g.max}`)),
        list.map(({ nominee: n, invite: inv, status }) => {
          const who = n.name || n.email;
          return h('div', { class: 'cc-card' },
            h('div', { class: 'cc-head' }, h('div', {}, h('b', {}, n.name || '(no name)'), n.email ? h('span', { class: 'e-small' }, ` · ${n.email}`) : null, h('div', { class: 'e-small' }, markLabel(marks[n.id]))), raterChip(status)),
            h('div', { class: 'e-actions e-actions--start', role: 'group', 'aria-label': `Status for ${who}` },
              MARKS.filter(([k]) => k !== 'sent').map(([k, label]) => h('button', { class: `a-btn a-btn--sm ${marks[n.id] === k ? '' : 'a-btn--tinted'}`, type: 'button', 'aria-pressed': String(marks[n.id] === k),
                onclick: () => setMark(n.id, marks[n.id] === k ? '' : k, drawNominees) }, label))),
            !inv && round.status === 'open' && invitable(marks[n.id]) ? h('div', { class: 'e-actions e-actions--start' },
              h('button', { class: 'a-btn a-btn--sm', type: 'button', 'aria-label': `Invite ${who}`, onclick: () => invite(n) }, 'Invite')) : null,
            !inv && round.status === 'open' && !invitable(marks[n.id]) ? h('p', { class: 'e-hint', style: 'margin:0' }, 'Mark Checked to invite.') : null,
            inv ? h('div', { class: 'e-actions e-actions--start', role: 'group', 'aria-label': `Link for ${who}` },
              h('a', { class: 'a-btn a-btn--sm a-btn--tinted', href: inviteMailto(n, name, round, urlOf(inv)), 'aria-label': `Email the link to ${who}` }, 'Email the link'),
              status === 'invited' ? h('a', { class: 'a-btn a-btn--sm a-btn--tinted', href: reminderMailto(n, name, round, urlOf(inv)), 'aria-label': `Remind ${who}` }, 'Reminder') : null,
              btn('Copy link', () => copy(urlOf(inv), 'Link copied'), { 'aria-label': `Copy the link for ${who}` })) : null);
        })) : null;
    }) : h('p', { class: 'e-small' }, 'No nominees.'));
  };
  drawNominees();
  const wipe = async () => {
    if (!await confirmBox(`Delete ${name}’s nominees?`, 'Their nominee list and your marks on it are deleted for this round. Projects are kept. It can’t be undone.', 'Delete', true)) return;
    try { await store.deleteNominees(round.round, email); toast('Nominees deleted'); ctx.go('#staff/' + encodeURIComponent(round.round)); } catch (err) { toast('Couldn’t delete. ' + errText(err)); }
  };
  fill(app, h('div', { class: 'e-stack cc-col' },
    h('section', { class: 'e-card' },
      h('div', { class: 'cc-head' }, h('div', { style: 'display:flex;gap:10px;align-items:center' }, avatar(name), h('div', {}, h('h2', { class: 'e-h2', style: 'margin:0' }, name), h('div', { class: 'e-small' }, email))), round.status === 'open' ? chip('ok', 'Round open') : chip('draft', 'Round closed')),
      entry?.updatedAt || msf?.updatedAt ? h('p', { class: 'e-small' }, `Sent ${when(Math.max(entry?.updatedAt || 0, msf?.updatedAt || 0))}.`) : null),
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Scholarly projects'),
      e.projects.length ? h('ul', { class: 'cc-list' }, e.projects.map(p => h('li', {}, h('b', {}, p.title), ` · ${p.status}`, p.supervisor ? ` · ${p.supervisor}` : '', p.start || p.end ? ` · ${monthText(p.start) || '?'} to ${monthText(p.end) || 'ongoing'}` : '', p.note ? h('div', { class: 'e-small' }, p.note) : null)))
        : h('p', { class: 'e-small' }, e.noProjects ? 'None to report.' : 'None listed.'),
      LISTS.map(l => e[l.key].length ? h('div', {}, h('h3', { style: 'margin:12px 0 4px;font-size:1rem' }, l.label), h('ul', { class: 'cc-list' }, e[l.key].map(x => h('li', {}, x)))) : null)),
    responses ? h('div', { class: 'e-actions e-actions--start' },
      h('a', { class: 'a-btn a-btn--tinted', href: `#staff/${encodeURIComponent(round.round)}/${encodeURIComponent(email)}/report` }, 'CCC report'),
      h('a', { class: 'a-btn a-btn--tinted', href: `#staff/${encodeURIComponent(round.round)}/${encodeURIComponent(email)}/answers` }, 'Raters’ answers')) : null,
    h('h2', { class: 'e-h2', style: 'margin:4px 0' }, `Feedback nominees (${nominees.length})`),
    h('p', { class: 'e-small', style: 'margin:0' }, 'Mark each nominee once you have checked them. “Invite” makes their one-time link and opens your mail app with the message and link filled in; send it from there.'),
    sumEl,
    h('div', { class: 'e-actions e-actions--start' }, btn('Copy emails of raters not done', () => copy(notDoneEmails(raterRows(email, nominees, marks, invites, responses)), 'Copied the emails of raters who have not answered', 'No invited raters waiting with an email.'))),
    nomBox,
    nominees.length ? h('div', { class: 'e-actions e-actions--start' }, h('button', { class: 'a-btn a-btn--danger a-btn--tinted', type: 'button', onclick: wipe }, 'Delete these nominees now')) : null));
  window.scrollTo(0, 0);
}

// ---------- the CCC report (PDs and PCs) ----------

// Each resident's summary for a round: worked out from the live answers, or the one saved when they were deleted.
// { ok: false } when this reader may not see answers (Admin staff).
async function summaries(round) {
  const [invites, responses, reports] = await Promise.all([store.listInvites(round.round), store.listResponses(round.round), store.listReports(round.round)]);
  if (!responses) return { ok: false };
  const out = {};
  for (const r of invitedResidents(invites)) {
    const iv = invitesOf(invites, r.email);
    out[r.email] = { name: r.name, saved: false, summary: summarise(Object.fromEntries(Object.keys(iv).filter(id => responses[id]).map(id => [id, responses[id]])), iv), invites: iv };
  }
  for (const [email, d] of Object.entries(reports || {})) if (!out[email]) out[email] = { name: d.name || email, saved: true, summary: fromReport(d), invites: {} };
  return { ok: true, out, invites, responses };
}
const noReport = (app, text) => fill(app, h('div', { class: 'e-stack cc-col' }, empty('Only PDs and PCs see this', text)));
const countsText = c => `${plural(c.invited, 'rater')} invited · ${c.done} answered · ${c.declined} declined · ${c.waiting} waiting`;
// Concerns are for PDs and PCs: on screen always, on paper only when ticked (off by default, on this device).
const printConcernsBox = () => {
  const on = (() => { try { return localStorage.getItem('ccc-print-concerns') === '1'; } catch { return false; } })();
  document.body.classList.toggle('cc-print-concerns', on);
  const box = h('input', { type: 'checkbox', id: 'cc-pc', checked: on, onchange: e => { document.body.classList.toggle('cc-print-concerns', e.target.checked); try { localStorage.setItem('ccc-print-concerns', e.target.checked ? '1' : '0'); } catch {} } });
  return h('label', { class: 'e-check', for: 'cc-pc' }, box, ' Include concerns when printing');
};
const printBar = () => h('div', { class: 'e-actions e-actions--start cc-noprint' },
  h('button', { class: 'a-btn', type: 'button', onclick: () => window.print() }, 'Print or save as PDF'), printConcernsBox());
const draftNote = () => (DRAFT ? h('p', { class: 'e-hint' }, 'Draft questions: these are made up until the programme’s own MSF form is in the app.') : null);

function reportBody(round, name, s, saved) {
  const g = s.summary.groups;
  const head = h('section', { class: 'e-card cc-report-head' },
    h('h2', { class: 'e-h2', style: 'margin:0' }, `Multisource feedback: ${name}`),
    h('p', { class: 'e-small' }, `${round.title} · ${countsText(s.summary.counts)}`),
    saved ? h('p', { class: 'e-hint' }, `Summary saved ${when(s.summary.savedAt)}, when the raters’ answers were deleted.`) : null,
    h('p', { class: 'e-hint' }, `Anonymised: a rater group is shown on its own only with ${s.summary.minGroup} or more answers; smaller groups are folded together. Comments are in random order, without names.`));
  if (!s.summary.enough) return [head, h('section', { class: 'e-card' }, h('p', { class: 'e-small', style: 'margin:0' }, `Fewer than ${s.summary.minGroup} raters have answered, so only the counts are shown.`)), concernsCard(s.summary.concerns)];
  const cell = c => h('td', { class: 'cc-num' }, meanText(c?.mean), c?.n ? h('span', { class: 'cc-n' }, ` (${c.n})`) : null);
  const table = h('div', { class: 'cc-scroll' }, h('table', { class: 'cc-table' },
    h('caption', {}, 'Mean rating per item (number of ratings)'),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Item'), h('th', { scope: 'col' }, 'All raters'), g.map(x => h('th', { scope: 'col' }, `${x.label} (${x.n})`)))),
    h('tbody', {},
      s.summary.items.map(it => h('tr', {}, h('th', { scope: 'row' }, it.title, it.overall.notObserved ? h('span', { class: 'cc-n' }, ` · ${it.overall.notObserved} not observed`) : null), cell(it.overall), g.map(x => cell(it.groups[x.id])))),
      h('tr', { class: 'cc-total' }, h('th', { scope: 'row' }, 'All items'), cell(s.summary.overall), g.map(() => h('td', {}))))));
  return [head,
    h('section', { class: 'e-card' }, h('h3', { class: 'cc-h3' }, 'Ratings'), table, h('p', { class: 'e-hint' }, `Scale: ${SCALE_TEXT}. “Not observed” is left out of the means.`)),
    h('section', { class: 'e-card' }, h('h3', { class: 'cc-h3' }, 'Comments'),
      s.summary.comments.map(c => h('div', {}, h('h4', { class: 'cc-h4' }, c.title), c.texts.length ? h('ul', { class: 'cc-list' }, c.texts.map(t => h('li', { class: 'cc-quote' }, t))) : h('p', { class: 'e-small' }, 'None.')))),
    concernsCard(s.summary.concerns)];
}
const concernsCard = c => h('section', { class: 'e-card cc-concern' },
  h('h3', { class: 'cc-h3' }, 'Concerns about conduct or patient safety'),
  h('p', { class: 'e-hint' }, 'For the programme directors and coordinators.'),
  c.yes ? [h('p', { class: 'e-small' }, `${plural(c.yes, 'rater')} raised a concern.`), c.texts.length ? h('ul', { class: 'cc-list' }, c.texts.map(t => h('li', { class: 'cc-quote' }, t))) : null]
    : h('p', { class: 'e-small' }, 'None raised.'));

async function residentReport(round, email, ctx) {
  const { app, header } = ctx;
  let r;
  try { r = await summaries(round); } catch (e) { return fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load the report: ' + errText(e))); }
  header('CCC report', { back: true, to: `#staff/${encodeURIComponent(round.round)}/${encodeURIComponent(email)}` });
  if (!r.ok) return noReport(app, 'The CCC report is built from the raters’ answers, which only PDs and PCs may read.');
  const s = r.out[email];
  if (!s) return fill(app, h('div', { class: 'e-stack cc-col' }, empty('No raters yet', 'Invite this resident’s checked nominees first; the report fills in as they answer.')));
  fill(app, h('div', { class: 'e-stack cc-col cc-report' }, printBar(), reportBody(round, s.name, s, s.saved), draftNote()));
  window.scrollTo(0, 0);
}

async function roundReport(round, ctx) {
  const { app, header } = ctx;
  let r;
  try { r = await summaries(round); } catch (e) { return fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load the report: ' + errText(e))); }
  header('CCC report', { back: true, to: '#staff/' + encodeURIComponent(round.round) });
  if (!r.ok) return noReport(app, 'The CCC report is built from the raters’ answers, which only PDs and PCs may read.');
  const rows = overviewRows(r.out);
  const link = row => `#staff/${encodeURIComponent(round.round)}/${encodeURIComponent(row.email)}/report`;
  const table = rows.length ? h('div', { class: 'cc-scroll' }, h('table', { class: 'cc-table' },
    h('caption', {}, 'Raters per resident and the mean of all ratings'),
    h('thead', {}, h('tr', {}, ['Resident', 'Invited', 'Answered', 'Declined', 'Mean (1-4)'].map(t => h('th', { scope: 'col' }, t)), h('th', { scope: 'col', class: 'cc-concern' }, 'Concerns'))),
    h('tbody', {}, rows.map(x => h('tr', {},
      h('th', { scope: 'row' }, h('a', { href: link(x) }, x.name)),
      h('td', { class: 'cc-num' }, String(x.invited)), h('td', { class: 'cc-num' }, String(x.done)), h('td', { class: 'cc-num' }, String(x.declined)),
      h('td', { class: 'cc-num' }, x.enough ? meanText(x.mean) : 'too few'), h('td', { class: 'cc-num cc-concern' }, x.concerns ? String(x.concerns) : '–')))))) : null;
  // the whole round on paper: the overview, then each resident's report on its own page
  const printAll = () => {
    const all = h('div', { class: 'cc-print-all' }, rows.map(x => h('div', { class: 'cc-page' }, reportBody(round, x.name, r.out[x.email], x.saved))));
    app.querySelector('.cc-report').append(all);
    const done = () => { all.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  fill(app, h('div', { class: 'e-stack cc-col cc-report' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin:0' }, `CCC report: ${round.title}`),
      h('p', { class: 'e-small' }, rows.length ? `${plural(rows.length, 'resident')} with raters. Open a name for the full summary.` : 'No raters invited in this round yet.'),
      h('p', { class: 'e-hint' }, 'A mean shows once 3 or more raters have answered.')),
    rows.length ? h('div', { class: 'e-actions e-actions--start cc-noprint' },
      h('button', { class: 'a-btn', type: 'button', onclick: () => window.print() }, 'Print this table'),
      h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: printAll }, 'Print every resident’s report'),
      printConcernsBox()) : null,
    table ? h('section', { class: 'e-card' }, table) : null,
    draftNote()));
  window.scrollTo(0, 0);
}

// ---------- raw answers (PDs and PCs; names shown, so never part of the report) ----------

async function rawAnswers(round, email, ctx) {
  const { app, header } = ctx;
  let r;
  try { r = await summaries(round); } catch (e) { return fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load the answers: ' + errText(e))); }
  header('Raters’ answers', { back: true, to: `#staff/${encodeURIComponent(round.round)}/${encodeURIComponent(email)}` });
  if (!r.ok) return noReport(app, 'Only PDs and PCs may read the raters’ answers.');
  const s = r.out[email];
  const list = Object.entries(s?.invites || {}).map(([id, inv]) => ({ id, inv, resp: r.responses[id] || null }))
    .sort((a, b) => (b.resp?.submittedAt || 0) - (a.resp?.submittedAt || 0) || String(a.inv.raterName).localeCompare(String(b.inv.raterName)));
  fill(app, h('div', { class: 'e-stack cc-col' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin:0' }, `Raters’ answers: ${s?.name || email}`),
      h('p', { class: 'e-small' }, `${round.title}. With the raters’ names, for PDs and PCs only: never share this page with the resident or print it for the CCC; use the CCC report.`),
      s?.saved ? h('p', { class: 'e-hint' }, `The answers were deleted with the clean-up ${PURGE_TEXT} after the round closed; only the summary is kept.`) : null),
    list.length ? list.map(({ inv, resp }) => {
      const st = raterStatus(inv, resp);
      return h('section', { class: 'e-card cc-card', 'aria-label': inv.raterName },
        h('div', { class: 'cc-head' }, h('div', {}, h('b', {}, inv.raterName), h('div', { class: 'e-small' }, `${GROUP[inv.group]?.one || inv.group}${resp?.submittedAt ? ` · ${when(resp.submittedAt)}` : ''}`)), raterChip(st)),
        st === 'done' ? h('dl', { class: 'cc-dl' }, answerLines(resp).map(l => [h('dt', {}, l.title), h('dd', { class: l.text ? 'cc-quote' : '' }, l.value)])) : null,
        st === 'declined' ? h('p', { class: 'e-small', style: 'margin:0' }, resp.reason ? `Reason: ${resp.reason}` : 'No reason given.') : null);
    }) : s?.saved ? null : empty('No raters yet', 'Invite this resident’s checked nominees first.')));
  window.scrollTo(0, 0);
}
