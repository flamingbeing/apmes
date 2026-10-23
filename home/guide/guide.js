// The guidebook pages' search and the entrustment page's tabs (by hand; the pages are built by tools/build-guide.mjs).
// Contents page: searches search.json (every section of every page) and lists matches that link to the section.
// Entrustment page: DOPS / Mini-CEX / EBD tabs (remembered in the address, #dops #cex #ebd) and a filter over the items.
// Other pages: a search result's link (page.html?q=words#part) marks the words and scrolls to the first one in that part.
// Without this script every page still reads in full: the tabs show as three plain lists.
(() => {
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'");
  const words = q => norm(q).split(/\s+/).filter(Boolean);
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const mark = (text, ws) => {
    // highlight each query word in already-plain text
    let html = esc(text);
    for (const w of ws.map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length))
      html = html.replace(new RegExp(`(${w})(?![^<]*>)`, 'gi'), '<mark>$1</mark>');
    return html;
  };
  const markIn = (root, ws) => {
    // highlight query words inside an element's text nodes (keeps its markup)
    const re = new RegExp(ws.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [], marks = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue, n = norm(text);
      if (n.length !== text.length) continue;   // accents or ligatures: offsets would not line up
      let last = 0, frag = null;
      for (const m of n.matchAll(re)) {
        frag ||= document.createDocumentFragment();
        frag.append(text.slice(last, m.index));
        const el = document.createElement('mark'); el.textContent = text.slice(m.index, m.index + m[0].length);
        frag.append(el); marks.push(el); last = m.index + m[0].length;
      }
      if (frag) { frag.append(text.slice(last)); node.replaceWith(frag); }
    }
    return marks;
  };
  const form = $('[data-search]'), input = form && $('input', form), out = form && $('.g-results', form);
  const tabs = $$('.g-tabs [role="tab"]');

  // ---- entrustment page ----
  if (tabs.length) {
    document.documentElement.classList.add('g-js');
    let current = 'dops';
    const show = key => {
      current = key;
      for (const t of tabs) t.setAttribute('aria-selected', String(t.getAttribute('aria-controls') === key));
      for (const p of $$('.g-panel')) p.hidden = p.id !== key;
    };
    const fromHash = () => {
      const h = location.hash.slice(1), panel = h && (document.getElementById(h)?.closest('.g-panel'));
      show(panel ? panel.id : 'dops');
      const item = h && document.getElementById(h);
      if (item && item.matches('details')) { item.open = true; item.scrollIntoView(); }
    };
    tabs.forEach((t, n) => {
      t.addEventListener('click', () => { show(t.getAttribute('aria-controls')); history.replaceState(null, '', '#' + t.getAttribute('aria-controls')); filter(); });
      t.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { const next = tabs[(n + d + tabs.length) % tabs.length]; next.focus(); next.click(); }
      });
    });
    const items = $$('.g-item').map(el => ({ el, sum: $('summary', el), plain: $('summary', el).innerHTML, text: norm(el.textContent) }));
    // while filtering, every type's matches show at once under its own heading, so a match is never read as the wrong type
    const filter = () => {
      const ws = words(input.value), on = ws.length > 0;
      document.documentElement.classList.toggle('g-filtering', on);
      for (const i of items) {
        i.el.hidden = !ws.every(w => i.text.includes(w));
        i.sum.innerHTML = i.plain;
        if (on && !i.el.hidden) markIn(i.sum, ws);
      }
      for (const g of $$('.g-items')) { const empty = !$$('.g-item', g).some(i => !i.hidden); g.hidden = empty; g.previousElementSibling.hidden = empty; }
      const counts = [];
      for (const t of tabs) {
        const key = t.getAttribute('aria-controls'), panel = document.getElementById(key);
        const n = $$('.g-item', panel).filter(i => !i.hidden).length;
        $('.g-count', t).textContent = n;
        $('.g-panel-count', panel).textContent = on ? `· ${n} match${n === 1 ? '' : 'es'}` : '';
        panel.hidden = on ? n === 0 : key !== current;
        counts.push(`${t.textContent.replace(/\s*\d+$/, '')} ${n}`);
      }
      const shown = $$('.g-panel:not([hidden]) .g-item:not([hidden])').length;
      out.textContent = on ? (shown ? `Matches in all types: ${counts.join(' · ')}` : 'No matches.') : '';
      for (const i of items) if (on && !i.el.hidden && shown <= 3) i.el.open = true;
    };
    input.addEventListener('input', filter);
    addEventListener('hashchange', fromHash);
    fromHash();
    return;
  }

  // ---- a page opened from a search result: mark the words, scroll to the first one at or after the part ----
  const q = new URLSearchParams(location.search).get('q'), doc = $('article.g-doc');
  if (q && doc) {
    const ws = words(q).filter(w => w.length > 1), marks = ws.length ? markIn(doc, ws) : [];
    const from = location.hash && document.getElementById(location.hash.slice(1));
    const first = marks.find(m => !from || (from.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING)) || marks[0];
    if (first) { for (let el = first.parentElement; el; el = el.parentElement) if (el.tagName === 'DETAILS') el.open = true; requestAnimationFrame(() => first.scrollIntoView({ block: 'center' })); }
    return;
  }

  // ---- contents page: search the whole guidebook ----
  if (!form) return;
  let index = null;
  const load = () => index ||= fetch('search.json').then(r => r.json()).then(list => list.map(e => ({ ...e, n: norm(e.t + ' ' + e.x), nt: norm(e.t) })));
  input.addEventListener('focus', load, { once: true });
  const snippet = (text, ws) => {
    const n = norm(text), at = Math.min(...ws.map(w => n.indexOf(w)).filter(i => i >= 0));
    const from = Math.max(0, at - 60), s = text.slice(from, from + 200);
    return (from ? '… ' : '') + mark(s, ws) + (from + 200 < text.length ? ' …' : '');
  };
  let run = 0;
  input.addEventListener('input', async () => {
    const q = input.value, ws = words(q), mine = ++run;
    if (!ws.length) { out.innerHTML = ''; return; }
    const list = await load().catch(() => null);
    if (mine !== run) return;
    if (!list) { out.textContent = 'Search needs a connection the first time.'; return; }
    const hits = list.filter(e => ws.every(w => e.n.includes(w)))
      .map(e => ({ e, score: ws.filter(w => e.nt.includes(w)).length * 10 + (e.n.includes(norm(q)) ? 5 : 0) }))
      .sort((a, b) => b.score - a.score);
    if (!hits.length) { out.textContent = 'No matches.'; return; }
    const top = hits.slice(0, 40);
    out.innerHTML = `<p class="a-footnote">${hits.length} match${hits.length === 1 ? '' : 'es'}${hits.length > top.length ? `, first ${top.length} shown` : ''}</p><ul class="a-list">${top.map(({ e }) =>
      `<li><a class="a-row a-row--stack" href="${e.p}.html?q=${encodeURIComponent(q)}${e.id ? '#' + e.id : ''}"><span class="g-hit-where">${esc(e.d)}</span><span class="g-hit-title">${mark(e.t, ws)}</span><span class="g-hit-text">${snippet(e.x || e.t, ws)}</span></a></li>`).join('')}</ul>`;
  });
})();
