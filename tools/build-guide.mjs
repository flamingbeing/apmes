// Builds the readable guidebook pages (apmes.anawj.com/guide/) from the programme guidebook's Markdown.
//   node tools/build-guide.mjs           writes home/guide/<name>.html for each apmes/guidebook/<name>.md, plus index.html
//   node tools/build-guide.mjs --check   exits 1 if those pages are missing, stale or left over (tools/check.mjs runs it)
// The .md files stay the source (the evals app reads them raw at /apmes/guidebook/); never edit the .html by hand.
// Only the Markdown the guidebook uses is handled: # headings, paragraphs, - and 1. lists (nested by indent), | tables,
// > quotes, ---, **bold**, *italic*, `code`, [links](x.md) and the <br> <sup> <sub> <u> tags; any other HTML is shown
// as text. Styles: home/guide/guide.css (by hand).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'apmes/guidebook');
const OUT = path.join(ROOT, 'home/guide');
// reading order on the contents page; a new .md not listed here goes at the end
const ORDER = ['00-introduction', 'epa-01-06', 'epa-07-12', 'epa-07-attachments', 'dops-expectations', 'msf-and-competency-forms'];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = s => s.replace(/<[^>]+>/g, '').replace(/[*`]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

// ---- inline: escape everything, then bring back the few tags and marks the guidebook uses ----
export function inline(src) {
  const codes = [];
  let s = esc(src).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br>').replace(/&lt;(\/?)(sup|sub|u)&gt;/gi, '<$1$2>');
  // links, innermost first: [text](file.md#part) -> file.html#part; only this site's pages or https
  for (let prev = ''; prev !== s;) {
    prev = s;
    s = s.replace(/\[([^[\]]*)\]\(([^()\s]+)\)/, (_, text, url) => {
      const href = url.replace(/^([\w-]+)\.md(#|$)/, '$1.html$2');
      return /^(https:\/\/|#|[\w-]+\.html(#|$))/.test(href) ? `<a href="${href}">${text}</a>` : `${text}`;
    });
  }
  s = s.replace(/\*\*(\S(?:[^*]*?\S)?)\*\*/g, '<strong>$1</strong>').replace(/\*(\S(?:[^*]*?\S)?)\*/g, '<em>$1</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

// ---- blocks ----
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const indentOf = l => l.match(/^\s*/)[0].replace(/\t/g, '    ').length;
const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim());

function slugger() {
  const seen = new Map();
  return text => {
    const base = plain(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'part';
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

function list(lines) {
  // lines: the list's lines (items, indented continuations, blank lines). Nesting follows the items' indents.
  const out = [], stack = [];   // stack: { indent, tag, col (where its items' text starts) }
  const close = () => { const t = stack.pop(); out.push(`</li></${t.tag}>`); };
  for (const l of lines) {
    if (!l.trim()) continue;
    const m = l.match(LIST);
    if (!m) {
      // a continuation line belongs to the deepest item whose text starts at or before its indent
      while (stack.length > 1 && indentOf(l) < stack.at(-1).col) close();
      out.push('<br>' + inline(l.trim()));
      continue;
    }
    const ind = indentOf(l), tag = /\d/.test(m[2]) ? 'ol' : 'ul', start = parseInt(m[2], 10);
    while (stack.length && ind < stack.at(-1).indent) close();
    const top = stack.at(-1);
    if (top && ind === top.indent && top.tag !== tag) close();
    if (stack.length && ind === stack.at(-1).indent) out.push('</li><li>');
    else {
      stack.push({ indent: ind, tag });
      out.push(`<${tag}${tag === 'ol' && start !== 1 ? ` start="${start}"` : ''}><li>`);
    }
    stack.at(-1).col = ind + m[2].length + 1;
    out.push(inline(m[3]));
  }
  while (stack.length) close();
  return out.join('');
}

function table(lines) {
  const [head, , ...body] = lines.map(cells);
  const row = (r, t) => '<tr>' + r.map(c => `<${t}>${inline(c)}</${t}>`).join('') + '</tr>';
  return `<div class="g-table" tabindex="0" role="region" aria-label="Table (scrolls sideways)"><table><thead>${row(head, 'th')}</thead><tbody>${body.map(r => row(r, 'td')).join('')}</tbody></table></div>`;
}

// -> { title, html, toc: [{ level, id, text }] }
export function render(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n'), out = [], toc = [], slug = slugger();
  let title = null;
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      const level = m[1].length, text = m[2], id = slug(text);
      title ??= plain(text);
      if (level <= 4) toc.push({ level, id, text: plain(text) });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; }
    else if (/^\s*\|/.test(l) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || '')) {
      const t = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) t.push(lines[i++]);
      out.push(table(t));
    } else if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote><p>${q.map(inline).join('<br>')}</p></blockquote>`);
    } else if (LIST.test(l)) {
      const t = [];
      // the list runs on through items, indented lines and blank lines followed by either
      while (i < lines.length) {
        const x = lines[i];
        if (LIST.test(x) || (x.trim() && indentOf(x) > 0)) { t.push(x); i++; continue; }
        if (!x.trim()) {
          let j = i;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && (LIST.test(lines[j]) || indentOf(lines[j]) > 0)) { i = j; continue; }
        }
        break;
      }
      out.push(list(t));
    } else {
      const p = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*>|\s*\|)/.test(lines[i]) && !(p.length && LIST.test(lines[i]))) p.push(lines[i++].trim());
      out.push(`<p>${p.map(inline).join('<br>')}</p>`);
    }
  }
  return { title: title || 'Guidebook', html: out.join('\n'), toc };
}

