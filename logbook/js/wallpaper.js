// Wallpaper (Settings → Themes → Wallpaper; theme-revamp S4, owner 20 Oct 2026): a built-in pattern or your own
// photo behind every page, with a dim. Text that sits on the page itself (hints, the version line) stays at 4.5:1 or
// better on its own soft backing (the scrim, scrimFor), so the picture itself is dimmed only as much as you choose
// (TE S3, owner 21 Oct 2026: the old way raised the whole dim to the floor, often 70-90%, and washed photos out).
// The floor is what minDim works out from the wallpaper's colours and the palette in use (light, dark, OLED, tints);
// Flat cards (no card behind any text) still raise the whole dim to it. Pattern strength (wallInk) and see-through
// cards (wallFrost: frosted, the panel at 80% or more as frostAlpha needs) are TE S3 too. The photo is kept on this device only (IndexedDB, like
// uploaded fonts), made smaller first, and never uploaded or synced; a theme may set a pattern, never a photo.
// Colours from the wallpaper (W2): the photo's main colour, or one tapped on it, becomes the accent (colors.js
// works out the palettes). The pure part is unit-tested (test/wallpaper.test.mjs); style.css draws the layers
// (html.wall::before the picture, ::after the dim), lookCss (themes.js) a pattern, display.js applyWallpaper the rest.
//
// The engine is the UI kit's add-on (app-ui theme/addons/wallpaper.js, ported from here); the photo stays in this
// device's IndexedDB 'apmes-logbook-wall' (store 'files', key 'photo'), so a photo chosen before is still there.
import { photoStore } from 'https://core.anawj.com/ui/1.0.0-rc.68/theme/addons/wallpaper.js';
export * from 'https://core.anawj.com/ui/1.0.0-rc.68/theme/addons/wallpaper.js';

const photo = photoStore('apmes-logbook-wall');
export const getPhoto = photo.get, putPhoto = photo.put, deletePhoto = photo.remove, savePhoto = photo.save;
