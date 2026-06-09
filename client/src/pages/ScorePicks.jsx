import { useState, useEffect, useCallback } from 'react'
import { picks as picksApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { getFlag } from '../utils/flags'

/** Score label helpers */
function ptsColor(pts) {
  if (pts === 10) return 'bg-green-700 text-green-100 border-green-600'
  if (pts === 6)  return 'bg-yellow-700 text-yellow-100 border-yellow-600'
  if (pts === 4)  return 'bg-orange-700 text-orange-100 border-orange-600'
  if (pts === 0)  return 'bg-red-900/60 text-red-300 border-red-800'
  return 'bg-gray-700 text-gray-400 border-gray-600'
}

const ROUND_LABELS = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF:  'Quarter-finals',
  SF:  'Semi-finals',
  Final: 'Final',
}

/** Single match score-prediction row */
function MatchRow({ match, pick, result, locked, onSave, teamOverride }) {
  const displayHome = teamOverride?.home || (typeof match.home === 'string' ? match.home : null)
  const displayAway = teamOverride?.away || (typeof match.away === 'string' ? match.away : null)

  const [homeVal, setHomeVal] = useState(pick?.home_goals ?? '')
  const [awayVal, setAwayVal] = useState(pick?.away_goals ?? '')
  const [dirty,   setDirty]   = useState(false)
  const [flash,   setFlash]   = useState(false)

  // Sync when parent pick changes (e.g. after load)
  useEffect(() => {
    setHomeVal(pick?.home_goals ?? '')
    setAwayVal(pick?.away_goals ?? '')
    setDirty(false)
  }, [pick?.home_goals, pick?.away_goals])

  const resultExists = result && result.home_goals != null && result.away_goals != null

  /** Score pick against result */
  function calcPts() {
    if (!resultExists || homeVal === '' || awayVal === '') return null
    const ph = parseInt(homeVal), pa = parseInt(awayVal)
    const rh = result.home_goals, ra = result.away_goals
    if (isNaN(ph) || isNaN(pa)) return null
    if (ph === rh && pa === ra) return 10
    const outcome = (h, a) => h > a ? 'home' : a > h ? 'away' : 'draw'
    if (outcome(ph, pa) !== outcome(rh, ra)) return 0
    if (ph - pa === rh - ra) return 6
    return 4
  }
  const pts = calcPts()

  function handleChange(side, val) {
    if (locked) return
    const clean = val.replace(/[^0-9]/g, '').slice(0, 2)
    if (side === 'home') setHomeVal(clean)
    else setAwayVal(clean)
    setDirty(true)
  }

  function handleBlur() {
    if (!dirty || locked) return
    if (homeVal === '' || awayVal === '') return
    const hg = parseInt(homeVal), ag = parseInt(awayVal)
    if (isNaN(hg) || isNaN(ag)) return
    onSave(match.id, hg, ag)
    setDirty(false)
    setFlash(true)
    setTimeout(() => setFlash(false), 1000)
  }

  const hasPick = homeVal !== '' && awayVal !== ''
  const isUnknown = !displayHome || !displayAway

  return (
    <div className={`flex items-center gap-1.5 py-2 px-2 rounded-lg transition-colors ${
      flash ? 'bg-fifa-gold/10' : 'bg-gray-800/40 hover:bg-gray-800/60'
    } ${dirty ? 'ring-1 ring-fifa-gold/30' : ''}`}>

      {/* Match number */}
      <span className="text-[10px] text-gray-600 w-7 flex-shrink-0 tabular-nums">
        {match.no}
      </span>

      {/* Home team */}
      <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
        {isUnknown ? (
          <span className="text-xs text-gray-500 italic">TBD</span>
        ) : (
          <>
            <span className="text-xs text-gray-200 truncate text-right hidden sm:block">{displayHome}</span>
            <span className="text-xs text-gray-200 truncate text-right sm:hidden">
              {displayHome?.split(' ').slice(-1)[0]}
            </span>
            <span className="text-sm flex-shrink-0">{getFlag(displayHome)}</span>
          </>
        )}
      </div>

      {/* Score inputs */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={homeVal}
          onChange={e => handleChange('home', e.target.value)}
          onBlur={handleBlur}
          disabled={locked}
          placeholder="–"
          className={`w-9 h-8 text-center text-sm font-bold rounded border transition-colors
            ${locked
              ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-gray-700 border-gray-600 text-white focus:border-fifa-gold focus:outline-none focus:bg-gray-700/80'
            }
            ${resultExists && hasPick ? ptsColor(pts).replace('border-', 'border-') : ''}
          `}
        />
        <span className="text-gray-500 text-xs font-semibold">–</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={awayVal}
          onChange={e => handleChange('away', e.target.value)}
          onBlur={handleBlur}
          disabled={locked}
          placeholder="–"
          className={`w-9 h-8 text-center text-sm font-bold rounded border transition-colors
            ${locked
              ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-gray-700 border-gray-600 text-white focus:border-fifa-gold focus:outline-none focus:bg-gray-700/80'
            }
          `}
        />
      </div>

      {/* Away team */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {!isUnknown && (
          <>
            <span className="text-sm flex-shrink-0">{getFlag(displayAway)}</span>
            <span className="text-xs text-gray-200 truncate hidden sm:block">{displayAway}</span>
            <span className="text-xs text-gray-200 truncate sm:hidden">
              {displayAway?.split(' ').slice(-1)[0]}
            </span>
          </>
        )}
      </div>

      {/* Result / pts badge */}
      <div className="w-16 flex-shrink-0 text-right">
        {resultExists ? (
          <div className="flex items-center justify-end gap-1">
            <span className="text-[11px] text-gray-400">
              {result.home_goals}–{result.away_goals}
            </span>
            {hasPick && pts != null && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ptsColor(pts)}`}>
                {pts > 0 ? `+${pts}` : '✗'}
              </span>
            )}
          </div>
        ) : hasPick ? (
          <span className="text-[10px] text-gray-600">saved</span>
        ) : null}
      </div>
    </div>
  )
}

/** Group accordion */
function GroupSection({ letter, matches, picks, results, locked, onSave, teamOverrides }) {
  const [open, setOpen] = useState(false)

  const groupPts = matches.reduce((sum, m) => {
    const pick = picks[m.id]
    const result = results[m.id]
    if (!pick || !result || result.home_goals == null) return sum
    const ph = pick.home_goals, pa = pick.away_goals
    const rh = result.home_goals, ra = result.away_goals
    if (ph === rh && pa === ra) return sum + 10
    const outcome = (h, a) => h > a ? 'home' : a > h ? 'away' : 'draw'
    if (outcome(ph, pa) !== outcome(rh, ra)) return sum
    if (ph - pa === rh - ra) return sum + 6
    return sum + 4
  }, 0)

  const pickedCount  = matches.filter(m => picks[m.id]?.home_goals != null).length
  const resultsCount = matches.filter(m => results[m.id]?.home_goals != null).length

  return (
    <div className="rounded-xl border border-gray-700/50 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/60 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-fifa-gold text-sm">Group {letter}</span>
          <span className="text-xs text-gray-500">{pickedCount}/6 picked</span>
          {resultsCount > 0 && (
            <span className="text-xs text-gray-400">{resultsCount} results in</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {groupPts > 0 && (
            <span className="text-xs font-bold text-fifa-gold bg-fifa-gold/10 px-2 py-0.5 rounded-full">
              +{groupPts} pts
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20" fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
          </svg>
        </div>
      </button>

      {open && (
        <div className="bg-gray-900/40 divide-y divide-gray-800/50">
          {matches.map(m => (
            <MatchRow
              key={m.id}
              match={m}
              pick={picks[m.id]}
              result={results[m.id]}
              locked={locked}
              onSave={onSave}
              teamOverride={teamOverrides?.[m.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Knockout round section */
function KnockoutRound({ label, matches, picks, results, locked, onSave, teamOverrides }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">{label}</h3>
      <div className="space-y-1">
        {matches.map(m => (
          <MatchRow
            key={m.id}
            match={m}
            pick={picks[m.id]}
            result={results[m.id]}
            locked={locked}
            onSave={onSave}
            teamOverride={teamOverrides?.[m.id]}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ScorePicks() {
  const { user } = useAuth()

  const [allMatches,    setAllMatches]    = useState([])
  const [results,       setResults]       = useState({})   // { match_id: { home_goals, away_goals } }
  const [teamOverrides, setTeamOverrides] = useState({})
  const [myPicks,       setMyPicks]       = useState({})   // { match_id: { home_goals, away_goals } }
  const [locked,        setLocked]        = useState(false)
  const [knockoutOpen,  setKnockoutOpen]  = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState('group')
  const [statusMsg,     setStatusMsg]     = useState('')

  // Load matches + my picks
  async function load() {
    try {
      const [matchRes, myRes] = await Promise.all([
        picksApi.matches(),
        picksApi.my(),
      ])

      setAllMatches(matchRes.data.matches || [])
      setResults(matchRes.data.results || {})
      setTeamOverrides(matchRes.data.team_overrides || {})
      setLocked(matchRes.data.locked)
      setKnockoutOpen(matchRes.data.knockout_open)

      const pickMap = {}
      for (const p of (myRes.data.picks || [])) {
        pickMap[p.match_id] = { home_goals: p.home_goals, away_goals: p.away_goals }
      }
      setMyPicks(pickMap)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [])

  // Auto-save single pick on blur
  const handleSave = useCallback(async (match_id, home_goals, away_goals) => {
    try {
      await picksApi.save([{ match_id, home_goals, away_goals }])
      setMyPicks(prev => ({ ...prev, [match_id]: { home_goals, away_goals } }))
      setStatusMsg('✓ Saved')
      setTimeout(() => setStatusMsg(''), 1500)
    } catch {
      setStatusMsg('⚠ Save failed')
      setTimeout(() => setStatusMsg(''), 2000)
    }
  }, [])

  if (loading) return <div className="p-8 text-gray-400 text-center">Loading…</div>

  // Derived data
  const groupMatches = allMatches.filter(m => m.round === 'Group')
  const knockoutMatches = allMatches.filter(m => m.round !== 'Group')
  const groups = [...new Set(groupMatches.map(m => m.group))].sort()

  const totalPts = Object.values(myPicks).reduce((sum, pick) => {
    if (!pick || pick.home_goals == null) return sum
    const r = results[Object.keys(myPicks).find(k => myPicks[k] === pick)]
    if (!r || r.home_goals == null) return sum
    // inline score calc
    const ph = pick.home_goals, pa = pick.away_goals
    const rh = r.home_goals, ra = r.away_goals
    if (ph === rh && pa === ra) return sum + 10
    const outcome = (h, a) => h > a ? 'home' : a > h ? 'away' : 'draw'
    if (outcome(ph, pa) !== outcome(rh, ra)) return sum
    if (ph - pa === rh - ra) return sum + 6
    return sum + 4
  }, 0)

  // Re-compute total pts correctly (iterate by match_id)
  let realTotal = 0
  for (const [mid, pick] of Object.entries(myPicks)) {
    const r = results[mid]
    if (!pick || pick.home_goals == null || !r || r.home_goals == null) continue
    const ph = pick.home_goals, pa = pick.away_goals
    const rh = r.home_goals, ra = r.away_goals
    if (ph === rh && pa === ra) { realTotal += 10; continue }
    const outcome = (h, a) => h > a ? 'home' : a > h ? 'away' : 'draw'
    if (outcome(ph, pa) !== outcome(rh, ra)) continue
    realTotal += ph - pa === rh - ra ? 6 : 4
  }

  const pickedCount   = Object.keys(myPicks).length
  const resultsIn     = Object.values(results).filter(r => r.home_goals != null).length

  const koRounds = ['R32', 'R16', 'QF', 'SF', 'Final']

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">⚽ Score Picks</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Predict the score for every match — pick closest wins
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-right">
            <span className="text-2xl font-black text-fifa-gold">{realTotal}</span>
            <span className="text-sm text-gray-500 ml-1">pts</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{pickedCount} picks</span>
            {resultsIn > 0 && <span>· {resultsIn} results in</span>}
          </div>
        </div>
      </div>

      {/* Status / lock banner */}
      {locked ? (
        <div className="mb-4 flex items-center gap-2 bg-red-900/30 border border-red-800/50 text-red-300 rounded-lg px-4 py-2.5 text-sm">
          <span>🔒</span>
          <span className="font-medium">Picks are locked</span>
          <span className="text-red-400/70 ml-auto">view-only</span>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 bg-green-900/20 border border-green-800/40 text-green-400 rounded-lg px-4 py-2.5 text-sm">
          <span>🟢</span>
          <span>Picks open — scores auto-save as you type and tab away</span>
          {statusMsg && <span className="ml-auto text-xs font-medium text-green-300">{statusMsg}</span>}
        </div>
      )}

      {/* Scoring legend */}
      <div className="mb-5 flex items-center gap-3 text-xs flex-wrap">
        <span className="text-gray-500">Scoring:</span>
        {[
          ['bg-green-700 text-green-100', '+10', 'Exact score'],
          ['bg-yellow-700 text-yellow-100', '+6', 'Right diff'],
          ['bg-orange-700 text-orange-100', '+4', 'Right winner'],
        ].map(([cls, pts, label]) => (
          <span key={pts} className={`${cls} px-2 py-0.5 rounded font-bold`}>
            {pts} <span className="font-normal opacity-80">{label}</span>
          </span>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { key: 'group',    label: '🏟 Group Stage' },
          { key: 'knockout', label: '⚡ Knockout' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.key
                ? 'bg-fifa-gold text-gray-950'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Group Stage Tab */}
      {tab === 'group' && (
        <div className="space-y-2">
          {groups.map(letter => {
            const gMatches = groupMatches.filter(m => m.group === letter)
            return (
              <GroupSection
                key={letter}
                letter={letter}
                matches={gMatches}
                picks={myPicks}
                results={results}
                locked={locked}
                onSave={handleSave}
                teamOverrides={teamOverrides}
              />
            )
          })}
        </div>
      )}

      {/* Knockout Tab */}
      {tab === 'knockout' && (
        !knockoutOpen ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">⏳</div>
            <h3 className="font-bold text-white mb-2">Knockout Picks Coming Soon</h3>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              Knockout picks open after the group stage ends. Once the admin unlocks Phase 2,
              you can predict scores for all 32 knockout matches — starting fresh.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-4 bg-blue-900/20 border border-blue-800/40 text-blue-300 rounded-lg px-4 py-2.5 text-sm">
              ⚡ Knockout Phase is open — predict scores for all knockout matches below
            </div>
            {koRounds.map(round => {
              const rMatches = knockoutMatches.filter(m => m.round === round)
              if (!rMatches.length) return null
              return (
                <KnockoutRound
                  key={round}
                  label={round === 'R32' ? 'Round of 32' : round === 'R16' ? 'Round of 16' :
                         round === 'QF' ? 'Quarter-finals' : round === 'SF' ? 'Semi-finals' : 'Final 🏆'}
                  matches={rMatches}
                  picks={myPicks}
                  results={results}
                  locked={locked}
                  onSave={handleSave}
                  teamOverrides={teamOverrides}
                />
              )
            })}
          </div>
        )
      )}

      {/* Bottom hint */}
      {!locked && (
        <p className="text-xs text-gray-600 mt-6 text-center">
          Scores save automatically when you click away from an input field
        </p>
      )}
    </div>
  )
}
