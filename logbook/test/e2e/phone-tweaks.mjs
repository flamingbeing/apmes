// Fake data only. Phone tweaks (owner, 29 Oct 2026): the Totals table never scrolls sideways (‹ › page the people, so a
// sideways swipe on it changes tab); an Export button on Reflections opens the portfolio export; the header's
// magnifier opens Search with the keyboard up (the search box focused) on a phone.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');

  // ---- the header magnifier: Search opens with its box focused ----
  await p.locator('button.who-search').tap();
  await p.waitForFunction(() => document.activeElement && document.activeElement.matches('input[aria-label="Search everything"]'));
  assert.equal(await p.locator('input[aria-hidden=true][type=search]').count(), 0, 'the stand-in box is gone');

  // ---- Totals: as many people as fit, ‹ › for the rest, nothing scrolls sideways ----
  // (the demo's fake year group is wider than a phone)
  await p.evaluate(() => { location.hash = '#totals'; });
  const wrap = p.locator('.tscroll.paged');
  await wrap.waitFor();
  await p.locator('button[aria-label="Next people"]:not([hidden])').waitFor();
  const state = () => p.evaluate(() => {
    const w = document.querySelector('.tscroll.paged'), head = [...w.querySelectorAll('thead th')].slice(1);
    return { sw: w.scrollWidth, cw: w.clientWidth, shown: head.filter(th => !th.hidden).map(th => th.textContent), label: document.querySelector('.tpage').textContent };
  });
  for (const compact of [true, false]) {
    if (!compact) { await p.locator('main button', { hasText: /^Compact$/ }).click(); await p.locator('table.totals:not(.compact)').waitFor(); await p.locator('button[aria-label="Next people"]:not([hidden])').waitFor(); }
    const s1 = await state();
    assert.ok(s1.sw <= s1.cw + 1, `no sideways scroll (${s1.sw} > ${s1.cw}), compact ${compact}`);
    const n = Number(s1.label.split(' of ')[1]);
    assert.ok(s1.shown.length >= 2 && s1.shown.length < n, `some people per page: ${s1.shown.length} of ${n}`);
    assert.equal(s1.label, `1–${s1.shown.length} of ${n}`);
    assert.ok(await p.getByRole('button', { name: 'Previous people' }).isDisabled());
    await p.getByRole('button', { name: 'Next people' }).click();
    const s2 = await state();
    assert.notDeepEqual(s2.shown, s1.shown);
    assert.match(s2.label, new RegExp(`^${s1.shown.length + 1}–`));
    assert.ok(s2.sw <= s2.cw + 1);
    await p.getByRole('button', { name: 'Previous people' }).click();
    assert.deepEqual((await state()).shown, s1.shown);
    console.log(`Totals ${compact ? 'compact' : 'full'}: ${s1.shown.length} per page, ${s1.label}`);
  }
  // a sideways swipe on the table changes tab (on unless switched off; touch screens)
  const before = await p.evaluate(() => location.hash);
  const box = await wrap.boundingBox();
  const cdp = await ctx.newCDPSession(p), y = box.y + 120;
  const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', 300);
  for (let x = 280; x >= 80; x -= 20) await touch('touchMove', x);
  await touch('touchEnd', 80);
  await p.waitForFunction(h => location.hash !== h, before, { timeout: 5000 });
  console.log(`swipe on the table: ${before} → ${await p.evaluate(() => location.hash)}`);

  // ---- Reflections: Export beside Select opens the portfolio export ----
  await p.evaluate(() => { location.hash = '#reflect'; });
  const exp = p.locator('.refl-actions a.btn', { hasText: /^Export$/ });
  await exp.waitFor();
  const tops = await p.locator('.refl-actions > *').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  assert.equal(new Set(tops).size, 1, 'Export, Select and + New on one line');
  const order = await p.locator('.refl-actions > *').evaluateAll(els => els.map(e => e.textContent));
  assert.deepEqual(order, ['Export', 'Select', '+ New']);
  await exp.tap();
  await p.waitForFunction(() => location.hash.startsWith('#export'));

  assert.deepEqual(errors, [], 'no console errors');
  console.log('PASS phone-tweaks');
} finally { await b.close(); }
