# Logbook screens: Notes

Part of the logbook working notes; index of screens in [../screens.md](../screens.md). Notes page, note editor, daily notes, pasting and formatting, select and bulk edit in Notes.

- **Notes** (`#notes`; `ui-notepad.js`, pure helpers in `notepad.js`, tested; Oct 2026, owner's spec via Codex):
  a resident's own notepad: teaching points, doses, to-dos. Private (owner-only rules: no admin, PD or app-owner
  access), never in the portfolio. A bar tab that starts off the bar (`OFF_BAR` in `ui-settings.js`): first in More
  with "Your own notes: private, never in your portfolio"; Arrange tabs can put it on the bar (it stays off until
  `tabOrder` holds it, so people who arranged tabs before Notes existed don't get it on their bar). At most 2,000
  (`MAX_NOTES`, raised from 100 on 13 Oct 2026 with the sync engine; the app enforces it: the rules can't count); the
  list shows 100 at a time ("Show 100 more"). The index doc (`meta/noteIndex`, rules cap 100) keeps the latest 100
  days and the cases of the latest-changed notes; once the notes are loaded the Logbook's marks come from them. A full
  index (100 days or cases) can't say about older ones, so the Logbook then loads the notes (this device's copy:
  cheap), and a day's Share loads them too (`dayMayHaveNotes`). A new note takes today's date (or the filtered day /
  linked case's day); "No date" makes it undated. Order: undated first (latest change first), then newest day first,
  then as written. Search over title and body. Optional `caseId` ("Link to a case…"). Body is Markdown text, shown
  through `parseNote` → elements (never innerHTML; the list page keeps the syntax in a small "Formatting" fold;
  Enter in the title moves to the note text): # headings, **bold**, - / 1. lists, - [ ] to-dos that tick in
  Preview, http(s)/mailto links only. No images. Delete → recycle bin (kind `note`, 30 days; restore refuses past 100).
  Firebase cost: notes are not read at sign-in; `ensureNotes()` starts the listener on first need (the page, a day
  with notes in the Logbook, the Markdown export, a backup) and keeps it for the visit. Sync, the backups and a
  restore wait for the server's list (`notesFromServer`): this device's copy may be weeks old. Typing saves after 3 s of
  quiet, on blur, on leaving (Back, another tab) and on pagehide / hidden, through `writes.save('note')` →
  `cloud.commitRecord` (offline queue, conflict check). The note index { days, cases, n } (`logbooks/{email}/meta/
  noteIndex`, owner only; updated only from the server's copy of the notes) lets the Logbook show a bar on days with
  notes, "✎ Notes" on the day and "✎ note" on linked case rows without reading notes: one small read when the Logbook
  first asks. It moved out of `settings.noteIndex` (Oct 2026 review: the logbook doc is readable by the app owner); the
  first sync clears the old copy, and backups and the settings file never carry it. Bin restore loads the notes first,
  so the 100 limit holds; the notes listener uses `includeMetadataChanges` like reflections. Copy / Share for a day adds its notes after the
  cases in Settings → Markdown's "A day's notes" format (default `## Notes` then `{{notes}}`: each note as `### title`
  and its text); `{{notes}}` in the day heading places them there instead; no notes, no heading. The Markdown export
  (renamed from "Notes apps") puts dated notes in their day's case note (a notes-only day gets one) and undated ones
  in `Notes.md`. The backup file holds notes; restore adds missing ones up to the limit. e2e: `test/e2e/notepad.mjs`.
  A note's linked-case pill (in the list and in the editor) opens that case's edit page over the note
  (`openCase` → `editCaseDialog`). The edit page has a "Linked" row (not for a new case): Open / Write a
  reflection (`reflectOnCase`) and Open the notes / Write a note (`openNotes({ caseId, create })`; it saves an open
  note first). The Notes page's "Download notes as files (zip)" makes one `.md` or `.txt` per note
  (`noteFiles` in `notepad.js`: "2026-10-12 Title.md", undated "No date Title.md"; title, Date line, text; the linked
  case isn't named); this is separate from the Markdown export, which puts notes inside the day's case note.
- **Daily notes, pasting, formatting, shared to the app** (Oct 2026, 6-hour build track E; e2e `test/e2e/daily-note.mjs`):
  - A daily note is an ordinary note with the id `day-YYYY-MM-DD` (date set, title empty → "Daily note"), so every device
    finds the same one without a query and no rules change was needed. `openDayNote(iso)` waits for the notes and opens
    the existing one (never a second copy with the same id), straight in Edit; when the offline cache hasn't got it,
    it waits up to 3 s for the server's list, and a server copy arriving before anything is typed replaces the blank
    one. Two copies saved apart (two devices) are merged (`mergeDayNote`: the other copy's text plus what was added
    here) instead of a write conflict; ordinary notes keep the conflict. The Add tab box and the editor share one
    copy. A daily note's date can't be changed (it's found by its day). Ways in: the Logbook day's "+ Daily
    note" / preview card (`dayNoteCard`; Done goes back to the Logbook), Notes' "Today's note" button and "Daily notes"
    chip, the manifest shortcut `./#today`, and the Add tab box (Settings → Notes, `settings.dayNoteOnCase`, off).
    It sorts first in its day and has no heading in Copy / Share / Send and the Markdown export.
  - Daily notes don't count towards `MAX_NOTES` (2,000; `cappedNotes`; backup restore and bin restore follow). The
    rules allow 100 days in `meta/noteIndex`, so the doc holds the latest 100 days and the cases of the latest-changed
    notes (`noteIndex(list, INDEX_CAP)`, from the sync engine); once the notes are loaded the marks come from all of
    them, and a full index loads them (`indexCapped`, `dayMayHaveNotes`), so an older daily note still shows and goes
    into Copy / Share / Send. The Logbook's day repaints when the notes change (ui-notepad.js `apply`). Raising that
    cap needs a `firestore.rules` change (owner's approval).
  - Paste cleaner (`paste-clean.js`, tested): `settings.pasteClean` (off) turns pasted HTML into light Markdown;
    Clean up (editor ⋯ menu, always there, with Undo) runs `tidyMarkdown`. The preview now shows `*italic*`.
  - Formatting bar (`fmt-bar.js`, shared with reflections): the note editor's full bar (bold, italic, heading, lists,
    to-do, link, undo) is device setting `noteToolbar` (off); on phones it rides on the keyboard while typing. Edits go
    through `execCommand('insertText')`, so Undo and Ctrl+Z work.
  - Shared to the app: the manifest share_target is POST multipart (text, title, url, `.md`/`.txt` files) to
    `./share-target`; `sw.js` keeps it in Cache Storage `share-inbox-logbook` and opens `./?shared=1#log`. Shared text
    (POST or the old GET `?share_text=`, which still works) goes straight to paste-a-list, as before, unless Settings →
    Notes → Ask what to do with shared text (`settings.shareAsk`, off); files always ask. The chooser
    (`ui-share-in.js`: Add as case(s) / Add to today's note / New note) clears the text only once the note has it.
    `share-in.js` holds the plumbing (tested).
    The POST needs the service worker: with none active (site data cleared, shared before the first install finished,
    or the old v40 worker still in charge while the new one waits for its reload and the phone already has the new manifest), the share reaches
    GitHub Pages, which refuses POSTs (405), so a static fallback page can't help. The worker installs on the first
    visit, so this only bites in that window.
- **Note editor** (polish 5): a page, not a form. Top bar: ‹ Notes, Saved / Not saved yet, a ⋯ menu (Preview or
  Edit, Delete) and Done. The title is a borderless heading, the body plain text; one grey line under the title holds
  the date (tap to change), No date, and the linked case or Link to a case….
- **Notes: a bin on each note while selecting** (owner, 16 Oct 2026): press and hold (or Select), then the red bin at a
  note's right moves just that note to the recycle bin (`moveToBin`, Undo in the message); the selection stays. The
  bin icon is `trash` in ui-core.js. e2e: `notes-select.mjs`.
- **Notes: Select and Bulk edit** (log2 9b): the same bar and popup (`ui-bulk.js` bulkDialog; the notes' fields in
  `ui-bulk-notes.js`, the rules in `note-bulk.js`). Change: date (set or clear; a daily note keeps its day, its id is the
  date), title (replace / add in front / find and replace), text (add to the end / find and replace), unlink from the
  case. Actions: Merge into one (a new note, each selected one under its title in date order, the earliest date, the
  case if they all share it; the originals go to the bin, Undo brings them back), Copy, Share, Send to, Download (zip),
  Move to the bin.
