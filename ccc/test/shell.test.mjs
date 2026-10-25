// The offline copy (sw.js) and the update rules: every file the app loads is in SHELL, the pins agree, the raters' page
// is left to the network, and a new version waits for the right moment. Run: node ccc/test/shell.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reloadAllowed } from '../js/update.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const local = new Set(shell.filter(f => !/^https?:/.test(f) && f !== './').map(f => path.relative(dir, path.resolve(dir, f))));

// every module the page loads (static imports from app.js, plus the two it loads with import()) is saved for offline
const seen = new Set();
const walk = f => {
  if (seen.has(f)) return; seen.add(f);
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s*['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) walk(path.resolve(path.dirname(f), m[1] || m[2]));
};
walk(path.join(dir, 'js/app.js'));
for (const f of seen) assert.ok(local.has(path.relative(dir, f)), `${path.relative(dir, f)} is imported by the app but missing from sw.js SHELL`);
assert.ok(!local.has('js/rate.js'), 'the raters’ page is not part of the offline copy');

// the pins: sw.js, app-sync.js and update.js name the same exact versions
const pin = (text, base) => [...new Set([...text.matchAll(new RegExp(base.replace(/\./g, '\\.') + '(\\d+\\.\\d+\\.\\d+)/', 'g')).map(m => m[1])])];
const syncPin = pin(fs.readFileSync(path.join(dir, 'js/app-sync.js'), 'utf8'), 'https://core.anawj.com/sync/');
assert.deepEqual(syncPin, ['0.6.0']);
assert.deepEqual(pin(sw, 'https://core.anawj.com/sync/'), syncPin, 'sw.js precaches the app-sync version the page imports');
const updPin = pin(fs.readFileSync(path.join(dir, 'js/update.js'), 'utf8'), 'https://core.anawj.com/update/');
assert.deepEqual(updPin, ['0.2.0']);
assert.deepEqual(pin(sw, 'https://core.anawj.com/update/'), updPin, 'sw.js loads the update core the page registers with');
for (const f of ['index', 'src/sync', 'src/writes', 'src/conflict', 'src/store', 'src/outbox', 'src/watchdog', 'src/persist', 'src/status', 'src/firestore', 'src/forget', 'src/registry', 'src/report', 'src/app'])
  assert.ok(shell.includes(`https://core.anawj.com/sync/${syncPin[0]}/${f}.js`), `app-sync ${f}.js is precached`);

// the anonymous raters’ page, the demo landing page and the status page never go through the app’s worker
const never = eval(sw.match(/never: (\[[^\]]*\])/)[1]);
for (const p of ['/ccc/rate/', '/ccc/rate/index.html', '/ccc/demo/', '/ccc/status/ccc.md']) assert.ok(never.some(m => m.test(p)), p + ' is left to the network');
assert.ok(!never.some(m => m.test('/ccc/')), 'the app itself is served by the worker');
assert.match(sw, /const VERSION = 'ccc-v\d+'/);
assert.doesNotMatch(fs.readFileSync(path.join(dir, 'js/rate.js'), 'utf8') + fs.readFileSync(path.join(dir, 'js/store.js'), 'utf8') + fs.readFileSync(path.join(dir, 'js/overlay.js'), 'utf8'), /app-sync|writes\.js'/, 'the raters’ page (rate.js, store.js) never loads the sync engine');

// a new version reloads the page only at a quiet moment
assert.equal(reloadAllowed({}), true);
assert.equal(reloadAllowed({ sheetOpen: true }), false, 'a sheet is open');
assert.equal(reloadAllowed({ typing: true }), false, 'someone is typing');
assert.equal(reloadAllowed({ unsent: 2 }), false, 'changes are still sending');
assert.equal(reloadAllowed({ unsaved: true }), false, 'typed text is not saved on this device yet');
console.log('ccc shell: all checks passed');
