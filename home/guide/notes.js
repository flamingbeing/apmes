// Notes and "Done" ticks on the entrustment questions (entrustment.html; loaded by guide.js). Pure parts: notes-core.js.
// Signed out: kept on this device (DEVICE). Signed in to the Logbook (same address, so its sign-in is seen here): kept
// in the resident's own Firestore doc logbooks/{email}/guide/entrustment (owner only, logbook/firestore.rules) and a
// copy on the device (ACCOUNT + email) for offline use, also used when the sign-in can't be checked (no signal); notes
// kept while signed out move into the account only when the resident taps "Add them" (a shared device's notes may be
// someone else's). Changes merge per question, newest wins, so two phones never overwrite each other's other answers.
// The Firebase SDK loads only when this browser has signed in to the Logbook before, so the page stays instant.
import * as core from './notes-core.js';

const DEVICE = 'apmes-guide-notes', ACCOUNT = 'apmes-guide-notes:';
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const WAIT = 8000, SAVE_AFTER = 1200;
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter(k => k != null));
  return el;
};
const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null') || {}; } catch { return {}; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('offline')), ms))]);

let state = {}, mode = 'device', email = null, dirty = false, status = '', cloud = null, timer = 0, movedIn = false, offer = 0, why = '';
const qs = new Map();   // key -> { box, check, note, btn, item }

// ---- the questions on the page ----
// each item's "Suggested entrustment questions" list (one per list entry), else its "Entrustment question N." lines
// (EPA 7 cases), else the item as a whole
const plain = el => { const c = el.cloneNode(true); for (const x of $$('ul, ol, .g-q', c)) x.remove(); return c.textContent.replace(/\s+/g, ' ').trim(); };
function questionsOf(item) {
  const found = [];
  for (const s of $$('p > strong:first-child', item)) {
    const p = s.parentElement, t = s.textContent.trim();
    if (/^Suggested entrustment (questions|discussion points)/i.test(t)) {
      const list = p.nextElementSibling;
      if (list && /^(OL|UL)$/.test(list.tagName)) found.push(...[...list.children].filter(li => li.tagName === 'LI'));
    } else if (/^Entrustment question \d+\./i.test(t)) found.push(p);
  }
  found.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return found;
}
const titleOf = item => { const c = $('summary', item).cloneNode(true); for (const x of $$('.g-tool, .g-item-epa', c)) x.remove(); return c.textContent.replace(/\s+/g, ' ').trim(); };

function groups() {
  return $$('.g-panel').map(p => ({
    label: $('.g-panel-title', p).firstChild.textContent.trim(),
    items: $$('.g-item', p).map(item => ({ epa: $('.g-item-epa', item).textContent.trim(), title: titleOf(item), qs: [...qs.values()].filter(q => q.item === item).map(q => ({ key: q.key, text: q.text })) })),
  }));
}

function build() {
  for (const item of $$('.g-item')) {
    const found = questionsOf(item), doc = $(':scope > .g-doc', item);
    const list = found.length ? found.map((el, n) => ({ el, key: `${item.id}~${n}`, text: plain(el), n: n + 1 })) : [{ el: null, key: `${item.id}~all`, text: titleOf(item), n: 0 }];
    for (const q of list) {
      const what = q.n ? `question ${q.n}` : 'this item';
      const check = h('input', { type: 'checkbox', 'aria-label': `Done: ${what}`, onchange: () => edit(q.key, { d: check.checked }) });
      const note = h('textarea', { class: 'a-field g-q-note', rows: '2', maxlength: String(core.NOTE_MAX), placeholder: 'Notes', 'aria-label': `Notes: ${what}`, hidden: true,
        oninput: () => { grow(note); edit(q.key, { n: note.value }); } });
      const btn = h('button', { type: 'button', class: 'g-q-btn', 'aria-expanded': 'false', onclick: () => {
        const open = note.hidden; note.hidden = !open; btn.setAttribute('aria-expanded', String(open));
        if (open) { grow(note); note.focus(); }
      } }, 'Add note');
      const box = h('div', { class: 'g-q' }, h('label', { class: 'g-q-done' }, check, q.n ? ' Done' : ' Done (whole item)'), btn, note);
      if (!q.el) doc.prepend(box);
      else if (q.el.tagName === 'LI') q.el.append(box);
      else q.el.after(box);
      qs.set(q.key, { ...q, box, check, note, btn, item });
    }
  }
}
const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; };

