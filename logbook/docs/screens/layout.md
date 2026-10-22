# Logbook screens: Layout, sizes and accessibility

Part of the logbook working notes; index of screens in [../screens.md](../screens.md). Settings → Layout and Accessibility: zoom, text size, fonts, look options, borders, corners, spacing, gestures, row and form layouts.

- **Look and feel** (owner's Apple-apps review, 13 Oct 2026): line icons from `ui-core.js` (`ic(name)` inside text and
  buttons, `rowIcon` on Logbook rows), never emoji; empty lists use `emptyState(icon, title, hint, button)`; buttons,
  chips and rows show a pressed state; one speed for motion (`--dur`, `--ease` in style.css). New looks are separate
  settings, off by default (the plan is in STATUS, Next).
- **Clean looks** (polish 6b; each its own device setting, off by default): Borders → Flat (`flat`: no lines, no
  page cards; its own key so saved border levels keep their meaning), Button style (`btnStyle`: outlined / filled /
  tinted / plain, for every button but the main one), Icons instead of words (`iconBtns`: buttons built with `ib(icon,
  word)` from ui-core.js, class `ib`; the word stays for screen readers), Plain calendar (`calPlain`), Page titles in
  the header (`pageTitles`; `setPageLabel` from render()), Shorter Logbook rows (`rowShort`, CSS only), Press and hold
  a row for its menu (`rowHold`, Accessibility; the click from lifting the finger is swallowed so it can't press the
  sheet's button now under it). The calendar day's buttons read Share, Copy and + Add; Copy for a day is off unless
  switched on (`dayCopy`, owner 13 Oct 2026). e2e: `nap()` is capped, so a long press needs `p.waitForTimeout`.
- **Zoom and text size** (Display, per device): Interface zoom 80–150% = `body { zoom: var(--ui-zoom) }` (header and
  tab bar too; Ctrl/Cmd + − 0 on a computer, app.js); lengths measured on the real screen (tab bar, keyboard,
  visual viewport) are divided by `--ui-zoom` where used inside. Text size = the words only: every font size in
  style.css (and inline in JS) is `calc(Npx * var(--fs, 1))`; fields keep `max(16px, …)` so iPhones don't zoom on
  focus. New font sizes must follow that pattern. The old Text size (a content zoom) is carried over once as the
  zoom (`migrateDisplay`, display `v: 2`). Defaults are pixel-identical to before. Compact = density.
- **Fonts** (Display, per device; `fonts.js`, tested): Interface font and Logging font (`--font-ui`, `--font-log`;
  logging = `textarea.details`, `ul.cases .t`, `.refl-editor` fields; "Same as the interface" by default). Choices:
  Open Sans (default, Google Fonts as before), the device's font, Atkinson Hyperlegible Next, Lexend and Inter (woff2 in
  `fonts/`, latin 400/700, SIL OFL, loaded only when chosen, cached by the service worker on first use), Serif and
  Monospace (system stacks), a font installed on the device by name (`cleanFontName`; a width test says whether it
  was found; Safari mostly ignores user-installed fonts), or the user's own file (.woff2/.woff/.ttf/.otf ≤ 3 MB,
  IndexedDB `apmes-logbook-fonts`, FontFace API; this device only, never synced).
