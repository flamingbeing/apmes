// Tap to hide (js/hide-mode.js, theme-revamp S6): the device's hidden list. What may be hidden on a page is covered
// by test/e2e/hide-mode.mjs.
import assert from 'node:assert/strict';
import { cleanHideList, hideKey, MAX_HIDDEN } from '../js/hide-mode.js';

assert.deepEqual(cleanHideList([
  { tab: 'logbook', kind: 'btn', name: '  Share   day ' },
  { tab: 'logbook', kind: 'btn', name: 'Share day' },       // a repeat
  { tab: 'log', kind: 'card', name: 'Recent' },
  { tab: 'log', kind: 'link', name: 'x' },                  // unknown kind
  { tab: '../x', kind: 'btn', name: 'x' },                  // not a page id
  { tab: 'log', kind: 'btn', name: '' },
  null, 'x', 3,
]), [{ tab: 'logbook', kind: 'btn', name: 'Share day' }, { tab: 'log', kind: 'card', name: 'Recent' }]);
assert.deepEqual(cleanHideList(null), []);
assert.deepEqual(cleanHideList({ a: 1 }), []);
assert.equal(cleanHideList([{ tab: 'log', kind: 'btn', name: 'y'.repeat(200) }])[0].name.length, 60);
assert.equal(cleanHideList(Array.from({ length: MAX_HIDDEN + 5 }, (_, i) => ({ tab: 'log', kind: 'btn', name: 'b' + i }))).length, MAX_HIDDEN);
assert.equal(hideKey({ tab: 'log', kind: 'btn', name: 'Copy' }), 'log|btn|Copy');
console.log('hide mode tests passed');
