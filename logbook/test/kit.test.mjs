// The UI kit (js/kit.js) is pinned once: index.html loads the same version, sw.js keeps every kit file the page loads
// (offline), and the kit's layers come first in the cascade order, so the logbook's own styles always win.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KIT, KIT_VERSION, KIT_SHELL } from '../js/kit.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('kit: one version in kit.js, index.html and sw.js; sw.js keeps every kit file', () => {
  const html = read('index.html'), sw = read('sw.js');
  const pins = new Set([...(html + sw).matchAll(/core\.anawj\.com\/ui\/([^/]+)\//g)].map(m => m[1]));
  assert.deepEqual([...pins], [KIT_VERSION]);
  for (const f of KIT_SHELL) assert.ok(sw.includes(`'${f}'`), `sw.js SHELL keeps ${f}`);
  assert.ok(sw.includes("'js/kit.js'"));
  assert.ok(html.includes(`${KIT}theme/early.js`) && html.includes(`${KIT}theme/theme.css") layer(kit)`));
});

test('kit: its layers come before the logbook\'s, and kitoff takes its base rules off', () => {
  const html = read('index.html');
  assert.match(html, /@layer kit, kitoff, base, facets, theme, tune, custom;/);
  assert.match(html, /@layer kitoff \{[^}]*button[^}]*\{ all: revert; \}/);
});
