// Browser test of the home page at phone size, with an axe accessibility check. Files are served from this checkout
// the way the Worker maps apmes.anawj.com (worker/routes.js); the Firebase SDK is a stand-in (no network, no live data).
// Run from the repo root: node home/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolve } from '../../worker/routes.js';

const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const root = new URL('../../', import.meta.url).pathname;
const SHOTS = process.env.SHOTS;
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json', png: 'image/png' };

// the stand-in SDK: signed in as USER (null = signed out); logbooks/{email} names rid 7; summaries/7 holds the counts
const SDK = `
const u = globalThis.__USER ?? null, docs = globalThis.__DOCS || {};
export const getApps = () => []; export const getApp = () => ({}); export const initializeApp = c => ({ c });
export const getAuth = () => ({}); export const onAuthStateChanged = (a, cb) => { if (globalThis.__AUTHFAIL) throw new Error('offline'); setTimeout(() => cb(u)); return () => {}; };
export const getFirestore = () => ({}); export const doc = (db, ...p) => p.join('/');
export const getDoc = async p => { globalThis.__READS = [...(globalThis.__READS || []), p]; return { exists: () => p in docs, data: () => docs[p] }; };
const snap = p => ({ exists: () => p in docs, data: () => JSON.parse(JSON.stringify(docs[p])) });
export const runTransaction = async (db, fn) => fn({ get: async p => snap(p), set: (p, v) => { docs[p] = JSON.parse(JSON.stringify(v)); } });
// __SNAPFAIL: that many listeners error first (Firestore then ends them); __SNAPS counts the listeners started
export const onSnapshot = (p, cb, err) => { globalThis.__SNAPS = (globalThis.__SNAPS || 0) + 1; setTimeout(() => (globalThis.__SNAPFAIL-- > 0 ? err(new Error('x')) : cb(snap(p)))); return () => {}; };`;

const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') && !fs.statSync('/opt/pw-browsers/chromium').isDirectory() ? '/opt/pw-browsers/chromium' : null);
const b = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
let sdkLoads = 0;
await ctx.route(/^https:\/\/apmes\.anawj\.com\//, async route => {
  const r = resolve('apmes.anawj.com', new URL(route.request().url()).pathname);
  if (r.redirect) return route.fulfill({ status: 301, headers: { Location: r.redirect } });
  let rel = r.file;
  if (rel == null) return route.fulfill({ status: 404, body: 'not found' });
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'not found' });
  await route.fulfill({ status: 200, contentType: MIME[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
});
await ctx.route(/^https:\/\/www\.gstatic\.com\/firebasejs\//, r => { sdkLoads++; return r.fulfill({ status: 200, contentType: 'text/javascript', body: SDK }); });

const errors = [];
async function open(storage = {}, init = '') {
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(([s, js]) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } eval(js); }, [storage, init]);
  await page.goto('https://apmes.anawj.com/');
  await page.getByRole('heading', { name: 'Apps' }).waitFor();
  return page;
}
async function axe(page, what) {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
  assert.deepEqual(r.violations.map(v => `${v.id}: ${v.nodes[0]?.target}`), [], what);
}
const shot = (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `home-${name}.png`) });

// 1. signed out, counts off: Logbook first, MedHub, nothing hidden shows, no SDK
{
  const page = await open();
  const first = page.locator('#main a').first();
  assert.equal(await first.textContent(), 'Open Logbook');
  assert.equal(await first.getAttribute('href'), '/logbook/');
  assert.ok((await first.boundingBox()).height >= 48, 'big tap target');
  assert.equal(await page.getByRole('heading', { name: 'MedHub' }).count(), 1);
  assert.equal(await page.locator('a[href^="https://nuhs.medhub.com/"]').count(), 3);
  assert.equal(await page.locator('a[href="https://nuhs.medhub.com/functions/apps/mobile/dutyhours.mh"]').count(), 1);
  assert.equal(await page.locator('a[href="https://nuhs.medhub.com/functions/apps/mobile/evaluations.mh"]').count(), 1);
  for (const hidden of ['/evals/', '/people/', '/ccc/', '/applicants/']) assert.equal(await page.locator(`a[href="${hidden}"]`).count(), 0, hidden);
  assert.equal(await page.locator('a[href="/guide/"]').count(), 1, 'the guidebook');
  assert.equal(await page.locator('.h-counts').isHidden(), true);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await axe(page, 'signed out');
  await shot(page, 'light');
  // counts on without a Logbook sign-in on this device: the sign-in link, still no SDK
  await page.getByText('Show my counts here').click();
  await page.getByRole('link', { name: 'Sign in through the Logbook' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('apmes-home-counts')), '1');
  assert.equal(sdkLoads, 0, 'no Firebase SDK without a sign-in');
  await page.close();
}

