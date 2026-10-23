// Offline copy of the guidebook pages (/guide/, served from home/guide/). Every page, search.json and the design kit are
// saved at install, so the whole guidebook reads offline once the app has opened with signal. The pages are static:
// a new VERSION (stamped at deploy, tools/stamp-versions.mjs) takes over straight away, no "Update available".
// The page list isn't kept here: it comes from search.json (one entry per section of every page) plus the two pages
// that aren't in it, so a new guidebook page is saved without editing this file.

const VERSION = 'guide-v1';
// the NUHS design kit lives on another host; SHELL caches it at install, and this answers it from that cache offline
const KIT = 'https://design.anawj.com/v1/';
const SHELL = [
  './', 'entrustment.html', 'guide.css', 'guide.js', 'search.json', 'manifest.webmanifest',
  'https://design.anawj.com/v1/tokens.css', 'https://design.anawj.com/v1/app.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', e => {
  // one missing file must not stop the whole install, so cache each on its own
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    const add = u => c.add(new Request(u, { cache: 'reload' })).catch(() => {});
    await Promise.all(SHELL.map(add));
    const index = await c.match('search.json');
    const pages = index ? [...new Set((await index.json()).map(x => x.p + '.html'))] : [];
    await Promise.all(pages.map(add));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // only this app's caches: the logbook and evals on the same origin keep their own
    for (const k of await caches.keys()) if (k.startsWith('guide-') && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

const NEVER = /(^|\.)(googleapis\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|google\.com)$/;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.url.startsWith(KIT)) {
    // cache first: the kit's /v1/ only changes compatibly
    e.respondWith(caches.open(VERSION).then(async c => (await c.match(req.url)) || fetch(req).then(res => {
      if (res.ok) c.put(req.url, res.clone());
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin || NEVER.test(url.hostname)) return;
  if (url.pathname.includes('/__/')) return; // Firebase auth helper pages
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // a page opened from a search result carries ?q=words: the saved page is the same whatever the query
    const nav = req.mode === 'navigate', key = nav ? url.origin + url.pathname : req;
    const hit = await cache.match(key, { ignoreSearch: nav });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    } catch (err) {
      const home = nav && await cache.match('./');
      if (home) return home;
      throw err;
    }
  })());
});
