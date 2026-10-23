// What the APMES home page (apmes.anawj.com/) lists. One entry per link; the page shows only entries with live: true,
// so an app or a section goes on the page by flipping its flag here (no other change needed).
// section: where it sits (SECTIONS, in that order). note: one short line under the label (optional).

export const SECTIONS = [
  { id: 'apps', title: 'Apps' },
  { id: 'medhub', title: 'MedHub', note: 'MedHub opens on its sign-in page; sign in there, then pick Duty Hours or Evaluations from its home page.' },
  { id: 'guide', title: 'Guidebook' },
];

export const LINKS = [
  { section: 'apps', label: 'Open Logbook', url: '/logbook/', note: 'Log cases and track your targets', live: true, primary: true },
  { section: 'apps', label: 'Assessments', url: '/evals/', note: 'DOPS, Mini-CEX and EBD', live: false },
  { section: 'apps', label: 'People', url: '/people/', live: false },
  { section: 'apps', label: 'CCC 360', url: '/360/', live: false },
  // MedHub's own pages need its sign-in first (a deep link lands on its sign-in page), so both go to its home page
  { section: 'medhub', label: 'MedHub', url: 'https://nuhs.medhub.com/', note: 'EPA forms, MSF and evaluations', live: true, external: true },
  { section: 'medhub', label: 'Duty hours', url: 'https://nuhs.medhub.com/', note: 'MedHub, then Duty Hours', live: true, external: true },
  { section: 'medhub', label: 'Evaluations', url: 'https://nuhs.medhub.com/', note: 'MedHub, then Evaluations', live: true, external: true },
  { section: 'guide', label: 'Programme guidebook', url: '/guide/', note: 'EPAs, DOPS expectations, MSF', live: false },
];

// [{ ...section, links }] for the sections that have at least one live link, in SECTIONS order
export function visibleSections(links = LINKS, sections = SECTIONS) {
  return sections.map(s => ({ ...s, links: links.filter(l => l.live && l.section === s.id) })).filter(s => s.links.length);
}
