// 500 fake cases saved at once (saveMany: each through the write queue) against the Firestore + Auth emulators: seconds
// until the queue is empty and the server holds all 500. Run with tools/test-reads.sh drain (copied in as drain.emulator.mjs).
// Gives up after 4 min and names the unfinished saves by state. On the emulator (29 Oct) main (0.7.3) and app-sync 1.5.4
// both left ~310 saves pending: all 500 sent at once, most miss the 30 s send timeout and retry (pre-existing, see PR).
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const PORT = process.env.PORT || 8080, FS = process.env.READS_FS_PORT || 8086, AUTH = process.env.READS_AUTH_PORT || 9098;
const SDK_DIR = process.env.SDK_DIR;
const BASE = `http://localhost:${PORT}/logbook/?emulator=${FS}:${AUTH}`;
const E = 'fake.drain@example.com';
const DB = `http://127.0.0.1:${FS}/v1/projects/demo-logbook/databases/(default)/documents`;
const H = { Authorization: 'Bearer owner', 'content-type': 'application/json' };
await fetch(`http://127.0.0.1:${FS}/emulator/v1/projects/demo-logbook/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:${AUTH}/emulator/v1/projects/demo-logbook/accounts`, { method: 'DELETE' });
const old = Date.now() - 864e5;
await fetch(`${DB}/logbooks/${E}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { email: { stringValue: E }, name: { stringValue: 'Fake Drain' }, updatedAt: { integerValue: String(old) } } }) });
await fetch(`${DB}/logbooks/${E}/cases/c0`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { id: { stringValue: 'c0' }, date: { stringValue: '2026-10-01' }, details: { stringValue: '30F fake' }, createdAt: { integerValue: String(old) }, updatedAt: { integerValue: String(old) } } }) });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)$/, r => {
  const file = r.request().url().split('/').pop();
  r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(`${SDK_DIR}/${file}`, 'utf8').replace(/firebasejs\/[\d.]+\//g, 'firebasejs/10.12.2/') });
});
const p = await ctx.newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.goto(BASE + '#logbook');
await p.getByRole('button', { name: 'Sign in with Google' }).waitFor();
await p.evaluate(async e => (await import('./js/cloud.js')).emulatorSignIn(e), E);
for (const t = Date.now(); !(await p.evaluate(async () => (await import('./js/ui-core.js')).S.casesSynced)); await p.waitForTimeout(100)) if (Date.now() - t > 30000) throw new Error('no sync');
const t0 = Date.now();
await p.evaluate(async () => {
  const { saveMany, todayISO } = await import('./js/ui-core.js');
  const now = Date.now();
  await saveMany(Array.from({ length: 500 }, (_, i) => ({ id: 'imp' + i, date: todayISO(), initials: 'ZZ', details: `${20 + (i % 60)}F fake import ${i}`, cats: ['08'], createdAt: now, updatedAt: now, source: 'import' })));
});
const queued = (Date.now() - t0) / 1000;
const count = async () => { const r = await fetch(`${DB}/logbooks/${E}:runAggregationQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: 'cases' }], where: { fieldFilter: { field: { fieldPath: 'source' }, op: 'EQUAL', value: { stringValue: 'import' } } } }, aggregations: [{ alias: 'n', count: {} }] } }) }); const j = await r.json(); return Number(j[0]?.result?.aggregateFields?.n?.integerValue || 0); };
let n = 0, pending = 1;
for (const t = Date.now(); Date.now() - t < 240000; await p.waitForTimeout(500)) {
  pending = await p.evaluate(async () => (await import('./js/writes.js')).writes.pending());
  n = await count();
  if (!pending && n === 500) break;
}
if (pending) console.log('FAIL unfinished saves by state:', JSON.stringify(await p.evaluate(async () => { const o = {}; for (const x of (await import('./js/writes.js')).writes.entries()) o[x.kind + ':' + x.state] = (o[x.kind + ':' + x.state] || 0) + 1; return o; })));
console.log(`${n === 500 && !pending ? 'PASS' : 'FAIL'} drain 500 cases: stored in ${queued.toFixed(1)} s, all on the server in ${((Date.now() - t0) / 1000).toFixed(1)} s (server ${n}/500, pending ${pending}); page errors: ${errors.length}`);
await b.close();
process.exit(n === 500 && !pending ? 0 : 1);
