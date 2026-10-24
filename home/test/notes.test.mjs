// Guidebook notes and ticks, the parts without a page (home/guide/notes-core.js). Run: node home/test/notes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { merge, counts, picked, toMarkdown, toText, toDocx, zip, mailto, MAIL_MAX, hasSignIn, signedIn, tooBig, DOC_MAX, NOTE_MAX } from '../guide/notes-core.js';

const JSZip = createRequire(import.meta.url)('../../logbook/vendor/jszip.min.js');
const when = new Date(2026, 9, 23, 9, 5);
const groups = [
  { label: 'DOPS', items: [
    { epa: 'EPA 1', title: 'Mask & LMA <fake>', qs: [{ key: 'a~0', text: 'How do you size an LMA?' }, { key: 'a~1', text: 'Cuff pressure?' }] },
    { epa: 'EPA 2', title: 'Untouched item', qs: [{ key: 'b~0', text: 'Not shown' }] },
  ] },
  { label: 'EBD', items: [{ epa: 'EPA 7', title: 'Whole item', qs: [{ key: 'c~all', text: 'Whole item' }] }] },
];
const state = { 'a~0': { d: true, n: 'Fake note\nline two', t: 2 }, 'a~1': { d: false, n: '', t: 3 }, 'c~all': { d: false, n: 'only a note', t: 1 } };

test('merge: newest change per question wins, both sides kept, junk dropped', () => {
  const a = { x: { d: true, n: 'old', t: 1 }, y: { d: false, n: 'mine', t: 5 } };
  const b = { x: { d: false, n: 'new', t: 2 }, y: { d: true, n: 'theirs', t: 4 }, z: { d: true, t: 1 }, bad: 'x' };
  assert.deepEqual(merge(a, b), { x: { d: false, n: 'new', t: 2 }, y: { d: false, n: 'mine', t: 5 }, z: { d: true, n: '', t: 1 } });
  assert.deepEqual(merge(undefined, null), {});
  assert.equal(merge({}, { k: { n: 'x'.repeat(NOTE_MAX + 5), t: 1 } }).k.n.length, NOTE_MAX);
  // a cleared question stays as an entry, so clearing reaches the other devices
  assert.deepEqual(merge({ x: { d: true, n: 'n', t: 1 } }, { x: { d: false, n: '', t: 9 } }).x, { d: false, n: '', t: 9 });
});

test('counts and picked: only items with a tick or a note, with all their questions', () => {
  assert.deepEqual(counts(state), { done: 1, notes: 2 });
  const p = picked(groups, state);
  assert.deepEqual(p.map(g => [g.label, g.items.map(i => i.title)]), [['DOPS', ['Mask & LMA <fake>']], ['EBD', ['Whole item']]]);
  assert.equal(p[0].items[0].qs.length, 2);
  assert.deepEqual(picked(groups, {}), []);
});

test('markdown and text exports', () => {
  const md = toMarkdown(groups, state, when);
  assert.match(md, /^# Entrustment questions: my notes\n\nExported 23 Oct 2026, 09:05 · 1 of 3 questions done\n\n## DOPS\n\n### EPA 1 · Mask & LMA <fake>\n\n- \[x\] How do you size an LMA\?\n  > Fake note\n  > line two\n- \[ \] Cuff pressure\?\n/);
  assert.doesNotMatch(md, /Untouched|Not shown/);
  assert.match(md, /## EBD\n\n### EPA 7 · Whole item\n\n- \[ \] Whole item\n  > only a note\n$/);
  const txt = toText(groups, state, when);
  assert.match(txt, /\n  \[x\] How do you size an LMA\?\n      Note: Fake note\n            line two\n  \[ \] Cuff pressure\?\n/);
});

test('docx: a valid zip Word reads, text escaped', async () => {
  const z = await JSZip.loadAsync(toDocx(groups, state, when));
  assert.deepEqual(Object.keys(z.files).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
  const xml = await z.file('word/document.xml').async('string');
  assert.match(xml, /Mask &amp; LMA &lt;fake&gt;/);
  assert.match(xml, /☑ <\/w:t><\/w:r><w:r><w:rPr><\/w:rPr><w:t xml:space="preserve">How do you size an LMA\?/);
  assert.match(xml, /<w:i\/><w:color w:val="444444"\/><\/w:rPr><w:t xml:space="preserve">line two/);
  // unzip -t, where available, agrees the zip is sound (CRCs, offsets)
  try {
    const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'docx-')), 'x.zip');
    fs.writeFileSync(f, zip({ 'a.txt': 'héllo', 'b/c.xml': '<x/>' }));
    assert.match(execFileSync('unzip', ['-t', f], { encoding: 'utf8' }), /No errors detected/);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
});

test('mailto: subject and body encoded, long text cut with a pointer', () => {
  assert.equal(mailto('a & b\nc'), 'mailto:?subject=Entrustment%20questions%3A%20my%20notes&body=a%20%26%20b%0Ac');
  const long = decodeURIComponent(mailto('x'.repeat(MAIL_MAX + 100)).split('body=')[1]);
  assert.ok(long.length < MAIL_MAX + 100 && /cut short/.test(long));
});

const mem = o => ({ key: i => Object.keys(o)[i] ?? null, get length() { return Object.keys(o).length; } });
test('hasSignIn: a Logbook account, not the demo', () => {
  assert.equal(hasSignIn(mem({ 'apmes-logbook-who:fake@example.com': '1' })), true);
  assert.equal(hasSignIn(mem({ 'apmes-logbook-who:demo:x': '1', other: '1' })), false);
});

test('signedIn: the Logbook accounts on this browser, lower case, not the demo', () => {
  assert.deepEqual(signedIn(mem({ 'apmes-logbook-who:Fake@Example.com': '1', 'apmes-logbook-who:demo:x': '1', other: '1' })), ['fake@example.com']);
  assert.deepEqual(signedIn(mem({})), []);
});

test('tooBig: stops short of the 1 MB doc limit', () => {
  assert.equal(tooBig({ a: { d: true, n: 'short', t: 1 } }), false);
  assert.equal(tooBig({ a: { d: false, n: 'x'.repeat(DOC_MAX), t: 1 } }), true);
});
