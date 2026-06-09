import { useState, useEffect } from 'react'
import { brackets, tournament } from '../api'
import GroupPicks from '../components/GroupPicks'
import KnockoutBracket from '../components/KnockoutBracket'

export default function MyBracket() {
  const [tab, setTab] = useState('groups')
  const [groups, setGroups] = useState({})
  const [knockout, setKnockout] = useState([])
  const [groupPicks, setGroupPicks] = useState({})
  const [knockoutPicks, setKnockoutPicks] = useState({})
  const [results, setResults] = useState({})
  const [locked, setLocked] = useState(false)
  const [lockTime, setLockTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const [tourney, myBracket] = await Promise.all([
        tournament.data(),
        brackets.my(),
      ])
      setGroups(tourney.data.groups)
      setKnockout(tourney.data.knockout || [])
      const picks = myBracket.data.picks
      setGroupPicks(picks.groups || {})
      setKnockoutPicks(picks.knockout || {})
      setLocked(myBracket.data.locked)
      setLockTime(myBracket.data.lock_time)

      const res = await brackets.results()
      setResults(res.data)
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await brackets.save({ groups: groupPicks, knockout: knockoutPicks })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function handleKnockoutPick(matchId, team) {
    setKnockoutPicks(prev => ({ ...prev, [matchId]: team }))
    setSaved(false)
  }

  const tabs = [
    { key: 'groups', label: '📋 Group Stage' },
    { key: 'knockout', label: '🏆 Knockout Bracket' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Bracket</h1>
          {locked && (
            <p className="text-red-400 text-sm mt-1">
              🔒 Brackets are locked{lockTime ? ` (since ${new Date(lockTime).toLocaleString()})` : ''}
            </p>
          )}
        </div>
        {!locked && (
          <div className="flex items-center gap-3">
            {error && <span className="text-red-400 text-sm">{error}</span>}
            {saved && <span className="text-green-400 text-sm">✓ Saved!</span>}
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save Picks'}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-fifa-gold text-gray-950' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'groups' && (
        <>
          <div className="card border-fifa-gold/40 mb-4 text-sm text-gray-300">
            <p className="font-semibold text-fifa-gold mb-1">🥉 About 3rd-place picks</p>
            <p>
              Pick 1st, 2nd, and 3rd for all 12 groups. In the 2026 format only the{' '}
              <span className="font-semibold text-white">8 best 3rd-place teams</span> advance to the
              knockouts — so a correct 3rd-place pick only earns its point if that team is one of the 8
              that qualify. Your 3rd-place picks in the other 4 groups won't score. 1st (3 pts) and 2nd
              (2 pts) picks score in every group.
            </p>
          </div>
          <GroupPicks
            groups={groups}
            picks={groupPicks}
            onChange={setGroupPicks}
            results={results}
            readOnly={locked}
          />
        </>
      )}

      {tab === 'knockout' && (
        <div>
          <p className="text-gray-400 text-sm mb-4">
            Click a team name to pick them as the match winner. Teams auto-populate from your group stage picks.
          </p>
          <KnockoutBracket
            knockout={knockout}
            groupPicks={groupPicks}
            knockoutPicks={knockoutPicks}
            onKnockoutPick={handleKnockoutPick}
            results={results}
            readOnly={locked}
          />
        </div>
      )}
    </div>
  )
}
