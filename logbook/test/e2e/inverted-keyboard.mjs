// Fake data only. Add tab upside down on a phone: with the keyboard up, the fixed Save bar must not cover the case box
// the browser scrolls into view above it (scroll-margin on the box, --savebar-h from app.js).
import assert from 'node:assert/strict';
import { launch, engine, phoneOpts } from './browsers.mjs';
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await launch();
if (!b) { console.log(`SKIP inverted-keyboard (${engine} is not installed here)`); process.exit(0); }
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ...phoneOpts() });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.evaluate(async () => {
    const m = await import('./js/display.js'); m.applyDisplay(m.setDisplay({ caseInverted: true }));
    const { hooks } = await import('./js/ui-core.js'); hooks.render();
  });
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));   // the inverted tab opens at the bottom
  await p.locator('textarea.details').focus();
  await p.setViewportSize({ width: 390, height: 520 });   // the keyboard takes the lower part of the screen
  // what the browser does on focus, before the app has laid out for the keyboard: bring the box into view
  await p.evaluate(() => document.querySelector('textarea.details').scrollIntoView({ block: 'end' }));
  await p.waitForFunction(() => document.body.classList.contains('typing'));   // the Save bar now floats above the tab bar
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const top = s => document.querySelector(s).getBoundingClientRect();
    return { taBottom: top('textarea.details').bottom, taTop: top('textarea.details').top, saveTop: top('.savebar').top };
  });
  assert.ok(r.taTop >= 0, 'the box is on screen');
  assert.ok(r.taBottom <= r.saveTop, `the Save bar (top ${r.saveTop}) covers the box (bottom ${r.taBottom})`);
  assert.deepEqual(errors, []);
  console.log('PASS inverted-keyboard');
} finally { await b.close(); }
