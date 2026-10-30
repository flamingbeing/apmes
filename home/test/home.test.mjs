// Home page data and helpers (no browser). Run: node home/test/home.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LINKS, SECTIONS, visibleSections, isInstalled, openAttrs, installable } from '../js/links.js';
import { themeFor, switchState, setTheme, followLogbook, HOME_KEY, LOGBOOK_THEME_KEY } from '../js/theme.js';
import { countRows, hasSignIn, isOn, setOn } from '../js/counts.js';
import { CATEGORIES } from '../../logbook/js/categories.js';

function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('only live links show; Logbook first; beta apps hidden; the guidebook shown', () => {
  const v = visibleSections();
  assert.deepEqual(v.map(s => s.id), ['apps', 'medhub']);
  assert.equal(v[0].links[0].label, 'Open Logbook');
  assert.equal(v[0].links[0].primary, true);
  assert.deepEqual(v[0].links.map(l => l.url), ['/logbook/', '/guide/'], 'the guidebook sits with the apps');
  for (const l of LINKS) assert.ok(SECTIONS.some(s => s.id === l.section), l.label);
  // flipping one flag takes a section off the page (or puts it back)
  assert.ok(!visibleSections(LINKS.map(l => (l.section === 'medhub' ? { ...l, live: false } : l))).some(s => s.id === 'medhub'));
});

test('links: inside this site or https only', () => {
  for (const l of LINKS) assert.match(l.url, l.external ? /^https:\/\// : /^\/[a-z0-9]+\/$/, l.label);
});

test('installed app: links open in a new window (so the Logbook opens as its own app); a browser tab keeps them', () => {
  const win = (mode, standalone) => ({ navigator: { standalone }, matchMedia: q => ({ matches: q === `(display-mode: ${mode})` }) });
  assert.equal(isInstalled(win('browser')), false);
  assert.equal(isInstalled(win('standalone')), true);
  assert.equal(isInstalled(win('browser', true)), true, "iOS home-screen app");
  assert.equal(isInstalled({}), false);
  assert.deepEqual(openAttrs('/logbook/', false), { href: '/logbook/' });
  assert.deepEqual(openAttrs('/logbook/', true), { href: '/logbook/', target: '_blank', rel: 'noopener' });
});

test('install list: Home first, then each live app on this site, never MedHub', () => {
  assert.deepEqual(installable().map(a => a.url), ['/home/', '/logbook/', '/guide/']);
  assert.deepEqual(installable().map(a => a.label), ['APMES Home', 'Logbook', 'Guidebook']);
});

test('theme follows the Logbook until this page picks one', () => {
  assert.deepEqual(themeFor(mem()), { theme: 'light', oled: false });
  assert.deepEqual(themeFor(mem({ [LOGBOOK_THEME_KEY]: 'dark' })), { theme: 'dark', oled: false });
  assert.deepEqual(themeFor(mem({ [LOGBOOK_THEME_KEY]: 'oled' })), { theme: 'dark', oled: true });
  assert.deepEqual(themeFor(mem({ [LOGBOOK_THEME_KEY]: 'auto' })), { theme: 'auto', oled: false });
  assert.equal(switchState(mem({ [LOGBOOK_THEME_KEY]: 'auto' }), true), 'dark');
  const s = mem({ [LOGBOOK_THEME_KEY]: 'dark' });
  setTheme(s, 'light');
  assert.deepEqual(themeFor(s), { theme: 'light', oled: false });
  assert.equal(s.getItem(LOGBOOK_THEME_KEY), 'dark', "the Logbook's own choice is never touched");
  followLogbook(s);
  assert.equal(s.getItem(HOME_KEY), null);
  assert.equal(themeFor(s).theme, 'dark');
});

test('counts: off by default, a sign-in seen from the Logbook, rows in category order', () => {
  const s = mem();
  assert.equal(isOn(s), false);
  setOn(s, true); assert.equal(isOn(s), true);
  setOn(s, false); assert.equal(isOn(s), false);
  assert.equal(hasSignIn(mem()), false);
  assert.equal(hasSignIn(mem({ 'apmes-logbook-who:demo:a@x.org': '{}' })), false);
  assert.equal(hasSignIn(mem({ 'apmes-logbook-who:a@x.org': '{}' })), true);
  const rows = countRows({ total: 9, counts: { 13: 4, '01': 3, '15ii': 2, zz: 5 } }, CATEGORIES);
  assert.deepEqual(rows.map(r => [r.code, r.n]), [['01', 3], ['13', 4]], 'retired and unknown codes left out');
  assert.equal(rows[0].name, 'Cardiac surgery with CPB');
  assert.deepEqual(countRows(null, CATEGORIES), []);
});
