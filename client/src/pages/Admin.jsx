import { useState, useEffect } from 'react'
import { admin, tournament, brackets, picks as picksApi } from '../api'
import PicksReport from '../components/PicksReport'

// ── Participant roster (from WhatsApp group) ──────────────────────────────────
const ROSTER = [
  'Suyesh',       // username: sk
  'Adya Mishra',
  'Aashish Lohani',
  'Avash Lohani',
  'Bibek Bhattarai',
  'Bishav Bhattarai',
  'Bishesh',
  'Chu',
  'Deepa Rajkarnikar',
  'Jyoti Lohani',
  'Kalyan',
  'Sirish',
  'Nanda',
  'Neha Joshi',
  'Prajwol Bhandari',
  'Prakash',
  'Prashant Upadhyay',
  'Priyanka Upadhyay',
  'Rakshya Pant',
  'Rohit',
  'Rubina',
  'Sankalpa',
  'Shraddha',
  'Shreesh Bhattarai',
  'Sinds',
  'Smriti Dhakal',
  'Subodh Gurung',
  'Subrat Khanal',
  'Subrat Sharma',
  'Swechha Gurung',
]

// Normalize: lowercase, strip spaces/dots/underscores/hyphens
const N = s => s.toLowerCase().replace(/[\s._\-]/g, '')

// Manual overrides for usernames that can't be auto-matched by name
// Key: normalized username  →  Value: roster name (exact string from ROSTER)
const MANUAL_OVERRIDES = {
  sk:          'Suyesh',
  stk:         'Sirish',
  pdai:        'Prashant Upadhyay',
  prajwol123:  'Prajwol Bhandari',
}

function buildRosterMatches(roster, appUsers, leaderboard) {
  // Admins don't pick — exclude them from matching and unmatched list
  appUsers = appUsers.filter(u => !u.is_admin)

  const lbMap = {}
  for (const e of leaderboard) lbMap[e.user_id] = e

  const matchedIds = new Set()

  // Apply manual overrides first — these win over auto-matching
  const manualMatchMap = {}  // roster name → { user, lb }
  for (const u of appUsers) {
    const nu = N(u.username)
    if (MANUAL_OVERRIDES[nu]) {
      manualMatchMap[MANUAL_OVERRIDES[nu]] = { user: u, lb: lbMap[u.id] }
      matchedIds.add(u.id)
    }
  }

  // Pre-count shared first and last names across the roster
  const firstCount = {}, lastCount = {}
  for (const name of roster) {
    const parts = name.split(' ')
    const f = N(parts[0])
    const l = parts.length > 1 ? N(parts.slice(1).join(' ')) : null
    firstCount[f] = (firstCount[f] || 0) + 1
    if (l) lastCount[l] = (lastCount[l] || 0) + 1
  }

  const results = roster.map(name => {
    // Manual override takes priority
    if (manualMatchMap[name]) {
      return { name, match: manualMatchMap[name], confidence: 'high' }
    }

    const parts   = name.split(' ')
    const normFull  = N(name)
    const normFirst = N(parts[0])
    const normLast  = parts.length > 1 ? N(parts.slice(1).join(' ')) : null
    const sharedFirst = firstCount[normFirst] > 1
    const sharedLast  = normLast && lastCount[normLast] > 1

    let match = null, confidence = 'high'

    for (const u of appUsers) {
      const nu = N(u.username)

      // Full name (no spaces) — strongest signal
      if (nu === normFull) { match = { user: u, lb: lbMap[u.id] }; confidence = 'high'; break }

      // First + last both contained in username
      if (normLast && nu.includes(normFirst) && nu.includes(normLast)) {
        match = { user: u, lb: lbMap[u.id] }; confidence = 'high'; break
      }

      // First name only — only confident if unique across roster
      if (nu === normFirst) {
        if (!sharedFirst) { match = { user: u, lb: lbMap[u.id] }; confidence = 'high'; break }
        else if (!match)  { match = { user: u, lb: lbMap[u.id] }; confidence = 'ambiguous' }
      }

      // Last name only — only confident if unique across roster
      if (normLast && nu === normLast && !match) {
        if (!sharedLast) { match = { user: u, lb: lbMap[u.id] }; confidence = 'high' }
        else             { match = { user: u, lb: lbMap[u.id] }; confidence = 'ambiguous' }
      }
    }

    if (match) matchedIds.add(match.user.id)
    return { name, match, confidence }
  })

  const unmatched = appUsers.filter(u => !matchedIds.has(u.id))
  return { results, unmatched }
}

