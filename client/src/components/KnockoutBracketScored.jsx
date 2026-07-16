import { useState, useEffect, useRef } from 'react'
import { getFlag } from '../utils/flags'

// ── Layout constants ─────────────────────────────────────────────────────────
export const SLOT_H = 96
export const CARD_H = 88
export const COL_W  = 172
export const CONN_W = 28
export const TOTAL_H = 16 * SLOT_H  // 1536px

export const BRACKET_ORDER = [
  ['m74','m77','m73','m75','m83','m84','m81','m82','m76','m78','m79','m80','m86','m88','m85','m87'],
  ['m89','m90','m93','m94','m91','m92','m95','m96'],
  ['m97','m98','m99','m100'],
  ['m101','m102'],
  ['m104'],
]

export const ROUND_LABELS = {
  R32: 'Round of 32', R16: 'Round of 16',
  QF: 'Quarter-finals', SF: 'Semi-finals', Third: '3rd Place', Final: 'Final',
}

export function bCardTop(roundIdx, matchIdx) {
  const step = SLOT_H * Math.pow(2, roundIdx)
  return (step - SLOT_H) / 2 + matchIdx * step
}

export function shortName(name) {
  if (!name) return ''
  const words = name.trim().split(/\s+/)
  if (words.length === 1 || name.length <= 10) return name
  return words[0][0].toUpperCase() + '. ' + words[words.length - 1]
}

export function ptsLabel(pts) {
  if (pts === 10) return { text: '+10', cls: 'text-green-400' }
  if (pts === 6)  return { text: '+6',  cls: 'text-yellow-400' }
  if (pts === 4)  return { text: '+4',  cls: 'text-orange-400' }
  if (pts === 0)  return { text: '✗',   cls: 'text-red-400' }
  return null
}

