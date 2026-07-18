import { useState, useEffect, useMemo } from 'react'
import { picks as picksApi, liveScores as liveApi, tournament as tournamentApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { getRealName } from '../utils/nicknames'

const MEDALS = ['🥇', '🥈', '🥉']
const displayName = (u) => u.replace(/@.+$/, '')

// ─── Live scoring helpers (mirrors AllPicks.jsx) ──────────────────────────────
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

function resolvePredSide(side, bracketPicks, resolved) {
  if (!side || typeof side === 'string') return null
  if (side.win) return bracketPicks[side.win] || null
  if (side.lose) {
    const teams = resolved?.[side.lose]
    const winner = bracketPicks[side.lose]
    if (!teams || !winner) return null
    if (teams.home === winner) return teams.away
    if (teams.away === winner) return teams.home
    return null
  }
  return null
}

function buildUserResolvedTeams(knockoutStructure, bracketPicks) {
  const resolved = {}
  for (const m of knockoutStructure) {
    const ph = resolvePredSide(m.home, bracketPicks, resolved)
    const pa = resolvePredSide(m.away, bracketPicks, resolved)
    if (ph || pa) resolved[m.id] = { home: ph, away: pa }
  }
  return resolved
}

function buildParentsMap(knockout) {
  const map = {}
  for (const m of knockout) {
    map[m.id] = {
      homeSrc: m.home?.win || null,
      awaySrc: m.away?.win || null,
      hasLose: !!(m.home?.lose || m.away?.lose),
    }
  }
  return map
}

function getMatchupStatus(match, result, userBracketPicks, parentsMap, allResults, userResolvedTeams) {
  const actualHome = result?.home_team
  const actualAway = result?.away_team
  if (!actualHome || !actualAway) return 'unknown'

  const isR32 = typeof match.home === 'string' && typeof match.away === 'string'
  if (isR32) return 'r32'

  if (match.round === 'Third') {
    const tp3Advance = userBracketPicks?.[match.id]
    if (!tp3Advance) return 'no-pick'
    if (tp3Advance !== actualHome && tp3Advance !== actualAway) return 'eliminated'
    const predM103 = userResolvedTeams?.['m103']
    const pred1 = predM103?.home, pred2 = predM103?.away
    if (!pred1 || !pred2) return 'advance-only'
    const matchupCorrect =
      (pred1 === actualHome && pred2 === actualAway) ||
      (pred1 === actualAway && pred2 === actualHome)
    return matchupCorrect ? 'correct' : 'advance-only'
  }

  const advancePick = userBracketPicks?.[match.id]
  if (!advancePick) return 'no-pick'
  const inMatch = advancePick === actualHome || advancePick === actualAway

  const p = parentsMap[match.id]
  if (!p || p.hasLose) return inMatch ? 'advance-only' : 'eliminated'

  const predHome = p.homeSrc ? (userBracketPicks?.[p.homeSrc] || null) : null
  const predAway = p.awaySrc ? (userBracketPicks?.[p.awaySrc] || null) : null
  if (!predHome || !predAway) return inMatch ? 'advance-only' : 'eliminated'

  const matchupCorrect =
    new Set([predHome, predAway]).size === 2 &&
    ((predHome === actualHome && predAway === actualAway) ||
     (predHome === actualAway && predAway === actualHome))

  if (matchupCorrect) return inMatch ? 'correct' : 'eliminated'
  return inMatch ? 'advance-only' : 'eliminated'
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Leaderboard() {
  const { user } = useAuth()
  const [lbData,           setLbData]           = useState(null)
  const [allData,          setAllData]          = useState(null)
  const [liveScores,       setLiveScores]       = useState({})
  const [knockoutStructure,setKnockoutStructure]= useState([])
  const [loading,          setLoading]          = useState(true)

  const parentsMap = useMemo(() => buildParentsMap(knockoutStructure), [knockoutStructure])

  // Knockout structure (for Third Place matchup resolution)
  useEffect(() => {
    tournamentApi.data()
      .then(t => setKnockoutStructure(t.data.knockout || []))
      .catch(() => {})
  }, [])

  // Leaderboard base data (win_pct, prev_rank, totals)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await picksApi.leaderboard()
        if (!cancelled) { setLbData(res.data); setLoading(false) }
      } catch (err) {
        console.error('[Leaderboard] load error:', err)
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const iv = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  // All picks (per-user picks + bracket_picks for live bonus; hidden until locked)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await picksApi.all()
        if (!cancelled) setAllData(res.data)
      } catch {}
    }
    load()
    const iv = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  // Live scores
  useEffect(() => {
    async function fetchLive() {
      try {
        const res = await liveApi.get()
        setLiveScores(res.data.scores || {})
      } catch {}
    }
    fetchLive()
    const iv = setInterval(fetchLive, 45_000)
    return () => clearInterval(iv)
  }, [])

  if (loading) return <div className="p-8 text-gray-400 text-center">Loading…</div>

  const { leaderboard = [], locked, results_count = 0 } = lbData || {}
  const submitted    = leaderboard.filter(e => e.has_picks)
  const notSubmitted = leaderboard.filter(e => !e.has_picks)
  const submittedAlpha = [...submitted].sort((a, b) => a.username.localeCompare(b.username))

  // Live bonus computation (only when allData is available)
  const allResults = allData?.results || {}
  const allMatches = allData?.matches || []
  const matchById = {}
  for (const m of allMatches) matchById[m.id] = m

  const pendingMatches = Object.entries(liveScores).filter(([id, s]) => {
    if (s.home_score == null || s.away_score == null) return false
    if (!['live', 'ht', 'ft'].includes(s.status)) return false
    return !(allResults[id]?.home_goals != null)
  })
  const hasActiveLive = pendingMatches.some(([, s]) => s.status === 'live' || s.status === 'ht')

  const userPicksMap   = {}
  const userBracketMap = {}
  for (const u of (allData?.users || [])) {
    userPicksMap[u.user_id]   = u.picks         || {}
    userBracketMap[u.user_id] = u.bracket_picks || {}
  }

  const userLiveBonusMap = {}
  for (const entry of submitted) {
    const uid     = entry.user_id
    const uPicks  = userPicksMap[uid]   || {}
    const uBrkt   = userBracketMap[uid] || {}
    let bonus = 0
    for (const [matchId, s] of pendingMatches) {
      const pick = uPicks[matchId]
      if (pick?.home_goals == null) continue
      const m   = matchById[matchId]
      const isKo  = m && m.round !== 'Group'
      const isR32 = isKo && typeof m?.home === 'string' && typeof m?.away === 'string'
      if (isKo && !isR32) {
        const userRT = (m.round === 'Third')
          ? buildUserResolvedTeams(knockoutStructure, uBrkt)
          : null
        const mStatus = getMatchupStatus(m, allResults[matchId], uBrkt, parentsMap, allResults, userRT)
        if (mStatus !== 'correct') continue
      }
      bonus += scoreMatchClient(pick, s.home_score, s.away_score)
    }
    userLiveBonusMap[uid] = bonus
  }

  // Live-adjusted totals + ranking
  const withLive = submitted.map(e => ({
    ...e,
    liveBonus: userLiveBonusMap[e.user_id] || 0,
    liveTotal: e.total + (userLiveBonusMap[e.user_id] || 0),
  }))
  const sorted = [...withLive].sort((a, b) =>
    b.liveTotal - a.liveTotal ||
    (b.win_pct ?? 0) - (a.win_pct ?? 0) ||
    a.username.localeCompare(b.username)
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">🏆 Overall Leaderboard</h1>
          <p className="text-xs text-gray-500 mt-1">
            Group + Knockout · {results_count} result{results_count !== 1 ? 's' : ''} · auto-refreshes
          </p>
        </div>
        {hasActiveLive && (
          <span className="flex items-center gap-1.5 text-xs text-red-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            Live updating
          </span>
        )}
      </div>

      {!locked ? (
        /* Picks still open — show who's submitted */
        <div className="space-y-4 mb-6">
          <div className="card">
            <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-medium">
              Submitted ({submitted.length})
            </p>
            {submitted.length === 0 ? (
              <p className="text-gray-500 text-sm">No picks submitted yet.</p>
            ) : (
              <div className="divide-y divide-gray-800">
                {submittedAlpha.map(entry => {
                  const isMe = entry.user_id === user?.id
                  const realName = getRealName(entry.username)
                  return (
                    <div key={entry.user_id} className="flex items-center justify-between py-2.5">
                      <span className={`font-medium ${isMe ? 'text-fifa-gold' : 'text-white'}`}>
                        {displayName(entry.username)}
                        {isMe
                          ? <span className="ml-1 text-xs text-gray-500">(you)</span>
                          : realName && <span className="ml-1 text-xs text-gray-500 font-normal">({realName})</span>
                        }
                      </span>
                      <span className="text-xs text-green-400">✓ {entry.picks_count} picks</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {notSubmitted.length > 0 && (
            <div className="card">
              <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-medium">
                Not submitted yet ({notSubmitted.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {notSubmitted.map(e => (
                  <span key={e.user_id} className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">
                    {displayName(e.username)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-center text-gray-600">
            Rankings and scores are revealed once picks are locked.
          </p>
        </div>
      ) : (
        /* Locked — live leaderboard */
        <>
          {hasActiveLive && (
            <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 mb-3 bg-red-900/20 border border-red-800/40 text-red-300">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span>Live totals — updating as the match progresses</span>
            </div>
          )}

          <div className="card divide-y divide-gray-800 mb-6">
            {sorted.length === 0 && (
              <p className="text-gray-400 text-sm py-6 text-center">No picks submitted yet.</p>
            )}
            {sorted.map((entry, i) => {
              const isMe      = entry.user_id === user?.id
              const realName  = getRealName(entry.username)
              const prevRank  = entry.prev_rank
              const rankChange = prevRank != null ? prevRank - (i + 1) : null

              return (
                <div key={entry.user_id} className={`py-3 px-1 ${isMe ? 'text-fifa-gold' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Rank + arrow */}
                      <div className="flex items-center gap-0.5 w-12 shrink-0">
                        <span className="text-xl w-8 text-center">
                          {MEDALS[i] ?? <span className="text-sm text-gray-400">{i + 1}.</span>}
                        </span>
                        {rankChange != null && rankChange !== 0 && (
                          <span className={`text-[10px] font-bold leading-none ${rankChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {rankChange > 0 ? `▲${rankChange}` : `▼${Math.abs(rankChange)}`}
                          </span>
                        )}
                      </div>
                      {/* Name + sub-score breakdown */}
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold truncate">{displayName(entry.username)}</span>
                          {isMe
                            ? <span className="text-xs text-gray-500 shrink-0">(you)</span>
                            : realName && <span className="text-xs text-gray-500 font-normal shrink-0">({realName})</span>
                          }
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-600 tabular-nums">
                          <span>{entry.group_total ?? 0} grp</span>
                          <span className="text-gray-700">+</span>
                          <span>{(entry.knockout_total ?? 0) + entry.liveBonus} ko</span>
                          {entry.win_pct > 0 && (
                            <span className="text-gray-700">{entry.win_pct}% 🏆</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="font-black text-xl tabular-nums">
                          {entry.liveTotal}
                          <span className="text-sm font-normal text-gray-500 ml-1">pts</span>
                        </span>
                        {entry.liveBonus > 0 && (
                          <span className={`text-[10px] font-bold px-1 py-0.5 rounded whitespace-nowrap ${
                            hasActiveLive
                              ? 'bg-red-900/50 text-red-400 border border-red-700/50'
                              : 'bg-orange-900/50 text-orange-400 border border-orange-700/50'
                          }`}>
                            +{entry.liveBonus}{hasActiveLive ? ' 🔴' : ' ⏳'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {locked && notSubmitted.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            No picks ({notSubmitted.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {notSubmitted.map(e => (
              <span key={e.user_id} className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">
                {displayName(e.username)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Scoring legend */}
      <div className="card text-xs text-gray-500">
        <p className="font-semibold text-gray-300 mb-3">Scoring system</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">Group stage</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="bg-green-700 text-green-100 px-1.5 py-0.5 rounded font-bold">+10</span>
                <span>Exact score</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-yellow-700 text-yellow-100 px-1.5 py-0.5 rounded font-bold">+6</span>
                <span>Right winner + goal diff</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-blue-700 text-blue-100 px-1.5 py-0.5 rounded font-bold">+4</span>
                <span>Right winner / draw</span>
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">Knockout</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="bg-emerald-700 text-emerald-100 px-1.5 py-0.5 rounded font-bold">+10</span>
                <span>Correct advance pick</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-green-700 text-green-100 px-1.5 py-0.5 rounded font-bold">+10</span>
                <span>Score bonus (if matchup correct)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-gray-700 text-gray-100 px-1.5 py-0.5 rounded font-bold">20</span>
                <span>Max per match</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
