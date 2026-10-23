// The APMES home page (apmes.anawj.com/): the live apps, MedHub and the guidebook (/guide/), from links.js;
// the counts card (counts.js, off unless turned on on this device) and a Light / Dark switch (theme.js).
import { visibleSections } from './links.js';
import * as theme from './theme.js';
import * as counts from './counts.js';

const store = (() => { try { return window.localStorage; } catch { return null; } })() || { getItem: () => null, setItem() {}, removeItem() {}, length: 0, key: () => null };

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter(x => x != null && x !== false));
  return el;
}

function row(link) {
  return h('li', {}, h('a', { class: 'a-row', href: link.url },
    h('span', { class: 'a-row-text' }, link.label, link.note ? h('small', {}, link.note) : null),
    link.external ? h('span', { class: 'h-ext', 'aria-label': '(another site)' }, '↗') : h('span', { class: 'a-chev', 'aria-hidden': 'true' })));
}

function sections() {
  return visibleSections().map(s => {
    const first = s.links.find(l => l.primary), rest = s.links.filter(l => !l.primary);
    return h('section', { 'aria-labelledby': 'h-' + s.id },
      h('h2', { class: 'a-section', id: 'h-' + s.id }, s.title),
      first ? h('a', { class: 'a-btn a-btn--block h-primary', href: first.url }, first.label) : null,
      rest.length ? h('ul', { class: 'a-list' }, rest.map(row)) : null,
      s.note ? h('p', { class: 'a-footnote' }, s.note) : null);
  });
}

// ---- counts card ----
const card = h('div', { class: 'a-card h-counts', 'aria-live': 'polite' });
const msg = (text, link) => [h('p', { class: 'h-msg' }, text), link ? h('a', { class: 'a-btn a-btn--tinted a-btn--block', href: '/logbook/' }, link) : null];

async function paintCounts() {
  if (!counts.isOn(store)) { card.hidden = true; return; }
  card.hidden = false;
  if (!counts.hasSignIn(store)) return card.replaceChildren(...msg('Not signed in on this device.', 'Sign in through the Logbook'));
  card.replaceChildren(h('p', { class: 'h-msg a-muted' }, 'Loading your counts…'));
  let r;
  try { r = await counts.loadCounts(); } catch { return card.replaceChildren(...msg('Your counts need a connection. Try again when you are online.')); }
  if (!counts.isOn(store)) return paintCounts();   // turned off while loading
  if (r.state === 'signed-out') return card.replaceChildren(...msg('Not signed in on this device.', 'Sign in through the Logbook'));
  if (r.state === 'no-entry') return card.replaceChildren(...msg('Your Logbook is not linked to a programme entry yet.', 'Open Logbook'));
  if (r.state === 'empty') return card.replaceChildren(...msg('No counts yet: they appear once you log a case.', 'Open Logbook'));
  card.replaceChildren(
    h('p', { class: 'h-total' }, h('strong', {}, String(r.total)), r.total === 1 ? ' case logged' : ' cases logged'),
    r.rows.length ? h('details', { class: 'h-cats' }, h('summary', {}, 'By category'),
      h('table', {}, h('tbody', {}, r.rows.map(x => h('tr', {}, h('th', { scope: 'row' }, `${x.code} ${x.name}`), h('td', {}, String(x.n))))))) : null);
}

function countsSection() {
  const sw = h('input', { type: 'checkbox', class: 'a-switch', role: 'switch', id: 'h-counts-on', checked: counts.isOn(store), onchange: e => { counts.setOn(store, e.target.checked); paintCounts(); } });
  return h('section', { 'aria-labelledby': 'h-counts' },
    h('h2', { class: 'a-section', id: 'h-counts' }, 'My case counts'),
    h('ul', { class: 'a-list' }, h('li', {}, h('label', { class: 'a-row', for: 'h-counts-on' },
      h('span', { class: 'a-row-text' }, 'Show my counts here', h('small', {}, 'From your Logbook. Saved on this device only.')), sw))),
    card);
}

// ---- Light / Dark ----
function themeSection() {
  const group = h('div', { role: 'group', 'aria-labelledby': 'h-theme-l' });
  const dark = () => window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  const paint = () => {
    const cur = theme.switchState(store, dark());
    group.replaceChildren(h('div', { class: 'a-seg' }, [['light', 'Light'], ['dark', 'Dark']].map(([id, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(id === cur), onclick: () => { theme.setTheme(store, id); theme.apply(document, store); paint(); } }, label))));
  };
  paint();
  return h('section', { 'aria-labelledby': 'h-theme' },
    h('h2', { class: 'a-section', id: 'h-theme' }, 'This page'),
    h('ul', { class: 'a-list' },
      h('li', {}, h('div', { class: 'a-row' }, h('span', { class: 'a-row-text', id: 'h-theme-l' }, 'Theme'), group)),
      h('li', {}, h('button', { type: 'button', class: 'a-row', onclick: () => { theme.followLogbook(store); theme.apply(document, store); paint(); } },
        h('span', { class: 'a-row-text' }, 'Match the Logbook again')))),
    h('p', { class: 'a-footnote' }, 'Follows the Logbook’s theme on this device until you pick one here.'));
}

const main = document.getElementById('main');
main.append(...sections(), countsSection(), themeSection(),
  h('p', { class: 'a-footnote h-foot' }, 'Unofficial programme tools. They do not replace the official record.'));
paintCounts();
