// Builds the readable guidebook pages (apmes.anawj.com/guide/) from the programme guidebook's Markdown.
//   node tools/build-guide.mjs           writes home/guide/<name>.html for each apmes/guidebook/<name>.md (the two EPA files
//                                        split into one page per EPA, epa-01.html to epa-12.html, plus appendix.html),
//                                        entrustment.html (every DOPS, Mini-CEX and EBD item by type), index.html and
//                                        search.json (every section as plain text, for the contents page's search)
//   node tools/build-guide.mjs --check   exits 1 if those pages are missing, stale or left over (tools/check.mjs runs it)
// The .md files stay the source (the evals app reads them raw at /apmes/guidebook/); never edit the .html by hand.
// Only the Markdown the guidebook uses is handled: # headings, paragraphs, - and 1. lists (nested by indent), | tables,
// > quotes, ---, **bold**, *italic*, `code`, [links](x.md) and the <br> <sup> <sub> <u> tags; any other HTML is shown
// as text. Styles: home/guide/guide.css; search and tabs: home/guide/guide.js (both by hand).

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
  // residents cover at least 2 of the suggested questions, not all of them (owner, 23 Oct 2026); the .md keeps the
  // guidebook's own wording, which evals/tools/build-data.mjs reads
  const html = out.join('\n').replace(/<strong>Suggested entrustment questions<\/strong>/g, '<strong>Suggested entrustment questions (at least 2)</strong>');
  return { title: title || 'Guidebook', html, toc };
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
  addEventListener('beforeinstallprompt', e => e.preventDefault());   // installable, never prompted
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
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Guidebook">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/svg+xml" href="icons/icon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
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
<script src="guide.js" defer></script>
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

// ---- splitting: the two EPA files become one page per EPA (7a and 7b stay with 7) plus the Appendix ----
const EPA_FILES = ['epa-01-06', 'epa-07-12'];
// "see [Attachments](epa-07-attachments.md), EPA 7a (JR)" -> a link straight to that attachment's part
const ATTACH = /see \[Attachments\]\(epa-07-attachments\.md\), (EPA 7[ab] \((?:JR|SR)\))/g;
const attachId = part => 'attachment-' + part.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const linkAttachments = md => md.replace(ATTACH, (_, part) => `see [Attachments, ${part}](epa-07-attachments.md#${attachId(part)})`);

export function split(md) {
  // -> [{ name, md }]: a new part at each "## EPA <n>" with a new number, and at "## Appendix"
  const parts = [];
  let cur = null, num = null;
  for (const l of md.replace(/\r\n?/g, '\n').split('\n')) {
    const m = l.match(/^## EPA (\d+)[a-z]?:/), app = /^## Appendix\b/.test(l);
    if ((m && +m[1] !== num) || app) {
      num = m ? +m[1] : null;
      parts.push(cur = { name: m ? `epa-${m[1].padStart(2, '0')}` : 'appendix', lines: [] });
    }
    (cur ||= parts[parts.push({ name: 'front', lines: [] }) - 1]).lines.push(l);
  }
  return parts.map(p => ({ name: p.name, md: p.lines.join('\n').trim() + '\n' }));
}

// the guidebook's pages in reading order: [{ name, md, group }]
function sources() {
  const read = n => linkAttachments(fs.readFileSync(path.join(SRC, `${n}.md`), 'utf8'));
  const names = fs.readdirSync(SRC).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3))
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 1e3) - (ORDER.indexOf(b) + 1 || 1e3) || a.localeCompare(b));
  const out = [];
  for (const n of names) {
    if (EPA_FILES.includes(n)) for (const p of split(read(n))) out.push({ ...p, group: p.name === 'appendix' ? 'more' : 'epa' });
    else out.push({ name: n, md: read(n), group: n === '00-introduction' ? 'intro' : 'more' });
  }
  return out;
}

// ---- entrustment questions: every "#### <Tool> — <item>" section of the EPA pages ----
export const TOOLS = [{ key: 'dops', tool: 'DOPS', label: 'DOPS' }, { key: 'cex', tool: 'Mini-CEX', label: 'Mini-CEX' }, { key: 'ebd', tool: 'EBD', label: 'EBD' }];

