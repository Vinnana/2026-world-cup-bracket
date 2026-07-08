import { Router } from 'express'
import db from '../database.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { ALL_MATCHES } from '../matches.js'
import { scoreMatch, computeAllScores } from '../scoring.js'
import { computeKnockoutScores, buildKnockoutActuals } from '../knockoutScoring.js'
import { MATCH_DATES } from '../schedule.js'

const router = Router()

// Merge static group-stage schedule with dynamic knockout dates stored by the ESPN fetcher.
// Falls back to match_scores.played_at for knockout matches ESPN has populated but whose
// kickoff date hasn't been persisted to the match_dates setting yet.
function buildMatchDates() {
  const dates = { ...MATCH_DATES }
  try {
    const stored = JSON.parse(db.getSetting('match_dates') || '{}')
    Object.assign(dates, stored)
  } catch {}
  for (const s of db.getAllMatchScores()) {
    if (!dates[s.match_id] && s.played_at) dates[s.match_id] = s.played_at
  }
  return dates
}

// Group-stage match ids (m1–m72) — used to keep group and knockout scoring separate.
const GROUP_IDS = new Set(ALL_MATCHES.filter(m => m.round === 'Group').map(m => m.id))

// ── Win-probability Monte Carlo ──────────────────────────────────────────────
// Poisson RNG via Knuth's algorithm — matches FIFA WC scoring distribution
// (historical WC mean ≈ 1.33 goals/team/game; we use 1.35 for the expanded format)
const _GOAL_LAMBDA = 1.35
const _SIM_N       = 5000   // standard error ≤ ±0.7 pp at p = 0.5

function _rngPoisson(lambda) {
  const L = Math.exp(-lambda)
  let k = 0, p = 1.0
  do { k++; p *= Math.random() } while (p > L)
  return k - 1
}

// Cache: recompute when completed match scores or known knockout teams change.
// Key = sorted "matchId:h-a:winner:home_team" strings.
let _winPctCache = null  // { hash: string, winPcts: Object }

function _scoresHash(allScores) {
  return allScores
    .filter(s => (s.home_goals != null && s.away_goals != null) || s.winner || s.home_team)
    .map(s => `${s.match_id}:${s.home_goals ?? '?'}-${s.away_goals ?? '?'}:${s.winner || ''}:${s.home_team || ''}`)
    .sort()
    .join('|')
}

/**
 * Monte Carlo estimate of each non-admin user's probability (0-100) of
 * finishing 1st overall (group + knockout combined score).
 *
 * For each simulated universe:
 *  - Group matches: Poisson(1.35) scoreline -> 10/6/4/0 pts
 *  - Knockout R32: same scoreline bonus + +10 advance if bracket pick == simulated winner
 *  - Knockout R16+: +10 advance if bracket pick == simulated winner (scoreline skipped
 *    because matchup-correct check is too complex to simulate inline)
 *  - Bracket chain: simulated R32 winners feed into R16 matchups, etc.
 *  - Draws in knockout: coin-flip (penalty shootout)
 *  - Eliminated teams: actual knockout winners seeded from wc_match_results + goal
 *    derivation so that picks on eliminated teams correctly score 0 in all future rounds
 *
 * @param {Array}  allPicks        all score picks (group + knockout)
 * @param {Array}  allScores       db.getAllMatchScores()
 * @param {Array}  players         non-admin users
 * @param {Object} computedScores  { [uid]: { total } } -- full group+knockout totals
 * @param {Object} bracketPicks    { [uid]: { [matchId]: teamName } } -- advancement picks
 * @param {Array}  knockoutResults db.getKnockoutResults() -- for penalty-shootout winners
 */
