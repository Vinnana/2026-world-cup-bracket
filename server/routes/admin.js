import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db from '../database.js'
import { requireAdmin } from '../middleware/auth.js'
import { GROUPS } from '../teams.js'
import { ALL_MATCHES } from '../matches.js'
import { scoreMatch } from '../scoring.js'
import { runResultsSync, isConfigured, activeProvider } from '../resultsFetcher.js'

const router = Router()

router.get('/settings', requireAdmin, (req, res) => {
  res.json({ ...db.getAllSettings(), api_configured: isConfigured(), results_provider: activeProvider() })
})

// Toggle scheduled auto-fetching of results.
router.post('/auto-fetch', requireAdmin, (req, res) => {
  db.setSetting('auto_fetch', req.body.enabled ? 'true' : 'false')
  res.json({ success: true, enabled: !!req.body.enabled })
})

// Run a results sync immediately (also used by the scheduler).
router.post('/fetch-now', requireAdmin, async (req, res) => {
  try {
    const summary = await runResultsSync(db)
    db.setSetting('last_fetch_at', summary.at)
    db.setSetting('last_fetch_status', JSON.stringify(summary))
    res.json({ success: true, summary })
  } catch (err) {
    db.setSetting('last_fetch_status', JSON.stringify({ error: err.message, at: new Date().toISOString() }))
    res.status(502).json({ error: err.message })
  }
})

router.post('/lock', requireAdmin, (req, res) => {
  const { locked, lock_time } = req.body
  db.setSetting('brackets_locked', locked ? 'true' : 'false')
  if (lock_time !== undefined) db.setSetting('lock_time', lock_time)
  res.json({ success: true, locked, lock_time })
})

router.post('/group-result', requireAdmin, (req, res) => {
  const { group, first, second, third, third_advanced } = req.body
  if (!group || !GROUPS[group]) return res.status(400).json({ error: 'Invalid group' })

  // Enforce the format rule: at most 8 third-place teams may advance.
  if (third_advanced) {
    const alreadyAdvanced = db.getGroupResults().filter(
      r => r.third_advanced && r.match_id !== `group_result_${group}`
    ).length
    if (alreadyAdvanced >= 8) {
      return res.status(400).json({ error: '8 third-place teams are already marked as advanced (max allowed).' })
    }
  }

  db.upsertMatchResult({
    match_id: `group_result_${group}`,
    home_team: first || null,
    away_team: second || null,
    winner: third || null,
    round: 'Group',
    third_advanced: !!third_advanced,
  })
  res.json({ success: true })
})

router.post('/knockout-result', requireAdmin, (req, res) => {
  const { match_id, home_team, away_team, winner, round } = req.body
  if (!match_id || !winner || !round) {
    return res.status(400).json({ error: 'match_id, winner, round required' })
  }
  db.upsertMatchResult({ match_id, home_team: home_team || null, away_team: away_team || null, winner, round })
  res.json({ success: true })
})

router.delete('/result/:match_id', requireAdmin, (req, res) => {
  db.deleteMatchResult(req.params.match_id)
  res.json({ success: true })
})

router.post('/promote', requireAdmin, (req, res) => {
  db.promoteUser(Number(req.body.user_id))
  res.json({ success: true })
})

router.get('/users', requireAdmin, (req, res) => {
  res.json(db.getAllUsers().map(u => ({
    id: u.id, username: u.username, is_admin: u.is_admin, created_at: u.created_at,
    reset_requested: !!u.reset_requested, reset_requested_at: u.reset_requested_at || null,
  })))
})

