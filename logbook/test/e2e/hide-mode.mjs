// Fake data only. Power users (theme-revamp S6, 23 Oct 2026): tap to hide (Settings → Layout → Hide buttons and
// cards; hide-mode.js) and the sliders a custom CSS's /* @settings */ comment brings (css-settings.js).
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const page = () => p.evaluate(() => document.getElementById('app').dataset.page);
  const open = async (hash, id) => { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForFunction(x => document.getElementById('app').dataset.page === x, id); };
  const toastText = () => p.locator('#toast').innerText();
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('apmes-logbook-display') || '{}'));
  const tap = async l => { await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await l.click(); };
  const select = () => p.locator('#app button', { hasText: /^Select$/ }).first();
  await p.goto(base + '?demo#layout'); await p.waitForFunction(() => document.getElementById('app').dataset.page === 'layout');
  assert.match(await p.locator('.hide-card').innerText(), /Nothing hidden\./);

  // Start hiding: the Add tab in Hide mode, with the bar
  await p.getByRole('button', { name: 'Start hiding' }).click();
  await p.waitForFunction(() => document.getElementById('app').dataset.page === 'log');
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('hide-mode')), true);
  assert.equal(await p.locator('.hide-bar').isVisible(), true);
  // Save, the case box and the Case | List switch stay, and a tap on them does nothing else
  const before = await p.locator('textarea.details').inputValue();
  await tap(p.locator('#app button.primary', { hasText: 'Save' }).first());
  assert.match(await toastText(), /always stay/);
  await tap(p.locator('textarea.details'));
  assert.match(await toastText(), /always stay/);
  await tap(p.locator('#app .mode-seg button', { hasText: 'List' }));
  assert.match(await toastText(), /switch back/);
  assert.equal(await p.locator('textarea.details').isVisible(), true, 'still on Case');
  assert.equal(await p.locator('textarea.details').inputValue(), before);
  assert.equal(await p.locator('#app .user-hidden').count(), 0);

  // the tab bar still works; a tap hides, Undo brings it back, a second tap hides it again
  await p.locator('#tabs button[data-tab=logbook], #tabs [data-tab=logbook]').first().click();
  await p.waitForFunction(() => document.getElementById('app').dataset.page === 'logbook');
  assert.equal(await p.locator('#app .hide-cand').count() > 0, true, 'outlines what can go');
  await tap(select());
  assert.equal(await select().isVisible(), false, 'Select hidden');
  assert.match(await toastText(), /Hidden: Select/);
  assert.equal(await p.locator('.bulk-bar, .select-bar').count(), 0, 'the tap did not press Select');
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  assert.equal(await select().isVisible(), true, 'Undo shows it');
  await tap(select());
  assert.deepEqual((await stored()).hideList, [{ tab: 'logbook', kind: 'btn', name: 'Select' }]);
  // a day in the calendar (its name has a number) stays
  const day = p.locator('#app button[aria-label$="cases"], #app button[aria-label$="case"]').first();
  if (await day.count()) { await tap(day); assert.match(await toastText(), /switch back|name changes/); assert.equal(await day.isVisible(), true); }

  // Settings pages: nothing hides there
  await open('#settings', 'settings');
  await tap(p.locator('#app a, #app button').first());
  assert.match(await toastText(), /Settings pages/);
  assert.equal(await page(), 'settings');

  // Done: Hide mode ends, Select stays hidden, also after the page redraws and after a reload; ?nohide shows it
  await p.locator('.hide-bar button', { hasText: 'Done' }).click();
  assert.equal(await p.locator('.hide-bar').count(), 0);
  assert.equal(await p.locator('#app .hide-cand').count(), 0);
  await open('#logbook', 'logbook');
  assert.equal(await select().isVisible(), false, 'hidden when drawn again');
  await p.reload(); await p.waitForFunction(() => document.getElementById('app').dataset.page === 'logbook');
  await p.waitForTimeout(200);
  assert.equal(await select().isVisible(), false, 'hidden after a reload');
  await p.goto(base + '?demo&nohide#logbook'); await p.waitForFunction(() => document.getElementById('app').dataset.page === 'logbook');
  await p.waitForTimeout(200);
  assert.equal(await select().isVisible(), true, '?nohide shows everything');

  // Layout lists it; Show brings it back (with Undo)
  await p.goto(base + '?demo#layout'); await p.waitForFunction(() => document.getElementById('app').dataset.page === 'layout');
  assert.match(await p.locator('.hidden-list').innerText(), /Select\s*· button on Logbook/);
  await p.locator('.hidden-list button', { hasText: 'Show' }).click();
  assert.match(await p.locator('.hide-card').innerText(), /Nothing hidden\./);
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  assert.equal(await p.locator('.hidden-list li').count(), 1, 'Undo hides it again');
  // the Layout reset also shows everything
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('apmes-logbook-display')); d.hideList = null; localStorage.setItem('apmes-logbook-display', JSON.stringify(d)); });
  await open('#logbook', 'logbook');
  await p.waitForTimeout(100);
  assert.equal(await select().isVisible(), true);

  // custom CSS with its own settings: the controls show under Custom CSS; their values reach the other pages
  await open('#themesadv', 'themesadv');
  await p.locator('summary', { hasText: 'Custom CSS (advanced)' }).click();
  assert.match(await p.locator('.css-settings, .help').filter({ hasText: '@settings' }).first().innerText(), /slider --gap/);
  await p.locator('textarea[aria-label="Custom CSS"]').fill(`/* @settings
slider --test-gap 0 24 2 8px  Space between cards
colour --test-mark #ffcc00  Highlight
switch --test-pill 4px 999px  Round chips
nonsense --x
*/
#app { outline-offset: var(--test-gap); }`);
  await p.locator('section.card button', { hasText: /^Save$/ }).click();
  await p.waitForSelector('.css-settings input[type=range]');
  if (!(await p.locator('summary', { hasText: 'Custom CSS (advanced)' }).evaluate(s => s.parentElement.open))) await p.locator('summary', { hasText: 'Custom CSS (advanced)' }).click();
  const box = p.locator('.css-settings');
  assert.match(await box.innerText(), /Space between cards[\s\S]*8px/);
  assert.match(await box.innerText(), /Skipped: line 5/);
  await box.locator('input[type=range]').fill('14');
  await box.locator('input[type=range]').dispatchEvent('change');
  await box.getByRole('switch').check();
  assert.deepEqual((await stored()).customCssVals, { '--test-gap': 14, '--test-pill': true });
  // not on this page (custom CSS never is); on the Logbook the variables follow
  assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--test-gap').trim()), '');
  await open('#logbook', 'logbook');
  const vars = () => p.evaluate(() => ['--test-gap', '--test-mark', '--test-pill'].map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim()));
  assert.deepEqual(await vars(), ['14px', '#ffcc00', '999px']);
  // Reset these: back to the CSS's own values
  await open('#themesadv', 'themesadv');
  if (!(await p.locator('summary', { hasText: 'Custom CSS (advanced)' }).evaluate(s => s.parentElement.open))) await p.locator('summary', { hasText: 'Custom CSS (advanced)' }).click();
  await p.locator('.css-settings button', { hasText: 'Reset these' }).click();
  assert.equal((await stored()).customCssVals, null);
  await open('#logbook', 'logbook');
  assert.deepEqual(await vars(), ['8px', '#ffcc00', '4px']);
  // custom CSS and its values never go in a settings file
  const keys = await p.evaluate(() => import('./js/display.js').then(m => m.DISPLAY_KEYS));
  assert.equal(keys.includes('customCssVals') && keys.includes('hideList'), true);

  assert.deepEqual(errors, []);
  console.log('PASS hide mode and CSS settings');
} finally { await b.close(); }
