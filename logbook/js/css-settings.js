// Settings inside custom CSS (theme-revamp S6, P2): a `/* @settings … */` comment lists CSS variables the resident
// can then change with sliders, colours and switches under Custom CSS, without editing the CSS. One setting a line:
//
//   /* @settings
//   slider --card-gap 0 24 2 8px  Space between cards
//   colour --mark #ffcc00  Highlight colour
//   switch --chip-round 4px 999px  Round chips
//   */
//
// slider: lowest, highest, step, default (its unit is the slider's: px, em, rem, %, deg, ms, s, vh, vw or none);
// colour (or color): the default #rrggbb; switch: the value when off (the default), then when on. The rest of the line
// is the label (quotes optional). The app writes the chosen values as `:root { --name: value }` after the CSS, so
// `var(--card-gap)` in the CSS follows the slider. Values are only numbers with a unit, #rrggbb or a plain word, so
// nothing a setting holds can break out of its declaration. A small line parser, no YAML. Pure; tested.

export const MAX_SETTINGS = 24;
const UNITS = ['', 'px', 'em', 'rem', '%', 'deg', 'ms', 's', 'vh', 'vw'];
const NAME = /^--[a-z][a-z0-9-]{0,39}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const WORD = /^[a-z][a-z-]{0,23}$/i;

// '8px' -> { n: 8, unit: 'px' }, or null
function amount(s) {
  const m = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i.exec(String(s || ''));
  if (!m || !UNITS.includes(m[2].toLowerCase())) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && Math.abs(n) <= 10000 ? { n, unit: m[2].toLowerCase() } : null;
}
const switchValue = s => (s != null && (amount(s) || HEX.test(s) || WORD.test(s)) ? String(s) : null);
const labelOf = (rest, name) => (rest.join(' ').replace(/^["“']|["”']$/g, '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || name);
const round4 = x => Number(x.toFixed(4));

// css -> { settings: [{ kind, name, label, … }], problems: ['line 2: …'] }. Only the first @settings comment counts.
export function parseSettings(css) {
  const block = /\/\*\s*@settings\b([\s\S]*?)\*\//.exec(String(css || ''));
  const settings = [], problems = [], seen = new Set();
  if (!block) return { settings, problems };
  block[1].split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    const bad = why => problems.push(`line ${i + 1}: ${why}`);
    const [kind0, name, ...rest] = line.split(/\s+/);
    const kind = kind0.toLowerCase() === 'color' ? 'colour' : kind0.toLowerCase();
    if (!['slider', 'colour', 'switch'].includes(kind)) return bad(`“${kind0.slice(0, 20)}” isn’t slider, colour or switch`);
    if (!NAME.test(name || '')) return bad('the name must be like --my-gap (small letters, digits and -)');
    if (seen.has(name)) return bad(`${name} is there twice`);
    if (settings.length >= MAX_SETTINGS) return bad(`at most ${MAX_SETTINGS} settings`);
    if (kind === 'slider') {
      const [lo, hi, st, def] = rest.slice(0, 4).map(amount);
      if (!lo || !hi || !st || !def) return bad('a slider needs lowest, highest, step and default, like 0 24 2 8px');
      const unit = def.unit || lo.unit;
      if (!(lo.n < hi.n) || !(st.n > 0) || (hi.n - lo.n) / st.n > 1000 || def.n < lo.n || def.n > hi.n) return bad('lowest < highest, a step above 0 and the default between them');
      settings.push({ kind, name, label: labelOf(rest.slice(4), name), min: lo.n, max: hi.n, step: st.n, def: def.n, unit });
    } else if (kind === 'colour') {
      if (!HEX.test(rest[0] || '')) return bad('a colour needs its default, like #ffcc00');
      settings.push({ kind, name, label: labelOf(rest.slice(1), name), def: rest[0].toLowerCase() });
    } else {
      const off = switchValue(rest[0]), on = switchValue(rest[1]);
      if (off == null || on == null) return bad('a switch needs its off and on values, like 4px 999px or none block');
      settings.push({ kind, name, label: labelOf(rest.slice(2), name), off, on });
    }
    seen.add(name);
  });
  return { settings, problems };
}

// a chosen value as the setting allows it, or null (= its default)
export function cleanValue(s, v) {
  if (v == null) return null;
  if (s.kind === 'slider') {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(s.max, Math.max(s.min, round4(s.min + Math.round((n - s.min) / s.step) * s.step))) : null;
  }
  if (s.kind === 'colour') return HEX.test(String(v)) ? String(v).toLowerCase() : null;
  return typeof v === 'boolean' ? v : null;
}
// the device's chosen values, only for settings the CSS still has
export function cleanValues(settings, vals) {
  const out = {};
  if (!vals || typeof vals !== 'object' || Array.isArray(vals)) return out;
  for (const s of settings) { const v = cleanValue(s, vals[s.name]); if (v != null) out[s.name] = v; }
  return out;
}
export const valueOf = (s, vals) => { const v = cleanValue(s, (vals || {})[s.name]); return v == null ? (s.kind === 'switch' ? false : s.def) : v; };
export const cssValue = (s, v) => (s.kind === 'slider' ? v + s.unit : s.kind === 'switch' ? (v ? s.on : s.off) : v);
// ':root { --a: 8px; … }', or '' when the CSS has no settings
export function settingsCss(settings, vals) {
  if (!settings.length) return '';
  return ':root { ' + settings.map(s => `${s.name}: ${cssValue(s, valueOf(s, vals))};`).join(' ') + ' }';
}
