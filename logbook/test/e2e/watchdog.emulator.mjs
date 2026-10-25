// Fake data only. The sync chip tells the truth (app-sync's listener watchdog, B5): the real app (?emulator) against
// the local Firestore and Auth emulators. A stream that stops delivering (here: the listen channel blocked while the
// browser still says online) must not leave "✓ Synced" up over old data: the header says "⚠ Not up to date" and the
// app listens again; once the server is heard, a case written elsewhere meanwhile shows and the chip is back to
// "✓ Synced". And when the browser won't keep the site's storage, a save waiting offline is flagged (B3). app-sync
// 0.4.0: an edit after a clock-ahead writer is stamped forward, and the chip waits for the server before "✓ Synced". Run: tools/test-reads.sh watchdog (emulators, demo project, never the live one).
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const PORT = process.env.PORT || 8080, FS = process.env.READS_FS_PORT || 8086, AUTH = process.env.READS_AUTH_PORT || 9098;
const SDK_DIR = process.env.SDK_DIR || `${process.env.HOME}/.cache/anawj-rules/node_modules/firebase`;
const BASE = `http://localhost:${PORT}/logbook/?emulator=${FS}:${AUTH}`;
const E = 'fake.watcher@example.com';
const DB = `http://127.0.0.1:${FS}/v1/projects/demo-logbook/databases/(default)/documents`;
const val = v => typeof v === 'number' ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : v && typeof v === 'object' ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
async function put(path, doc) {
  const r = await fetch(`${DB}/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: fields(doc) }) });
  if (!r.ok) throw new Error(`seed ${path}: ${r.status} ${await r.text()}`);
}
const lb = `logbooks/${E}`, old = Date.now() - 2 * 864e5;
const fakeCase = i => ({ id: 'w' + i, date: new Date(old).toISOString().slice(0, 10), initials: 'AB', details: `fake case ${i}`, cats: ['08'], createdAt: old, updatedAt: old, source: 'app' });
await fetch(`http://127.0.0.1:${FS}/emulator/v1/projects/demo-logbook/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:${AUTH}/emulator/v1/projects/demo-logbook/accounts`, { method: 'DELETE' });
await put(lb, { email: E, name: 'Fake Watcher', settings: { mode: 'advanced' }, templates: [], updatedAt: old });
for (let i = 0; i < 3; i++) await put(`${lb}/cases/w${i}`, fakeCase(i));

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
let failed = false;
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)$/, r => {
    const file = r.request().url().split('/').pop();
    r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(`${SDK_DIR}/${file}`, 'utf8').replace(/firebasejs\/[\d.]+\//g, 'firebasejs/10.12.2/') });
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '#logbook');
  await p.getByRole('button', { name: 'Sign in with Google' }).waitFor();
  await p.evaluate(async e => (await import('./js/cloud.js')).emulatorSignIn(e), E);
  const chip = p.locator('#who .sync, .who .sync').first();
  await p.locator('.sync.ok').first().waitFor({ timeout: 30000 });
  console.log('step 1: signed in, "' + (await chip.textContent()) + '", cases', await p.evaluate(() => document.body.dataset.cases));

  // the stream goes quiet: every listen request fails, the browser still online
  await p.route(/Firestore\/Listen\/channel/, r => r.abort());
  await put(`${lb}/cases/w3`, { ...fakeCase(3), updatedAt: Date.now() });   // written elsewhere meanwhile
  const t0 = Date.now();
  for (; !(await p.locator('.sync.stale').count()); await p.waitForTimeout(500)) {
    if (Date.now() - t0 > 60000) throw new Error('chip never left "Synced": ' + await chip.textContent());
    await p.evaluate(() => window.dispatchEvent(new Event('online')));   // a moment the phone came back
  }
  console.log(`step 2: listener quiet, chip "${await p.locator('.sync.stale').textContent()}" after ${Math.round((Date.now() - t0) / 1000)} s`);

  await p.unroute(/Firestore\/Listen\/channel/);
  const t1 = Date.now();
  for (; !(await p.locator('.sync.ok').count() && await p.evaluate(() => document.body.dataset.cases) === '4'); await p.waitForTimeout(500)) {
    if (Date.now() - t1 > 60000) throw new Error('never recovered: ' + await chip.textContent() + ', cases ' + await p.evaluate(() => document.body.dataset.cases));
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
  }
  console.log(`step 3: heard again after ${Math.round((Date.now() - t1) / 1000)} s, "${await chip.textContent()}", the case written elsewhere shows`);

  // B3: the browser won't keep this site's storage (Safari in a tab) and a save waits offline: the chip warns
  const q = await ctx.newPage();
  q.on('pageerror', e => errors.push(e.message));
  await q.addInitScript(() => { const s = navigator.storage; if (s) { s.persisted = async () => false; s.persist = async () => false; } });
  await q.goto(BASE + '#logbook');
  await q.locator('.sync.ok').first().waitFor({ timeout: 30000 });
  await ctx.setOffline(true);
  await q.evaluate(async e => { const { writes } = await import('./js/writes.js'); await writes.save('case', e, { id: 'w9', date: '2026-10-01', initials: 'CD', details: 'fake offline case', cats: ['08'], source: 'app' }, null); }, E);
  await q.getByText('⚠ On this device only · pending sync').waitFor({ timeout: 10000 });
  console.log('step 4: storage not kept, a save waiting offline: "' + await q.locator('#who .sync').textContent() + '"');
  await ctx.setOffline(false);
  await q.evaluate(() => window.dispatchEvent(new Event('online')));
  await q.locator('.sync.ok').first().waitFor({ timeout: 30000 });
  console.log('step 5: back online, sent: "' + await q.locator('#who .sync').textContent() + '"');

  // app-sync 0.4.0 stamps forward: another device whose clock runs an hour ahead wrote w5 last; this device's edit is
  // still stamped after it (max(now, the server copy's updatedAt + 1), in the commit), so delta readers see the edit
  const ahead = Date.now() + 3600e3;
  await put(`${lb}/cases/w5`, { ...fakeCase(5), updatedAt: ahead });
  await q.waitForFunction(() => document.body.dataset.cases === '6', null, { timeout: 30000 });
  await q.evaluate(async ([e, c]) => { const { writes } = await import('./js/writes.js'); await writes.save('case', e, { ...c, details: 'fake case 5, edited', updatedAt: Date.now() }, c); await writes.flush(8000); }, [E, { ...fakeCase(5), updatedAt: ahead }]);
  const w5 = await (await fetch(`${DB}/${lb}/cases/w5`, { headers: { Authorization: 'Bearer owner' } })).json();
  if (w5.fields.details.stringValue !== 'fake case 5, edited') throw new Error('edit not saved: ' + JSON.stringify(w5.fields.details));
  if (!(Number(w5.fields.updatedAt.integerValue) > ahead)) throw new Error(`stamp went back: ${w5.fields.updatedAt.integerValue} after ${ahead}`);
  console.log('step 6: edit after a clock-ahead writer stamped forward (+' + (Number(w5.fields.updatedAt.integerValue) - ahead) + ' ms)');

  // confirmed (app-sync 0.4.0): a page that has only this device's copy (the server can't be heard from the start) never
  // says "✓ Synced"; the same page says it once the server answers
  await p.close(); await q.close();   // (an open tab would hold Firestore's connection for every tab: multi-tab cache)
  const r = await ctx.newPage();
  r.on('pageerror', e => errors.push(e.message));
  await r.route(/Firestore\/Listen\/channel/, x => x.abort());
  await r.goto(BASE + '#logbook');
  await r.waitForFunction(() => Number(document.body.dataset.cases) > 0, null, { timeout: 30000 });
  await r.waitForTimeout(4000);
  if (await r.locator('.sync.ok').count()) throw new Error('"✓ Synced" before the server answered');
  if (await r.evaluate(async () => (await import('./js/cloud.js')).syncHealth().confirmed) !== false) throw new Error('confirmed before the server answered');
  console.log('step 7: server not heard yet: "' + ((await r.locator('#who .sync').count()) ? await r.locator('#who .sync').textContent() : '(no chip)') + '", not Synced');
  await r.unroute(/Firestore\/Listen\/channel/);
  for (const t2 = Date.now(); !(await r.locator('.sync.ok').count()); await r.waitForTimeout(500)) {
    if (Date.now() - t2 > 60000) throw new Error('never Synced after the server answered');
    await r.evaluate(() => window.dispatchEvent(new Event('online')));
  }
  console.log('step 8: server heard: "' + await r.locator('#who .sync').textContent() + '"');
  if (errors.length) throw new Error('page errors: ' + errors.join('; '));
  console.log('PASS watchdog (sync chip, emulator)');
} catch (e) { failed = true; console.log('FAIL watchdog: ' + e.message); }
await b.close();
process.exit(failed ? 1 : 0);
