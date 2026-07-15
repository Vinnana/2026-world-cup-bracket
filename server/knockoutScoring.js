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
 * R16→Final (including Third Place): the matchup is the participant's own bracket
 *      prediction. For Third Place the predicted matchup is the two SF losers the
 *      participant sent forward. The scoreline bonus counts only if BOTH predicted
 *      teams match the two teams that actually played.
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
function resolvePredictedSide(side, knockoutPicks, resolvedTeams) {
  if (!side || typeof side === 'string') return null
  if (side.win) return knockoutPicks[side.win] || null
  if (side.lose) {
    const teams  = resolvedTeams?.[side.lose]
    const winner = knockoutPicks[side.lose]
    if (!teams || !winner) return null
    if (teams.home === winner) return teams.away
    if (teams.away === winner) return teams.home
    return null
  }
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
  // Built incrementally as we iterate; needed so {lose: 'mX'} references (Third Place)
  // can resolve to the participant's predicted SF matchup before the SF result is official.
  const resolvedTeams = {}  // mId → { home: predicted, away: predicted }

  for (const m of KNOCKOUT) {
    // Resolve predicted teams for this match and store them so later matches
    // (especially Third Place with {lose} refs) can look them up.
    // Must happen before the early-continue so SF entries are populated even
    // when the SF result isn't in yet.
    const predHome = resolvePredictedSide(m.home, knockoutPicks, resolvedTeams)
    const predAway = resolvePredictedSide(m.away, knockoutPicks, resolvedTeams)
    if (predHome || predAway) {
      resolvedTeams[m.id] = { home: predHome, away: predAway }
    }

    const act = actuals[m.id]
    if (!act || !act.winner) continue   // match not decided yet → no points

    // ── Advance points ───────────────────────────────────────────────────────
    const predWinner = knockoutPicks[m.id] || null
    const advancePts = predWinner && predWinner === act.winner ? 10 : 0

    // ── Scoreline bonus ───────────────────────────────────────────────────────
    // R32: teams come from group stage → matchup always correct.
    // R16 / QF / SF / Final: matchup-gated via predicted parent-match winners.
    // Third Place: score bonus requires (1) advance pick is one of the actual teams
    //   AND (2) predicted SF losers match the actual 3rd-place teams.
    //   If the advance pick is a team not in the match (e.g. Brazil when it's France vs England),
    //   the score bonus is 0 regardless of SF predictions.
    let scorePts = 0
    const pick = scorePicksByMatch[m.id]
    const resultKnown = act.home_goals != null && act.away_goals != null
    if (pick && pick.home_goals != null && pick.away_goals != null && resultKnown) {
      if (m.round === 'R32') {
        scorePts = scoreMatch(pick, act) || 0
      } else if (m.round === 'Third') {
        // Gate 1: advance pick must be in the actual match
        const tp3pick = predWinner
        if (tp3pick && (tp3pick === act.home_team || tp3pick === act.away_team)) {
          // Gate 2: predicted SF losers (predHome/predAway) must match actual teams
          if (predHome === act.home_team && predAway === act.away_team) {
            scorePts = scoreMatch(pick, act) || 0
          } else if (predHome === act.away_team && predAway === act.home_team) {
            scorePts = scoreMatch({ home_goals: pick.away_goals, away_goals: pick.home_goals }, act) || 0
          }
        }
      } else {
        if (predHome === act.home_team && predAway === act.away_team) {
          scorePts = scoreMatch(pick, act) || 0
        } else if (predHome === act.away_team && predAway === act.home_team) {
          // Same two teams, opposite orientation → flip the pick to match actual sides.
          scorePts = scoreMatch({ home_goals: pick.away_goals, away_goals: pick.home_goals }, act) || 0
        }
        // else: wrong matchup → scorePts stays 0
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
  const allUserIds = new Set([
    ...Object.keys(bracketsByUser),
    ...Object.keys(scorePicksByUser),
  ])
  for (const userId of allUserIds) {
    out[userId] = scoreKnockoutForUser(bracketsByUser[userId] || {}, scorePicksByUser[userId] || {}, actuals)
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
