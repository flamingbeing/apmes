// worker/routes.js: which folder each address serves, and what it must never serve. Run: node --test 'worker/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve, SITES } from '../routes.js';

const HOSTS = ['apmes.anawj.com', 'beta-apmes.anawj.com'];

test('each app at its own path, on live and beta alike', () => {
  for (const h of HOSTS) {
    for (const app of ['logbook', 'evals', 'people', 'applicants', '360']) {
      assert.deepEqual(resolve(h, `/${app}/`), { file: `${app}/` }, h);
      assert.deepEqual(resolve(h, `/${app}`), { redirect: `/${app}/` }, h);
    }
    assert.deepEqual(resolve(h, '/logbook/js/app.js'), { file: 'logbook/js/app.js' });
    assert.deepEqual(resolve(h.toUpperCase() + ':443', '/evals/'), { file: 'evals/' });
    assert.deepEqual(resolve(h, '/apmes/guidebook/dops-expectations.md'), { file: 'apmes/guidebook/dops-expectations.md' });
  }
});

test('the home page at the root, on live and beta alike; nothing else there', () => {
  for (const h of HOSTS) {
    assert.deepEqual(resolve(h, '/'), { file: 'home/index.html' }, h);
    assert.deepEqual(resolve(h, '/index.html'), { file: 'home/index.html' }, h);
    assert.deepEqual(resolve(h, '/home/js/home.js'), { file: 'home/js/home.js' }, h);
    for (const p of ['/x', '/index.htm', '/favicon.ico', '/sw.js', '/js/home.js', '/home.html', '//', '/?x'])
      assert.deepEqual(resolve(h, p), { notFound: true }, h + p);
    // the prefixes below it are unchanged, the sign-in helper pages above all
    assert.deepEqual(resolve(h, '/__/auth/handler'), { file: '__/auth/handler' }, h);
    assert.deepEqual(resolve(h, '/__/auth/iframe.js'), { file: '__/auth/iframe.js' }, h);
    assert.deepEqual(resolve(h, '/logbook/index.html'), { file: 'logbook/index.html' }, h);
    assert.deepEqual(resolve(h, '/logbook/sw.js'), { file: 'logbook/sw.js' }, h);
  }
});

test('the guidebook pages at /guide/ (home/guide/); the raw .md stays at /apmes/guidebook/', () => {
  for (const h of HOSTS) {
    assert.deepEqual(resolve(h, '/guide/'), { file: 'home/guide/' }, h);
    assert.deepEqual(resolve(h, '/guide'), { redirect: '/guide/' }, h);
    assert.deepEqual(resolve(h, '/guide/epa-01.html'), { file: 'home/guide/epa-01.html' }, h);
    assert.deepEqual(resolve(h, '/guide/../logbook/x'), { notFound: true }, h);
    assert.deepEqual(resolve(h, '/apmes/guidebook/epa-01-06.md'), { file: 'apmes/guidebook/epa-01-06.md' }, h);
  }
});

test('only the guidebook of apmes/', () => {
  for (const h of HOSTS) {
    assert.deepEqual(resolve(h, '/apmes/originals/x.pdf'), { notFound: true }, h);
    assert.deepEqual(resolve(h, '/worker/sites.js'), { notFound: true }, h);
    assert.deepEqual(resolve(h, '/wrangler.jsonc'), { notFound: true }, h);
  }
});

test('sign-in helper pages: shared scripts, each host its own init.json', () => {
  for (const h of HOSTS) assert.deepEqual(resolve(h, '/__/auth/handler'), { file: '__/auth/handler' });
  assert.deepEqual(resolve('apmes.anawj.com', '/__/firebase/init.json'), { file: 'apmes-auth/firebase/init.json' });
  assert.deepEqual(resolve('beta-apmes.anawj.com', '/__/firebase/init.json'), { file: 'apmes-auth-beta/firebase/init.json' });
  const live = JSON.parse(fs.readFileSync(new URL('../../apmes-auth/firebase/init.json', import.meta.url)));
  const beta = JSON.parse(fs.readFileSync(new URL('../../apmes-auth-beta/firebase/init.json', import.meta.url)));
  assert.equal(live.authDomain, 'apmes.anawj.com');
  assert.equal(beta.authDomain, 'beta-apmes.anawj.com');
  assert.notEqual(live.projectId, beta.projectId, 'beta signs in to the test project');
});

test('unknown hosts serve nothing; localhost serves the repo', () => {
  assert.deepEqual(resolve('x.workers.dev', '/logbook/'), { notFound: true });
  assert.deepEqual(resolve('anawj.com', '/logbook/'), { notFound: true });
  assert.deepEqual(resolve('localhost:8787', '/logbook/'), { file: 'logbook/' });
});

test('nothing escapes its folder', () => {
  for (const h of Object.keys(SITES))
    for (const p of ['/logbook/../wrangler.jsonc', '/logbook/%2e%2e/x', '/logbook/a%2fb', '/logbook/a\\b', '/logbook/./x'])
      assert.deepEqual(resolve(h, p), { notFound: true }, h + p);
});

test('every folder in SITES exists', () => {
  for (const [host, s] of Object.entries(SITES))
    for (const f of [s.root, ...Object.values(s.prefixes || {}), ...Object.values(s.pages || {})].filter(Boolean))
      assert.ok(fs.existsSync(new URL(`../../${f}`, import.meta.url)), `${host}: ${f}`);
});
