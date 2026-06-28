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

// Cache: only recompute when the set of completed match scores changes.
// Key = sorted "matchId:h-a" strings joined — changes the moment any new
// result is recorded (or an existing one is corrected).
let _winPctCache = null  // { hash: string, winPcts: Object }

function _scoresHash(allScores) {
  return allScores
    .filter(s => s.home_goals != null && s.away_goals != null)
    .map(s => `${s.match_id}:${s.home_goals}-${s.away_goals}`)
    .sort()
    .join('|')
}

/**
 * Monte Carlo estimate of each non-admin user's probability (0–100) of
 * finishing in 1st place overall.
 *
 * Result is cached by a hash of the completed match scores and returned
 * immediately on every subsequent call until a score actually changes.
 * The simulation only reruns when new results are recorded.
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
  // Return cached result if scores haven't changed
  const hash = _scoresHash(allScores)
  if (_winPctCache?.hash === hash) return _winPctCache.winPcts

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
    const winPcts = Object.fromEntries(uids.map(uid => [uid, topUids.includes(uid) ? share : 0]))
    _winPctCache = { hash, winPcts }
    return winPcts
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

  // Win % stays a group-stage projection (shown only in the Group view client-side).
  const winPcts = computeWinPcts(groupPicks, allScores, players, groupScores)

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
