// Settings inside custom CSS (theme-revamp S6): a `/* @settings … */` comment lists CSS variables the resident can then
// change with sliders, colours and switches under Custom CSS, without editing the CSS. One setting a line:
//
//   /* @settings
//   slider --card-gap 0 24 2 8px  Space between cards
//   colour --mark #ffcc00  Highlight colour
//   switch --chip-round 4px 999px  Round chips
//   */
//
// The parser and the values are the UI kit's add-on (app-ui theme/addons/custom-css.js, ported from here).
export { MAX_SETTINGS, parseSettings, cleanValue, cleanValues, valueOf, cssValue, settingsCss } from 'https://core.anawj.com/ui/1.0.0-rc.33/theme/addons/custom-css.js';
