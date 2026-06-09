// Group stage picks — user ranks 1st, 2nd, 3rd in each group (4th is implied)
export default function GroupPicks({ groups, picks, onChange, results, readOnly }) {
  const groupLetters = Object.keys(groups).sort()

  function handlePick(group, position, team) {
    const current = picks[group] || {}
    // Clear team from other positions if already picked there
    const updated = { ...current }
    for (const pos of ['first', 'second', 'third']) {
      if (updated[pos] === team) updated[pos] = ''
    }
    updated[position] = team
    onChange({ ...picks, [group]: updated })
  }

  function posColor(position, groupResult, pick) {
    if (!groupResult || !pick) return ''
    const correct = position === 'first' ? groupResult.first
      : position === 'second' ? groupResult.second
      : groupResult.third
    if (!correct) return ''
    return correct === pick ? 'ring-2 ring-green-500 bg-green-900/30' : 'ring-2 ring-red-500 bg-red-900/30'
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {groupLetters.map(group => {
        const teams = groups[group].teams
        const groupPicks = picks[group] || {}
        const groupResult = results?.groups?.[group]

        return (
          <div key={group} className="card">
            <h3 className="font-bold text-fifa-gold mb-3 text-sm uppercase tracking-wider">
              Group {group}
            </h3>

            {['first', 'second', 'third'].map((pos, i) => (
              <div key={pos} className="mb-2">
                <label className="text-xs text-gray-400 mb-1 block">
                  {i === 0 ? '🥇 1st Place' : i === 1 ? '🥈 2nd Place' : '🥉 3rd Place'}
                </label>
                {readOnly ? (
                  <div className={`input text-sm py-1.5 ${posColor(pos, groupResult, groupPicks[pos])}`}>
                    {groupPicks[pos] || <span className="text-gray-500">—</span>}
                    {groupResult && groupPicks[pos] === (pos === 'first' ? groupResult.first : pos === 'second' ? groupResult.second : groupResult.third) && (
                      <span className="ml-2 text-green-400 text-xs">✓</span>
                    )}
                  </div>
                ) : (
                  <select
                    className={`input text-sm py-1.5 ${posColor(pos, groupResult, groupPicks[pos])}`}
                    value={groupPicks[pos] || ''}
                    onChange={e => handlePick(group, pos, e.target.value)}
                  >
                    <option value="">— pick team —</option>
                    {teams.map(team => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}

            {groupResult && (
              <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-400">
                <span className="font-medium text-gray-300">Result: </span>
                {groupResult.first} · {groupResult.second} · {groupResult.third}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
