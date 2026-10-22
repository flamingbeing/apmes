# Logbook screens: Themes and colour

Part of the logbook working notes; index of screens in [../screens.md](../screens.md). Settings → Themes: themes, colour, colour sheet, wallpaper and icons, theme links, Your themes, top band.

- **Themes and Advanced theme settings** (TE S2, owner 21 Oct 2026): Themes (`#themes`) keeps the essentials: the
  themes and Browse all, Keep when changing theme, Your themes, Colour and light (light or dark, the night theme, Colour,
  Background), Wallpaper, then one row to **Advanced theme settings** (`#themesadv`, `renderThemesAdv`): Shape and type,
  Fine-tune, Header and tab bar, Rows and forms, App-style details, More colour (Colourful, Top band), Edit colours,
  Custom CSS. Both pages have the preview and the reset. Which card is on which page is `THEME_CARDS` in look-schema.js,
  and every look setting names its card (`section`; unit test in `look-schema.test.mjs`), so the pages can't drift. A
  copied `#themes?find=…` link to an option now on Advanced opens Advanced (`SPILL` in app.js `showFound`); Settings
  search lists both pages. The paragraph below is from before the split.
- **The colour sheet** (TE S2; `ui-colour-sheet.js`, grid in `colour-grid.js`; e2e `colour-sheet.mjs`): Colour → More
  colours, the icon tint and each Edit colours token open it instead of the phone's own picker (which shows only a few
  colours): 12 hues × 8 shades (OKLCH, as much colour as fits) and a grey row, one radio group with names like "Teal,
  shade 5" (arrows along a row, up and down a hue), a dot in each cell showing the deeper shade the palette uses for text
  (Colour and icon tint), a hex box, Recent (this device, 8), and the phone's own picker last. The page changes as you
  pick; Cancel puts it back. Grid, Recent and phone-picker colours are snapped to 6 bits a channel (`snap`, at most 2/255
  off, invisible) so a link carries them in 18 bits; a typed hex stays exactly as typed.
- **Colour** (owner, 13 Oct 2026): the device's own colour picker (one colour well, Default colour beside it), no
  preset swatches; the light and dark palettes still adjust it to stay readable.
- **Colour** (Display): one accent (`settings.accent`, null = NUHS navy): 8 suggested swatches + any colour.
  `colors.js` (tested) works out light, dark and OLED palettes with contrast floors (light accent 4.5:1 with white;
  dark accent 7:1 on cards, near-white text, neutral grey backgrounds) and writes them into <style id="accent-css">,
  cached for the first paint (index.html). Light / Dark / OLED (pure black: data-oled on top of dark) / Auto is
  separate, per device. (Fixed named themes were tried and dropped: they read as shades of one colour.)
- **Edit colours** (Themes, per device; its card sits below the look settings, above the reset link): `colours: { light: {...}, dark: {...} }` overrides any of `bg`,
  `panel`, `ink`, `muted`, `line`, `accent`, `accentInk`, `ok`, `warn`, `err` (six-digit hex only). Omitted
  tokens keep their accent/tint values; old looks are unchanged. The Light / Dark editor drafts both palettes,
  shows live contrast ratios and resets individual overrides. Save checks ink and muted on bg and panel,
  and accentInk on accent, at 4.5:1 in light, dark and OLED; failing pairs name their ratio. Any override makes
  the look Custom. The look CSS cache includes overrides at first paint. Your themes and settings files carry
  the tokens, sanitised to known names and hex values; old theme files still import.

### Themes (Settings → Themes; `themes.js`; owner, 15 Oct 2026)

- A theme is a bundle of this device's look settings (`THEME_KEYS`); picking one sets them all (Undo in the toast),
  and changing any afterwards shows "Custom (based on …)". Classic themes are cards; Inspired ones ("Obsidian-style",
  colours, corners and type only, never logos, paid fonts or brand names beyond "-style") are a searchable list.
  No celebrity or brand palettes (owner). New ideas come in through "Suggest a theme" (private feedback).
- Layout keeps how it works (start tab, tab bar, row buttons, Add tab, gestures); Themes holds every look: light or
  dark, colour, Colourful, background tint, Top band, card style, line strength, corners, spacing, buttons, the header,
  tab bar style, heading font, fonts, line spacing, row and form layouts, custom CSS (theme-revamp S3).
