# Logbook screens: Profiles

Part of the logbook working notes; index of screens in [../screens.md](../screens.md). Settings → Profile: profiles as presets of switches, showing and hiding items.

- **Profile** page (Settings → Profile, was Profiles or hide items; `#showhide`, `renderShowHide` in `ui-settings.js`):
  the profile card, then every switch that shows or hides part of the app, grouped Extras / APMES / Tips and help /
  Add tab / Reflections / Logbook / Header and tabs, each group with its own "Reset this group" (back to the
  profile's defaults; the other groups stay). The same settings as on their own pages. e2e: `simpler.mjs`, `profiles.mjs`.
- **Profiles are presets of switches** (owner, 13 Oct 2026: "changing profiles simply toggles a bunch of switches";
  `js/profiles.js`, pure, `test/profiles.test.mjs`). `settings.mode` (the whole account; `PROFILES`, `profile()`,
  `shows(key)` / `basicHides(key)`, `setShown`, `caseShown` / `setCaseShown` in `ui-core.js`) is the base; each switch
  (`SWITCHES`: extras `grid`, `analytics`, `reflExtras`, `reflect`; Add tab parts `case:<part>`; APMES `targets`,
  `case:still`, `totals`, `portfolio`, `year`, `reflHeadings`, `saveToast`, `apmesTitle`) is its saved value in
  `settings.show`, else the profile's default (`presetOn`). Older accounts' lists still count: `caseHide` (parts off,
  kept in step on every save) and `basicOn` (items a Basic profile hid, turned back on). So an account with only `mode`
  saved looks exactly as before. Picking a profile (`profileCard` → `confirmProfile`) lists what it turns on and off and
  the tabs it moves on this device, then Apply clears the saved switches (`applyPatch`; an ungoverned hidden part such
  as `parsed` stays) and moves this device's saved tabs, only those the old or new profile moves (`PROFILE_OFF` /
  `PROFILE_ON`; `tabsAfter`; Notes put on the bar by hand stays there from Basic to Advanced; a device with no saved tabs
  follows the profile's `offBar`). A switch changed after makes the card read "Custom (based on X)" with "Back to X"
  (of the tabs, only the profile's own count). **Saving `show`:** the cloud merges the map key by key (`setDoc` with merge), so a patch sends
  only the changed keys, and a reset sends its keys as `null` (left out, they'd stay); `mergeSettings` merges the same
  way locally and in demo mode, and a settings file's `show` replaces the account's (`replaceShow`).
  Body classes `basic`, `logbook-only`, `faculty-profile` stay. **Basic is the default for everyone** (owner, 12 Oct
  2026: nothing saved = Basic). The e2e demo account starts in Advanced (`demoDoc` in demo-backend.js, when
  `apmes-logbook-demo-small` is set) since the tests check every feature.
  - **Profiles hide interface items only, never settings** (owner): every switch is visible on the Profile page and
    works in any profile.
  - **Opt-in switches** (`OPT_IN` in profiles.js: new options, off in every profile unless `PRESET_ON` lists them):
    `evalRequest` ("Request an evaluation from a case", APMES group; a case's ⋯ menu and edit page open the evals app's
    new request with the date and initials only, `js/eval-link.js`). The APMES group's reset says it turns it off.
  - **Device presets** (`js/device-presets.js`): device options a profile turns on, the device's own value first.
    `hideTabsTyping` (Layout → Hide the tab bar while typing) is on in Personal only. The profile sheet lists them
    as "Turns on / off (this device)", and Apply clears the device's own values for them (`deviceReset`), so the device
    follows the new profile; one switched by hand after makes the profile "Custom".
  - **APMES switches** (account, on in every profile but Personal): targets (counts against targets in All tags,
    Analytics targets; off: Analytics shows cases per tag, your own tags too, `renderCounts`), Still needed, programme
    totals (Compare with your intake, You and your year), portfolio export and Section 1 (Export / Import cards,
    Account card), residency year (Account card, Analytics year), reflection headings (Analytics card, "Which
    heading?" step, Reflections list grouped by month), the "now 4/10" save toast, APMES in the default app name
    (`defaultTitle`; a name typed in Themes → Header and tab bar still wins).
  - **Personal** (generic logging outside APMES): the APMES switches off, the extras on, Notes on the tab bar
    (`PROFILE_ON`), own tags kept (tags are never touched by a profile).
  - **Basic**: hides the optional Add tab parts but "what the box was read as" (quick picks, ☆, Still needed, tag
    group saving, Plan for later), the Logbook Grid, Analytics trends / forecasts / Gone quiet / to-dos / links,
    reflection Figures and References (shown anyway when a reflection has some); Analytics off the bar (in More).
    Search operators are not hidden (already off by default; a setting).
  - **Basic: logbook only**: Basic without reflections, for residents allowed to submit reflections separately (the
    PCs still need compiled case logs): Reflections off the bar (in More, for ones already written), no Reflect
    buttons or row-menu item, no ☆ Interesting (edit dialog, Logbook filter), no reflection headings card.
  - **Advanced**: hides nothing.
  - **Faculty / PCs** (`facultyMode()`; offered only to `facultyRole()`: admins, PDs and active faculty; their
    default when nothing is saved, outside the demo; owner, 12 Oct 2026: PCs are added as admins, no PC role; no
    Generic profile): tab bar **Totals** (Programme totals), the Admin portal for admins (left of More; owner), then More
    (owner, 15 Oct 2026): **Case logs** first (`#caselogs`, `ui-caselogs.js`: residents by year with total cases, tags
    behind / due, reflections; tap → `#caselog`, that resident's counts per tag against the targets (`totalsTable` with
    one column), reflection headings met, Excel download), then **Analytics** as programme analytics (`renderProgramme`:
    who's behind, the tags most residents are behind on, and the **Year comparison**: each target tag's median in the
    year picked, the target due next, residents with half the median or less from a median of 4 (`year-compare.js`,
    unit-tested); no totals), then their own Case, Logbook, Reflections. All from the counts
    summaries, never case details. The rules let active
    faculty read `summaries/` (counts are no secret, owner); they still can't read the residents list, cases,
    reflections or notes. Case logs is listed in More for them in other profiles.
  - Display preview (`displayPreview`): dashed accent edge, faint stripes and a "Preview only: not a real case" pill,
    so it never reads as a real case (owner).
  e2e: `simpler.mjs`.
