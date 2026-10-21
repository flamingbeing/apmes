# apmes

The APMES web apps of the anaesthesia residency programme, all on [apmes.anawj.com](https://apmes.anawj.com/logbook/):

- Case logbook (`logbook/`), assessments (`evals/`), People (`people/`), applicants feedback (`applicants/`), CCC 360
  (`360/`), and the programme documents they read (`apmes/`).

Static pages served by a Cloudflare Worker (`worker/sites.js`; which folder each address serves is in
`worker/routes.js`), plus the guest passcode sign-in (`worker/guest.js`). A second Worker serves the `beta` branch at
beta-apmes.anawj.com against a test Firebase project. Data lives in Firebase; this repo holds only code and made-up
samples. The NUHS design kit comes from design.anawj.com. Moved here from anawj-site on 21 Oct 2026 (files only, no
history; the old history stays there). How to work here: [AGENTS.md](AGENTS.md).
