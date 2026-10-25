// The write queue, outbox and status rules come from app-sync, one exact version (it never changes once published;
// sw.js caches it at install). Upgrade by changing the version here and in sw.js together, after the tests. Node
// tests load it through logbook/test/app-sync-hook.mjs.
export * from 'https://core.anawj.com/sync/0.7.3/index.js';
