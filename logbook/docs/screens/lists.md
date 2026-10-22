# Logbook screens: Lists, select and bulk edit, search

Part of the logbook working notes; index of screens in [../screens.md](../screens.md). Logbook List and Grid rows, case box marks, patient initials, Select and Bulk edit, pages, group and sort, search, send to presets, Analytics Edit mode.

- **Lists** (polish 3): case rows put the initials on top of the date in the left column (like Reflections) and the
  details beside them; tags stay on one line that scrolls sideways (fading at the edge); month headers are a thin
  sticky line you tap anywhere to jump to a date. Reflection rows: initials with a small JR, the date on one line
  ("11 Sep", or "11 Sep 25" in an earlier year); a heading's counts never split over two lines. Analytics cards show
  the summary and one bar folded; "You and your year" (the spread strips) is inside the opened card.
- **Case box marks** (polish 4): the initials, the age/sex, labelled parts and (log2 2) the BMI the suggestions read
  (`suggest.js` `bmiAt`, purple) are highlighted inside the case box (a see-through copy
  of its text on top, `.box-marks`, styled from the box's own computed font and padding so the wrapping matches).
  The line under the box says only what the age was read as ("6m = 6 years · male"): kept on purpose, as the check
  that 6m means years and 6mo months. The initials and procedure are no longer repeated there.
- **Reflections list JR count** (owner, 13 Oct 2026): a heading's JR rule ("One / Two from JR") shows as a small
  "JR 0/1" pill beside its count, green when met, and leaves the note under the heading (`listNote`; a qualifier stays:
  "JR: with neuromonitoring"). The editor still shows the full note. Word counts on the list can be hidden
  (Settings → Reflections, this device: `hideWords`).
- **Patient initials** (`splitInitials`, engine.js, tested): 2–4 letters as always; 5–8 letters and one capital letter
  only before an age or "/" ("ABCDEF 45F …", "K/30F …"), so "ELECTIVE LSCS" or "a 45f lady" keep their first word.
  **One-off fix** (Admin, owner only, `initialsFixCard` in ui-admin.js; `initialsFixes` in engine.js, tested;
  `cloud.listLogbookEmails` / `fixCaseInitials`): reads every logbook's cases, lists those with an empty initials
  field whose text starts with initials under these rules (older imports, pastes, spreadsheets), and writes initials +
  details back after a confirm. Re-running finds nothing. The rules already let the app owner read and update cases.
- **Analytics Edit mode** (owner, 15 Oct 2026): Edit above the cards; drag by ⠿ or the arrows, Hide / Show, Reset
  layout, Done. Saved for the account as `settings.anLayout { order, hidden }` (`analytics.js` arrangeCards: cards a
  profile lacks are left out; new cards land in their default place). A new card needs an id in `CARD_NAMES`.
- **Select and Bulk edit** (Logbook List and the calendar's day list; log2 9 / 9d): press and hold a row (with
  Accessibility → Press and hold on, the hold opens the row menu, which has Select), or the Select button. A tap then
  ticks a row; the bar at the bottom has Select all (the whole search, not only the rows drawn), Select none, Bulk edit…
  and Done. Bulk edit… (`ui-bulk.js`, the rules in `bulk-change.js`): Change has a row per field, each "Unchanged"
  until chosen (date, initials, case summary replace / add to the end / find and replace with exact capitals, tags
  add / remove / replace, Interesting); Actions has Copy, Share, Send to and Move to the bin for just these. Review
  changes lists the changes, warns when something is replaced, shows up to three before → after; from 20 cases an
  overwriting change's button says how many. Save goes through `updateMany` (a case changed elsewhere keeps that
  version); Undo in the toast puts back only cases nobody has changed since. The old "Tag N cases…" is now "Edit N
  cases…" (Filter → More): every case in the search, selected, into Bulk edit. Not in the grid (it has its own editing).