- **Look options** (Display, per device; `applyLook` in ui-settings.js, classes on `<html>`, also set at first paint in
  index.html): line spacing (`--lh`; every line-height in style.css is `calc(x * var(--lh, 1))`), **Page width** (key
  `lineWidth`, was "Line width"; narrow 760 px / normal 980 / wide 1400 / full = no limit; phones are always full; the
  Add tab's panes keep theirs), contrast (follow the device's Increase contrast
  by default, normal, or higher: darker text and lines), motion (follow the device's Reduce motion by default, on, or
  reduce), icons-only tab bar (buttons keep `aria-label`; on a computer the icons are shown for it), tab bar position
  (auto = bottom on phones / top on bigger screens, or always top `tabs-top`, or always bottom `tabs-bottom`), hide the
  header (`no-header`; it shows again while `who-alert` is set by paintWho: signed out, offline, unsynced; not for the demo since Oct 2026).
  Add tab upside down on phones (`case-inverted`: CSS `order` on the log card's items, lp-left/right being
  display: contents; tags on top, the case box last above Save; app.js render() scrolls to the bottom on entering).
  Keyboard on opening the Add tab (Logging page, device key `autoFocus`, html `no-autofocus` read by ui-log.js).
  Colourful 'tabs' / 'all' ('all' = `colour-all`: the colour picker's palettes per tab, `tabSchemeCss` in colors.js,
  scoped to `body[data-bar=…]`, the stripe untouched; with the default colour NUH_TAB_COLOURS follow the NUH stripe, else
  TAB_COLOURS; the --t-* shades come from `tabVarsCss`). Name in the header (`appTitle`, ≤ 40 characters, also the
  browser tab title) — the older (`colourful`: one colour per bar tab, `body[data-bar]` set in paintTabs; darker shades for contrast,
  lighter in dark mode). Custom CSS (advanced; `custom-css.js` `checkCss`, tested): refused if it loads anything from
  elsewhere (url(), @import, image-set(), @font-face, @namespace, script hooks, backslash escapes), over 10 KB or with
  unbalanced braces; never applied on the Display page (applyCustomCss runs in render()); `?nocss` turns it off;
  device only and never in the settings file.
  Defaults are pixel-identical to before.
- **Borders** (Display, per device `borders`: 0 Borderless, 1 Faint, 2 Light, 3 Soft, null = Normal; a range input):
  every border in style.css (and the reflection editor's inline ones) uses `var(--edge, var(--line))`; `html.edges`
  sets `--edge` on every element to `--line` mixed with transparent at `--edge-mix` (0/25/50/75%), so it follows the
  `--line` of themes, contrast and colours. `html.edges-fill` (Borderless, Faint) gives fields, plain buttons and
  chips a light fill so they stay visible. Tag tick boxes keep `--line`. Also set at first paint (index.html).
  Defaults pixel-identical to before.
- **Look options, Oct 2026** (device keys): **Corners** (Display, `round` 0 Square / 1 / 2 Normal / 3 Very round): every
  border-radius in style.css (and the reflection editor's inline ones) is `calc(Npx * var(--round, 1))`; tag tick
  boxes cap at 1.2 so they never look like radio buttons. **Card style** (Themes; owner, 16 Oct 2026; `cardStyle` / `cardPatch` in display.js): Raised = soft shadows (default; owner 12 Oct 2026), Outlined = lines (`shadows: false`), Flat = no lines and no page cards (`flat`). It replaced the Soft shadows switch and the Flat end of the Borders slider; the line strength (`borders`, Borderless … Normal) moved to Advanced display → Look as **Line strength**, kept while Flat is on.
  **Bigger tap targets on the Add tab** (Advanced display, `bigTaps`). **Tab bar order and hidden tabs** (Advanced
  display, `tabOrder` / `tabHidden`, `arrangeTabs` in ui-settings.js): ↑ ↓ and a switch per tab; More can't be
  hidden, at least two and at most seven (`MAX_BAR`, More included; owner, Oct 2026) stay. Every page in the More list
  (Account, Settings, Recover drafts, Export / Import, Admin portal for admins; `bar: true` in TABS, a `short` label on
  the bar) can go on the bar, off by default like Notes; its own pages select it (Display → Settings). An eighth asks
  which tab it replaces and takes that tab's place (`setTabOnBar`; also the Notes page's "Add Notes to the tab bar").
  Hidden main tabs are listed first on More ("Hidden from the tab bar"; the More pages stay in their own list) and
  links still open them; a hidden start tab gives way to the first one on the bar. A tab missing from the saved
  order goes just before More, so More stays last. All set at first paint where it matters.
- **Optional interaction** (Advanced display, device): **Swipe left or right to change tab** (`swipeTabs`, html
  `swipe-tabs`; app.js touch handlers on main). **On by default** (owner, Oct 2026: `swipeTabs: false` = off, the
  switch is also in Show or hide → Header and tabs). Touch handlers on the document, so the empty background under
  a short page swipes too (owner); never from the tab bar or a banner. Like a deck of cards (owner, Oct 2026: no popping in, no bar
  moving): the page follows the finger and the next tab's page comes in beside it while dragging, as a still copy of
  that page from when it was last left (`snaps`, taken in `changeScreen`; inert, no ids) or a loading card for a tab
  not opened yet (`makePeek`, fixed at the page's unscrolled top). Letting go after a quick swipe (≥ 70 px, mostly
  horizontal, < 0.7 s) or past a third of the screen finishes the slide (both on one Web Animations clock), then the
  real page is drawn underneath at the copy's height on screen and the copy goes; otherwise both spring back. The next
  tab is the next/previous on the bar (order and hidden tabs honoured; `barTabOf`: a sub-page counts as the bar tab
  it sits under, an off-bar tab as More). While swiping the page is pinned (`pin`: position fixed over a spacer of
  its height): a page in the flow sliding off the right edge widened the phone's layout viewport, so the fixed tab bar
  dropped and slid back. Don't clip overflow on html/body for this: on Chrome for Android that stopped the page
  scrolling to the very bottom (the last card, e.g. Advanced display settings, hid behind the tab bar). `paintTabs` only moves the selection when the bar's tabs are unchanged (no rebuild, no flash). Never from fields, dialogs, drag handles, tag-editor pills, anything that scrolls sideways, or within 20 px of
  the screen's edges (the phone's Back gesture). Reduce motion: switches without sliding.
  **Fewer buttons on Logbook rows** (`rowMenu`, html `row-menu`): one ⋯ opens Copy / Write or Open the reflection /
  Edit the case; a ✓ still marks cases with a reflection.
