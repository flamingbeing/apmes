// APMES CCC: the multisource feedback (MSF) questionnaire a rater answers, kept as data so it can change without
// touching the page or the rules. DRAFT: these questions are made up for building and testing the app; the programme's
// own MSF form replaces them before a real round (ccc/NOTES.md, "Rater feedback").
//
// Item kinds: 'scale' (the SCALE below; `notObserved` adds "Not observed"), 'yesno' (with an optional comment slot) and
// 'comment'. Answers are stored by item id; comments by slot id. The rules allow comment slots c1 to c5 only (up to 2000
// characters each) and answer values from VALUES only, so a new form keeps to those.

export const FORM_ID = 'draft-2026-10';
export const DRAFT = true;

export const SCALE = [
  { value: 1, label: 'Below expectations' },
  { value: 2, label: 'Borderline' },
  { value: 3, label: 'Meets expectations' },
  { value: 4, label: 'Above expectations' },
];
export const NOT_OBSERVED = { value: 'na', label: 'Not observed' };
export const VALUES = [...SCALE.map(s => s.value), NOT_OBSERVED.value, 'yes', 'no'];   // what the rules accept
export const COMMENT_SLOTS = ['c1', 'c2', 'c3', 'c4', 'c5'];
export const COMMENT_MAX = 2000;
export const REASON_MAX = 1000;

export const SECTIONS = [
  {
    id: 'ratings', title: 'Ratings',
    items: [
      { id: 'q1', kind: 'scale', notObserved: true, title: 'Clinical care', text: 'Safe, careful anaesthetic care and sound judgement.' },
      { id: 'q2', kind: 'scale', notObserved: true, title: 'Communication with patients and families', text: 'Clear, kind, checks understanding.' },
      { id: 'q3', kind: 'scale', notObserved: true, title: 'Teamwork', text: 'Works well with nurses, allied health and colleagues; speaks up when needed.' },
      { id: 'q4', kind: 'scale', notObserved: true, title: 'Professionalism', text: 'Reliable, punctual, honest, takes responsibility.' },
      { id: 'q5', kind: 'scale', notObserved: true, title: 'Teaching and supervision', text: 'Teaching and supervision of juniors and students.' },
    ],
  },
  {
    id: 'comments', title: 'Comments',
    items: [
      { id: 'c1', kind: 'comment', title: 'One thing to keep doing' },
      { id: 'c2', kind: 'comment', title: 'One thing to work on' },
      { id: 'q6', kind: 'yesno', comment: 'c3', staffOnly: true, title: "Any concern about this resident's conduct or patient safety?",
        hint: 'Seen by the programme directors and coordinators only.' },
    ],
  },
];
export const ITEMS = SECTIONS.flatMap(s => s.items);
export const SCALE_ITEMS = ITEMS.filter(i => i.kind === 'scale');
export const CONCERN = ITEMS.find(i => i.kind === 'yesno' && i.staffOnly);
// comment slots shown in the CCC summary (the concern's comment is kept apart, for PDs and PCs)
export const SUMMARY_COMMENTS = ITEMS.filter(i => i.kind === 'comment').map(i => ({ slot: i.id, title: i.title }));

export const PRIVACY = 'Your answers are seen by the programme staff; the resident sees only a summary, without names.';
