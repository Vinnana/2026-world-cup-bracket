import { useState, useEffect } from 'react'
import { picks as picksApi } from '../api'
import { useAuth } from '../context/AuthContext'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const { user } = useAuth()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const res = await picksApi.leaderboard()
      setData(res.data)
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [])

  if (loading) return <div className="p-8 text-gray-400 text-center">Loading…</div>

  const { leaderboard = [], locked, results_count = 0 } = data || {}

  // Before lock: show who submitted (alphabetical, no scores) vs who hasn't
  // After lock: full ranked leaderboard with scores
  const submitted    = leaderboard.filter(e => e.has_picks)
  const notSubmitted = leaderboard.filter(e => !e.has_picks)
  const submittedAlpha = [...submitted].sort((a, b) => a.username.localeCompare(b.username))

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">🏆 Leaderboard</h1>
          {locked && results_count > 0 && (
            <p className="text-xs text-gray-500 mt-1">{results_count} match results in</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          {locked
            ? <span className="text-red-400">🔒 Picks locked</span>
            : <span className="text-green-400">🟢 Picks open</span>
          }
          <span className="text-gray-600">· auto-refreshes</span>
        </div>
      </div>

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
                  return (
                    <div key={entry.user_id} className="flex items-center justify-between py-2.5">
                      <span className={`font-medium ${isMe ? 'text-fifa-gold' : 'text-white'}`}>
                        {entry.username}
                        {isMe && <span className="ml-1 text-xs text-gray-500">(you)</span>}
                      </span>
                      <span className="text-xs text-green-400">✓ submitted</span>
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
                    {e.username}
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
            const isMe = entry.user_id === user?.id
            return (
              <div
                key={entry.user_id}
                className={`flex items-center justify-between py-3 px-1 ${isMe ? 'text-fifa-gold' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl w-8 text-center">
                    {MEDALS[i] || <span className="text-sm text-gray-400">{i + 1}.</span>}
                  </span>
                  <div>
                    <span className="font-semibold">
                      {entry.username}
                      {isMe && <span className="ml-1 text-xs text-gray-500">(you)</span>}
                    </span>
                    <span className="ml-2 text-xs text-gray-600">{entry.picks_count} picks</span>
                  </div>
                </div>
                <span className="font-black text-xl tabular-nums">
                  {entry.total}
                  <span className="text-sm font-normal text-gray-500 ml-1">pts</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Not submitted — only shown alongside ranked view after lock */}
      {locked && notSubmitted.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            No picks ({notSubmitted.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {notSubmitted.map(e => (
              <span key={e.user_id} className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">
                {e.username}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Scoring legend */}
      <div className="card text-xs text-gray-500">
        <p className="font-semibold text-gray-300 mb-3">Scoring system</p>
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
            <span className="bg-orange-700 text-orange-100 px-1.5 py-0.5 rounded font-bold">+4</span>
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
