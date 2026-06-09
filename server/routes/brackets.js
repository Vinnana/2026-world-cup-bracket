import { Router } from 'express'
import db from '../database.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { SCORING } from '../teams.js'

const router = Router()

// Brackets are locked when the admin flips the switch OR the scheduled lock
// time has passed. Once locked, picks become visible to everyone.
function isLocked() {
  if (db.getSetting('brackets_locked') === 'true') return true
  const lt = db.getSetting('lock_time')
  if (lt) {
    const t = new Date(lt).getTime()
    if (!Number.isNaN(t) && Date.now() >= t) return true
  }
  return false
}

function buildGroupResultsMap() {
  const groups = {}
  for (const row of db.getGroupResults()) {
    if (row.match_id.startsWith('group_result_')) {
      const g = row.match_id.replace('group_result_', '')
      groups[g] = { first: row.home_team, second: row.away_team, third: row.winner, third_advanced: !!row.third_advanced }
    }
  }
  return groups
}

function buildKnockoutResultsMap() {
  const knockout = {}
  for (const row of db.getKnockoutResults()) {
    knockout[row.match_id] = {
      winner: row.winner,
      home_team: row.home_team,
      away_team: row.away_team,
      round: row.round,
    }
  }
  return knockout
}

function computeScore(picks, groupResults, knockoutResults) {
  let score = 0
  const groups = picks.groups || {}
  const knockout = picks.knockout || {}

  for (const [group, groupPicks] of Object.entries(groups)) {
    const result = groupResults[group]
    if (!result) continue
    if (result.first && result.first === groupPicks.first) score += SCORING.group_first
    if (result.second && result.second === groupPicks.second) score += SCORING.group_second
    // Only the 8 best 3rd-place teams advance — score a correct 3rd-place pick
    // only when the admin has marked that group's 3rd-place team as advanced.
    if (result.third && result.third === groupPicks.third && result.third_advanced) {
      score += SCORING.group_third
    }
  }

  const roundScores = { R32: SCORING.r32, R16: SCORING.r16, QF: SCORING.qf, SF: SCORING.sf }
  for (const [matchId, pickedWinner] of Object.entries(knockout)) {
    const result = knockoutResults[matchId]
    if (!result?.winner || !pickedWinner) continue
    if (result.round === 'Final') {
      // Champion bonus
      if (result.winner === pickedWinner) score += SCORING.final_winner
      // Runner-up bonus: the finalist the user sent to the final but did NOT pick as
      // champion. Their two finalists are the winners they picked in the semis (m101, m102).
      const predictedFinalists = [knockout['m101'], knockout['m102']].filter(Boolean)
      const predictedRunnerUp = predictedFinalists.find(t => t !== pickedWinner)
      const actualRunnerUp = [result.home_team, result.away_team].find(t => t && t !== result.winner)
      if (predictedRunnerUp && actualRunnerUp && predictedRunnerUp === actualRunnerUp) {
        score += SCORING.final_runnerup
      }
    } else {
      if (result.winner === pickedWinner) score += roundScores[result.round] || 0
    }
  }
  return score
}

// GET /api/brackets — all brackets with scores.
// Until brackets lock, players can only see their OWN picks (admins see all).
// Scores, usernames and submission status are always visible.
router.get('/', optionalAuth, (req, res) => {
  const users = db.getAllUsers()
  const groupResults = buildGroupResultsMap()
  const knockoutResults = buildKnockoutResultsMap()
  const locked = isLocked()
  const isAdmin = !!req.user?.is_admin
  const requesterId = req.user?.id

  const brackets = users.map(user => {
    const row = db.getBracketByUserId(user.id)
    const picks = row ? JSON.parse(row.picks) : null
    const score = picks ? computeScore(picks, groupResults, knockoutResults) : 0
    if (row) db.updateBracketScore(user.id, score)
    const canSeePicks = locked || isAdmin || user.id === requesterId
    return {
      user_id: user.id,
      username: user.username,
      picks: canSeePicks ? (picks || {}) : {},
      hidden: !canSeePicks && !!row,
      score,
      submitted: !!row,
    }
  })

  brackets.sort((a, b) => b.score - a.score)
  res.json({
    brackets,
    settings: { locked, lock_time: db.getSetting('lock_time') },
  })
})

// GET /api/brackets/my
router.get('/my', requireAuth, (req, res) => {
  const row = db.getBracketByUserId(req.user.id)
  const picks = row ? JSON.parse(row.picks) : {}
  res.json({
    picks,
    locked: isLocked(),
    lock_time: db.getSetting('lock_time'),
  })
})

// POST /api/brackets
router.post('/', requireAuth, (req, res) => {
  if (isLocked()) {
    return res.status(403).json({ error: 'Brackets are locked' })
  }
  const { picks } = req.body
  if (!picks) return res.status(400).json({ error: 'picks required' })
  db.upsertBracket(req.user.id, JSON.stringify(picks))
  res.json({ success: true })
})

// GET /api/brackets/results
router.get('/results', (req, res) => {
  res.json({ groups: buildGroupResultsMap(), knockout: buildKnockoutResultsMap() })
})

export default router
