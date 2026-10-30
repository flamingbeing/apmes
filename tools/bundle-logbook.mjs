// Joins the logbook's ~60 startup files into a few, at deploy time only (the deploy build runs it before
// stamp-versions.mjs; never committed), so a phone opens it with a handful of requests instead of 60. The source stays
// build-free: tests and local runs use it as it is. Each lazy screen (a literal import()) becomes its own file, loaded
// on first use as before. The core at an exact pin (core.anawj.com/ui/<x.y.z>/, /sync/<x.y.z>/: a released version
// never changes) is fetched and joined in too, only the parts the logbook imports; other origins (Firebase,
// design.anawj.com, the update core, which the service worker also loads) stay as they are.
// Output sits next to the source (logbook/js/<name>.b.js, chunk-<hash>.js) so relative URLs keep working. The page
// then starts js/app.b.js and preloads only what it imports, and sw.js's SHELL lists the bundle instead of the source.
// A non-literal import('./x.js') would load the source file as a second copy of that module: keep import() literal.
// Run: node tools/bundle-logbook.mjs [--check]   (--check builds into a temp folder and prints the sizes only)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'logbook');
const ESBUILD = 'esbuild@0.24.2';
const check = process.argv.includes('--check');
const out = check ? fs.mkdtempSync(path.join(os.tmpdir(), 'lb-bundle-')) : path.join(APP, 'js');

// esbuild, installed once into the temp folder (the repo has no dependencies)
const TOOL = path.join(os.tmpdir(), 'lb-bundle-esbuild');
if (!fs.existsSync(path.join(TOOL, 'node_modules', 'esbuild'))) {
  fs.mkdirSync(TOOL, { recursive: true });
  execFileSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--prefix', TOOL, ESBUILD], { stdio: 'inherit' });
}
const esbuild = createRequire(path.join(TOOL, 'x.js'))('esbuild');
const CORE = /^https:\/\/core\.anawj\.com\/(ui|sync)\/\d+\.\d+\.\d+[^/]*\//;
const fetched = new Map();
const core = {
  name: 'core',
  setup(b) {
    b.onResolve({ filter: /^https:\/\// }, a => (CORE.test(a.path) ? { path: a.path, namespace: 'core' } : { path: a.path, external: true }));
    b.onResolve({ filter: /.*/, namespace: 'core' }, a => ({ path: new URL(a.path, a.importer).href, namespace: 'core' }));
    b.onLoad({ filter: /.*/, namespace: 'core' }, async a => {
      if (!fetched.has(a.path)) {
        const r = await fetch(a.path);
        if (!r.ok) throw new Error(`bundle: ${a.path} answered ${r.status}`);
        fetched.set(a.path, await r.text());
      }
      return { contents: fetched.get(a.path), loader: 'js' };
    });
  },
};
const result = await esbuild.build({
  absWorkingDir: APP, entryPoints: ['js/app.js'], bundle: true, splitting: true, format: 'esm', minify: true, target: 'es2022',
  outdir: out, entryNames: '[name].b', chunkNames: 'chunk-[hash]', legalComments: 'none', metafile: true, logLevel: 'warning',
  plugins: [core],
});
const outputs = result.metafile.outputs;
const rel = f => path.relative(out, path.resolve(APP, f)).split(path.sep).join('/');   // metafile paths are cwd-relative
const files = Object.keys(outputs).filter(f => f.endsWith('.js'));
const entry = files.find(f => outputs[f].entryPoint === 'js/app.js');
const statics = new Set();
const walk = f => { if (statics.has(f)) return; statics.add(f); for (const i of outputs[f].imports) if (i.kind === 'import-statement' && !i.external) walk(i.path); };
walk(entry);
const gz = f => zlib.gzipSync(fs.readFileSync(path.resolve(APP, f)), { level: 9 }).length;
console.log(`bundle: ${files.length} files (${fetched.size} core files joined in); startup ${statics.size} files, ${([...statics].reduce((n, f) => n + gz(f), 0) / 1024).toFixed(1)} KiB gz`);
if (check) { fs.rmSync(out, { recursive: true }); process.exit(0); }

// the page: start the bundle, preload its startup files, drop the source preloads (other origins stay)
const htmlPath = path.join(APP, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const pre = [...statics].map(f => `<link rel="modulepreload" href="js/${rel(f)}">`).join('\n');
let placed = false;
html = html.replace(/^<link rel="modulepreload" href="js\/[^"]+">\n/gm, () => (placed ? '' : ((placed = true), pre + '\n')));
if (!placed) throw new Error('bundle: index.html has no local modulepreload lines to replace');
html = html.replace(/^<link rel="modulepreload" href="https:\/\/core\.anawj\.com\/(ui|sync)\/[^"]+"[^>]*>\n/gm, '');
const demo = files.find(f => outputs[f].entryPoint === 'js/demo-backend.js');
html = html.replace("pre('js/demo-backend.js')", () => `pre('js/${demo ? rel(demo) : 'demo-backend.js'}')`);
if (!html.includes('<script type="module" src="js/app.js"></script>')) throw new Error('bundle: index.html no longer starts js/app.js');
html = html.replace('<script type="module" src="js/app.js"></script>', `<script type="module" src="js/${rel(entry)}"></script>`);
fs.writeFileSync(htmlPath, html);

// the service worker: save the bundle instead of the source files (the source stays on the site for other pages)
const swPath = path.join(APP, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/);
// (the core's modules are inside the bundle now; its early.js, CSS and the update core still load on their own)
const kept = shell[1].replace(/'js\/[^']+\.js',\s*/g, '').replace(/'https:\/\/core\.anawj\.com\/(ui|sync)\/[^']+\.js',\s*/g, m => (/theme\/early\.js/.test(m) ? m : ''));
fs.writeFileSync(swPath, sw.replace(shell[0], `const SHELL = [${kept.trimEnd()}\n  ${files.map(f => `'js/${rel(f)}'`).join(', ')},\n];`));
console.log(`bundle: logbook/index.html starts js/${rel(entry)}; sw.js SHELL lists ${files.length} bundle files`);
