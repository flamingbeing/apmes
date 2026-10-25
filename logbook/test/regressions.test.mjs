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

// One exact app-sync version everywhere (js/app-sync.js, sw.js's precache, index.html's preload), with every module it
// loads precached, so the app opens offline after an upgrade; one update-core version in sw.js and app-version.js, and
// the worker waits for the page's go (no reload while someone types or a change is sending).
{
  const read = f => readFileSync(new URL(`../logbook/${f}`, here), 'utf8');
  const sw = read('sw.js'), pin = /core\.anawj\.com\/sync\/(\d+\.\d+\.\d+)\/index\.js/.exec(read('js/app-sync.js'))[1];
  for (const [f, text] of [['sw.js', sw], ['index.html', read('index.html')]]) {
    const vs = new Set([...text.matchAll(/core\.anawj\.com\/sync\/([^/]+)\//g)].map(m => m[1]));
    assert.deepEqual([...vs], [pin], `${f}: app-sync pinned at ${pin} only`);
  }
  const index = await (await fetch(`https://core.anawj.com/sync/${pin}/index.js`)).text();
  for (const [, mod] of index.matchAll(/from '\.\/(src\/[a-z]+\.js)'/g)) assert.ok(sw.includes(`'https://core.anawj.com/sync/${pin}/${mod}'`), `sw.js precaches ${mod}`);
  const upd = new Set([...sw.matchAll(/core\.anawj\.com\/update\/([^/]+)\//g), ...read('js/app-version.js').matchAll(/core\.anawj\.com\/update\/([^/]+)\//g)].map(m => m[1]));
  assert.equal(upd.size, 1, 'one update-core version: ' + [...upd]);
  assert.match(sw, /waitForGo: true/, 'sw.js waits for the page\'s go');
}

console.log('regressions ok');
