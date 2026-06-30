// Shared, dependency-free parser for the openfootball worldcup.json 2026 feed.
// Used by both the build-time schema generator (scripts/gen-schema.mjs) and the
// daily sync serverless function (api/sync.js) so the two never drift apart.

export const OPENFOOTBALL_2026_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const STAGE_BY_ROUND = {
  'Round of 32': 'R32',
  'Round of 16': 'R16',
  'Quarter-final': 'QF',
  'Semi-final': 'SF',
  'Match for third place': '3rd',
  Final: 'Final',
};

// "2026-06-11" + "13:00 UTC-6"  ->  ISO UTC string "2026-06-11T19:00:00.000Z"
export function toUtcIso(date, time) {
  if (!date) return null;
  const t = (time || '12:00').trim();
  const hm = t.match(/(\d{1,2}):(\d{2})/);
  const off = t.match(/UTC([+-]\d{1,2})/i);
  const hh = hm ? hm[1].padStart(2, '0') : '12';
  const mm = hm ? hm[2] : '00';
  let offset = '+00:00';
  if (off) {
    const sign = off[1][0];
    const num = String(Math.abs(parseInt(off[1], 10))).padStart(2, '0');
    offset = `${sign}${num}:00`;
  }
  const d = new Date(`${date}T${hh}:${mm}:00${offset}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function stageFor(round) {
  if (STAGE_BY_ROUND[round]) return STAGE_BY_ROUND[round];
  if (round && round.startsWith('Matchday')) return 'group';
  return 'group';
}

// Returns a normalized array of matches keyed by a stable match_no (1..104,
// the feed's natural order, which lines up with openfootball's own `num`).
export function parseFixtures(data) {
  const raw = (data && data.matches) || [];
  return raw.map((m, i) => {
    const s = m.score || {};
    const ft = Array.isArray(s.ft) ? s.ft : null;
    const et = Array.isArray(s.et) ? s.et : null; // after extra time, if played
    const pen = Array.isArray(s.p) ? s.p : null;  // penalty shootout, if played
    const final = et || ft;                       // final outfield score
    return {
      match_no: typeof m.num === 'number' ? m.num : i + 1,
      stage: stageFor(m.round),
      group_label: m.group ? m.group.replace(/^Group\s+/i, '') : null,
      home_team: m.team1 || 'TBD',
      away_team: m.team2 || 'TBD',
      kickoff: toUtcIso(m.date, m.time),
      home_score: final ? final[0] : null,
      away_score: final ? final[1] : null,
      pen_home: pen ? pen[0] : null,
      pen_away: pen ? pen[1] : null,
    };
  });
}
