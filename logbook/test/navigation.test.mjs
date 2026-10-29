import assert from 'node:assert/strict';
import { createNavigation, movedSetting } from '../js/navigation.js';

function browser(hash = '#log') {
  const location = { pathname: '/logbook/', search: '?demo', hash };
  const entries = [{ state: null, url: '/logbook/?demo' + hash }];
  let index = 0, scroll = 0;
  const history = {
    get state() { return structuredClone(entries[index].state); },
    replaceState(state, _, url) { entries[index] = { state: structuredClone(state), url }; location.hash = url.slice(url.indexOf('#')); },
    pushState(state, _, url) { entries.splice(++index); entries.push({ state: structuredClone(state), url }); location.hash = url.slice(url.indexOf('#')); },
    back() { if (index) { index--; location.hash = entries[index].url.slice(entries[index].url.indexOf('#')); } },
    forward() { if (index + 1 < entries.length) { index++; location.hash = entries[index].url.slice(entries[index].url.indexOf('#')); } },
  };
  const visited = [];
  const nav = createNavigation({ history, location, parents: { display: 'settings', settings: 'more', account: 'more' },
    allowed: id => ['log', 'more', 'settings', 'display', 'account'].includes(id),
    getScroll: () => scroll, onNavigate: (tab, y) => visited.push([tab, y]) });
  return { nav, history, location, entries, visited, scroll: y => { scroll = y; } };
}
{
  const b = browser();
  b.nav.initialize('log');
  assert.equal(b.entries.length, 1, 'a root screen does not trap Back');
  b.scroll(120); b.nav.go('more'); b.nav.go('account');
  assert.equal(b.entries.length, 3, 'tabs and menus add history');
  assert.equal(b.nav.backTarget('more'), 'more');
  b.nav.back('more'); b.nav.sync('more');
  assert.equal(b.entries.length, 3, 'Back does not add a loop');
  b.history.back(); b.nav.sync('log');
  assert.deepEqual(b.visited.at(-1), ['log', 120], 'Back restores scroll');
  b.history.forward(); b.nav.sync('more');
  assert.equal(b.visited.at(-1)[0], 'more');
  b.nav.go('more'); assert.equal(b.entries.length, 3, 'same-screen tap is a no-op');
  assert.ok(b.entries.every(e => e.url.startsWith('/logbook/?demo#')), 'demo query retained');
}
{
  const b = browser('#display'); b.nav.initialize('display');
  assert.deepEqual(b.entries.map(e => e.state.logbookNav.tab), ['more', 'settings', 'display']);
  b.nav.initialize('display'); assert.equal(b.entries.length, 3, 'reload does not reseed parents');
  b.history.back(); b.nav.sync('settings'); assert.equal(b.visited.at(-1)[0], 'settings');
  b.nav.back('more'); b.nav.sync('more'); assert.equal(b.visited.at(-1)[0], 'more');
}
{
  const b = browser(); b.nav.initialize('log');
  // Native location.hash changes copy the prior history state into the new entry.
  b.history.pushState(b.history.state, '', '/logbook/?demo#account'); b.nav.sync('account');
  assert.equal(b.entries.length, 2, 'native hash change tagged without a second push');
  assert.equal(b.visited.at(-1)[0], 'account');
  b.nav.sync('account'); assert.equal(b.visited.length, 1, 'popstate/hashchange pair renders once');
  b.nav.back('more'); b.nav.sync('log'); assert.equal(b.visited.at(-1)[0], 'log');
}
// Back with tabs (app-ui tab-back.js): switching tabs adds at most one entry; Back on another tab goes to the first
// tab, Back there leaves; pages over a tab still push, and a tab tap from one unwinds them
{
  const { tabBack } = await import('../js/kit.js');
  const tick = () => new Promise(r => setTimeout(r, 0));
  function tabbed(hash = '#log', first = 'log') {
    const location = { pathname: '/logbook/', search: '', hash };
    const entries = [{ state: null, url: '/logbook/' + hash }];
    let index = 0;
    const listeners = [];
    const events = { addEventListener: (t, f) => t === 'popstate' && listeners.push(f), removeEventListener() {} };
    const moved = () => { location.hash = entries[index].url.slice(entries[index].url.indexOf('#')); setTimeout(() => listeners.forEach(f => f())); };
    const history = {
      get state() { return structuredClone(entries[index].state); },
      replaceState(state, _, url = entries[index].url) { entries[index] = { state: structuredClone(state), url }; location.hash = url.slice(url.indexOf('#')); },
      pushState(state, _, url = entries[index].url) { entries.splice(++index); entries.push({ state: structuredClone(state), url }); location.hash = url.slice(url.indexOf('#')); },
      back() { history.go(-1); },
      go(d) { const to = index + d; if (to < 0) { index = -1; return; } if (to < entries.length) { index = to; moved(); } },
    };
    const visited = [];
    const nav = createNavigation({ history, location, parents: { settings: 'more', layout: 'settings' },
      allowed: id => ['log', 'logbook', 'reflect', 'more', 'settings', 'layout'].includes(id),
      onNavigate: tab => visited.push(tab), tabBack, events,
      isTab: id => ['log', 'logbook', 'reflect', 'more'].includes(id), firstTab: () => first });
    events.addEventListener('popstate', () => { if (index >= 0) nav.sync(location.hash.slice(1)); });
    return { nav, entries, visited, history, location, at: () => index };
  }
  const b = tabbed();
  b.nav.initialize('log');
  b.nav.go('logbook'); b.nav.go('reflect'); b.nav.go('more');
  assert.equal(b.entries.length, 2, 'tab A -> B -> C -> D adds one entry');
  assert.equal(b.location.hash, '#more');
  b.history.back(); await tick();
  assert.equal(b.location.hash, '#log'); assert.equal(b.visited.at(-1), 'log', 'Back on another tab: the first tab');
  b.history.back();
  assert.equal(b.at(), -1, 'Back on the first tab leaves');

  const c = tabbed(); c.nav.initialize('log');
  c.nav.go('logbook'); c.nav.go('log'); await tick();
  assert.equal(c.at(), 0, 'tapping the first tab takes its entry away'); assert.equal(c.visited.at(-1), 'log');
  c.nav.go('more'); c.nav.go('settings'); c.nav.go('layout');
  assert.equal(c.entries.length, 4, 'pages over a tab push');
  c.history.back(); await tick(); assert.equal(c.visited.at(-1), 'settings', 'Back closes a pushed page first');
  c.nav.go('layout'); c.nav.go('reflect'); await tick();
  assert.equal(c.location.hash, '#reflect'); assert.equal(c.at(), 1, 'a tab tap from a pushed page unwinds it');
  assert.equal(c.visited.at(-1), 'reflect');
  c.history.back(); await tick(); assert.equal(c.visited.at(-1), 'log');

  // opened on a link to another tab: that entry becomes the first tab's once Back comes down to it
  const d = tabbed('#reflect'); d.nav.initialize('reflect');
  d.nav.go('logbook'); assert.equal(d.entries.length, 2);
  d.history.back(); await tick();
  assert.equal(d.location.hash, '#log'); assert.equal(d.visited.at(-1), 'log', 'Back from a tab lands on the first tab');
  // a native hash change to a tab (location.hash = '#logbook', state copied) is kept as a base tab entry: the first
  // tab replaces it, never steps back below it
  d.nav.go('more'); d.nav.go('settings');
  d.history.pushState(d.history.state, '', '/logbook/#logbook'); d.nav.sync('logbook');
  assert.equal(d.visited.at(-1), 'logbook'); const at = d.at();
  d.nav.go('log'); await tick();
  assert.equal(d.at(), at, 'replaced in place'); assert.equal(d.location.hash, '#log'); assert.equal(d.visited.at(-1), 'log');
  d.nav.go('reflect'); d.history.back(); await tick();
  assert.equal(d.location.hash, '#log', 'Back from a tab over it: the first tab');
}
// theme-revamp S3: Display and Advanced display are gone; old links and copied links to a setting land on its new page
{
  assert.deepEqual(movedSetting('display', ''), ['layout', '']);
  assert.deepEqual(movedSetting('displayadv', ''), ['themes', '']);
  assert.deepEqual(movedSetting('display', 'Display'), ['layout', ''], 'the old heading just opens the page');
  assert.deepEqual(movedSetting('display', 'Compact mode (Tight spacing)'), ['themes', 'Spacing'], 'a renamed setting by its new name');
  assert.deepEqual(movedSetting('displayadv', 'Page width'), ['layout', 'Page width']);
  assert.deepEqual(movedSetting('displayadv', 'Page'), ['layout', 'Page']);
  assert.deepEqual(movedSetting('displayadv', 'Page titles in the header'), ['themes', 'Page titles in the header'], 'not taken for Page');
  assert.deepEqual(movedSetting('displayadv', 'Tab bar'), ['layout', 'Tab bar']);
  assert.deepEqual(movedSetting('displayadv', 'Icons only in the tab bar'), ['themes', 'Icons only in the tab bar']);
  assert.deepEqual(movedSetting('displayadv', 'Custom CSS (advanced)'), ['themes', 'Custom CSS (advanced)']);
  assert.deepEqual(movedSetting('access', 'Swipe left or right to change tab'), ['layout', 'Swipe left or right to change tab']);
  assert.deepEqual(movedSetting('access', 'Text size'), ['access', 'Text size'], 'what stayed stays');
  assert.deepEqual(movedSetting('logging', 'Teach it from an example'), ['logging', 'Teach it from an example']);
}
console.log('navigation tests passed');