function computeWinPcts(allPicks, allScores, players, computedScores, bracketPicks = {}, knockoutResults = []) {
  // Load group results once — used for both cache hashing and R32 slot resolution.
  const groupRows = db.getGroupResults()
  const groupHash = groupRows.map(r => `${r.match_id}:${r.home_team || ''}:${r.away_team || ''}`).sort().join('|')

  // Cache key includes knockout winners so invalidation fires when a KO result is recorded
  const koWinnerStr = knockoutResults.filter(r => r.winner).map(r => `${r.match_id}:${r.winner}`).sort().join('|')
  // Include KO score picks count so cache busts when picks change (score picks now feed advance inference)
  const koPicksHash = allPicks.filter(p => !GROUP_IDS.has(p.match_id)).length
  const hash = _scoresHash(allScores) + '||KO:' + koWinnerStr + '||GR:' + groupHash + '||KP:' + koPicksHash
  if (_winPctCache?.hash === hash) return _winPctCache.winPcts

  const uids = players.map(u => u.id)
  if (uids.length === 0) return {}

  // Build group results map for R32 slot resolution when ESPN hasn't yet stored actual teams.
  // '1A' → group A first place; '2B' → group B second; '3RD:*' → too complex, left null.
  const _groupResultsForSim = {}
  for (const row of groupRows) {
    if (row.match_id.startsWith('group_result_')) {
      const g = row.match_id.replace('group_result_', '')
      _groupResultsForSim[g] = { first: row.home_team || null, second: row.away_team || null }
    }
  }
  function resolveR32Slot(slot) {
    if (!slot || typeof slot !== 'string' || slot.startsWith('3RD:')) return null
    const gr = _groupResultsForSim[slot[1]]
    if (!gr) return null
    return slot[0] === '1' ? gr.first : slot[0] === '2' ? gr.second : null
  }

  // Score pick lookup: pickLookup[uid][matchId]
  const pickLookup = {}
  for (const p of allPicks) {
    if (!pickLookup[p.user_id]) pickLookup[p.user_id] = {}
    pickLookup[p.user_id][p.match_id] = { home_goals: p.home_goals, away_goals: p.away_goals }
  }

  // Explicit knockout winners from wc_match_results (covers penalty shootouts)
  const winnerFromResults = {}
  for (const r of knockoutResults) {
    if (r.winner) winnerFromResults[r.match_id] = r.winner
  }

  // Known knockout team/winner data.
  // Winner precedence: wc_match_results > goal-derived (decisive scoreline) > null.
  // This ensures simWinners is properly seeded for completed matches so that
  // eliminated teams score 0 advance pts in all future rounds.
  const knownTeams = {}
  for (const s of allScores) {
    if (s.home_team || s.away_team || s.winner) {
      let winner = winnerFromResults[s.match_id] || s.winner || null
      if (!winner && s.home_goals != null && s.away_goals != null && s.home_team && s.away_team) {
        if (s.home_goals > s.away_goals)      winner = s.home_team
        else if (s.away_goals > s.home_goals) winner = s.away_team
      }
      knownTeams[s.match_id] = {
        home_team: s.home_team || null,
        away_team: s.away_team || null,
        winner,
      }
    }
  }

  // "Finished" = scoreline recorded OR winner recorded (includes penalty-draw matches)
  const finished = new Set([
    ...allScores
      .filter(s => (s.home_goals != null && s.away_goals != null) || s.winner)
      .map(s => s.match_id),
    ...knockoutResults.filter(r => r.winner).map(r => r.match_id),
  ])
  const pending = ALL_MATCHES.filter(m => !finished.has(m.id))

  // No matches remaining -> deterministic
  if (pending.length === 0) {
    const peak = Math.max(0, ...uids.map(uid => computedScores[uid]?.total || 0))
    const topUids = uids.filter(uid => (computedScores[uid]?.total || 0) === peak)
    const share = +(100 / topUids.length).toFixed(1)
    const winPcts = Object.fromEntries(uids.map(uid => [uid, topUids.includes(uid) ? share : 0]))
    _winPctCache = { hash, winPcts }
    return winPcts
  }

  const wins = Object.fromEntries(uids.map(uid => [uid, 0]))

  for (let sim = 0; sim < _SIM_N; sim++) {
    // Start from each player's current combined total
    const totals = {}
    for (const uid of uids) totals[uid] = computedScores[uid]?.total || 0

    // Track simulated winners so later rounds can resolve teams
    const simWinners = {}
    for (const [mid, info] of Object.entries(knownTeams)) {
      if (info.winner) simWinners[mid] = info.winner
    }

    for (const match of pending) {
      const isKnockout = match.round !== 'Group'

      // Resolve actual team names (R16+ depends on simulated R32 winners)
      let homeTeam = knownTeams[match.id]?.home_team || null
      let awayTeam = knownTeams[match.id]?.away_team || null
      if (!homeTeam && isKnockout && typeof match.home === 'object' && match.home?.win) {
        homeTeam = simWinners[match.home.win] || null
      }
      if (!awayTeam && isKnockout && typeof match.away === 'object' && match.away?.win) {
        awayTeam = simWinners[match.away.win] || null
      }
      // R32 fallback: resolve '1A'/'2B' slots from group results when ESPN hasn't stored teams yet
      if (!homeTeam && match.round === 'R32' && typeof match.home === 'string') {
        homeTeam = resolveR32Slot(match.home)
      }
      if (!awayTeam && match.round === 'R32' && typeof match.away === 'string') {
        awayTeam = resolveR32Slot(match.away)
      }

      const rh = _rngPoisson(_GOAL_LAMBDA)
      const ra = _rngPoisson(_GOAL_LAMBDA)

      // Simulated winner (knockout draws -> coin-flip penalty)
      let simWinner = null
      if (homeTeam && awayTeam) {
        if (rh > ra)          simWinner = homeTeam
        else if (ra > rh)     simWinner = awayTeam
        else if (isKnockout)  simWinner = Math.random() < 0.5 ? homeTeam : awayTeam
      }
      if (simWinner) simWinners[match.id] = simWinner

      for (const uid of uids) {
        // Scoreline bonus: group always; R32 always; R16+ skip (matchup-correct)
        if (!isKnockout || match.round === 'R32') {
          const pick = pickLookup[uid]?.[match.id]
          if (pick?.home_goals != null) {
            totals[uid] += scoreMatch(pick, { home_goals: rh, away_goals: ra })
          }
        }

        // Advancement bonus: +10 if bracket pick == simulated winner.
        // Fall back to score pick for implied advancement when no explicit bracket pick exists:
        // a non-draw score pick implies the player thinks the leading side advances.
        if (isKnockout && simWinner) {
          let bp = bracketPicks[uid]?.[match.id]
          if (!bp && homeTeam && awayTeam) {
            const sp = pickLookup[uid]?.[match.id]
            if (sp?.home_goals != null && sp?.away_goals != null && sp.home_goals !== sp.away_goals) {
              bp = sp.home_goals > sp.away_goals ? homeTeam : awayTeam
            }
          }
          if (bp && bp === simWinner) totals[uid] += 10
        }
      }
    }

    const peak = Math.max(...uids.map(uid => totals[uid]))
    const topUids = uids.filter(uid => totals[uid] === peak)
    const share = 1.0 / topUids.length
    for (const uid of topUids) wins[uid] += share
  }

  const winPcts = Object.fromEntries(
    uids.map(uid => [uid, +((wins[uid] / _SIM_N) * 100).toFixed(1)])
  )
  _winPctCache = { hash, winPcts }
  return winPcts
}


