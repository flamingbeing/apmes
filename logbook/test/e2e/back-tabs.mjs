// Fake data only. Back with tabs, as Android apps do (app-ui tab-back.js): switching tabs adds at most one history
// entry; Back on another tab goes to the first tab, and Back there leaves the app. A page pushed over a tab (Settings)
// still closes first with Back, and a tab tap from it adds nothing.
import assert from 'node:assert/strict';
import { launch, engine } from './browsers.mjs';
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await launch();
if (!b) { console.log(`SKIP back with tabs: ${engine} not installed`); process.exit(0); }
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('apmes-logbook-demo-small', '1'); } catch { /* about:blank, once Back has left */ } });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const tab = () => p.evaluate(async () => (await import('./js/ui-core.js')).S.tab);
  const until = async (fn, msg) => { for (let i = 0; i < 40; i++) { if (await fn()) return; await p.waitForTimeout(75); } throw new Error(msg); };
  const shows = async (id, msg) => until(async () => await tab() === id && await p.evaluate(i => document.getElementById('app')?.dataset.page === i, id), `${msg}: shows ${await tab()}`);
  const tapTab = async id => { await p.locator(`[role=tab][data-tab="${id}"]`).click(); await shows(id, `tap ${id}`); };
  const len = () => p.evaluate(() => history.length);
  await p.goto(base + '?demo'); await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
  const tabs = await p.locator('[role=tab][data-tab]').evaluateAll(els => els.map(e => e.dataset.tab));
  const first = await tab();
  assert.ok(tabs.includes(first), 'opens on a tab');
  const [a, bb, c] = tabs.filter(t => t !== first);
  assert.ok(c, `three other tabs on the bar (${tabs})`);
  const start = await len();
  await tapTab(a); await tapTab(bb); await tapTab(c);
  assert.ok(await len() - start <= 1, `tabs A -> B -> C added ${await len() - start} entries`);
  await p.goBack(); await shows(first, 'Back on another tab'); assert.match(p.url(), new RegExp('#' + first + '$'));
  // a page pushed over a tab closes first; a tab tap from it adds nothing
  await tapTab('more');
  await p.locator('a[href$="#settings"], button:has-text("Settings")').first().click(); await shows('settings', 'Settings');
  await p.goBack(); await shows('more', 'Back closes Settings first');
  await p.locator('a[href$="#settings"], button:has-text("Settings")').first().click(); await shows('settings', 'Settings again');
  await tapTab(a);
  assert.ok(await len() - start <= 2, `a tab tap from Settings unwinds it (${await len() - start})`);
  await p.goBack(); await shows(first, 'Back from a tab after Settings');
  // Back on the first tab stays (a toast says Back again closes); Back again within 2 s leaves the app
  await p.goBack(); await p.waitForTimeout(300); await shows(first, 'first Back on the first tab stays');
  await p.goBack(); await until(async () => p.url() === 'about:blank', `Back again on the first tab leaves (at ${p.url()})`);
  assert.deepEqual(errors, []);
  console.log(`PASS back with tabs (${engine} ${width})`);
  await ctx.close();
} } finally { await b.close(); }
