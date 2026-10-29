# Logbook screens: Settings pages, moving around, More and Recover

Part of the logbook working notes; index of screens in [../screens.md](../screens.md). The Settings menu and its pages, back links, search, quality-of-life settings, reset, default tab bars, More, Recover.

- **Look settings: Themes / Layout / Accessibility** (theme-revamp S3, 21 Oct 2026). Display (`#display`) and Advanced
  display (`#displayadv`) are gone. **Themes** (`#themes`) holds every look: it opens with "Themes are kept on this
  device only" and Export (`exportThemes`: Your themes, or this look, as a file), then the themes, Your themes, Colour
  and light, Shape and type (now also Line strength, Button style, Icons instead of words, Plain calendar), Fine-tune,
  Header and tab bar (name in the header, page titles, hide header, icons only), Rows and forms (navigation, row and form
  layout, Shorter Logbook rows), App-style details, colours, Custom CSS. **Layout** (`#layout`, `renderLayout`) is how it
  works: start tab, tab bar place, order and hidden tabs, Logbook row buttons, page width, the Add tab, gestures (swipe,
  edge back, press and hold) and the tab bar while typing. **Accessibility** (`#access`): zoom, text size, bigger taps,
  contrast, motion. The old Compact switch is Themes → Spacing: Tight. Custom CSS never applies on Themes, Browse all or
  Layout (`CSS_FREE`, display.js). Old links land on the new page: `#display` → Layout, `#displayadv` → Themes, and a
  copied `?find=` link goes to the page the setting is on now (`MOVED_SETTINGS` / `movedSetting` in navigation.js, unit
  tested; e2e `settings-pages.mjs` checks each setting is on exactly one page). Older lines below that say Display or
  Advanced display mean these pages.
- **Back links** (owner, 13 Oct 2026): every page without its own place on the tab bar has a back link to the page
  before it (`parentOf` in app.js: none for a page on the bar, Settings or Notes too when put there; More for a bar
  page kept off the bar; otherwise the page it sits under). The edge swipe follows the same rule.
- **Moving around** (polish 2): on a page under a tab, "‹ Settings" (the page it goes back to) replaces the app's name
  in the header (in the page instead when the header is hidden). Going into a page slides it in from the right as it
  fades in; going back, from the left. Only the new page moves: a still copy of the old page (tried first) put every
  button on the screen twice for a moment, which broke look-ups. Only within one bar tab, never while swiping or with
  Reduce motion. In the iPhone / iPad
  home-screen app only, a drag from the left edge goes back (Accessibility → edge swipe; Android uses its own Back
  gesture there). Settings → Accessibility (`#access`) holds zoom, text size, bigger taps, contrast, motion and the
  gestures. Filter and its folds grow open (`reveal()` in ui-core.js); dropdowns draw the app's own chevron; the
  calendar's month name opens a month picker (not in Firefox on a computer, which has none).
- **Settings pages** (polish 6a): every settings page (class `set-page`) uses the helpers at the top of the Display
  code in ui-settings.js: `toggle()` (a switch at the row's end; one help line, ⓘ for the rest), `pick()` (two to
  five choices as a list with a ✓; real radio buttons, so the keyboard and screen readers work) and `help()`. Keep
  help to one short line; longer text goes behind ⓘ. Bigger choices (zoom, box height, fonts) stay dropdowns.
  Advanced display and Advanced logging are grouped under headings. Settings search also reads the ✓ lists (their
  name and choices, so "oled" finds Light or dark).
- **More** (`app.js`): Account (with Residency year for non-programme users; Delete account at the bottom,
  greyed out for residents on the programme list: a programme admin takes them off first; `cloud.deleteAccount`
  wipes cases, reflections, images, bin, submission, members entry, logbook, then the Google sign-in), Settings, Export &
  backup, Admin portal; Privacy, Credits, "Install the app" card (Install button from beforeinstallprompt; Safari steps on iPhone/iPad; hidden when installed or after Not now), Sign out at the very bottom.
