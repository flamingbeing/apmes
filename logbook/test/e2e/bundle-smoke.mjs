// Fake data only. The deploy bundle (tools/bundle-logbook.mjs): run after it, on the bundled page. The Add tab opens
// from a handful of files; every page then opens without an error; nothing asks for a source file (a second copy of
// a module would split its state); and with the service worker the bundled app opens every page offline.
//   node tools/bundle-logbook.mjs && PORT=8080 node logbook/test/e2e/bundle-smoke.mjs   (then git checkout logbook/)
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
// the same pages as lazy-load.mjs
const PAGES = ['log', 'logbook', 'reflect', 'progress', 'notes', 'more', 'caselogs', 'totals', 'points', 'account', 'settings', 'recovery', 'data',
  'reflimport', 'themes', 'layout', 'access', 'loggingadv', 'sendto', 'sync', 'sharefmt', 'showhide', 'logging', 'notesset', 'reflset',
  'export', 'choose', 'admin', 'admintotals', 'adminresidents', 'adminadv', 'tags', 'feedback', 'feedbackinbox'];
const goHash = (p, id) => p.evaluate(x => { location.hash = '#' + x; }, id).then(() => p.waitForFunction(x => document.getElementById('app').dataset.page === x, id)).catch(err => { throw new Error(`${id}: ${err.message}`); });
const source = u => { const m = /\/logbook\/js\/([^/?#]+\.js)/.exec(u); return m && !/^(.+\.b|chunk-[A-Z0-9]+)\.js$/.test(m[1]) ? m[1] : null; };

try {
  const html = await (await fetch(base)).text();
  assert.ok(html.includes('src="js/app.b.js"'), 'run tools/bundle-logbook.mjs first');
  for (const width of [390, 1280]) {
    const ctx = await b.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
    const p = await ctx.newPage(), errors = [], asked = [];
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('request', r => asked.push(r.url()));

    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    const local = asked.filter(u => u.startsWith(base) && /\.js(\?|$)/.test(u));
    assert.ok(local.length <= 25, `the Add tab asked for ${local.length} local scripts`);
    await p.locator('textarea.details').fill('AB 72M fake lap chole');
    assert.equal(await p.locator('textarea.details').inputValue(), 'AB 72M fake lap chole');
    await p.locator('textarea.details').fill('');

    for (const id of PAGES) await goHash(p, id);
    // offline, after the service worker has saved the bundle
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => p.reload());
    await ctx.setOffline(true);
    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    for (const id of PAGES) await goHash(p, id);
    await ctx.setOffline(false);

    const src = [...new Set(asked.map(source).filter(Boolean))];
    assert.deepEqual(src, [], `asked for source files: ${src.join(', ')}`);
    const real = errors.filter(e => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|fonts\.g/.test(e));
    assert.deepEqual(real, [], `errors at ${width}px`);
    console.log(`bundle smoke ${width}px: ${local.length} scripts for the Add tab, ${PAGES.length} pages online and offline`);
    await ctx.close();
  }
} finally { await b.close(); }
