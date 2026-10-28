// live smoke: the logbook's demo (fake data, device only) on the live site: loads, the app-sync version, a case logged,
// moved to the bin and restored through the queue, no page errors
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const sync = []; p.on('request', r => { const m = /core\.anawj\.com\/sync\/([\d.]+)\//.exec(r.url()); if (m) sync.push(m[1]); });
await p.goto('https://apmes.anawj.com/logbook/?demo#logbook');
await p.waitForFunction(() => document.body.dataset.cases && document.body.dataset.cases !== '0', null, { timeout: 30000 });
const r = await p.evaluate(async () => {
  const ui = await import('./js/ui-core.js'), B = await import('./js/bin.js');
  const n0 = ui.S.cases.length;
  const c = await ui.createCase({ date: ui.todayISO(), details: 'ZZ 40F fake smoke case', cats: ['08'] });
  const id = c?.id || ui.S.cases.find(x => /fake smoke/.test(x.details))?.id;
  await new Promise(res => setTimeout(res, 500));
  const e = await B.moveToBin('case', ui.S.cases.find(x => x.id === id));
  for (let i = 0; i < 50 && ui.writes.pending(); i++) await new Promise(res => setTimeout(res, 100));
  const gone = !ui.S.cases.some(x => x.id === id);
  await B.restoreFromBin(e.id);
  for (let i = 0; i < 50 && ui.writes.pending(); i++) await new Promise(res => setTimeout(res, 100));
  return { n0, gone, back: ui.S.cases.some(x => x.id === id), pending: ui.writes.pending(), stuck: ui.writes.entries().filter(x => x.state === 'failed' || x.state === 'conflict').length };
});
console.log('SMOKE', JSON.stringify({ ...r, sync: [...new Set(sync)], errors }));
await b.close();
process.exit(r.gone && r.back && !r.pending && !r.stuck && !errors.length ? 0 : 1);
