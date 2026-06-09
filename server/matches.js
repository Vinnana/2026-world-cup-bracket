/**
 * 2026 FIFA World Cup — all 104 matches.
 * Group stage:  m1–m72  (6 per group × 12 groups A–L)
 * Knockout:    m73–m104 (defined in teams.js)
 *
 * Round-robin within each 4-team group:
 *   Matchday 1: T1 v T2, T3 v T4
 *   Matchday 2: T1 v T3, T2 v T4
 *   Matchday 3: T1 v T4, T2 v T3
 */
import { GROUPS, KNOCKOUT } from './teams.js'

function generateGroupMatches() {
  const letters = Object.keys(GROUPS) // A–L, in insertion order
  const matches = []

  letters.forEach((letter, gi) => {
    const teams = GROUPS[letter].teams
    const base = gi * 6 + 1   // A→1, B→7, C→13 …
    const [t1, t2, t3, t4] = teams

    const pairs = [
      [t1, t2], [t3, t4],
      [t1, t3], [t2, t4],
      [t1, t4], [t2, t3],
    ]

    pairs.forEach(([home, away], mi) => {
      matches.push({
        id: `m${base + mi}`,
        no: base + mi,
        round: 'Group',
        group: letter,
        home,
        away,
      })
    })
  })

  return matches
}

export const GROUP_MATCHES = generateGroupMatches()

/** All 104 matches ordered (group stage first, then knockout) */
export const ALL_MATCHES = [...GROUP_MATCHES, ...KNOCKOUT]

export function getMatchById(id) {
  return ALL_MATCHES.find(m => m.id === id) || null
}

/** Convenience: group matches keyed by group letter */
export function getGroupMatches() {
  const byGroup = {}
  for (const m of GROUP_MATCHES) {
    if (!byGroup[m.group]) byGroup[m.group] = []
    byGroup[m.group].push(m)
  }
  return byGroup
}

export { KNOCKOUT }
