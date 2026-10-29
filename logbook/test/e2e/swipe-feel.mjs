// Fake demo data only. The tab swipe's feel (PLAYBOOK responsiveness rules; app-ui motion.js): on a 390 px phone with
// the CPU slowed 4x, the page follows the finger within the frame budget, a short quick flick turns the tab, the let-go
// glides on the compositor (Web Animations, transform only) and a finger landing on the glide catches it.
// Run alone (frames): PORT=8080 node logbook/test/e2e/swipe-feel.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const nap = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const step = async (name, fn) => { const t = Date.now(); try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); } console.log(results.at(-1)[0], ((Date.now() - t) / 1000).toFixed(1) + 's', name, results.at(-1)[2] || ''); };
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '?demo#logbook'); await p.waitForSelector('main[data-page="logbook"]');
  await p.waitForFunction(async () => !!(await import('./js/kit.js')).motion);   // the kit's motion module is in
  await nap(1500);   // the kit's theme has finished loading (it sets html.glass late), so frames measure the swipe alone
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // each touch carries a 60 Hz time (the let-go speed reads it), not the slowed browser's arrival time
  let clock = 0;
  const touch = (type, x, y = 420) => {
    clock = type === 'touchStart' ? Math.max(Date.now() / 1000, clock + 0.05) : clock + (type === 'touchMove' ? 0.016 : 0);
    return cdp.send('Input.dispatchTouchEvent', { type, timestamp: clock, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  };
  // a finger along x: moves of `by` px every 16 ms, paced by Node timers and not awaited (with the CPU slowed, waiting
  // for each to be handled spaces them ~66 ms apart, a slow finger), then a rest before the lift
  const stroke = async (x0, by, n, rest = 0, lift = true) => {
    await touch('touchStart', x0); let x = x0;
    for (let i = 0; i < n; i++) { await nap(16); x += by; touch('touchMove', x); }
    if (rest) { await nap(rest); clock += rest / 1000; }
    if (lift) await touch('touchEnd', x);
    return x;
  };
  const page = () => p.evaluate(() => location.hash.slice(1));
  const frames = () => p.evaluate(() => { window.__gaps = []; let last = performance.now(); const f = t => { window.__gaps.push(t - last); last = t; if (window.__gaps.length < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const gaps = () => p.evaluate(() => { const g = window.__gaps.slice(1); window.__gaps = [1e9]; return g; });

  await step('drag follows the finger within the frame budget (CPU 4x), lands on the next tab', async () => {
    await frames(); await nap(100); await gaps();
    await stroke(330, -10, 20, 150, false);
    const g = await gaps();
    const slow = g.filter(x => x > 20).length, worst = Math.max(...g);
    console.log(`  gaps over 20 ms at frame ${g.map((x, i) => x > 20 ? i + ':' + x.toFixed(0) : '').filter(Boolean).join(' ')}`);
    console.log(`  drag frames ${g.length}, over 20 ms ${slow}, worst ${worst.toFixed(1)} ms`);
    assert.ok(slow <= 1 && worst <= 50, `drag frames: ${slow} over 20 ms, worst ${worst.toFixed(1)} ms`);
    clock += 0.1; await touch('touchEnd', 130);
    await p.waitForFunction(() => location.hash === '#totals' && !document.documentElement.classList.contains('swiping'));
  });

  await step('a short quick flick (60 px) turns the tab', async () => {
    await stroke(300, 12, 5);   // right, back to Logbook
    await p.waitForFunction(() => location.hash === '#logbook' && !document.documentElement.classList.contains('swiping'), null, { timeout: 4000 });
  });

  await step('the let-go glides on the compositor (transform keyframes), and a finger catches it where it is', async () => {
    await p.waitForSelector('main[data-page="logbook"]');
    await stroke(330, -14, 10);   // left, fast: the slide to Totals glides out
    const gl = await p.evaluate(() => document.getAnimations().filter(a => a.effect?.getKeyframes().some(k => k.transform)).length);
    assert.ok(gl >= 2, `page and copy gliding: ${gl} transform animations`);
    await touch('touchStart', 200);   // caught
    const held = await p.evaluate(() => parseFloat(document.querySelector('#app').style.transform.slice(11)) || 0);
    assert.ok(held < -20 && held > -390, `caught mid-glide at ${held} px`);
    await nap(500);
    assert.equal(await page(), 'logbook', 'a caught glide went on to the next tab');
    for (let i = 0, x = 200; i < 12; i++) { await nap(16); x += 15; touch('touchMove', x); }   // drag it back
    await nap(150); clock += 0.15; await touch('touchEnd', 380);
    await p.waitForFunction(() => !document.documentElement.classList.contains('swiping') && !document.querySelector('.swipe-peek'));
    assert.equal(await page(), 'logbook', 'dragged back, it should stay');
  });

  await step('a throw back cancels a long drag', async () => {
    await touch('touchStart', 360); let x = 360;
    for (let i = 0; i < 22; i++) { await nap(16); x -= 12; touch('touchMove', x); }   // 264 px left
    for (let i = 0; i < 8; i++) { await nap(16); x += 14; touch('touchMove', x); }   // a quick throw right (its last 100 ms all right), still past a third
    await touch('touchEnd', x);
    await p.waitForFunction(() => !document.documentElement.classList.contains('swiping'));
    assert.equal(await page(), 'logbook');
  });
  assert.deepEqual(errors, [], 'page errors');
} finally { await b.close(); }
const failed = results.filter(r => r[0] === 'FAIL');
console.log(failed.length ? `${failed.length} failed` : 'all passed');
process.exit(failed.length ? 1 : 0);
