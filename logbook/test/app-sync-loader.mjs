// Node module hooks (registered by app-sync-hook.mjs): load the pinned app-sync (js/app-sync.js imports it from
// https://core.anawj.com/sync/<version>/) in unit tests. Each file is fetched once into a cache folder (published
// versions never change); APP_SYNC_DIR=<an app-sync checkout> loads that instead (offline, or trying a new version).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const BASE = 'https://core.anawj.com/sync/';
const CACHE = path.join(os.tmpdir(), 'app-sync-cache');

export async function resolve(spec, ctx, next) {
  if (spec.startsWith(BASE)) return { url: spec, shortCircuit: true };
  if (ctx.parentURL && ctx.parentURL.startsWith(BASE) && /^\.\.?\//.test(spec)) return { url: new URL(spec, ctx.parentURL).href, shortCircuit: true };
  return next(spec, ctx);
}

export async function load(url, ctx, next) {
  if (!url.startsWith(BASE)) return next(url, ctx);
  const rel = url.slice(BASE.length);   // <version>/index.js, <version>/src/sync.js
  let source;
  if (process.env.APP_SYNC_DIR) source = await fs.readFile(path.join(process.env.APP_SYNC_DIR, rel.split('/').slice(1).join('/')), 'utf8');
  else {
    const file = path.join(CACHE, rel);
    try { source = await fs.readFile(file, 'utf8'); }
    catch {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`app-sync: ${url} answered ${res.status}`);
      source = await res.text();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file + '.tmp' + process.pid, source);
      await fs.rename(file + '.tmp' + process.pid, file);
    }
  }
  return { format: 'module', source, shortCircuit: true };
}