- **Reflections: Select and Bulk edit** (log2 9c): the header's Edit is now **Select** (press and hold a row starts it
  too); dragging between headings stays in it. The old Select all / Clear / Mark complete / Delete selected toolbar is
  the shared bar and popup (`ui-bulk-refl.js`, rules in `refl-bulk.js`). Change: heading (a sub-type stays where the
  new heading has it), status (complete only when nothing is missing, as one at a time: the review says what the
  others still need), portfolio export in / out, JR, date. Actions: Copy, Share, Send to (Markdown, as Settings →
  Markdown makes it), Move to the bin. Word export of just these is not built: the portfolio export takes the ticked
  ones (use Portfolio export: in / out).
- **Grid as a spreadsheet** (log2 10): thin cell lines, inputs without boxes; drag a heading's right edge to resize a
  column (`display().gridCols`, this device; ← → on the focused edge too; a double-tap resets it, "Reset column
  widths" resets all); Lines per row 1 / 2 / 3 / Fit to text (`display().gridLines`; the summary is a textarea that
  grows to its text with Fit).
- **Send to presets** (log2 12): Apple Notes through a Shortcut named “Logbook to Notes” (`shortcuts://run-shortcut?
  name=…&input=text&text=…`; setup steps folded on the Send to page), Email (mailto), Telegram (`tg://msg`), Drafts,
  Bear, Things, Day One, besides Obsidian, WhatsApp, UpNote and Other app. Keep, Notion and OneNote take no text from
  a link: the page says to use Share. Each link follows the app's documented format; check them on a real iPhone.
- **Pages** (log2 11; owner's call, 15 Oct): the Logbook List and Grid show 100 cases a page (25 / 50 / 100 / 300 /
  All, this device: `display().pageSize`, unset = 100); "‹ Page 2 of 14 ›" with a list of the pages and each page's
  dates to jump to (`paging.js`, unit-tested); a new search, filter or view goes back to page 1; the Calendar stays
  monthly. Replaces "Show more".
- **Group by and Sort** (log2 14): in the Filter panel while the List shows (so the List looks as before), Group by Month (default) / Day / Week / Residency year / APMES tag
  (a case under each of its tags; the heading has "12 of 20 for the target") / Your tags / Flags (No tag yet,
  ☆ Interesting, Plan for later) / None, and Sort Newest (default) / Oldest / Initials A–Z / Most tags; this device
  (`display().lbGroup` / `lbSort`, unset = the defaults). The default looks exactly as before (Jump on each month);
  any other choice draws headings that fold (tap) and say how many cases, "(continued)" across a page, and "Select
  these N" while selecting. Pure grouping in `lb-group.js` (unit-tested); pages count the rows shown.
- **Search** (log2 9e, first part): a line magnifier (`ic('search')`, never an emoji: it follows the theme; owner,
  16 Oct 2026) in the header on every tab, or / on a computer (not while typing), opens
  `#search` (`ui-search.js`; the engine `global-search.js`, unit-tested). One box over cases (planned ones too),
  reflections and notes (loaded the first time Search opens; offline works on what is on the device). The Logbook's
  search language plus in:, status:, is:interesting / is:planned, has:reflection / has:note, no:tag, linked:yes / no,
  heading:, tag:, diagnosis:; ⓘ lists them and a tap adds one. Results grouped by kind with counts, Best match or
  Newest, the words marked; a tap opens the case (edit page), the reflection (editor) or the note (Done comes back to
  Search); a case found links its reflection and notes. Chips (Cases / Reflections / Notes, Dates, Tag…, Drafts,
  Interesting) add or take out their operator in the box (after: / before: for dates) and light up from what is typed:
  the box is the one source. Saved searches are the Logbook's list (`settings.savedSearches`); one saved on Search has
  `global: true` and the magnifier icon, and runs in Search when tapped on the Logbook. Select ticks results into bulk edit: one
  kind opens its own popup; several kinds share the date (`ui-bulk-mixed.js`), with Copy and Move to the bin.