- **Themes that travel** (theme-revamp S5, 21 Oct 2026; `my-themes.js` `themeLink` / `themeFromLink` / `lookNow`,
  `ui-theme-link.js`; unit tests `my-themes.test.mjs`, `theme-engine.test.mjs`, `fonts.test.mjs`; e2e `share-link.mjs`):
  **Share as a link…** in Your themes makes `…/logbook/#theme=<base64url JSON { v: 1, n, l, m }>` from the look now
  (all built-in themes stay under 1.3 kB), with Share (the phone's share sheet) and Copy link. Opening one (after
  sign-in, or in the demo; `app.js` `wantTheme`, also when tapped while the app is open) tidies the address to
  `#themes` and shows the theme at once (`display.js` `previewLook`, nothing saved) with **Use** / **Cancel**; Use sets
  it and keeps it in Your themes (a tick, on by default), Undo in the toast. A link is input from strangers: `lookOf`
  first, then every setting `checkTheme` rejects is dropped (fonts: bundled only, never a typed name or a file); a
  link that can't be read says "broken or cut short". No QR code: a 1-2 kB link makes a dense code and needs an
  encoder. **Day and night:** with Light or dark on Auto, "Theme when the phone is dark" (`nightTheme`: a theme's id or
  `mine:<id>`) shows that theme while the phone is dark; every look painter goes through `lookToShow`, so the day look
  set on the page is untouched, and the page says when the night theme is showing. **Case text size** (Accessibility,
  `caseSize`, `--cs`): the case box, case text in the Logbook and point rows, apart from Text size; first paint from
  index.html. **More bundled fonts:** Nunito, IBM Plex Sans, Source Serif 4, JetBrains Mono (latin 400 and 700, OFL,
  ~20 kB each, from Fontsource) for the interface, logging and heading fonts; themes may set any bundled font
  (`THEME_FONTS`). **Exported themes carry an uploaded font:** Save this look keeps a copy of the font file per theme
  (IndexedDB `mine-<id>-<slot>`); Export puts it in the file (`fonts: { ui, log }`, base64); Import checks name, size
  and the font's first bytes (`cleanFontFile`), and picking the theme makes it this device's font file.
