// The UI kit (app-ui: @core/theme and @core/ui, core.anawj.com/ui/<version>/) at one exact version, loaded with import()
// so the logbook still opens on its own styles when core.anawj.com can't be reached (the kit only adds to them).
//
// The logbook keeps its own theme engine (Themes page, saved themes, #t= links, custom CSS): its colours, light, dark
// or auto (data-theme) and its custom properties stay in charge. The kit's palette goes in the lowest cascade layer
// (`kit`, index.html sets the order) and follows the logbook's data-theme (applyTheme ownTheme), so a kit part takes
// the logbook's --accent, --line, --muted… where both name one, and the kit's own tokens (--surface, --text…) are
// bridged from the logbook's in index.html's `kitoff` layer.
//
// startKit({ accent }): marks this device's kit look, density and glass on <html> and adds the kit palette.
// kitConfirm(text, { title, danger, yes }): the kit's confirm dialog (ui/modal.js), or null when the kit isn't there.
// KIT_SHELL: every kit file the page loads (early.js, theme.css, the modules and what they import), for sw.js SHELL;
//   test/kit.test.mjs checks sw.js holds them.
export const KIT_VERSION = '1.0.0-rc.32';
export const KIT = `https://core.anawj.com/ui/${KIT_VERSION}/`;
export const KIT_CSS = ['theme/theme.css'];
export const KIT_MODULES = ['theme/choice.js', 'theme/colour.js', 'theme/grid.js', 'theme/guard.js', 'theme/index.js', 'theme/looks.js', 'theme/looks/a.js', 'theme/looks/b.js', 'theme/looks/c.js', 'theme/looks/d.js', 'theme/looks/e.js', 'theme/motion.js', 'theme/palette-css.js', 'theme/presets.js', 'theme/schema.js', 'theme/switch.js', 'ui/dom.js', 'ui/labels.js', 'ui/modal.js'];
export const KIT_SHELL = ['theme/early.js', ...KIT_CSS, ...KIT_MODULES].map(f => KIT + f);

let theme = null, modal = null;
const loadTheme = () => (theme ||= import(KIT + 'theme/index.js'));
const loadModal = () => (modal ||= import(KIT + 'ui/modal.js'));
const missing = (e) => console.warn('UI kit not loaded', e);

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
