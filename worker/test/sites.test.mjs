// worker/sites.js with a stand-in for the static assets. Run: node --test 'worker/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../sites.js';

const FILES = { '/logbook/index.html': '<h1>hi</h1>', '/logbook/sw.js': '//', '/__/auth/handler.html': '<p>auth</p>',
  '/__/auth/iframe.html': '<p>iframe</p>', '/apmes-auth/firebase/init.json': '{}', '/apmes-auth-beta/firebase/init.json': '{}' };
const env = { ASSETS: { fetch: async req => {
  const p = new URL(req.url).pathname;
  return p in FILES ? new Response(FILES[p], { status: 200 }) : new Response('', { status: 404 });
} } };
const get = (url, method = 'GET') => worker.fetch(new Request(url, { method }), env);

test('serves the folder index, noindex', async () => {
  for (const h of ['apmes', 'beta-apmes']) {
    const r = await get(`https://${h}.anawj.com/logbook/`);
    assert.equal(r.status, 200, h);
    assert.equal(await r.text(), '<h1>hi</h1>');
    assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  }
});

test('folder without a slash redirects; missing files 404; unknown hosts 404', async () => {
  assert.equal((await get('https://apmes.anawj.com/logbook')).status, 301);
  assert.equal((await get('https://apmes.anawj.com/logbook/nope.js')).status, 404);
  assert.equal((await get('https://x.workers.dev/logbook/')).status, 404);
});

test('sign-in helper pages (handler is handler.html)', async () => {
  for (const h of ['apmes', 'beta-apmes'])
    for (const p of ['/__/auth/handler?apiKey=x&mode=y', '/__/auth/iframe?apiKey=x', '/__/auth/handler.html', '/__/firebase/init.json'])
      assert.equal((await get(`https://${h}.anawj.com${p}`)).status, 200, h + p);
  assert.equal((await get('https://apmes.anawj.com/__/auth/nope')).status, 404);
});

test('only GET and HEAD (the guest sign-in aside)', async () => {
  assert.equal((await get('https://apmes.anawj.com/logbook/', 'POST')).status, 405);
  assert.equal((await get('https://beta-apmes.anawj.com/api/guest', 'POST')).status, 405);
});
