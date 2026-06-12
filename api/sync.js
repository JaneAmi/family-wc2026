// Daily sync: pull the latest WC2026 fixtures + results from the free, no-key
// openfootball feed and upsert them into Supabase. Triggered by the Vercel cron
// (see vercel.json) and by the "Sync results now" button in Settings.
import { createClient } from '@supabase/supabase-js';
import { parseFixtures, OPENFOOTBALL_2026_URL } from '../lib/parseFixtures.js';

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    // Optional: if CRON_SECRET is set, require it (Vercel cron sends it automatically).
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const db = createClient(url, key, { auth: { persistSession: false } });

    const data = await fetch(OPENFOOTBALL_2026_URL, { cache: 'no-store' }).then((r) => r.json());
    const fixtures = parseFixtures(data);

    // Don't wipe an already-known score if the feed temporarily lacks it.
    const { data: existing } = await db.from('matches').select('match_no,home_score,away_score');
    const exMap = new Map((existing || []).map((m) => [m.match_no, m]));

    const rows = fixtures.map((f) => {
      const ex = exMap.get(f.match_no);
      return {
        ...f,
        home_score: f.home_score ?? ex?.home_score ?? null,
        away_score: f.away_score ?? ex?.away_score ?? null,
      };
    });

    const { error } = await db.from('matches').upsert(rows, { onConflict: 'match_no' });
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      ok: true,
      updated: rows.length,
      withResults: rows.filter((r) => r.home_score != null).length,
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
