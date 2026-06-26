/**
 * Knockout-round scoring (Phase 2).
 *
 * Per knockout match, each participant can earn up to 20 points:
 *   • +10  ADVANCE — they picked the team that actually advances (every round)
 *   • +10/+6/+4  SCORELINE BONUS — exact / right-winner+margin / right-winner,
 *               but ONLY when their predicted matchup is correct.
 *
 * R32: the two teams are known before picking, so the matchup is always
 *      "correct" — the scoreline bonus applies as long as a score pick exists.
 * R16→Final: the matchup is the participant's own bracket prediction (the
 *      winners they sent forward). The scoreline bonus counts only if BOTH
 *      predicted teams match the two teams that actually played.
 *
 * Advancement comes from the participant's bracket (`brackets.picks.knockout`);
 * the scoreline comes from their score picks (`score_picks`). The two are scored
 * independently and summed. Group-stage scoring is untouched and lives elsewhere.
 */

import { KNOCKOUT } from './teams.js'
import { scoreMatch } from './scoring.js'

/**
 * Resolve a participant's PREDICTED team for one side of a knockout match,
 * following `{ win: 'mX' }` references back to their own bracket pick.
 * Group-position slot strings ('1A', '2B', '3RD:ABCDF') only appear in R32,
 * where the matchup isn't gated, so they aren't resolved here.
 */
function resolvePredictedSide(side, knockoutPicks) {
  if (!side || typeof side === 'string') return null
  if (side.win) return knockoutPicks[side.win] || null
  return null
}

/**
 * Score every knockout match for one participant.
 *
 * @param {object} bracket            this user's bracket picks: { knockout: { mId: team }, groups: {...} }
 * @param {object} scorePicksByMatch  this user's knockout score picks: { mId: { home_goals, away_goals } }
 * @param {object} actuals            { mId: { home_team, away_team, home_goals, away_goals, winner } }
 * @returns {{ total: number, breakdown: { [mId]: { advance, score, total } } }}
 */
export function scoreKnockoutForUser(bracket, scorePicksByMatch, actuals) {
  const knockoutPicks = bracket?.knockout || {}
  let total = 0
  const breakdown = {}

  for (const m of KNOCKOUT) {
    const act = actuals[m.id]
    if (!act || !act.winner) continue   // match not decided yet → no points

    // ── Advance points ───────────────────────────────────────────────────────
    const predWinner = knockoutPicks[m.id] || null
    const advancePts = predWinner && predWinner === act.winner ? 10 : 0

    // ── Scoreline bonus (matchup-gated) ──────────────────────────────────────
    let scorePts = 0
    const pick = scorePicksByMatch[m.id]
    const resultKnown = act.home_goals != null && act.away_goals != null
    if (pick && pick.home_goals != null && pick.away_goals != null && resultKnown) {
      if (m.round === 'R32') {
        // Teams known up front → matchup always correct, pick already in actual orientation.
        scorePts = scoreMatch(pick, act) || 0
      } else {
        const predHome = resolvePredictedSide(m.home, knockoutPicks)
        const predAway = resolvePredictedSide(m.away, knockoutPicks)
        if (predHome === act.home_team && predAway === act.away_team) {
          scorePts = scoreMatch(pick, act) || 0
        } else if (predHome === act.away_team && predAway === act.home_team) {
          // Same two teams but opposite orientation → flip the pick to match actual sides.
          scorePts = scoreMatch({ home_goals: pick.away_goals, away_goals: pick.home_goals }, act) || 0
        } else {
          scorePts = 0   // wrong matchup → no scoreline points
        }
      }
    }

    const matchTotal = advancePts + scorePts
    if (matchTotal > 0) {
      total += matchTotal
      breakdown[m.id] = { advance: advancePts, score: scorePts, total: matchTotal }
    }
  }

  return { total, breakdown }
}

/**
 * Compute knockout totals for every participant.
 *
 * @param {object} bracketsByUser     { userId: bracketPicks }
 * @param {object} scorePicksByUser   { userId: { mId: { home_goals, away_goals } } }
 * @param {object} actuals            { mId: { home_team, away_team, home_goals, away_goals, winner } }
 * @returns {{ [userId]: { total, breakdown } }}
 */
export function computeKnockoutScores(bracketsByUser, scorePicksByUser, actuals) {
  const out = {}
  for (const [userId, bracket] of Object.entries(bracketsByUser)) {
    out[userId] = scoreKnockoutForUser(bracket, scorePicksByUser[userId] || {}, actuals)
  }
  return out
}

/**
 * Build the `actuals` map the scorer expects from the app's stored data.
 * Teams + goals come from match_scores; the winner from match_results, falling
 * back to the decisive scoreline when goals settle it without penalties.
 *
 * @param {Array} allMatchScores   db.getAllMatchScores()
 * @param {Array} knockoutResults  db.getKnockoutResults()
 */
export function buildKnockoutActuals(allMatchScores, knockoutResults) {
  const KO_IDS = new Set(KNOCKOUT.map(m => m.id))
  const winnerById = {}
  for (const r of knockoutResults) {
    if (r.winner) winnerById[r.match_id] = r.winner
  }

  const actuals = {}
  for (const s of allMatchScores) {
    if (!KO_IDS.has(s.match_id)) continue
    let winner = winnerById[s.match_id] || null
    if (!winner && s.home_goals != null && s.away_goals != null) {
      if (s.home_goals > s.away_goals) winner = s.home_team
      else if (s.away_goals > s.home_goals) winner = s.away_team
      // a draw with no recorded winner stays undecided (awaiting penalties result)
    }
    actuals[s.match_id] = {
      home_team:  s.home_team ?? null,
      away_team:  s.away_team ?? null,
      home_goals: s.home_goals ?? null,
      away_goals: s.away_goals ?? null,
      winner,
    }
  }

  // Matches that have a recorded winner but no score row yet (rare) still count for advance pts.
  for (const [matchId, winner] of Object.entries(winnerById)) {
    if (!actuals[matchId]) {
      actuals[matchId] = { home_team: null, away_team: null, home_goals: null, away_goals: null, winner }
    }
  }

  return actuals
}
