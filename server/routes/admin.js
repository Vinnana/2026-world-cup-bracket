import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db from '../database.js'
import { requireAdmin } from '../middleware/auth.js'
import { GROUPS } from '../teams.js'
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

export default router
