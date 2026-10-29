// Offline copy of the home page as an installable app (served at /home/, which shows the same page as /), on the
// shared update core (app-update, core.anawj.com/update/0.2.0/): the page, its scripts, icons and the design kit are
// saved at install or none is; a new version takes over at once (home.js registers it). Scope /home/ only: the
// Logbook, Guidebook and the other apps keep their own workers and are never answered from here.
// The deploy stamps VERSION and MANIFEST (tools/stamp-versions.mjs).

const VERSION = 'home-v1';
const SHELL = [
  './', 'js/home.js', 'js/links.js', 'js/theme.js', 'js/counts.js', 'manifest.webmanifest',
  'https://design.anawj.com/v1/tokens.css', 'https://design.anawj.com/v1/app.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'https://core.anawj.com/update/0.2.0/register.js',
];
const MANIFEST = {};
importScripts('https://core.anawj.com/update/0.2.0/sw-core.js');

AppUpdate.init({
  app: 'home', version: VERSION, shell: SHELL, manifest: MANIFEST,
  never: [/\/sw\.js$/],
  runtime: [
    { name: 'kit', match: 'https://design.anawj.com/v1/', strategy: 'stale-while-revalidate', max: 40 },
    { name: 'pinned', match: /^https:\/\/core\.anawj\.com\/(sync|update)\/\d+\.\d+\.\d+\//, strategy: 'cache-first', max: 40 },
    // the counts card's Logbook files (/logbook/js/), kept for this page only
    { name: 'files', match: url => url.origin === self.location.origin && /\.(m?js|css|json|png|svg|webmanifest)$/i.test(url.pathname), strategy: 'stale-while-revalidate', max: 40 },
  ],
});
