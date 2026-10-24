# Logbook: working notes

Decisions, conventions and how to work on the APMES logbook (`logbook/`). What's happening now (sessions, open
work, what waits on the owner, the next steps, a dated decisions log) is in `STATUS.md`. Read this, then `README.md`
(data model, Firestore layout, rules). Public repo: never commit real names, emails, case details or
portfolio content.


## Product principles (from the owner)

- **Frictionless APMES logging first.** Most residents only log for the audit requirements. Personal
  "learning logbook" features (personal tags, shorthand, tag groups, analytics, saved searches) are
  secondary and must never get in the way of logging a case.
- No extra structured fields (ASA, supervision, urgency): APMES requirements are already covered.
- Things you might do by accident are links, not buttons, and they ask first (e.g. reset built-in shorthand).
- Rarely used things fold away: Figures (optional), References, More tools, Analytics sections.
- Tags count towards credentialling, so they are picked on purpose: nothing is auto-ticked when
  "Suggest tags as I type" is off, and Save needs at least one tag.
- The demo should look like the real app: no yellow bar, just a small "demo ▾" badge in the header. Leave demo
  and Reset demo (a link that asks first) also sit by Sign out on More, so the header can be hidden in the demo too.


## Commands and rules to keep in mind

- Checks: `node tools/check.mjs`; ESM syntax: `for f in logbook/js/*.js; do node --input-type=module --check < $f; done`;
  unit tests: `for f in logbook/test/*.test.mjs; do node "$f"; done`.
- Everything in one go: `tools/test-logbook.sh` (`quick` skips the full e2e). Rules: `tools/test-rules.sh`. Accessibility
  after UI changes: `node logbook/test/e2e/a11y.mjs`. Details: [docs/working.md](docs/working.md).
- Timing: the runner writes each step's seconds to `$OUT/timings.txt` (slowest first) and ends with the total and the
  three slowest; `e2e.mjs` prints its own slowest sections. Baseline (cloud session, 23 Oct 2026): full e2e 218 s, slowest
  sections logging initials/autodetect 15 s, clean looks 12 s, settings week start/parts 11 s, compact per device 9 s,
  ⋯ menu and swipe 8 s; focused files mostly 5 to 10 s each. Speed-up ideas start from the biggest steps there.
- Don't bump `sw.js` `VERSION` by hand (the deploy stamps it); new JS files go in `sw.js` SHELL.
- Only the Add tab's modules load with the app: they must not import a page module statically (`docs/working.md`, "Start-up speed").
- New options: per device unless they belong to the account, off by default, defaults pixel-identical.
- Theme links (`#t=`) and themes files are input from strangers: read them only through `themeFromLink` / `importText` (checkTheme drops what it rejects; fonts are checked by their first bytes).
- Look settings: what each may hold is `js/look-schema.js` (one list for themes, files, settings files and links). New settings, choices, tints, fonts or patterns go at the **end** of their list, never reordered or removed, or old theme links change meaning (`test/fixtures/theme-links.json` catches it).
- Owner preferences (merging, screenshots, planning): "Working with the owner" in the root `AGENTS.md`. Status and decisions: `STATUS.md`.

## Topic notes (open only the one you need)

| File | What is in it |
|---|---|
| [docs/words.md](docs/words.md) | The words the app uses (tags, tag groups, case summary, Interesting, ...) |
| [docs/screens.md](docs/screens.md) | Where things are, one file per screen: Add tab, Logbook, Reflections, lists and bulk edit, Notes, Settings pages, Themes, Layout and Accessibility, Profiles, Markdown and Sync, backup, Connect an AI assistant, tag editor |
| [docs/theme-engine.md](docs/theme-engine.md) | The theme engine: every look a theme can set, icon sets, page motion, how to write a theme |
| [docs/data-and-rules.md](docs/data-and-rules.md) | Data, roles and photos (`firestore.rules`) |
| [docs/setup-and-import.md](docs/setup-and-import.md) | Firebase setup (once), how the import works, the Google Form still open |
| [docs/code-map.md](docs/code-map.md) | What each module in `js/` does |
| [docs/tags-sync-demo.md](docs/tags-sync-demo.md) | Tags and suggestions, sync and cheap reopening, the demo |
| [docs/working.md](docs/working.md) | Tests, e2e options, start-up speed, Firefox, ad blockers, gotchas, lessons |
| [docs/regressions.md](docs/regressions.md) | Review findings fixed (and which test covers each), device recovery, Back and search, tag editor selection |

Read [README.md](README.md) for the data model and Firestore layout.
