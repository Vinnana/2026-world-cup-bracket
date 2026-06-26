import { useState, useEffect } from 'react'
import { brackets, tournament, picks as picksApi } from '../api'
import GroupPicks from '../components/GroupPicks'
import KnockoutBracket from '../components/KnockoutBracket'

export default function MyBracket() {
  const [tab, setTab] = useState('groups')
  const [groups, setGroups] = useState({})
  const [knockout, setKnockout] = useState([])
  const [groupPicks, setGroupPicks] = useState({})
  const [knockoutPicks, setKnockoutPicks] = useState({})
  const [results, setResults] = useState({})
  const [actualTeams, setActualTeams] = useState({})   // { mId: { home, away } } actual knockout matchups
  const [locked, setLocked] = useState(false)
  const [lockTime, setLockTime] = useState('')
  const [knockoutOpen, setKnockoutOpen] = useState(false)
  const [knockoutLocked, setKnockoutLocked] = useState(false)
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
      setKnockoutOpen(!!myBracket.data.knockout_open)
      setKnockoutLocked(!!myBracket.data.knockout_locked)

      const res = await brackets.results()
      setResults(res.data)

      // Actual knockout matchups (real teams + orientation) once known.
      try {
        const m = await picksApi.matches()
        setActualTeams(m.data.team_overrides || {})
      } catch { /* optional */ }
    }
    load()
  }, [])

  // Knockout bracket is editable only while Phase 2 is open and not yet locked.
  const knockoutEditable = knockoutOpen && !knockoutLocked

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
              🔒 Group bracket locked{lockTime ? ` (since ${new Date(lockTime).toLocaleString()})` : ''}
            </p>
          )}
          {knockoutOpen && knockoutLocked && (
            <p className="text-red-400 text-sm mt-1">🔒 Knockout picks are locked</p>
          )}
          {knockoutEditable && (
            <p className="text-green-400 text-sm mt-1">⚡ Knockout bracket is open — pick who advances each round</p>
          )}
        </div>
        {(!locked || knockoutEditable) && (
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
        !knockoutOpen ? (
          <div className="card text-center py-10 text-gray-400">
            <p className="text-3xl mb-3">⏳</p>
            <p className="font-medium text-white mb-1">Knockout bracket opens after the group stage</p>
            <p className="text-sm">Once the admin opens Phase 2, pick who advances each round — and the champion.</p>
          </div>
        ) : (
          <div>
            <div className="card border-fifa-gold/40 mb-4 text-sm text-gray-300 space-y-1.5">
              <p className="font-semibold text-fifa-gold">🏆 How the knockout works</p>
              <p><span className="text-white font-medium">1.</span> Here, tap a team to send them through each round — Round of 32 → 16 → QF → SF → Final, and your champion. Round-of-32 shows the real matchups; later rounds fill in from your own winner picks.</p>
              <p><span className="text-white font-medium">2.</span> Then head to <span className="text-white font-medium">⚽ Score Picks → Knockout</span> to predict a scoreline for each matchup.</p>
              <p className="text-gray-400">
                Scoring per match (max <span className="text-white font-medium">20</span>):
                <span className="text-green-400 font-medium"> +10</span> if your team advances, plus a
                <span className="text-white font-medium"> +10/+6/+4</span> scoreline bonus when you also nail the matchup.
              </p>
              {knockoutLocked && <p className="text-red-400 font-medium">🔒 Your knockout picks are locked.</p>}
            </div>
            <KnockoutBracket
              knockout={knockout}
              groupPicks={groupPicks}
              knockoutPicks={knockoutPicks}
              onKnockoutPick={handleKnockoutPick}
              results={results}
              actualTeams={actualTeams}
              readOnly={!knockoutEditable}
            />
          </div>
        )
      )}
    </div>
  )
}