// ---- pages ----
// the same pre-paint theme rules as home/index.html (home/js/theme.js): this page's switch, else the Logbook's look
const HEAD_THEME = `<script>
  try {
    var own = localStorage.getItem('apmes-home-theme'), t = localStorage.getItem('apmes-logbook-theme'), de = document.documentElement;
    de.dataset.theme = own === 'light' || own === 'dark' ? own : t === 'dark' || t === 'oled' ? 'dark' : t === 'auto' ? 'auto' : 'light';
    if (own !== 'light' && own !== 'dark' && t === 'oled') de.dataset.oled = '';
    var css = localStorage.getItem('apmes-logbook-accent-css-v2');
    if (css && css.length < 8000) { var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); de.classList.add('lb-colours'); }
  } catch (e) {}
</script>`;

function page({ title, back, body }) {
  return `<!doctype html>
<!-- Built by tools/build-guide.mjs from apmes/guidebook/*.md: edit the .md and rebuild, never this file. -->
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(title)} · APMES</title>
<meta name="theme-color" content="#f9f9fb">
${HEAD_THEME}
<link rel="stylesheet" href="https://design.anawj.com/v1/tokens.css">
<link rel="stylesheet" href="https://design.anawj.com/v1/app.css">
<link rel="stylesheet" href="guide.css">
</head>
<body class="a-app">
<header class="a-bar a-bar--solid"><div class="a-band"><span></span><span></span><span></span><span></span></div>
  <div class="a-bar-row"><a class="g-back" href="${back.href}">‹ ${back.label}</a><span class="a-bar-title" style="opacity:1">Guidebook</span><span></span></div></header>
<main class="a-main"><div class="g-col">
${body}
</div></main>
</body>
</html>
`;
}

function tocList(items, href = '') {
  // nested contents (levels 2-3) as a plain list of links
  let html = '', depth = 0;
  for (const t of items.filter(t => t.level === 2 || t.level === 3)) {
    const d = t.level - 1;
    if (d > depth) html += '<ul>'.repeat(d - depth);
    else { html += '</li>'; if (d < depth) html += '</ul></li>'.repeat(depth - d); }
    depth = d;
    html += `<li><a href="${href}#${t.id}">${esc(t.text)}</a>`;
  }
  return html + (depth ? '</li>' + '</ul></li>'.repeat(depth - 1) + '</ul>' : '');
}

export function build() {
  const names = fs.readdirSync(SRC).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3))
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 1e3) - (ORDER.indexOf(b) + 1 || 1e3) || a.localeCompare(b));
  const files = {}, docs = [];
  for (const name of names) {
    const r = render(fs.readFileSync(path.join(SRC, `${name}.md`), 'utf8'));
    docs.push({ name, ...r });
    const toc = r.toc.filter(t => t.level === 2 || t.level === 3);
    const contents = toc.length > 1 ? `<details class="g-toc"><summary>On this page</summary>${tocList(r.toc)}</details>\n` : '';
    files[`${name}.html`] = page({ title: r.title, back: { href: './', label: 'Contents' }, body: `${contents}<article class="g-doc">\n${r.html}\n</article>` });
  }
  const index = `<h1 class="g-h1">Programme guidebook</h1>
<p class="a-footnote">The anaesthesiology EPA guidebook and its attachments, as readable pages. Tables scroll sideways on a phone.</p>
<ul class="a-list">${docs.map(d => `<li><a class="a-row" href="${d.name}.html"><span class="a-row-text">${esc(d.title)}</span><span class="a-chev" aria-hidden="true"></span></a></li>`).join('')}</ul>
${docs.map(d => `<details class="g-toc"><summary>${esc(d.title)}</summary>${tocList(d.toc, `${d.name}.html`)}</details>`).join('\n')}`;
  files['index.html'] = page({ title: 'Programme guidebook', back: { href: '../', label: 'APMES' }, body: index });
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = build(), check = process.argv.includes('--check'), problems = [];
  const have = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter(f => f.endsWith('.html')) : [];
  for (const [f, html] of Object.entries(files)) {
    const p = path.join(OUT, f);
    if (check) { if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== html) problems.push(f); }
    else fs.mkdirSync(OUT, { recursive: true }), fs.writeFileSync(p, html);
  }
  for (const f of have.filter(f => !files[f])) {
    if (check) problems.push(`${f} (no .md for it)`); else fs.unlinkSync(path.join(OUT, f));
  }
  if (problems.length) {
    console.error(`home/guide/ is stale (${problems.join(', ')}): run node tools/build-guide.mjs`);
    process.exit(1);
  }
  console.log(check ? 'guide: up to date' : `guide: wrote ${Object.keys(files).length} pages to home/guide/`);
}
