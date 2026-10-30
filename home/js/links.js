// What the APMES home page (apmes.anawj.com/) lists. One entry per link; the page shows only entries with live: true,
// so an app or a section goes on the page by flipping its flag here (no other change needed).
// section: where it sits (SECTIONS, in that order). note: one short line under the label (optional).

export const SECTIONS = [
  { id: 'apps', title: 'Apps' },
  { id: 'medhub', title: 'MedHub', note: 'Each MedHub link opens on its sign-in page first.' },
];

export const LINKS = [
  { section: 'apps', label: 'Open Logbook', url: '/logbook/', note: 'Log cases and track your targets', live: true, primary: true },
  // the guidebook is an installable app of its own since 23 Oct 2026 (home/guide/sw.js, manifest id /guide/)
  { section: 'apps', label: 'Guidebook', url: '/guide/', note: 'Search, entrustment questions, EPAs 1–12', live: true },
  { section: 'apps', label: 'Assessments', url: '/evals/', note: 'DOPS, Mini-CEX and EBD', live: false },
  { section: 'apps', label: 'People', url: '/people/', live: false },
  { section: 'apps', label: 'CCC', url: '/ccc/', live: false },
  // MedHub's mobile Duty Hours and Evaluations pages show their own sign-in, then open straight on that page
  { section: 'medhub', label: 'MedHub', url: 'https://nuhs.medhub.com/', note: 'EPA forms, MSF and evaluations', live: true, external: true },
  { section: 'medhub', label: 'Duty hours', url: 'https://nuhs.medhub.com/functions/apps/mobile/dutyhours.mh', note: 'Log your work hours', live: true, external: true },
  { section: 'medhub', label: 'Evaluations', url: 'https://nuhs.medhub.com/functions/apps/mobile/evaluations.mh', note: 'Your MedHub evaluations', live: true, external: true },
];

// The installed Home app (manifest scope /) would open the Logbook and the others inside its own window. Like the
// tailnet app's tiles, it opens every link in a new window instead, so Android hands it to that app when it is
// installed (or to the browser). In a browser tab links stay in the tab.
export function isInstalled(w = globalThis) {
  return !!(w.navigator?.standalone || ['standalone', 'fullscreen', 'minimal-ui'].some(m => w.matchMedia?.(`(display-mode: ${m})`).matches));
}
export const openAttrs = (url, installed) => (installed ? { href: url, target: '_blank', rel: 'noopener' } : { href: url });

// [{ ...section, links }] for the sections that have at least one live link, in SECTIONS order
export function visibleSections(links = LINKS, sections = SECTIONS) {
  return sections.map(s => ({ ...s, links: links.filter(l => l.live && l.section === s.id) })).filter(s => s.links.length);
}
