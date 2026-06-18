import { useState, useEffect } from 'react'
import { picks as picksApi, liveScores as liveApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { getFlag } from '../utils/flags'
import { getRealName } from '../utils/nicknames'

// Strip email domain: "john@gmail.com" → "john"
const displayName = (username) => username?.replace(/@.+$/, '') || ''

/** Group matches by calendar day, sorted chronologically */
function getScheduleDays(matches, dates) {
  const sorted = [...matches].sort((a, b) => {
    const da = dates[a.id] ? new Date(dates[a.id]).getTime() : 1e15
    const db_ = dates[b.id] ? new Date(dates[b.id]).getTime() : 1e15
    return da - db_
  })
  const days = [], seen = {}
  for (const m of sorted) {
    const iso = dates[m.id]
    const key = iso
      ? new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'Schedule TBD'
    if (!seen[key]) { seen[key] = []; days.push([key, seen[key]]) }
    seen[key].push(m)
  }
  return days
}

function fmtMatchTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function fmtLiveClock(live) {
  if (live.status === 'ft') return 'FT'
  if (live.status === 'ht' || live.status_name === 'STATUS_HALFTIME') return 'HT'
  if (!live.clock) return 'LIVE'
  const mins      = parseInt(live.clock) || 0
  const plusMatch = live.clock.match(/\+(\d+)/)
  return plusMatch ? `${mins}+${plusMatch[1]}'` : `${mins}'`
}

function ptsColor(pts) {
  if (pts === 10) return 'bg-green-800 text-green-200'
  if (pts === 6)  return 'bg-yellow-800 text-yellow-200'
  if (pts === 4)  return 'bg-orange-800 text-orange-200'
  if (pts === 0)  return 'bg-red-900/60 text-red-300'
  return 'bg-gray-700 text-gray-400'
}

const MEDALS = ['🥇', '🥈', '🥉']

function calcPts(pick, result) {
  if (!pick || pick.home_goals == null || !result || result.home_goals == null) return null
  const ph = pick.home_goals, pa = pick.away_goals
  const rh = result.home_goals, ra = result.away_goals
  if (ph === rh && pa === ra) return 10
  const outcome = (h, a) => h > a ? 'home' : a > h ? 'away' : 'draw'
  if (outcome(ph, pa) !== outcome(rh, ra)) return 0
  if (ph - pa === rh - ra) return 6
  return 4
}

function MatchPickCell({ matchId, pick, result }) {
  const hasPick = pick && pick.home_goals != null
  if (!hasPick) return <span className="text-gray-700 text-xs">–</span>

  const pts = calcPts(pick, result)
  const resultIn = result && result.home_goals != null

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-xs font-bold tabular-nums text-gray-200">
        {pick.home_goals}–{pick.away_goals}
      </span>
      {resultIn && pts != null && (
        <span className={`text-[9px] font-bold px-1 rounded ${ptsColor(pts)}`}>
          {pts > 0 ? `+${pts}` : '✗'}
        </span>
      )}
    </div>
  )
}