export function entrustment(pages) {
  // -> [{ tool, epa, item, page, id, md, attachments: [part] }]
  const items = [];
  for (const p of pages.filter(p => p.group === 'epa')) {
    const ids = render(p.md).toc.filter(t => t.level === 4).map(t => t.id);
    const lines = p.md.split('\n');
    let epa = null, k = 0;
    for (let i = 0; i < lines.length; i++) {
      const h = lines[i].match(/^(#{1,6})\s+(.*?)\s*$/);
      if (!h) continue;
      if (h[1].length === 2) epa = (h[2].match(/^EPA \d+[a-z]?/) || [h[2]])[0];
      if (h[1].length !== 4) continue;
      const id = ids[k++], m = h[2].match(/^(DOPS|Mini-CEX|EBD)\s+—\s+(.*)$/);
      if (!m) continue;
      let j = i + 1;
      while (j < lines.length && !/^#{1,4}\s/.test(lines[j])) j++;
      const md = lines.slice(i + 1, j).join('\n').trim();
      items.push({ tool: m[1], epa, item: m[2], page: p.name, id, md, attachments: [...new Set([...md.matchAll(/\[Attachments, (EPA 7[ab] \((?:JR|SR)\))\]/g)].map(x => x[1]))] });
    }
  }
  return items;
}

// the attachment part "EPA 7a (JR)" as Markdown (its "## Attachment: ..." section, heading dropped)
function attachmentPart(pages, part) {
  const md = (pages.find(p => p.name === 'epa-07-attachments') || {}).md || '';
  const at = md.indexOf(`## Attachment: ${part}\n`);
  if (at < 0) return '';
  const rest = md.slice(md.indexOf('\n', at) + 1), end = rest.search(/^## /m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

// ---- search: one entry per section (heading to the next heading), as plain text ----
const textOf = html => html.replace(/<br>/g, ' ').replace(/<\/(p|li|td|th|h\d)>/g, ' ').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function searchEntries(doc) {
  const out = [];
  const parts = doc.html.split(/(?=<h[1-6] id=")/);
  for (const part of parts) {
    const h = part.match(/^<h([1-6]) id="([^"]+)">([\s\S]*?)<\/h\1>/);
    const title = h ? textOf(h[3]) : doc.title, text = textOf(h ? part.slice(h[0].length) : part);
    if (!text && !h) continue;
    out.push({ p: doc.name, id: h ? h[2] : '', d: doc.short, t: title, x: text });
  }
  return out;
}

const searchBox = (placeholder, hint) => `<form class="g-search" role="search" data-search onsubmit="return false">
  <label class="a-search"><span class="a-sr">Search</span><input class="a-field" type="search" placeholder="${placeholder}" autocomplete="off" enterkeyhint="search"></label>
  <p class="a-footnote g-search-hint">${hint}</p>
  <div class="g-results" aria-live="polite"></div>
</form>`;

// short names for the contents and search results
function shortName(d) {
  if (d.group === 'epa') return (d.title.match(/^EPA \d+/) || [d.title])[0];
  return { '00-introduction': 'Introduction', 'appendix': 'Appendix', 'epa-07-attachments': 'EPA 7 attachments', 'dops-expectations': 'DOPS guideline', 'msf-and-competency-forms': 'MSF and competency forms' }[d.name] || d.title;
}

function entrustmentPage(pages, items) {
  const tab = t => items.filter(i => i.tool === t.tool);
  const seg = `<div class="a-seg g-tabs" role="tablist" aria-label="Assessment type">${TOOLS.map((t, n) =>
    `<button type="button" role="tab" id="tab-${t.key}" aria-controls="${t.key}" aria-selected="${n === 0}">${t.label} <span class="g-count">${tab(t).length}</span></button>`).join('')}</div>`;
  const panel = t => {
    let html = '', epa = null;
    for (const i of tab(t)) {
      if (i.epa !== epa) { html += `${epa ? '</div>' : ''}<h3 class="g-epa">${esc(i.epa)}</h3><div class="g-items">`; epa = i.epa; }
      const extra = i.attachments.map(part => `<details class="g-attach"><summary>Detailed guide: ${esc(part)}</summary><div class="g-doc">${render(attachmentPart(pages, part)).html}</div></details>`).join('');
      html += `<details class="g-item" id="${t.key}-${i.page}-${i.id}"><summary><span class="g-tool g-tool-${t.key}">${t.label}</span> <span class="g-item-epa">${esc(i.epa)}</span> ${inline(i.item)}</summary>
<div class="g-doc">${render(i.md).html}${extra}<p class="g-from"><a href="${i.page}.html#${i.id}">Open in ${esc(i.epa)} ›</a></p></div></details>`;
    }
    return `<section class="g-panel" id="${t.key}" role="tabpanel" aria-labelledby="tab-${t.key}"><h2 class="g-panel-title">${t.label} <span class="g-panel-count"></span></h2>${html}${epa ? '</div>' : ''}</section>`;
  };
  return `<h1 class="g-h1">Entrustment questions</h1>
<p class="a-footnote">The suggested entrustment questions and discussion points for every DOPS, Mini-CEX and EBD, grouped by EPA. Tap one to open it.</p>
${searchBox('Filter, e.g. spinal, airway, EPA 9', 'Type to filter the list.')}
${seg}
${TOOLS.map(panel).join('\n')}`;
}

export function build() {
  const pages = sources(), files = {}, docs = [];
  for (const p of pages) {
    const r = render(p.md);
    const d = { ...p, ...r };
    d.short = shortName(d);
    docs.push(d);
    const toc = r.toc.filter(t => t.level === 2 || t.level === 3);
    const contents = toc.length > 1 ? `<details class="g-toc"><summary>On this page</summary>${tocList(r.toc)}</details>\n` : '';
    files[`${p.name}.html`] = page({ title: r.title, back: { href: './', label: 'Contents' }, body: `${contents}<article class="g-doc">\n${r.html}\n</article>` });
  }
  const items = entrustment(pages);
  files['entrustment.html'] = page({ title: 'Entrustment questions', back: { href: './', label: 'Contents' }, body: entrustmentPage(pages, items) });
  const row = d => `<li><a class="a-row" href="${d.name}.html"><span class="a-row-text">${d.group === 'epa' ? `<strong>${esc(d.short)}</strong> ${esc(d.title.replace(/^EPA \d+:\s*/, ''))}` : esc(d.title)}</span><span class="a-chev" aria-hidden="true"></span></a></li>`;
  const section = (head, list) => list.length ? `<h2 class="g-list-head">${head}</h2><ul class="a-list">${list.map(row).join('')}</ul>` : '';
  const index = `<h1 class="g-h1">Programme guidebook</h1>
<p class="a-footnote">The anaesthesiology EPA guidebook (v8, July 2024) and its attachments, as readable pages.</p>
${searchBox('Search the guidebook', 'Searches every page, attachments included.')}
<ul class="a-list"><li><a class="a-row" href="entrustment.html"><span class="a-row-text"><strong>Entrustment questions</strong><span class="g-sub">DOPS · Mini-CEX · EBD, for use during an assessment</span></span><span class="a-chev" aria-hidden="true"></span></a></li></ul>
${section('Start here', docs.filter(d => d.group === 'intro'))}
${section('EPAs', docs.filter(d => d.group === 'epa'))}
${section('Appendix and attachments', docs.filter(d => d.group === 'more'))}
<p class="a-footnote g-appver" data-appver>App version: checking…</p>
<p class="a-footnote g-appver"><button class="g-linkbtn" type="button" data-latest>Not updating? Get the latest version</button></p>`;
  files['index.html'] = page({ title: 'Programme guidebook', back: { href: '../', label: 'APMES' }, body: index });
  files['search.json'] = JSON.stringify(docs.flatMap(searchEntries)) + '\n';
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = build(), check = process.argv.includes('--check'), problems = [];
  const have = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter(f => /\.(html|json)$/.test(f)) : [];
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
