# Logbook screens: Backup and export

Part of the logbook working notes; index of screens in [../screens.md](../screens.md). Save to Google Drive / Dropbox, one spreadsheet (CSV), Download for notes apps.

- **Save to Google Drive / Dropbox** (Backup card; `cloud-save.js`, ids and pure helpers in `backup-targets.js`,
  tested): sign-in leaves the page and comes back, no popups (Oct 2026: on the owner's phone popups lost their
  opener, so Drive stayed on a blank page and Dropbox did nothing). Drive = OAuth implicit grant (token in the
  `#fragment`), scope `drive.file`, folder "APMES Logbook" found or made, same-day file replaced; Dropbox = PKCE,
  code in `?query`, App folder access, uploads to `/APMES Logbook/`. Both redirect to `https://apmes.anawj.com/logbook/`
  (registered with both; moved from anawj.com on 13 Oct 2026). localStorage `apmes-logbook-cloud-pending` {to, state, verifier, demo, at} before leaving
  (not sessionStorage: a home-screen app may finish sign-in in a browser tab; 15 min limit);
  `index.html` stores the answer in `apmes-logbook-cloud-return` and tidies the address to `#data` (`?demo` kept);
  `resumeCloudSave` (from `onUser`) waits for the server's cases and reflections, then saves. The reflections
  listener needs `includeMetadataChanges` for that: without it an unchanged offline copy never reports `fromCache:
  false` (the first version waited 30 s and gave up on the owner's phone; demo e2e can't see it). States start `gdr-` /
  `dbx-`; a mismatch saves nothing. e2e: `test/e2e/cloud-save.mjs` fakes both. Tokens in memory only.
  Uploads are `logbook-backup-<date>.json.gz` (CompressionStream, about 4x smaller; `gzipBlob` in `backup.js`);
  Download backup stays plain `.json`; Restore reads both (`backupText`: gzip's 1f 8b bytes, not the name).
  `cloudBackup.keepDays` 0 (default, keep all) / 90 / 30: after a save the app lists its folder and deletes its own
  dated backups and notes zips older than that (`staleBackups`); Dropbox needs `files.metadata.read` for the list.
  A failed tidy never undoes the save; the toast says so. `settings.cloudBackup` { remind, md,
  lastAt, lastTo } (never in the settings file). Reminder: one toast per visit with a Save button when due. The
  owner filled `GOOGLE_CLIENT_ID` and `DROPBOX_APP_KEY` (both public) in Oct 2026. Dropbox stays in development
  mode until the owner applies for production (its icons are 64 and 256 px from `icons/icon-512.png`).
- **One spreadsheet (CSV)** (Backup card, "Download as one spreadsheet"; `backup-csv.js`, tested; Oct 2026, from
  Codex's list): the backup as one CSV for Excel: a `logbook` row (settings, tag groups, portfolio details) then a row
  per case, reflection and note (photos left out). Readable columns (Kind, ID, Date, Initials, Title, Text, Tags,
  Heading, Status, Linked case, Updated) and a Data column with each record's JSON, which Restore from backup reads
  (`looksLikeBackupCsv` → `csvToBackup`), so the same preview and add-only restore apply. A BOM for Excel; cells that
  start like a formula get a leading `'`; comma, semicolon or tab separators load. e2e: `simpler.mjs`.
- **Download for notes apps** (More → Export / Import → Backup; `ui-notes.js`): a zip made on the phone (JSZip):
  `Cases/` notes, `Reflections/…` one note each (linked both ways), `Progress.md` (counts vs targets, reflections vs
  minimums), optional figures in `images/` (fetched one by one from `images/`). A privacy line is always shown.
