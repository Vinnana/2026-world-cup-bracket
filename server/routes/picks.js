import { Router } from 'express'
import db from '../database.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { ALL_MATCHES } from '../matches.js'
import { scoreMatch, computeAllScores } from '../scoring.js'

const router = Router()

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
  })
})

// ── GET /api/picks/leaderboard ───────────────────────────────────────────────
router.get('/leaderboard', optionalAuth, (req, res) => {
  const allPicks = db.getAllScorePicks()
  const allScores = db.getAllMatchScores()
  const users = db.getAllUsers()
  const computedScores = computeAllScores(allPicks, allScores)

  const leaderboard = users
    .map(u => ({
      user_id: u.id,
      username: u.username,
      total: computedScores[u.id]?.total || 0,
      has_picks: allPicks.some(p => p.user_id === u.id),
      picks_count: allPicks.filter(p => p.user_id === u.id).length,
    }))
    .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username))

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
  })
})

export default router
