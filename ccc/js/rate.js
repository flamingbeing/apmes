// APMES CCC, the rater's page (/ccc/rate/#<round>/<id>): someone a resident nominated gives multisource feedback
// through the one-time link a coordinator emailed them. No sign-in: the rules let anyone holding the link read that one
// invite and answer once while the round is open (logbook/firestore.rules, "CCC 360"). The questions are data
// (msf-form.js). Typing is kept on this device until Submit; everything shown is put on the page as text only.
// With ?demo: the same page against this browser's demo store (the coordinators' demo makes the links).

import { h, fill, cloud, errText } from '../../evals/js/ui-core.js';
import { GROUP, parseRateHash, cleanAnswers, answerProblems, responseDoc, declineDoc } from './model.js';
import { SECTIONS, SCALE, NOT_OBSERVED, PRIVACY, COMMENT_MAX, REASON_MAX } from './msf-form.js';
import * as store from './store.js';

const app = document.getElementById('app');
const sub = document.getElementById('sub');
sub.textContent = 'Demo'; sub.hidden = !cloud.demo;

const NS = cloud.demo ? 'ccc-demo-rate' : 'ccc-rate';
const get = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const del = k => { try { localStorage.removeItem(k); } catch {} };

let link = null;       // { round, id }
let invite = null;
let raw = { answers: {}, comments: {} };
const draftKey = () => `${NS}-draft-${link.round}-${link.id}`;
const doneKey = () => `${NS}-done-${link.round}-${link.id}`;

function message(title, ...text) {
  document.title = `${title} · Multisource feedback`;
  fill(app, h('div', { class: 'e-stack rt-col' }, h('section', { class: 'e-card rt-done', role: 'status' }, h('h2', { class: 'e-h2' }, title), text.map(t => h('p', {}, t)))));
  window.scrollTo(0, 0);
}
const unknown = () => message('This link doesn’t work',
  'It may be cut short or mistyped, or no longer in use. Please ask the programme coordinator who emailed you for a new link.');
const used = () => message('This link has already been used',
  'Feedback from this link is already in, or this round has closed. Thank you. If you think that’s wrong, reply to the coordinator’s email.');
const done = (declined, name) => message(declined ? 'Thank you for letting us know' : 'Thank you',
  declined ? `The coordinators will see that you can’t give feedback for ${name}. You can close this page.`
    : `Your feedback for ${name} is sent. You can close this page.`);

async function start() {
  link = parseRateHash(location.hash);
  if (!link) return unknown();
  const was = get(doneKey());
  try { invite = await store.getInvite(link.round, link.id); }
  catch (e) { return message('Couldn’t open the form', 'Check that you are online, then reload this page.', errText(e)); }
  if (was === 'used') return used();
  if (was) return done(was === 'declined', invite?.residentName || 'the resident');
  if (!invite) return unknown();
  raw = cleanAnswers(get(draftKey()) || {});
  form();
}

// ---------- the form ----------

