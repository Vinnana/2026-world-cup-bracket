import { useState, useEffect, useMemo } from 'react'
import { brackets, tournament } from '../api'
import { useAuth } from '../context/AuthContext'
import KnockoutBracket from '../components/KnockoutBracket'

const displayName = (u) => u.replace(/@.+$/, '')

export default function AllBrackets() {
  const { user } = useAuth()
  const [allBrackets, setAllBrackets] = useState([])
  const [selected, setSelected]       = useState(null)
  const [knockout, setKnockout]       = useState([])
  const [results, setResults]         = useState({ groups: {}, knockout: {} })
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')

  useEffect(() => {
    async function load() {
      const [tourney, all, res] = await Promise.all([
        tournament.data(),
        brackets.all(),
        brackets.results(),
      ])
      setKnockout(tourney.data.knockout || [])
      setAllBrackets(all.data.brackets || [])
      setResults(res.data || { groups: {}, knockout: {} })
      // Default to own bracket if submitted, else first submitted
      const mine   = all.data.brackets.find(b => b.user_id === user?.id)
      const first  = all.data.brackets.find(b => b.submitted)
      setSelected((mine?.submitted ? mine : first)?.user_id ?? null)
      setLoading(false)
    }
    load()
  }, [])

  // Build actualTeams from knockout results (real home/away once matchups are known)
  const actualTeams = useMemo(() => {
    const at = {}
    for (const [id, r] of Object.entries(results.knockout || {})) {
      if (r.home_team && r.away_team) at[id] = { home: r.home_team, away: r.away_team }
    }
    return at
  }, [results.knockout])

  const viewing    = allBrackets.find(b => b.user_id === selected)
  const submitted  = allBrackets.filter(b => b.submitted)
  const noPicks    = allBrackets.filter(b => !b.submitted)
  const matches    = (b) => !search || displayName(b.username).toLowerCase().includes(search.toLowerCase())

  if (loading) return <div className="p-8 text-gray-400 text-center">Loading…</div>

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">🏆 All Brackets</h1>
        <p className="text-xs text-gray-500 mt-1">
          {submitted.length} of {allBrackets.length} participants submitted · Knockout predictions
        </p>
      </div>

      {/* Participant picker */}
      <div className="card mb-5">
        {allBrackets.length > 5 && (
          <input
            type="text"
            placeholder="Search participant…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-white text-sm px-3 py-2 rounded-lg mb-3 focus:outline-none focus:border-fifa-gold"
          />
        )}
        <div className="flex flex-wrap gap-2">
          {submitted.filter(matches).map(b => (
            <button
              key={b.user_id}
              onClick={() => setSelected(b.user_id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                selected === b.user_id
                  ? 'bg-fifa-gold text-gray-950'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {displayName(b.username)}
              <span className={`text-xs tabular-nums ${selected === b.user_id ? 'opacity-60' : 'text-gray-500'}`}>
                {b.score} pts
              </span>
            </button>
          ))}
          {noPicks.filter(matches).map(b => (
            <button
              key={b.user_id}
              onClick={() => setSelected(b.user_id)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                selected === b.user_id ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-600 hover:bg-gray-800'
              }`}
            >
              {displayName(b.username)} <span className="opacity-50">— no picks</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bracket */}
      {viewing?.submitted ? (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
            <span className="font-semibold text-white">{displayName(viewing.username)}'s Bracket</span>
            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full tabular-nums">
              {viewing.score} pts
            </span>
          </div>
          <div className="p-4">
            {/* groupPicks = results.groups so R32 slot codes resolve to real team names */}
            <KnockoutBracket
              knockout={knockout}
              groupPicks={results.groups}
              knockoutPicks={viewing.picks.knockout || {}}
              results={results}
              actualTeams={actualTeams}
              readOnly
            />
          </div>
        </div>
      ) : viewing ? (
        <div className="card text-gray-400 text-center py-10">
          {displayName(viewing.username)} hasn't submitted picks yet.
        </div>
      ) : (
        <div className="card text-gray-400 text-center py-10">Select a participant above.</div>
      )}
    </div>
  )
}
