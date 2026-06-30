// Supabase Edge Function: daily World Cup 2026 sync.
//
// Fetches the free, no-key openfootball feed and upserts fixtures + results into
// the `matches` table using the service role (bypasses RLS). It is triggered by
// the pg_cron schedule (see supabase/cron.sql) and by the app's "Sync results
// now" button — so syncing no longer depends on Vercel and works on any host
// (GitHub Pages, Vercel, a Russian static host, ...).
//
// Deploy with JWT verification OFF (Dashboard → Edge Functions → this function →
// Details → "Verify JWT" disabled), so the cron call and browser preflight work
// without a token. It only ever writes public match data, so this is safe.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENFOOTBALL_2026_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

const STAGE_BY_ROUND: Record<string, string> = {
  "Round of 32": "R32",
  "Round of 16": "R16",
  "Quarter-final": "QF",
  "Semi-final": "SF",
  "Match for third place": "3rd",
  Final: "Final",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// "2026-06-11" + "13:00 UTC-6"  ->  ISO UTC string "2026-06-11T19:00:00.000Z"
function toUtcIso(date?: string, time?: string): string | null {
  if (!date) return null;
  const t = (time || "12:00").trim();
  const hm = t.match(/(\d{1,2}):(\d{2})/);
  const off = t.match(/UTC([+-]\d{1,2})/i);
  const hh = hm ? hm[1].padStart(2, "0") : "12";
  const mm = hm ? hm[2] : "00";
  let offset = "+00:00";
  if (off) {
    const sign = off[1][0];
    const num = String(Math.abs(parseInt(off[1], 10))).padStart(2, "0");
    offset = `${sign}${num}:00`;
  }
  const d = new Date(`${date}T${hh}:${mm}:00${offset}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function stageFor(round?: string): string {
  if (round && STAGE_BY_ROUND[round]) return STAGE_BY_ROUND[round];
  return "group";
}

// Mirror of lib/parseFixtures.js, kept in sync by hand (it's tiny and stable).
function parseFixtures(data: any) {
  const raw = (data && data.matches) || [];
  return raw.map((m: any, i: number) => {
    const s = m.score || {};
    const ft = Array.isArray(s.ft) ? s.ft : null;
    const et = Array.isArray(s.et) ? s.et : null; // after extra time, if played
    const pen = Array.isArray(s.p) ? s.p : null;  // penalty shootout, if played
    const final = et || ft;
    return {
      match_no: typeof m.num === "number" ? m.num : i + 1,
      stage: stageFor(m.round),
      group_label: m.group ? String(m.group).replace(/^Group\s+/i, "") : null,
      home_team: m.team1 || "TBD",
      away_team: m.team2 || "TBD",
      kickoff: toUtcIso(m.date, m.time),
      home_score: final ? final[0] : null,
      away_score: final ? final[1] : null,
      pen_home: pen ? pen[0] : null,
      pen_away: pen ? pen[1] : null,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, key, { auth: { persistSession: false } });

    const data = await fetch(OPENFOOTBALL_2026_URL, { cache: "no-store" }).then((r) => r.json());
    const fixtures = parseFixtures(data);

    // Don't wipe an already-known score if the feed temporarily lacks it.
    const { data: existing } = await db
      .from("matches")
      .select("match_no,home_score,away_score,pen_home,pen_away");
    const exMap = new Map((existing || []).map((m: any) => [m.match_no, m]));

    const rows = fixtures.map((f: any) => {
      const ex = exMap.get(f.match_no);
      return {
        ...f,
        home_score: f.home_score ?? ex?.home_score ?? null,
        away_score: f.away_score ?? ex?.away_score ?? null,
        pen_home: f.pen_home ?? ex?.pen_home ?? null,
        pen_away: f.pen_away ?? ex?.pen_away ?? null,
      };
    });

    const { error } = await db.from("matches").upsert(rows, { onConflict: "match_no" });
    if (error) return json({ error: error.message }, 500);

    return json({
      ok: true,
      updated: rows.length,
      withResults: rows.filter((r: any) => r.home_score != null).length,
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