function paint() {
  const byItem = new Map();
  for (const q of qs.values()) {
    const e = state[q.key] || {};
    if (document.activeElement !== q.note) q.note.value = e.n || '';
    q.check.checked = e.d === true;
    const has = !!String(e.n || '').trim();
    if (has && q.note.hidden) { q.note.hidden = false; q.btn.setAttribute('aria-expanded', 'true'); }
    if (!q.note.hidden) grow(q.note);
    q.btn.textContent = has ? 'Note' : 'Add note';
    (q.el || q.box).classList.toggle('g-q-is-done', e.d === true);
    const s = byItem.get(q.item) || { all: 0, done: 0, any: false };
    s.all++; if (e.d === true) s.done++; if (core.touched(e)) s.any = true;
    byItem.set(q.item, s);
  }
  // the item's progress (of the 2 needed), on its summary line (an attribute: the filter rewrites the summary's text)
  for (const [item, s] of byItem) {
    const sum = $('summary', item);
    // at least 2 questions per item (or the one there is) count as covered
    const need = Math.min(2, s.all);
    if (s.any) sum.dataset.prog = s.done >= need ? `✓ ${s.done} done` : `${s.done}/${need}`; else delete sum.dataset.prog;
  }
  paintBar();
}

// ---- edits, saving, syncing ----
function edit(key, patch) {
  const was = state[key] || { d: false, n: '' };
  state = { ...state, [key]: { d: was.d === true, n: was.n || '', ...patch, t: Date.now() } };
  dirty = mode === 'account';
  movedIn = false;
  keep();
  paint();
  if (mode === 'account') { clearTimeout(timer); timer = setTimeout(push, SAVE_AFTER); }
}
const keep = () => mode === 'account' ? write(ACCOUNT + email, { items: state, dirty }) : write(DEVICE, { items: state });

async function push() {
  if (!cloud || !dirty) return;
  status = 'saving'; paintBar();
  try {
    const { fs, ref, db } = cloud, mine = state;
    const merged = await within(fs.runTransaction(db, async tx => {
      const s = await tx.get(ref), m = core.merge(s.exists() ? s.data().items : {}, mine);
      if (core.tooBig(m)) throw Object.assign(new Error('too big'), { code: 'too-big' });
      tx.set(ref, { items: m, updatedAt: Date.now() });
      return m;
    }), WAIT * 2);
    state = core.merge(merged, state);   // edits made while saving stay
    dirty = Object.keys(state).some(k => (state[k].t || 0) > (merged[k]?.t || 0));
    status = 'synced';
    if (dirty) { clearTimeout(timer); timer = setTimeout(push, SAVE_AFTER); }
  } catch (e) {
    // no signal (or slow) waits for the connection; a refusal (rules, size) says so, so it isn't taken for a signal problem
    why = String(e?.code || '');
    status = core.REFUSED.includes(why) ? 'refused' : 'offline';
  }
  keep(); paint();
}

// other devices' changes arrive as they happen; a listener that errors (token refresh, rules landing, network) is
// ended by Firestore, so listen again, waiting longer each time (up to a minute)
let listening = false, retry = 2000;
function listen() {
  if (!cloud || listening) return;
  listening = true;
  cloud.fs.onSnapshot(cloud.ref, s => {
    retry = 2000;
    if (status === 'offline' && !dirty) status = 'synced';
    const theirs = s.exists() ? s.data().items || {} : {};
    state = core.merge(state, theirs);
    keep(); paint();
  }, () => {
    listening = false;
    if (status !== 'refused') status = 'offline';
    paintBar();
    setTimeout(listen, retry); retry = Math.min(retry * 2, 60000);
  });
}

// signed in, or the sign-in can't be checked: the account's copy on this device
function useAccount(who) {
  if (email !== who) {
    email = who;
    const own = read(ACCOUNT + email);
    state = own.items || {};
    dirty = !!own.dirty;
  }
  mode = 'account';
  offer = Object.values(read(DEVICE).items || {}).filter(core.touched).length;
}
// "Add them": this device's signed-out notes join the account
function addDevice() {
  state = core.merge(state, read(DEVICE).items || {});
  try { localStorage.removeItem(DEVICE); } catch { /* blocked */ }
  dirty = true; offer = 0; movedIn = true;
  keep(); paint();
  push();
}

