// Run with: node logbook/test/regressions.test.mjs  (fake data only)
// Review findings from docs/regressions.md that had no test of their own. The rest are covered elsewhere
// (map in docs/regressions.md, "Where each finding is tested").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tagName } from '../js/tags.js';

const here = new URL('..', import.meta.url);

// Removed personal tags show as "Removed tag", never their raw key; built-in and older keys keep their names.
assert.equal(tagName([], 'u:k7x2'), 'Removed tag', 'a removed personal tag');
assert.equal(tagName([{ k: 'u:k7x2', n: 'Awake fibreoptic' }], 'u:k7x2'), 'Awake fibreoptic', 'a personal tag still on the list');
assert.equal(tagName([], '26:Interscalene'), 'Interscalene', 'older subcategory key');

// Service workers key cached navigations by the folder ('./'), never 'index.html': Cloudflare answers
// 'index.html' with a redirect to the folder, and a cached redirect breaks reloads.
for (const app of ['logbook', 'evals']) {
  const sw = readFileSync(new URL(`../${app}/sw.js`, here), 'utf8');
  const nav = sw.match(/req\.mode === 'navigate' \? ('[^']*')/);
  if (!nav) continue;   // this worker has no navigation key: nothing to regress
  assert.equal(nav[1], "'./'", `${app}/sw.js: navigations keyed by './'`);
  assert.doesNotMatch(sw, /cache\.match\('index\.html'/, `${app}/sw.js: never answers a navigation from 'index.html'`);
}

console.log('regressions ok');