// ── Mountain Time helpers (MDT = UTC−6, active during the World Cup in Jun–Jul) ─
const MDT_OFFSET_H = -6

/** "YYYY-MM-DDTHH:mm" (MDT input value) → "YYYY-MM-DDTHH:mm-06:00" (timezone-aware ISO) */
function mtToISO(local) {
  if (!local) return ''
  return `${local}-06:00`
}

/** Stored ISO string → "YYYY-MM-DDTHH:mm" in MDT (for datetime-local input) */
function isoToMT(iso) {
  if (!iso) return ''
  try {
    const date = new Date(iso)
    if (isNaN(date.getTime())) return iso.slice(0, 16)  // fallback: strip TZ
    const mdtMs = date.getTime() + MDT_OFFSET_H * 3_600_000
    const d = new Date(mdtMs)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  } catch { return '' }
}

/** Format a stored ISO string for display in Mountain Time */
function formatMT(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Denver',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })
  } catch { return iso }
}

export default function Admin() {
  const [settings, setSettings] = useState({})
  const [groups, setGroups] = useState({})
  const [users, setUsers] = useState([])
  const [groupResults, setGroupResults] = useState({}) // { A: { first, second, third, third_advanced } }
  const [lockTime, setLockTime] = useState('')
  const [tab, setTab] = useState('scores')
  const [msg, setMsg] = useState('')
  const [rosterLeaderboard, setRosterLeaderboard] = useState([])

  // Group result form state
  const [groupForm, setGroupForm] = useState({ group: 'A', first: '', second: '', third: '', third_advanced: false })

  async function loadResults() {
    const r = await brackets.results()
    setGroupResults(r.data.groups || {})
    return r.data.groups || {}
  }

  useEffect(() => {
    async function load() {
      const [s, t, u, lb] = await Promise.all([admin.settings(), tournament.data(), admin.users(), picksApi.leaderboard()])
      setSettings(s.data)
      setGroups(t.data.groups)
      setUsers(u.data)
      setLockTime(s.data.lock_time || '')
      setRosterLeaderboard(lb.data.leaderboard || [])
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

  const [confirmClear, setConfirmClear] = useState(null)
  async function handleClearPicks(user) {
    try {
      const res = await admin.clearUserPicks(user.id)
      setReportCache(null)   // invalidate so next View Picks fetch is fresh
      flash(`✓ Cleared ${res.data.cleared} picks for ${user.username}`)
    } catch (err) {
      flash(err.response?.data?.error || 'Failed to clear picks')
    } finally {
      setConfirmClear(null)
    }
  }

  // ── View picks for a user ────────────────────────────────────────────────
  const [viewPicksUser,  setViewPicksUser]  = useState(null)
  const [reportCache,    setReportCache]    = useState(null)
  const [reportLoading,  setReportLoading]  = useState(false)

  async function handleViewPicks(u) {
    setViewPicksUser(u)
    if (reportCache) return   // already loaded
    setReportLoading(true)
    try {
      const res = await admin.report()
      setReportCache(res.data)
    } catch {
      flash('⚠ Could not load picks data')
    } finally {
      setReportLoading(false)
    }
  }

  // ── Create user ────────────────────────────────────────────────────────────
  const [newUser,        setNewUser]        = useState({ username: '', password: '' })
  const [createUserMsg,  setCreateUserMsg]  = useState(null)
  const [createUserBusy, setCreateUserBusy] = useState(false)

  async function handleCreateUser(e) {
    e.preventDefault()
    setCreateUserMsg(null)
    setCreateUserBusy(true)
    try {
      const res = await admin.createUser(newUser.username.trim(), newUser.password)
      setUsers(u => [...u, res.data.user].sort((a, b) => a.username.localeCompare(b.username)))
      setCreateUserMsg({ type: 'ok', text: `✓ Account created for "${res.data.user.username}"` })
      setNewUser({ username: '', password: '' })
    } catch (err) {
      setCreateUserMsg({ type: 'err', text: err.response?.data?.error || 'Failed to create user' })
    } finally {
      setCreateUserBusy(false)
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(null)
  async function handleDeleteUser(user) {
    try {
      await admin.deleteUser(user.id)
      setUsers(u => u.filter(x => x.id !== user.id))
      flash(`✓ Deleted user ${user.username}`)
    } catch (err) {
      flash(err.response?.data?.error || 'Failed to delete user')
    } finally {
      setConfirmDelete(null)
    }
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
  const [picksLocked,          setPicksLocked]          = useState(false)
  const [effectivePicksLocked, setEffectivePicksLocked] = useState(false)
  const [picksLockTime,        setPicksLockTime]        = useState('')  // MDT input value
  const [savedPicksLockTime,   setSavedPicksLockTime]   = useState('')  // stored ISO string
  const [knockoutOpen,         setKnockoutOpen]         = useState(false)

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

  // Sync picks lock settings from main settings load (and from 30s poll)
  useEffect(() => {
    if (settings.picks_locked !== undefined) {
      setPicksLocked(settings.picks_locked === 'true')
      setEffectivePicksLocked(!!settings.effective_picks_locked)
      const stored = settings.picks_lock_time || ''
      setSavedPicksLockTime(stored)
      setPicksLockTime(isoToMT(stored))
      setKnockoutOpen(settings.knockout_picks_open === 'true')
    }
  }, [settings.picks_locked, settings.picks_lock_time, settings.knockout_picks_open, settings.effective_picks_locked])

  // Poll the effective lock status every 30 s while the picks tab is open
  useEffect(() => {
    if (tab !== 'picks') return
    const poll = async () => {
      try {
        const s = await admin.settings()
        setSettings(prev => ({ ...prev, ...s.data }))
      } catch { /* network hiccup — ignore */ }
    }
    const iv = setInterval(poll, 30_000)
    return () => clearInterval(iv)
  }, [tab])

  async function handlePicksLock(locked) {
    const lockISO = mtToISO(picksLockTime)
    await admin.picksLock(locked, lockISO)
    setPicksLocked(locked)
    setEffectivePicksLocked(locked)
    setSavedPicksLockTime(lockISO)
    flash(locked ? '🔒 Score picks locked' : '🔓 Score picks unlocked')
  }

  async function handleSaveLockSchedule() {
    const lockISO = mtToISO(picksLockTime)
    await admin.picksSchedule(lockISO)
    setSavedPicksLockTime(lockISO)
    flash('⏱ Auto-lock scheduled')
  }

  async function handleClearLockSchedule() {
    await admin.picksSchedule('')
    setSavedPicksLockTime('')
    setPicksLockTime('')
    flash('Auto-lock schedule cleared')
  }

  async function handleKnockoutOpen(open) {
    await admin.knockoutOpen(open)
    setKnockoutOpen(open)
    flash(open ? '⚡ Knockout Phase 2 opened!' : '⏸ Knockout picks closed')
  }

  async function handleSaveMatchScore(matchId, homeGoals, awayGoals, homeTeam, awayTeam) {
    if (homeGoals === '' || homeGoals == null || awayGoals === '' || awayGoals == null) return
    try {
      await admin.matchScore(matchId, parseInt(homeGoals), parseInt(awayGoals), homeTeam || undefined, awayTeam || undefined)
      await loadMatchScores()
      flash(`✓ Score saved for ${matchId}`)
    } catch (err) {
      flash(`⚠ Save failed: ${err.response?.data?.error || err.message}`)
    }
  }

  async function handleDeleteMatchScore(matchId) {
    try {
      await admin.deleteMatchScore(matchId)
      await loadMatchScores()
      setScoreForm(f => { const n = { ...f }; delete n[matchId]; return n })
      flash(`✓ Score cleared for ${matchId}`)
    } catch (err) {
      flash(`⚠ Delete failed: ${err.response?.data?.error || err.message}`)
    }
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
      await loadMatchScores()   // refresh Match Scores tab with any newly synced scores
      const settingsRes = await admin.settings()
      setSettings(settingsRes.data)
      const parts = []
      if ((s.scores?.length || 0) > 0)   parts.push(`${s.scores.length} match score${s.scores.length !== 1 ? 's' : ''}`)
      if ((s.groups?.length || 0) > 0)   parts.push(`${s.groups.length} group${s.groups.length !== 1 ? 's' : ''}`)
      if ((s.knockout?.length || 0) > 0) parts.push(`${s.knockout.length} knockout`)
      flash(`✓ Synced — ${parts.length ? parts.join(', ') : 'no new results yet'}`)
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
    { key: 'report',   label: '📊 Report' },
    { key: 'users',    label: '👥 Users' },
    { key: 'roster',   label: '📋 Roster' },
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
          <div className="card space-y-4">
            <h3 className="font-semibold text-white">Phase 1 — Group Stage Picks</h3>
            <p className="text-sm text-gray-400">
              Lock picks before the first match kicks off. After locking, players
              can still see their own picks and the leaderboard — but can't change them.
            </p>

            {/* Live status — polls every 30 s */}
            <p className="text-sm">
              Status:{' '}
              <span className={effectivePicksLocked ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>
                {effectivePicksLocked ? '🔒 Locked' : '🔓 Open'}
              </span>
              {!picksLocked && effectivePicksLocked && (
                <span className="ml-2 text-xs text-yellow-400">(triggered by schedule)</span>
              )}
            </p>

            {/* Auto-lock schedule */}
            <div className="space-y-2 bg-gray-800/40 rounded-lg p-3">
              <label className="block text-sm font-medium text-gray-200">
                ⏱ Auto-lock schedule
                <span className="ml-2 text-xs font-normal text-gray-400">Mountain Time (MDT · UTC−6)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  className="input flex-1"
                  value={picksLockTime}
                  onChange={e => setPicksLockTime(e.target.value)}
                  disabled={effectivePicksLocked}
                />
              </div>
              {picksLockTime && (
                <p className="text-xs text-gray-400">
                  → {formatMT(mtToISO(picksLockTime))}
                </p>
              )}
              {savedPicksLockTime && (
                <p className="text-xs text-yellow-300 flex items-center gap-1">
                  <span>⏱</span>
                  <span>Scheduled: {formatMT(savedPicksLockTime)}</span>
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveLockSchedule}
                  disabled={!picksLockTime || effectivePicksLocked}
                  className="bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white text-sm font-semibold px-3 py-1.5 rounded-lg"
                >
                  Save Schedule
                </button>
                {savedPicksLockTime && !effectivePicksLocked && (
                  <button
                    onClick={handleClearLockSchedule}
                    className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-3 py-1.5 rounded-lg"
                  >
                    Clear Schedule
                  </button>
                )}
              </div>
            </div>

            {/* Manual override */}
            <div className="flex gap-3 pt-1 border-t border-gray-800">
              <button
                onClick={() => handlePicksLock(true)}
                disabled={effectivePicksLocked}
                className="bg-red-700 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Lock Now
              </button>
              <button
                onClick={() => handlePicksLock(false)}
                disabled={!effectivePicksLocked}
                className="bg-green-700 hover:bg-green-600 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Unlock
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

      {tab === 'report' && <PicksReport />}

      {tab === 'roster' && (() => {
        const { results, unmatched } = buildRosterMatches(ROSTER, users, rosterLeaderboard)

        const withPicks    = results.filter(r => r.match && r.confidence === 'high' && r.match.lb?.has_picks)
        const signedNoPick = results.filter(r => r.match && r.confidence === 'high' && !r.match.lb?.has_picks)
        const ambig        = results.filter(r => r.confidence === 'ambiguous')
        const notSignedUp  = results.filter(r => !r.match)

        return (
          <div>
            {/* Summary chips */}
            <div className="grid grid-cols-4 gap-2 mb-4 text-center">
              <div className="card py-3">
                <div className="text-2xl font-black text-green-400">{withPicks.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">Picks in</div>
              </div>
              <div className="card py-3">
                <div className="text-2xl font-black text-yellow-400">{signedNoPick.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">Signed up</div>
              </div>
              <div className="card py-3">
                <div className="text-2xl font-black text-red-400">{notSignedUp.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">Missing</div>
              </div>
              <div className="card py-3">
                <div className="text-2xl font-black text-gray-400">{unmatched.length + ambig.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">⚠ Review</div>
              </div>
            </div>

            {/* Full roster list */}
            <div className="card divide-y divide-gray-800 mb-4">
              {results.map(({ name, match, confidence }) => {
                const hasPicks = match?.lb?.has_picks
                const picksCount = match?.lb?.picks_count || 0

                let icon, statusText, rowClass
                if (!match) {
                  icon = '❌'; statusText = 'Not signed up'; rowClass = 'text-gray-400'
                } else if (confidence === 'ambiguous') {
                  icon = '❓'; statusText = `Can't confirm — username "${match.user.username}" may match`; rowClass = 'text-gray-500'
                } else if (hasPicks) {
                  icon = '✅'; statusText = `${picksCount} picks · @${match.user.username}`; rowClass = 'text-green-400'
                } else {
                  icon = '🟡'; statusText = `Signed up, no picks · @${match.user.username}`; rowClass = 'text-yellow-400'
                }

                return (
                  <div key={name} className="flex items-center justify-between py-2.5 px-1 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{icon}</span>
                      <span className="text-white font-medium text-sm truncate">{name}</span>
                    </div>
                    <span className={`text-xs shrink-0 ${rowClass}`}>{statusText}</span>
                  </div>
                )
              })}
            </div>

            {/* Unmatched app users */}
            {unmatched.length > 0 && (
              <div className="card mb-4 border border-yellow-900/40">
                <p className="text-xs text-yellow-400 font-semibold mb-1">
                  ⚠ Registered users not matched to any participant
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  These accounts exist in the app but couldn't be attributed to anyone on the roster. Ask them who they are.
                </p>
                <div className="flex flex-wrap gap-2">
                  {unmatched.map(u => (
                    <span key={u.id} className="text-xs bg-yellow-900/30 border border-yellow-800/50 text-yellow-300 px-3 py-1 rounded-full">
                      @{u.username}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-600 text-center">
              ❓ = Username couldn't be confidently matched. Shown as best guess only — verify manually.
            </p>
          </div>
        )
      })()}

      {tab === 'users' && (
        <div className="space-y-4">

          {/* ── Create user form ── */}
          <div className="card">
            <h3 className="font-semibold text-fifa-gold mb-3">Create account for a participant</h3>
            <form onSubmit={handleCreateUser} className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-36">
                <label className="block text-xs text-gray-400 mb-1">Username</label>
                <input
                  className="input"
                  placeholder="e.g. bishesh"
                  value={newUser.username}
                  onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))}
                  required
                  minLength={2}
                />
              </div>
              <div className="flex-1 min-w-36">
                <label className="block text-xs text-gray-400 mb-1">Password</label>
                <input
                  className="input"
                  type="text"
                  placeholder="temporary password"
                  value={newUser.password}
                  onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                  required
                  minLength={4}
                />
              </div>
              <button
                type="submit"
                disabled={createUserBusy || !newUser.username.trim() || newUser.password.length < 4}
                className="btn-primary whitespace-nowrap"
              >
                {createUserBusy ? 'Creating…' : '+ Create'}
              </button>
            </form>
            {createUserMsg && (
              <p className={`text-sm mt-2 ${createUserMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                {createUserMsg.text}
              </p>
            )}
            <p className="text-xs text-gray-600 mt-2">
              Share the username + password directly with the participant. They can change both after logging in.
            </p>
          </div>

          {/* ── User list ── */}
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
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleViewPicks(u)}
                  className="text-xs bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-800/50 px-2 py-1 rounded-lg"
                >
                  View Picks
                </button>
                <button onClick={() => setPwUser(u)} className="text-xs btn-secondary">
                  Set password
                </button>
                {!u.is_admin && (
                  <button onClick={() => handlePromote(u.id)} className="text-xs btn-secondary">
                    Make Admin
                  </button>
                )}
                <button
                  onClick={() => setConfirmClear(u)}
                  className="text-xs bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-800/50 px-2 py-1 rounded-lg"
                >
                  Clear Picks
                </button>
                {!u.is_admin && (
                  <button
                    onClick={() => setConfirmDelete(u)}
                    className="text-xs bg-red-950/60 hover:bg-red-900/80 text-red-400 border border-red-900/60 px-2 py-1 rounded-lg"
                  >
                    🗑 Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* ── View user picks modal ──────────────────────────────────────── */}
      {viewPicksUser && (() => {
        const report   = reportCache
        const uid      = viewPicksUser.id
        const total    = report?.totals?.[uid] ?? 0
        const matches  = report?.matches ?? []

        function ptsBadge(pts) {
          if (pts === 10) return 'bg-green-800 text-green-200'
          if (pts === 6)  return 'bg-yellow-800 text-yellow-200'
          if (pts === 4)  return 'bg-orange-800 text-orange-200'
          if (pts === 0)  return 'bg-red-900/70 text-red-300'
          return ''
        }

        const groups     = [...new Set(matches.filter(m => m.round === 'Group').map(m => m.group))].sort()
        const koRoundMap = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-finals', SF: 'Semi-finals', Final: 'Final' }
        const koRounds   = ['R32', 'R16', 'QF', 'SF', 'Final']

        return (
          <div
            className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 px-4 py-8 overflow-y-auto"
            onClick={() => setViewPicksUser(null)}
          >
            <div className="card w-full max-w-xl" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-white text-lg">{viewPicksUser.username}'s Picks</h3>
                  <p className="text-sm text-gray-400">
                    {reportLoading ? 'Loading…' : `${total} pts total`}
                  </p>
                </div>
                <button onClick={() => setViewPicksUser(null)} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
              </div>

              {reportLoading && (
                <div className="text-center text-gray-400 py-8">Loading picks…</div>
              )}

              {!reportLoading && report && (() => {
                const pickedCount = matches.filter(m => m.picks[uid]?.home_goals != null).length
                if (pickedCount === 0) {
                  return <p className="text-gray-500 text-sm text-center py-6">No picks submitted yet.</p>
                }

                return (
                  <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                    {/* Group stage */}
                    {groups.map(g => {
                      const gMatches = matches.filter(m => m.round === 'Group' && m.group === g)
                      const hasPicks = gMatches.some(m => m.picks[uid]?.home_goals != null)
                      if (!hasPicks) return null
                      return (
                        <div key={g}>
                          <p className="text-xs font-bold text-fifa-gold uppercase tracking-wider mb-1.5">Group {g}</p>
                          <div className="space-y-1">
                            {gMatches.map(m => {
                              const pick = m.picks[uid]
                              if (!pick || pick.home_goals == null) return null
                              return (
                                <div key={m.id} className="flex items-center justify-between gap-2 text-xs bg-gray-800/60 rounded px-3 py-1.5">
                                  <span className="text-gray-300 flex-1 min-w-0">
                                    <span className="font-medium">{m.home}</span>
                                    <span className="text-gray-600 mx-1">v</span>
                                    <span className="font-medium">{m.away}</span>
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="font-bold text-white tabular-nums">
                                      {pick.home_goals}–{pick.away_goals}
                                    </span>
                                    {m.result && (
                                      <span className="text-gray-500 tabular-nums">
                                        ({m.result.home_goals}–{m.result.away_goals})
                                      </span>
                                    )}
                                    {pick.pts != null && (
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ptsBadge(pick.pts)}`}>
                                        {pick.pts > 0 ? `+${pick.pts}` : '✗'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}

                    {/* Knockout rounds */}
                    {koRounds.map(round => {
                      const rMatches = matches.filter(m => m.round === round)
                      const hasPicks = rMatches.some(m => m.picks[uid]?.home_goals != null)
                      if (!hasPicks) return null
                      return (
                        <div key={round}>
                          <p className="text-xs font-bold text-fifa-gold uppercase tracking-wider mb-1.5">{koRoundMap[round]}</p>
                          <div className="space-y-1">
                            {rMatches.map(m => {
                              const pick = m.picks[uid]
                              if (!pick || pick.home_goals == null) return null
                              return (
                                <div key={m.id} className="flex items-center justify-between gap-2 text-xs bg-gray-800/60 rounded px-3 py-1.5">
                                  <span className="text-gray-300 flex-1 min-w-0">
                                    <span className="font-medium">{m.home}</span>
                                    <span className="text-gray-600 mx-1">v</span>
                                    <span className="font-medium">{m.away}</span>
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="font-bold text-white tabular-nums">
                                      {pick.home_goals}–{pick.away_goals}
                                    </span>
                                    {m.result && (
                                      <span className="text-gray-500 tabular-nums">
                                        ({m.result.home_goals}–{m.result.away_goals})
                                      </span>
                                    )}
                                    {pick.pts != null && (
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ptsBadge(pick.pts)}`}>
                                        {pick.pts > 0 ? `+${pick.pts}` : '✗'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        )
      })()}

      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div className="card w-full max-w-sm border border-red-900/60" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-red-400 mb-2">Delete {confirmDelete.username}?</h3>
            <p className="text-sm text-gray-400 mb-4">
              This permanently deletes the account and all their picks. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(confirmDelete)}
                className="bg-red-700 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-sm"
              >
                Yes, delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmClear && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
          onClick={() => setConfirmClear(null)}
        >
          <div className="card w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-red-400 mb-2">Clear picks for {confirmClear.username}?</h3>
            <p className="text-sm text-gray-400 mb-4">
              This will permanently delete all of {confirmClear.username}'s score picks.
              They will be able to re-enter their picks from scratch.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmClear(null)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button
                onClick={() => handleClearPicks(confirmClear)}
                className="bg-red-700 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-sm"
              >
                Yes, clear all picks
              </button>
            </div>
          </div>
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