- **Display is per device** (owner: people use the logbook on different devices with different needs): compact,
  text size, zoom, fonts, colour and the start tab live in localStorage `apmes-logbook-display` (`deviceDisplay` / `setDisplay` /
  `adoptDisplay` in ui-settings.js), light / dark in `apmes-logbook-theme`. A device with none starts from the
  account's old `settings` values (and corrects that from the server copy in the same visit). Kept at sign-out;
  wiped by Reset demo. The settings file carries this device's display values and imports them to the device.
- **Sizes** (theme-revamp S2, 21 Oct 2026): Spacing is Normal / Snug (`tight`) / Tight (`compact`, the old Compact mode,
  still drawn by the `body.compact` rules in style.css) / Roomy. (The Display switch "Compact mode (Tight spacing)" went in
  S3: Spacing: Tight is the one place.) The old `compact: true` key is folded to `spacing: 'compact'` wherever it turns up (device, account
  copy, settings file, Your themes; display.js `migrateDisplay`, theme-engine.js `foldCompact`), so nobody's look
  changes. **Fine-tune** card on Themes: eight sliders (`FINE_TUNE`: button height, gaps, line weight, shadow, space
  between cases, space between days, letter spacing, text weight), unset by default, per device, themes may set
  them; their CSS is the `tune` cascade layer (after the theme, before custom CSS). Bigger taps keeps Add tab
  buttons at 44 px or more.
- **Case box height** (this device): the grab bar under the box sets a kept height (`display().boxHeight`; the List
  box, paste a list, has its own bar and `listHeight`, owner 16 Oct 2026; double-tap
  resets); Grow as I type (`boxGrow`, on by default) grows it to two thirds of the screen.
- **Totals Compact** (this device, on by default): initials across the top (`analytics.js` shortNames; a tap names the
  person), short category names, a key under the table; Show targets at the bottom. Excel keeps full names.
- **Layout** (Themes): `navStyle` tabs (default) or a left icon-and-label rail above 900 px; smaller windows keep
  the existing `tabBar` placement. `rowLayout` card (default), compact (the older `rowShort` alias), chat (bold
  case, logged-at time when available, grey tags and separators), or timeline (a day spine, retaining the saved sort).
  Choosing a row layout clears the alias; an explicit layout wins over it. `formLayout` page (default) or native
  collapsible Case details and Tags sections, the first open. All three belong to the device and travel with themes
  and settings files; stored cases stay unchanged. X-style chooses chat, Notion-style timeline, Office-style rail.
  Focused checks: `node logbook/test/layouts.test.mjs` and `node logbook/test/e2e/layouts.mjs` (phone/desk, tap,
  menu and selection holds, resizing, keyboard activation, disclosure fields, and accessibility). The standard
  App-style browser suite includes these layout checks.