function isPicksLocked() {
  if (db.getSetting('picks_locked') === 'true') return true
  const lockTime = db.getSetting('picks_lock_time')
  if (lockTime && Date.now() >= new Date(lockTime).getTime()) return true
  return false
}

function isKnockoutOpen() {
  return db.getSetting('knockout_picks_open') === 'true'
}

// Separate lock for knockout picks (mirrors the group-stage lock). Knockout picks
// are editable only while the phase is open AND not yet locked.
function isKnockoutLocked() {
  if (db.getSetting('knockout_picks_locked') === 'true') return true
  const lockTime = db.getSetting('knockout_picks_lock_time')
  if (lockTime && Date.now() >= new Date(lockTime).getTime()) return true
  return false
}
function knockoutEditable() {
  return isKnockoutOpen() && !isKnockoutLocked()
}

// Assemble the knockout scoring inputs shared by the leaderboard/all endpoints.
// Returns { [user_id]: { total, breakdown } } from the new knockout engine.
function knockoutTotalsByUser(users, allPicks) {
  const actuals = buildKnockoutActuals(db.getAllMatchScores(), db.getKnockoutResults())
  const bracketsByUser = {}
  for (const u of users) {
    const row = db.getBracketByUserId(u.id)
    if (!row) continue
    try { bracketsByUser[u.id] = JSON.parse(row.picks) } catch { /* skip malformed */ }
  }
  const scorePicksByUser = {}
  for (const p of allPicks) {
    if (GROUP_IDS.has(p.match_id)) continue   // knockout score picks only
    ;(scorePicksByUser[p.user_id] ||= {})[p.match_id] = { home_goals: p.home_goals, away_goals: p.away_goals }
  }
  return computeKnockoutScores(bracketsByUser, scorePicksByUser, actuals)
}

