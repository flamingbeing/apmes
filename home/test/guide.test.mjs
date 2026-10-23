// The guidebook page builder (tools/build-guide.mjs), no browser. Run: node home/test/guide.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { inline, render, build, split } from '../../tools/build-guide.mjs';

test('inline: escapes HTML but keeps the guidebook\'s few tags, marks and links', () => {
  assert.equal(inline('a <script>x</script> & b'), 'a &lt;script&gt;x&lt;/script&gt; &amp; b');
  assert.equal(inline('m<sup>2</sup> T<sub>reg</sub> <u>u</u> a<br>b'), 'm<sup>2</sup> T<sub>reg</sub> <u>u</u> a<br>b');
  assert.equal(inline('**bold** and *it*'), '<strong>bold</strong> and <em>it</em>');
  assert.equal(inline('EBD_EPA7A_JR.docx'), 'EBD_EPA7A_JR.docx', 'underscores are not italics');
  assert.equal(inline('`<br>`'), '<code>&lt;br&gt;</code>');
  assert.equal(inline('*[file — see [Attachments](epa-07-attachments.md#x), 7a]*'), '<em>[file — see <a href="epa-07-attachments.html#x">Attachments</a>, 7a]</em>');
  assert.equal(inline('[x](javascript:alert(1))'), '[x](javascript:alert(1))', 'only this site\'s pages or https become links');
  assert.equal(inline('[x](http://example.org)'), 'x');
});

test('render: headings with ids and contents, tables in a sideways-scrolling box, nested lists', () => {
  const r = render(['# Title', '', '## Part', '', '## Part', '', '| a | b |', '|---|---|', '| 1<br>2 | 3 |', '',
    '1. one', '   - sub', '   ', '   more for one', '2. two', '', '3) three', '', '> quote', '', 'p1', 'p2'].join('\n'));
  assert.equal(r.title, 'Title');
  assert.deepEqual(r.toc.map(t => t.id), ['title', 'part', 'part-2']);
  assert.match(r.html, /<div class="g-table" tabindex="0" role="region"[^>]*><table><thead><tr><th>a<\/th><th>b<\/th><\/tr><\/thead><tbody><tr><td>1<br>2<\/td><td>3<\/td><\/tr>/);
  assert.match(r.html, /<ol><li>one<ul><li>sub<\/li><\/ul><br>more for one<\/li><li>two<\/li><li>three<\/li><\/ol>/);
  assert.match(r.html, /<blockquote><p>quote<\/p><\/blockquote>/);
  assert.match(r.html, /<p>p1<br>p2<\/p>/);
});

test('split: one part per EPA number (7a and 7b stay with 7), and the Appendix', () => {
  const parts = split(['## EPA 6: x', 'a', '## EPA 7: y', '## EPA 7a: z', '### q', '## EPA 8: w', '## Appendix', 'b'].join('\n'));
  assert.deepEqual(parts.map(p => p.name), ['epa-06', 'epa-07', 'epa-08', 'appendix']);
  assert.match(parts[1].md, /## EPA 7a: z\n### q/);
});

test('build: one page per EPA, the other .md files, the entrustment page and the search index; links resolve', () => {
  const files = build();
  for (let n = 1; n <= 12; n++) assert.ok(files[`epa-${String(n).padStart(2, '0')}.html`], `EPA ${n} page`);
  assert.ok(files['index.html'] && files['appendix.html'] && files['dops-expectations.html'] && files['entrustment.html']);
  assert.ok(!files['epa-01-06.html'] && !files['epa-07-12.html'], 'no combined pages');
  const e = files['entrustment.html'];
  for (const t of ['dops', 'cex', 'ebd']) assert.match(e, new RegExp(`role="tabpanel" aria-labelledby="tab-${t}"`));
  assert.ok((e.match(/class="g-item"/g) || []).length >= 59, 'every DOPS, Mini-CEX and EBD item');
  assert.match(e, /Detailed guide: EPA 7a \(SR\)/, 'EPA 7 attachments inside their items');
  assert.ok((e.match(/Suggested entrustment questions \(at least 2\)/g) || []).length >= 59 && !/Suggested entrustment questions<\/strong>/.test(e), 'at least 2 of the questions');
  const index = JSON.parse(files['search.json']);
  assert.ok(index.length > 150 && index.every(x => files[`${x.p}.html`] && typeof x.x === 'string'));
  assert.ok(index.some(x => x.p === 'epa-07-attachments' && /dural puncture/i.test(x.x)), 'attachments are searchable');
  for (const [name, html] of Object.entries(files)) {
    if (!name.endsWith('.html')) continue;
    for (const [, href] of html.matchAll(/href="([^"#]+\.html)(#[^"]*)?"/g)) assert.ok(files[href], `${name} links to ${href}`);
    for (const [, page, id] of html.matchAll(/href="([^"#]*)#([^"]+)"/g)) assert.ok((files[page || name] || '').includes(`id="${id}"`), `${name} -> ${page}#${id}`);
    assert.doesNotMatch(html, /<script(?! *>\s*try \{| src="guide\.js" defer>)/, `${name}: only the theme script and guide.js`);
    assert.match(html, /<script src="guide\.js" defer>/, `${name}: loads guide.js`);
  }
});
