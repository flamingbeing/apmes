// What the APMES home page (apmes.anawj.com/) lists. One entry per link; the page shows only entries with live: true,
// so an app or a section goes on the page by flipping its flag here (no other change needed).
// section: where it sits (SECTIONS, in that order). note: one short line under the label (optional).

export const SECTIONS = [
  { id: 'apps', title: 'Apps' },
  { id: 'medhub', title: 'MedHub', note: 'Each MedHub link opens on its sign-in page first.' },
  { id: 'guide', title: 'Guidebook' },
];

export const LINKS = [
  { section: 'apps', label: 'Open Logbook', url: '/logbook/', note: 'Log cases and track your targets', live: true, primary: true },
  { section: 'apps', label: 'Assessments', url: '/evals/', note: 'DOPS, Mini-CEX and EBD', live: false },
  { section: 'apps', label: 'People', url: '/people/', live: false },
  { section: 'apps', label: 'CCC', url: '/ccc/', live: false },
  // MedHub's mobile Duty Hours and Evaluations pages show their own sign-in, then open straight on that page
  { section: 'medhub', label: 'MedHub', url: 'https://nuhs.medhub.com/', note: 'EPA forms, MSF and evaluations', live: true, external: true },
  { section: 'medhub', label: 'Duty hours', url: 'https://nuhs.medhub.com/functions/apps/mobile/dutyhours.mh', note: 'Log your work hours', live: true, external: true },
  { section: 'medhub', label: 'Evaluations', url: 'https://nuhs.medhub.com/functions/apps/mobile/evaluations.mh', note: 'Your MedHub evaluations', live: true, external: true },
  { section: 'guide', label: 'Programme guidebook', url: '/guide/', note: 'Search, entrustment questions, EPAs 1–12', live: true },
];

// [{ ...section, links }] for the sections that have at least one live link, in SECTIONS order
export function visibleSections(links = LINKS, sections = SECTIONS) {
  return sections.map(s => ({ ...s, links: links.filter(l => l.live && l.section === s.id) })).filter(s => s.links.length);
}
