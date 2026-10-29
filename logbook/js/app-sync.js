// The sync engine, write queue, outbox and device stores come from app-sync, one exact version (it never changes once
// published; sw.js caches it at install). Upgrade by changing the version here and in sw.js together, after the tests.
// Node tests load it through test/app-sync-hook.mjs.
export * from 'https://core.anawj.com/sync/1.5.5/index.js';
