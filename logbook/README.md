# APMES Logbook

A case logbook for APMES (NUH anaesthesia) residents, at <https://apmes.anawj.com/logbook/> (it was at anawj.com/logbook/ until 13 Oct 2026; that address now forwards). It replaces the old Google Form and spreadsheet.

Logging a case takes three things: the date, free text (patient initials and case details), and one or more categories. Leading patient initials ("AB 34F LSCS spinal") are stored in a field of their own (`initials`); Enter adds a new line in the details box, and Ctrl+Enter (Cmd+Enter) saves. As you type, the page suggests categories from the text (age, BMI and keywords learnt from past logs). Progress against the APMES targets for your residency year is worked out from your counts.

It is a static page (vanilla ES modules, no build step to run it; the deploy joins its files into a few, `tools/bundle-logbook.mjs`) that installs to the home screen and works offline. Cases are stored in Cloud Firestore under your Google account and sync when you are back online.

Try it without signing in: <https://apmes.anawj.com/logbook/?demo> (made-up data, kept in your browser only; `?demo=empty` starts blank, `?demo=reset` wipes the demo data).

## Privacy model

- **Your cases are yours.** Only you can read or change your logbook and cases. This is enforced by `firestore.rules` on Google's side, not just by the page.
- **Admins** (the programme admins, listed in the `admins` collection) manage the resident list and shared templates. They **cannot** read anyone's logbook or cases; they see the counts in `summaries/` like everyone on the programme.
- **The app owner** (listed in the `owners` collection, set by hand in the console) can also read logbooks and cases and import cases into them, which is how the old form responses were imported. Never reflections, figures or the recycle bin. To hand the app over, add the new owner's email to `owners` (and `admins`) and remove your own.
- **Summaries are counts only.** Each programme resident's per-category counts (and complete reflections per heading, each capped at that heading's minimum so nobody can tell how many more were written) are copied to `summaries/{rid}` so the programme can compare progress. Only admins and programme residents can read them (the rules check that the `rid` in the reader's logbook belongs to a resident with the reader's email); other Google accounts cannot. A resident's own summary must carry the name and intake on the resident list. Case details are never in a summary; the rules reject any extra fields.
- Anyone with a Google account can sign in and keep a private logbook. Only people on the admin-managed resident list appear in the totals.
- Keep case details de-identified: initials and a short description, no names or NRIC numbers. The data is stored in Google Cloud (Firestore, asia-southeast1), outside NUH systems.
- This repository is public. It contains no resident names, emails or case data. Admin emails live only in Firestore.

## Data model

