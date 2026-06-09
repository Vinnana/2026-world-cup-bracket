import { useState, useEffect } from 'react'
import { brackets } from '../api'
import { useAuth } from '../context/AuthContext'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const [data, setData] = useState([])
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    async function load() {
      const res = await brackets.all()
      setData(res.data.brackets)
      setLocked(res.data.settings.locked)
      setLoading(false)
    }
    load()
    const interval = setInterval(load, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  const submitted = data.filter(b => b.submitted)
  const notSubmitted = data.filter(b => !b.submitted)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">🏆 Leaderboard</h1>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          {locked
            ? <span className="text-red-400">🔒 Brackets locked</span>
            : <span className="text-green-400">🟢 Picks open</span>
          }
          <span className="text-gray-600">· auto-refreshes</span>
        </div>
      </div>

      <div className="card divide-y divide-gray-800">
        {submitted.length === 0 && (
          <p className="text-gray-400 text-sm py-4 text-center">No brackets submitted yet.</p>
        )}
        {submitted.map((b, i) => (
          <div
            key={b.user_id}
            className={`flex items-center justify-between py-3 px-1 ${
              b.user_id === user?.id ? 'text-fifa-gold' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl w-8 text-center">{MEDALS[i] || `${i + 1}.`}</span>
              <span className="font-medium">
                {b.username}
                {b.user_id === user?.id && <span className="ml-2 text-xs text-gray-500">(you)</span>}
              </span>
            </div>
            <span className="font-bold text-lg tabular-nums">{b.score} pts</span>
          </div>
        ))}
      </div>

      {notSubmitted.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-500 mb-2">No picks yet</h2>
          <div className="flex flex-wrap gap-2">
            {notSubmitted.map(b => (
              <span key={b.user_id} className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">
                {b.username}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 card text-xs text-gray-500">
        <p className="font-medium text-gray-400 mb-2">Scoring</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span>🥇 Group 1st place</span><span className="text-right">3 pts</span>
          <span>🥈 Group 2nd place</span><span className="text-right">2 pts</span>
          <span>🥉 Group 3rd place *</span><span className="text-right">1 pt</span>
          <span>Round of 32 winner</span><span className="text-right">2 pts</span>
          <span>Round of 16 winner</span><span className="text-right">3 pts</span>
          <span>Quarter-final winner</span><span className="text-right">4 pts</span>
          <span>Semi-final winner</span><span className="text-right">5 pts</span>
          <span>Champion</span><span className="text-right">8 pts</span>
          <span>Runner-up</span><span className="text-right">3 pts</span>
        </div>
        <p className="mt-2 text-[11px] text-gray-600">
          * Only the 8 best 3rd-place teams advance. A correct 3rd-place pick scores
          only if that team is one of the 8 that qualify — picks in the other 4 groups score 0.
        </p>
      </div>
    </div>
  )
}