/** Expandable user row */
function UserRow({ userData, allMatches, results, rank, isMe }) {
  const [open, setOpen] = useState(false)
  const realName = getRealName(userData.username)

  const groups = [...new Set(allMatches.filter(m => m.round === 'Group').map(m => m.group))].sort()
  const koRounds = ['R32', 'R16', 'QF', 'SF', 'Final']

  const displayHome = (match) =>
    typeof match.home === 'string' ? match.home : null
  const displayAway = (match) =>
    typeof match.away === 'string' ? match.away : null

  return (
    <div className={`rounded-xl border transition-colors ${
      isMe ? 'border-fifa-gold/40 bg-fifa-gold/5' : 'border-gray-700/50 bg-gray-800/30'
    }`}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg w-8 text-center">
            {MEDALS[rank - 1] || <span className="text-sm text-gray-400">{rank}.</span>}
          </span>
          <div>
            <span className={`font-semibold ${isMe ? 'text-fifa-gold' : 'text-white'}`}>
              {displayName(userData.username)}
            </span>
            {isMe
              ? <span className="ml-1 text-xs text-gray-500">(you)</span>
              : realName && <span className="ml-1 text-xs text-gray-500">({realName})</span>
            }
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-black text-lg tabular-nums text-white">
            {userData.total}
            <span className="text-xs font-normal text-gray-500 ml-1">pts</span>
          </span>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20" fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
          </svg>
        </div>
      </button>

      {/* Expanded picks */}
      {open && (
        <div className="border-t border-gray-700/50 px-4 py-3 space-y-4">
          {groups.map(letter => {
            const gMatches = allMatches.filter(m => m.group === letter)
            const hasPicks = gMatches.some(m => userData.picks[m.id]?.home_goals != null)
            if (!hasPicks && Object.keys(userData.breakdown).length > 0) return null

            const grpPts = gMatches.reduce((s, m) => {
              return s + (userData.breakdown[m.id] || 0)
            }, 0)

            return (
              <div key={letter}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Group {letter}
                  </span>
                  {grpPts > 0 && (
                    <span className="text-xs font-bold text-fifa-gold">+{grpPts} pts</span>
                  )}
                </div>
                <div className="space-y-1">
                  {gMatches.map(m => {
                    const pick = userData.picks[m.id]
                    const result = results[m.id]
                    const pts = calcPts(pick, result)
                    const resultIn = result?.home_goals != null
                    const home = displayHome(m)
                    const away = displayAway(m)

                    return (
                      <div
                        key={m.id}
                        className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                          pts === 10 ? 'bg-green-900/20' :
                          pts === 6  ? 'bg-yellow-900/20' :
                          pts === 4  ? 'bg-orange-900/20' :
                          pts === 0  ? 'bg-red-900/10' :
                          'bg-gray-800/40'
                        }`}
                      >
                        <span className="text-gray-600 w-5 tabular-nums">{m.no}</span>
                        <span className="text-gray-300 flex-1 text-right truncate">
                          {home && getFlag(home)} {home || 'TBD'}
                        </span>
                        {pick?.home_goals != null ? (
                          <span className="font-bold tabular-nums text-gray-200 w-10 text-center">
                            {pick.home_goals}–{pick.away_goals}
                          </span>
                        ) : (
                          <span className="text-gray-600 w-10 text-center">–</span>
                        )}
                        <span className="text-gray-300 flex-1 truncate">
                          {away && getFlag(away)} {away || 'TBD'}
                        </span>
                        {resultIn && (
                          <span className="text-gray-500 w-10 text-right tabular-nums">
                            {result.home_goals}–{result.away_goals}
                          </span>
                        )}
                        {pts != null && (
                          <span className={`w-7 text-right font-bold ${
                            pts > 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {pts > 0 ? `+${pts}` : '✗'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Knockout picks */}
          {koRounds.map(round => {
            const rMatches = allMatches.filter(m => m.round === round)
            if (!rMatches.length) return null
            const hasPicks = rMatches.some(m => userData.picks[m.id]?.home_goals != null)
            if (!hasPicks) return null

            return (
              <div key={round}>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                  {round === 'R32' ? 'Round of 32' : round === 'R16' ? 'Round of 16' :
                   round === 'QF' ? 'Quarter-finals' : round === 'SF' ? 'Semi-finals' : 'Final'}
                </div>
                <div className="space-y-1">
                  {rMatches.map(m => {
                    const pick = userData.picks[m.id]
                    if (!pick?.home_goals == null) return null
                    const result = results[m.id]
                    const pts = calcPts(pick, result)

                    return (
                      <div key={m.id}
                        className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                          pts === 10 ? 'bg-green-900/20' : pts === 6 ? 'bg-yellow-900/20' :
                          pts === 4 ? 'bg-orange-900/20' : pts === 0 ? 'bg-red-900/10' : 'bg-gray-800/40'
                        }`}
                      >
                        <span className="text-gray-600 w-6 tabular-nums">{m.no}</span>
                        <span className="text-gray-400 flex-1 text-xs">Match {m.id}</span>
                        {pick?.home_goals != null ? (
                          <span className="font-bold tabular-nums text-gray-200">
                            {pick.home_goals}–{pick.away_goals}
                          </span>
                        ) : (
                          <span className="text-gray-600">–</span>
                        )}
                        {result?.home_goals != null && (
                          <span className="text-gray-500 tabular-nums ml-1">
                            ({result.home_goals}–{result.away_goals})
                          </span>
                        )}
                        {pts != null && (
                          <span className={`font-bold ml-1 ${pts > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {pts > 0 ? `+${pts}` : '✗'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AllPicks() {
  const { user } = useAuth()
  const [data,       setData]       = useState(null)
  const [matchDates, setMatchDates] = useState({})
  const [liveScores, setLiveScores] = useState({})
  const [viewMode,   setViewMode]   = useState('upcoming') // 'upcoming' | 'completed' | 'player'
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await picksApi.all()
        setData(res.data)
        setMatchDates(res.data.match_dates || {})
      } catch (err) {
        setError('Failed to load picks')
      } finally {
        setLoading(false)
      }
    }
    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [])

  // Live scores — separate poll, graceful on failure
  useEffect(() => {
    async function fetchLive() {
      try {
        const res = await liveApi.get()
        setLiveScores(res.data.scores || {})
      } catch {
        // silently ignore — live scores are supplemental
      }
    }
    fetchLive()
    const iv = setInterval(fetchLive, 45_000)
    return () => clearInterval(iv)
  }, [])

  if (loading) return <div className="p-8 text-gray-400 text-center">Loading…</div>
  if (error)   return <div className="p-8 text-red-400 text-center">{error}</div>

  // Gate: not locked, not admin
  if (data?.hidden) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-white mb-2">Picks are hidden until lock</h2>
        <p className="text-gray-400 text-sm max-w-xs mx-auto mb-6">
          To keep things fair, all predictions stay private until the admin locks submissions.
          Once locked, everyone's picks are revealed and scored here.
        </p>
        <div className="inline-flex items-center gap-2 bg-gray-800 px-4 py-2.5 rounded-xl text-sm text-gray-300">
          <span className="text-2xl font-black text-fifa-gold">{data.submitted_count}</span>
          <span>player{data.submitted_count !== 1 ? 's' : ''} have submitted picks</span>
        </div>
      </div>
    )
  }

  const { users = [], locked, matches = [], results = {} } = data || {}
  const groupMatches = matches.filter(m => m.round === 'Group')
  const upcomingGroupMatches  = groupMatches.filter(m => !results[m.id] || results[m.id].home_goals == null)
  const completedGroupMatches = groupMatches.filter(m => results[m.id]?.home_goals != null)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">📋 All Picks</h1>
          <p className="text-sm text-gray-400 mt-0.5">{users.length} players · click a row to expand picks</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {locked
            ? <span className="text-red-400">🔒 Picks locked</span>
            : <span className="text-green-400">🟢 Live</span>
          }
          <span className="text-gray-600">· auto-refreshes</span>
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex gap-1 mb-5 bg-gray-800/40 rounded-lg p-1 w-fit border border-gray-700/40">
        {[
          ['upcoming',  '📅 Live & Upcoming'],
          ['completed', '✅ Completed'],
          ['player',    '👥 By Player'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setViewMode(key)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              viewMode === key ? 'bg-fifa-gold text-gray-950' : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Upcoming view — unplayed group matches, chronological */}
      {viewMode === 'upcoming' && (
        <div className="space-y-6">
          {upcomingGroupMatches.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-3xl mb-3">🏁</p>
              <p className="text-sm font-medium">All group stage matches completed!</p>
            </div>
          ) : (
            getScheduleDays(upcomingGroupMatches, matchDates).map(([dayLabel, dayMatches]) => (
              <div key={dayLabel}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px bg-gray-700/60 flex-1" />
                  <span className="text-xs font-semibold text-gray-300 px-3 py-0.5 bg-gray-800/60 rounded-full border border-gray-700/50 whitespace-nowrap">
                    {dayLabel}
                  </span>
                  <div className="h-px bg-gray-700/60 flex-1" />
                </div>
                <div className="space-y-3">
                  {dayMatches.map(m => {
                    const result   = results[m.id]
                    const live     = liveScores[m.id]
                    const home     = typeof m.home === 'string' ? m.home : null
                    const away     = typeof m.away === 'string' ? m.away : null
                    const resultIn = result?.home_goals != null
                    return (
                      <div key={m.id} className="card py-2.5 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Time or live score badge */}
                          {live ? (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              live.status === 'live' ? 'bg-red-900/30 border-red-700/40 text-red-300'
                              : live.status === 'ht' ? 'bg-yellow-900/30 border-yellow-700/40 text-yellow-300'
                              : 'bg-gray-800 border-gray-700 text-gray-400'
                            }`}>
                              {live.status === 'live' && (
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                              )}
                              {fmtLiveClock(live)}
                              <span className={`font-black tabular-nums ml-0.5 ${live.status === 'ft' ? 'text-gray-300' : 'text-white'}`}>
                                {live.home_score}–{live.away_score}
                              </span>
                            </span>
                          ) : matchDates[m.id] ? (
                            <span className="text-[10px] text-gray-500 tabular-nums">{fmtMatchTime(matchDates[m.id])}</span>
                          ) : null}
                          <span className="text-[10px] font-bold text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">Grp {m.group}</span>
                          <span className="text-sm font-semibold text-white flex-1">
                            {home ? <>{getFlag(home)} {home}</> : 'TBD'}
                            <span className="text-gray-500 font-normal mx-1.5">vs</span>
                            {away ? <>{getFlag(away)} {away}</> : 'TBD'}
                          </span>
                          {resultIn && (
                            <span className="text-xs font-bold text-gray-200 bg-gray-700 px-2 py-0.5 rounded tabular-nums">
                              {result.home_goals}–{result.away_goals}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {users.map(u => {
                            const pick = u.picks[m.id]
                            const hasPick = pick?.home_goals != null
                            const pts = calcPts(pick, result)
                            const isMePick = u.user_id === user?.id
                            const label = getRealName(u.username) || displayName(u.username)
                            return (
                              <div
                                key={u.user_id}
                                className={`flex flex-col items-center px-2 py-1 rounded text-xs border ${
                                  pts === 10 ? 'bg-green-900/30 border-green-800/50' :
                                  pts === 6  ? 'bg-yellow-900/20 border-yellow-800/40' :
                                  pts === 4  ? 'bg-orange-900/20 border-orange-800/40' :
                                  pts === 0  ? 'bg-red-900/20 border-red-800/30' :
                                  'bg-gray-800/60 border-gray-700/40'
                                } ${isMePick ? 'ring-1 ring-fifa-gold/60 !border-fifa-gold/60' : ''}`}
                              >
                                <span className={`text-[9px] truncate max-w-[4rem] ${isMePick ? 'text-fifa-gold font-bold' : 'text-gray-400'}`}>
                                  {label}
                                </span>
                                {hasPick ? (
                                  <>
                                    <span className="font-bold tabular-nums text-gray-200">{pick.home_goals}–{pick.away_goals}</span>
                                    {pts != null && resultIn && (
                                      <span className={`text-[9px] font-bold ${pts > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {pts > 0 ? `+${pts}` : '✗'}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-gray-600 text-[9px]">–</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Completed view — group matches with results, most recent day first */}
      {viewMode === 'completed' && (
        <div className="space-y-6">
          {completedGroupMatches.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-3xl mb-3">⏳</p>
              <p className="text-sm font-medium">No completed matches yet.</p>
            </div>
          ) : (
            getScheduleDays(completedGroupMatches, matchDates).reverse().map(([dayLabel, dayMatches]) => (
              <div key={dayLabel}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px bg-gray-700/60 flex-1" />
                  <span className="text-xs font-semibold text-gray-500 px-3 py-0.5 bg-gray-800/60 rounded-full border border-gray-700/50 whitespace-nowrap">
                    ✓ {dayLabel}
                  </span>
                  <div className="h-px bg-gray-700/60 flex-1" />
                </div>
                <div className="space-y-3">
                  {dayMatches.map(m => {
                    const result = results[m.id]
                    const live   = liveScores[m.id]
                    const home = typeof m.home === 'string' ? m.home : null
                    const away = typeof m.away === 'string' ? m.away : null
                    const resultIn = result?.home_goals != null
                    return (
                      <div key={m.id} className="card py-2.5 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Live badge (same style as Upcoming view) */}
                          {live ? (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              live.status === 'live' ? 'bg-red-900/30 border-red-700/40 text-red-300'
                              : live.status === 'ht' ? 'bg-yellow-900/30 border-yellow-700/40 text-yellow-300'
                              : 'bg-gray-800 border-gray-700 text-gray-400'
                            }`}>
                              {live.status === 'live' && (
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                              )}
                              {fmtLiveClock(live)}
                              <span className={`font-black tabular-nums ml-0.5 ${live.status === 'ft' ? 'text-gray-300' : 'text-white'}`}>
                                {live.home_score}–{live.away_score}
                              </span>
                            </span>
                          ) : matchDates[m.id] ? (
                            <span className="text-[10px] text-gray-500 tabular-nums">{fmtMatchTime(matchDates[m.id])}</span>
                          ) : null}
                          <span className="text-[10px] font-bold text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">Grp {m.group}</span>
                          <span className="text-sm font-semibold text-white flex-1">
                            {home ? <>{getFlag(home)} {home}</> : 'TBD'}
                            <span className="text-gray-500 font-normal mx-1.5">vs</span>
                            {away ? <>{getFlag(away)} {away}</> : 'TBD'}
                          </span>
                          {resultIn && (
                            <span className="text-xs font-bold text-gray-200 bg-gray-700 px-2 py-0.5 rounded tabular-nums">
                              {result.home_goals}–{result.away_goals}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {users.map(u => {
                            const pick = u.picks[m.id]
                            const hasPick = pick?.home_goals != null
                            const pts = calcPts(pick, result)
                            const isMePick = u.user_id === user?.id
                            const label = getRealName(u.username) || displayName(u.username)
                            return (
                              <div
                                key={u.user_id}
                                className={`flex flex-col items-center px-2 py-1 rounded text-xs border ${
                                  pts === 10 ? 'bg-green-900/30 border-green-800/50' :
                                  pts === 6  ? 'bg-yellow-900/20 border-yellow-800/40' :
                                  pts === 4  ? 'bg-orange-900/20 border-orange-800/40' :
                                  pts === 0  ? 'bg-red-900/20 border-red-800/30' :
                                  'bg-gray-800/60 border-gray-700/40'
                                } ${isMePick ? 'ring-1 ring-fifa-gold/60 !border-fifa-gold/60' : ''}`}
                              >
                                <span className={`text-[9px] truncate max-w-[4rem] ${isMePick ? 'text-fifa-gold font-bold' : 'text-gray-400'}`}>
                                  {label}
                                </span>
                                {hasPick ? (
                                  <>
                                    <span className="font-bold tabular-nums text-gray-200">{pick.home_goals}–{pick.away_goals}</span>
                                    {pts != null && resultIn && (
                                      <span className={`text-[9px] font-bold ${pts > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {pts > 0 ? `+${pts}` : '✗'}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-gray-600 text-[9px]">–</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* By Player view — leaderboard + expandable rows */}
      {viewMode === 'player' && (
        <div className="space-y-2">
          {users.length === 0 && (
            <p className="text-gray-500 text-center py-8">No picks submitted yet.</p>
          )}
          {users.map((u, i) => (
            <UserRow
              key={u.user_id}
              userData={u}
              allMatches={matches}
              results={results}
              rank={i + 1}
              isMe={u.user_id === user?.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
