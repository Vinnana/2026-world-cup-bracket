import { useState, useEffect } from 'react'
import { picks as picksApi, liveScores as liveScoresApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { getRealName } from '../utils/nicknames'
import { getFlag } from '../utils/flags'

const MEDALS = ['🥇', '🥈', '🥉']

// Strip email domain so "john@gmail.com" renders as "john"
const displayName = (username) => username.replace(/@.+$/, '')

// Mirror of server/scoring.js — compute provisional live points client-side
function scoreMatchClient(pick, home_score, away_score) {
  if (!pick || home_score == null || away_score == null) return 0
  const ph = Number(pick.home_goals), pa = Number(pick.away_goals)
  const rh = Number(home_score),      ra = Number(away_score)
  if (isNaN(ph) || isNaN(pa)) return 0
  if (ph === rh && pa === ra) return 10
  const outcome = (h, a) => h > a ? 'home' : a > h ? 'away' : 'draw'
  if (outcome(ph, pa) !== outcome(rh, ra)) return 0
  if (ph - pa === rh - ra) return 6
  return 4
}

// Live points chip color by scoring tier: +10 green · +6 yellow · +4 blue · ✗ red.
// Aggregate sums across multiple live matches that aren't an exact tier read as green (gaining).
function liveBonusChipClass(bonus) {
  if (bonus === 10) return 'bg-green-900/50 text-green-400 border border-green-700/50'
  if (bonus === 6)  return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50'
  if (bonus === 4)  return 'bg-blue-900/50 text-blue-400 border border-blue-700/50'
  if (bonus > 0)    return 'bg-green-900/50 text-green-400 border border-green-700/50'
  return 'bg-red-900/50 text-red-400 border border-red-700/50'
}

export default function Leaderboard() {
  const { user } = useAuth()
  const [data,        setData]        = useState(null)
  const [allPicksData, setAllPicksData] = useState(null)
  const [espnScores,  setEspnScores]  = useState({})
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // Fetch leaderboard + ESPN live scores in parallel
        const [lbRes, liveRes] = await Promise.all([
          picksApi.leaderboard(),
          liveScoresApi.get().catch(() => ({ data: { scores: {} } })),
        ])
        if (cancelled) return
        setData(lbRes.data)
        setEspnScores(liveRes.data?.scores || {})

        // picks/all is needed for live computation — only available once picks are locked
        if (lbRes.data?.locked) {
          const allRes = await picksApi.all().catch(() => null)
          if (!cancelled && allRes?.data && !allRes.data.hidden) {
            setAllPicksData(allRes.data)
          }
        }
      } catch (err) {
        console.error('[Leaderboard] load error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const iv = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  if (loading) return <div className="p-8 text-gray-400 text-center">Loading…</div>

  const { leaderboard = [], locked, results_count = 0 } = data || {}

  // ── Live scoring computation ────────────────────────────────────────────────

  // User picks lookup: { user_id: { [match_id]: { home_goals, away_goals } } }
  const userPicksMap = {}
  for (const u of allPicksData?.users || []) {
    userPicksMap[u.user_id] = u.picks || {}
  }

  // Official (admin-confirmed) results: { [match_id]: { home_goals, away_goals, ... } }
  const officialResults = allPicksData?.results || {}

  // Pending matches: ESPN has a score AND admin hasn't confirmed the result yet.
  // Only meaningful when allPicksData is loaded (otherwise officialResults is empty
  // and every ESPN match would falsely appear "unconfirmed").
  const pendingMatches = allPicksData
    ? Object.entries(espnScores).filter(([id, s]) => {
        if (s.home_score == null || s.away_score == null) return false
        if (!['live', 'ht', 'ft'].includes(s.status)) return false
        const confirmed = officialResults[id] && officialResults[id].home_goals != null
        return !confirmed
      })
    : []

  // Matches that are actively in play right now
  const hasActiveLive = pendingMatches.some(([, s]) => s.status === 'live' || s.status === 'ht')
  // Any pending ESPN data at all (live OR just-finished but unconfirmed)
  const hasPending    = pendingMatches.length > 0
  // When 2+ games overlap, label each chip with the match's flags to tell them apart
  const multiLive     = pendingMatches.length > 1
  const matchById     = {}
  for (const m of allPicksData?.matches || []) matchById[m.id] = m

  // Compute live points per user. Keep the summed bonus for the total/ranking,
  // plus a per-match breakdown so overlapping games are shown separately.
  const liveBonusMap = {}
  const liveBreakdownMap = {}   // user_id → [{ id, pts, status }] (one per game they picked)
  if (locked && allPicksData && hasPending) {
    for (const entry of leaderboard) {
      const picks = userPicksMap[entry.user_id] || {}
      let bonus = 0
      const breakdown = []
      for (const [matchId, s] of pendingMatches) {
        const p = picks[matchId]
        if (p && p.home_goals != null) {
          const pts = scoreMatchClient(p, s.home_score, s.away_score)
          bonus += pts
          breakdown.push({ id: matchId, pts, status: s.status })
        }
      }
      liveBonusMap[entry.user_id] = bonus
      liveBreakdownMap[entry.user_id] = breakdown
    }
  }

  const showingLive = locked && hasPending // whether the live overlay is active

  // ── Build live-sorted leaderboard ──────────────────────────────────────────

  const liveSortedLeaderboard = locked
    ? [...leaderboard]
        .map(e => ({
          ...e,
          liveBonus: liveBonusMap[e.user_id] || 0,
          liveTotal: e.total + (liveBonusMap[e.user_id] || 0),
        }))
        .sort((a, b) =>
          b.liveTotal - a.liveTotal ||
          b.win_pct  - a.win_pct  ||
          a.username.localeCompare(b.username)
        )
    : leaderboard

  // Official rank from the server-sorted leaderboard (by total, no live)
  const officialRankMap = {} // user_id → 1-based position (submitted only)
  leaderboard.filter(e => e.has_picks).forEach((e, i) => {
    officialRankMap[e.user_id] = i + 1
  })

  const submitted    = liveSortedLeaderboard.filter(e => e.has_picks)
  const notSubmitted = leaderboard.filter(e => !e.has_picks)
  const submittedAlpha = [...leaderboard.filter(e => e.has_picks)]
    .sort((a, b) => a.username.localeCompare(b.username))

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">🏆 Leaderboard</h1>
          {locked && results_count > 0 && (
            <p className="text-xs text-gray-500 mt-1">{results_count} match result{results_count !== 1 ? 's' : ''} in</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Live pulse badge */}
          {hasActiveLive && (
            <span className="flex items-center gap-1.5 bg-red-900/30 border border-red-700/50 text-red-400 text-xs font-semibold px-2.5 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              LIVE
            </span>
          )}
          {/* FT pending (just finished, admin hasn't confirmed) */}
          {!hasActiveLive && hasPending && locked && (
            <span className="text-xs text-orange-400/80 bg-orange-900/20 border border-orange-700/30 px-2.5 py-1 rounded-full">
              ⏳ result pending
            </span>
          )}
          <span className={`text-xs ${locked ? 'text-red-400' : 'text-green-400'}`}>
            {locked ? '🔒 Picks locked' : '🟢 Picks open'}
          </span>
          <span className="text-gray-600 text-xs">· auto-refreshes</span>
        </div>
      </div>

      {/* ── Live context banner (shown when a match is in progress) ── */}
      {showingLive && locked && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 mb-4 ${
          hasActiveLive
            ? 'bg-red-900/20 border border-red-800/40 text-red-300'
            : 'bg-orange-900/20 border border-orange-800/40 text-orange-300'
        }`}>
          <span>{hasActiveLive ? '🔴' : '⏳'}</span>
          <span>
            {hasActiveLive
              ? `Live rankings — points update as matches progress (${pendingMatches.length} match${pendingMatches.length !== 1 ? 'es' : ''} in play)`
              : `Provisional rankings — ${pendingMatches.length} result${pendingMatches.length !== 1 ? 's' : ''} awaiting admin confirmation`
            }
          </span>
        </div>
      )}

      {!locked ? (
        /* ── Picks still open: show who's in, no scores ── */
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
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{entry.picks_count} picks</span>
                        <span className="text-xs text-green-400">✓</span>
                      </div>
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
        /* ── Picks locked: full ranked leaderboard ── */
        <div className="card divide-y divide-gray-800 mb-6">
          {submitted.length === 0 && (
            <p className="text-gray-400 text-sm py-6 text-center">No picks submitted yet.</p>
          )}
          {submitted.map((entry, i) => {
            const isMe      = entry.user_id === user?.id
            const realName  = getRealName(entry.username)
            const liveRank  = i + 1
            const offRank   = officialRankMap[entry.user_id] ?? liveRank
            // Positive = moved up (was lower rank number before, now higher)
            const rankDelta = showingLive ? (offRank - liveRank) : 0

            // Post-game movement: current rank vs the standings before the last
            // game (only when not live; positive = climbed up)
            const postDelta = (!showingLive && entry.prev_rank != null)
              ? entry.prev_rank - liveRank
              : null

            const displayTotal = showingLive ? entry.liveTotal : entry.total
            const bonus        = entry.liveBonus || 0
            const liveBreakdown  = liveBreakdownMap[entry.user_id] || []

            return (
              <div
                key={entry.user_id}
                className={`flex items-center justify-between py-3 px-1 ${isMe ? 'text-fifa-gold' : ''}`}
              >
                {/* Left: rank medal + name + rank-change arrow */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-xl w-8 text-center shrink-0">
                    {MEDALS[i] ?? <span className="text-sm text-gray-400">{i + 1}.</span>}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-semibold truncate">
                        {displayName(entry.username)}
                      </span>
                      {isMe
                        ? <span className="text-xs text-gray-500 shrink-0">(you)</span>
                        : realName && <span className="text-xs text-gray-500 font-normal shrink-0">({realName})</span>
                      }
                      {/* Live rank movement arrow (while matches are in play) */}
                      {showingLive && rankDelta !== 0 && (
                        <span className={`text-[11px] font-bold leading-none ${
                          rankDelta > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}
                        </span>
                      )}
                      {/* No-change dash when live is active but rank didn't move */}
                      {showingLive && rankDelta === 0 && bonus > 0 && (
                        <span className="text-[11px] text-gray-600 leading-none">—</span>
                      )}
                      {/* Post-game movement vs the standings before the last game */}
                      {postDelta != null && (
                        postDelta > 0 ? (
                          <span className="text-[11px] font-bold text-green-400 leading-none" title="Climbed since last game">▲{postDelta}</span>
                        ) : postDelta < 0 ? (
                          <span className="text-[11px] font-bold text-red-400 leading-none" title="Dropped since last game">▼{Math.abs(postDelta)}</span>
                        ) : (
                          <span className="text-[11px] text-gray-500 leading-none" title="No change since last game">—</span>
                        )
                      )}
                    </div>
                    <span className="text-xs text-gray-600">{entry.picks_count} picks</span>
                  </div>
                </div>

                {/* Right: points + live bonus badge(s) */}
                <div className="text-right shrink-0 ml-2">
                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    <div>
                      <span className={`font-black text-xl tabular-nums ${
                        showingLive && bonus > 0 ? (isMe ? 'text-fifa-gold' : 'text-white') : ''
                      }`}>
                        {displayTotal}
                      </span>
                      <span className="text-sm font-normal text-gray-500 ml-1">pts</span>
                    </div>
                    {/* One tier-colored chip per live game, shown separately so two
                        overlapping matches aren't merged into a single number. Flags
                        label each game when more than one is in play; the status dot
                        inherits the tier color and pulses while that game is live. */}
                    {showingLive && liveBreakdown.map(b => {
                      const m = matchById[b.id]
                      const showFlags = multiLive && m && typeof m.home === 'string' && typeof m.away === 'string'
                      const liveDot = b.status === 'live' || b.status === 'ht'
                      return (
                        <span key={b.id} className={`inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${liveBonusChipClass(b.pts)}`}>
                          {showFlags && <span className="text-[10px] leading-none">{getFlag(m.home)}{getFlag(m.away)}</span>}
                          {b.pts > 0 ? `+${b.pts}` : '✗'}
                          <span className={`inline-block w-1.5 h-1.5 rounded-full bg-current ${liveDot ? 'animate-pulse' : 'opacity-60'}`} />
                        </span>
                      )
                    })}
                  </div>
                  {/* Win % — only show when not live, or keep subtle */}
                  {entry.win_pct != null && (
                    <div className={`text-xs font-semibold tabular-nums ${
                      entry.win_pct >= 30 ? 'text-green-400'  :
                      entry.win_pct >= 15 ? 'text-yellow-400' :
                      entry.win_pct >= 10 ? 'text-orange-400' :
                      entry.win_pct >= 5  ? 'text-orange-500' :
                                            'text-red-700'
                    }`}>
                      {entry.win_pct.toFixed(1)}% to win
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Not submitted — only alongside ranked view after lock */}
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

      {/* ── Scoring legend ── */}
      <div className="card text-xs text-gray-500">
        <p className="font-semibold text-gray-300 mb-3">Scoring system</p>
        <p className="text-gray-600 text-[11px] mb-3">
          <span className="text-gray-400 font-medium">% to win</span> = projected probability of finishing 1st,
          estimated via Monte Carlo simulation over all remaining matches.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
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
          <div className="flex items-center gap-2">
            <span className="bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-bold">0</span>
            <span>Wrong outcome</span>
          </div>
        </div>
        <div className="mt-3 border-t border-gray-800 pt-3 space-y-1 text-gray-600">
          <p><span className="text-gray-400">Example (USA 3–1 Paraguay):</span></p>
          <p>Predict 3–1 → +10 · Predict 2–0 → +6 · Predict 1–0 → +4 · Predict 0–1 → 0</p>
        </div>
      </div>
    </div>
  )
}
