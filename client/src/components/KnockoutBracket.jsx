// Knockout bracket — renders every round from the official KNOCKOUT structure.
// Teams cascade from the user's group picks (R32) and their own winner picks (later rounds).

const ROUND_LABELS = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-Finals',
  SF: 'Semi-Finals',
  Final: 'Final',
}
const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'Final']

// Resolve one side of a match to a display name + whether it's a pickable real team.
function resolveSide(side, groupPicks, knockoutPicks, matchById) {
  if (typeof side === 'string') {
    if (side.startsWith('3RD:')) {
      const groups = side.slice(4).split('').join('/')
      return { name: `3rd: ${groups}`, pickable: false }
    }
    // Group-position slot like '1A' (winner) or '2B' (runner-up)
    const pos = side[0]
    const group = side[1]
    const gp = groupPicks?.[group]
    const name = gp ? (pos === '1' ? gp.first : gp.second) : null
    if (name) return { name, pickable: true }
    return { name: `${pos === '1' ? 'Winner' : 'Runner-up'} ${group}`, pickable: false }
  }
  if (side && side.win) {
    const name = knockoutPicks[side.win]
    if (name) return { name, pickable: true }
    const no = matchById[side.win]?.no
    return { name: `Winner #${no ?? ''}`, pickable: false }
  }
  return { name: '—', pickable: false }
}

function TeamRow({ name, pickable, picked, isActualWinner, isWrong, onPick, readOnly }) {
  const isPicked = picked && name === picked
  if (!pickable) {
    return <div className="text-xs text-gray-500 py-1.5 px-2 truncate">{name}</div>
  }
  return (
    <button
      onClick={() => !readOnly && onPick && onPick(name)}
      disabled={readOnly}
      className={`w-full text-left text-xs px-2 py-1.5 rounded transition-all font-medium truncate
        ${isPicked && isActualWinner ? 'bg-green-700 text-white' : ''}
        ${isPicked && isWrong ? 'bg-red-800 text-white line-through' : ''}
        ${isPicked && !isActualWinner && !isWrong ? 'bg-fifa-gold text-gray-950' : ''}
        ${!isPicked && isActualWinner ? 'bg-green-900/40 text-green-400' : ''}
        ${!isPicked && !isActualWinner ? 'text-gray-300 hover:bg-gray-700' : ''}
        ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      {name}{isActualWinner ? ' ✓' : ''}
    </button>
  )
}

function MatchCard({ match, home, away, picked, actual, onPick, readOnly }) {
  const actualWinner = actual?.winner
  const isWrong = actualWinner && picked && actualWinner !== picked
  const isRight = actualWinner && picked && actualWinner === picked

  return (
    <div className={`bg-gray-800 border rounded-lg p-1.5 mb-1.5 min-w-[150px]
      ${isRight ? 'border-green-700' : isWrong ? 'border-red-800' : 'border-gray-700'}`}>
      <div className="text-[10px] text-gray-500 mb-1 px-1">Match {match.no}</div>
      <TeamRow
        name={home.name} pickable={home.pickable} picked={picked}
        isActualWinner={actualWinner === home.name} isWrong={isWrong && picked === home.name}
        onPick={(n) => onPick(match.id, n)} readOnly={readOnly}
      />
      <div className="text-[10px] text-center text-gray-600 my-0.5">vs</div>
      <TeamRow
        name={away.name} pickable={away.pickable} picked={picked}
        isActualWinner={actualWinner === away.name} isWrong={isWrong && picked === away.name}
        onPick={(n) => onPick(match.id, n)} readOnly={readOnly}
      />
    </div>
  )
}

export default function KnockoutBracket({ knockout, groupPicks, knockoutPicks, onKnockoutPick, results, readOnly, actualTeams = {} }) {
  if (!knockout || knockout.length === 0) {
    return <div className="text-gray-500 text-sm">Loading bracket…</div>
  }

  const matchById = Object.fromEntries(knockout.map(m => [m.id, m]))
  const ko = results?.knockout || {}
  const byRound = ROUND_ORDER.map(r => ({ round: r, matches: knockout.filter(m => m.round === r) }))

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {byRound.map(({ round, matches }) => (
          <div key={round} className="flex flex-col">
            <div className="text-center text-xs font-bold text-fifa-gold mb-2 uppercase tracking-wider">
              {ROUND_LABELS[round]}
            </div>
            <div className="flex flex-col justify-around flex-1 gap-1">
              {matches.map(match => {
                // Once the real matchup is known (group stage done for R32, or a
                // feeder finished for later rounds), show the actual teams so the
                // pick is made against reality. Otherwise fall back to the cascade
                // from the user's own picks (predict-ahead).
                const at = actualTeams[match.id]
                const home = at?.home ? { name: at.home, pickable: true }
                                      : resolveSide(match.home, groupPicks, knockoutPicks, matchById)
                const away = at?.away ? { name: at.away, pickable: true }
                                      : resolveSide(match.away, groupPicks, knockoutPicks, matchById)
                return (
                  <MatchCard
                    key={match.id}
                    match={match}
                    home={home}
                    away={away}
                    picked={knockoutPicks[match.id]}
                    actual={ko[match.id]}
                    onPick={onKnockoutPick}
                    readOnly={readOnly}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
