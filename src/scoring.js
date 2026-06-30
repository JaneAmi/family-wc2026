// Scoring rules (tweak here): exact score = 3, correct outcome = 1, else 0.
export const POINTS_EXACT = 3;
export const POINTS_OUTCOME = 1;

export function hasResult(match) {
  return match && match.home_score != null && match.away_score != null;
}

// Was the match decided by a penalty shootout?
export function hadPenalties(match) {
  return match && match.pen_home != null && match.pen_away != null;
}

// The score used for scoring bets. For knockout games decided on penalties we
// score against the shootout result (e.g. 3–4), so an exact bet on the shootout
// score earns the full points and the winner is taken from the penalties.
export function effectiveScore(match) {
  if (hadPenalties(match)) return { home: match.pen_home, away: match.pen_away };
  return { home: match.home_score, away: match.away_score };
}

// Points a single prediction earns for a finished match. null if not scorable yet.
export function pointsFor(pred, match) {
  if (!pred || !hasResult(match)) return null;
  const { pred_home: ph, pred_away: pa } = pred;
  const { home: ah, away: aa } = effectiveScore(match);
  if (ph === ah && pa === aa) return POINTS_EXACT;
  if (Math.sign(ph - pa) === Math.sign(ah - aa)) return POINTS_OUTCOME;
  return 0;
}

// Per-player totals + exact/outcome counts, sorted high to low.
export function standings(players, matches, predByKey) {
  const matchById = new Map(matches.map((m) => [m.match_no, m]));
  const rows = players.map((p) => {
    let points = 0,
      exact = 0,
      correct = 0,
      played = 0;
    for (const m of matches) {
      if (!hasResult(m)) continue;
      const pred = predByKey.get(`${m.match_no}:${p.id}`);
      if (!pred) continue;
      const pts = pointsFor(pred, matchById.get(m.match_no));
      played += 1;
      points += pts;
      if (pts === POINTS_EXACT) exact += 1;
      else if (pts === POINTS_OUTCOME) correct += 1;
    }
    return { player: p, points, exact, correct, played };
  });
  rows.sort((a, b) => b.points - a.points || b.exact - a.exact || a.player.sort_order - b.player.sort_order);
  return rows;
}
