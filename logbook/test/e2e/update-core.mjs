// Fake data only. The three service workers on the shared update core (app-update, core.anawj.com/update/0.1.0/):
// each installs its whole SHELL, opens offline (the guidebook on the page asked for, not the contents page), and a new
// deploy (another VERSION in sw.js) takes over by itself with one reload of the open page, keeping the share inbox
// and the other apps' saved copies. Service workers on, as on a phone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, engine } from './browsers.mjs';
const site = `http://localhost:${process.env.PORT || 8080}/`;
const b = await launch();
if (!b) { console.log(`SKIP update core: ${engine} not installed`); process.exit(0); }

const shellCache = (p, app) => p.evaluate(async app => (await caches.keys()).find(k => k.startsWith(app + '-') && !k.startsWith(app + '-rt-')), app);

async function check({ app, path, ready, page }) {
  const dir = path.split('?')[0].replace(/[^/]*$/, '');   // the app's folder in the repo, e.g. 'logbook/'
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(site + path);
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
  await p.waitForFunction(async app => (await caches.keys()).some(k => k.startsWith(app + '-') && !k.startsWith(app + '-rt-')), app, { timeout: 30000 });
  const first = await shellCache(p, app), offlineHome = await p.title();
  assert.match(first, new RegExp(`^${app}-v\\d+$`), `${app}: the shell cache is named like VERSION`);
  const loads = [];
  p.on('load', () => loads.push(Date.now()));
  await p.evaluate(() => caches.open('share-inbox-logbook').then(c => c.put('fake-share.json', new Response('{}'))));
  await p.evaluate(() => caches.open('people-fake').then(c => c.put('fake.txt', new Response('x'))));   // another app on the site

  // offline: the app (or the page asked for) still opens from the saved copy
  await ctx.setOffline(true);
  await p.goto(site + (page || path));
  await ready(p);
  if (page) assert.notEqual(await p.title(), offlineHome, `${app}: offline, ${page} opens itself, not the contents page`);
  await ctx.setOffline(false);

  // a new deploy: the same sw.js with another VERSION (written to disk, put back after) takes over by itself, and the
  // open page reloads once
  const swFile = new URL(`../../../${dir}sw.js`, import.meta.url), original = fs.readFileSync(swFile, 'utf8');
  fs.writeFileSync(swFile, original.replace(/const VERSION = '([^']+)'/, `const VERSION = '${app}-2099-01-01-0123abcd'`));
  try {
    loads.length = 0;   // (no navigation here: the browser's own check on a navigation could install it before the page listens)
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await p.waitForFunction(async app => (await caches.keys()).includes(app + '-2099-01-01-0123abcd'), app, { timeout: 30000 });
    for (let i = 0; i < 50 && !loads.length; i++) await p.waitForTimeout(200);
    await ready(p);
    await p.waitForTimeout(1500);
    assert.equal(loads.length, 1, `${app}: one reload when the new version took over`);
    assert.equal(await shellCache(p, app), `${app}-2099-01-01-0123abcd`, `${app}: the old shell cache is gone`);
    const keys = await p.evaluate(() => caches.keys());
    assert.ok(keys.includes('share-inbox-logbook') && keys.includes('people-fake'), `${app}: other caches kept`);
  } finally { fs.writeFileSync(swFile, original); }
  assert.deepEqual(errors.filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)), [], `${app}: no console errors`);
  await ctx.close();
  console.log(`PASS update core ${app}`);
}

try {
  await check({ app: 'logbook', path: 'logbook/?demo#log', ready: p => p.waitForFunction(() => Number(document.body.dataset.cases) > 0, null, { timeout: 30000 }) });
  await check({ app: 'evals', path: 'evals/?demo', ready: p => p.locator('h1, h2').first().waitFor({ timeout: 30000 }) });
  await check({ app: 'guide', path: 'home/guide/', page: 'home/guide/epa-03.html', ready: p => p.locator('main').first().waitFor({ timeout: 30000 }) });
} finally { await b.close(); }
