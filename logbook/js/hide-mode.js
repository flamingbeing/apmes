// Tap to hide (theme-revamp S6, P1; Settings → Layout → Hide buttons and cards): in Hide mode a tap on a button or a
// card on a page hides it on this device, and Layout lists what is hidden, each with Show, and Show all. What stays
// (owner's rule): Save and every page's main (filled) button, the case box and any card holding one of them, the tab
// bar, the header, pop-ups, and every Settings page (where the list is), so nothing needed to undo can go. Choices
// (Case | List) stay so no one is stuck on one side, and names with a number (a calendar day, "Edit all 6 cases") can't
// be found again, so they stay too. A hidden
// item is matched by its page, kind and words (a button's label, a card's heading), so it stays hidden after the page
// is drawn again; ?nohide in the address shows everything for that visit. The list is pure; the rest needs a page.

export const MAX_HIDDEN = 100;
const KINDS = ['btn', 'card'];
const PROTECT_WORDS = /^(save|undo|done|cancel|close|back|settings|sign in|sign out|show all)\b/i;
const BUTTONS = 'button, a.btn, label.btn';
const KEEP_OUT = 'dialog, .modal, #toast, #tabs, .top, .hide-bar, [data-keep]';

const word = s => String(s || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
export const hideKey = x => `${x.tab}|${x.kind}|${x.name}`;
// [{ tab, kind, name }]: known kinds, short words, no repeats
export function cleanHideList(v) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(v) ? v : []) {
    if (!x || typeof x !== 'object') continue;
    const e = { tab: word(x.tab).slice(0, 20), kind: x.kind, name: word(x.name) };
    if (!/^[a-z0-9]+$/.test(e.tab) || !KINDS.includes(e.kind) || !e.name || seen.has(hideKey(e))) continue;
    seen.add(hideKey(e)); out.push(e);
    if (out.length >= MAX_HIDDEN) break;
  }
  return out;
}

// the words that name an element: a button's label, a card's first heading (none: it can't be hidden)
export function nameOf(el) {
  if (el.matches(BUTTONS)) return word(el.getAttribute('aria-label') || el.textContent || el.getAttribute('title'));
  const head = el.querySelector('h2, h3, summary, legend');
  return head ? word(head.textContent) : '';
}
const isKept = el => el.matches('.primary, textarea, [data-keep]') || (el.matches(BUTTONS) && PROTECT_WORDS.test(nameOf(el)));
// why it can't be hidden, or '' when it can
export function keptBecause(el) {
  if (el.closest(KEEP_OUT)) return 'The tab bar, the header and pop-ups always stay.';
  if (el.matches('section.card') && [...el.querySelectorAll(`${BUTTONS}, textarea`)].some(isKept)) return 'It holds Save or the case box, which always stay.';
  if (!nameOf(el)) return 'It has no name to find it by again.';
  if (isKept(el)) return 'Save, the main button and the case box always stay.';
  if (el.matches('[aria-pressed], [role=tab], [role=radio]') || el.closest('.seg')) return 'Choices between options always stay, so you can always switch back.';
  if (/\d/.test(nameOf(el))) return 'Its name changes with your cases (a date or a count), so it can’t be found again.';
  return '';
}
// the element a tap is about: the button tapped, else the card around it
export function targetOf(node) {
  const btn = node.closest(BUTTONS);
  return btn || node.closest('section.card');
}
const kindOf = el => (el.matches(BUTTONS) ? 'btn' : 'card');
export const entryFor = (el, tab) => ({ tab, kind: kindOf(el), name: nameOf(el) });

// hide the listed items of this page in root (class user-hidden, style.css); with hide mode on, mark what can go
export function applyHidden(root, tab, list, { free = false, marking = false } = {}) {
  if (!root) return;
  const off = free || /[?&]nohide\b/.test(location.search);
  const keys = new Set(off ? [] : cleanHideList(list).filter(x => x.tab === tab).map(hideKey));
  for (const el of root.querySelectorAll(`${BUTTONS}, section.card`)) {
    const hit = keys.size > 0 && keys.has(hideKey(entryFor(el, tab))) && !keptBecause(el);
    el.classList.toggle('user-hidden', hit);
    el.classList.toggle('hide-cand', marking && !free && !hit && !keptBecause(el));
  }
}