- **Quality-of-life settings** (Oct 2026). Account (`settings`, Logging page): First day of the week (`weekStart`
  1 Monday default / 0 Sunday / 6 Saturday; `weekStart`/`weekLead`/`weekdayNames` in engine.js, tested; used by the
  Logbook calendar, Analytics heatmap and By day of the week, `dateWindow` "this/last week", last week's summary);
  After Save (`afterSave`: next (default) / keepTags / closed = keyboard down / logbook = `hooks.showDay` set by
  ui-logbook.js, then #logbook on that day; Undo then puts the case back, and kept tags don't count as a new case);
  Undo window (`undoSecs` 5 default / 10 / 20 / 30: any toast with a button stays at least that long, ui-core `toast`);
  Add tab card: parts to hide (`caseHide`, CASE_PARTS in ui-log.js: interesting, parsed, sugg, recent, still, groupsave,
  plan; `.log-card.hide-*` in style.css; the case box, All tags and Save always stay). Device (`DISPLAY_KEYS`, html
  classes from applyLook): case box keyboard (`boxCaps` false → `box-caps-off`, `boxCorrect` true → `box-correct`,
  `boxSpell` false → `box-spell-off`; read in renderOne), reflection spelling (`reflSpell` false → `refl-spell-off`,
  Reflections settings; ui-reflect.js sets spellcheck on the editor's fields and on focus), Display: Pin the case box
  (`pinBox` → `pin-box`: `.box-wrap` sticky at `--pin-top`, the phone top tab bar's height when it sits on top; not
  when the Add tab is upside down) and Pin the search box (`pinSearch` → `pin-search`: `.lb-top` sticky, its height in
  `--lb-top-h` so List's month headings stick under it; on Reflections `.refl-top` sticks at minus the height of its
  title and counts (`--refl-hide`, `pinHead` in ui-reflect.js) so only the search row stays, and an open topic's name
  sticks under it (`--refl-top-h`) while its reflections scroll; not in edit mode). All in the settings file.
- **Settings pages: everyday first, Advanced below** (owner, Oct 2026). Look pages: Themes, Layout, Accessibility (see
  the top of this file). Logging (`#logging`): suggestions, age/gender detection, common tags first, Enter key,
  date for a new case, After Save; then **Advanced logging** (`#loggingadv`, `renderLoggingAdvanced`, under headings:
  Add tab · Keyboard in the case box · Search · Dates and Undo · Help). Sub-pages are TABS entries `under` their page
  (Back trail and the bar's tab follow); `advancedLink` in ui-settings.js draws the row. New options go on the
  Advanced page unless most people would change them. e2e: `tab('layout')` / `tab('loggingadv')`, and
  `choose(legend, value)` for a ✓ list.
- **Settings tools** (Oct 2026): **Search** on the Settings page (app.js `settingsSearch`): the first search of a visit
  draws Display, Advanced display, Logging, Advanced logging, Reflections and Markdown off screen and indexes their
  headings, field labels, switches and folds (with the hint under each), so it never goes stale; a result opens the
  page and scrolls to the option, which flashes (`findAfterRender`). **Display preview** (`displayPreview`, top of
  Themes, Advanced theme settings, Layout and Accessibility): one slim made-up line (a chip, a tag, Save) and **See it
  in action** (23 Oct 2026, app.js `tryMode`), which opens the real Logbook with a bar at the bottom: ‹ theme ›
  (the name is a list of Your themes, Classic and Inspired), light or dark, and Done back to the settings page. Pages
  work as normal; opening Settings another way or Esc ends it. e2e: `try-mode.mjs`. **Reset this page**
  (`resetLink`) on Display, Advanced display, Advanced logging and Reflections (Codex's on Logging): only that page's
  keys, after a confirm; custom CSS is switched off but kept, own font files stay stored.
- **Settings**: a menu of Themes, Layout (incl. the tab the app opens on; a #hash still wins), Accessibility,
  Logging, Tag editor (`#tags`), Reflections (`#reflset`: new reflections in the export, photo sizes), Markdown (`#sharefmt`), Recycle bin;
  then a "Settings file" card: export / import settings, tags, tag groups, formats as JSON (`settings-file.js`, tested; never cases or portfolio).
- **Reset all settings** (Settings, last card; owner, 15 Oct 2026): this device only, or the account too
  (`settings-file.js` `resetAccountPatch`: your year, profile, saved searches, send and sync places and the app's
  bookkeeping stay; tags and shorthand only when ticked). Saves a settings file first by default; Undo in the toast.
- **Default tab bars** (owner, 15 Oct 2026; `profiles.js` PROFILE_ON / PROFILE_OFF): Basic Case · Logbook ·
  Totals · Reflections · More; Advanced + Reflections · Analytics; Personal Case · Logbook · Notes · Reflections ·
  Analytics · More; Faculty / PCs Totals · Admin · More. Devices arranged by hand keep their arrangement.
- **More page:** two groups (More's pages with Settings last; Account and help), privacy and credits as fine print. Its
  Edit mode (per device) drags the tab bar and More's own list (`display().moreOrder`), Pin / Take off (a full bar asks
  which tab it replaces). The drag code is shared: `drag-list.js`.
- **Recover** (More; owner, 15 Oct 2026): one page for Needs attention (unsynced or clashing changes: Retry, Keep mine
  / Keep theirs), Recently deleted (the recycle bin, all devices), Unfinished drafts and Earlier versions (this device),
  each folded with a count. The bin is no longer in Settings; search "recycle" finds it here.
- **Settings menu** (`renderSettingsMenu`, `SETTINGS_GROUPS` in `app.js`; owner, 13 Oct 2026): every page kept, in
  groups Profile / Look (Themes, Layout, Accessibility) / Logging / Reflections / Notes and sharing / Data / Advanced
  (Advanced logging also listed there; Advanced display went in theme-revamp S3). A Settings page (`under: 'settings'`) no group names still shows, under "Other"
  (`settingsGroups`): give a new page its group. Settings search indexes every page, Profile and the Tag editor included (`SEARCH_PAGES`).
- **Reflection formatting buttons** (Settings → Reflections or Show or hide → Reflections; `display().reflToolbar`,
  this device, off by default; html class `refl-toolbar`; `fmtBar` in `ui-reflect.js`; Oct 2026, from Codex's list):
  Bold, • List and 1. List above each reflection box. They write Markdown (`**bold**`, `- `, `1. `); the Word export
  turns `**bold**` into bold runs, `- ` into "• " and `# heading` into a bold line (`mdRuns` in `portfolio.js`, tested),
  the Markdown export keeps it. Notes have no toolbar (owner). e2e: `simpler.mjs`.