| Path | Contents | Who |
|---|---|---|
| `owners/{email}` | `{ name }` | the app owner; added by hand in the console; a user may check their own entry |
| `admins/{email}` | `{ name }` | added by hand in the console; a user may check their own entry |
| `pds/{email}` | `{ name }` | programme directors, a role separate from admin: read residents, summaries and evaluations; added by admins or in the console |
| `residents/{rid}` | `{ rid, name, email (lower case), status: ACTIVE / ON LEAVE / GRADUATED / ATTRITED, intake, rYear 1–5 }` | admins; a user may read the entry with their own email |
| `logbooks/{email}` | `{ email, name, rid, settings, templates: [{ id, name, cats, details? }], profile?, updatedAt }` (`profile`: portfolio Section 1 details, `{ familyName, givenName, sex: ''/M/F, dob, graduation, postgrad, program, programDirector, residencyStart, seniorStart, memberships, awards, scholarships, electives, projects, projectRemarks, papers, courses, teaching }`; dates 'YYYY-MM-DD', lists of row objects (columns in `SECTIONS`, ≤40 rows), strings ≤2000 (postgrad/projectRemarks ≤4000), cleaned by `cleanProfile` in `js/profile.js`; rules cap it at 30 keys. Export writes it into the template's cover page, PERSONAL DETAILS and Section 1 tables via `fillSection1Xml` in `js/portfolio.js`). Display settings are not here: they are saved per device (`localStorage` `apmes-logbook-display`: compact, text size, colour, start tab; `apmes-logbook-theme`: light / dark). A device starts from older values in `settings` the first time | owner; the app owner reads |
| `logbooks/{email}/cases/{id}` | `{ id, date ('YYYY-MM-DD' or null), dateText?, initials? (≤20, upper case; older cases have none and keep the initials at the front of `details`), details (≤2000 chars, may span lines), cats (≤40 codes), createdAt, updatedAt, source: app / import / paste / sheet, importKey?, reflectionId? }` | owner; the app owner reads and writes (import) |
| `logbooks/{email}/reflections/{id}` | `{ id, headingId, subId (or null), initials, date ('YYYY-MM-DD' or null), jr (bool), diagnosis (≤2000), title (≤300), summary (≤20000), points: [{ heading (≤300), text (≤20000) }] (≤15), figures: [{ id (image doc), caption (≤300), point (index of the learning point it follows, or null = after all) }] (≤10), references: [string ≤1000] (≤30), sections? (legacy: { description, thoughts, evaluation, analysis, conclusions, action, further }, each ≤20000), caseId (or null), status: draft / complete, export? (false = left out of the Word export; absent = in), createdAt, updatedAt }` (`js/reflections.js`). headingId '' = Uncategorised (can be complete, never exported). Exported like the portfolio's Section 2 rows: bold title, case summary, "Learning Points" with underlined numbered headings, figures with captions, references. | owner only; admins have no access |
| `logbooks/{email}/images/{id}` | `{ id, data (base64 without the data: prefix, < 700 KB), mime: image/jpeg or image/png, w, h, createdAt }`: reflection figures, compressed on the phone to JPEG (longest side ≤ 800 px, quality 0.7: about 60–120 KB). For the Word portfolio only: not in the backup file or the Excel export. Each figure in a reflection records its stored size as `kb`; a resident's figures may use at most 20 MB in total (`PHOTO_BUDGET_KB` in `js/reflections.js`, enforced by the app when adding a photo or importing a Word file; Settings → Photos shows the meter). Figures saved before sizes were recorded count as 300 KB until they are next opened | owner only |
| `logbooks/{email}/notes/{id}` | `{ id, date ('YYYY-MM-DD' or null), title (≤200), body (Markdown text ≤20000), caseId?, createdAt, updatedAt }`: personal notes (More → Notes; `js/notepad.js`). The app keeps at most 2,000. Never in the portfolio. | owner only; admins, PDs and the app owner have no access |
| `logbooks/{email}/meta/noteIndex` | `{ days: ['YYYY-MM-DD'…] (≤100), cases: [caseId…] (≤100), n, updatedAt }`: which days and cases have notes, so the Logbook can mark them without reading notes (`js/ui-notepad.js`). No other `meta` docs. | owner only; admins, PDs and the app owner have no access |
| `logbooks/{email}/guide/entrustment` | `{ items: { '<question key>': { d: done (bool), n: note (≤4000), t: changed at (ms) } } (≤2000), updatedAt }`: Guidebook notes and Done ticks on the entrustment questions (`home/guide/notes.js`, `notes-core.js`); a cleared question keeps its entry so the clear syncs. Deleted with the account; the device copy goes at Logbook sign-out. | owner only; admins, PDs and the app owner have no access |
| `logbooks/{email}/bin/{id}` | `{ id, kind: case / reflection / note, data: the deleted case, reflection or note (≤40 top-level keys), deletedAt (ms) }`: the recycle bin (`js/bin.js`). Every case and reflection delete moves the item here; it can be restored (same id, or a new id if that id is in use again) for 30 days, then the app purges it after the next sign-in. A binned reflection's figures stay in `images/` until its entry is purged or deleted forever. | owner only; admins have no access |
| `logbooks/{email}/formGone/{caseId}` | `{ id, deletedAt }`: Google Form cases the resident deleted (`js/form-inbox.js`), kept for good so an edited or re-sent response doesn't bring one back | owner only |
| `summaries/{rid}` | `{ rid, name, intake, rYear, counts: { code: n }, total, reflections: { headingId: n }, reflectionsTotal, updatedAt }` | admins and programme residents read; admins or that resident write |
| `imports/{rid}` | `{ email, keys: [importKey], updatedAt }` (keys reset if the resident's email changes) | the app owner |
| `sharedTemplates/{id}` | `{ id, name, cats, details? }` | everyone signed in reads; admins write |
| `formInbox/{responseId}` | `{ id, email, date ('YYYY-MM-DD' or null), dateText?, details (≤2000), labels: [category answers] (≤40), submittedAt (ms) }`: Google Form responses waiting for the app to pick them up (`js/form-inbox.js`) | the Form's bot account adds or replaces (never reads); the resident with that email reads and deletes |
| `formBots/{uid}` | anything: lists the bot account the Form's Apps Script signs in as | nobody (console only) |

`{email}` is always the Google account email in lower case. Category codes and targets are in `js/categories.js`.

## Moved to docs/ (open when needed)

- Firebase setup (once), How the import works, The Google Form, still open (Oct 2026): [docs/setup-and-import.md](docs/setup-and-import.md)
- Code (what each module does): [docs/code-map.md](docs/code-map.md)

## Tests

Each test uses fake data only and runs with plain node:

```sh
for f in logbook/test/*.test.mjs; do node "$f" || break; done
# uses the blank template in apmes/templates/ (PORTFOLIO_TEMPLATE=other.docx to try another): node logbook/test/profile.test.mjs
# fills Section 1 of the real template with a made-up profile and reads it back (parseSection1)
```

Read counts of the sync engine, against the Firestore and Auth emulators with the real rules (needs Java; fake
account and cases, demo project): `PORT=8080 tools/test-reads.sh`.

The rules are checked against the Firestore emulator (needs Java). From a scratch folder outside the repo:

```sh
mkdir -p /tmp/lbrules && cd /tmp/lbrules
npm init -y && npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10.12.2
cp ~/apmes/logbook/firestore.rules ~/apmes/logbook/test/rules.emulator.mjs .
echo '{ "firestore": { "rules": "firestore.rules" }, "emulators": { "firestore": { "port": 8085, "host": "127.0.0.1" }, "ui": { "enabled": false } } }' > firebase.json
npx firebase emulators:exec --only firestore --project demo-logbook "node rules.emulator.mjs"
```
