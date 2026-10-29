// Fonts (Settings → Themes, per device): one for the interface and one for logging (the case box, case text in
// the Logbook, the reflection editor). Bundled fonts (fonts/, SIL Open Font License) load only when chosen and are
// then cached for offline use by the service worker. Your own font: a font installed on this device, by name (not
// every browser allows it: Safari mostly doesn't), or a font file kept on this device only (IndexedDB).
//
// The engine is the UI kit's add-on (app-ui theme/addons/fonts.js, ported from here). The logbook adds its default
// (Open Sans) and keeps its font files in IndexedDB 'apmes-logbook-fonts' (store 'files', keys 'ui' | 'log' and a saved
// theme's own copies), so files chosen before are still there; applyFonts sets the logbook's --font-ui and --font-log.
import * as kit from 'https://core.anawj.com/ui/1.0.0-rc.33/theme/addons/fonts.js';
export { THEME_FONTS, MAX_FONT_BYTES, FONT_TYPES, cleanFontName, userFamily, logChoice, fontToFile, cleanFontFile, fontAvailable } from 'https://core.anawj.com/ui/1.0.0-rc.33/theme/addons/fonts.js';

const OWN = { default: '"Open Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' };
export const FONTS = kit.FONTS.map(([k, label]) => [k, k === 'default' ? 'Open Sans (default)' : label]);
export const STACKS = { ...kit.STACKS, ...OWN };
export const fontStack = (choice, name = '', slot = 'ui') => kit.fontStack(choice, name, slot, OWN);

const store = kit.fontStore('apmes-logbook-fonts');
export const getUserFont = store.get, deleteUserFont = store.remove, loadUserFont = store.load, saveUserFont = store.save;
export const keepThemeFonts = store.keepForTheme, themeFonts = store.ofTheme, putThemeFonts = store.putForTheme;
export const useThemeFonts = store.useTheme, dropThemeFonts = store.dropTheme;

export function applyFonts(d = {}) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  root.setProperty('--font-ui', fontStack(d.fontUi || 'default', d.fontUiName, 'ui'));
  const lc = kit.logChoice(d);
  root.setProperty('--font-log', lc ? fontStack(lc, d.fontLogName, 'log') : 'var(--font-ui)');
  for (const [slot, choice] of [['ui', d.fontUi], ['log', lc]]) if (choice === 'file') loadUserFont(slot).catch(() => {});
}
