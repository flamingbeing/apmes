// Brings the answers of the department's old Google Form ("CCC Projects & MSF", before the CCC app) into the app as
// earlier rounds. Two steps, so the data can be read before anything is written:
//   node tools/ccc-import-form.mjs plan <responses.csv> <plan.json> [--skip email,email]
//       The form's response sheet (File › Download › CSV) -> the documents to write, plus a report (no network).
//   node tools/ccc-import-form.mjs write <plan.json> [--project apmes-logbook] [--go]
//       Writes them with the signed-in gcloud account (`gcloud auth print-access-token`; server access, so the rules
//       do not apply). Without --go it only checks: it lists what it would write and stops if any round already exists.
// The CSV and the plan hold residents' and nominees' names and emails: keep them in the private notes, never here.
//
// Rounds: the form's "CCC Meeting" answer when given, else the half-year the CCC is for, from the date sent
// (Jul to Jan -> that year's Jul-Dec CCC, Feb to Jun -> Jan-Jun). The newest round stays open (PCs check and invite
// raters for it in the app); the others are closed when their last answer came in, so the clean-up (PURGE_DAYS) counts
// from then. One resident sending twice for a round: the newer answer wins field by field, and empty or "NA" answers
// never replace a real one. The form's one free-text project box becomes one project per numbered item (else one project).

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { entryDoc, msfDoc, EMAIL_RE } from '../ccc/js/model.js';

const [mode, ...args] = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? ''; };

// ---------- plan ----------

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

// "NA", ".", "nil", "TBC", "submitted already" and the like mean nothing was given
const EMPTY = /^(n\.?a\.?|n\/a|nil|none|null|tbc|tba|-+|\.+|0|no|not applicable|submitted.*|see .*|same as .*)$/i;
const val = v => { const s = String(v ?? '').replace(/ /g, ' ').trim(); return EMPTY.test(s) ? '' : s; };

// "dd/mm/yyyy hh:mm:ss" in Singapore time -> ms
export function sentAt(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s).trim());
  if (!m) return 0;
  const [, d, mo, y, h = 0, mi = 0, se = 0] = m.map(x => (x === undefined ? undefined : Number(x)));
  return Date.UTC(y, mo - 1, d, h - 8, mi, se);
}
const HALF = { 'jan-jun': 'h1', 'jul-dec': 'h2' };
// the round a row belongs to: { id: 'r2025-h2', title: 'CCC Jul–Dec 2025' }
export function roundOf(label, at) {
  const m = /^(jan|jul)\s*[-–]\s*(jun|dec)\s+(\d{4})$/i.exec(String(label || '').trim());
  let y, h;
  if (m) { y = Number(m[3]); h = HALF[(m[1] + '-' + m[2]).toLowerCase()]; }
  else {
    const d = new Date(at + 8 * 3600000), mo = d.getUTCMonth() + 1;
    y = d.getUTCFullYear(); h = mo === 1 ? 'h2' : mo <= 6 ? 'h1' : 'h2';
    if (mo === 1) y -= 1;
  }
  return { id: `r${y}-${h}`, title: `CCC ${h === 'h1' ? 'Jan–Jun' : 'Jul–Dec'} ${y}`, order: y * 10 + (h === 'h1' ? 1 : 2) };
}

// long lines split at sentence ends so each stays within the app's 300 characters
const lines = v => val(v).split(/\r?\n/).map(val).filter(Boolean).flatMap(l => {
  if (l.length <= 300) return [l];
  const out = []; let cur = '';
  for (const s of l.split(/(?<=[.;])\s+/)) { if (cur && (cur + ' ' + s).length > 300) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s; }
  if (cur) out.push(cur);
  return out;
});

