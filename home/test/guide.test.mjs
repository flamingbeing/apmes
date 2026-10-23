// The guidebook page builder (tools/build-guide.mjs), no browser. Run: node home/test/guide.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { inline, render, build } from '../../tools/build-guide.mjs';

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

test('build: one page per .md plus the contents page; links between pages resolve', () => {
  const files = build();
  assert.ok(files['index.html'] && files['epa-01-06.html'] && files['dops-expectations.html']);
  for (const [name, html] of Object.entries(files)) {
    for (const [, href] of html.matchAll(/href="([^"#]+\.html)(#[^"]*)?"/g)) assert.ok(files[href], `${name} links to ${href}`);
    for (const [, page, id] of html.matchAll(/href="([^"#]*)#([^"]+)"/g)) assert.ok((files[page || name] || '').includes(`id="${id}"`), `${name} -> ${page}#${id}`);
    assert.doesNotMatch(html, /<script(?! *>\s*try \{)/, `${name}: only the theme script`);
  }
});
