import { useState, useEffect } from 'react'
import { picks as picksApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { getRealName } from '../utils/nicknames'

const MEDALS = ['🥇', '🥈', '🥉']
const displayName = (u) => u.replace(/@.+$/, '')

export default function Leaderboard() {
  const { user } = useAuth()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await picksApi.leaderboard()
        if (!cancelled) setData(res.data)
      } catch (err) {
        console.error('[GroupLeaderboard] load error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    // No recurring refresh — group stage is frozen
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="p-8 text-gray-400 text-center">Loading…</div>

  const { leaderboard = [], locked, results_count = 0 } = data || {}
  const submitted    = leaderboard.filter(e => e.has_picks)
  const notSubmitted = leaderboard.filter(e => !e.has_picks)
  const submittedAlpha = [...submitted].sort((a, b) => a.username.localeCompare(b.username))

  // Sorted by group_total (frozen final standings)
  const sorted = [...submitted].sort((a, b) =>
    (b.group_total ?? b.total ?? 0) - (a.group_total ?? a.total ?? 0) ||
    (b.win_pct ?? 0) - (a.win_pct ?? 0) ||
    a.username.localeCompare(b.username)
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">📋 Group Stage Leaderboard</h1>
          <p className="text-xs text-gray-500 mt-1">
            Final group stage standings · {results_count} match result{results_count !== 1 ? 's' : ''}
          </p>
        </div>
        <span className="text-xs text-red-400">🔒 Frozen — no further updates</span>
      </div>

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
        /* Locked: frozen group stage standings */
        <div className="card divide-y divide-gray-800 mb-6">
          {sorted.length === 0 && (
            <p className="text-gray-400 text-sm py-6 text-center">No picks submitted yet.</p>
          )}
          {sorted.map((entry, i) => {
            const isMe     = entry.user_id === user?.id
            const realName = getRealName(entry.username)
            const score    = entry.group_total ?? entry.total ?? 0
            return (
              <div key={entry.user_id} className={`py-3 px-1 ${isMe ? 'text-fifa-gold' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xl w-8 text-center shrink-0">
                      {MEDALS[i] ?? <span className="text-sm text-gray-400">{i + 1}.</span>}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-semibold truncate">{displayName(entry.username)}</span>
                        {isMe
                          ? <span className="text-xs text-gray-500 shrink-0">(you)</span>
                          : realName && <span className="text-xs text-gray-500 font-normal shrink-0">({realName})</span>
                        }
                      </div>
                      <span className="text-xs text-gray-600">{entry.picks_count} picks</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div>
                      <span className="font-black text-xl tabular-nums">{score}</span>
                      <span className="text-sm font-normal text-gray-500 ml-1">pts</span>
                    </div>
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
        <p className="font-semibold text-gray-300 mb-3">Scoring system (group stage)</p>
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
      </div>
    </div>
  )
}
