// Turn openfootball placeholder codes into friendlier labels until the bracket
// resolves and the daily sync replaces them with real team names.
export function prettyTeam(code) {
  if (!code) return 'TBD';
  let m;
  if ((m = code.match(/^1([A-L])$/))) return `Winner ${m[1]}`;
  if ((m = code.match(/^2([A-L])$/))) return `2nd ${m[1]}`;
  if (/^3[A-L/]+$/.test(code)) return '3rd place';
  if ((m = code.match(/^W(\d+)$/))) return `Winner of M${m[1]}`;
  if ((m = code.match(/^L(\d+)$/))) return `Loser of M${m[1]}`;
  return code;
}

// A "real" team (not a placeholder) — used to know whether a knockout slot is
// concrete enough to bet on meaningfully.
export function isRealTeam(code) {
  return !!code && code !== 'TBD' && !/^[123][A-L/]+$/.test(code) && !/^[WL]\d+$/.test(code);
}

export const STAGE_LABEL = {
  group: 'Group stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  '3rd': 'Third place',
  Final: 'Final',
};

export function kickoffParts(iso) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    dayKey: d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }),
  };
}

// upcoming = still open for bets; locked = kicked off, no result yet; played = result in.
export function matchState(match, now = Date.now()) {
  const started = new Date(match.kickoff).getTime() <= now;
  if (!started) return 'upcoming';
  if (match.home_score != null && match.away_score != null) return 'played';
  return 'locked';
}