// ── GET /api/picks/my ────────────────────────────────────────────────────────
// Current user's picks, annotated with pts where results are available
router.get('/my', requireAuth, (req, res) => {
  const picks = db.getScorePicksByUser(req.user.id)
  const results = db.getAllMatchScores()

  const resultMap = {}
  for (const r of results) resultMap[r.match_id] = r

  const annotated = picks.map(p => ({
    ...p,
    pts: scoreMatch(p, resultMap[p.match_id]),
  }))

  res.json({
    picks: annotated,
    locked: isPicksLocked(),
    knockout_open: isKnockoutOpen(),
    knockout_locked: isKnockoutLocked(),
  })
})

// ── DELETE /api/picks/my ─────────────────────────────────────────────────────
// Clear all picks for the current user (only while picks are open)
router.delete('/my', requireAuth, (req, res) => {
  if (isPicksLocked()) return res.status(403).json({ error: 'Picks are locked' })
  const before = db.getScorePicksByUser(req.user.id).length
  db.deletePicksByUser(req.user.id)
  res.json({ success: true, cleared: before })
})

// ── DELETE /api/picks/my/:match_id ───────────────────────────────────────────
// Delete a single score pick (group lock or knockout lock gates it)
router.delete('/my/:match_id', requireAuth, (req, res) => {
  const match_id = req.params.match_id
  const matchNo = parseInt(match_id.replace('m', ''))
  const isKnockout = matchNo >= 73
  if (isKnockout) {
    if (!isKnockoutOpen())   return res.status(403).json({ error: 'Knockout picks are not open' })
    if (isKnockoutLocked())  return res.status(403).json({ error: 'Knockout picks are locked' })
  } else {
    if (isPicksLocked()) return res.status(403).json({ error: 'Picks are locked' })
  }
  db.deleteScorePick(req.user.id, match_id)
  res.json({ success: true })
})

// ── POST /api/picks ──────────────────────────────────────────────────────────
// Batch upsert score picks. Body: { picks: [{ match_id, home_goals, away_goals }] }
// Group and knockout picks are gated independently: group picks follow the group
// lock, knockout picks follow the (separate) knockout open + lock state. This lets
// knockout picks be saved even though the group stage is already locked.
router.post('/', requireAuth, (req, res) => {
  const groupLocked   = isPicksLocked()
  const koEditable    = knockoutEditable()

  const { picks } = req.body
  if (!Array.isArray(picks)) return res.status(400).json({ error: 'picks must be an array' })

  let saved = 0
  for (const pick of picks) {
    const { match_id, home_goals, away_goals } = pick
    if (!match_id) continue

    const hg = parseInt(home_goals)
    const ag = parseInt(away_goals)
    if (isNaN(hg) || isNaN(ag) || hg < 0 || ag < 0 || hg > 30 || ag > 30) continue

    const match = ALL_MATCHES.find(m => m.id === match_id)
    if (!match) continue

    if (match.round === 'Group') {
      if (groupLocked) continue          // group picks frozen
    } else {
      if (!koEditable) continue          // knockout closed or locked
    }

    db.upsertScorePick(req.user.id, match_id, hg, ag)
    saved++
  }

  res.json({ success: true, saved })
})

