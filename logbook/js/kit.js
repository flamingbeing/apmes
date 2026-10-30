// The UI kit (app-ui: @core/theme and @core/ui, core.anawj.com/ui/<version>/) at one exact version. The palette and the
// confirm dialog load with import(), so those fall back to the logbook's own when core.anawj.com can't be reached.
// The theme add-ons (theme/addons/: saved themes, #t= links, fonts, wallpaper, custom CSS checks, colour grid, icon
// sets) are the logbook's theme engine: my-themes.js, fonts.js, wallpaper.js, custom-css.js, css-settings.js,
// colour-grid.js and theme-engine.js import them statically at this same version, and sw.js keeps them (offline), as
// with app-sync. Each passes the logbook's own lists, IndexedDB names and file kind, so saved data reads as before.
//
// The logbook keeps its own theme in charge (Themes page, saved themes, #t= links, custom CSS): its colours, light, dark
// or auto (data-theme) and its custom properties. The kit's palette goes in the lowest cascade layer
// (`kit`, index.html sets the order) and follows the logbook's data-theme (applyTheme ownTheme), so a kit part takes
// the logbook's --accent, --line, --muted… where both name one, and the kit's own tokens (--surface, --text…) are
// bridged from the logbook's in index.html's `kitoff` layer.
//
// startKit({ accent }): marks this device's kit look, density and glass on <html> and adds the kit palette.
// kitConfirm(text, { title, danger, yes }): the kit's confirm dialog (ui/modal.js), or null when the kit isn't there.
// loadMotion(): the kit's finger physics (ui/motion.js: glide, afterGesture, pressFeedback) into `motion`, which stays
//   null without the kit; the logbook's swipes then fall back to a plain ease-out (app.js glideX).
// tabBack: the kit's Back with tabs (ui/tab-back.js), for navigation.js; tabPages: its tab pages and their swipe
//   (ui/tab-pages.js), for app.js; holdKeyboard: keeps the phone keyboard for a field drawn after the tap
//   (ui/keep-keyboard.js); watchKeyboard: sets --ui-keyboard-bar-h, the Save bar's height over the keyboard
//   (ui/keyboard.js, the bar marked data-over-keyboard); LABELS: the kit's words (ui/labels.js).
// KIT_SHELL: every kit file the page loads (early.js, theme.css, the modules and what they import), for sw.js SHELL;
//   test/kit.test.mjs checks sw.js holds them.
export const KIT_VERSION = '1.0.0-rc.68';
export const KIT = `https://core.anawj.com/ui/${KIT_VERSION}/`;
export const KIT_CSS = ['theme/theme.css'];
export const KIT_MODULES = ['icons/lucide.js', 'theme/addons/colour-grid.js', 'theme/addons/custom-css.js', 'theme/addons/fonts.js', 'theme/addons/icon-sets.js', 'theme/addons/index.js', 'theme/addons/saved-themes.js', 'theme/addons/store.js', 'theme/addons/theme-link.js', 'theme/addons/wallpaper.js', 'theme/choice.js', 'theme/colour.js', 'theme/grid.js', 'theme/guard.js', 'theme/index.js', 'theme/looks.js', 'theme/looks/a.js', 'theme/looks/b.js', 'theme/looks/c.js', 'theme/looks/d.js', 'theme/looks/e.js', 'theme/looks/ios.js', 'theme/looks/m.js', 'theme/m3.js', 'theme/motion.js', 'theme/palette-css.js', 'theme/presets.js', 'theme/schema.js', 'theme/switch.js', 'ui/dom.js', 'ui/gesture.js', 'ui/keep-keyboard.js', 'ui/keyboard.js', 'ui/labels.js', 'ui/modal.js', 'ui/motion.js', 'ui/screens.js', 'ui/shell/shell.js', 'ui/steps.js', 'ui/tab-back.js', 'ui/tab-pages.js', 'ui/toast.js'];
export const KIT_SHELL = ['theme/early.js', ...KIT_CSS, ...KIT_MODULES].map(f => KIT + f);
// Back with tabs (navigation.js), tab pages, the keyboard: static imports, as the theme add-ons are, at the same version
export { tabBack } from 'https://core.anawj.com/ui/1.0.0-rc.68/ui/tab-back.js';
export { tabPages } from 'https://core.anawj.com/ui/1.0.0-rc.68/ui/tab-pages.js';
export { holdKeyboard } from 'https://core.anawj.com/ui/1.0.0-rc.68/ui/keep-keyboard.js';
export { watchKeyboard } from 'https://core.anawj.com/ui/1.0.0-rc.68/ui/keyboard.js';
export { LABELS } from 'https://core.anawj.com/ui/1.0.0-rc.68/ui/labels.js';

// (a literal address each, at KIT_VERSION, so the deploy bundle (tools/bundle-logbook.mjs) can take them in)
let theme = null, modal = null;
const loadTheme = () => (theme ||= import('https://core.anawj.com/ui/1.0.0-rc.68/theme/index.js'));
const loadModal = () => (modal ||= import('https://core.anawj.com/ui/1.0.0-rc.68/ui/modal.js'));
const missing = (e) => console.warn('UI kit not loaded', e);

export let motion = null;
export const loadMotion = () => import('https://core.anawj.com/ui/1.0.0-rc.68/ui/motion.js').then(m => { motion = m; return m; }, e => { missing(e); return null; });

export async function startKit({ accent } = {}) {
  if (typeof document === 'undefined') return;   // (node tests)
  try { (await loadTheme()).applyTheme({ accent, layer: 'kit', ownTheme: true }); } catch (e) { missing(e); theme = null; }
}

// -> { asked: Promise<boolean>, box: the open <dialog> } or null (the caller falls back to the logbook's own dialog)
export async function kitConfirm(text, { title, danger = false, yes } = {}) {
  let m;
  try { m = await loadModal(); } catch (e) { missing(e); modal = null; return null; }
  const asked = m.confirmModal(text, { title, danger, yes });
  const box = [...document.querySelectorAll('body > dialog.modal')].pop() || null;
  return { asked, box };
}
