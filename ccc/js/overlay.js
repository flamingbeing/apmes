// This device's unsent saves (writes.js, the coordinators' queue) put over what the server gave, so a screen shows what
// the coordinator just did even before it has been sent. Plain functions; the rater's page and the demo load them too, so
// nothing here may import the sync engine. `open`: the queue's entries not yet on the server, newest first.
const forRound = (open, kind, round) => open.filter(x => x.kind === kind && x.record.round === round);
// rounds by id: a round saved here and not sent yet shows (a newer copy of one the server has replaces it)
export function overlayRounds(rounds, open, toRound) {
  const out = new Map(rounds.map(r => [r.round, r]));
  for (const j of open.filter(x => x.kind === 'round').reverse()) out.set(j.record.round, toRound(j.record.round, j.record));
  return [...out.values()];
}
// reviews by email: marks saved here and not sent show; a resident whose nominees were deleted here is gone
export function overlayReviews(round, list, open) {
  const out = { ...list };
  for (const j of open.slice().reverse()) {
    const r = j.record; if (r.round !== round) continue;
    if (j.kind === 'nominees') delete out[r.email];
    else if (j.kind === 'review') out[r.email] = { ...(out[r.email] || {}), email: r.email, marks: r.marks, updatedAt: out[r.email]?.updatedAt || 0 };
  }
  return out;
}
export function overlayNominees(round, list, open) {
  const out = { ...list };
  for (const j of forRound(open, 'nominees', round)) delete out[j.record.email];
  return out;
}
// invites by id: links made here and not sent show (they work once the server has them)
export function overlayInvites(round, list, open) {
  const out = { ...list };
  for (const j of forRound(open, 'invite', round)) { const { id, round: _r, ...doc } = j.record; out[id] ||= { ...doc, createdAt: j.at || Date.now() }; }
  return out;
}

