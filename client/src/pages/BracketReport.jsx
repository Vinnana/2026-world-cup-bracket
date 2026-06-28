import { useState, useEffect } from 'react'
import { brackets, tournament } from '../api'
import { useAuth } from '../context/AuthContext'

const ROUND_LABELS = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  Third: '3rd Place',
  Final: 'Final',
}

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'Third', 'Final']

const displayName = (u) => u.replace(/@.+$/, '')

function getSlotLabel(side) {
  if (!side) return '?'
  if (typeof side === 'string') return side
  if (side.win) return `W(${side.win.replace('m', '#')})`
  if (side.lose) return `L(${side.lose.replace('m', '#')})`
  return '?'
}

export default function BracketReport() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [allBrackets, setAllBrackets] = useState([])
  const [ko, setKo] = useState([])
  const [results, setResults] = useState({ groups: {}, knockout: {} })

  useEffect(() => {
    async function load() {
      const [br, tourney, res] = await Promise.all([
        brackets.all(),
        tournament.data(),
        brackets.results(),
      ])
      setAllBrackets((br.data.brackets || []).filter(b => b.submitted))
      setKo(tourney.data.knockout || [])
      setResults(res.data || { groups: {}, knockout: {} })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-8 text-gray-400 text-center">Loading…</div>

  const byRound = {}
  for (const m of ko) {
    if (!byRound[m.round]) byRound[m.round] = []
    byRound[m.round].push(m)
  }

  const players = [...allBrackets].sort((a, b) => b.score - a.score)

  function getPickState(m, b) {
    const r = results.knockout?.[m.id]
    const pick = b.picks?.knockout?.[m.id]
    if (!pick) return { pick: null, state: 'none' }
    if (!r?.winner) return { pick, state: 'pending' }
    if (r.winner === pick) return { pick, state: 'correct' }
    return { pick, state: 'wrong' }
  }

  const MEDALS = ['🥇', '🥈', '🥉']

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">📑 Bracket Report</h1>
          <p className="text-xs text-gray-500 mt-1">
            2026 FIFA World Cup · Knockout phase · {players.length} participants
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors print:hidden"
        >
          🖨 Print / Save PDF
        </button>
      </div>

      {/* Score summary */}
      <div className="card mb-8">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
          Bracket Standings
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          {players.map((b, i) => (
            <div key={b.user_id} className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0">
              <div className="flex items-center gap-2.5">
                <span className="text-base w-7 text-center shrink-0">
                  {MEDALS[i] ?? <span className="text-sm text-gray-500">{i + 1}.</span>}
                </span>
                <span className={`font-medium text-sm ${b.user_id === user?.id ? 'text-fifa-gold' : 'text-white'}`}>
                  {displayName(b.username)}
                  {b.user_id === user?.id && <span className="ml-1 text-xs text-gray-500">(you)</span>}
                </span>
              </div>
              <span className="font-bold tabular-nums text-sm">{b.score} pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Round-by-round breakdown */}
      {ROUND_ORDER.map(roundKey => {
        const matches = byRound[roundKey]
        if (!matches?.length) return null
        return (
          <div key={roundKey} className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="h-px flex-1 bg-gray-800" />
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                {ROUND_LABELS[roundKey]}
              </h2>
              <span className="h-px flex-1 bg-gray-800" />
            </div>

            <div className="space-y-4">
              {matches.map(m => {
                const r = results.knockout?.[m.id]
                const home = r?.home_team || getSlotLabel(m.home)
                const away = r?.away_team || getSlotLabel(m.away)

                return (
                  <div key={m.id} className="card overflow-hidden">
                    {/* Match header */}
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <span className="text-[10px] text-gray-600 font-mono bg-gray-900 px-1.5 py-0.5 rounded">
                        {m.id}
                      </span>
                      <span className="font-semibold text-white text-sm">
                        {home}
                        <span className="text-gray-500 mx-2 font-normal">vs</span>
                        {away}
                      </span>
                      {r?.winner ? (
                        <span className="ml-auto text-xs bg-green-900/60 text-green-300 px-2.5 py-0.5 rounded-full font-medium">
                          ✓ {r.winner} advances
                        </span>
                      ) : (
                        <span className="ml-auto text-xs text-gray-600">Upcoming</span>
                      )}
                    </div>

                    {/* Participant picks grid */}
                    <div className="flex flex-wrap gap-2">
                      {players.map(b => {
                        const { pick, state } = getPickState(m, b)
                        return (
                          <div
                            key={b.user_id}
                            className={`flex flex-col items-center px-3 py-2 rounded-lg border text-center ${
                              state === 'correct' ? 'bg-green-900/30 border-green-700/60' :
                              state === 'wrong'   ? 'bg-red-900/25 border-red-900/50' :
                              state === 'pending' ? 'bg-gray-800/80 border-gray-700' :
                              'bg-gray-900 border-gray-800'
                            }`}
                            style={{ minWidth: 80 }}
                          >
                            <span className="text-[10px] text-gray-500 truncate w-full text-center leading-tight mb-0.5">
                              {displayName(b.username)}
                            </span>
                            <span className={`text-xs font-semibold truncate w-full text-center leading-snug ${
                              state === 'correct' ? 'text-green-300' :
                              state === 'wrong'   ? 'text-red-400' :
                              state === 'pending' ? 'text-gray-200' :
                              'text-gray-600'
                            }`}>
                              {pick ?? '—'}
                            </span>
                            <span className={`text-[9px] mt-0.5 leading-none ${
                              state === 'correct' ? 'text-green-500' :
                              state === 'wrong'   ? 'text-red-600' :
                              'text-transparent'
                            }`}>
                              {state === 'correct' ? '✓ correct' : state === 'wrong' ? '✗ wrong' : '.'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {players.length === 0 && (
        <div className="card text-center py-12 text-gray-500">
          No bracket submissions yet.
        </div>
      )}
    </div>
  )
}
