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

function pickBoxClass(pts, hasPick) {
  if (!hasPick)   return 'bg-red-900/80 border-red-600'
  if (pts === 10) return 'bg-green-700/45 border-green-500'
  if (pts === 6)  return 'bg-yellow-700/45 border-yellow-400'
  if (pts === 4)  return 'bg-blue-700/45 border-blue-500'
  if (pts === 0)  return 'bg-red-900/80 border-red-600'
  return 'bg-gray-800/60 border-gray-700/40'
}
// KO: 4 distinct tiers — 20 gold, 16 green, 14 teal, 10 blue, 0/no-pick red
function pickBoxClassKo(pts, hasAdvancePick) {
  if (!hasAdvancePick) return 'bg-red-900/80 border-red-600'
  if (pts == null) return 'bg-gray-800/60 border-gray-700/40'
  if (pts >= 20)  return 'bg-amber-600/45 border-amber-400'
  if (pts >= 16)  return 'bg-green-700/45 border-green-500'
  if (pts >= 14)  return 'bg-orange-700/45 border-orange-500'
  if (pts >= 10)  return 'bg-blue-700/45 border-blue-500'
  return 'bg-red-900/80 border-red-600'
}

// Solid, high-contrast points pill — the filled color makes each tier unmistakable.
function ptsPill(pts) {
  if (pts === 10) return 'bg-green-500 text-green-950'
  if (pts === 6)  return 'bg-yellow-400 text-yellow-950'
  if (pts === 4)  return 'bg-blue-500 text-white'
  return 'bg-red-600 text-white'
}
function ptsPillKo(pts) {
  if (pts == null) return ''
  if (pts >= 20) return 'bg-amber-500 text-amber-950'
  if (pts >= 16) return 'bg-green-500 text-green-950'
  if (pts >= 14) return 'bg-orange-500 text-orange-950'
  if (pts >= 10) return 'bg-blue-500 text-white'
  return 'bg-red-600 text-white'
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

// Mirror of server scoring — compute provisional live points client-side
function scoreMatchClient(pick, home_score, away_score) {
  if (!pick || pick.home_goals == null || home_score == null || away_score == null) return 0
  const ph = Number(pick.home_goals), pa = Number(pick.away_goals)
  const rh = Number(home_score),      ra = Number(away_score)
  if (isNaN(ph) || isNaN(pa)) return 0
  if (ph === rh && pa === ra) return 10
  const outcome = (h, a) => h > a ? 'home' : a > h ? 'away' : 'draw'
  if (outcome(ph, pa) !== outcome(rh, ra)) return 0
  if (ph - pa === rh - ra) return 6
  return 4
}

/** Expandable user row */
function UserRow({ userData, allMatches, results, rank, isMe, liveBonus = 0, hasActiveLive = false }) {
  const [open, setOpen] = useState(false)
  const realName = getRealName(userData.username)
  const liveTotal = userData.total + liveBonus

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
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-lg w-8 text-center shrink-0">
            {MEDALS[rank - 1] || <span className="text-sm text-gray-400">{rank}.</span>}
          </span>
          <div className="min-w-0">
            <span className={`font-semibold truncate block ${isMe ? 'text-fifa-gold' : 'text-white'}`}>
              {displayName(userData.username)}
              {isMe
                ? <span className="ml-1 text-xs text-gray-500">(you)</span>
                : realName && <span className="ml-1 text-xs text-gray-500">({realName})</span>
              }
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="font-black text-lg tabular-nums text-white">
                {liveTotal}
                <span className="text-xs font-normal text-gray-500 ml-1">pts</span>
              </span>
              {liveBonus > 0 && (
                <span className={`text-[10px] font-bold px-1 py-0.5 rounded whitespace-nowrap ${
                  hasActiveLive ? 'bg-red-900/50 text-red-400 border border-red-700/50'
                                : 'bg-orange-900/50 text-orange-400 border border-orange-700/50'
                }`}>
                  +{liveBonus}{hasActiveLive ? ' 🔴' : ' ⏳'}
                </span>
              )}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
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

          {/* Knockout picks — show scoreline pick + who they advanced */}
          {koRounds.map(round => {
            const rMatches = allMatches.filter(m => m.round === round)
            // Only show matches where ESPN has assigned actual teams
            const knownMatches = rMatches.filter(m => results[m.id]?.home_team)
            if (!knownMatches.length) return null
            const hasAny = knownMatches.some(m =>
              userData.picks[m.id]?.home_goals != null || userData.bracket_picks?.[m.id]
            )
            if (!hasAny) return null

            return (
              <div key={round}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-wide">
                    {round === 'R32' ? 'Round of 32' : round === 'R16' ? 'Round of 16' :
                     round === 'QF' ? 'Quarter-finals' : round === 'SF' ? 'Semi-finals' : 'Final'}
                  </span>
                </div>
                <div className="space-y-1">
                  {knownMatches.map(m => {
                    const pick        = userData.picks[m.id]
                    const advancePick = userData.bracket_picks?.[m.id]
                    const result      = results[m.id]
                    const homeTeam    = result?.home_team
                    const awayTeam    = result?.away_team
                    const actualWinner = result?.winner
                    const koPts       = userData.knockout_breakdown?.[m.id]
                    const totalPts    = koPts?.total ?? null
                    const resultIn    = result?.home_goals != null

                    const rowBg = totalPts == null ? 'bg-gray-800/40'
                      : totalPts >= 14 ? 'bg-green-900/20'
                      : totalPts >= 10 ? 'bg-yellow-900/20'
                      : totalPts > 0   ? 'bg-blue-900/20'
                      : 'bg-red-900/10'

                    return (
                      <div key={m.id} className={`px-2 py-1.5 rounded text-xs ${rowBg}`}>
                        {/* Line 1: teams + score pick + result */}
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 w-5 tabular-nums shrink-0">{m.no}</span>
                          <span className="text-gray-300 flex-1 text-right truncate">
                            {homeTeam ? <>{getFlag(homeTeam)} {homeTeam}</> : '—'}
                          </span>
                          {pick?.home_goals != null ? (
                            <span className="font-bold tabular-nums text-gray-200 w-10 text-center shrink-0">
                              {pick.home_goals}–{pick.away_goals}
                            </span>
                          ) : (
                            <span className="text-gray-600 w-10 text-center shrink-0">–</span>
                          )}
                          <span className="text-gray-300 flex-1 truncate">
                            {awayTeam ? <>{getFlag(awayTeam)} {awayTeam}</> : '—'}
                          </span>
                          {resultIn && (
                            <span className="text-gray-500 w-10 text-right tabular-nums shrink-0">
                              {result.home_goals}–{result.away_goals}
                            </span>
                          )}
                          {totalPts != null && (
                            <span className={`w-7 text-right font-bold shrink-0 ${totalPts > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {totalPts > 0 ? `+${totalPts}` : '✗'}
                            </span>
                          )}
                        </div>
                        {/* Line 2: advancement pick */}
                        {advancePick && (
                          <div className="flex items-center gap-1 mt-0.5 pl-7">
                            <span className="text-gray-600 text-[10px]">advances:</span>
                            <span className={`text-[10px] font-semibold ${
                              actualWinner == null ? 'text-gray-400'
                              : actualWinner === advancePick ? 'text-green-400'
                              : 'text-red-400'
                            }`}>
                              {getFlag(advancePick)} {advancePick}
                              {actualWinner === advancePick && ' ✓'}
                              {actualWinner && actualWinner !== advancePick && ' ✗'}
                            </span>
                          </div>
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

  // Knockout: only show matches where ESPN has assigned actual teams
  const knockoutMatches = matches.filter(m => m.round !== 'Group' && results[m.id]?.home_team)

  const upcomingMatches  = [
    ...groupMatches.filter(m => !results[m.id] || results[m.id].home_goals == null),
    ...knockoutMatches.filter(m => results[m.id].home_goals == null && !results[m.id].winner),
  ]
  const completedMatches = [
    ...groupMatches.filter(m => results[m.id]?.home_goals != null),
    ...knockoutMatches.filter(m => results[m.id].home_goals != null || results[m.id].winner),
  ]

  // Keep legacy aliases used inside the two view sections below
  const upcomingGroupMatches  = upcomingMatches
  const completedGroupMatches = completedMatches

  // ── Live scoring computation ────────────────────────────────────────────────
  // Pending: ESPN has a score but admin hasn't confirmed yet
  const pendingMatches = Object.entries(liveScores).filter(([id, s]) => {
    if (s.home_score == null || s.away_score == null) return false
    if (!['live', 'ht', 'ft'].includes(s.status)) return false
    return !(results[id]?.home_goals != null)
  })
  const hasActiveLive = pendingMatches.some(([, s]) => s.status === 'live' || s.status === 'ht')

  // Per-user live bonus (for By Player view)
  const userLiveBonusMap = {}
  for (const u of users) {
    let bonus = 0
    for (const [matchId, s] of pendingMatches) {
      const pick = u.picks[matchId]
      if (pick?.home_goals != null) bonus += scoreMatchClient(pick, s.home_score, s.away_score)
    }
    userLiveBonusMap[u.user_id] = bonus
  }

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

      {/* ── Upcoming view — unplayed group matches, chronological ── */}
      {viewMode === 'upcoming' && (
        <div className="space-y-6">
          {upcomingGroupMatches.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-3xl mb-3">🏁</p>
              <p className="text-sm font-medium">All matches completed!</p>
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
                    const isKo     = m.round !== 'Group'
                    const home     = isKo ? (result?.home_team || null) : (typeof m.home === 'string' ? m.home : null)
                    const away     = isKo ? (result?.away_team || null) : (typeof m.away === 'string' ? m.away : null)
                    const resultIn = result?.home_goals != null
                    const roundLabel = isKo
                      ? (m.round === 'R32' ? 'R32' : m.round === 'R16' ? 'R16' :
                         m.round === 'QF' ? 'QF' : m.round === 'SF' ? 'SF' :
                         m.round === 'Third' ? '3rd' : 'Final')
                      : null
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
                          {isKo
                            ? <span className="text-[10px] font-bold text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded border border-purple-700/40">{roundLabel}</span>
                            : <span className="text-[10px] font-bold text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">Grp {m.group}</span>
                          }
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
                            const advancePick = isKo ? (u.bracket_picks?.[m.id] ?? null) : null
                            const hasAdvancePick = isKo ? !!advancePick : false
                            const advanceWrong = isKo && hasAdvancePick && !!result?.winner && advancePick !== result.winner
                            const pts = isKo
                              ? (resultIn || result?.winner ? (u.knockout_breakdown?.[m.id]?.total ?? (advanceWrong ? 0 : null)) : null)
                              : calcPts(pick, result)
                            const livePts = !resultIn && live?.home_score != null && hasPick
                              ? scoreMatchClient(pick, live.home_score, live.away_score)
                              : null
                            const showPts = (resultIn || result?.winner) ? pts : livePts
                            const isMePick = u.user_id === user?.id
                            const label = getRealName(u.username) || displayName(u.username)
                            return (
                              <div
                                key={u.user_id}
                                className={`relative flex flex-col items-center px-2 py-1 rounded text-xs border ${
                                  isKo ? pickBoxClassKo(showPts, hasAdvancePick) : pickBoxClass(showPts, hasPick)
                                } ${isMePick ? 'z-10 ring-2 ring-fifa-gold shadow-[0_0_9px_rgba(201,162,39,0.65)]' : ''}`}
                              >
                                <span className={`text-[9px] truncate max-w-[4rem] ${isMePick ? 'text-fifa-gold font-bold' : 'text-gray-400'}`}>
                                  {label}
                                </span>
                                {hasPick ? (
                                  <>
                                    <span className="font-bold tabular-nums text-gray-200 text-[11px] leading-tight">
                                      {pick.home_goals}–{pick.away_goals}
                                    </span>
                                    {showPts != null && (
                                      <span className={`mt-0.5 px-1 rounded text-[9px] font-bold leading-tight ${
                                        isKo ? ptsPillKo(showPts) : ptsPill(showPts)
                                      }`}>
                                        {showPts > 0 ? `+${showPts}` : '✗'}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-gray-400 text-[9px]">—</span>
                                )}
                                {isKo && advancePick && (() => {
                                  const actual = result?.winner
                                  const cls = actual == null ? 'text-gray-500'
                                    : actual === advancePick ? 'text-green-400'
                                    : 'text-red-400'
                                  return (
                                    <span className={`text-[8px] truncate max-w-[4.5rem] ${cls}`}>
                                      →{getFlag(advancePick)} {advancePick}
                                    </span>
                                  )
                                })()}
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

      {/* ── Completed view — group matches with results, most recent day first ── */}
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
                    const isKo   = m.round !== 'Group'
                    const home   = isKo ? (result?.home_team || null) : (typeof m.home === 'string' ? m.home : null)
                    const away   = isKo ? (result?.away_team || null) : (typeof m.away === 'string' ? m.away : null)
                    const resultIn = result?.home_goals != null
                    const roundLabel = isKo
                      ? (m.round === 'R32' ? 'R32' : m.round === 'R16' ? 'R16' :
                         m.round === 'QF' ? 'QF' : m.round === 'SF' ? 'SF' :
                         m.round === 'Third' ? '3rd' : 'Final')
                      : null
                    return (
                      <div key={m.id} className="card py-2.5 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {matchDates[m.id] ? (
                            <span className="text-[10px] text-gray-600 tabular-nums">{fmtMatchTime(matchDates[m.id])}</span>
                          ) : null}
                          {isKo
                            ? <span className="text-[10px] font-bold text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded border border-purple-700/40">{roundLabel}</span>
                            : <span className="text-[10px] font-bold text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">Grp {m.group}</span>
                          }
                          <span className="text-sm font-semibold text-white flex-1">
                            {home ? <>{getFlag(home)} {home}</> : 'TBD'}
                            <span className="text-gray-500 font-normal mx-1.5">vs</span>
                            {away ? <>{getFlag(away)} {away}</> : 'TBD'}
                          </span>
                          {resultIn && (
                            <span className="text-xs font-bold text-white bg-gray-700 px-2 py-0.5 rounded tabular-nums">
                              FT {result.home_goals}–{result.away_goals}
                            </span>
                          )}
                          {!resultIn && result?.winner && (
                            <span className="text-xs font-bold text-white bg-gray-700 px-2 py-0.5 rounded">
                              W: {result.winner}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {users.map(u => {
                            const pick = u.picks[m.id]
                            const hasPick = pick?.home_goals != null
                            const koPtsObj = isKo ? (u.knockout_breakdown?.[m.id] ?? null) : null
                            const advancePick = isKo ? (u.bracket_picks?.[m.id] ?? null) : null
                            const hasAdvancePick = isKo ? !!advancePick : false
                            const advanceWrong = isKo && hasAdvancePick && !!result?.winner && advancePick !== result.winner
                            const pts = isKo ? (koPtsObj?.total ?? (advanceWrong ? 0 : null)) : calcPts(pick, result)
                            const isMePick = u.user_id === user?.id
                            const label = getRealName(u.username) || displayName(u.username)
                            return (
                              <div
                                key={u.user_id}
                                className={`relative flex flex-col items-center px-2 py-1 rounded text-xs border ${
                                  isKo ? pickBoxClassKo(pts, hasAdvancePick) : pickBoxClass(pts, hasPick)
                                } ${isMePick ? 'z-10 ring-2 ring-fifa-gold shadow-[0_0_9px_rgba(201,162,39,0.65)]' : ''}`}
                              >
                                <span className={`text-[9px] truncate max-w-[4.5rem] ${isMePick ? 'text-fifa-gold font-bold' : 'text-gray-400'}`}>
                                  {label}
                                </span>
                                {isKo ? (
                                  <>
                                    {/* Score pick */}
                                    {hasPick ? (
                                      <span className="font-bold tabular-nums text-gray-200 text-[11px] leading-tight">
                                        {pick.home_goals}–{pick.away_goals}
                                      </span>
                                    ) : (
                                      <span className="text-gray-500 text-[9px]">—</span>
                                    )}
                                    {/* Advance pick */}
                                    {advancePick ? (
                                      <span className={`text-[8px] truncate max-w-[4.5rem] leading-tight ${
                                        result?.winner == null ? 'text-gray-500'
                                        : result.winner === advancePick ? 'text-green-400'
                                        : 'text-red-400'
                                      }`}>
                                        →{getFlag(advancePick)} {advancePick}
                                        {result?.winner === advancePick ? ' ✓' : result?.winner ? ' ✗' : ''}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 text-[8px]">—</span>
                                    )}
                                    {/* Breakdown: score pts + +10 advance + total */}
                                    {koPtsObj ? (() => {
                                      const sp  = koPtsObj.score ?? 0
                                      const ap  = koPtsObj.advance ?? 0
                                      const tot = koPtsObj.total ?? 0
                                      return (
                                        <div className="flex items-center gap-0.5 mt-0.5 justify-center flex-wrap">
                                          {hasPick && (
                                            <span className={`px-1 rounded text-[8px] font-bold leading-tight ${
                                              sp === 10 ? 'bg-green-500 text-green-950'
                                              : sp === 6 ? 'bg-yellow-400 text-yellow-950'
                                              : sp === 4 ? 'bg-blue-500 text-white'
                                              : 'bg-gray-700/70 text-gray-400'
                                            }`}>+{sp}</span>
                                          )}
                                          <span className={`px-1 rounded text-[8px] font-bold leading-tight ${
                                            ap === 10 ? 'bg-emerald-600 text-white' : 'bg-red-900/80 text-red-400'
                                          }`}>
                                            {ap === 10 ? '+10 ✓' : '✗'}
                                          </span>
                                          {tot > 0 && (
                                            <span className={`text-[8px] font-black tabular-nums ${
                                              tot >= 20 ? 'text-amber-300'
                                              : tot >= 16 ? 'text-green-300'
                                              : tot >= 14 ? 'text-orange-300'
                                              : tot >= 10 ? 'text-blue-300'
                                              : 'text-gray-300'
                                            }`}>={tot}</span>
                                          )}
                                        </div>
                                      )
                                    })() : advanceWrong ? (
                                      <div className="flex items-center gap-0.5 mt-0.5 justify-center">
                                        <span className="px-1 rounded text-[8px] font-bold leading-tight bg-red-600 text-white">✗</span>
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  /* Group picks */
                                  hasPick ? (
                                    <>
                                      <span className="font-bold tabular-nums text-gray-200 text-[11px] leading-tight">
                                        {pick.home_goals}–{pick.away_goals}
                                      </span>
                                      {pts != null && (
                                        <span className={`mt-0.5 px-1 rounded text-[9px] font-bold leading-tight ${ptsPill(pts)}`}>
                                          {pts > 0 ? `+${pts}` : '✗'}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-gray-400 text-[9px]">—</span>
                                  )
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

      {/* ── By Player view — leaderboard + expandable rows ── */}
      {viewMode === 'player' && (
        <div className="space-y-2">
          {users.length === 0 && (
            <p className="text-gray-500 text-center py-8">No picks submitted yet.</p>
          )}
          {/* Live context banner when a match is in play */}
          {hasActiveLive && (
            <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 mb-2 bg-red-900/20 border border-red-800/40 text-red-300">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span>Live totals — updating as match progresses</span>
            </div>
          )}
          {users.map((u, i) => (
            <UserRow
              key={u.user_id}
              userData={u}
              allMatches={matches}
              results={results}
              rank={i + 1}
              isMe={u.user_id === user?.id}
              liveBonus={userLiveBonusMap[u.user_id] || 0}
              hasActiveLive={hasActiveLive}
            />
          ))}
        </div>
      )}
    </div>
  )
}