// ── GET /api/picks/matches ───────────────────────────────────────────────────
// All matches (with any admin-set team overrides for knockout) + results map
router.get('/matches', optionalAuth, (req, res) => {
  const allScores = db.getAllMatchScores()
  const resultMap = {}
  const teamOverrides = {}

  for (const s of allScores) {
    resultMap[s.match_id] = {
      home_goals: s.home_goals,
      away_goals: s.away_goals,
    }
    if (s.home_team || s.away_team) {
      teamOverrides[s.match_id] = {
        home: s.home_team,
        away: s.away_team,
      }
    }
  }

  res.json({
    matches: ALL_MATCHES,
    results: resultMap,
    team_overrides: teamOverrides,   // actual knockout home/away teams once known
    locked: isPicksLocked(),
    knockout_open: isKnockoutOpen(),
    knockout_locked: isKnockoutLocked(),
    match_dates: buildMatchDates(),
  })
})

// ── GET /api/picks/leaderboard ───────────────────────────────────────────────
router.get('/leaderboard', optionalAuth, (req, res) => {
  const allPicks = db.getAllScorePicks()
  const allScores = db.getAllMatchScores()
  const users = db.getAllUsers()
  const players = users.filter(u => !u.is_admin)

  // Group-stage scoring is computed over GROUP picks only, so knockout score
  // picks never leak into the group total (and the group standings are identical
  // to before Phase 2). Knockout points come from the dedicated engine.
  const groupPicks = allPicks.filter(p => GROUP_IDS.has(p.match_id))
  const groupScores = computeAllScores(groupPicks, allScores)
  const koScores = knockoutTotalsByUser(players, allPicks)

  // Build bracket advancement picks for win% simulation (who each player predicted to advance)
  const bracketPicksForSim = {}
  for (const u of players) {
    const row = db.getBracketByUserId(u.id)
    if (!row) continue
    try {
      const p = JSON.parse(row.picks)
      if (p?.knockout) bracketPicksForSim[u.id] = p.knockout
    } catch {}
  }

  // Win% simulation uses full combined totals + all picks + bracket advancement picks
  const combinedScores = {}
  for (const u of players) {
    combinedScores[u.id] = { total: (groupScores[u.id]?.total || 0) + (koScores[u.id]?.total || 0) }
  }
  const knockoutResults = db.getKnockoutResults()
  const winPcts = computeWinPcts(allPicks, allScores, players, combinedScores, bracketPicksForSim, knockoutResults)

  const leaderboard = players
    .map(u => {
      const group_total = groupScores[u.id]?.total || 0
      const knockout_total = koScores[u.id]?.total || 0
      return {
        user_id: u.id,
        username: u.username,
        group_total,
        knockout_total,
        total: group_total + knockout_total,   // cumulative (Overall view)
        has_picks: allPicks.some(p => p.user_id === u.id),
        picks_count: allPicks.filter(p => p.user_id === u.id).length,
        win_pct: winPcts[u.id] ?? 0,
      }
    })
    .sort((a, b) => b.total - a.total || b.win_pct - a.win_pct || a.username.localeCompare(b.username))

  const results_count = allScores.filter(s => s.home_goals != null).length

  // ── Rank-change tracking ────────────────────────────────────────────────────
  // Snapshot the ranking each time a new result lands so the client can show how
  // positions shifted because of the most recent game. `prev_ranks` holds the
  // standings from before the latest result; we roll it forward only when
  // results_count changes, so it stays stable between games and across refreshes.
  const currentRanks = {}
  leaderboard.filter(e => e.has_picks).forEach((e, i) => { currentRanks[e.user_id] = i + 1 })

  let snap = null
  try { snap = JSON.parse(db.getSetting('rank_snapshot') || 'null') } catch {}
  if (!snap || snap.count !== results_count) {
    snap = {
      count: results_count,
      ranks: currentRanks,
      prev_ranks: snap?.ranks || null,
      prev_count: snap?.count ?? null,
    }
    db.setSetting('rank_snapshot', JSON.stringify(snap))
  }

  // Expose each player's rank from before the latest game (null until we have a
  // prior snapshot to compare against — i.e. no arrows for the very first game).
  for (const e of leaderboard) {
    e.prev_rank = snap.prev_ranks ? (snap.prev_ranks[e.user_id] ?? null) : null
  }

  res.json({
    leaderboard,
    locked: isPicksLocked(),
    knockout_open: isKnockoutOpen(),
    knockout_locked: isKnockoutLocked(),
    results_count,
  })
})