// ── Single knockout match card ────────────────────────────────────────────────
export function KoCard({ match, scorePick, result, locked, onSaveScore, onClearScore, homeTeam, awayTeam, predictedHomeTeam, predictedAwayTeam, advancePick, onPickAdvancement, matchupOk = true }) {
  const awayRef = useRef(null)

  const [homeVal, setHomeVal] = useState(scorePick?.home_goals ?? '')
  const [awayVal, setAwayVal] = useState(scorePick?.away_goals ?? '')
  const [dirty,   setDirty]   = useState(false)
  const [flash,   setFlash]   = useState(false)

  const homeValRef = useRef(String(scorePick?.home_goals ?? ''))
  const awayValRef = useRef(String(scorePick?.away_goals ?? ''))

  useEffect(() => {
    const hv = String(scorePick?.home_goals ?? '')
    const av = String(scorePick?.away_goals ?? '')
    setHomeVal(hv)
    setAwayVal(av)
    homeValRef.current = hv
    awayValRef.current = av
    setDirty(false)
  }, [scorePick?.home_goals, scorePick?.away_goals])

  const resultExists = result?.home_goals != null

  // A team is eliminated in THIS card only if this specific match has a decided result
  // and the predicted team was one of the actual teams that played and they lost.
  // Using a global "eliminated" set caused earlier-round losers to show strikethrough
  // in all subsequent cards where they were predicted — we only want it at the loss point.
  const actualWinner = result?.winner || null
  const homeIsActualTeam = !!homeTeam && (homeTeam === result?.home_team || homeTeam === result?.away_team)
  const awayIsActualTeam = !!awayTeam && (awayTeam === result?.home_team || awayTeam === result?.away_team)
  const homeEliminated = !!actualWinner && homeIsActualTeam && homeTeam !== actualWinner
  const awayEliminated = !!actualWinner && awayIsActualTeam && awayTeam !== actualWinner

  function calcPts() {
    if (!resultExists || homeVal === '' || awayVal === '') return null
    if (!matchupOk) return 0   // R16+ wrong/unverifiable matchup → 0 pts
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
    onSaveScore?.(match.id, hg, ag)
    setDirty(false)
    setFlash(true)
    setTimeout(() => setFlash(false), 800)
  }

  function handleChange(side, val) {
    if (locked) return
    const clean = val.replace(/[^0-9]/g, '').slice(0, 2)
    if (side === 'home') {
      setHomeVal(clean)
      homeValRef.current = clean
      if (clean.length >= 1) {
        if (awayValRef.current !== '') {
          const hg = parseInt(clean), ag = parseInt(awayValRef.current)
          if (!isNaN(hg) && !isNaN(ag)) doSave(hg, ag)
          else setDirty(true)
        } else {
          setDirty(true)
        }
        awayRef.current?.focus()
        awayRef.current?.select()
      } else {
        setDirty(true)
      }
    } else {
      setAwayVal(clean)
      awayValRef.current = clean
      if (clean.length >= 1 && homeValRef.current !== '') {
        const hg = parseInt(homeValRef.current), ag = parseInt(clean)
        if (!isNaN(hg) && !isNaN(ag)) doSave(hg, ag)
      } else {
        setDirty(true)
      }
    }
  }

  function handleBlur() {
    if (locked) return
    const hv = homeValRef.current
    const av = awayValRef.current
    if (hv === '' && av === '' && scorePick?.home_goals != null) {
      onClearScore?.(match.id)
      return
    }
    if (!dirty || hv === '' || av === '') return
    const hg = parseInt(hv), ag = parseInt(av)
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
      ? 'bg-gray-800 border-gray-700 text-gray-300 cursor-not-allowed'
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
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <span className={`truncate ${homeEliminated ? 'line-through text-red-400/60' : 'text-gray-200'}`} style={{ fontSize: 10, lineHeight: '13px' }}>{shortName(homeTeam)}</span>
                {predictedHomeTeam && predictedHomeTeam !== homeTeam && (
                  <span className="truncate text-gray-500" style={{ fontSize: 7, lineHeight: '9px' }}>pred: {shortName(predictedHomeTeam)}</span>
                )}
              </div>
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
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <span className={`truncate ${awayEliminated ? 'line-through text-red-400/60' : 'text-gray-200'}`} style={{ fontSize: 10, lineHeight: '13px' }}>{shortName(awayTeam)}</span>
                {predictedAwayTeam && predictedAwayTeam !== awayTeam && (
                  <span className="truncate text-gray-500" style={{ fontSize: 7, lineHeight: '9px' }}>pred: {shortName(predictedAwayTeam)}</span>
                )}
              </div>
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

      {/* Footer: advance pick (always shown) + result score / ET-Pens picker */}
      <div className="flex items-center px-1.5 flex-1 min-h-0 gap-1 overflow-hidden">
        {(resultExists || actualWinner) ? (
          // Match decided — show advance pick with correctness color + score if available
          <div className="flex items-center justify-between w-full gap-1 min-w-0">
            {advancePick ? (
              <span
                className={`font-medium truncate ${
                  actualWinner === advancePick ? 'text-green-400' : 'text-red-400/70 line-through'
                }`}
                style={{ fontSize: 9 }}
              >
                →{shortName(advancePick)}
              </span>
            ) : (
              <span className="text-gray-500" style={{ fontSize: 9 }}>—</span>
            )}
            {resultExists && (
              <span className="text-gray-400 tabular-nums shrink-0" style={{ fontSize: 9 }}>
                {result.home_goals}–{result.away_goals}
              </span>
            )}
          </div>
        ) : isDraw && !isUnknown && !locked ? (
          // Score implies draw, editable — ET/Pens picker to set advance pick
          <div className="flex items-center gap-0.5 w-full overflow-hidden">
            <span className="text-gray-500 flex-shrink-0" style={{ fontSize: 8 }}>→</span>
            {[homeTeam, awayTeam].map(t => (
              <button
                key={t}
                onClick={() => onPickAdvancement?.(match.id, t)}
                className={`flex-1 rounded truncate transition-colors min-w-0 cursor-pointer ${
                  advancePick === t
                    ? 'bg-fifa-gold text-gray-950 font-bold'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                style={{ fontSize: 8, lineHeight: '16px', padding: '0 2px' }}
              >
                {shortName(t)}
              </button>
            ))}
          </div>
        ) : advancePick ? (
          // Advance pick set, match not decided yet — show it in gold
          <span className="text-fifa-gold font-medium truncate" style={{ fontSize: 9 }}>
            →{shortName(advancePick)}
          </span>
        ) : clearWinner ? (
          // Score implies a winner, no explicit bracket advance pick
          <span className="text-fifa-gold font-medium truncate" style={{ fontSize: 9 }}>
            → {shortName(clearWinner)}
          </span>
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
export function KnockoutBracketWithScores({ knockout, scorePicks, knockoutPicks, matchResults, locked, onSaveScore, onClearScore, onPickAdvancement, resolvedTeams }) {
  const matchById = {}
  for (const m of knockout) matchById[m.id] = m

  const thirdPlaceMatch = matchById['m103']
  const roundKeys = ['R32', 'R16', 'QF', 'SF', 'Final']
  const totalWidth = BRACKET_ORDER.length * COL_W + (BRACKET_ORDER.length - 1) * CONN_W

  const finalCardTop = bCardTop(4, 0)

  return (
    <div className="overflow-x-auto pb-2 -mx-4 px-4">
      {/* Round label headers */}
      <div className="flex mb-3 flex-shrink-0" style={{ width: totalWidth }}>
        {roundKeys.map((key, i) => {
          const isFinal = key === 'Final'
          const isSF    = key === 'SF'
          return (
            <div key={key} className="flex-shrink-0 flex justify-center"
              style={{ width: COL_W + (i < roundKeys.length - 1 ? CONN_W : 0) }}>
              <span className={`inline-block text-center font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border truncate ${
                isFinal
                  ? 'text-[11px] text-gray-950 bg-fifa-gold border-yellow-400 shadow-[0_0_8px_rgba(201,162,39,0.5)]'
                  : isSF
                  ? 'text-[10px] text-white border-gray-500 bg-gray-700'
                  : 'text-[10px] text-gray-300 border-gray-700 bg-gray-800/70'
              }`}>
                {isFinal ? '🏆 ' : ''}{ROUND_LABELS[key]}
              </span>
            </div>
          )
        })}
      </div>

      <div className="relative flex-shrink-0 flex" style={{ height: TOTAL_H, width: totalWidth }}>
        {BRACKET_ORDER.map((roundIds, roundIdx) => (
          <div key={roundIdx} className="flex flex-shrink-0">
            <div className="relative flex-shrink-0" style={{ width: COL_W, height: TOTAL_H }}>
              {roundIds.map((id, matchIdx) => {
                const m = matchById[id]
                if (!m) return null
                const top     = bCardTop(roundIdx, matchIdx)
                const teams   = resolvedTeams[id] || {}   // bracket prediction — used for matchupOk
                const mr      = matchResults[id]
                // Display actual teams once a match has been played; bracket picks for upcoming.
                const displayT = (mr?.home_team && mr?.away_team)
                  ? { home: mr.home_team, away: mr.away_team }
                  : teams
                const isFinal = roundIdx === BRACKET_ORDER.length - 1

                // Matchup gate: R32/Third always OK; R16+ requires predicted == actual teams.
                // Always computed from bracket-predicted teams (resolvedTeams), not displayT.
                const isR32orThird = m.round === 'R32' || m.round === 'Third'
                let matchupOk = true
                if (!isR32orThird) {
                  const actual = mr
                  if (!actual?.home_team || !actual?.away_team || !teams.home || !teams.away) {
                    matchupOk = false
                  } else {
                    matchupOk = (
                      (teams.home === actual.home_team && teams.away === actual.away_team) ||
                      (teams.home === actual.away_team && teams.away === actual.home_team)
                    )
                  }
                }

                return (
                  <div key={id} className="absolute" style={{ top, left: 0, width: COL_W, height: CARD_H }}>
                    <div className={isFinal ? 'rounded-lg p-[2px] bg-gradient-to-b from-yellow-400 to-yellow-600 shadow-[0_0_12px_rgba(201,162,39,0.6)]' : 'h-full'}>
                      <KoCard
                        match={m}
                        scorePick={scorePicks[id]}
                        result={mr}
                        locked={locked}
                        onSaveScore={onSaveScore}
                        onClearScore={onClearScore}
                        homeTeam={displayT.home || null}
                        awayTeam={displayT.away || null}
                        predictedHomeTeam={teams.home || null}
                        predictedAwayTeam={teams.away || null}
                        advancePick={knockoutPicks[id]}
                        onPickAdvancement={onPickAdvancement}
                        matchupOk={matchupOk}
                      />
                    </div>
                  </div>
                )
              })}

              {/* 3rd Place match + Final label — Final column only */}
              {roundIdx === BRACKET_ORDER.length - 1 && thirdPlaceMatch && (() => {
                const thirdTop  = finalCardTop - CARD_H - 56
                const thirdPredicted = resolvedTeams['m103'] || {}
                const thirdMr = matchResults['m103']
                const thirdDisplay = (thirdMr?.home_team && thirdMr?.away_team)
                  ? { home: thirdMr.home_team, away: thirdMr.away_team }
                  : thirdPredicted
                return (
                  <>
                    <div className="absolute flex items-center gap-1 justify-center"
                      style={{ top: thirdTop - 18, left: 0, width: COL_W }}>
                      <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">🥉 3rd Place</span>
                    </div>
                    <div className="absolute" style={{ top: thirdTop, left: 0, width: COL_W, height: CARD_H }}>
                      <div className="rounded-lg p-[2px] bg-gradient-to-b from-amber-600 to-amber-800 h-full" style={{ boxShadow: '0 0 8px rgba(180,120,0,0.4)' }}>
                        <KoCard
                          match={thirdPlaceMatch}
                          scorePick={scorePicks['m103']}
                          result={thirdMr}
                          locked={locked}
                          onSaveScore={onSaveScore}
                          onClearScore={onClearScore}
                          homeTeam={thirdDisplay.home || null}
                          awayTeam={thirdDisplay.away || null}
                          predictedHomeTeam={thirdPredicted.home || null}
                          predictedAwayTeam={thirdPredicted.away || null}
                          advancePick={knockoutPicks['m103']}
                          onPickAdvancement={onPickAdvancement}
                        />
                      </div>
                    </div>
                    <div className="absolute flex items-center gap-2 justify-center"
                      style={{ top: thirdTop + CARD_H + 8, left: 0, width: COL_W }}>
                      <div className="h-px bg-gray-700/60 flex-1" />
                      <span className="text-[9px] font-black text-fifa-gold uppercase tracking-widest flex-shrink-0">Final</span>
                      <div className="h-px bg-gray-700/60 flex-1" />
                    </div>
                  </>
                )
              })()}

              {/* Trophy below the Final card */}
              {roundIdx === BRACKET_ORDER.length - 1 && (
                <div className="absolute flex flex-col items-center gap-0.5"
                  style={{ top: finalCardTop + CARD_H + 10, left: 0, width: COL_W }}>
                  <span style={{ fontSize: 28 }}>🏆</span>
                  <span className="text-[9px] font-black text-fifa-gold uppercase tracking-widest">World Cup Champion</span>
                </div>
              )}
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
