# APMES CCC

What the programme coordinators (PCs) collect from residents before a CCC (a residency meeting): the **scholar projects**
each resident is doing, and the people who should give each resident **multisource feedback (MSF)**. It replaces the
department's Google Form "CCC Projects & MSF" (owner, 17 Oct 2026). At `apmes.anawj.com/ccc/` (folder `ccc/`, at `/360/` until 23 Oct 2026; `?demo` for
made-up residents). Same people and sign-in as logbook, evals and People. Not the same as `applicants/`.

- **Demo landing page** `ccc/demo/` (`/ccc/demo/`, linked from the sign-in screen): what residents, coordinators, nominees
  and the CCC each see, a screenshot each (`ccc/demo/shots/`, phone size, from the demo) and a button into `?demo` as that
  person; plus where each question of the old Google Form went. The nominee button opens a ready-made link
  (`DEMO_INVITE` in `store.js`) that also adds four made-up answers for Bea Lim, so her CCC report has figures. Retake the
  shots when the screens change.
- **Old form's answers** come in with `tools/ccc-import-form.mjs` (plan from the response sheet's CSV, then write with the
  owner's gcloud sign-in; the CSV and plan stay in the private notes). Rounds `r<year>-h1|h2` ("CCC Jan–Jun 2026"); the
  newest stays open, older ones are closed at their last answer. Tests: `ccc/test/import.test.mjs`.

## Rules the app follows (decisions in the owner's private notes)

- One **round** per CCC, opened and closed by PCs (or PDs, admins), with a deadline. Residents edit until it closes.
- Projects carry over between rounds; **nominees start empty each round** (the app does not offer last round's list).
- Lists: scholarly projects (title, supervisor, status, start, end, note; "nothing to report" tick), committee / admin work,
  teaching / presentations, conference presentations (free text). Nominees: name, group (senior, peer, allied health, other),
  email (required for allied health, optional for doctors). Limits: 6 seniors (Associate Consultant or above), 2 peers, 4 allied health.
- PCs review nominees (ok or swap) and send emails **outside the app** (CSV export, or one `mailto:` per nominee). Nominees
  answer through a one-time link ("Rater feedback" below).
- **Roles live in the app**: `access/{google-email}` holds `{ roles }` (owner, admin, pc, pd). A PC has Admin staff's powers, so
  PDs, Admin staff and PCs read every entry and nominee list; residents see only their own; faculty none. Residents' private
  logbooks, reflections and assessment comments stay out of reach of admin staff and PCs.
- Nominees' contact details are third-party personal data: deleted automatically three years after a round closes (a year until 23 Oct 2026) (a PC or PD can
  delete earlier); projects stay. Real data never goes in this repo; the demo is made up.

## Data (rules in `logbook/firestore.rules`, "CCC 360"; tests `ccc/test/rules.emulator.mjs`, run by `tools/test-rules.sh`)

- `access/{email}` `{ name, roles, updatedAt, updatedBy }` and `accessLog/{id}`: see "Roles" in `people/NOTES.md`. Replaces the
  short-lived `cccPCs` (removed 17 Oct 2026, never used).
- `ccc/{round}` `{ round, title, status: open|closed, deadline?, closedAt?, updatedAt }`: read by residents and staff; written by staff
  (staff = PD, Admin staff, PC).
- `ccc/{round}/entries/{email}`: a resident's projects (`noProjects, projects, admin, teaching, conferences`), written by
  them while the round is open; read by them, PCs and PDs; deleted by staff.
- `ccc/{round}/msf/{email}`: a resident's `nominees` list, apart so it can be deleted alone; deleted by the resident while
  open, and by PCs and PDs any time (retention).
- `ccc/{round}/review/{email}` `{ email, marks }`: the PCs' marks on that resident's nominees (by nominee id); PCs and PDs only.
- Rules cannot check the items inside the lists (only their count); the app's `model.js` does.

## Rater feedback (rules and model, rater page and invites, CCC report and clean-up, 23 Oct 2026)

Nominees answer in the app through a **one-time link**, with no account (owner, 23 Oct 2026). Coordinators send the links
from their own mail (`mailto:`); the app never sends mail.

- `ccc/{round}/invites/{id}` `{ resident, nomineeId, group, residentName, raterName, createdAt, createdBy }`: made by staff
  only for a nominee marked Checked (or Emailed) in `review/`; `createdAt` is the server time, `createdBy` the writer. The id
  is 128 random bits as 32 hex characters (`newInviteId`), sent as `/ccc/rate/#<round>/<id>` (`rateLink`; the hash never
  reaches server logs; the round is in it because a rater cannot list invites to find theirs, and round ids are not secret).
  Anyone may `get` one invite by its id; only staff `list` or delete them; no update.
