// The home page's look follows the Logbook's on this device: its light or dark choice and its colours, read (never
// written) from the Logbook's own localStorage entries. The page's own Light / Dark switch is kept in HOME_KEY; with
// no choice there it follows the Logbook. index.html applies the same before the first paint.

export const LOGBOOK_THEME_KEY = 'apmes-logbook-theme';        // light (absent), dark, oled or auto (logbook display.js)
export const LOGBOOK_COLOURS_KEY = 'apmes-logbook-accent-css-v2';   // the Logbook's palettes as CSS (display.js applyPalette)
export const HOME_KEY = 'apmes-home-theme';                    // this page's switch: light or dark; absent = the Logbook's

const get = (store, k) => { try { return store.getItem(k); } catch { return null; } };

// -> { theme: 'light' | 'dark' | 'auto', oled } for <html data-theme> (and data-oled)
export function themeFor(store) {
  const own = get(store, HOME_KEY);
  if (own === 'light' || own === 'dark') return { theme: own, oled: false };
  const t = get(store, LOGBOOK_THEME_KEY);
  return { theme: t === 'dark' || t === 'oled' ? 'dark' : t === 'auto' ? 'auto' : 'light', oled: t === 'oled' };
}

// which switch button shows as chosen: the page's own choice, else what the Logbook's theme looks like now
export function switchState(store, prefersDark = false) {
  const { theme } = themeFor(store);
  return theme === 'auto' ? (prefersDark ? 'dark' : 'light') : theme;
}

export function setTheme(store, theme) {
  try { store.setItem(HOME_KEY, theme === 'dark' ? 'dark' : 'light'); } catch { /* storage blocked: this visit only */ }
}
export function followLogbook(store) {
  try { store.removeItem(HOME_KEY); } catch { /* storage blocked */ }
}

export function apply(doc, store) {
  const { theme, oled } = themeFor(store);
  doc.documentElement.dataset.theme = theme;
  if (oled) doc.documentElement.dataset.oled = ''; else delete doc.documentElement.dataset.oled;
}
