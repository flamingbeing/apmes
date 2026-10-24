// Offline app shell for APMES Evals, on the shared update core (app-update, core.anawj.com/update/0.1.0/): every SHELL
// file is saved at install or none is (the old copy keeps running), a new version takes over at once and the open page
// reloads once (js/app.js registers it). The deploy stamps VERSION and MANIFEST (tools/stamp-versions.mjs); change the
// base (evals-v19) only when this file's own logic changes. Firebase traffic always goes to the network (Firestore keeps
// its own offline cache); the versioned Firebase SDK is kept once fetched (the core's default rule).

const VERSION = 'evals-v19';
const SHELL = [
  './', 'style.css', 'manifest.webmanifest', 'https://design.anawj.com/v1/tokens.css', 'https://design.anawj.com/v1/app.css', 'https://design.anawj.com/v1/app.js',
  'js/app.js', 'js/ui-core.js', 'js/cloud.js', 'js/schema.js', 'js/demo-backend.js', 'js/firebase-config.js',
  'js/catalogue.js', 'js/forms.js', 'js/engine.js',
  'js/ui-home.js', 'js/ui-request.js', 'js/ui-requests.js', 'js/ui-result.js', 'js/ui-progress.js',
  'js/ui-pending.js', 'js/ui-form.js', 'js/ui-admin.js', 'js/ui-more.js',
  'js/vendor/qrcode.js', '../apmes/guidebook/dops-expectations.md',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'https://core.anawj.com/update/0.1.0/register.js',
];
const MANIFEST = {};
importScripts('https://core.anawj.com/update/0.1.0/sw-core.js');

AppUpdate.init({
  app: 'evals', version: VERSION, shell: SHELL, manifest: MANIFEST,
  never: [/\/sw\.js$/],
  runtime: [
    { name: 'kit', match: 'https://design.anawj.com/v1/', strategy: 'stale-while-revalidate', max: 40 },
    { name: 'pinned', match: /^https:\/\/core\.anawj\.com\/(sync|update)\/\d+\.\d+\.\d+\//, strategy: 'cache-first', max: 40 },
    { name: 'files', match: url => url.origin === self.location.origin && /\.(m?js|css|json|md|png|svg|jpe?g|webp|gif|ico|woff2?|ttf|webmanifest|xlsx|docx|pdf|txt|wasm)$/i.test(url.pathname), strategy: 'stale-while-revalidate', max: 60 },
  ],
});
