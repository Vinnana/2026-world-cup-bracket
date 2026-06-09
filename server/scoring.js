/**
 * Score prediction scoring rules (10 / 6 / 4 system):
 *
 *   10 pts — exact score (e.g. predict 3-1, result is 3-1)
 *    6 pts — correct winner/draw AND same goal difference
 *              (e.g. predict 2-0, result is 3-1  →  both US wins by 2)
 *    4 pts — correct winner/draw only
 *    0 pts — wrong outcome
 *   null   — match not yet played (no result)
 */

/**
 * @param {{ home_goals: number, away_goals: number }} pick
 * @param {{ home_goals: number|null, away_goals: number|null }|null} result
 * @returns {number|null}
 */
export function scoreMatch(pick, result) {
  if (!result || result.home_goals == null || result.away_goals == null) {
    return null
  }

  const ph = Number(pick.home_goals)
  const pa = Number(pick.away_goals)
  const rh = Number(result.home_goals)
  const ra = Number(result.away_goals)

  if (isNaN(ph) || isNaN(pa)) return null

  // Exact score
  if (ph === rh && pa === ra) return 10

  // Determine match outcome
  const outcome = (h, a) => (h > a ? 'home' : a > h ? 'away' : 'draw')
  if (outcome(ph, pa) !== outcome(rh, ra)) return 0

  // Correct goal difference (same outcome guaranteed above)
  if (ph - pa === rh - ra) return 6

  // Correct outcome only
  return 4
}

/**
 * Compute total scores for every user.
 *
 * @param {Array}  allPicks   — from db.getAllScorePicks()
 * @param {Array}  allResults — from db.getAllMatchScores()
 * @returns {{ [user_id: number]: { total: number, breakdown: { [match_id]: number } } }}
 */
export function computeAllScores(allPicks, allResults) {
  const resultMap = {}
  for (const r of allResults) resultMap[r.match_id] = r

  const scores = {}
  for (const pick of allPicks) {
    const result = resultMap[pick.match_id]
    const pts = scoreMatch(pick, result)
    if (pts != null && pts > 0) {
      if (!scores[pick.user_id]) scores[pick.user_id] = { total: 0, breakdown: {} }
      scores[pick.user_id].total += pts
      scores[pick.user_id].breakdown[pick.match_id] = pts
    }
  }

  return scores
}
