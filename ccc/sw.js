// Offline app shell for APMES CCC, on the shared update core (app-update, core.anawj.com/update/0.2.0/): every SHELL file
// is saved at install or none is (the old copy keeps running), a new version takes over at once and the open page
// reloads once nobody is typing (js/update.js registers it). The deploy stamps VERSION and MANIFEST
// (tools/stamp-versions.mjs); change the base (ccc-v1) only when this file's own logic changes. Firebase traffic always
// goes to the network (Firestore keeps its own offline cache). The raters' page (rate/) and the demo landing page are
// left to the network: the rater has no sign-in and must always get the page and the invite from the server.

const VERSION = 'ccc-v1';
const SHELL = [
  './', 'manifest.webmanifest', '../evals/style.css', 'https://design.anawj.com/v1/tokens.css', 'https://design.anawj.com/v1/app.css', 'https://design.anawj.com/v1/app.js',
  'js/app.js', 'js/staff.js', 'js/store.js', 'js/model.js', 'js/msf-form.js', 'js/overlay.js', 'js/writes.js', 'js/app-sync.js', 'js/update.js',
  '../evals/js/ui-core.js', '../evals/js/cloud.js', '../evals/js/eval-queue.js', '../evals/js/app-sync.js', '../evals/js/schema.js', '../evals/js/engine.js', '../evals/js/catalogue.js', '../evals/js/demo-backend.js', '../evals/js/firebase-config.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  // the sync engine (app-sync), one exact version (js/app-sync.js pins the same one)
  'https://core.anawj.com/sync/0.7.1/index.js', 'https://core.anawj.com/sync/0.7.1/src/sync.js', 'https://core.anawj.com/sync/0.7.1/src/writes.js', 'https://core.anawj.com/sync/0.7.1/src/conflict.js', 'https://core.anawj.com/sync/0.7.1/src/store.js', 'https://core.anawj.com/sync/0.7.1/src/outbox.js', 'https://core.anawj.com/sync/0.7.1/src/watchdog.js', 'https://core.anawj.com/sync/0.7.1/src/persist.js', 'https://core.anawj.com/sync/0.7.1/src/status.js', 'https://core.anawj.com/sync/0.7.1/src/firestore.js', 'https://core.anawj.com/sync/0.7.1/src/forget.js', 'https://core.anawj.com/sync/0.7.1/src/registry.js', 'https://core.anawj.com/sync/0.7.1/src/report.js', 'https://core.anawj.com/sync/0.7.1/src/app.js', 'https://core.anawj.com/sync/0.7.1/src/cache.js',
  'https://core.anawj.com/update/0.2.0/register.js',
];
const MANIFEST = {};
importScripts('https://core.anawj.com/update/0.2.0/sw-core.js');

AppUpdate.init({
  app: 'ccc', version: VERSION, shell: SHELL, manifest: MANIFEST,
  never: [/\/sw\.js$/, /^\/ccc\/(rate|demo|status)\//],
  runtime: [
    { name: 'kit', match: 'https://design.anawj.com/v1/', strategy: 'stale-while-revalidate', max: 40 },
    { name: 'pinned', match: /^https:\/\/core\.anawj\.com\/(sync|update)\/\d+\.\d+\.\d+\//, strategy: 'cache-first', max: 40 },
    { name: 'files', match: url => url.origin === self.location.origin && /\.(m?js|css|json|png|svg|jpe?g|webp|gif|ico|woff2?|ttf|webmanifest)$/i.test(url.pathname), strategy: 'stale-while-revalidate', max: 60 },
  ],
});
