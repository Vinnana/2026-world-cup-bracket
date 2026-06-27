import { useState, useEffect, useRef, useCallback } from 'react'
import { brackets, tournament, picks as picksApi } from '../api'
import { getFlag } from '../utils/flags'

// ── Bracket layout constants ─────────────────────────────────────────────────
const SLOT_H = 96    // vertical px per R32 slot
const CARD_H = 88    // px height of each match card
const COL_W  = 172   // px width per round column
const CONN_W = 28    // px width of connector gap
const TOTAL_H = 16 * SLOT_H  // 1536px

const BRACKET_ORDER = [
  ['m74','m77','m73','m75','m83','m84','m81','m82','m76','m78','m79','m80','m86','m88','m85','m87'],
  ['m89','m90','m93','m94','m91','m92','m95','m96'],
  ['m97','m98','m99','m100'],
  ['m101','m102'],
  ['m104'],
]

const ROUND_LABELS = {
  R32: 'Round of 32', R16: 'Round of 16',
  QF: 'Quarter-finals', SF: 'Semi-finals', Final: 'Final',
}

function bCardTop(roundIdx, matchIdx) {
  const step = SLOT_H * Math.pow(2, roundIdx)
  return (step - SLOT_H) / 2 + matchIdx * step
}

function shortName(name) {
  if (!name) return ''
  const words = name.trim().split(/\s+/)
  if (words.length === 1 || name.length <= 10) return name
  return words[0][0].toUpperCase() + '. ' + words[words.length - 1]
}

function ptsLabel(pts) {
  if (pts === 10) return { text: '+10', cls: 'text-green-400' }
  if (pts === 6)  return { text: '+6',  cls: 'text-yellow-400' }
  if (pts === 4)  return { text: '+4',  cls: 'text-orange-400' }
  if (pts === 0)  return { text: '✗',   cls: 'text-red-400' }
  return null
}

