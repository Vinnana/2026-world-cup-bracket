import { useState, useEffect } from 'react'
import { brackets, tournament } from '../api'
import { useAuth } from '../context/AuthContext'
import GroupPicks from '../components/GroupPicks'
import KnockoutBracket from '../components/KnockoutBracket'

export default function AllBrackets() {
  const { user } = useAuth()
  const [allBrackets, setAllBrackets] = useState([])
  const [selected, setSelected] = useState(null)
  const [groups, setGroups] = useState({})
  const [knockout, setKnockout] = useState([])
  const [results, setResults] = useState({})
  const [locked, setLocked] = useState(true)
  const [lockTime, setLockTime] = useState('')
  const [tab, setTab] = useState('groups')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [tourney, all, res] = await Promise.all([
        tournament.data(),
        brackets.all(),
        brackets.results(),
      ])
      setGroups(tourney.data.groups)
      setKnockout(tourney.data.knockout || [])
      setAllBrackets(all.data.brackets)
      setResults(res.data)
      setLocked(all.data.settings.locked)
      setLockTime(all.data.settings.lock_time)
      if (all.data.brackets.length > 0) setSelected(all.data.brackets[0].user_id)
      setLoading(false)
    }
    load()
  }, [])

  const viewing = allBrackets.find(b => b.user_id === selected)

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">All Brackets</h1>

      <div className="flex gap-2 flex-wrap mb-6">
        {allBrackets.map(b => (
          <button
            key={b.user_id}
            onClick={() => setSelected(b.user_id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selected === b.user_id ? 'bg-fifa-gold text-gray-950' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {b.username}
            {b.submitted && <span className="ml-1 text-xs opacity-70">({b.score} pts)</span>}
            {!b.submitted && <span className="ml-1 text-xs opacity-50">(no picks)</span>}
          </button>
        ))}
      </div>

      {viewing && viewing.submitted ? (
        <>
          <div className="flex gap-2 mb-6">
            {['groups', 'knockout'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? 'bg-fifa-blue text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {t === 'groups' ? '📋 Group Stage' : '🏆 Knockout'}
              </button>
            ))}
          </div>

          {tab === 'groups' && (
            <GroupPicks
              groups={groups}
              picks={viewing.picks.groups || {}}
              onChange={() => {}}
              results={results}
              readOnly
            />
          )}

          {tab === 'knockout' && (
            <KnockoutBracket
              knockout={knockout}
              groupPicks={viewing.picks.groups || {}}
              knockoutPicks={viewing.picks.knockout || {}}
              results={results}
              readOnly
            />
          )}
        </>
      ) : (
        <div className="card text-gray-400">
          {viewing ? `${viewing.username} hasn't submitted picks yet.` : 'Select a player above.'}
        </div>
      )}
    </div>
  )
}
