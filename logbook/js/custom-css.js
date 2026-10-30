// Custom CSS (Settings → Themes, advanced; per device): the UI kit's add-on (app-ui theme/addons/custom-css.js, ported
// from here). Anything that loads from elsewhere is refused (url(), @import, image-set(), @font-face…), it is capped in
// size, it never applies on Themes or Layout (so a bad rule can always be fixed there), and ?nocss turns it off for a
// visit (display.js applyCustomCss).
export { MAX_CSS, checkCss } from 'https://core.anawj.com/ui/1.0.0-rc.68/theme/addons/custom-css.js';