// 2. the Logbook's dark theme and colours carry over; the page's switch wins and leaves the Logbook's choice alone
{
  const page = await open({ 'apmes-logbook-theme': 'dark', 'apmes-logbook-accent-css-v2': '@layer theme { :root { --accent: #7a1f5c; --accent-ink: #fff; --accent-soft: #eee; --bg: #fff; --panel: #fff; --ink: #222; --muted: #555; --line: #ddd; } :root[data-theme="dark"] { --accent: #ff9ad5; --accent-ink: #000; --accent-soft: #333; --bg: #000; --panel: #1c1c1e; --ink: #eee; --muted: #bbb; --line: #444; } }' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.h-primary')).backgroundColor), 'rgb(255, 154, 213)', "the Logbook's dark accent");
  await axe(page, 'dark');
  await shot(page, 'dark');
  await page.getByRole('button', { name: 'Light' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.h-primary')).backgroundColor), 'rgb(122, 31, 92)', "the Logbook's light accent");
  assert.equal(await page.evaluate(() => localStorage.getItem('apmes-logbook-theme')), 'dark');
  await page.reload(); await page.getByRole('heading', { name: 'Apps' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'kept on this device');
  await page.getByRole('button', { name: 'Match the Logbook again' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.close();
}

// 3. signed in, counts on: own summary only (logbooks/{email} -> rid -> summaries/{rid}), reads only
{
  const docs = { 'logbooks/res@example.org': { rid: '7' }, 'summaries/7': { rid: '7', total: 12, counts: { '01': 3, 13: 9 } } };
  const page = await open({ 'apmes-logbook-who:res@example.org': '{}', 'apmes-home-counts': '1' },
    `globalThis.__USER = { email: 'Res@Example.org' }; globalThis.__DOCS = ${JSON.stringify(docs)};`);
  await page.locator('.h-total').waitFor();
  assert.match(await page.locator('.h-total').textContent(), /^12 cases logged$/);
  await page.getByText('By category').click();
  assert.deepEqual(await page.locator('.h-cats tr').allTextContents(), ['01 Cardiac surgery with CPB3', '13 General surgery9']);
  assert.deepEqual(await page.evaluate(() => globalThis.__READS), ['logbooks/res@example.org', 'summaries/7']);
  assert.ok(sdkLoads > 0);
  await axe(page, 'counts');
  await shot(page, 'counts');
  await page.close();
}

// 4. a sign-in hint but signed out in Firebase; and no programme entry yet
{
  let page = await open({ 'apmes-logbook-who:res@example.org': '{}', 'apmes-home-counts': '1' }, 'globalThis.__USER = null;');
  await page.getByRole('link', { name: 'Sign in through the Logbook' }).waitFor();
  await page.close();
  page = await open({ 'apmes-logbook-who:res@example.org': '{}', 'apmes-home-counts': '1' }, `globalThis.__USER = { email: 'res@example.org' }; globalThis.__DOCS = {};`);
  await page.getByText('not linked to a programme entry').waitFor();
  await page.close();
}

// 5. the guidebook pages: contents, one page with its tables scrolling inside their box (never the page), anchors,
//    and the Logbook's dark theme carried over
{
  const page = await open({ 'apmes-logbook-theme': 'dark' });
  await page.locator('a[href="/guide/"]').click();
  await page.getByRole('heading', { name: 'Programme guidebook' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.ok(await page.locator('.a-list a.a-row').count() >= 6, 'one row per document');
  await axe(page, 'guide contents');
  await page.locator('input[type="search"]').fill('malignant hyperthermia');
  await page.locator('.g-results li').first().waitFor();
  assert.ok(await page.locator('.g-results a[href^="epa-02.html?q=malignant%20hyperthermia#"]').count() >= 1, 'search finds EPA 2');
  await page.locator('input[type="search"]').fill('');
  await page.locator('a.a-row[href="epa-01.html"]').click();
  await page.locator('.g-doc h2').first().waitFor();
  const w = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, view: innerWidth, wide: [...document.querySelectorAll('.g-table')].some(t => t.scrollWidth > t.clientWidth) }));
  assert.ok(w.page <= w.view, `no sideways page scroll (${w.page} > ${w.view})`);
  assert.ok(w.wide, 'wide tables scroll inside their box');
  await page.getByText('On this page').click();
  const link = page.locator('.g-toc a').nth(1), id = (await link.getAttribute('href')).slice(1);
  await link.click();
  assert.equal(await page.evaluate(() => location.hash.slice(1)), id);
  assert.ok(Math.abs(await page.locator(`[id="${id}"]`).evaluate(e => e.getBoundingClientRect().top)) < 120, 'jumps to the part');
  await axe(page, 'guide page');
  await shot(page, 'guide');
  // the entrustment questions: DOPS / Mini-CEX / EBD tabs, a filter, and a link back to the item in its EPA page
  await page.goto(page.url().replace(/epa-01\.html.*$/, 'entrustment.html'));
  await page.locator('#dops .g-item').first().waitFor();
  assert.ok(await page.locator('#cex').isHidden(), 'one tab at a time');
  await page.locator('#tab-ebd').click();
  assert.equal(await page.evaluate(() => location.hash), '#ebd');
  const all = await page.locator('#ebd .g-item').count();
  await page.locator('input[type="search"]').fill('solo call as SR');
  const shown = await page.locator('#ebd .g-item:visible').count();
  assert.ok(shown >= 1 && shown < all, `the filter narrows the list (${shown} of ${all})`);
  await page.locator('input[type="search"]').fill('airway');   // a filter shows every type's matches, each labelled
  assert.ok(await page.locator('#dops .g-item:visible').count() && await page.locator('#cex .g-item:visible').count(), 'matches from all types at once');
  assert.ok(await page.locator('#cex .g-panel-title').isVisible(), 'each type has its heading while filtering');
  assert.equal(await page.locator('#cex .g-item:visible .g-tool').first().textContent(), 'Mini-CEX');
  assert.ok(await page.locator('#cex .g-item:visible summary mark').count(), 'the words are marked');
  await page.locator('input[type="search"]').fill('solo call as SR');
  const item = page.locator('#ebd .g-item:visible', { has: page.locator('summary', { hasText: 'as SR' }) });
  if (!(await item.evaluate(d => d.open))) await item.locator('summary').first().click();   // a short list opens itself
  await item.locator('.g-attach summary').click();
  await item.getByText('Managing Postpartum Neurological Deficit').first().waitFor();
  await axe(page, 'guide entrustment');
  await item.locator('.g-from a').click();
  await page.locator('.g-doc h4:target').waitFor();
  await page.close();
}

// 5b. notes and Done ticks on the entrustment questions: signed out they stay on this device and export; signed in
//     they merge with the resident's own doc (logbooks/{email}/guide/entrustment) and notes kept signed out move in on a
//     tap (a shared device's may be someone else's); no signal: the account's copy on this device
{
  const page = await open();
  await page.goto('https://apmes.anawj.com/guide/entrustment.html');
  await page.getByText('Saved on this device only.').waitFor();
  const item = page.locator('#dops .g-item').first(), id = await item.getAttribute('id');
  await item.locator('summary').click();
  assert.ok(await item.locator('.g-q').count() >= 5, 'a tick and a note on each question');
  await item.getByLabel('Done: question 1', { exact: true }).check();
  await item.getByRole('button', { name: 'Add note' }).first().click();
  await item.getByLabel('Notes: question 1', { exact: true }).fill('Fake note about sizing');
  assert.equal(await item.locator('summary').getAttribute('data-prog'), '1/2', 'at least 2 questions per item');
  await page.getByText('1 done · 1 note.').waitFor();
  await axe(page, 'guide notes');
  await page.reload();
  await page.locator(`[id="${id}"] summary`).click();
  assert.ok(await page.getByLabel('Done: question 1', { exact: true }).first().isChecked(), 'the tick stays after a reload');
  assert.equal(await page.getByLabel('Notes: question 1', { exact: true }).first().inputValue(), 'Fake note about sizing');
  await page.getByText('Export or share my notes').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Markdown (.md)' }).click()]);
  assert.equal(dl.suggestedFilename(), 'entrustment-notes.md');
  const md = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(md, /^# Entrustment questions: my notes\n/);
  assert.match(md, /- \[x\] .+\n  > Fake note about sizing\n/);
  const [dx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Word (.docx)' }).click()]);
  assert.equal(fs.readFileSync(await dx.path()).subarray(0, 2).toString(), 'PK', 'a zip (Word) file');
  const device = await page.evaluate(() => localStorage.getItem('apmes-guide-notes'));
  await page.close();

  // signed in, with that device's notes and another phone's tick already in the account
  const EMAIL = 'fake.resident@example.com', path2 = `logbooks/${EMAIL}/guide/entrustment`;
  const other = { [`${id}~1`]: { d: true, n: 'from the other phone', t: 5 } };
  const p2 = await open({ 'apmes-guide-notes': device, [`apmes-logbook-who:${EMAIL}`]: '{}' },
    `globalThis.__USER = { email: '${EMAIL}', emailVerified: true }; globalThis.__DOCS = { '${path2}': { items: ${JSON.stringify(other)}, updatedAt: 5 } };`);
  await p2.goto('https://apmes.anawj.com/guide/entrustment.html');
  await p2.getByText('from before you signed in').waitFor();
  await p2.locator(`[id="${id}"] summary`).click();
  assert.ok(!(await p2.getByLabel('Done: question 1', { exact: true }).first().isChecked()), "this device's notes wait for the tap");
  assert.ok(await p2.evaluate(() => localStorage.getItem('apmes-guide-notes')), 'still kept as device-only notes');
  await p2.getByRole('button', { name: 'Add them to my account' }).click();
  await p2.getByText(`were added to your Logbook account (${EMAIL})`).waitFor();
  assert.ok(await p2.getByLabel('Done: question 2', { exact: true }).first().isChecked(), "the other phone's tick shows");
  assert.equal(await p2.getByLabel('Notes: question 2', { exact: true }).first().inputValue(), 'from the other phone');
  assert.ok(await p2.getByLabel('Done: question 1', { exact: true }).first().isChecked(), "this device's tick moved in");
  await p2.waitForFunction(p => Object.keys(globalThis.__DOCS[p]?.items || {}).length >= 2, path2);
  const saved = await p2.evaluate(p => globalThis.__DOCS[p], path2);
  assert.equal(saved.items[`${id}~0`].n, 'Fake note about sizing', 'saved to the account');
  assert.equal(await p2.evaluate(() => localStorage.getItem('apmes-guide-notes')), null, 'no longer kept as device-only notes');
  await p2.getByText(`Synced with your Logbook (${EMAIL})`).waitFor({ timeout: 2000 }).catch(() => {});
  await p2.getByLabel('Done: question 2', { exact: true }).first().uncheck();
  await p2.waitForFunction(([p, k]) => globalThis.__DOCS[p].items[k].d === false, [path2, `${id}~1`]);
  await p2.close();

  // the sign-in can't be checked (no signal): the account's copy on this device, not the empty device-only one
  const p3 = await open({ [`apmes-guide-notes:${EMAIL}`]: JSON.stringify({ items: { [`${id}~2`]: { d: true, n: 'kept offline', t: 9 } }, dirty: true }), [`apmes-logbook-who:${EMAIL}`]: '{}' },
    'globalThis.__AUTHFAIL = true;');
  await p3.goto('https://apmes.anawj.com/guide/entrustment.html');
  await p3.getByText(`syncs with your Logbook (${EMAIL}) when back online`).waitFor();
  await p3.locator(`[id="${id}"] summary`).click();
  assert.ok(await p3.getByLabel('Done: question 3', { exact: true }).first().isChecked(), "the account's notes show offline");
  await p3.close();

  // a listener that errors is started again (Firestore ends it), so other phones' changes keep arriving
  const p4 = await open({ [`apmes-logbook-who:${EMAIL}`]: '{}' },
    `globalThis.__USER = { email: '${EMAIL}', emailVerified: true }; globalThis.__SNAPFAIL = 1; globalThis.__DOCS = { '${path2}': { items: ${JSON.stringify(other)}, updatedAt: 5 } };`);
  await p4.goto('https://apmes.anawj.com/guide/entrustment.html');
  await p4.waitForFunction(() => globalThis.__SNAPS >= 2, null, { timeout: 6000 });
  await p4.getByText(`Synced with your Logbook (${EMAIL})`).waitFor();
  await p4.close();
}

// 6. the guidebook as an installable app: a manifest, and its service worker saves every page, so the guidebook
//    reads offline (a real worker: served from this checkout on localhost, the one plain-http address workers allow)
{
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    let f = path.join(root, rel);
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[f.split('.').pop()] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const base = `http://localhost:${server.address().port}/home/guide/`;
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await c2.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'home/guide', manifest), 'utf8')).id, '/guide/', 'manifest id is fixed');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    const k = (await caches.keys()).find(x => x.startsWith('guide-'));
    return k && (await (await caches.open(k)).keys()).some(r => r.url.endsWith('/epa-12.html'));
  }, null, { timeout: 15000 });
  await page.reload();
  await page.getByText(/^App version v1$/).waitFor();
  await c2.setOffline(true);
  await page.goto(base + 'epa-05.html?q=airway#x');
  await page.locator('.g-doc h2').first().waitFor();
  await page.goto(base + 'entrustment.html#cex');
  await page.locator('#cex .g-item').first().waitFor();
  await c2.setOffline(false);
  await page.goto(base);
  await page.getByRole('button', { name: 'Not updating? Get the latest version' }).click();
  await page.waitForLoadState('load');
  await page.getByRole('heading', { name: 'Programme guidebook' }).waitFor();
  await c2.close();
  server.close();
}

assert.deepEqual(errors, [], 'no page errors');
await b.close();
console.log('home e2e: ok');