// Admin sets a new password for any user (the forgot-password backstop).
router.post('/set-password', requireAdmin, async (req, res) => {
  const { user_id, new_password } = req.body
  if (!user_id || !new_password) return res.status(400).json({ error: 'user_id and new_password required' })
  if (String(new_password).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' })
  const ok = db.setPassword(Number(user_id), await bcrypt.hash(new_password, 10))
  if (!ok) return res.status(404).json({ error: 'User not found' })
  res.json({ success: true })
})

// ── Score-prediction system admin endpoints ─────────────────────────────────

// Enter or update a match score (home_goals + away_goals determine the winner).
// Optional: home_team / away_team override for knockout matches where slots aren't resolved yet.
router.post('/match-score', requireAdmin, (req, res) => {
  const { match_id, home_team, away_team, home_goals, away_goals } = req.body
  if (!match_id) return res.status(400).json({ error: 'match_id required' })

  const hg = home_goals != null ? parseInt(home_goals) : null
  const ag = away_goals != null ? parseInt(away_goals) : null

  if (hg !== null && (isNaN(hg) || hg < 0)) return res.status(400).json({ error: 'Invalid home_goals' })
  if (ag !== null && (isNaN(ag) || ag < 0)) return res.status(400).json({ error: 'Invalid away_goals' })

  db.upsertMatchScore(match_id, {
    home_team: home_team || undefined,
    away_team: away_team || undefined,
    home_goals: hg,
    away_goals: ag,
  })
  res.json({ success: true })
})

// Delete a match score
router.delete('/match-score/:match_id', requireAdmin, (req, res) => {
  db.deleteMatchScore(req.params.match_id)
  res.json({ success: true })
})

// Get all match scores
router.get('/match-scores', requireAdmin, (req, res) => {
  res.json(db.getAllMatchScores())
})

// Lock / unlock score picks (separate from bracket lock)
router.post('/picks-lock', requireAdmin, (req, res) => {
  const { locked, lock_time } = req.body
  db.setSetting('picks_locked', locked ? 'true' : 'false')
  if (lock_time !== undefined) db.setSetting('picks_lock_time', lock_time || '')
  res.json({ success: true, locked })
})

// Open / close the knockout picks phase (Phase 2)
router.post('/knockout-open', requireAdmin, (req, res) => {
  const { open } = req.body
  db.setSetting('knockout_picks_open', open ? 'true' : 'false')
  res.json({ success: true, open })
})

// ── Comprehensive picks report (admin only) ───────────────────────────────────
router.get('/report', requireAdmin, (req, res) => {
  const allPicks  = db.getAllScorePicks()
  const allScores = db.getAllMatchScores()
  const users     = db.getAllUsers()

  // Build fast lookup maps
  const pickMap  = {}  // { match_id: { user_id: { home_goals, away_goals } } }
  for (const p of allPicks) {
    if (!pickMap[p.match_id]) pickMap[p.match_id] = {}
    pickMap[p.match_id][p.user_id] = { home_goals: p.home_goals, away_goals: p.away_goals }
  }
  const scoreMap = {}
  for (const s of allScores) scoreMap[s.match_id] = s

  // Build per-match report rows
  const matches = ALL_MATCHES.map(m => {
    const result = scoreMap[m.id] || null
    const userPicks = {}
    for (const u of users) {
      const pick = pickMap[m.id]?.[u.id]
      if (!pick) { userPicks[u.id] = null; continue }
      const pts = result ? scoreMatch(pick, result) : null
      userPicks[u.id] = { home_goals: pick.home_goals, away_goals: pick.away_goals, pts }
    }
    return {
      id: m.id, no: m.no, round: m.round, group: m.group || null,
      home: typeof m.home === 'string' ? m.home : (result?.home_team || 'TBD'),
      away: typeof m.away === 'string' ? m.away : (result?.away_team || 'TBD'),
      result: result && result.home_goals != null
        ? { home_goals: result.home_goals, away_goals: result.away_goals }
        : null,
      picks: userPicks,
    }
  })

  // Totals per user
  const totals = {}
  for (const u of users) {
    totals[u.id] = matches.reduce((sum, m) => {
      const p = m.picks[u.id]
      return sum + (p?.pts != null ? p.pts : 0)
    }, 0)
  }

  // Return users sorted by total descending (= leaderboard order)
  const sortedUsers = [...users]
    .sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0))
    .map(u => ({ id: u.id, username: u.username }))

  res.json({ users: sortedUsers, matches, totals, generated_at: new Date().toISOString() })
})

export default router