- `ccc/{round}/responses/{id}` (same id) `{ answers, comments, declined?, reason?, submittedAt }`: created once, with no
  sign-in, only while the round is open and the invite exists; never changed. Answer values are 1-4, `na`, `yes` or
  `no` (at most 30); comments use slots `c1`-`c5` of up to 2000 characters; a decline has empty maps, `declined: true`
  and an optional reason (1000). Read by PDs and PCs only: not Admin staff, residents or faculty. Raters are told so
  (`PRIVACY` in `msf-form.js`). PDs and PCs also delete them (the clean-up below).
- `js/msf-form.js`: the questionnaire as data. **Draft, made-up questions** until the programme's own MSF form arrives;
  a new form keeps to the rules' answer values and comment slots. The concern question (yes/no + comment) is for PDs
  and PCs only.
- `model.js`: `inviteDoc`, `invitable`, `cleanAnswers`, `answerProblems`, `responseDoc`, `declineDoc`, `raterStatus`
  and `summarise(responses, invites, { minGroup: 3 })`: counts (invited, done, declined, waiting, per group), means per
  item overall and per shown group ("Not observed" left out and counted), comments without names in random order, and
  the concerns apart. A group is shown alone only with 3 or more answers; smaller groups fold into Others; if Others is
  still under 3 it joins the smallest shown group (so no group's mean can be found by subtraction); under 3 answers in
  all, only counts.
- Tests: `ccc/test/model.test.mjs` (edge cases: none, all declined, small groups) and `ccc/test/rules.emulator.mjs`
  (list denied to the public, second submit and closed round denied, residents, faculty and Admin staff cannot read
  responses).

### The rater page and the invite flow (23 Oct 2026)

- **Rater page** `ccc/rate/` (`js/rate.js`), no sign-in: reads the one invite from the link, shows whom they rate and as
  which group (about 5 minutes), the questions from `msf-form.js` as labelled radio lists (no sliders, no stars, all on
  one page), comment boxes, the privacy line. Typing is kept on the device (`ccc-rate-draft-<round>-<id>`) until Submit;
  Submit is a plain await and checks every rating first ("Not observed" counts). "I can't give feedback" opens Decline
  with an optional reason (no ratings are sent). After sending, a done screen; the device remembers it
  (`ccc-rate-done-…`). Light or dark follows the phone (or evals' theme choice on that device).
- **Used or closed:** a rater may read neither the response nor the round, so a second submit (or one after the round
  closed) is refused by the rules and the page says "This link has already been used" kindly. An unknown or broken link
  says "This link doesn't work". On another device a used link shows the form until Submit (accepted, rare).
- **Coordinators** (resident screen): a nominee marked Checked gets an **Invite** button: it makes the invite, marks the
  nominee Emailed and opens the coordinator's mail app with the text and link filled in (`inviteMailto`). Then each rater
  shows Not invited / Invited / Done / Declined, with "Email the link", "Reminder" (while invited; `reminderMailto`) and
  "Copy link"; nominees without an email get the mail with no address. Counts per resident on the round list, "Copy
  emails of raters not done" on the round and resident screens. Admin staff (not PDs or PCs) cannot read responses, so
  they see Invited only, with a note. Links point at the host in use (beta links at beta); the demo's at `?demo`.
- The invite holds no rater email (anyone holding the link can read it); emails stay in `msf/` and the mailto.
- Tests: `model.test.mjs` (link parsing, rater rows and counts, mail text) and `e2e.mjs` (invite, reminder, a submit, a
  reload with the device draft, a reused link, a decline, unknown links, statuses back with the coordinators; axe at
  390 px on each rater screen).

### The CCC report and the clean-up (23 Oct 2026)

- **Report** (PDs and PCs; Admin staff are told only PDs and PCs see it): from a round, "Open the CCC report" lists each
  resident with raters (invited, answered, declined, mean of all ratings once 3+ answered, concerns), with "Print this
  table" and "Print every resident's report" (one page each). A resident's report (`#staff/<round>/<email>/report`): the
  counts, a table of item means overall and per shown group (the folding rule of `summarise`), the mean of all items, the
  comments without names in random order, and the concerns card. The resident screen links to it and to **Raters'
  answers** (`…/answers`): each rater's name, group and answers, for PDs and PCs only, never printed for the CCC.
- **Print:** the app bar and buttons drop away. Concerns show on screen but are left off paper unless "Include concerns
  when printing" is ticked (off by default, kept on this device: `ccc-print-concerns`). Rater names are never on the report.
- **Clean-up** (`purgeExpired`, when staff open the app, three years after a round closes): nominees as before; then, for a PD or
  PC only, per resident one batch saves `ccc/{round}/report/{email}` (`reportDoc`: counts without per-group splits, the
  shown groups, item means, comments, concerns, `formId`, `savedAt` = server time) and deletes that resident's responses
  and invites, so a failure leaves all or nothing. Admin staff cannot read answers, so with them the rater data waits.
  After it, the report screens draw from the saved summary ("Summary saved …"); raw answers are gone.
- Rules: `report/{email}` is read, written and deleted by **PDs and PCs only** (it holds the concerns, like the answers;
  the plan said staff, narrowed so Admin staff see no more than before), shape-checked (`validCccReport`). Responses may be
  deleted by PDs and PCs.
- Tests: `model.test.mjs` (summary snapshot, round trip, clean-up plan, overview, raw lines), `e2e.mjs` (round report,
  resident report, print view, raw answers, the clean-up keeping the summary), `rules.emulator.mjs` (report access and
  shape, response deletes, the clean-up batch).

## Lesson: the rules engine's 1000-expression limit

Rules fail closed (PERMISSION_DENIED) when a request needs more than 1000 expressions. `isAdmin()`, `isPD()` and `isAppOwner()` each
now also look at `access/`, so keep them cheap (`hasAccess` checks `exists` first, then reads `roles`) and run `tools/test-rules.sh`
after any change to them: a first version broke the evals decline and reassign checks this way.

## Who is who (names and emails are in the owner's private notes, never here)

- Real PCs, Admin staff, PDs, APDs and the core faculty list: the owner's private notes.
- Sign-in is Google; the `access`, `faculty` and `pds` ids are the Google email. A person's NUHS work email may differ: faculty
  records gain an optional `workEmail`, which the nominee picker uses for the PCs' emails.

## How it's built (resident half, 17 Oct 2026)

- `js/model.js`: all logic, no page code (`test/model.test.mjs`): cleaning of projects, lists and nominees, the limits (6 senior
  doctors, 2 peers, 4 allied health, 2 others; 20 in all, 30 per list), what blocks Send (a project with no title, a nominee with
  no name or a bad email, an allied-health nominee with no email) and what only warns, carrying projects over, the faculty
  picker (`suggestFaculty`: active faculty whose name starts with each word typed, core faculty first; `contactEmail`: work email
  if set, else the sign-in email) and the document shapes the rules check.
- `js/store.js`: rounds, a resident's own entry and nominees, and Send (both documents in one batch, a plain await so "sent" means the
  server has it). `?demo` uses a localStorage twin (`ccc-demo-store`).
- `js/app.js`: home, Scholarly projects, Feedback nominees, Review and send. Typing is autosaved on the device (`ccc-draft-…`) and
  wins over the server copy until Send; the device copy is cleared on Send. A closed round is read-only. Everything typed is shown
  with `textContent`, never as HTML.
- **Peers are picked from the active residents.** Since 17 Oct 2026 (owner: "residents should be able to see each others emails and see
  the list of residents") any resident may read the ACTIVE residents (names and emails; the query must ask for `status == 'ACTIVE'`; people
  on leave, graduated or attrited stay hidden; writes stay with admins and PDs). Senior doctors are suggested from faculty, peers from
  residents, others from both; anyone can still be typed in. `cloud.listActiveResidents` in evals' `cloud.js` is the call.
- Staff (PD, Admin staff, PC; `S.roles.admin/pd/owner` from `getRoles`, which reads `access/`) who are not residents go straight to the coordinators' view; residents who are also staff get a "Coordinators' view" button.
- Tests: `node ccc/test/model.test.mjs`, `node ccc/test/e2e.mjs` (demo at 390 px, axe on each screen, a send and a change, carry-over,
  a closed round, nothing outside the site reached).

## The coordinators' view (`js/staff.js`, 17 Oct 2026)

- **Rounds:** open a new round (name, optional send-by date; the id is `r<year>-<month>`, made unique), edit it, close it (asks first; stores
  `closedAt`), reopen it (clears `closedAt`). Residents see the newest open round; the app warns if more than one is open.
- **A round:** who has sent (active residents from People, plus anyone who sent but is not on the list), the nominees to check, a filter
  (Everyone / Not sent / To check), CSV exports of the nominees and of the projects, and a button that copies the emails of residents who
  have not sent (to chase them).
- **One resident:** their projects and lists, and each nominee with Checked / Ask for a different person, kept in `review/`. "Email" is a
  `mailto:` link to the nominee with the text filled in (`mailto` in `model.js`; edit it in the mail app) and marks them Emailed. The app
  never sends mail.
- **Retention:** nominees' contact details are deleted a year after a round closes (was 60 days; changed 17 Oct 2026 by the owner). The check (`purgeExpired`) runs whenever staff open
  the app; a round with no close time is never purged by guesswork. Staff can also delete one resident's nominees, or a round's, at once.
  Projects stay. Deleting a whole round is not offered; if it ever is, delete its nominees first (rules do not cascade).
- **CSV safety:** every cell that starts with `=`, `+`, `-`, `@` or a tab gets a leading apostrophe (`csvCell`); all resident text is put on
  the page as text only. Tested with hostile names.
- **Not built:** a reminder to residents, the resident's view of the coordinators' marks (deliberately never shown), and a custom email text.

## Lessons

- `tools/test-rules.sh` writes `firebase-debug.log`, `firestore-debug.log` and a `node_modules` link into the repo while it runs and removes them at the end. Do not `git add -A` while it is still running (it happened once and needed a clean-up commit).
- A rules change that widens who can read a collection must update the old test that asserted the narrower rule on purpose, and say so in the PR (#757 did).
