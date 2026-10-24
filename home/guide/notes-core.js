// Guidebook notes and ticks: the parts with no page or Firebase in them (merge, counts, exports, a small .docx
// writer), so home/test/notes.test.mjs can check them in Node. The page side is notes.js.
//
// State: { '<question key>': { d: done (bool), n: note (string), t: last changed (ms) } }. A key is
// '<item id>~<n>' (the item's anchor on entrustment.html, then the question's place in it, from 0), or
// '<item id>~all' for an item whose questions aren't a list. A cleared question keeps its entry (d false, n ''), so
// clearing it on one device clears it on the others too.

export const NOTE_MAX = 4000;   // characters per note (the whole doc must stay under Firestore's 1 MB)
// the doc is refused past 1 MB: stop a little short and say so, rather than failing every save as if offline
export const DOC_MAX = 900000;
export const tooBig = items => new TextEncoder().encode(JSON.stringify(items || {})).length > DOC_MAX;
// Firestore error codes that a retry won't fix (the rest, and timeouts, wait for the connection)
export const REFUSED = ['too-big', 'permission-denied', 'invalid-argument', 'failed-precondition', 'resource-exhausted', 'unauthenticated'];

// newest change per question wins; same time: a's
export function merge(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    if (!v || typeof v !== 'object') continue;
    if (!out[k] || (Number(v.t) || 0) > (Number(out[k].t) || 0)) out[k] = clean(v);
  }
  return out;
}
const clean = v => ({ d: v.d === true, n: String(v.n || '').slice(0, NOTE_MAX), t: Number(v.t) || 0 });

export const touched = e => !!e && (e.d === true || !!String(e.n || '').trim());
export function counts(state) {
  const es = Object.values(state || {});
  return { done: es.filter(e => e && e.d === true).length, notes: es.filter(e => e && String(e.n || '').trim()).length };
}

// groups: [{ label: 'DOPS', items: [{ epa, title, qs: [{ key, text }] }] }] (from the page). Keeps the items with at
// least one tick or note, each with all its questions, so the export shows what's done and what's left.
export function picked(groups, state) {
  return groups.map(g => ({ label: g.label, items: g.items.filter(i => i.qs.some(q => touched(state[q.key]))) }))
    .filter(g => g.items.length);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const stamp = d => `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const TITLE = 'Entrustment questions: my notes';
function summary(groups, state, when) {
  const qs = picked(groups, state).flatMap(g => g.items.flatMap(i => i.qs));
  return `Exported ${stamp(when)} · ${qs.filter(q => state[q.key]?.d).length} of ${qs.length} questions done`;
}
const noteLines = e => String(e?.n || '').trim() ? String(e.n).trim().split(/\r?\n/) : [];

export function toMarkdown(groups, state, when = new Date()) {
  const out = [`# ${TITLE}`, '', summary(groups, state, when)];
  for (const g of picked(groups, state)) {
    out.push('', `## ${g.label}`);
    for (const i of g.items) {
      out.push('', `### ${i.epa} · ${i.title}`, '');
      for (const q of i.qs) {
        const e = state[q.key];
        out.push(`- [${e?.d ? 'x' : ' '}] ${q.text}`);
        for (const l of noteLines(e)) out.push(`  > ${l}`);
      }
    }
  }
  return out.join('\n') + '\n';
}

export function toText(groups, state, when = new Date()) {
  const out = [TITLE.toUpperCase(), summary(groups, state, when)];
  for (const g of picked(groups, state)) {
    out.push('', '', g.label.toUpperCase());
    for (const i of g.items) {
      out.push('', `${i.epa} · ${i.title}`);
      for (const q of i.qs) {
        const e = state[q.key];
        out.push(`  ${e?.d ? '[x]' : '[ ]'} ${q.text}`);
        noteLines(e).forEach((l, n) => out.push(`      ${n ? '      ' : 'Note: '}${l}`));
      }
    }
  }
  return out.join('\n') + '\n';
}

// ---- .docx: a minimal Word file (headings, ticked lines, notes), zipped without compression ----
const x = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (t, f = {}) => `<w:r><w:rPr>${f.b ? '<w:b/>' : ''}${f.i ? '<w:i/>' : ''}${f.sz ? `<w:sz w:val="${f.sz}"/>` : ''}${f.c ? `<w:color w:val="${f.c}"/>` : ''}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
const para = (runs, { ind = 0, after = 80, before = 0, keep = false } = {}) =>
  `<w:p><w:pPr>${keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${before}" w:after="${after}"/>${ind ? `<w:ind w:left="${ind}"/>` : ''}</w:pPr>${runs}</w:p>`;

export function docxXml(groups, state, when = new Date()) {
  const body = [para(run(TITLE, { b: true, sz: 32 })), para(run(summary(groups, state, when), { c: '666666' }), { after: 200 })];
  for (const g of picked(groups, state)) {
    body.push(para(run(g.label, { b: true, sz: 28 }), { before: 240, keep: true }));
    for (const i of g.items) {
      body.push(para(run(`${i.epa} · ${i.title}`, { b: true, sz: 22 }), { before: 160, keep: true }));
      for (const q of i.qs) {
        const e = state[q.key];
        body.push(para(run(e?.d ? '☑ ' : '☐ ') + run(q.text), { ind: 360, after: noteLines(e).length ? 20 : 80 }));
        for (const l of noteLines(e)) body.push(para(run(l, { i: true, c: '444444' }), { ind: 720, after: 40 }));
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

export function toDocx(groups, state, when = new Date()) {
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': docxXml(groups, state, when),
  });
}

// { name: text } -> zip bytes (stored, no compression: no library, and a few KB of text)
let CRC = null;
function crc32(bytes) {
  CRC ||= Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zip(files) {
  const enc = new TextEncoder(), parts = [], dir = [];
  let at = 0;
  const u16 = n => [n & 0xff, (n >>> 8) & 0xff], u32 = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  for (const [name, text] of Object.entries(files)) {
    const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    // version 20, flag 0x0800 (UTF-8 names), stored, time/date 0:00 1 Jan 1980
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)];
    const local = Uint8Array.from([...u32(0x04034b50), ...common]);
    parts.push(local, nm, data);
    dir.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(at)]), nm);
    at += local.length + nm.length + data.length;
  }
  const size = dir.reduce((s, p) => s + p.length, 0), n = Object.keys(files).length;
  const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(n), ...u16(n), ...u32(size), ...u32(at), ...u16(0)]);
  const all = [...parts, ...dir, end], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

// an email link with the text as its body; long notes are cut (mail apps refuse very long links), with a pointer
export const MAIL_MAX = 6000;
export function mailto(text, subject = TITLE) {
  const body = text.length > MAIL_MAX ? text.slice(0, MAIL_MAX) + '\n… (cut short: use Download and attach the file for the rest)\n' : text;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// the accounts signed in to the Logbook on this browser (lower case, not the demo's): the Logbook keeps one key per
// signed-in account
export const SIGNED_IN_PREFIX = 'apmes-logbook-who:';
export function signedIn(store) {
  const out = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(SIGNED_IN_PREFIX) && !k.startsWith(SIGNED_IN_PREFIX + 'demo:')) out.push(k.slice(SIGNED_IN_PREFIX.length).toLowerCase());
    }
  } catch { /* storage blocked */ }
  return out;
}
// true when this browser has a Logbook sign-in
export const hasSignIn = store => signedIn(store).length > 0;
