// Your themes (Themes page; owner, 16 Oct 2026): change a theme and the page says it is now Custom; Save this look keeps
// it under a name of your own (this device, `display().myThemes`), to pick again later like any theme. Export writes
// them to a file (.json) to keep or pass on; Import reads such a file back (only known look settings, checked).
// Pure (test/my-themes.test.mjs); the page is ui-settings.js renderThemes.// The engine is the UI kit's add-ons (savedThemes, themeLinks): this file passes the logbook's look settings, presets
// and link lists, so saved themes, theme files and #t= links read and write exactly as before.

import { savedThemes, themeLinks } from 'https://core.anawj.com/ui/1.0.0-rc.37/theme/addons/index.js';
import { THEME_KEYS, TINTS, keepKept, checkTheme, THEMES, themePatch } from './themes.js';
import { foldCompact, TAB_ICONS } from './theme-engine.js';
import { LOOK, lookField, cleanLook, keptKeys } from './look-schema.js';
import { checkColours, COLOUR_TOKENS, ROLE_TOKENS } from './colors.js';

export const MAX_MINE = 12;
export const FILE_KIND = 'apmes-logbook-themes';

// the look settings of a display (only the set ones)
export function lookOf(d = {}) {
  d = foldCompact(d) || {};   // an old saved theme's Compact mode is Spacing: Tight
  const out = {};
  // each checked against what it may hold (look-schema.js), so a file can't put odd values on a device
  for (const k of THEME_KEYS) { const v = cleanLook(k, d[k]); if (v != null) out[k] = v; }
  return out;
}

const saved = savedThemes({
  lookOf, fileKind: FILE_KIND, max: MAX_MINE, presets: THEMES, keep: keepKept, kept: keptKeys, keys: THEME_KEYS,
  check: look => checkColours(look, TINTS[look.bgTint] || {}), presetPatch: themePatch,
});
export const { cleanMine, saveMine, minePatch, matchMine, exportText, importText, lookNow } = saved;
// Day and night: -> { mine, name } for one of Your themes, { theme, name } for a bundled one, or null
export function nightRef(d = {}) {
  const n = saved.nightRef(d);
  return n && 'preset' in n ? { theme: n.preset, name: n.name } : n;
}

// Theme links (…/logbook/#t=…; formats 2 and 3, theme-link.js in the kit): every setting as its place in LINK_KEYS,
// which only grows at the end (test/fixtures/theme-link-lists.json holds it, and LINK_TABS, LINK_ICONS).
export const LINK_KEY = 't';
const SIDES = ['light', 'dark'];
// (settings added to the look after tabIcon, from TE S3, come after the colour tokens, so older places never move; the
// colour roles, TE S4, after wallFrost; look settings newer than that after the roles)
const LATE = LOOK.findIndex(f => f.key === 'tabIcon') + 1, ROLES_AT = LOOK.findIndex(f => f.key === 'wallFrost') + 1;
export const LINK_KEYS = [...LOOK.slice(0, LATE).filter(f => f.kind !== 'colours').map(f => f.key), ...SIDES.flatMap(s => COLOUR_TOKENS.map(k => `${s}.${k}`)),
  ...LOOK.slice(LATE, ROLES_AT).map(f => f.key), ...SIDES.flatMap(s => ROLE_TOKENS.map(k => `${s}.${k}`)), ...LOOK.slice(ROLES_AT).map(f => f.key)];
// (format 3) the tabs and icons a tab icon is written with: both lists only grow at the end (the fixture holds them)
export const LINK_TABS = ['caselogs', 'log', 'logbook', 'totals', 'notes', 'reflect', 'progress', 'account', 'settings', 'recovery', 'data', 'admin', 'more'];
export const LINK_ICONS = Object.keys(TAB_ICONS);
// (format 3) the settings every format 3 link reader knows: their values skip the 2 bits that say the value's kind
export const KNOWN3 = 76;

// the look, made safe for a link: (after lookOf) whatever checkTheme rejects is dropped, fonts that aren't bundled too
function safe(look) {
  look = { ...look };
  const bad = () => checkTheme({ id: 'shared', name: 'Shared', group: 'classic', desc: 'A theme from a link', look });
  for (const b of bad()) {
    const k = /^look\.(\w+)/.exec(b)?.[1] || (b.startsWith('colours') ? 'colours' : null);
    if (k) delete look[k];
  }
  if (bad().length) delete look.colours, delete look.bgTint, delete look.accent;   // colours that clash in a way no single key explains
  return bad().length ? {} : look;
}
export const { themeLink, themeFromLink, isThemeLink } = themeLinks({
  keys: LINK_KEYS, field: lookField, lookOf, safe, presets: THEMES, known: KNOWN3, tabs: LINK_TABS, icons: LINK_ICONS, hashKey: LINK_KEY,
});
