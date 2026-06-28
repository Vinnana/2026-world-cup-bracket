import { useState, useEffect } from 'react'
import { brackets, tournament } from '../api'
import { useAuth } from '../context/AuthContext'
import { getFlag } from '../utils/flags'

const ROUND_LABELS = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF:  'Quarter-finals',
  SF:  'Semi-finals',
  Third: '3rd Place',
  Final: 'Final',
}
const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'Third', 'Final']
const MEDALS = ['🥇', '🥈', '🥉']

const displayName = (u) => u.replace(/@.+$/, '')

// Resolve a slot string / object to a human-readable team name using group results.
function resolveSlot(side, groupResults) {
  if (!side) return '?'
  if (typeof side === 'string') {
    if (side.startsWith('3RD:')) return `3rd (${side.slice(4).split('').join('/')})`
    const pos = side[0], grp = side[1]
    const gr = groupResults?.[grp]
    if (gr) return pos === '1' ? gr.first : gr.second
    return `${pos === '1' ? 'Winner' : 'Runner-up'} Grp ${grp}`
  }
  if (side.win)  return null  // resolved later from ko results chain
  if (side.lose) return null
  return '?'
}

function resolveMatchTeams(m, groupResults, koResults) {
  // If the actual matchup has been recorded (ESPN sync), use it.
  const r = koResults?.[m.id]
  if (r?.home_team && r?.away_team) return { home: r.home_team, away: r.away_team }
  // For R32, resolve from group results.
  if (m.round === 'R32') {
    return {
      home: resolveSlot(m.home, groupResults) ?? '?',
      away: resolveSlot(m.away, groupResults) ?? '?',
    }
  }
  // For later rounds, the home/away are {win: 'mXX'} — we'd need recursive resolution.
  // Fall back to a readable label.
  const homeLabel = m.home?.win ? `W(${m.home.win})` : '?'
  const awayLabel = m.away?.win ? `W(${m.away.win})` : '?'
  return { home: homeLabel, away: awayLabel }
}