function form() {
  const name = invite.residentName;
  const group = (GROUP[invite.group] || GROUP.other).one;
  document.title = `Feedback for ${name} · Multisource feedback`;
  const saved = h('p', { class: 'rt-saved', 'aria-live': 'polite' });
  const keep = () => { put(draftKey(), { ...raw, at: Date.now() }); saved.textContent = 'Saved on this device. Not sent yet.'; };
  const problemsBox = h('div', { class: 'e-alert', role: 'alert', hidden: true });
  const qs = {};

  const radio = (it, value, label, extra = '') => h('label', { class: 'e-radio' + extra },
    h('input', { type: 'radio', name: it.id, value: String(value), checked: raw.answers[it.id] === value, onchange: () => { raw.answers[it.id] = value; qs[it.id]?.classList.remove('is-error'); keep(); } }),
    h('span', { class: 'e-radio__text' }, label));
  const textarea = (slot, label, hint, max = COMMENT_MAX) => {
    const id = 'rt-' + slot;
    return [h('label', { class: 'e-label', for: id }, label), hint ? h('p', { class: 'e-q__help', id: id + '-h' }, hint) : null,
      h('textarea', { class: 'e-textarea', id, maxlength: max, rows: 4, 'aria-describedby': hint ? id + '-h' : null, value: raw.comments[slot] || '',
        oninput: e => { raw.comments[slot] = e.target.value; keep(); } })];
  };
  const question = it => {
    if (it.kind === 'comment') return h('div', { class: 'e-q rt-q' }, textarea(it.id, `${it.title} (optional)`, it.hint));
    const helpId = `rt-${it.id}-help`;
    const opts = it.kind === 'scale'
      ? [...SCALE.map(s => radio(it, s.value, s.label)), it.notObserved ? radio(it, NOT_OBSERVED.value, NOT_OBSERVED.label, ' e-radio--na') : null]
      : [radio(it, 'yes', 'Yes'), radio(it, 'no', 'No')];
    const box = h('fieldset', { class: 'e-q rt-q', 'aria-describedby': it.text || it.hint ? helpId : null },
      h('legend', {}, h('span', { class: 'e-q__label' }, it.title)),
      it.text || it.hint ? h('p', { class: 'e-q__help', id: helpId }, it.text || it.hint) : null,
      h('div', { class: 'e-radios' }, opts),
      it.comment ? textarea(it.comment, 'If yes, what happened? (optional)', '') : null);
    qs[it.id] = box;
    return box;
  };

  let busy = false;
  const send = async (doc, declined, btn) => {
    if (busy) return;
    busy = true; btn.disabled = true; const was = btn.textContent; btn.textContent = 'Sending…';
    try {
      await store.submitResponse(link.round, link.id, doc);   // a plain await: "sent" means the server has it
      put(doneKey(), declined ? 'declined' : 'done'); del(draftKey());
      done(declined, name);
    } catch (e) {
      busy = false; btn.disabled = false; btn.textContent = was;
      if (e?.code === 'used') { put(doneKey(), 'used'); del(draftKey()); return used(); }
      problemsBox.hidden = false; fill(problemsBox, 'Couldn’t send it. Your answers are still on this device; check that you are online and try again. ', errText(e));
      problemsBox.scrollIntoView({ block: 'center' });
    }
  };
  const submit = e => {
    const missing = answerProblems(raw);
    if (missing.length) {
      problemsBox.hidden = false;
      fill(problemsBox, h('b', {}, 'Please answer every rating (“Not observed” is fine):'), h('ul', { class: 'rt-problems' }, missing.map(t => h('li', {}, t))));
      for (const s of SECTIONS) for (const it of s.items) if (missing.includes(it.title)) qs[it.id]?.classList.add('is-error');
      problemsBox.scrollIntoView({ block: 'center' });
      return;
    }
    problemsBox.hidden = true;
    send(responseDoc(raw), false, e.currentTarget);
  };

  // Decline: an optional reason, then a second tap
  const reason = h('textarea', { class: 'e-textarea', id: 'rt-reason', maxlength: REASON_MAX, rows: 3 });
  const declineBox = h('section', { class: 'e-card', hidden: true, 'aria-labelledby': 'rt-decline-h' },
    h('h2', { class: 'e-h2', id: 'rt-decline-h', style: 'margin-top:0' }, 'Decline'),
    h('p', { class: 'e-small' }, `If you haven’t worked with ${name} enough, or can’t give feedback for another reason, let the coordinators know. Nothing you typed above is sent.`),
    h('label', { class: 'e-label', for: 'rt-reason' }, 'Reason (optional)'), reason,
    h('div', { class: 'rt-bar', style: 'margin-top:12px' },
      h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: () => { declineBox.hidden = true; } }, 'Back to the form'),
      h('button', { class: 'a-btn a-btn--danger', type: 'button', onclick: e => send(declineDoc(reason.value), true, e.currentTarget) }, 'Decline')));

  fill(app, h('div', { class: 'e-stack rt-col' },
    h('section', { class: 'e-card rt-intro' },
      h('h2', { class: 'e-h2' }, `Feedback for ${name}`),
      h('p', {}, `${name} is an anaesthesia resident. Please rate what you have seen of their work.`),
      h('ul', { class: 'rt-facts' }, h('li', {}, 'You are answering as: ', h('b', {}, group)), h('li', {}, 'About 5 minutes')),
      h('p', { class: 'rt-private' }, PRIVACY)),
    SECTIONS.map(s => [h('h2', { class: 'rt-section' }, s.title), h('div', { class: 'e-qgroup' }, s.items.map(question))]),
    problemsBox,
    h('div', { class: 'rt-bar' },
      h('button', { class: 'a-btn', type: 'button', onclick: submit }, 'Submit feedback'),
      h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: () => { declineBox.hidden = false; reason.focus(); } }, 'I can’t give feedback')),
    saved,
    declineBox));
  if (Object.keys(raw.answers).length || Object.keys(raw.comments).length) saved.textContent = 'Your earlier answers on this device are back. Not sent yet.';
}

window.addEventListener('hashchange', () => location.reload());
start();
