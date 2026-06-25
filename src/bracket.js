// Resolve knockout-bracket placeholders into real team names using the group
// results we already have. The openfootball feed fills in group *winners*
// (1A, 1E, ...) but usually leaves runner-up and third-place slots as codes
// like "2A" or "3A/B/C/D/F", so the knockout games never open for betting.
// This computes each group's table and substitutes the concrete teams for the
// simple "1A" / "2B" slots once that group has finished. Best-third combos
// (e.g. "3A/B/C/D/F") and "W##/L##" winner/loser slots are left as-is — those
// depend on cross-group ranking or later results and resolve on their own.

const GROUPS = 'ABCDEFGHIJKL'.split('');

function emptyRow(team) {
  return { team, played: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

// Build sorted standings per group from the played group matches.
export function groupTables(matches) {
  const tables = {};
  for (const g of GROUPS) tables[g] = new Map();

  for (const m of matches) {
    if (m.stage !== 'group' || !m.group_label) continue;
    const t = (tables[m.group_label] ||= new Map());
    if (!t.has(m.home_team)) t.set(m.home_team, emptyRow(m.home_team));
    if (!t.has(m.away_team)) t.set(m.away_team, emptyRow(m.away_team));
    if (m.home_score == null || m.away_score == null) continue;

    const h = t.get(m.home_team);
    const a = t.get(m.away_team);
    h.played++; a.played++;
    h.gf += m.home_score; h.ga += m.away_score;
    a.gf += m.away_score; a.ga += m.home_score;
    if (m.home_score > m.away_score) { h.pts += 3; }
    else if (m.home_score < m.away_score) { a.pts += 3; }
    else { h.pts += 1; a.pts += 1; }
  }

  const out = {};
  for (const g of GROUPS) {
    const rows = [...tables[g].values()];
    for (const r of rows) r.gd = r.gf - r.ga;
    // FIFA primary tiebreakers: points, goal difference, goals scored.
    // (Exotic head-to-head ties aren't modelled; alphabetical as last resort.)
    rows.sort(
      (x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team),
    );
    out[g] = rows;
  }
  return out;
}

function groupComplete(matches, g) {
  const gm = matches.filter((m) => m.stage === 'group' && m.group_label === g);
  return gm.length >= 6 && gm.every((m) => m.home_score != null && m.away_score != null);
}

// Return a copy of `matches` with simple "1A"/"2B"-style knockout slots replaced
// by the real qualified teams wherever that group has finished.
export function resolveBracket(matches) {
  const tables = groupTables(matches);
  const complete = {};
  for (const g of GROUPS) complete[g] = groupComplete(matches, g);

  const resolve = (code) => {
    const m = /^([12])([A-L])$/.exec(code || ''); // only 1st / 2nd of a single group
    if (!m) return code;
    const g = m[2];
    if (!complete[g]) return code;
    const row = tables[g]?.[Number(m[1]) - 1];
    return row ? row.team : code;
  };

  return matches.map((mt) =>
    mt.stage === 'group'
      ? mt
      : { ...mt, home_team: resolve(mt.home_team), away_team: resolve(mt.away_team) },
  );
}