function TeamPill({ name, state }) {
  const flag = getFlag(name)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
      state === 'correct' ? 'bg-green-900/50 text-green-300 border border-green-700/50' :
      state === 'wrong'   ? 'bg-red-900/40 text-red-400 border border-red-900/50' :
      state === 'pending' ? 'bg-gray-700 text-gray-200' :
      'text-gray-600'
    }`}>
      {flag && <span>{flag}</span>}
      <span>{name ?? '—'}</span>
    </span>
  )
}

export default function BracketReport() {
  const { user } = useAuth()
  const [loading, setLoading]     = useState(true)
  const [allBrackets, setAll]     = useState([])
  const [ko, setKo]               = useState([])
  const [results, setResults]     = useState({ groups: {}, knockout: {} })

  useEffect(() => {
    async function load() {
      const [br, tourney, res] = await Promise.all([
        brackets.all(),
        tournament.data(),
        brackets.results(),
      ])
      setAll((br.data.brackets || []).filter(b => b.submitted))
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
    return r.winner === pick ? { pick, state: 'correct' } : { pick, state: 'wrong' }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 print:mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white print:text-black">📑 Bracket Report</h1>
          <p className="text-xs text-gray-500 mt-1">
            2026 FIFA World Cup · Knockout phase · {players.length} participants
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors print:hidden"
        >
          🖨 Export / Print PDF
        </button>
      </div>

      {/* Standings */}
      <div className="card mb-8 print:border print:border-gray-300">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">Bracket Standings</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          {players.map((b, i) => (
            <div key={b.user_id} className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0 print:border-gray-200">
              <div className="flex items-center gap-2.5">
                <span className="text-base w-7 text-center shrink-0">
                  {MEDALS[i] ?? <span className="text-sm text-gray-500">{i + 1}.</span>}
                </span>
                <span className={`font-medium text-sm ${b.user_id === user?.id ? 'text-fifa-gold' : 'text-white print:text-black'}`}>
                  {displayName(b.username)}
                  {b.user_id === user?.id && <span className="ml-1 text-xs text-gray-500">(you)</span>}
                </span>
              </div>
              <span className="font-bold tabular-nums text-sm print:text-black">{b.score} pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-6 text-xs flex-wrap print:hidden">
        <span className="text-gray-400 font-medium">Legend:</span>
        <TeamPill name="Correct pick" state="correct" />
        <TeamPill name="Wrong pick"   state="wrong" />
        <TeamPill name="Upcoming"     state="pending" />
        <TeamPill name="No pick"      state="none" />
      </div>

      {/* Round-by-round */}
      {ROUND_ORDER.map(roundKey => {
        const matches = byRound[roundKey]
        if (!matches?.length) return null
        return (
          <div key={roundKey} className="mb-8 print:mb-6 print:break-inside-avoid">
            <div className="flex items-center gap-3 mb-4">
              <span className="h-px flex-1 bg-gray-800 print:bg-gray-300" />
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap print:text-gray-700">
                {ROUND_LABELS[roundKey]}
              </h2>
              <span className="h-px flex-1 bg-gray-800 print:bg-gray-300" />
            </div>

            <div className="space-y-3">
              {matches.map(m => {
                const { home, away } = resolveMatchTeams(m, results.groups, results.knockout)
                const r = results.knockout?.[m.id]
                const homeFlag = getFlag(home)
                const awayFlag = getFlag(away)

                return (
                  <div key={m.id} className="card print:border print:border-gray-200 print:break-inside-avoid">
                    {/* Match header */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="text-[10px] text-gray-600 font-mono bg-gray-900 px-1.5 py-0.5 rounded print:hidden">
                        {m.id}
                      </span>
                      <span className="font-semibold text-white text-sm print:text-black flex items-center gap-1 flex-wrap">
                        <span>{homeFlag}</span><span>{home}</span>
                        <span className="text-gray-500 font-normal mx-1">vs</span>
                        <span>{awayFlag}</span><span>{away}</span>
                      </span>
                      {r?.winner ? (
                        <span className="ml-auto text-xs bg-green-900/60 text-green-300 px-2.5 py-0.5 rounded-full font-medium print:bg-transparent print:text-green-700 print:border print:border-green-600">
                          {getFlag(r.winner)} {r.winner} advances
                        </span>
                      ) : (
                        <span className="ml-auto text-[10px] text-gray-600 print:hidden">Upcoming</span>
                      )}
                    </div>

                    {/* Participant picks */}
                    <div className="flex flex-wrap gap-2">
                      {players.map(b => {
                        const { pick, state } = getPickState(m, b)
                        return (
                          <div
                            key={b.user_id}
                            className={`flex flex-col items-center px-2.5 py-2 rounded-lg border text-center ${
                              state === 'correct' ? 'bg-green-900/30 border-green-700/60' :
                              state === 'wrong'   ? 'bg-red-900/25 border-red-900/50' :
                              state === 'pending' ? 'bg-gray-800/80 border-gray-700' :
                              'bg-gray-900 border-gray-800'
                            }`}
                            style={{ minWidth: 76 }}
                          >
                            <span className="text-[9px] text-gray-500 leading-tight mb-0.5 truncate w-full text-center">
                              {displayName(b.username)}
                            </span>
                            {pick ? (
                              <span className={`text-[10px] font-semibold flex items-center gap-0.5 justify-center ${
                                state === 'correct' ? 'text-green-300' :
                                state === 'wrong'   ? 'text-red-400' :
                                'text-gray-200'
                              }`}>
                                <span>{getFlag(pick)}</span>
                                <span className="truncate max-w-[60px]">{pick}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-600">—</span>
                            )}
                            <span className={`text-[8px] mt-0.5 leading-none ${
                              state === 'correct' ? 'text-green-600' :
                              state === 'wrong'   ? 'text-red-700' :
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
        <div className="card text-center py-12 text-gray-500">No bracket submissions yet.</div>
      )}
    </div>
  )
}