- **Wallpaper and icons** (theme-revamp S4, 21 Oct 2026; `wallpaper.js`, unit tests `wallpaper.test.mjs`, e2e
  `wallpaper.mjs`): a **Wallpaper** card on Themes after Colour and light: None / Dots / Grid / Paper lines / Soft
  gradient / Your own photo, and a Dim slider (0-90%, unset = 40% for a photo, none for a pattern). style.css draws
  `html.wall::before` (the picture: `--wall`, from the look CSS for a pattern, set inline by display.js for the photo)
  and `::after` (the page colour at `--wall-dim`); the body turns see-through and cards stay solid. The dim never goes
  under `minDim`: the lowest dim at which ink, muted and accent text on the page reach 4.5:1 on every wallpaper colour
  (32 × 32 samples of a photo, a pattern's strongest colour) with the palette in use now; worked out again on light /
  dark / OLED / colour changes, and the note says when it was raised. The photo is made at most 1600 px (JPEG) and kept
  in IndexedDB `apmes-logbook-wall` on this device only (never in settings files, saved themes or the account); a theme
  or saved theme without a wallpaper keeps it (`keepPhoto`); Reset all clears it (Undo puts it back). Colours from the
  photo: "Use its main colour" (`mainColour`, the hue covering most of it) or tap the photo (`colourAt`) sets the accent,
  so colors.js makes the palettes. App-style details → Icons also has **Icon tint** (`iconTint`, `iconTintStrength`:
  mixed into every icon except the current tab and filled buttons, made readable for light and dark first) and **An
  icon for each tab** (`tabIcon`, names in `TAB_ICONS`). All off by default, per device; themes may set a pattern, the
  dim, the tint and tab icons, never a photo.
- **App-style details** (owner, 19 Oct 2026; Themes card, `lookCss` in themes.js, CSS only so the first paint has it; unit tests in
  themes.test.mjs, e2e `app-style.mjs`): each its own device key, off by default, part of `THEME_KEYS` (so themes, Your themes and the
  settings file carry them): `barBlur` (see-through header and tab bar), `tabActiveLabel` (label only on the current tab),
  `tabStyle: 'indicator'` (Material icon pill), `listStyle` (`inset` iOS grouped, `edge` edge to edge), `titleAlign: 'centre'`,
  `switchStyle` (`ios`, `material`), `pressStyle` (`highlight`, `none`), `iconWeight` (`thin`, `bold`), `typeStyle` (`ios`, `material`).
  New Inspired themes use them: X-, Spotify-, YouTube-, Gmail-style; Apple-, Pixel-, WhatsApp-, Telegram-, Instagram-, TikTok-, Material-style and the other Inspired ones now use their app's own ground, text and line colours (colours and shapes only).
- **Theme engine** (owner, 19 Oct 2026; `theme-engine.js`, guide [theme-engine.md](../theme-engine.md), unit tests
  `theme-engine.test.mjs`, e2e `app-style.mjs`): every App-style detail, spacing and tab style is a facet in `FACETS`
  (key, choices, group, CSS); the Themes page draws "App-style details" from it, `lookCss` adds its CSS, Your themes and
  the settings file keep only listed values, and `checkTheme` (themes.js) refuses unknown keys or values, unreadable
  colours and Inspired names without "-style". Added with it: `statusBar` (header / page: `<meta theme-color>`,
  display.js `paintStatusBar`, cached as `apmes-logbook-statusbar` for the first paint), `headerStyle` (filled / large),
  `tabIconFill`, `iconSet` (`ICON_SETS`: CSS per set and optional per-icon paths, read by ui-core `ic()` and the tab bar
  through `iconPath`; `<html data-icons>`), `pageMotion` (`PAGE_MOTIONS`, app.js `slidePages`; material and fade also
  fade between bar tabs), `sheetStyle` (iOS bottom sheets / Material dialogs, `dialog:not(.full)`), `toastStyle` (iOS
  banner / Material snackbar), `fieldStyle` (ios / filled / outlined), `checkStyle` (round / square; never the settings
  switches). The first-paint look-CSS cache allows 60 KB (index.html). Apple, Pixel, Material, WhatsApp, Gmail and
  Telegram-style use them.
- **Themes never change Light or dark** (owner, 19 Oct 2026): no theme has a `mode`; every theme carries a light and a dark palette (`TINTS`), so it matches its app either way. Picking a theme or one of Your themes leaves the Light or dark setting alone.
- **Inspired themes box** (owner, 19 Oct 2026): the Themes page shows the Inspired themes as cards, only `FEATURED` in themes.js (Apple, Pixel, Evernote, Obsidian, Notion, WhatsApp, Office, ACGME), with no scrolling list. **Browse all themes** (`#themesall`, under Themes) has every theme in a searchable list and **Suggest a theme**. Your themes always has Export (with none saved it saves the look you have now) and Import.
- **Your themes** (owner, 16 Oct 2026; `my-themes.js`, unit-tested; e2e `my-themes.mjs`): once the look is Custom, the
  "Your themes" card says so and offers Save this look under a name (`display().myThemes`, this device, up to 12, a
  name already there is replaced; light or dark is kept with it). Saved looks are picked like any theme ("Now: Night
  shift (yours)"), × deletes with Undo. **Export…** writes `my-logbook-themes.json` (`kind: apmes-logbook-themes`);
  **Import…** adds a file's themes, only known look keys with checked values. The Themes reset leaves them alone; the
  settings file carries them.
- **Top band: only the NUHS theme keeps the NUH stripe; other themes bring their own four colours** (owner, 15 Oct
  2026; an exception to AGENTS.md's four-quarter band, for the logbook only). The Top band setting overrides it: the
  theme's colours (default), shades of my colour, the NUH stripe, or none.
- The CSS for the settings that aren't classes comes from `lookCss` into `<style id="look-css">`, cached as
  `apmes-logbook-look-css` for the first paint. A new look key goes in `THEME_KEYS`, `DISPLAY_KEYS` and settings-file
  `PLAIN`; `themes.test.mjs` round-trips every theme.
