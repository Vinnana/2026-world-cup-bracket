import { useState, useEffect, useMemo } from 'react'
import { brackets, tournament, picks as picksApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { KnockoutBracketWithScores } from '../components/KnockoutBracketScored'

const displayName = (u) => u.replace(/@.+$/, '')

export default function AllBrackets() {
  const { user } = useAuth()
  const [allBrackets,   setAllBrackets]   = useState([])
  const [selected,      setSelected]      = useState(null)
  const [knockout,      setKnockout]      = useState([])
  const [results,       setResults]       = useState({ groups: {}, knockout: {} })
  const [matchResults,  setMatchResults]  = useState({})   // matchId → { home_goals, away_goals }
  const [teamOverrides, setTeamOverrides] = useState({})   // matchId → { home, away } from ESPN
  const [allPicksData,  setAllPicksData]  = useState(null) // picks.all() (null if hidden/unavailable)
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')

  useEffect(() => {
    async function load() {
      const [tourney, all, res, matchRes] = await Promise.all([
        tournament.data(),
        brackets.all(),
        brackets.results(),
        picksApi.matches(),
      ])
      setKnockout(tourney.data.knockout || [])
      setAllBrackets((all.data.brackets || []).filter(b => !b.is_admin))
      setResults(res.data || { groups: {}, knockout: {} })
      setMatchResults(matchRes.data.results || {})
      setTeamOverrides(matchRes.data.team_overrides || {})

      // Score picks are visible to admins or once locked
      try {
        const ap = await picksApi.all()
        if (!ap.data.hidden) setAllPicksData(ap.data)
      } catch {}

      const mine   = all.data.brackets.find(b => b.user_id === user?.id)
      const first  = all.data.brackets.find(b => b.submitted)
      setSelected((mine?.submitted ? mine : first)?.user_id ?? null)
      setLoading(false)
    }
    load()
  }, [])

  const viewing     = allBrackets.find(b => b.user_id === selected)
  const submitted   = allBrackets.filter(b => b.submitted)
  const noPicks     = allBrackets.filter(b => !b.submitted)
  const matchesFn   = (b) => !search || displayName(b.username).toLowerCase().includes(search.toLowerCase())

  // Score picks for the selected user (KO matches only)
  const viewingScorePicks = useMemo(() => {
    if (!allPicksData || !selected) return {}
    const userData = allPicksData.users?.find(u => u.user_id === selected)
    if (!userData) return {}
    const koMap = {}
    for (const [mid, pick] of Object.entries(userData.picks || {})) {
      if (parseInt(mid.replace('m', '')) >= 73) koMap[mid] = pick
    }
    return koMap
  }, [allPicksData, selected])

  // Enrich matchResults with winner from results.knockout so KoCard can show strikethrough
  const enrichedMatchResults = useMemo(() => {
    const ko = results?.knockout || {}
    if (!Object.keys(ko).length) return matchResults
    const enriched = { ...matchResults }
    for (const [id, kr] of Object.entries(ko)) {
      if (kr.winner) enriched[id] = { ...(enriched[id] || {}), winner: kr.winner, home_team: kr.home_team || null, away_team: kr.away_team || null }
    }
    return enriched
  }, [matchResults, results])

  // Build resolvedTeams: ESPN actuals first, then cascade through user's bracket picks
  const resolvedTeams = useMemo(() => {
    if (!viewing || !knockout.length) return {}
    const knockoutPicks = viewing.picks?.knockout || {}
    const groupPicksMap = results.groups || {}

    function resolveSide(side, built) {
      if (typeof side === 'string') {
        if (side.startsWith('3RD:')) return null
        const gpg = groupPicksMap[side[1]]
        return gpg ? (side[0] === '1' ? gpg.first : gpg.second) : null
      }
      if (side?.win)  return knockoutPicks[side.win] || null
      if (side?.lose) {
        const teams  = built[side.lose]
        const winner = knockoutPicks[side.lose]
        if (!teams || !winner) return null
        return teams.home === winner ? teams.away : teams.away === winner ? teams.home : null
      }
      return null
    }

    const built = {}
    for (const m of knockout) {
      const actual = teamOverrides[m.id]
      if (actual?.home && actual?.away) {
        built[m.id] = { home: actual.home, away: actual.away }
      } else {
        built[m.id] = { home: resolveSide(m.home, built), away: resolveSide(m.away, built) }
      }
    }
    return built
  }, [viewing, knockout, results.groups, teamOverrides])

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
          {submitted.filter(matchesFn).map(b => (
            <button
              key={b.user_id}
              onClick={() => setSelected(b.user_id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selected === b.user_id
                  ? 'bg-fifa-gold text-gray-950'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {displayName(b.username)}
            </button>
          ))}
          {noPicks.filter(matchesFn).map(b => (
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
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-white">{displayName(viewing.username)}'s Bracket</span>
            {!allPicksData && (
              <span className="text-xs text-gray-500 italic ml-auto">Score picks hidden until locked</span>
            )}
          </div>
          <div className="p-4">
            <KnockoutBracketWithScores
              knockout={knockout}
              scorePicks={viewingScorePicks}
              knockoutPicks={viewing.picks?.knockout || {}}
              matchResults={enrichedMatchResults}
              locked={true}
              resolvedTeams={resolvedTeams}
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