// ── GET /api/picks/all ───────────────────────────────────────────────────────
// All users' picks (hidden until locked, unless admin)
router.get('/all', optionalAuth, (req, res) => {
  const locked = isPicksLocked()
  const isAdmin = !!req.user?.is_admin

  if (!locked && !isAdmin) {
    const submittedCount = new Set(db.getAllScorePicks().map(p => p.user_id)).size
    return res.json({ hidden: true, submitted_count: submittedCount })
  }

  const allPicks = db.getAllScorePicks()
  const allScores = db.getAllMatchScores()
  const users = db.getAllUsers()
  const players = users.filter(u => !u.is_admin)   // admins don't participate

  // Group breakdown over group picks only (unchanged group display); knockout via engine.
  const groupPicks = allPicks.filter(p => GROUP_IDS.has(p.match_id))
  const groupScores = computeAllScores(groupPicks, allScores)
  const koScores = knockoutTotalsByUser(players, allPicks)

  const resultMap = {}
  for (const s of allScores) resultMap[s.match_id] = s

  // Enrich KO match results with winner from wc_match_results (penalty draws have winner there)
  const knockoutWinners = db.getKnockoutResults()
  for (const r of knockoutWinners) {
    if (r.winner) {
      if (resultMap[r.match_id]) {
        resultMap[r.match_id] = { ...resultMap[r.match_id], winner: r.winner }
      } else {
        resultMap[r.match_id] = { home_team: r.home_team ?? null, away_team: r.away_team ?? null, home_goals: null, away_goals: null, winner: r.winner }
      }
    }
  }

  // Bracket advancement picks: user_id → { [match_id]: teamName }
  const bracketPicksMap = {}
  for (const u of players) {
    const b = db.getBracketByUserId(u.id)
    if (b) {
      try {
        const parsed = typeof b.picks === 'string' ? JSON.parse(b.picks) : b.picks
        if (parsed?.knockout) bracketPicksMap[u.id] = parsed.knockout
      } catch {}
    }
  }

  const byUser = players
    .map(u => {
      const userPicks = allPicks.filter(p => p.user_id === u.id)
      const pickMap = {}
      for (const p of userPicks) {
        pickMap[p.match_id] = { home_goals: p.home_goals, away_goals: p.away_goals }
      }
      const group_total = groupScores[u.id]?.total || 0
      const knockout_total = koScores[u.id]?.total || 0
      return {
        user_id: u.id,
        username: u.username,
        picks: pickMap,
        bracket_picks: bracketPicksMap[u.id] || {},  // { [match_id]: teamName } for knockout
        group_total,
        knockout_total,
        total: group_total + knockout_total,
        breakdown: groupScores[u.id]?.breakdown || {},           // group per-match points
        knockout_breakdown: koScores[u.id]?.breakdown || {},     // { mId: { advance, score, total } }
      }
    })
    .sort((a, b) => b.total - a.total)

  res.json({
    users: byUser,
    locked,
    matches: ALL_MATCHES,
    results: resultMap,
    knockout_open: isKnockoutOpen(),
    knockout_locked: isKnockoutLocked(),
    match_dates: buildMatchDates(),
  })
})

export default router