// the free-text box -> projects: split only at numbered items ("1." / "2)" starting a line), since residents also use
// blank lines inside one project; the first line is the title, the rest the note, and nothing is cut: a title over
// 200 characters goes whole into the note, a note over 1000 continues in a second card
export function projectsOf(text) {
  const t = val(text);
  if (!t) return [];
  const blocks = t.split(/\r?\n(?=\s*\d+[.)]\s)/).map(b => b.trim()).filter(b => val(b));
  return blocks.flatMap(b => {
    const [first, ...rest] = b.split(/\r?\n/).map(x => x.trim());
    let title = first.replace(/^\d+[.)]\s*/, ''), note = rest.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (title.length > 200) { note = title + (note ? '\n' + note : ''); title = title.slice(0, 120).replace(/\s+\S*$/, '') + '…'; }
    const status = /\b(completed?|published)\b/i.test(b) && !/\b(ongoing|in progress|pending)\b/i.test(b) ? 'Completed' : 'Ongoing';
    const out = [];
    do {
      let cut = note.length <= 1000 ? note.length : note.lastIndexOf('\n', 1000);
      if (cut < 500) cut = note.lastIndexOf(' ', 1000);
      if (cut < 500) cut = 1000;
      out.push({ title: out.length ? `${title.replace(/…$/, '')} (continued)`.slice(0, 200) : title, note: note.slice(0, cut).trim(), status });
      note = note.slice(cut).trim();
    } while (note);
    return out;
  });
}

// the form's columns, by heading
function columns(head) {
  const at = re => head.findIndex(h => re.test(h));
  const named = (re, n) => Array.from({ length: n }, (_, i) => head.findIndex(h => re.test(h) && new RegExp(`\\b${i + 1} of ${n}\\b`).test(h) && /name/i.test(h)));
  const allied = Array.from({ length: 4 }, (_, i) => ({
    name: head.findIndex(h => /allied/i.test(h) && new RegExp(`\\b${i + 1} of 4\\b`).test(h) && /name/i.test(h)),
    email: head.findIndex(h => /allied/i.test(h) && new RegExp(`\\b${i + 1} of 4\\b`).test(h) && /email/i.test(h)),
  }));
  const c = { at: at(/^timestamp$/i), round: at(/ccc meeting/i), name: at(/full name/i), email: at(/^email address$/i),
    projects: at(/scholarly project/i), admin: at(/committee|admin work/i), teaching: at(/teaching/i), conferences: at(/conference/i),
    senior: named(/senior/i, 6), peer: named(/peer/i, 2), allied };
  for (const k of ['at', 'name', 'email', 'projects', 'admin', 'teaching', 'conferences']) if (c[k] < 0) throw new Error(`No "${k}" column in the CSV`);
  return c;
}

