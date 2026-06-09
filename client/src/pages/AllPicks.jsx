import { useState, useEffect } from 'react'
import { picks as picksApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { getFlag } from '../utils/flags'

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
              {userData.username}
            </span>
            {isMe && <span className="ml-1 text-xs text-gray-500">(you)</span>}
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
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await picksApi.all()
        setData(res.data)
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
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

      {/* Leaderboard + expandable rows */}
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
    </div>
  )
}
