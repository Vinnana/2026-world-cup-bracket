import { Router } from 'express'
import db from '../database.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { ALL_MATCHES } from '../matches.js'
import { scoreMatch, computeAllScores } from '../scoring.js'
import { MATCH_DATES } from '../schedule.js'

const router = Router()

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

/**
 * Monte Carlo estimate of each non-admin user's probability (0–100) of
 * finishing in 1st place overall.
 *
 * For every remaining match (no result yet) we simulate independent
 * Poisson(1.35) goals for each team, score every player's pick with the
 * standard 10/6/4/0 rules, and tally who ends up on top.  Ties are split
 * equally.  Completed matches already contribute to `computedScores` so
 * only the *future* uncertainty is simulated.
 *
 * @param {Array}  allPicks       db.getAllScorePicks()
 * @param {Array}  allScores      db.getAllMatchScores()
 * @param {Array}  players        non-admin users
 * @param {Object} computedScores scoreMap from computeAllScores()
 * @returns {Object} { userId: winPct }  e.g. { 3: 28.4, 7: 9.0, … }
 */
function computeWinPcts(allPicks, allScores, players, computedScores) {
  const uids = players.map(u => u.id)
  if (uids.length === 0) return {}

  // Nested pick lookup: pickLookup[uid][matchId] = { home_goals, away_goals }
  const pickLookup = {}
  for (const p of allPicks) {
    if (!pickLookup[p.user_id]) pickLookup[p.user_id] = {}
    pickLookup[p.user_id][p.match_id] = { home_goals: p.home_goals, away_goals: p.away_goals }
  }

  // Matches still without a result
  const finished = new Set(
    allScores.filter(s => s.home_goals != null && s.away_goals != null).map(s => s.match_id)
  )
  const pending = ALL_MATCHES.filter(m => !finished.has(m.id))

  // No matches left → deterministic result
  if (pending.length === 0) {
    const peak = Math.max(0, ...uids.map(uid => computedScores[uid]?.total || 0))
    const topUids = uids.filter(uid => (computedScores[uid]?.total || 0) === peak)
    const share = +(100 / topUids.length).toFixed(1)
    return Object.fromEntries(uids.map(uid => [uid, topUids.includes(uid) ? share : 0]))
  }

  const wins = Object.fromEntries(uids.map(uid => [uid, 0]))

  for (let sim = 0; sim < _SIM_N; sim++) {
    // Seed each player's running total from already-scored matches
    const totals = {}
    for (const uid of uids) totals[uid] = computedScores[uid]?.total || 0

    // Simulate each unplayed match
    for (const match of pending) {
      const rh = _rngPoisson(_GOAL_LAMBDA)
      const ra = _rngPoisson(_GOAL_LAMBDA)
      for (const uid of uids) {
        const pick = pickLookup[uid]?.[match.id]
        if (!pick) continue
        const pts = scoreMatch(pick, { home_goals: rh, away_goals: ra })
        if (pts) totals[uid] += pts
      }
    }

    // Credit the winner(s) — ties share the credit equally
    const peak = Math.max(...uids.map(uid => totals[uid]))
    const topUids = uids.filter(uid => totals[uid] === peak)
    const share = 1.0 / topUids.length
    for (const uid of topUids) wins[uid] += share
  }

  return Object.fromEntries(
    uids.map(uid => [uid, +((wins[uid] / _SIM_N) * 100).toFixed(1)])
  )
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

// ── POST /api/picks ──────────────────────────────────────────────────────────
// Batch upsert score picks. Body: { picks: [{ match_id, home_goals, away_goals }] }
router.post('/', requireAuth, (req, res) => {
  if (isPicksLocked()) return res.status(403).json({ error: 'Picks are locked' })

  const { picks } = req.body
  if (!Array.isArray(picks)) return res.status(400).json({ error: 'picks must be an array' })

  let saved = 0
  for (const pick of picks) {
    const { match_id, home_goals, away_goals } = pick
    if (!match_id) continue

    const hg = parseInt(home_goals)
    const ag = parseInt(away_goals)
    if (isNaN(hg) || isNaN(ag) || hg < 0 || ag < 0 || hg > 30 || ag > 30) continue

    // Find the match
    const match = ALL_MATCHES.find(m => m.id === match_id)
    if (!match) continue

    // Knockout picks require phase 2 to be open
    if (match.round !== 'Group' && !isKnockoutOpen()) continue

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
    team_overrides: teamOverrides,
    locked: isPicksLocked(),
    knockout_open: isKnockoutOpen(),
    match_dates: MATCH_DATES,
  })
})

// ── GET /api/picks/leaderboard ───────────────────────────────────────────────
router.get('/leaderboard', optionalAuth, (req, res) => {
  const allPicks = db.getAllScorePicks()
  const allScores = db.getAllMatchScores()
  const users = db.getAllUsers()
  const computedScores = computeAllScores(allPicks, allScores)

  const players = users.filter(u => !u.is_admin)
  const winPcts = computeWinPcts(allPicks, allScores, players, computedScores)

  const leaderboard = players
    .map(u => ({
      user_id: u.id,
      username: u.username,
      total: computedScores[u.id]?.total || 0,
      has_picks: allPicks.some(p => p.user_id === u.id),
      picks_count: allPicks.filter(p => p.user_id === u.id).length,
      win_pct: winPcts[u.id] ?? 0,
    }))
    .sort((a, b) => b.total - a.total || b.win_pct - a.win_pct || a.username.localeCompare(b.username))

  res.json({
    leaderboard,
    locked: isPicksLocked(),
    knockout_open: isKnockoutOpen(),
    results_count: allScores.filter(s => s.home_goals != null).length,
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
  const computedScores = computeAllScores(allPicks, allScores)

  const resultMap = {}
  for (const s of allScores) resultMap[s.match_id] = s

  const byUser = users
    .filter(u => !u.is_admin)   // admins don't participate — exclude from all-picks view
    .map(u => {
      const userPicks = allPicks.filter(p => p.user_id === u.id)
      const pickMap = {}
      for (const p of userPicks) {
        pickMap[p.match_id] = { home_goals: p.home_goals, away_goals: p.away_goals }
      }
      return {
        user_id: u.id,
        username: u.username,
        picks: pickMap,
        total: computedScores[u.id]?.total || 0,
        breakdown: computedScores[u.id]?.breakdown || {},
      }
    })
    .sort((a, b) => b.total - a.total)

  res.json({
    users: byUser,
    locked,
    matches: ALL_MATCHES,
    results: resultMap,
    knockout_open: isKnockoutOpen(),
    match_dates: MATCH_DATES,
  })
})

export default router
