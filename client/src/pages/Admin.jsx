import { useState, useEffect } from 'react'
import { admin, tournament, brackets } from '../api'

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
    { key: 'lock', label: '🔒 Lock Brackets' },
    { key: 'groups', label: '📋 Group Results' },
    { key: 'knockout', label: '🏆 Knockout Results' },
    { key: 'sync', label: '🔄 Results Sync' },
    { key: 'users', label: '👥 Users' },
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