export function plan(csvText, { skip = [] } = {}) {
  const [head, ...rows] = parseCSV(csvText);
  const c = columns(head);
  const skipSet = new Set(skip.map(s => s.trim().toLowerCase()).filter(Boolean));
  const groups = new Map();   // round|email -> rows, oldest first
  const rounds = new Map();
  const report = { rows: rows.length, skipped: [], badEmails: [], merged: 0 };
  for (const r of rows) {
    const email = val(r[c.email]).toLowerCase();
    const at = sentAt(r[c.at]);
    if (!email || !EMAIL_RE.test(email) || !at) { report.skipped.push({ why: 'no email or date', name: val(r[c.name]) }); continue; }
    if (skipSet.has(email)) { report.skipped.push({ why: 'skipped by --skip', name: val(r[c.name]), email }); continue; }
    const rd = roundOf(c.round >= 0 ? r[c.round] : '', at);
    const old = rounds.get(rd.id);
    rounds.set(rd.id, { ...rd, last: Math.max(old?.last || 0, at), count: (old?.count || 0) });
    const key = rd.id + '|' + email;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ r, at, email, round: rd.id });
  }
  const docs = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.at - b.at);
    if (list.length > 1) report.merged += list.length - 1;
    // newest non-empty answer per field
    const pick = f => { for (let i = list.length - 1; i >= 0; i--) { const v = f(list[i].r); if (v && (!Array.isArray(v) || v.length)) return v; } return Array.isArray(f(list[0].r)) ? [] : ''; };
    const { email, round } = list[list.length - 1];
    const name = pick(r => val(r[c.name]).replace(/\s+/g, ' '));
    const projects = pick(r => projectsOf(r[c.projects]));
    const entry = { noProjects: !projects.length, projects, admin: pick(r => lines(r[c.admin])), teaching: pick(r => lines(r[c.teaching])), conferences: pick(r => lines(r[c.conferences])) };
    const nomineesOf = r => [
      ...c.senior.filter(i => i >= 0).map(i => ({ group: 'senior', name: val(r[i]) })),
      ...c.peer.filter(i => i >= 0).map(i => ({ group: 'peer', name: val(r[i]) })),
      ...c.allied.filter(a => a.name >= 0).map(a => {
        const em = val(r[a.email]).toLowerCase().replace(/\s+/g, '');
        if (em && !EMAIL_RE.test(em)) report.badEmails.push({ resident: email, nominee: val(r[a.name]), given: val(r[a.email]) });
        return { group: 'allied', name: val(r[a.name]), email: EMAIL_RE.test(em) ? em : '' };
      }),
    ].filter(n => n.name || n.email);
    const nominees = pick(nomineesOf);
    const updatedAt = list[list.length - 1].at;
    const e = entryDoc(email, name, entry), m = msfDoc(email, name, nominees);
    docs.push({ path: `ccc/${round}/entries/${email}`, data: { ...e, updatedAt } });
    if (m.nominees.length) docs.push({ path: `ccc/${round}/msf/${email}`, data: { ...m, updatedAt } });
    rounds.get(round).count++;
  }
  const ordered = [...rounds.values()].sort((a, b) => a.order - b.order);
  const newest = ordered[ordered.length - 1]?.id;
  const roundDocs = ordered.map(rd => ({ path: `ccc/${rd.id}`, data: rd.id === newest
    ? { round: rd.id, title: rd.title, status: 'open', updatedAt: rd.last }
    : { round: rd.id, title: rd.title, status: 'closed', closedAt: rd.last, updatedAt: rd.last } }));
  report.rounds = ordered.map(rd => ({ id: rd.id, title: rd.title, residents: rd.count, status: rd.id === newest ? 'open' : 'closed', lastSent: new Date(rd.last + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') + ' SGT' }));
  return { source: 'Google Form "CCC Projects & MSF"', docs: [...roundDocs, ...docs], report };
}

// ---------- write (Firestore REST, as the gcloud account) ----------

const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(enc) } : {} };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};
// entries and nominee lists carry updatedAt as a Firestore time, as the app writes them; rounds keep plain ms
const fieldsOf = (path, data) => Object.fromEntries(Object.entries(data).map(([k, x]) =>
  [k, k === 'updatedAt' && path.split('/').length > 2 ? { timestampValue: new Date(x).toISOString() } : enc(x)]));

async function write(planPath, project, go) {
  const p = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const api = async (url, init = {}) => {
    const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 404) throw new Error(`${r.status} ${JSON.stringify(body).slice(0, 300)}`);
    return { status: r.status, body };
  };
  const roundPaths = p.docs.filter(d => d.path.split('/').length === 2).map(d => d.path);
  const taken = [];
  for (const rp of roundPaths) if ((await api(`${base}/${rp}`)).status !== 404) taken.push(rp);
  console.log(`Project ${project}: ${p.docs.length} documents in ${roundPaths.length} rounds (${roundPaths.join(', ')}).`);
  console.table(p.report.rounds);
  if (taken.length) { console.log(`Stopped: these rounds already exist, nothing written: ${taken.join(', ')}`); process.exitCode = 1; return; }
  if (!go) { console.log('Checked only. Add --go to write.'); return; }
  const name = path => `projects/${project}/databases/(default)/documents/${path}`;
  for (let i = 0; i < p.docs.length; i += 400) {
    const writes = p.docs.slice(i, i + 400).map(d => ({ update: { name: name(d.path), fields: fieldsOf(d.path, d.data) }, currentDocument: { exists: false } }));
    await api(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
    console.log(`Wrote ${Math.min(i + 400, p.docs.length)} of ${p.docs.length}`);
  }
  console.log('Done.');
}

if (mode === 'plan') {
  const [csv, out] = args;
  const skip = (flag('--skip') || '').split(',');
  const p = plan(fs.readFileSync(csv, 'utf8'), { skip });
  fs.writeFileSync(out, JSON.stringify(p, null, 1) + '\n');
  console.log(JSON.stringify({ ...p.report, skipped: p.report.skipped.length, badEmails: p.report.badEmails.length, documents: p.docs.length }, null, 1));
} else if (mode === 'write') {
  await write(args[0], flag('--project') || 'apmes-logbook', args.includes('--go'));
} else if (mode) {
  console.log('Usage: plan <responses.csv> <plan.json> [--skip a@x,b@y] | write <plan.json> [--project id] [--go]');
}
