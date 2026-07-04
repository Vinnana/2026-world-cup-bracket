import { useState, useEffect } from 'react'
import { picks as picksApi, liveScores as liveScoresApi, brackets as bracketsApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { getRealName } from '../utils/nicknames'
import { getFlag, getCode } from '../utils/flags'

const MEDALS = ['🥇', '🥈', '🥉']
const displayName = (u) => u.replace(/@.+$/, '')

// Client-side scoreline scorer (mirrors server scoring.js)
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

// Live chip color by tier
function chipClass(pts) {
  if (pts === 10) return 'bg-green-900/50 text-green-400 border border-green-700/50'
  if (pts === 6)  return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50'
  if (pts === 4)  return 'bg-blue-900/50 text-blue-400 border border-blue-700/50'
  if (pts > 0)    return 'bg-green-900/50 text-green-400 border border-green-700/50'
  return 'bg-red-900/50 text-red-400 border border-red-700/50'
}

export default function OverallLeaderboard() {
  const { user } = useAuth()
  const [data,         setData]         = useState(null)
  const [allPicksData, setAllPicksData] = useState(null)
  const [espnScores,   setEspnScores]   = useState({})
  const [championMap,    setChampionMap]    = useState({})   // user_id → champion team name
  const [eliminatedTeams,setEliminatedTeams] = useState(new Set())
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [lbRes, liveRes, bracketRes, bracketResultsRes] = await Promise.all([
          picksApi.leaderboard(),
          liveScoresApi.get().catch(() => ({ data: { scores: {} } })),
          bracketsApi.all().catch(() => null),
          bracketsApi.results().catch(() => null),
        ])
        if (cancelled) return
        setData(lbRes.data)
        setEspnScores(liveRes.data?.scores || {})

        // Build initial champion map from bracket advance picks (m104)
        const cm = {}
        if (bracketRes?.data?.brackets) {
          for (const b of bracketRes.data.brackets) {
            const champ = b.picks?.knockout?.m104
            if (champ) cm[b.user_id] = champ
          }
        }
        setChampionMap(cm)

        // Build eliminated-teams set from completed knockout results
        if (bracketResultsRes?.data?.knockout) {
          const elim = new Set()
          for (const r of Object.values(bracketResultsRes.data.knockout)) {
            if (r.winner && r.home_team && r.away_team) {
              if (r.winner !== r.home_team) elim.add(r.home_team)
              if (r.winner !== r.away_team) elim.add(r.away_team)
            }
          }
          setEliminatedTeams(elim)
        }

        if (lbRes.data?.locked) {
          const allRes = await picksApi.all().catch(() => null)
          if (!cancelled && allRes?.data && !allRes.data.hidden) {
            setAllPicksData(allRes.data)

            // Refine champion map using score picks for m104, exactly matching
            // AllBrackets' KoCard clearWinner logic:
            //   non-draw score → winner derived from score + SF picks
            //   draw or no score → advance pick (m104) used directly
            const cm2 = {}
            for (const u of allRes.data.users || []) {
              const scorePick  = u.picks?.['m104']
              const sf1Winner  = u.bracket_picks?.['m101']  // home team of Final
              const sf2Winner  = u.bracket_picks?.['m102']  // away team of Final
              const advPick    = u.bracket_picks?.['m104']
              let champ        = advPick || null
              if (scorePick?.home_goals != null && scorePick?.away_goals != null) {
                const hg = Number(scorePick.home_goals), ag = Number(scorePick.away_goals)
                if (hg > ag && sf1Winner) champ = sf1Winner
                else if (ag > hg && sf2Winner) champ = sf2Winner
                // draw → keep advPick
              }
              if (champ) cm2[u.user_id] = champ
            }
            setChampionMap(cm2)
          }
        }
      } catch (err) {
        console.error('[OverallLeaderboard] load error:', err)
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

  // ── Live scoring ─────────────────────────────────────────────────────────────
  const userPicksMap = {}
  const userBracketPicksMap = {}
  for (const u of allPicksData?.users || []) {
    userPicksMap[u.user_id]        = u.picks         || {}
    userBracketPicksMap[u.user_id] = u.bracket_picks || {}
  }

  const officialResults = allPicksData?.results || {}

  const pendingMatches = allPicksData
    ? Object.entries(espnScores).filter(([id, s]) => {
        if (s.home_score == null || s.away_score == null) return false
        if (!['live', 'ht', 'ft'].includes(s.status)) return false
        return !(officialResults[id]?.home_goals != null)
      })
    : []

  const matchById = {}
  for (const m of allPicksData?.matches || []) matchById[m.id] = m

  // parentsMap: for R16+ matches, which match's winner fills each slot
  const parentsMap = {}
  for (const m of allPicksData?.matches || []) {
    parentsMap[m.id] = {
      homeSrc: m.home?.win || null,
      awaySrc: m.away?.win || null,
      hasLose: !!(m.home?.lose || m.away?.lose),
    }
  }

  // Returns true only if the user predicted the correct two teams for this R16+ match
  function matchupCorrectFor(matchId, bracketPicks) {
    const m      = matchById[matchId]
    const result = officialResults[matchId]
    if (!m || !result) return false
    const isR32 = typeof m.home === 'string' && typeof m.away === 'string'
    if (isR32) return true  // R32 matchup always correct
    const p = parentsMap[matchId]
    if (!p || p.hasLose) return false  // 3rd place — conservative, skip bonus
    const predHome = p.homeSrc ? (bracketPicks[p.homeSrc] || null) : null
    const predAway = p.awaySrc ? (bracketPicks[p.awaySrc] || null) : null
    if (!predHome || !predAway) return false
    const ah = result.home_team, aa = result.away_team
    if (!ah || !aa) return false
    return (predHome === ah && predAway === aa) || (predHome === aa && predAway === ah)
  }

  const hasActiveLive = pendingMatches.some(([, s]) => s.status === 'live' || s.status === 'ht')
  const hasPending    = pendingMatches.length > 0
  const multiLive     = pendingMatches.length > 1

  const liveBonusMap     = {}
  const liveBreakdownMap = {}
  if (locked && allPicksData && hasPending) {
    for (const entry of leaderboard) {
      const picks        = userPicksMap[entry.user_id]        || {}
      const bracketPicks = userBracketPicksMap[entry.user_id] || {}
      let bonus = 0
      const breakdown = []
      for (const [matchId, s] of pendingMatches) {
        const p = picks[matchId]
        if (p?.home_goals != null) {
          const m    = matchById[matchId]
          const isKo = m && m.round !== 'Group'
          const isR32 = isKo && typeof m?.home === 'string' && typeof m?.away === 'string'
          // Score bonus for R16+ only applies when the predicted matchup is correct
          if (isKo && !isR32 && !matchupCorrectFor(matchId, bracketPicks)) continue
          const pts = scoreMatchClient(p, s.home_score, s.away_score)
          bonus += pts
          breakdown.push({ id: matchId, pts, status: s.status })
        }
      }
      liveBonusMap[entry.user_id]     = bonus
      liveBreakdownMap[entry.user_id] = breakdown
    }
  }

  const showingLive = locked && hasPending

  // Base score = cumulative total (group + knockout)
  const baseScore = (e) => e.total || 0

  const liveSortedLeaderboard = locked
    ? [...leaderboard]
        .map(e => ({
          ...e,
          liveBonus: liveBonusMap[e.user_id] || 0,
          liveTotal: baseScore(e) + (liveBonusMap[e.user_id] || 0),
        }))
        .sort((a, b) =>
          b.liveTotal - a.liveTotal ||
          (b.win_pct ?? 0) - (a.win_pct ?? 0) ||
          a.username.localeCompare(b.username)
        )
    : leaderboard

  // Official rank (no live bonus) for the live-movement arrow
  const officialRankMap = {}
  ;[...leaderboard.filter(e => e.has_picks)]
    .sort((a, b) => baseScore(b) - baseScore(a) || (b.win_pct ?? 0) - (a.win_pct ?? 0) || a.username.localeCompare(b.username))
    .forEach((e, i) => { officialRankMap[e.user_id] = i + 1 })

  const submitted    = liveSortedLeaderboard.filter(e => e.has_picks)
  const notSubmitted = leaderboard.filter(e => !e.has_picks)
  const submittedAlpha = [...leaderboard.filter(e => e.has_picks)]
    .sort((a, b) => a.username.localeCompare(b.username))

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">🏆 Overall Leaderboard</h1>
          {locked && results_count > 0 && (
            <p className="text-xs text-gray-500 mt-1">Group stage + knockout · {results_count} results in</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {hasActiveLive && (
            <span className="flex items-center gap-1.5 bg-red-900/30 border border-red-700/50 text-red-400 text-xs font-semibold px-2.5 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              LIVE
            </span>
          )}
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

      {/* Live banner */}
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

      {/* Champion picks tally banner */}
      {Object.keys(championMap).length > 0 && (() => {
        const tally = Object.values(championMap).reduce((acc, team) => {
          acc[team] = (acc[team] || 0) + 1
          return acc
        }, {})
        const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a)
        return (
          <div className="mb-4 bg-gray-800/50 border border-gray-700/50 rounded-xl px-3.5 py-2.5">
            <p className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold mb-2">🏆 Champion picks</p>
            <div className="flex flex-wrap gap-1.5">
              {sorted.map(([team, count]) => {
                const isOut = eliminatedTeams.has(team)
                return (
                  <div
                    key={team}
                    title={isOut ? `${team} — eliminated` : team}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border ${
                      isOut
                        ? 'bg-red-950/50 border-red-800/50'
                        : 'bg-gray-900 border-gray-700/70'
                    }`}
                  >
                    <span className={`text-lg leading-none ${isOut ? 'opacity-40' : ''}`}>{getFlag(team)}</span>
                    <div className="flex flex-col leading-none">
                      <span className={`text-[9px] font-bold tracking-wide ${isOut ? 'text-red-500/70 line-through' : 'text-gray-400'}`}>{getCode(team)}</span>
                      <span className={`text-sm font-black tabular-nums ${isOut ? 'text-red-400/60' : 'text-white'}`}>{count}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {!locked ? (
        /* Picks still open */
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
                  const champion = championMap[entry.user_id] ?? null
                  return (
                    <div key={entry.user_id} className="flex items-center justify-between py-2.5 gap-2">
                      <span className={`font-medium min-w-0 truncate ${isMe ? 'text-fifa-gold' : 'text-white'}`}>
                        {displayName(entry.username)}
                        {isMe
                          ? <span className="ml-1 text-xs text-gray-500">(you)</span>
                          : realName && <span className="ml-1 text-xs text-gray-500 font-normal">({realName})</span>
                        }
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        {champion ? (
                          <span className="flex items-center gap-1" title={champion}>
                            <span className="text-base leading-none">{getFlag(champion)}</span>
                            <span className="text-[10px] font-bold tracking-wide text-gray-400">{getCode(champion)}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-700">—</span>
                        )}
                        <span className="text-xs text-green-400">✓ {entry.picks_count} picks</span>
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
        /* Locked: full live leaderboard */
        <div className="card divide-y divide-gray-800 mb-6">
          {submitted.length === 0 && (
            <p className="text-gray-400 text-sm py-6 text-center">No picks submitted yet.</p>
          )}
          {submitted.map((entry, i) => {
            const isMe     = entry.user_id === user?.id
            const realName = getRealName(entry.username)
            const liveRank = i + 1
            const offRank  = officialRankMap[entry.user_id] ?? liveRank
            const rankDelta = showingLive ? (offRank - liveRank) : 0

            // Post-game movement vs standings before the last game
            const postDelta = (!showingLive && entry.prev_rank != null)
              ? entry.prev_rank - liveRank
              : null

            const displayTotal = showingLive ? entry.liveTotal : baseScore(entry)
            const bonus        = entry.liveBonus || 0
            const liveBreakdown = liveBreakdownMap[entry.user_id] || []

            const champion = championMap[entry.user_id] ?? null

            return (
              <div key={entry.user_id} className={`py-3 px-1 ${isMe ? 'text-fifa-gold' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  {/* Left: rank + name + arrows */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xl w-8 text-center shrink-0">
                      {MEDALS[i] ?? <span className="text-sm text-gray-400">{i + 1}.</span>}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5 min-w-0">
                        <span className="font-semibold truncate">{displayName(entry.username)}</span>
                        {isMe
                          ? <span className="text-xs text-gray-500 shrink-0">(you)</span>
                          : realName && <span className="text-xs text-gray-500 font-normal shrink-0">({realName})</span>
                        }
                        {/* Live movement arrow */}
                        {showingLive && rankDelta !== 0 && (
                          <span className={`text-[11px] font-bold leading-none shrink-0 ${rankDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}
                          </span>
                        )}
                        {showingLive && rankDelta === 0 && bonus > 0 && (
                          <span className="text-[11px] text-gray-600 leading-none shrink-0">—</span>
                        )}
                        {/* Post-game movement */}
                        {postDelta != null && (
                          postDelta > 0 ? (
                            <span className="text-[11px] font-bold text-green-400 leading-none shrink-0" title="Climbed since last game">▲{postDelta}</span>
                          ) : postDelta < 0 ? (
                            <span className="text-[11px] font-bold text-red-400 leading-none shrink-0" title="Dropped since last game">▼{Math.abs(postDelta)}</span>
                          ) : (
                            <span className="text-[11px] text-gray-500 leading-none shrink-0" title="No change since last game">—</span>
                          )
                        )}
                      </div>
                      <span className="text-xs text-gray-600">{entry.picks_count} picks</span>
                    </div>
                  </div>

                  {/* Middle: champion pick */}
                  <div className="shrink-0 flex flex-col items-center gap-0.5" title={champion ? `Picked: ${champion}` : 'No champion pick'}>
                    {champion ? (
                      <>
                        <span className="text-lg leading-none">{getFlag(champion)}</span>
                        <span className="text-[9px] font-bold tracking-wide text-gray-400 tabular-nums">{getCode(champion)}</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-700">—</span>
                    )}
                  </div>

                  {/* Right: score + group sub-score + win% */}
                  <div className="text-right shrink-0">
                    <div>
                      <span className={`font-black text-xl tabular-nums ${showingLive && bonus > 0 ? (isMe ? 'text-fifa-gold' : 'text-white') : ''}`}>
                        {displayTotal}
                      </span>
                      <span className="text-sm font-normal text-gray-500 ml-1">pts</span>
                    </div>
                    {/* Group sub-score in small text */}
                    {(entry.knockout_total || 0) > 0 && (
                      <div className="text-[10px] text-gray-600 tabular-nums">
                        {entry.group_total ?? 0} + <span className="text-purple-400">{entry.knockout_total}</span>
                      </div>
                    )}
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

                {/* Live chips — one per game in play */}
                {showingLive && liveBreakdown.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5 pl-11">
                    {liveBreakdown.map(b => {
                      const m = matchById[b.id]
                      const showFlags = multiLive && m
                      const homeTeam = m?.round !== 'Group' ? null : (typeof m.home === 'string' ? m.home : null)
                      const awayTeam = m?.round !== 'Group' ? null : (typeof m.away === 'string' ? m.away : null)
                      const liveDot  = b.status === 'live' || b.status === 'ht'
                      return (
                        <span key={b.id} className={`inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${chipClass(b.pts)}`}>
                          {showFlags && homeTeam && awayTeam && (
                            <span className="text-[10px] leading-none">{getFlag(homeTeam)}{getFlag(awayTeam)}</span>
                          )}
                          {b.pts > 0 ? `+${b.pts}` : '✗'}
                          <span className={`inline-block w-1.5 h-1.5 rounded-full bg-current ${liveDot ? 'animate-pulse' : 'opacity-60'}`} />
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
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
        <p className="font-semibold text-gray-300 mb-3">Knockout scoring</p>
        <p className="text-gray-600 text-[11px] mb-3">
          <span className="text-gray-400 font-medium">% to win</span> = projected probability of finishing 1st.
          Score breakdown shows <span className="text-gray-400">group</span> + <span className="text-purple-400">knockout</span> pts.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="bg-green-700 text-green-100 px-1.5 py-0.5 rounded font-bold">+10</span>
            <span>Correct team advances</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-green-700 text-green-100 px-1.5 py-0.5 rounded font-bold">+10</span>
            <span>Exact scoreline bonus</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-yellow-700 text-yellow-100 px-1.5 py-0.5 rounded font-bold">+6</span>
            <span>Right winner + goal diff</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-700 text-blue-100 px-1.5 py-0.5 rounded font-bold">+4</span>
            <span>Right winner</span>
          </div>
        </div>
        <p className="mt-2 text-gray-600 text-[11px]">Max 20 pts per knockout match. Scoreline bonus only counts if your predicted matchup is correct.</p>
      </div>
    </div>
  )
}
