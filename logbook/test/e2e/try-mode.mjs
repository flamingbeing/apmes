// Fake data only. See it in action (owner, 23 Oct 2026; app.js tryMode): the slim Display preview's button opens the
// real Logbook with a bar to step through themes and flip light or dark; Done goes back to the settings page.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const open = async (hash, id) => { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForFunction(x => document.getElementById('app').dataset.page === x, id); };
  const theme = () => p.evaluate(() => JSON.parse(localStorage.getItem('apmes-logbook-display') || '{}').theme || 'nuhs');
  const bar = p.locator('.try-bar');
  await p.goto(base + '?demo#themes'); await p.waitForFunction(() => document.getElementById('app').dataset.page === 'themes');

  // the preview is one slim, unpinned line on each look page
  for (const id of ['themes', 'themesadv', 'layout', 'access']) {
    await open('#' + id, id);
    const box = await p.locator('#app .display-preview').boundingBox();
    assert(box.height < 70, `${id}: preview ${box.height}px tall`);
    assert.equal(await p.locator('#app .display-preview').evaluate(e => getComputedStyle(e).position), 'static');
  }

  // See it in action: the real Logbook with the bar; the tab bar and the page still work
  await open('#themes', 'themes');
  await p.locator('#app button.try-it').click();
  await bar.waitFor();
  await p.waitForFunction(() => document.getElementById('app').dataset.page === 'logbook');
  const first = await theme();
  await bar.getByRole('button', { name: 'Next theme' }).click();
  assert.notEqual(await theme(), first, 'Next did not change the theme');
  await bar.getByRole('button', { name: 'Previous theme' }).click();
  assert.equal(await theme(), first, 'Previous did not step back');
  await bar.locator('select').selectOption('whatsapp');
  assert.equal(await theme(), 'whatsapp');
  assert.equal(await bar.locator('select').inputValue(), 'whatsapp');
  const mode = () => p.evaluate(() => document.documentElement.dataset.theme);
  const was = await mode();
  await bar.getByRole('button', { name: was === 'dark' ? 'Light' : 'Dark' }).click();
  assert.notEqual(await mode(), was, 'light or dark did not flip');
  await p.locator('#tabs [data-tab=log], #tabs a[href="#log"]').first().click();
  await p.waitForFunction(() => document.getElementById('app').dataset.page === 'log');
  assert.equal(await bar.count(), 1, 'bar gone on another tab');

  // Done goes back to the page it came from; opening Settings another way also ends it
  await bar.getByRole('button', { name: 'Done' }).click();
  await p.waitForFunction(() => document.getElementById('app').dataset.page === 'themes');
  assert.equal(await bar.count(), 0);
  await open('#access', 'access');
  await p.locator('#app button.try-it').click(); await bar.waitFor();
  await open('#settings', 'settings');
  assert.equal(await bar.count(), 0, 'bar stayed on Settings');
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('try-mode')), false);

  assert.deepEqual(errors, []);
  console.log('PASS see it in action');
} finally { await b.close(); }
