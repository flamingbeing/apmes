// Offline app shell for the APMES Logbook, on the shared update core (app-update, core.anawj.com/update/0.2.0/): every
// SHELL file is saved at install or none is (the old copy keeps running); a new version waits (waitForGo) until the open
// page says go, which it does only when nobody is typing and nothing is sending, then takes over and the page reloads
// once (js/app-version.js registers it). The deploy stamps VERSION and MANIFEST (tools/stamp-versions.mjs);
// change the base (logbook-v44) only when this file's own logic changes. Firebase traffic always goes to the network
// (Firestore keeps its own offline cache); the versioned Firebase SDK is kept once fetched (the core's default rule).

const VERSION = 'logbook-v44';
const SHELL = [
  './', 'style.css', 'manifest.webmanifest',
  'js/app.js', 'js/navigation.js', 'js/transients.js', 'js/ui-core.js', 'js/ui-log.js', 'js/ui-logbook.js', 'js/ui-progress.js', 'js/ui-settings.js', 'js/ui-theme-link.js', 'js/display.js', 'js/settings-rows.js', 'js/more-cards.js', 'js/sync-forget.js', 'js/ui-admin.js', 'js/ui-reflect.js', 'js/reflections.js', 'js/portfolio.js',
  'js/categories.js', 'js/engine.js', 'js/suggest.js', 'js/keywords.js', 'js/importer.js', 'js/form-inbox.js', 'js/xlsxio.js',
  'js/recovery-store.js', 'js/writes.js', 'js/store.js', 'js/app-sync.js', 'js/drafts.js', 'js/ui-recovery.js', 'js/cloud.js', 'js/clean.js', 'js/demo-backend.js', 'js/demo-seed.js', 'js/firebase-config.js', 'js/bin.js', 'js/destinations.js', 'js/ui-send.js', 'js/reflect-import.js', 'js/ui-reflect-import.js', 'js/ui-account.js', 'js/profile.js', 'js/share.js', 'js/share-format.js', 'js/markdown.js', 'js/ui-notes.js', 'js/backup-targets.js', 'js/cloud-save.js', 'js/fonts.js', 'js/custom-css.js', 'js/css-settings.js', 'js/hide-mode.js', 'js/export-opts.js', 'js/search-ops.js', 'js/settings-file.js', 'js/profiles.js', 'js/moved.js', 'js/colors.js', 'js/glance.js', 'js/analytics.js', 'js/backup.js', 'js/tags.js', 'js/notepad.js', 'js/ui-notepad.js', 'js/backup-csv.js', 'js/ui-caselogs.js', 'js/logging.js', 'js/paste-clean.js', 'js/fmt-bar.js', 'js/share-in.js', 'js/ui-share-in.js', 'js/sync-md.js', 'js/merge3.js', 'js/sync-remote.js', 'js/ui-sync.js', 'js/parts.js', 'js/ui-parts.js',
  'js/device-presets.js', 'js/bulk-change.js', 'js/ui-bulk.js', 'js/note-bulk.js', 'js/ui-bulk-notes.js', 'js/refl-bulk.js', 'js/ui-bulk-refl.js', 'js/global-search.js', 'js/ui-search.js', 'js/ui-bulk-mixed.js', 'js/paging.js', 'js/eval-link.js', 'js/feedback.js', 'js/ui-feedback.js', 'js/ui-formview.js', 'js/app-version.js',
  'js/drag-list.js', 'js/lb-group.js', 'js/list-format.js', 'js/my-themes.js', 'js/look-schema.js', 'js/colour-grid.js', 'js/ui-colour-sheet.js', 'js/sheet-outbox.js', 'js/themes.js', 'js/theme-engine.js', 'js/wallpaper.js', 'js/year-compare.js',
  'vendor/exceljs.min.js', 'vendor/jszip.min.js', 'https://design.anawj.com/v1/feedback/qr.js', 'https://design.anawj.com/v1/feedback/vendor/qrcode.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  // the sync engine (app-sync), one exact version (js/app-sync.js pins the same one)
  'https://core.anawj.com/sync/0.4.0/index.js', 'https://core.anawj.com/sync/0.4.0/src/sync.js', 'https://core.anawj.com/sync/0.4.0/src/writes.js', 'https://core.anawj.com/sync/0.4.0/src/conflict.js', 'https://core.anawj.com/sync/0.4.0/src/store.js', 'https://core.anawj.com/sync/0.4.0/src/outbox.js', 'https://core.anawj.com/sync/0.4.0/src/watchdog.js', 'https://core.anawj.com/sync/0.4.0/src/persist.js', 'https://core.anawj.com/sync/0.4.0/src/forget.js', 'https://core.anawj.com/sync/0.4.0/src/status.js', 'https://core.anawj.com/sync/0.4.0/src/firestore.js',
  'https://core.anawj.com/update/0.2.0/register.js',
];
const MANIFEST = {};
importScripts('https://core.anawj.com/update/0.2.0/sw-core.js');

// Shared to the installed app (manifest share_target, POST multipart): text, a title, a link and .md / .txt files.
// Kept in Cache Storage for the page (share-in.js readInbox; the cache's name doesn't start with "logbook-", so a new
// version doesn't clear it), then the app opens on the chooser. Keep the names in step with share-in.js.
const SHARE_CACHE = 'share-inbox-logbook', SHARE_FILE = 'share-inbox.json';
const isTextFile = f => /^text\//i.test(f.type || '') || /markdown/i.test(f.type || '') || /\.(md|markdown|txt)$/i.test(f.name || '');
async function receiveShare(req) {
  try {
    const form = await req.formData(), cut = v => String(v || '').slice(0, 100000);
    const data = { title: cut(form.get('title')), text: cut(form.get('text')), url: cut(form.get('url')), files: [], at: Date.now() };
    for (const f of form.getAll('files')) {
      if (!f || typeof f === 'string' || !isTextFile(f) || f.size > 1024 * 1024 || data.files.length >= 10) continue;
      data.files.push({ name: String(f.name || '').slice(0, 200), type: f.type || '', text: cut(await f.text()) });
    }
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(new URL(SHARE_FILE, self.registration.scope).href, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }));
  } catch (err) { console.warn('Share not kept', err); }
  return Response.redirect(new URL('./?shared=1#log', self.registration.scope).href, 303);
}

AppUpdate.init({
  app: 'logbook', version: VERSION, shell: SHELL, manifest: MANIFEST, waitForGo: true,
  never: [/\/sw\.js$/],
  runtime: [
    { name: 'kit', match: 'https://design.anawj.com/v1/', strategy: 'stale-while-revalidate', max: 40 },
    { name: 'pinned', match: /^https:\/\/core\.anawj\.com\/(sync|update)\/\d+\.\d+\.\d+\//, strategy: 'cache-first', max: 40 },
    { name: 'files', match: url => url.origin === self.location.origin && /\.(m?js|css|json|md|png|svg|jpe?g|webp|gif|ico|woff2?|ttf|webmanifest|xlsx|docx|pdf|txt|wasm)$/i.test(url.pathname), strategy: 'stale-while-revalidate', max: 60 },
  ],
  handle: e => (e.request.method === 'POST' && new URL(e.request.url).origin === self.location.origin && new URL(e.request.url).pathname.endsWith('/share-target') ? receiveShare(e.request) : null),
});
