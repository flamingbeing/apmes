// Offline copy of the guidebook pages (/guide/, served from home/guide/), on the shared update core (app-update,
// core.anawj.com/update/0.1.0/): every page, search.json and the design kit are saved at install or none is, so the whole
// guidebook reads offline once the app has opened with signal; a new version takes over at once (guide.js registers it).
// The deploy stamps VERSION and MANIFEST (tools/stamp-versions.mjs). Every page must be in SHELL (a page that isn't
// would open as the contents page offline): tools/check.mjs fails when a home/guide/*.html page is missing here.

const VERSION = 'guide-v2';
const SHELL = [
  './', 'entrustment.html', 'guide.css', 'guide.js', 'notes.js', 'notes-core.js', 'search.json', 'manifest.webmanifest',
  '00-introduction.html', 'appendix.html', 'dops-expectations.html', 'epa-01.html', 'epa-02.html', 'epa-03.html', 'epa-04.html', 'epa-05.html', 'epa-06.html', 'epa-07-attachments.html', 'epa-07.html', 'epa-08.html', 'epa-09.html', 'epa-10.html', 'epa-11.html', 'epa-12.html', 'msf-and-competency-forms.html',
  'https://design.anawj.com/v1/tokens.css', 'https://design.anawj.com/v1/app.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'https://core.anawj.com/update/0.1.0/register.js',
];
const MANIFEST = {};
importScripts('https://core.anawj.com/update/0.1.0/sw-core.js');

AppUpdate.init({
  app: 'guide', version: VERSION, shell: SHELL, manifest: MANIFEST,
  never: [/\/sw\.js$/],
  runtime: [
    { name: 'kit', match: 'https://design.anawj.com/v1/', strategy: 'stale-while-revalidate', max: 40 },
    { name: 'pinned', match: /^https:\/\/core\.anawj\.com\/(sync|update)\/\d+\.\d+\.\d+\//, strategy: 'cache-first', max: 40 },
    { name: 'files', match: url => url.origin === self.location.origin && /\.(m?js|css|json|md|png|svg|jpe?g|webp|gif|ico|woff2?|ttf|webmanifest|xlsx|docx|pdf|txt|wasm)$/i.test(url.pathname), strategy: 'stale-while-revalidate', max: 60 },
  ],
});
