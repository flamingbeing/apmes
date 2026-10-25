// Node module hook for cloud.test.mjs (it registers this itself): the Firebase SDK addresses cloud.js imports
// (www.gstatic.com/firebasejs/…) load the stand-ins in this folder instead.
const SDK = /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-(?:app|auth|firestore))\.js$/;
export async function resolve(spec, ctx, next) {
  const m = SDK.exec(spec);
  if (m) return { url: new URL(m[1] + '.mjs', import.meta.url).href, shortCircuit: true };
  return next(spec, ctx);
}