// ── Single knockout match card ────────────────────────────────────────────────
function KoCard({ match, scorePick, result, locked, onSaveScore, onClearScore, homeTeam, awayTeam, advancePick, onPickAdvancement }) {
  const awayRef = useRef(null)

  const [homeVal, setHomeVal] = useState(scorePick?.home_goals ?? '')
  const [awayVal, setAwayVal] = useState(scorePick?.away_goals ?? '')
  const [dirty,   setDirty]   = useState(false)
  const [flash,   setFlash]   = useState(false)

  useEffect(() => {
    setHomeVal(scorePick?.home_goals ?? '')
    setAwayVal(scorePick?.away_goals ?? '')
    setDirty(false)
  }, [scorePick?.home_goals, scorePick?.away_goals])

  const resultExists = result?.home_goals != null

  function calcPts() {
    if (!resultExists || homeVal === '' || awayVal === '') return null
    const ph = parseInt(homeVal), pa = parseInt(awayVal)
    const rh = result.home_goals, ra = result.away_goals
    if (isNaN(ph) || isNaN(pa)) return null
    if (ph === rh && pa === ra) return 10
    const outcome = (h, a) => h > a ? 'home' : a > h ? 'away' : 'draw'
    if (outcome(ph, pa) !== outcome(rh, ra)) return 0
    return ph - pa === rh - ra ? 6 : 4
  }
  const ptsBadge = (() => { const pts = calcPts(); return pts != null ? ptsLabel(pts) : null })()

  function doSave(hg, ag) {
    onSaveScore(match.id, hg, ag)
    setDirty(false)
    setFlash(true)
    setTimeout(() => setFlash(false), 800)
  }

  function handleChange(side, val) {
    if (locked) return
    const clean = val.replace(/[^0-9]/g, '').slice(0, 2)
    if (side === 'home') {
      setHomeVal(clean)
      setDirty(true)
      if (clean.length >= 1) { awayRef.current?.focus(); awayRef.current?.select() }
    } else {
      setAwayVal(clean)
      if (clean.length >= 1 && homeVal !== '') {
        const hg = parseInt(homeVal), ag = parseInt(clean)
        if (!isNaN(hg) && !isNaN(ag)) doSave(hg, ag)
      } else {
        setDirty(true)
      }
    }
  }

  function handleBlur() {
    if (locked) return
    // Both inputs cleared while a pick existed → signal deletion
    if (homeVal === '' && awayVal === '' && scorePick?.home_goals != null) {
      onClearScore(match.id)
      return
    }
    if (!dirty || homeVal === '' || awayVal === '') return
    const hg = parseInt(homeVal), ag = parseInt(awayVal)
    if (isNaN(hg) || isNaN(ag)) return
    doSave(hg, ag)
  }

  const isUnknown   = !homeTeam || !awayTeam
  const bothEntered = homeVal !== '' && awayVal !== ''
  const hg = parseInt(homeVal), ag = parseInt(awayVal)
  const isDraw      = bothEntered && !isNaN(hg) && !isNaN(ag) && hg === ag
  const clearWinner = bothEntered && !isNaN(hg) && !isNaN(ag) && hg !== ag
    ? (hg > ag ? homeTeam : awayTeam) : null

  const inputCls = `w-7 h-6 text-center text-xs font-bold rounded border flex-shrink-0 transition-colors ${
    locked
      ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
      : 'bg-gray-700 border-gray-600 text-white focus:border-fifa-gold focus:outline-none'
  }`

  return (
    <div
      className={`h-full rounded-lg border overflow-hidden flex flex-col transition-colors ${
        flash  ? 'border-fifa-gold/60 bg-fifa-gold/5'
               : dirty ? 'border-fifa-gold/30 bg-gray-800/80'
               : 'border-gray-700/60 bg-gray-800/60'
      }`}
      style={{ height: CARD_H }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-1.5 bg-gray-900/70 flex-shrink-0" style={{ height: 14 }}>
        <span className="text-gray-500 font-medium" style={{ fontSize: 9 }}>M{match.no}</span>
        {ptsBadge && bothEntered && (
          <span className={`font-bold ${ptsBadge.cls}`} style={{ fontSize: 9 }}>{ptsBadge.text}</span>
        )}
      </div>

      {/* Home team */}
      <div className="flex items-center gap-1 px-1.5 flex-shrink-0" style={{ height: 24 }}>
        {isUnknown
          ? <span className="text-gray-500 italic flex-1" style={{ fontSize: 10 }}>TBD</span>
          : <>
              <span className="flex-shrink-0" style={{ fontSize: 11 }}>{getFlag(homeTeam)}</span>
              <span className="text-gray-200 truncate flex-1 min-w-0" style={{ fontSize: 10 }}>{shortName(homeTeam)}</span>
            </>
        }
        <input
          type="text" inputMode="numeric" maxLength={2}
          value={homeVal} onChange={e => handleChange('home', e.target.value)}
          onBlur={handleBlur} disabled={locked} placeholder="–"
          className={inputCls}
        />
      </div>

      {/* Divider */}
      <div className="bg-gray-700/50 flex-shrink-0 mx-1.5" style={{ height: 1 }} />

      {/* Away team */}
      <div className="flex items-center gap-1 px-1.5 flex-shrink-0" style={{ height: 24 }}>
        {isUnknown
          ? <span className="text-gray-500 italic flex-1" style={{ fontSize: 10 }}>TBD</span>
          : <>
              <span className="flex-shrink-0" style={{ fontSize: 11 }}>{getFlag(awayTeam)}</span>
              <span className="text-gray-200 truncate flex-1 min-w-0" style={{ fontSize: 10 }}>{shortName(awayTeam)}</span>
            </>
        }
        <input
          ref={awayRef}
          type="text" inputMode="numeric" maxLength={2}
          value={awayVal} onChange={e => handleChange('away', e.target.value)}
          onBlur={handleBlur} disabled={locked} placeholder="–"
          className={inputCls}
        />
      </div>

      {/* Divider */}
      <div className="bg-gray-700/30 flex-shrink-0 mx-1.5" style={{ height: 1 }} />

      {/* Footer: advances indicator / draw picker / result */}
      <div className="flex items-center px-1.5 flex-1 min-h-0">
        {resultExists ? (
          <span className="text-gray-500 tabular-nums mx-auto" style={{ fontSize: 9 }}>
            Result: {result.home_goals}–{result.away_goals}
          </span>
        ) : clearWinner ? (
          <span className="text-fifa-gold font-medium truncate" style={{ fontSize: 9 }}>
            → {shortName(clearWinner)}
          </span>
        ) : isDraw && !isUnknown ? (
          <div className="flex items-center gap-0.5 w-full overflow-hidden">
            <span className="text-gray-500 flex-shrink-0" style={{ fontSize: 8 }}>ET/Pens:</span>
            {[homeTeam, awayTeam].map(t => (
              <button
                key={t}
                disabled={locked}
                onClick={() => !locked && onPickAdvancement(match.id, t)}
                className={`flex-1 rounded truncate transition-colors min-w-0 ${
                  advancePick === t
                    ? 'bg-fifa-gold text-gray-950 font-bold'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                style={{ fontSize: 8, lineHeight: '16px', padding: '0 2px' }}
              >
                {shortName(t)}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-gray-700 mx-auto" style={{ fontSize: 8 }}>
            {isUnknown ? '' : 'enter score'}
          </span>
        )}
      </div>
    </div>
  )
}

// ── NCAA-style bracket ────────────────────────────────────────────────────────
function KnockoutBracketWithScores({ knockout, scorePicks, knockoutPicks, matchResults, locked, onSaveScore, onClearScore, onPickAdvancement, resolvedTeams }) {
  const matchById = {}
  for (const m of knockout) matchById[m.id] = m

  const roundKeys = ['R32', 'R16', 'QF', 'SF', 'Final']
  const totalWidth = BRACKET_ORDER.length * COL_W + (BRACKET_ORDER.length - 1) * CONN_W

  return (
    <div className="overflow-x-auto pb-2 -mx-4 px-4">
      <div className="flex mb-2 flex-shrink-0" style={{ width: totalWidth }}>
        {roundKeys.map((key, i) => (
          <div key={key} className="flex-shrink-0"
            style={{ width: COL_W + (i < roundKeys.length - 1 ? CONN_W : 0) }}>
            <span className="block text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
              {ROUND_LABELS[key]}
            </span>
          </div>
        ))}
      </div>

      <div className="relative flex-shrink-0 flex" style={{ height: TOTAL_H, width: totalWidth }}>
        {BRACKET_ORDER.map((roundIds, roundIdx) => (
          <div key={roundIdx} className="flex flex-shrink-0">
            <div className="relative flex-shrink-0" style={{ width: COL_W, height: TOTAL_H }}>
              {roundIds.map((id, matchIdx) => {
                const m = matchById[id]
                if (!m) return null
                const top   = bCardTop(roundIdx, matchIdx)
                const teams = resolvedTeams[id] || {}
                return (
                  <div key={id} className="absolute" style={{ top, left: 0, width: COL_W, height: CARD_H }}>
                    <KoCard
                      match={m}
                      scorePick={scorePicks[id]}
                      result={matchResults[id]}
                      locked={locked}
                      onSaveScore={onSaveScore}
                      onClearScore={onClearScore}
                      homeTeam={teams.home || null}
                      awayTeam={teams.away || null}
                      advancePick={knockoutPicks[id]}
                      onPickAdvancement={onPickAdvancement}
                    />
                  </div>
                )
              })}
            </div>

            {roundIdx < BRACKET_ORDER.length - 1 && (
              <div className="relative flex-shrink-0" style={{ width: CONN_W, height: TOTAL_H }}>
                {BRACKET_ORDER[roundIdx + 1].map((_, i) => {
                  const f0  = bCardTop(roundIdx, 2 * i)     + CARD_H / 2
                  const f1  = bCardTop(roundIdx, 2 * i + 1) + CARD_H / 2
                  const mid = (f0 + f1) / 2
                  const half = CONN_W / 2
                  return (
                    <div key={i}>
                      <div className="absolute bg-gray-600" style={{ top: f0 - 1, left: 0,        width: half, height: 2 }} />
                      <div className="absolute bg-gray-600" style={{ top: f1 - 1, left: 0,        width: half, height: 2 }} />
                      <div className="absolute bg-gray-600" style={{ top: f0,     left: half - 1, width: 2,    height: f1 - f0 }} />
                      <div className="absolute bg-gray-600" style={{ top: mid - 1, left: half,    width: half, height: 2 }} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MyBracket() {
  const [knockout,      setKnockout]      = useState([])
  const [groupPicks,    setGroupPicks]    = useState({})   // used for slot resolution only
  const [knockoutPicks, setKnockoutPicks] = useState({})
  const [scorePicks,    setScorePicks]    = useState({})
  const [matchResults,  setMatchResults]  = useState({})
  const [teamOverrides, setTeamOverrides] = useState({})
  const [knockoutOpen,  setKnockoutOpen]  = useState(false)
  const [knockoutLocked,setKnockoutLocked]= useState(false)
  const [loading,       setLoading]       = useState(true)
  const [statusMsg,     setStatusMsg]     = useState('')
  const [errorMsg,      setErrorMsg]      = useState('')
  const [isDirty,       setIsDirty]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [pendingDeletes,setPendingDeletes]= useState(new Set()) // match_ids cleared by user

  const groupPicksRef    = useRef({})
  const knockoutPicksRef = useRef({})
  const resolvedTeamsRef = useRef({})

  useEffect(() => {
    async function load() {
      try {
        const [tourney, myBracket, myScorePicks, matchesRes] = await Promise.all([
          tournament.data(),
          brackets.my(),
          picksApi.my(),
          picksApi.matches(),
        ])

        setKnockout(tourney.data.knockout || [])

        const bp = myBracket.data.picks
        const gp = bp.groups   || {}
        const kp = bp.knockout || {}
        setGroupPicks(gp)
        setKnockoutPicks(kp)
        groupPicksRef.current    = gp
        knockoutPicksRef.current = kp

        setKnockoutOpen(!!myBracket.data.knockout_open)
        setKnockoutLocked(!!myBracket.data.knockout_locked)
        setTeamOverrides(matchesRes.data.team_overrides || {})
        setMatchResults(matchesRes.data.results || {})

        const scoreMap = {}
        for (const p of (myScorePicks.data.picks || [])) {
          if (parseInt(p.match_id.replace('m', '')) >= 73) {
            scoreMap[p.match_id] = { home_goals: p.home_goals, away_goals: p.away_goals }
          }
        }
        setScorePicks(scoreMap)
      } catch (err) {
        setErrorMsg('Failed to load — ' + (err.message || 'unknown error'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Keep refs in sync so callbacks see fresh values without stale closures
  groupPicksRef.current    = groupPicks
  knockoutPicksRef.current = knockoutPicks

  // Resolve the displayed team for each knockout slot.
  // Actual ESPN data takes priority; falls back to bracket picks cascade.
  function resolvePredicted(side, gp, kp) {
    if (typeof side === 'string') {
      if (side.startsWith('3RD:')) return null
      const gpg = gp?.[side[1]]
      return gpg ? (side[0] === '1' ? gpg.first : gpg.second) : null
    }
    if (side?.win) return kp?.[side.win] || null
    return null
  }

  const resolvedTeams = {}
  for (const m of knockout) {
    const actual = teamOverrides[m.id]
    if (actual?.home && actual?.away) {
      resolvedTeams[m.id] = { home: actual.home, away: actual.away }
    } else {
      resolvedTeams[m.id] = {
        home: resolvePredicted(m.home, groupPicks, knockoutPicks),
        away: resolvePredicted(m.away, groupPicks, knockoutPicks),
      }
    }
  }
  resolvedTeamsRef.current = resolvedTeams

  const knockoutEditable = knockoutOpen && !knockoutLocked

  function flashMsg(msg, isErr = false) {
    if (isErr) {
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(''), 4000)
    } else {
      setStatusMsg(msg)
      setTimeout(() => setStatusMsg(''), 2000)
    }
  }

  // Buffer score change locally — no API call until Save
  const handleSaveScore = useCallback((match_id, home_goals, away_goals) => {
    setScorePicks(prev => ({ ...prev, [match_id]: { home_goals, away_goals } }))
    // If this match was previously queued for deletion, un-queue it
    setPendingDeletes(prev => { const s = new Set(prev); s.delete(match_id); return s })
    setIsDirty(true)

    // Auto-advance bracket winner locally when score is clear
    if (home_goals !== away_goals) {
      const teams  = resolvedTeamsRef.current[match_id]
      const winner = home_goals > away_goals ? teams?.home : teams?.away
      if (winner) {
        const kp = { ...knockoutPicksRef.current, [match_id]: winner }
        knockoutPicksRef.current = kp
        setKnockoutPicks(kp)
      }
    }
  }, [])

  // User cleared both inputs — remove pick from local state and queue deletion
  const handleClearScore = useCallback((match_id) => {
    setScorePicks(prev => { const s = { ...prev }; delete s[match_id]; return s })
    setPendingDeletes(prev => new Set([...prev, match_id]))
    // Also clear any auto-advanced bracket pick for this match
    const kp = { ...knockoutPicksRef.current }
    delete kp[match_id]
    knockoutPicksRef.current = kp
    setKnockoutPicks(kp)
    setIsDirty(true)
  }, [])

  // Buffer ET/Pens pick locally — no API call until Save
  const handlePickAdvancement = useCallback((match_id, team) => {
    const kp = { ...knockoutPicksRef.current, [match_id]: team }
    knockoutPicksRef.current = kp
    setKnockoutPicks(kp)
    setIsDirty(true)
  }, [])

  // Flush all buffered changes to the backend
  async function handleSaveAll() {
    setSaving(true)
    try {
      const knockoutScorePicks = Object.entries(scorePicks).map(([match_id, p]) => ({
        match_id, home_goals: p.home_goals, away_goals: p.away_goals,
      }))
      // Fire upserts + deletes + bracket save in parallel
      await Promise.all([
        knockoutScorePicks.length ? picksApi.save(knockoutScorePicks) : Promise.resolve(),
        ...[...pendingDeletes].map(mid => picksApi.deletePick(mid)),
        brackets.save({ groups: groupPicksRef.current, knockout: knockoutPicksRef.current }),
      ])
      setPendingDeletes(new Set())
      setIsDirty(false)
      flashMsg('✓ Picks saved!')
    } catch (err) {
      flashMsg(err.response?.data?.error || 'Save failed', true)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="p-8 text-gray-400 text-center">Loading…</div>
  }

  // Locked / not yet open — full page gate
  if (!knockoutOpen) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-black text-white mb-2">Knockout Bracket Locked</h1>
        <p className="text-gray-400 text-sm max-w-sm mx-auto">
          The knockout bracket opens once the admin starts Phase 2. Check back after the group stage ends.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">🏆 My Bracket</h1>
          <p className="text-sm text-gray-400 mt-0.5">Predict every knockout match and advance your teams</p>
        </div>
        <div className="flex items-center gap-3 self-center">
          {statusMsg && <span className="text-green-400 text-sm font-medium">{statusMsg}</span>}
          {errorMsg  && <span className="text-red-400 text-sm font-medium">{errorMsg}</span>}
          {knockoutEditable && (
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
                isDirty
                  ? 'bg-fifa-gold text-gray-950 hover:bg-yellow-400'
                  : 'bg-gray-700 text-gray-400 cursor-default'
              } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {saving ? 'Saving…' : 'Save Picks'}
            </button>
          )}
        </div>
      </div>

      {/* Unsaved changes warning */}
      {isDirty && knockoutEditable && (
        <div className="mb-4 flex items-center gap-2 bg-amber-900/30 border border-amber-700/50 text-amber-300 rounded-lg px-4 py-2.5 text-sm">
          <span>⚠</span>
          <span>You have unsaved changes — click <span className="font-bold">Save Picks</span> to submit.</span>
        </div>
      )}

      {/* Status banner */}
      {knockoutLocked ? (
        <div className="mb-4 flex items-center gap-2 bg-red-900/30 border border-red-800/50 text-red-300 rounded-lg px-4 py-2.5 text-sm">
          <span>🔒</span>
          <span className="font-medium">Knockout picks are locked — view only.</span>
        </div>
      ) : (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm bg-blue-900/20 border border-blue-800/40 text-blue-300">
          <p className="font-semibold text-white mb-1">How to fill in your bracket</p>
          <ul className="space-y-0.5 text-gray-300">
            <li>• Enter a score for each match — the winning team <span className="text-white font-medium">automatically advances</span> to the next round.</li>
            <li>• Predict a <span className="text-white font-medium">draw</span>? An <span className="text-white font-medium">"ET/Pens:"</span> picker appears below the score — tap who goes through.</li>
            <li>• Teams cascade forward as you fill in each round.</li>
            <li>• Scoring: <span className="text-green-400 font-medium">+10</span> for the right team advancing.</li>
          </ul>
        </div>
      )}

      <KnockoutBracketWithScores
        knockout={knockout}
        scorePicks={scorePicks}
        knockoutPicks={knockoutPicks}
        matchResults={matchResults}
        locked={!knockoutEditable}
        onSaveScore={handleSaveScore}
        onClearScore={handleClearScore}
        onPickAdvancement={handlePickAdvancement}
        resolvedTeams={resolvedTeams}
      />
    </div>
  )
}
