import { useState, useEffect } from 'react'
import { admin, tournament, brackets, picks as picksApi } from '../api'

export default function Admin() {
  const [settings, setSettings] = useState({})
  const [groups, setGroups] = useState({})
  const [users, setUsers] = useState([])
  const [groupResults, setGroupResults] = useState({}) // { A: { first, second, third, third_advanced } }
  const [lockTime, setLockTime] = useState('')
  const [tab, setTab] = useState('scores')
  const [msg, setMsg] = useState('')

  // Group result form state
  const [groupForm, setGroupForm] = useState({ group: 'A', first: '', second: '', third: '', third_advanced: false })

  async function loadResults() {
    const r = await brackets.results()
    setGroupResults(r.data.groups || {})
    return r.data.groups || {}
  }

  useEffect(() => {
    async function load() {
      const [s, t, u] = await Promise.all([admin.settings(), tournament.data(), admin.users()])
      setSettings(s.data)
      setGroups(t.data.groups)
      setUsers(u.data)
      setLockTime(s.data.lock_time || '')
      await loadResults()
    }
    load()
  }, [])

  // Count groups whose 3rd-place team is marked advanced (max 8)
  const advancedCount = Object.values(groupResults).filter(g => g.third_advanced).length

  function flash(text) {
    setMsg(text)
    setTimeout(() => setMsg(''), 3000)
  }

  async function handleLock(locked) {
    await admin.lock(locked, lockTime)
    setSettings(s => ({ ...s, brackets_locked: locked ? 'true' : 'false', lock_time: lockTime }))
    flash(locked ? '🔒 Brackets locked' : '🔓 Brackets unlocked')
  }

  async function handleGroupResult(e) {
    e.preventDefault()
    try {
      await admin.groupResult(groupForm.group, groupForm.first, groupForm.second, groupForm.third, groupForm.third_advanced)
      await loadResults()
      flash(`✓ Group ${groupForm.group} results saved`)
    } catch (err) {
      flash(err.response?.data?.error || 'Failed to save group result')
    }
  }

  async function handlePromote(user_id) {
    await admin.promote(user_id)
    setUsers(u => u.map(user => user.id === user_id ? { ...user, is_admin: 1 } : user))
    flash('✓ User promoted to admin')
  }

  const [pwUser, setPwUser] = useState(null)
  const [pwValue, setPwValue] = useState('')
  async function handleSetPassword() {
    try {
      await admin.setPassword(pwUser.id, pwValue)
      setUsers(u => u.map(user => user.id === pwUser.id ? { ...user, reset_requested: false } : user))
      flash(`✓ Password set for ${pwUser.username}`)
    } catch (err) {
      flash(err.response?.data?.error || 'Failed to set password')
    } finally {
      setPwUser(null); setPwValue('')
    }
  }

  // ── Score picks / match scores state ─────────────────────────────────────
  const [matchScores,     setMatchScores]     = useState({})  // { match_id: { home_goals, away_goals, home_team, away_team } }
  const [scoreRound,      setScoreRound]      = useState('group_A')
  const [scoreForm,       setScoreForm]       = useState({})  // { match_id: { home: '', away: '', ht: '', at: '' } }
  const [allGroupMatches, setAllGroupMatches] = useState({})  // { A: [...], B: [...] }
  const [picksLocked,     setPicksLocked]     = useState(false)
  const [picksLockTime,   setPicksLockTime]   = useState('')
  const [knockoutOpen,    setKnockoutOpen]    = useState(false)

  async function loadMatchScores() {
    const res = await admin.matchScores()
    const map = {}
    for (const s of res.data) map[s.match_id] = s
    setMatchScores(map)
    return map
  }

  useEffect(() => {
    async function loadMatchesData() {
      const t = await tournament.data()
      // Build group match pairs the same way server does
      const letters = Object.keys(t.data.groups)
      const gm = {}
      letters.forEach((letter, gi) => {
        const teams = t.data.groups[letter].teams
        const base = gi * 6 + 1
        const [t1,t2,t3,t4] = teams
        gm[letter] = [
          { id: `m${base}`,   home: t1, away: t2 },
          { id: `m${base+1}`, home: t3, away: t4 },
          { id: `m${base+2}`, home: t1, away: t3 },
          { id: `m${base+3}`, home: t2, away: t4 },
          { id: `m${base+4}`, home: t1, away: t4 },
          { id: `m${base+5}`, home: t2, away: t3 },
        ]
      })
      setAllGroupMatches(gm)
    }
    loadMatchesData()
    loadMatchScores()
  }, [])

  // Sync picks lock settings from main settings load
  useEffect(() => {
    if (settings.picks_locked !== undefined) {
      setPicksLocked(settings.picks_locked === 'true')
      setPicksLockTime(settings.picks_lock_time || '')
      setKnockoutOpen(settings.knockout_picks_open === 'true')
    }
  }, [settings.picks_locked, settings.picks_lock_time, settings.knockout_picks_open])

  async function handlePicksLock(locked) {
    await admin.picksLock(locked, picksLockTime)
    setPicksLocked(locked)
    flash(locked ? '🔒 Score picks locked' : '🔓 Score picks unlocked')
  }

  async function handleKnockoutOpen(open) {
    await admin.knockoutOpen(open)
    setKnockoutOpen(open)
    flash(open ? '⚡ Knockout Phase 2 opened!' : '⏸ Knockout picks closed')
  }

  async function handleSaveMatchScore(matchId, homeGoals, awayGoals, homeTeam, awayTeam) {
    if (homeGoals === '' || awayGoals === '') return
    await admin.matchScore(matchId, parseInt(homeGoals), parseInt(awayGoals), homeTeam || undefined, awayTeam || undefined)
    await loadMatchScores()
    flash(`✓ Score saved for ${matchId}`)
  }

  async function handleDeleteMatchScore(matchId) {
    await admin.deleteMatchScore(matchId)
    await loadMatchScores()
    setScoreForm(f => { const n = { ...f }; delete n[matchId]; return n })
    flash(`✓ Score cleared for ${matchId}`)
  }

  const [fetching, setFetching] = useState(false)
  async function handleToggleAutoFetch(enabled) {
    await admin.setAutoFetch(enabled)
    setSettings(s => ({ ...s, auto_fetch: enabled ? 'true' : 'false' }))
    flash(enabled ? '🔄 Auto-fetch enabled' : '⏸ Auto-fetch paused')
  }
  async function handleFetchNow() {
    setFetching(true)
    try {
      const res = await admin.fetchNow()
      const s = res.data.summary
      await loadResults()
      const settingsRes = await admin.settings()
      setSettings(settingsRes.data)
      flash(`✓ Synced — ${s.groups.length} groups, ${s.knockout.length} knockout matches`)
    } catch (err) {
      flash(err.response?.data?.error || 'Fetch failed')
    } finally {
      setFetching(false)
    }
  }

  const isLocked = settings.brackets_locked === 'true'
  const autoFetchOn = settings.auto_fetch === 'true'
  const apiConfigured = !!settings.api_configured
  const lastStatus = (() => {
    try { return settings.last_fetch_status ? JSON.parse(settings.last_fetch_status) : null }
    catch { return null }
  })()
  const groupLetters = Object.keys(groups).sort()

  // ── Match scores tab helpers (computed once, used in JSX below) ──────────
  const scoreGroupLetters = Object.keys(allGroupMatches).sort()
  const scoreKoRounds = [
    { key: 'R32',   label: 'Round of 32',   ids: Array.from({length:16}, (_,i) => `m${73+i}`) },
    { key: 'R16',   label: 'Round of 16',   ids: Array.from({length:8},  (_,i) => `m${89+i}`) },
    { key: 'QF',    label: 'Quarter-finals',ids: Array.from({length:4},  (_,i) => `m${97+i}`) },
    { key: 'SF',    label: 'Semi-finals',   ids: ['m101','m102'] },
    { key: 'Final', label: 'Final',         ids: ['m104'] },
  ]
  const scoreIsGroup = scoreRound.startsWith('group_')
  const scoreGroupLetter = scoreIsGroup ? scoreRound.replace('group_', '') : null
  const scoreKoRound = !scoreIsGroup ? scoreKoRounds.find(r => r.key === scoreRound) : null
  const scoreMatches = scoreIsGroup
    ? (allGroupMatches[scoreGroupLetter] || [])
    : (scoreKoRound ? scoreKoRound.ids.map(id => ({ id, home: 'TBD', away: 'TBD' })) : [])

  const tabs = [
    { key: 'scores',   label: '⚽ Match Scores' },
    { key: 'sync',     label: '🔄 Live Scores API' },
    { key: 'picks',    label: '🔒 Picks Lock' },
    { key: 'users',    label: '👥 Users' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">⚙ Admin Panel</h1>

      {msg && (
        <div className="mb-4 bg-green-900/50 border border-green-700 text-green-300 px-4 py-2 rounded-lg text-sm">
          {msg}
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-fifa-gold text-gray-950' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── MATCH SCORES tab ────────────────────────────────────────── */}
      {tab === 'scores' && (
        <div className="card">
          <p className="text-sm text-gray-400 mb-4">
            Enter actual match scores as each game is played. Points recalculate instantly.
          </p>

          {/* Round / group selector */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Round / Group</label>
            <select className="input" value={scoreRound} onChange={e => setScoreRound(e.target.value)}>
              <optgroup label="Group Stage">
                {scoreGroupLetters.map(l => (
                  <option key={l} value={'group_' + l}>Group {l}</option>
                ))}
              </optgroup>
              <optgroup label="Knockout">
                {scoreKoRounds.map(r => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Match rows */}
          <div className="space-y-2">
            {scoreMatches.map(m => {
              const saved  = matchScores[m.id]
              const f      = scoreForm[m.id] || {}
              const homeDisp = saved && saved.home_team ? saved.home_team : m.home
              const awayDisp = saved && saved.away_team ? saved.away_team : m.away
              const hasSavedScore = saved && saved.home_goals != null
              return (
                <div
                  key={m.id}
                  className={
                    'rounded-lg border p-3 ' +
                    (hasSavedScore ? 'border-green-800/40 bg-green-900/10' : 'border-gray-700/50 bg-gray-800/40')
                  }
                >
                  <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                    <span className="font-mono text-gray-400">{m.id}</span>
                    {hasSavedScore && (
                      <span className="text-green-400 font-bold">
                        {saved.home_goals}–{saved.away_goals}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        {scoreIsGroup ? 'Home' : 'Home Team'}
                      </label>
                      {scoreIsGroup ? (
                        <div className="input text-sm py-1.5 text-gray-300 bg-gray-800/60 cursor-not-allowed">
                          {m.home}
                        </div>
                      ) : (
                        <input
                          className="input text-sm py-1.5"
                          placeholder={homeDisp !== 'TBD' ? homeDisp : 'Home team name'}
                          value={f.ht != null ? f.ht : (saved && saved.home_team ? saved.home_team : '')}
                          onChange={e => setScoreForm(sf => ({ ...sf, [m.id]: { ...(sf[m.id] || {}), ht: e.target.value } }))}
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        {scoreIsGroup ? 'Away' : 'Away Team'}
                      </label>
                      {scoreIsGroup ? (
                        <div className="input text-sm py-1.5 text-gray-300 bg-gray-800/60 cursor-not-allowed">
                          {m.away}
                        </div>
                      ) : (
                        <input
                          className="input text-sm py-1.5"
                          placeholder={awayDisp !== 'TBD' ? awayDisp : 'Away team name'}
                          value={f.at != null ? f.at : (saved && saved.away_team ? saved.away_team : '')}
                          onChange={e => setScoreForm(sf => ({ ...sf, [m.id]: { ...(sf[m.id] || {}), at: e.target.value } }))}
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="number" min="0" max="30"
                        className="input w-16 text-center font-bold py-1.5 text-sm"
                        placeholder="0"
                        value={f.home != null ? f.home : (saved && saved.home_goals != null ? saved.home_goals : '')}
                        onChange={e => setScoreForm(sf => ({ ...sf, [m.id]: { ...(sf[m.id] || {}), home: e.target.value } }))}
                      />
                      <span className="text-gray-500 font-bold">–</span>
                      <input
                        type="number" min="0" max="30"
                        className="input w-16 text-center font-bold py-1.5 text-sm"
                        placeholder="0"
                        value={f.away != null ? f.away : (saved && saved.away_goals != null ? saved.away_goals : '')}
                        onChange={e => setScoreForm(sf => ({ ...sf, [m.id]: { ...(sf[m.id] || {}), away: e.target.value } }))}
                      />
                    </div>
                    <button
                      onClick={() => handleSaveMatchScore(
                        m.id,
                        f.home != null ? f.home : (saved ? saved.home_goals : ''),
                        f.away != null ? f.away : (saved ? saved.away_goals : ''),
                        f.ht != null ? f.ht : (saved ? saved.home_team : null),
                        f.at != null ? f.at : (saved ? saved.away_team : null)
                      )}
                      className="btn-primary text-sm py-1.5 px-3"
                    >
                      Save
                    </button>
                    {hasSavedScore && (
                      <button
                        onClick={() => handleDeleteMatchScore(m.id)}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SCORE PICKS LOCK tab ─────────────────────────────────────── */}
      {tab === 'picks' && (
        <div className="space-y-4">
          {/* Phase 1 — Group Stage picks */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-white">Phase 1 — Group Stage Picks</h3>
            <p className="text-sm text-gray-400">
              Lock picks before the first match kicks off. After locking, players
              can still see their own picks and the leaderboard — but can't change them.
            </p>
            <p className="text-sm">
              Status:{' '}
              <span className={picksLocked ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>
                {picksLocked ? '🔒 Locked' : '🔓 Open'}
              </span>
            </p>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Auto-lock at (optional)</label>
              <input
                type="datetime-local"
                className="input"
                value={picksLockTime}
                onChange={e => setPicksLockTime(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handlePicksLock(true)}
                disabled={picksLocked}
                className="bg-red-700 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Lock Picks
              </button>
              <button
                onClick={() => handlePicksLock(false)}
                disabled={!picksLocked}
                className="bg-green-700 hover:bg-green-600 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Unlock Picks
              </button>
            </div>
          </div>

          {/* Phase 2 — Knockout */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-white">Phase 2 — Knockout Picks</h3>
            <p className="text-sm text-gray-400">
              Open the knockout phase after the group stage ends. Players get a fresh
              start and can predict scores for all 32 knockout matches — even if their
              teams were eliminated.
            </p>
            <p className="text-sm">
              Knockout picks:{' '}
              <span className={knockoutOpen ? 'text-green-400 font-bold' : 'text-gray-400 font-bold'}>
                {knockoutOpen ? '⚡ Open' : '⏸ Closed'}
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleKnockoutOpen(true)}
                disabled={knockoutOpen}
                className="bg-green-700 hover:bg-green-600 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Open Knockout Phase
              </button>
              <button
                onClick={() => handleKnockoutOpen(false)}
                disabled={!knockoutOpen}
                className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Close Knockout Phase
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'sync' && (
        <div className="space-y-4">

          {/* API status card */}
          <div className={`card border-l-4 ${apiConfigured ? 'border-green-500' : 'border-yellow-500'}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-bold ${apiConfigured ? 'text-green-400' : 'text-yellow-400'}`}>
                    {apiConfigured ? '🟢 API Connected' : '🟡 API Not Configured'}
                  </span>
                  <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">
                    {settings.results_provider || 'football-data.org'}
                  </span>
                </div>
                {apiConfigured ? (
                  <p className="text-xs text-gray-400">
                    Live match scores will be fetched automatically and update player points in real time.
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">
                    Add your API key to Render environment variables to enable live score syncing.
                  </p>
                )}
              </div>
              {apiConfigured && (
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Auto-sync</p>
                  <span className={`text-sm font-bold ${autoFetchOn ? 'text-green-400' : 'text-gray-400'}`}>
                    {autoFetchOn ? '🔄 On' : '⏸ Off'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Setup guide — shown when not configured */}
          {!apiConfigured && (
            <div className="card space-y-4">
              <h3 className="font-bold text-white">How to connect football-data.org (free, recommended)</h3>

              <ol className="space-y-3 text-sm text-gray-300">
                <li className="flex gap-3">
                  <span className="bg-fifa-gold text-gray-950 font-black text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                  <div>
                    Go to{' '}
                    <a href="https://www.football-data.org/client/register" target="_blank" rel="noreferrer"
                       className="text-fifa-gold hover:underline font-medium">
                      football-data.org/client/register
                    </a>
                    {' '}— sign up for free, no credit card. You'll get an API key by email instantly.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="bg-fifa-gold text-gray-950 font-black text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                  <div>
                    In your <span className="text-white font-medium">Render dashboard</span> → your server service →
                    {' '}<span className="text-white font-medium">Environment</span> → add a new variable:
                    <div className="mt-1.5 font-mono text-xs bg-gray-800 rounded px-3 py-2 border border-gray-700">
                      <span className="text-fifa-gold">FOOTBALL_DATA_TOKEN</span>
                      <span className="text-gray-500"> = </span>
                      <span className="text-green-400">your_api_key_here</span>
                    </div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="bg-fifa-gold text-gray-950 font-black text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                  <div>
                    Click <span className="text-white font-medium">Save Changes</span> in Render — the server restarts
                    automatically (≈ 1 min). Come back here and this page will show{' '}
                    <span className="text-green-400 font-medium">🟢 API Connected</span>.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="bg-fifa-gold text-gray-950 font-black text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                  <div>
                    Enable <span className="text-white font-medium">Auto-sync</span> below and set the interval.
                    Scores will update within minutes of each match finishing.
                  </div>
                </li>
              </ol>

              <div className="bg-gray-800/60 rounded-lg p-3 text-xs text-gray-400 border border-gray-700">
                <p className="font-semibold text-gray-300 mb-1">Why football-data.org?</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>Free tier — 10 requests/min, no credit card</li>
                  <li>Official FIFA World Cup 2026 data (competition code: WC)</li>
                  <li>Returns goals scored, match status, group standings</li>
                  <li>Running since 2014 — very reliable</li>
                  <li>Backup option: API-Football (set <code className="text-gray-300">API_FOOTBALL_KEY</code> + <code className="text-gray-300">RESULTS_PROVIDER=api-football</code>)</li>
                </ul>
              </div>
            </div>
          )}

          {/* Auto-sync controls — shown when configured */}
          {apiConfigured && (
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Scheduled auto-sync</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Polls the API every {settings.fetch_interval_min || 15} min. Scores update within minutes of a match ending.
                  </p>
                </div>
                <button
                  onClick={() => handleToggleAutoFetch(!autoFetchOn)}
                  className={autoFetchOn
                    ? 'bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded-lg'
                    : 'btn-primary px-4 py-2'}
                >
                  {autoFetchOn ? '⏸ Pause' : '▶ Enable auto-sync'}
                </button>
              </div>
              {autoFetchOn && (
                <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 rounded-lg px-3 py-2">
                  <span>🔄</span>
                  <span>Auto-syncing every {settings.fetch_interval_min || 15} minutes — scores will update live during the tournament</span>
                </div>
              )}
            </div>
          )}

          {/* Manual sync */}
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Manual sync</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Run a sync right now — useful after a match finishes or to verify the connection.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleFetchNow}
                  disabled={!apiConfigured || fetching}
                  className="btn-primary disabled:opacity-50"
                >
                  {fetching ? '⏳ Syncing…' : '🔄 Sync now'}
                </button>
              </div>
            </div>

            {settings.last_fetch_at && (
              <p className="text-xs text-gray-500 mt-3">
                Last sync: <span className="text-gray-300">{new Date(settings.last_fetch_at).toLocaleString()}</span>
              </p>
            )}

            {/* Last sync result */}
            {lastStatus && (
              <div className="mt-3 text-xs rounded-lg p-3 bg-gray-800/60 border border-gray-700 space-y-1.5">
                {lastStatus.error ? (
                  <p className="text-red-400 font-medium">⚠ {lastStatus.error}</p>
                ) : (
                  <>
                    <p className="text-gray-400 font-semibold mb-1">Last sync results</p>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 font-bold">{lastStatus.scores?.length || 0}</span>
                      <span className="text-gray-300">match scores updated</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400 font-bold">{lastStatus.groups?.length || 0}</span>
                      <span className="text-gray-300">group standings updated</span>
                      {lastStatus.groups?.length > 0 && (
                        <span className="text-gray-500">({lastStatus.groups.join(', ')})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400 font-bold">{lastStatus.knockout?.length || 0}</span>
                      <span className="text-gray-300">knockout results updated</span>
                    </div>
                    {lastStatus.rateLimit?.remaining != null && (
                      <div className="flex items-center gap-2">
                        <span className={lastStatus.rateLimit.remaining <= 2 ? 'text-yellow-400 font-bold' : 'text-gray-400 font-bold'}>
                          {lastStatus.rateLimit.remaining}
                        </span>
                        <span className="text-gray-300">API requests left this minute</span>
                        {lastStatus.rateLimit.remaining <= 2 && (
                          <span className="text-yellow-300 ml-1">⚠ auto-throttle active</span>
                        )}
                      </div>
                    )}
                    {lastStatus.unmatched?.length > 0 && (
                      <div className="pt-1 border-t border-gray-700">
                        <p className="text-yellow-400 font-medium">⚠ Needs manual score entry:</p>
                        <p className="text-yellow-300/80 mt-0.5">{lastStatus.unmatched.join(' · ')}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {!apiConfigured && (
            <p className="text-xs text-gray-600 text-center">
              While the API key is not set you can still enter scores manually in the ⚽ Match Scores tab.
            </p>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="card divide-y divide-gray-800">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between py-3 gap-2 flex-wrap">
              <div>
                <span className="font-medium">{u.username}</span>
                {u.is_admin ? (
                  <span className="ml-2 text-xs bg-fifa-gold text-gray-950 px-2 py-0.5 rounded-full font-bold">Admin</span>
                ) : null}
                {u.reset_requested && (
                  <span className="ml-2 text-xs bg-red-800 text-red-100 px-2 py-0.5 rounded-full font-bold">
                    🔑 reset requested
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPwUser(u)} className="text-xs btn-secondary">
                  Set password
                </button>
                {!u.is_admin && (
                  <button onClick={() => handlePromote(u.id)} className="text-xs btn-secondary">
                    Make Admin
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pwUser && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
          onClick={() => setPwUser(null)}
        >
          <div className="card w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-fifa-gold mb-3">Set password for {pwUser.username}</h3>
            <input
              className="input mb-3"
              type="text"
              placeholder="New password"
              value={pwValue}
              onChange={e => setPwValue(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setPwUser(null); setPwValue('') }} className="btn-secondary text-sm">
                Cancel
              </button>
              <button onClick={handleSetPassword} disabled={pwValue.length < 4} className="btn-primary text-sm">
                Save password
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Share the new password with {pwUser.username} directly (text/DM). This clears their reset request.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