let checking = false;
async function signIn() {
  if (cloud || checking || !core.hasSignIn(localStorage)) return;
  checking = true;
  try { await check(); } finally { checking = false; }
}
async function check() {
  status = 'checking'; paintBar();
  let user, a, fs;
  try {
    const [{ FIREBASE_CONFIG }, app, auth, f] = await within(Promise.all([
      import('/logbook/js/firebase-config.js'), import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
    ]), WAIT);
    fs = f;
    a = app.getApps().length ? app.getApp() : app.initializeApp(FIREBASE_CONFIG);
    user = await within(new Promise(done => { const off = auth.onAuthStateChanged(auth.getAuth(a), u => { off(); done(u); }); }), WAIT);
  } catch {
    // no signal: the one account signed in on this device keeps its notes here until the check works
    const who = core.signedIn(localStorage);
    if (who.length === 1) useAccount(who[0]);
    status = 'offline-signin'; paint(); return;
  }
  if (!user || !user.email || user.emailVerified === false) {
    if (mode === 'account') { mode = 'device'; email = null; state = read(DEVICE).items || {}; dirty = false; offer = 0; }
    status = ''; paint(); return;
  }
  useAccount(String(user.email).trim().toLowerCase());
  keep();
  const db = fs.getFirestore(a), ref = fs.doc(db, 'logbooks', email, 'guide', 'entrustment');
  cloud = { fs, db, ref };
  status = 'synced';
  paint();
  listen();
  if (dirty) push();
}

// ---- the "My notes" bar: what's saved where, and export ----
let bar, line;
function paintBar() {
  if (!line) return;
  const c = core.counts(state);
  const sum = c.done || c.notes ? `${c.done} done · ${c.notes} note${c.notes === 1 ? '' : 's'}. ` : 'Tick questions as you cover them and add notes. ';
  const where = mode === 'account'
    ? { checking: 'Checking your Logbook sign-in…', saving: 'Saving…', offline: 'Saved on this device; syncs with your Logbook when back online.',
        'offline-signin': `Saved on this device; syncs with your Logbook (${email}) when back online.`,
        refused: why === 'too-big' ? 'Saved on this device, but your notes are too long to sync (1 MB in all): shorten some, or export them.'
          : `Saved on this device, but your Logbook didn't accept the change (${why || 'error'}). Export your notes to keep a copy.` }[status]
      || (movedIn ? `Your notes on this device were added to your Logbook account (${email}).` : `Synced with your Logbook (${email}).`)
    : status === 'checking' ? 'Checking your Logbook sign-in…'
      : status === 'offline-signin' ? 'Saved on this device. Your Logbook sign-in needs a connection to sync.'
        : null;
  line.replaceChildren(sum, where || 'Saved on this device only. ', where ? '' : h('a', { href: '/logbook/' }, 'Sign in to the Logbook'), where ? '' : ' to keep them in sync.');
  // notes kept on this device while signed out: maybe someone else's (a shared PC), so only on a tap
  if (mode === 'account' && offer) line.append(' ', `This device also has ${offer} note${offer === 1 ? '' : 's'} or tick${offer === 1 ? '' : 's'} from before you signed in. `,
    h('button', { type: 'button', class: 'g-mine-btn', onclick: addDevice }, 'Add them to my account'));
}

const FILE = 'entrustment-notes';
function save(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function exportAs(kind) {
  const g = groups(), now = new Date();
  if (!core.picked(g, state).length) { line.textContent = 'Nothing to export yet: tick a question or add a note first.'; setTimeout(paintBar, 4000); return; }
  if (kind === 'md') save(new Blob([core.toMarkdown(g, state, now)], { type: 'text/markdown' }), FILE + '.md');
  if (kind === 'txt') save(new Blob([core.toText(g, state, now)], { type: 'text/plain' }), FILE + '.txt');
  if (kind === 'docx') save(new Blob([core.toDocx(g, state, now)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), FILE + '.docx');
  if (kind === 'mail') location.href = core.mailto(core.toText(g, state, now));
  if (kind === 'share') {
    const text = core.toText(g, state, now), file = new File([core.toDocx(g, state, now)], FILE + '.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const withFile = navigator.canShare?.({ files: [file] });
    navigator.share(withFile ? { files: [file], title: 'Entrustment questions: my notes' } : { title: 'Entrustment questions: my notes', text }).catch(() => {});
  }
}

export function start() {
  if (!$('.g-item')) return;
  build();
  state = read(DEVICE).items || {};
  line = h('p', { class: 'a-footnote g-mine-line', 'aria-live': 'polite' });
  const btn = (label, kind) => h('button', { type: 'button', class: 'g-mine-btn', onclick: () => exportAs(kind) }, label);
  bar = h('section', { class: 'g-mine', 'aria-label': 'My notes' }, line,
    h('details', { class: 'g-mine-export' }, h('summary', {}, 'Export or share my notes'),
      h('div', { class: 'g-mine-btns' }, btn('Word (.docx)', 'docx'), btn('Markdown (.md)', 'md'), btn('Text (.txt)', 'txt'),
        navigator.share ? btn('Share…', 'share') : null, btn('Email', 'mail'))));
  ($('.g-tabs') || $('[data-search]')).before(bar);
  paint();
  signIn();
  addEventListener('online', () => { if (!cloud) signIn(); else { listen(); if (dirty) push(); } });
}
