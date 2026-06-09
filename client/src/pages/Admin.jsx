import { useState, useEffect } from 'react'
import { admin, tournament, brackets, picks as picksApi } from '../api'

export default function Admin() {
  const [settings, setSettings] = useState({})
  const [groups, setGroups] = useState({})
  const [users, setUsers] = useState([])
  const [groupResults, setGroupResults] = useState({}) // { A: { first, second, third, third_advanced } }
  const [lockTime, setLockTime] = useState('')
  const [tab, setTab] = useState('lock')
  const [msg, setMsg] = useState('')

  // Group result form state
  const [groupForm, setGroupForm] = useState({ group: 'A', first: '', second: '', third: '', third_advanced: false })

  // Knockout result form
  const [koForm, setKoForm] = useState({ match_id: '', home_team: '', away_team: '', winner: '', round: 'R32' })

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

  async function handleKoResult(e) {
    e.preventDefault()
    await admin.knockoutResult(koForm.match_id, koForm.home_team, koForm.away_team, koForm.winner, koForm.round)
    flash(`✓ ${koForm.match_id} result saved`)
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

  const tabs = [
    { key: 'scores',   label: '⚽ Match Scores' },
    { key: 'picks',    label: '🔢 Score Picks Lock' },
    { key: 'lock',     label: '🔒 Bracket Lock' },
    { key: 'groups',   label: '📋 Group Results' },
    { key: 'knockout', label: '🏆 Knockout Results' },
    { key: 'sync',     label: '🔄 Results Sync' },
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
      {tab === 'scores' && (() => {
        const groupLetters = Object.keys(allGroupMatches).sort()
        const koRounds = [
          { key: 'R32', label: 'Round of 32', ids: Array.from({length:16}, (_,i) => `m${73+i}`) },
          { key: 'R16', label: 'Round of 16', ids: Array.from({length:8},  (_,i) => `m${89+i}`) },
          { key: 'QF',  label: 'Quarter-finals', ids: Array.from({length:4}, (_,i) => `m${97+i}`) },
          { key: 'SF',  label: 'Semi-finals', ids: ['m101','m102'] },
          { key: 'Final', label: 'Final', ids: ['m104'] },
        ]
        const isGroupRound = scoreRound.startsWith('group_')
        const currentGroupLetter = isGroupRound ? scoreRound.replace('group_', '') : null
        const currentKoRound = !isGroupRound ? koRounds.find(r => r.key === scoreRound) : null
        const currentMatches = isGroupRound
          ? (allGroupMatches[currentGroupLetter] || [])
          : (currentKoRound?.ids.map(id => ({ id, home: 'TBD', away: 'TBD' })) || [])

        return (
          <div className="card">
            <p className="text-sm text-gray-400 mb-4">
              Enter actual match scores as each game is played. Points recalculate instantly.
            </p>

            {/* Round selector */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Round / Group</label>
              <select className="input" value={scoreRound} onChange={e => setScoreRound(e.target.value)}>
                <optgroup label="Group Stage">
                  {groupLetters.map(l => <option key={l} value={`group_${l}`}>Group {l}</option>)}
                </optgroup>
                <optgroup label="Knockout">
                  {koRounds.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </optgroup>
              </select>
            </div>

            {/* Match score rows */}
            <div className="space-y-2">
              {currentMatches.map(m => {
                const saved = matchScores[m.id]
                const f = scoreForm[m.id] || {}
                const homeDisp = saved?.home_team || m.home
                const awayDisp = saved?.away_team || m.away

                return (
                  <div key={m.id} className={`rounded-lg border p-3 ${saved?.home_goals != null ? 'border-green-800/40 bg-green-900/10' : 'border-gray-700/50 bg-gray-800/40'}`}>
                    <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                      <span className="font-mono text-gray-400">{m.id}</span>
                      {saved?.home_goals != null && (
                        <span className="text-green-400 font-bold">
                          {saved.home_goals}–{saved.away_goals}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Home{!isGroupRound && ' Team'}
                        </label>
                        {!isGroupRound ? (
                          <input
                            className="input text-sm py-1.5"
                            placeholder={homeDisp !== 'TBD' ? homeDisp : 'Home team name'}
                            value={f.ht ?? (saved?.home_team || '')}
                            onChange={e => setScoreForm(sf => ({ ...sf, [m.id]: { ...(sf[m.id]||{}), ht: e.target.value } }))}
                          />
                        ) : (
                          <div className="input text-sm py-1.5 text-gray-300 bg-gray-800/60 cursor-not-allowed">
                            {m.home}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Away{!isGroupRound && ' Team'}
                        </label>
                        {!isGroupRound ? (
                          <input
                            className="input text-sm py-1.5"
                            placeholder={awayDisp !== 'TBD' ? awayDisp : 'Away team name'}
                            value={f.at ?? (saved?.away_team || '')}
                            onChange={e => setScoreForm(sf => ({ ...sf, [m.id]: { ...(sf[m.id]||{}), at: e.target.value } }))}
                          />
                        ) : (
                          <div className="input text-sm py-1.5 text-gray-300 bg-gray-800/60 cursor-not-allowed">
                            {m.away}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="number" min="0" max="30"
                          className="input w-16 text-center font-bold py-1.5 text-sm"
                          placeholder="0"
                          value={f.home ?? (saved?.home_goals ?? '')}
                          onChange={e => setScoreForm(sf => ({ ...sf, [m.id]: { ...(sf[m.id]||{}), home: e.target.value } }))}
                        />
                        <span className="text-gray-500 font-bold">–</span>
                        <input
                          type="number" min="0" max="30"
                          className="input w-16 text-center font-bold py-1.5 text-sm"
                          placeholder="0"
                          value={f.away ?? (saved?.away_goals ?? '')}
                          onChange={e => setScoreForm(sf => ({ ...sf, [m.id]: { ...(sf[m.id]||{}), away: e.target.value } }))}
                        />
                      </div>
                      <button
                        onClick={() => handleSaveMatchScore(
                          m.id,
                          f.home ?? saved?.home_goals ?? '',
                          f.away ?? saved?.away_goals ?? '',
                          f.ht ?? saved?.home_team,
                          f.at ?? saved?.away_team
                        )}
                        className="btn-primary text-sm py-1.5 px-3"
                      >
                        Save
                      </button>
                      {saved?.home_goals != null && (
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
        )
      })()}

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

      {tab === 'lock' && (
        <div className="card space-y-4">
          <div>
            <p className="text-sm text-gray-400 mb-2">
              Status: <span className={isLocked ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>
                {isLocked ? '🔒 Locked' : '🔓 Open'}
              </span>
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Lock Date/Time (auto-locks at this time)</label>
            <input
              type="datetime-local"
              className="input"
              value={lockTime}
              onChange={e => setLockTime(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleLock(true)}
              className="bg-red-700 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg"
              disabled={isLocked}
            >
              Lock Brackets
            </button>
            <button
              onClick={() => handleLock(false)}
              className="bg-green-700 hover:bg-green-600 text-white font-bold px-4 py-2 rounded-lg"
              disabled={!isLocked}
            >
              Unlock Brackets
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Lock before the first match starts (June 12, 2026). While locked, players can't change
            picks. <span className="text-gray-400">Players also can't see each other's brackets until lock</span> —
            setting a lock date/time above will reveal everyone's picks automatically once it passes.
          </p>
        </div>
      )}

      {tab === 'groups' && (
        <div className="card">
          <p className="text-sm text-gray-400 mb-1">
            Enter final group stage standings after each group is complete.
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Only the 8 best 3rd-place teams advance. Tick “3rd-place team advanced” for those 8 groups —
            a player’s correct 3rd-place pick only scores when that group is marked advanced.
            <span className={`ml-1 font-semibold ${advancedCount > 8 ? 'text-red-400' : advancedCount === 8 ? 'text-fifa-gold' : 'text-gray-300'}`}>
              ({advancedCount}/8 marked)
            </span>
          </p>
          <form onSubmit={handleGroupResult} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Group</label>
              <select
                className="input"
                value={groupForm.group}
                onChange={e => {
                  const g = e.target.value
                  const existing = groupResults[g] || {}
                  setGroupForm({
                    group: g,
                    first: existing.first || '',
                    second: existing.second || '',
                    third: existing.third || '',
                    third_advanced: !!existing.third_advanced,
                  })
                }}
              >
                {groupLetters.map(g => (
                  <option key={g} value={g}>
                    Group {g}{groupResults[g]?.third_advanced ? ' ✓3rd' : ''}
                  </option>
                ))}
              </select>
            </div>
            {['first', 'second', 'third'].map((pos, i) => (
              <div key={pos}>
                <label className="block text-sm text-gray-400 mb-1">
                  {i === 0 ? '🥇 1st Place' : i === 1 ? '🥈 2nd Place' : '🥉 3rd Place'}
                </label>
                <select
                  className="input"
                  value={groupForm[pos]}
                  onChange={e => setGroupForm(f => ({ ...f, [pos]: e.target.value }))}
                >
                  <option value="">— select —</option>
                  {(groups[groupForm.group]?.teams || []).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-fifa-gold"
                checked={groupForm.third_advanced}
                onChange={e => setGroupForm(f => ({ ...f, third_advanced: e.target.checked }))}
              />
              3rd-place team advanced to the knockouts (one of the 8 best)
              {!groupForm.third_advanced && advancedCount >= 8 && (
                <span className="text-xs text-gray-500">— 8 already marked</span>
              )}
            </label>
            <button type="submit" className="btn-primary">Save Group {groupForm.group} Result</button>
          </form>
        </div>
      )}

      {tab === 'knockout' && (
        <div className="card">
          <p className="text-sm text-gray-400 mb-4">
            Enter match results as each knockout game finishes. Match IDs follow the official
            schedule: <span className="text-gray-300">m73…m88</span> (R32),
            <span className="text-gray-300"> m89…m96</span> (R16),
            <span className="text-gray-300"> m97…m100</span> (QF),
            <span className="text-gray-300"> m101, m102</span> (SF),
            <span className="text-gray-300"> m104</span> (Final).
          </p>
          <form onSubmit={handleKoResult} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Match ID</label>
                <input
                  className="input"
                  placeholder="e.g. m73"
                  value={koForm.match_id}
                  onChange={e => setKoForm(f => ({ ...f, match_id: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Round</label>
                <select
                  className="input"
                  value={koForm.round}
                  onChange={e => setKoForm(f => ({ ...f, round: e.target.value }))}
                >
                  {['R32', 'R16', 'QF', 'SF', 'Final'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Home Team</label>
                <input
                  className="input"
                  placeholder="Home team name"
                  value={koForm.home_team}
                  onChange={e => setKoForm(f => ({ ...f, home_team: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Away Team</label>
                <input
                  className="input"
                  placeholder="Away team name"
                  value={koForm.away_team}
                  onChange={e => setKoForm(f => ({ ...f, away_team: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Winner</label>
              <input
                className="input"
                placeholder="Winning team name (exact)"
                value={koForm.winner}
                onChange={e => setKoForm(f => ({ ...f, winner: e.target.value }))}
                required
              />
            </div>
            <button type="submit" className="btn-primary">Save Result</button>
          </form>
        </div>
      )}

      {tab === 'sync' && (
        <div className="card space-y-4">
          <p className="text-sm text-gray-400">
            Automatically pull results from <span className="text-gray-300">football-data.org</span>.
            Group standings fill the 1st/2nd/3rd places (and auto-mark the 8 best 3rd-place teams);
            knockout games are matched to the bracket by the teams involved. You can always override
            anything by hand on the Group/Knockout tabs.
          </p>

          {!apiConfigured ? (
            <div className="bg-yellow-900/30 border border-yellow-700/50 text-yellow-200 text-sm rounded-lg p-3">
              ⚠️ No API key configured. Set <code className="text-yellow-100">FOOTBALL_DATA_TOKEN</code> in
              the server environment and restart to enable auto-fetch. Until then, enter results manually.
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-gray-400">Scheduled auto-fetch: </span>
                <span className={autoFetchOn ? 'text-green-400 font-bold' : 'text-gray-300 font-bold'}>
                  {autoFetchOn ? '🔄 On' : '⏸ Off'}
                </span>
              </div>
              <button
                onClick={() => handleToggleAutoFetch(!autoFetchOn)}
                className={autoFetchOn
                  ? 'bg-gray-700 hover:bg-gray-600 text-white font-medium px-4 py-2 rounded-lg'
                  : 'btn-primary'}
              >
                {autoFetchOn ? 'Pause auto-fetch' : 'Enable auto-fetch'}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
            <button onClick={handleFetchNow} disabled={!apiConfigured || fetching} className="btn-primary">
              {fetching ? 'Fetching…' : 'Fetch results now'}
            </button>
            {settings.last_fetch_at && (
              <span className="text-xs text-gray-500">
                Last sync: {new Date(settings.last_fetch_at).toLocaleString()}
              </span>
            )}
          </div>

          {lastStatus && (
            <div className="text-xs rounded-lg p-3 bg-gray-800/60 border border-gray-700">
              {lastStatus.error ? (
                <span className="text-red-400">Last sync error: {lastStatus.error}</span>
              ) : (
                <div className="space-y-1 text-gray-300">
                  <div>Groups finalized: <span className="text-white">{lastStatus.groups?.join(', ') || '—'}</span></div>
                  <div>Knockout matches set: <span className="text-white">{lastStatus.knockout?.length || 0}</span></div>
                  {lastStatus.thirdsRanked && (
                    <div>3rd-place teams advancing (groups): <span className="text-fifa-gold">{lastStatus.thirdsRanked.join(', ')}</span></div>
                  )}
                  {lastStatus.unmatched?.length > 0 && (
                    <div className="text-yellow-300">
                      Needs manual entry: {lastStatus.unmatched.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
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
