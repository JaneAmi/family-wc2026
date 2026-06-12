import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, supabaseReady } from './supabaseClient.js';
import { pointsFor, standings, hasResult, POINTS_EXACT } from './scoring.js';
import { prettyTeam, isRealTeam, STAGE_LABEL, kickoffParts, matchState } from './util.js';

const STAGE_ORDER = ['group', 'R32', 'R16', 'QF', 'SF', '3rd', 'Final'];
const ME_KEY = 'wc2026_me';

export default function App() {
  const [tab, setTab] = useState('matches');
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [predByKey, setPredByKey] = useState(new Map());
  const [me, setMe] = useState(() => Number(localStorage.getItem(ME_KEY)) || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const loadAll = useCallback(async () => {
    if (!supabaseReady) {
      setLoading(false);
      return;
    }
    setError('');
    const [pl, mt, pr] = await Promise.all([
      supabase.from('players').select('*').order('sort_order'),
      supabase.from('matches').select('*').order('match_no'),
      supabase.from('predictions').select('*'),
    ]);
    if (pl.error || mt.error || pr.error) {
      setError((pl.error || mt.error || pr.error).message);
      setLoading(false);
      return;
    }
    setPlayers(pl.data);
    setMatches(mt.data);
    const map = new Map();
    for (const p of pr.data) map.set(`${p.match_no}:${p.player_id}`, p);
    setPredByKey(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Keep "locked at kickoff" accurate without a reload.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const onFocus = () => {
      setNow(Date.now());
      loadAll();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadAll]);

  useEffect(() => {
    if (me) localStorage.setItem(ME_KEY, String(me));
  }, [me]);

  const savePrediction = useCallback(
    async (match_no, player_id, h, a) => {
      const row = {
        match_no,
        player_id,
        pred_home: h,
        pred_away: a,
        updated_at: new Date().toISOString(),
      };
      const { data, error: err } = await supabase
        .from('predictions')
        .upsert(row, { onConflict: 'match_no,player_id' })
        .select()
        .single();
      if (err) {
        // Most likely the RLS lock fired because the match already kicked off.
        await loadAll();
        throw err;
      }
      setPredByKey((prev) => {
        const next = new Map(prev);
        next.set(`${match_no}:${player_id}`, data);
        return next;
      });
    },
    [loadAll],
  );

  if (!supabaseReady) return <SetupNotice />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">⚽ Family Beats · World Cup 2026</div>
        <div className={me ? 'who' : 'who needpick'}>
          <label>I am:&nbsp;</label>
          <select value={me ?? ''} onChange={(e) => setMe(Number(e.target.value) || null)}>
            <option value="">— pick —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="ghost" onClick={loadAll} title="Refresh">
            ↻
          </button>
        </div>
      </header>

      <nav className="tabs">
        {[
          ['matches', 'Matches'],
          ['leaderboard', 'Leaderboard'],
          ['settings', 'Settings'],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {error && <div className="banner err">{error}</div>}
      {!loading && !me && (
        <div className="pickfirst">
          👆 <b>Step 1:</b> tap <b>“I am: — pick —”</b> at the top and choose your name to start
          placing bets.
        </div>
      )}
      {loading ? (
        <div className="loading">Loading…</div>
      ) : tab === 'matches' ? (
        <MatchesView
          players={players}
          matches={matches}
          predByKey={predByKey}
          me={me}
          now={now}
          onSave={savePrediction}
        />
      ) : tab === 'leaderboard' ? (
        <LeaderboardView players={players} matches={matches} predByKey={predByKey} />
      ) : (
        <SettingsView players={players} me={me} setMe={setMe} reload={loadAll} />
      )}

      <footer className="foot">
        Scores update automatically every day from open public World Cup data. Bets lock at
        kickoff. Exact score = 3 pts · correct result = 1 pt.
      </footer>
    </div>
  );
}

function MatchesView({ players, matches, predByKey, me, now, onSave }) {
  const [showFinished, setShowFinished] = useState(false);

  const active = useMemo(
    () => matches.filter((m) => matchState(m, now) !== 'played'),
    [matches, now],
  );
  const finished = useMemo(
    () =>
      matches
        .filter((m) => matchState(m, now) === 'played')
        .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)),
    [matches, now],
  );

  const byStage = useMemo(() => {
    const groups = {};
    for (const m of active) (groups[m.stage] ||= []).push(m);
    for (const s in groups) groups[s].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    return groups;
  }, [active]);

  const header = (
    <tr>
      <th className="mcol">Match</th>
      {players.map((p) => (
        <th key={p.id} className={p.id === me ? 'pcol mecol' : 'pcol'}>
          {p.name}
        </th>
      ))}
    </tr>
  );

  const table = (rows) => (
    <div className="tablewrap">
      <table className="grid">
        <thead>{header}</thead>
        <tbody>
          {rows.map((m) => (
            <MatchRow
              key={m.match_no}
              match={m}
              players={players}
              predByKey={predByKey}
              me={me}
              now={now}
              onSave={onSave}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="matches">
      {STAGE_ORDER.filter((s) => byStage[s]).map((stage) => (
        <section key={stage} className="stage">
          <h2>{STAGE_LABEL[stage]}</h2>
          {table(byStage[stage])}
        </section>
      ))}

      {finished.length > 0 && (
        <section className="stage finished">
          <button
            className="finished-toggle"
            onClick={() => setShowFinished((v) => !v)}
            aria-expanded={showFinished}
          >
            ✓ Finished matches ({finished.length}) {showFinished ? '⬆️' : '⬇️'}
          </button>
          {showFinished && table(finished)}
        </section>
      )}
    </div>
  );
}

function MatchRow({ match, players, predByKey, me, now, onSave }) {
  const state = matchState(match, now);
  const kp = kickoffParts(match.kickoff);
  const bettable = state === 'upcoming' && isRealTeam(match.home_team) && isRealTeam(match.away_team);

  return (
    <tr className={`mrow ${state}`}>
      <td className="mcol">
        <div className="teams">
          <span>{prettyTeam(match.home_team)}</span>
          <span className="vs">v</span>
          <span>{prettyTeam(match.away_team)}</span>
        </div>
        <div className="meta">
          {match.group_label ? `Group ${match.group_label} · ` : ''}
          {kp.date} {kp.time}
        </div>
        <div className="status">
          {state === 'played' ? (
            <span className="result">
              {match.home_score}–{match.away_score} <span className="ft">FT</span>
            </span>
          ) : state === 'locked' ? (
            <span className="badge locked">Locked</span>
          ) : (
            <span className="badge open">Open for bets</span>
          )}
        </div>
      </td>
      {players.map((p) => (
        <PredCell
          key={p.id}
          match={match}
          player={p}
          pred={predByKey.get(`${match.match_no}:${p.id}`)}
          editable={bettable && p.id === me}
          state={state}
          onSave={onSave}
        />
      ))}
    </tr>
  );
}

function PredCell({ match, player, pred, editable, state, onSave }) {
  const [h, setH] = useState(pred ? String(pred.pred_home) : '');
  const [a, setA] = useState(pred ? String(pred.pred_away) : '');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setH(pred ? String(pred.pred_home) : '');
    setA(pred ? String(pred.pred_away) : '');
  }, [pred]);

  const commit = async () => {
    if (h === '' || a === '') return;
    const nh = Math.max(0, Math.min(99, parseInt(h, 10)));
    const na = Math.max(0, Math.min(99, parseInt(a, 10)));
    if (pred && pred.pred_home === nh && pred.pred_away === na) return;
    try {
      setMsg('saving');
      await onSave(match.match_no, player.id, nh, na);
      setMsg('saved');
      setTimeout(() => setMsg(''), 1200);
    } catch (e) {
      setMsg('locked');
    }
  };

  if (editable) {
    return (
      <td className="pcol mecol">
        <div className="entry">
          <input
            type="number"
            min="0"
            max="99"
            value={h}
            onChange={(e) => setH(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span>–</span>
          <input
            type="number"
            min="0"
            max="99"
            value={a}
            onChange={(e) => setA(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </div>
        {msg && <div className={`hint ${msg === 'locked' ? 'err' : ''}`}>{msg}</div>}
      </td>
    );
  }

  if (!pred) {
    // Hide upcoming-but-empty as a quiet dash; a missed (locked) bet is clearer.
    return <td className="pcol empty">{state === 'upcoming' ? '·' : '—'}</td>;
  }

  const pts = pointsFor(pred, match);
  const cls = pts == null ? '' : pts === POINTS_EXACT ? 'exact' : pts > 0 ? 'close' : 'miss';
  return (
    <td className={`pcol ${cls}`}>
      <div className="pred">
        {pred.pred_home}–{pred.pred_away}
      </div>
      {pts != null && <div className="pts">+{pts}</div>}
    </td>
  );
}

function LeaderboardView({ players, matches, predByKey }) {
  const rows = useMemo(
    () => standings(players, matches, predByKey),
    [players, matches, predByKey],
  );
  const anyPlayed = matches.some(hasResult);
  return (
    <div className="leaderboard">
      <h2>Leaderboard</h2>
      {!anyPlayed && <p className="muted">No finished matches yet — points appear once results come in.</p>}
      <table className="board">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Points</th>
            <th>Exact</th>
            <th>Result</th>
            <th>Bets</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.player.id} className={i === 0 && r.points > 0 ? 'lead' : ''}>
              <td>{i + 1}</td>
              <td>{r.player.name}</td>
              <td className="big">{r.points}</td>
              <td>{r.exact}</td>
              <td>{r.correct}</td>
              <td>{r.played}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsView({ players, me, setMe, reload }) {
  const [names, setNames] = useState(() => Object.fromEntries(players.map((p) => [p.id, p.name])));
  const [saved, setSaved] = useState('');
  const [syncing, setSyncing] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    setNames(Object.fromEntries(players.map((p) => [p.id, p.name])));
  }, [players]);

  const saveName = async (id) => {
    const name = (names[id] || '').trim();
    if (!name) return;
    const { error } = await supabase.from('players').update({ name }).eq('id', id);
    setSaved(error ? error.message : 'Saved');
    setTimeout(() => setSaved(''), 1500);
    reload();
  };

  const addPlayer = async () => {
    const name = newName.trim();
    if (!name) return;
    const nextOrder = players.reduce((m, p) => Math.max(m, p.sort_order), 0) + 1;
    const { error } = await supabase.from('players').insert({ name, sort_order: nextOrder });
    setSaved(error ? error.message : `Added ${name}`);
    setNewName('');
    setTimeout(() => setSaved(''), 1500);
    reload();
  };

  const removePlayer = async (p) => {
    if (!window.confirm(`Remove ${p.name}? Their predictions will be deleted too.`)) return;
    const { error } = await supabase.from('players').delete().eq('id', p.id);
    if (!error && me === p.id) setMe(null);
    setSaved(error ? error.message : `Removed ${p.name}`);
    setTimeout(() => setSaved(''), 1500);
    reload();
  };

  const syncNow = async () => {
    setSyncing('Syncing…');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      setSyncing(res.ok ? `Synced ${body.updated ?? ''} matches` : `Failed: ${body.error || res.status}`);
      await reload();
    } catch (e) {
      setSyncing('Sync runs on the live site only.');
    }
    setTimeout(() => setSyncing(''), 4000);
  };

  return (
    <div className="settings">
      <h2>Players</h2>
      <p className="muted">
        Rename players, or add someone who wants to join. Everyone shares the same list.
      </p>
      {players.map((p) => {
        const changed = (names[p.id] ?? '').trim() !== p.name && (names[p.id] ?? '').trim() !== '';
        return (
          <div key={p.id} className="namerow">
            <input
              value={names[p.id] ?? ''}
              onChange={(e) => setNames((n) => ({ ...n, [p.id]: e.target.value }))}
              onBlur={() => saveName(p.id)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <button
              className="primary"
              title="Save this name"
              onClick={() => saveName(p.id)}
              disabled={!changed}
            >
              Rename
            </button>
            <button className={me === p.id ? 'ghost active' : 'ghost'} onClick={() => setMe(p.id)}>
              {me === p.id ? 'This is me' : 'Set as me'}
            </button>
            <button className="ghost danger" title="Remove player" onClick={() => removePlayer(p)}>
              ✕
            </button>
          </div>
        );
      })}
      <div className="namerow">
        <input
          placeholder="New player name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
        />
        <button className="primary" onClick={addPlayer} disabled={!newName.trim()}>
          + Add player
        </button>
      </div>
      {saved && <div className="hint">{saved}</div>}

      <h2 style={{ marginTop: 24 }}>Data</h2>
      <p className="muted">
        Real results sync automatically once a day. You can also pull the latest now.
      </p>
      <button className="primary" onClick={syncNow}>
        Sync results now
      </button>
      {syncing && <div className="hint">{syncing}</div>}
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">⚽ Family Beats · World Cup 2026</div>
      </header>
      <div className="banner">
        <h2>Almost there — connect the database</h2>
        <p>
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your
          Vercel project (or a local <code>.env</code>) and redeploy. See the README for the
          two-minute setup.
        </p>
      </div>
    </div>
  );
}
