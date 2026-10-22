# Logbook screens: Markdown and Sync

Part of the logbook working notes; index of screens in [../screens.md](../screens.md). Settings → Markdown and Sync, Sync reflection notes.

- **Markdown** (Settings → Markdown, `#sharefmt`; `markdown.js`, tested in `markdown.test.mjs`): one format in
  `settings.markdown` (only what differs from the default; ≤ 8 KB) for Copy / Share on the Logbook tab and the notes
  export. Templates take `{{name}}` (older `{name}` still works): case fill-ins {{date}} {{iso}} {{day}} {{weekday}}
  {{n}} {{count}} {{initials}} {{details}} {{categories}} {{categoryCodes}} {{tags}} {{reflection}}; a line whose
  fill-ins are all empty goes; a value is never read again as a template. Options: date format, categories as
  names / codes / #tags, wiki or Markdown links, case notes per month or day, reflection folders (month, heading,
  flat), file name pattern, front matter fields, the reflection templates (title, summary, each point, figure,
  references). Default day: `YYYY-MM-DD` (plain since log2 15; it was `[[YYYY-MM-DD]]`), then `1. AB` / case, a blank
  line between cases; no tags. **Day heading** (`dayHeadStyle`): Plain / Heading (`# date`) / Link (`{{dateLink}}`,
  `[[file date|date]]` or a Markdown link) / Custom (the `dayHead` box; a heading typed before the styles existed is
  Custom); one case follows the style unless its box was typed. **Dates** (`dateFormat`): 2026-10-10, 20261010,
  10 Oct 2026, Sat 10 Oct 2026, 10/10/2026 or Custom (`datePattern`: YYYY YY MMMM MMM MM M DD D dddd ddd, [text]
  literal; `fmtPattern`). **File names and link targets** (`fileDate`): As the dates (slashes become spaces) or their
  own; they name the export's day notes, reflection files' {{date}} and what Link points to. Sync's own file name
  pattern (Settings → Sync) is separate. Changing the heading makes Sync rewrite each synced day once (3-way merge
  keeps the user's edits). **Under each case** (`reflInDay`: None (default) / Link / Embed `![[…]]` / Full text;
  `notesInDay`: None / Full text): a case's reflections and linked notes after it in a day and in one case, their
  headings two levels down. Link and Embed need the reflection's own note (`ctx.reflPath`): the export, and Sync places
  with **Also sync reflection notes**; Copy, Share, Send to and other Sync places give the full text (Markdown links can't embed: a link). A linked note under its case
  leaves the day's Notes. e2e: `md-format.mjs`. An older
  `settings.shareFormat` (the Copy & share format) carries over until the Markdown page is saved; `share-format.js`
  is kept for that and its tests. Previews use the user's own latest day and reflection.
- **Sync** (Settings → Sync, `#sync`; `ui-sync.js` page + run, `sync-remote.js` calls, `sync-md.js` pure and tested;
  Oct 2026): one Markdown file per day (the day's cases + that day's notes via `mdDay`, the user's Markdown format) in
  Google Drive (`APMES Logbook/Daily/`), Dropbox (app folder `/Daily/`) or a GitHub repo (owner/repo/branch/folder,
  contents API). Name pattern `{date}.md` (also {year} {month} {day}; `/` makes folders). Only days whose text changed
  since this device's last sync go, only on a tap: a "Sync (N)" button on the Logbook tab's count row once a place is
  set up (none otherwise); optional reminder on open (off). The app owns only `<!-- logbook:start fp=… -->` … `<!--
  logbook:end -->` in each file: text outside is kept; edits inside are merged (`merge3`: base = the app's text at the
  last sync, kept in IndexedDB `apmes-logbook-sync`; clashes kept both ways with `<<<<<<< logbook` / `>>>>>>> your
  edits` marks; lines both sides added at the end: the user's first). The start mark's `fp` is the fingerprint of the
  app's text written there (never of a merged block), so a device with no ledger or base (second device, after
  sign-out) replaces an untouched block, leaves alone a block already holding its text, and marks clashes only when
  both really changed. Changing a place's repo/branch/folder/file name clears its ledger and bases (every day is
  written there again). A run waits for the server's notes (`notesFromServer`); a run stops recording at once on
  sign-out (`gen`); `forgetSync` also drops this visit's Drive/Dropbox tokens and Drive folder ids. GitHub writes
  are paced (60 a minute) and a rate limit (403/429 "rate limit", Retry-After) stops that place with "try again in
  N minutes"; "Try again" redoes only the place(s) of that run. Writes are conditional (Drive: md5 checked just before PATCH; Dropbox: upload `update` rev / `add`;
  GitHub: PUT with sha) and a refused write is read again and merged (twice at most). `settings.sync` {targets,
  remind} (no tokens; travels in the settings file); ledger in localStorage `apmes-logbook-cloud-sync:<account>`
  {fp, rev per day}; GitHub token (fine-grained, one repo, Contents read/write) in `apmes-logbook-cloud-gh:<account>:<id>`
  only; "cloud" keeps them out of the device-settings file. Sign-out / account switch / demo reset forget all of it
  (`forgetSync`). Drive/Dropbox reuse the backup sign-in (`signInFor`, pending `action: 'sync'`, `back` page);
  tokens stay memory-only, so a run resumed after one sign-in never leaves for a second (the other place waits for
  the next tap). ID check once per run. e2e: `test/e2e/sync.mjs` fakes all three APIs.
- **Sync reflection notes** (log2 15; owner said build it, 16 Oct 2026; off unless chosen, per place: `target.reflections`):
  one note per reflection in `Reflections/…` beside the day files, named and foldered as the Markdown export names
  them (`reflectionFiles` in sync-md.js, in a stable order: date, created, id), inside the usual marked block, so no
  front matter and no figures. Ledger keys `r:<id>` with the file's `path`; a reflection whose name changes (title,
  date, heading) gets a new file and the old one is left (Sync never deletes a file; the run says how many); a
  deleted reflection's file stays. Only on those places do a day's Link and Embed point at the notes (the day text
  differs per place). Tested in `sync-md.test.mjs` and `e2e/sync.mjs`.
