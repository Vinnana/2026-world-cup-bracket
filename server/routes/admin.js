import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db from '../database.js'
import { requireAdmin } from '../middleware/auth.js'
import { GROUPS, KNOCKOUT } from '../teams.js'
import { ALL_MATCHES } from '../matches.js'
import { scoreMatch } from '../scoring.js'
import { runResultsSync, isConfigured, activeProvider, addSyncHistory } from '../resultsFetcher.js'

const router = Router()

router.get('/settings', requireAdmin, (req, res) => {
  const settings = db.getAllSettings()
  // Compute the effective lock state (same logic as isPicksLocked in picks.js)
  const manualLocked = settings.picks_locked === 'true'
  const lt = settings.picks_lock_time
  const autoLocked = !!(lt && Date.now() >= new Date(lt).getTime())
  const effective_picks_locked = manualLocked || autoLocked
  // Effective knockout lock (mirrors isKnockoutLocked in picks.js)
  const koManual = settings.knockout_picks_locked === 'true'
  const koLt = settings.knockout_picks_lock_time
  const koAuto = !!(koLt && Date.now() >= new Date(koLt).getTime())
  const effective_knockout_locked = koManual || koAuto
  // Parse sync_history JSON → array so the frontend can iterate directly
  let sync_history = []
  try { sync_history = JSON.parse(settings.sync_history || '[]') } catch {}
  const { sync_history: _raw, ...rest } = settings
  res.json({ ...rest, api_configured: isConfigured(), results_provider: activeProvider(), effective_picks_locked, effective_knockout_locked, sync_history })
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
    addSyncHistory(db, summary)
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

router.delete('/users/:user_id', requireAdmin, (req, res) => {
  const user_id = Number(req.params.user_id)
  const user = db.getUserById(user_id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (user.is_admin) return res.status(400).json({ error: 'Cannot delete an admin account' })
  db.deleteUser(user_id)
  res.json({ success: true, username: user.username })
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
router.post('/match-score', requireAdmin, async (req, res) => {
  const { match_id, home_team, away_team, home_goals, away_goals } = req.body
  if (!match_id) return res.status(400).json({ error: 'match_id required' })

  const hg = home_goals != null ? parseInt(home_goals) : null
  const ag = away_goals != null ? parseInt(away_goals) : null

  if (hg !== null && (isNaN(hg) || hg < 0)) return res.status(400).json({ error: 'Invalid home_goals' })
  if (ag !== null && (isNaN(ag) || ag < 0)) return res.status(400).json({ error: 'Invalid away_goals' })

  try {
    await db.upsertMatchScore(match_id, {
      home_team: home_team || undefined,
      away_team: away_team || undefined,
      home_goals: hg,
      away_goals: ag,
    })
    res.json({ success: true })
  } catch (err) {
    console.error('[admin] match-score save error:', err.message)
    res.status(500).json({ error: `Failed to save score: ${err.message}` })
  }
})

// Delete a match score
router.delete('/match-score/:match_id', requireAdmin, async (req, res) => {
  try {
    await db.deleteMatchScore(req.params.match_id)
    res.json({ success: true })
  } catch (err) {
    console.error('[admin] match-score delete error:', err.message)
    res.status(500).json({ error: `Failed to delete score: ${err.message}` })
  }
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

// Save/clear the auto-lock schedule without changing the locked flag
router.post('/picks-lock-schedule', requireAdmin, (req, res) => {
  const { lock_time } = req.body
  db.setSetting('picks_lock_time', lock_time || '')
  res.json({ success: true, lock_time: lock_time || '' })
})

// Clear all score picks for a specific user (admin use — e.g. mistaken pre-population)
router.delete('/user-picks/:user_id', requireAdmin, (req, res) => {
  const user_id = Number(req.params.user_id)
  if (!user_id) return res.status(400).json({ error: 'Invalid user_id' })
  const user = db.getUserById(user_id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const before = db.getScorePicksByUser(user_id).length
  db.deletePicksByUser(user_id)
  res.json({ success: true, username: user.username, cleared: before })
})

// Open / close the knockout picks phase (Phase 2)
router.post('/knockout-open', requireAdmin, (req, res) => {
  const { open } = req.body
  db.setSetting('knockout_picks_open', open ? 'true' : 'false')
  res.json({ success: true, open })
})

// Lock / unlock knockout picks (separate from the group-stage picks lock)
router.post('/knockout-lock', requireAdmin, (req, res) => {
  const { locked, lock_time } = req.body
  db.setSetting('knockout_picks_locked', locked ? 'true' : 'false')
  if (lock_time !== undefined) db.setSetting('knockout_picks_lock_time', lock_time || '')
  res.json({ success: true, locked })
})

// Save/clear the knockout auto-lock schedule without changing the locked flag
router.post('/knockout-lock-schedule', requireAdmin, (req, res) => {
  const { lock_time } = req.body
  db.setSetting('knockout_picks_lock_time', lock_time || '')
  res.json({ success: true, lock_time: lock_time || '' })
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

// ── Admin participant pick editing ────────────────────────────────────────────

// Get a user's score picks + bracket picks (admin view, bypasses lock)
router.get('/user-picks/:user_id', requireAdmin, (req, res) => {
  try {
    const user_id = Number(req.params.user_id)
    if (!user_id) return res.status(400).json({ error: 'Invalid user_id' })
    const user = db.getUserById(user_id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const scorePicks = db.getScorePicksByUser(user_id) || []
    const bracketRow = db.getBracketByUserId(user_id)
    let bracket = { groups: {}, knockout: {} }
    if (bracketRow?.picks) {
      try { bracket = JSON.parse(bracketRow.picks) } catch {}
    }
    res.json({ username: user.username, scorePicks, bracket })
  } catch (err) {
    console.error('[admin] user-picks GET error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Upsert one score pick for a user (admin, bypasses lock)
router.post('/user-picks/:user_id/score', requireAdmin, (req, res) => {
  const user_id = Number(req.params.user_id)
  if (!user_id) return res.status(400).json({ error: 'Invalid user_id' })
  const user = db.getUserById(user_id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const { match_id, home_goals, away_goals } = req.body
  if (!match_id) return res.status(400).json({ error: 'match_id required' })
  const hg = parseInt(home_goals)
  const ag = parseInt(away_goals)
  if (isNaN(hg) || hg < 0 || isNaN(ag) || ag < 0) return res.status(400).json({ error: 'Invalid goals' })
  db.upsertScorePick(user_id, match_id, hg, ag)
  res.json({ success: true })
})

// Delete one score pick for a user (admin, bypasses lock)
router.delete('/user-picks/:user_id/score/:match_id', requireAdmin, (req, res) => {
  const user_id = Number(req.params.user_id)
  if (!user_id) return res.status(400).json({ error: 'Invalid user_id' })
  const user = db.getUserById(user_id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  db.deleteScorePick(user_id, req.params.match_id)
  res.json({ success: true })
})

// Save a user's full bracket (admin, bypasses lock — merges group + knockout independently)
router.post('/user-bracket/:user_id', requireAdmin, (req, res) => {
  const user_id = Number(req.params.user_id)
  if (!user_id) return res.status(400).json({ error: 'Invalid user_id' })
  const user = db.getUserById(user_id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const { picks } = req.body
  if (!picks) return res.status(400).json({ error: 'picks required' })
  db.upsertBracket(user_id, JSON.stringify(picks))
  res.json({ success: true })
})

// Patch only specific knockout advancement picks without touching anything else
router.patch('/user-bracket/:user_id/knockout', requireAdmin, (req, res) => {
  const user_id = Number(req.params.user_id)
  if (!user_id) return res.status(400).json({ error: 'Invalid user_id' })
  const user = db.getUserById(user_id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const { patches } = req.body // { matchId: teamName, ... }
  if (!patches || typeof patches !== 'object') return res.status(400).json({ error: 'patches object required' })

  const row = db.getBracketByUserId(user_id)
  let existing = { groups: {}, knockout: {} }
  if (row?.picks) { try { existing = JSON.parse(row.picks) } catch {} }

  existing.knockout = { ...existing.knockout, ...patches }
  db.upsertBracket(user_id, JSON.stringify(existing))
  res.json({ success: true, knockout: existing.knockout })
})

// Create a user account on behalf of a participant
router.post('/create-user', requireAdmin, async (req, res) => {
  const { username, password } = req.body
  if (!username?.trim()) return res.status(400).json({ error: 'Username is required' })
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' })

  const trimmed = username.trim()
  if (db.getUserByUsername(trimmed)) return res.status(409).json({ error: 'Username already taken' })

  const password_hash = await bcrypt.hash(String(password), 10)
  const user = db.createUser({ username: trimmed, password_hash })
  res.json({ success: true, user: { id: user.id, username: user.username, is_admin: user.is_admin } })
})

// ── One-time import: pdai's group stage score picks ───────────────────────────
// Picks taken directly from the admin's spreadsheet, re-oriented to match the
// home/away order defined in ALL_MATCHES (24 matches are flipped vs the sheet).
router.post('/import-pdai-group-picks', requireAdmin, (req, res) => {
  const users = db.getAllUsers()
  const pdai  = users.find(u => u.username === 'pdai')
  if (!pdai) return res.status(404).json({ error: 'User pdai not found' })

  // [match_id, home_goals, away_goals] — goals oriented to ALL_MATCHES home/away
  const picks = [
    // Group A
    ['m1',  2, 1], ['m2',  2, 0], ['m3',  1, 1],
    ['m4',  1, 1], // sheet: SA 1–Czechia 1  → Czechia(h)=1, SA(a)=1
    ['m5',  0, 2], // sheet: Mexico 2–Czechia 0 → Czechia(h)=0, Mexico(a)=2
    ['m6',  1, 1],
    // Group B
    ['m7',  1, 1], ['m8',  0, 2], ['m9',  2, 1],
    ['m10', 2, 1], // sheet: Bosnia 1–Swiss 2 → Swiss(h)=2, Bosnia(a)=1
    ['m11', 1, 1], // sheet: Canada 1–Swiss 1 → Swiss(h)=1, Canada(a)=1
    ['m12', 2, 1],
    // Group C
    ['m13', 2, 1], ['m14', 0, 1], ['m15', 2, 0],
    ['m16', 0, 2], // sheet: Morocco 2–Scotland 0 → Scotland(h)=0, Morocco(a)=2
    ['m17', 0, 3], // sheet: Brazil 3–Scotland 0 → Scotland(h)=0, Brazil(a)=3
    ['m18', 2, 0],
    // Group D
    ['m19', 2, 0], ['m20', 1, 1], ['m21', 1, 1],
    ['m22', 2, 1], // sheet: Paraguay 1–Türkiye 2 → Türkiye(h)=2, Paraguay(a)=1
    ['m23', 1, 2], // sheet: USA 2–Türkiye 1 → Türkiye(h)=1, USA(a)=2
    ['m24', 1, 1],
    // Group E
    ['m25', 2, 1], ['m26', 1, 1], ['m27', 2, 1],
    ['m28', 2, 0], // sheet: Curaçao 0–Ecuador 2 → Ecuador(h)=2, Curaçao(a)=0
    ['m29', 1, 1], // sheet: Germany 1–Ecuador 1 → Ecuador(h)=1, Germany(a)=1
    ['m30', 1, 2],
    // Group F
    ['m31', 2, 1], ['m32', 1, 0], ['m33', 2, 1],
    ['m34', 0, 1], // sheet: Japan 1–Tunisia 0 → Tunisia(h)=0, Japan(a)=1
    ['m35', 1, 2], // sheet: Netherlands 2–Tunisia 1 → Tunisia(h)=1, Netherlands(a)=2
    ['m36', 1, 0],
    // Group G
    ['m37', 2, 1], ['m38', 1, 1], ['m39', 1, 1],
    ['m40', 0, 1], // sheet: Egypt 1–NZ 0 → NZ(h)=0, Egypt(a)=1
    ['m41', 0, 2], // sheet: Belgium 2–NZ 0 → NZ(h)=0, Belgium(a)=2
    ['m42', 1, 1],
    // Group H
    ['m43', 3, 0], ['m44', 0, 2], ['m45', 2, 1],
    ['m46', 2, 0], // sheet: Cape Verde 0–Uruguay 2 → Uruguay(h)=2, CV(a)=0
    ['m47', 1, 2], // sheet: Spain 2–Uruguay 1 → Uruguay(h)=1, Spain(a)=2
    ['m48', 0, 2],
    // Group I
    ['m49', 2, 1], ['m50', 0, 2], ['m51', 2, 0],
    ['m52', 2, 1], // sheet: Senegal 1–Norway 2 → Norway(h)=2, Senegal(a)=1
    ['m53', 2, 1], // sheet: France 1–Norway 2 → Norway(h)=2, France(a)=1
    ['m54', 3, 0],
    // Group J
    ['m55', 3, 0], ['m56', 2, 1], ['m57', 2, 1],
    ['m58', 0, 1], // sheet: Algeria 1–Jordan 0 → Jordan(h)=0, Algeria(a)=1
    ['m59', 0, 3], // sheet: Argentina 3–Jordan 0 → Jordan(h)=0, Argentina(a)=3
    ['m60', 0, 2],
    // Group K
    ['m61', 2, 0], ['m62', 0, 2], ['m63', 1, 1],
    ['m64', 2, 1], // sheet: DR Congo 1–Colombia 2 → Colombia(h)=2, DRC(a)=1
    ['m65', 1, 1], // sheet: Portugal 1–Colombia 1 → Colombia(h)=1, Portugal(a)=1
    ['m66', 1, 1],
    // Group L
    ['m67', 2, 0], ['m68', 1, 1], ['m69', 3, 0],
    ['m70', 1, 2], // sheet: Croatia 2–Panama 1 → Panama(h)=1, Croatia(a)=2
    ['m71', 0, 2], // sheet: England 2–Panama 0 → Panama(h)=0, England(a)=2
    ['m72', 2, 1],
  ]

  let upserted = 0
  for (const [match_id, home_goals, away_goals] of picks) {
    db.upsertScorePick(pdai.id, match_id, home_goals, away_goals)
    upserted++
  }

  res.json({ success: true, username: pdai.username, upserted })
})

// ── Generate a bracket for a user from their knockout score picks ────────────
// Processes rounds in order (R32 → R16 → QF → SF → Third → Final).
// For each match the winner is derived from the user's score pick; ties default
// to the home team (match would be decided by penalties).
router.post('/generate-bracket-from-scores', requireAdmin, (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const users = db.getAllUsers()
  const user = users.find(u => String(u.id) === String(userId))
  if (!user) return res.status(404).json({ error: 'User not found' })

  // Score picks keyed by match_id
  const scorePicksList = db.getScorePicksForUser(userId)
  const scorePicks = {}
  for (const sp of scorePicksList) {
    scorePicks[sp.match_id] = { home_goals: sp.home_goals, away_goals: sp.away_goals }
  }

  // Actual team names keyed by match_id (from match_scores)
  const allScores = db.getAllMatchScores()
  const matchData = {}
  for (const s of allScores) {
    matchData[s.match_id] = { home_team: s.home_team, away_team: s.away_team }
  }

  // Build bracket round-by-round; knockout[matchId] = predicted winner
  const knockout = {}

  for (const m of KNOCKOUT) {
    let homeTeam = null, awayTeam = null

    if (m.round === 'R32' || m.round === 'Third') {
      // Teams are fixed/externally determined → use actual match data
      homeTeam = matchData[m.id]?.home_team || null
      awayTeam = matchData[m.id]?.away_team || null
    } else {
      // Teams come from this bracket's own earlier picks
      homeTeam = m.home?.win ? (knockout[m.home.win] || null) : null
      awayTeam = m.away?.win ? (knockout[m.away.win] || null) : null
    }

    if (!homeTeam || !awayTeam) continue  // teams not yet known, skip

    const pick = scorePicks[m.id]
    if (pick == null || pick.home_goals == null || pick.away_goals == null) continue

    // Winner from score; ties → home team (would go to penalties)
    knockout[m.id] = pick.home_goals >= pick.away_goals ? homeTeam : awayTeam
  }

  // Preserve any existing group picks, replace knockout portion
  const existingRow = db.getBracketByUserId(userId)
  let existing = {}
  if (existingRow?.picks) { try { existing = JSON.parse(existingRow.picks) } catch {} }

  const merged = { groups: existing.groups || {}, knockout }
  db.upsertBracket(userId, JSON.stringify(merged))

  res.json({
    success: true,
    username: user.username,
    knockout_picks: Object.keys(knockout).length,
    champion: knockout['m104'] || null,
  })
})

// ── Bracket completion status (who has filled in their knockout bracket) ─────
router.get('/bracket-status', requireAdmin, (req, res) => {
  const users    = db.getAllUsers().filter(u => !u.is_admin)
  const koTotal  = KNOCKOUT.length   // total knockout advancement picks possible

  const result = users.map(u => {
    const row = db.getBracketByUserId(u.id)
    if (!row?.picks) {
      return { id: u.id, username: u.username, has_bracket: false, knockout_picks: 0, has_champion: false, champion: null }
    }
    let bracket = {}
    try { bracket = JSON.parse(row.picks) } catch {}
    const kp = bracket.knockout || {}
    const knockout_picks = Object.keys(kp).length
    const champion = kp['m104'] || null
    return { id: u.id, username: u.username, has_bracket: true, knockout_picks, has_champion: !!champion, champion }
  })

  // Sort: champion picked → partial → nothing; alpha within each tier
  result.sort((a, b) => {
    const tier = x => x.has_champion ? 2 : x.has_bracket ? 1 : 0
    return (tier(b) - tier(a)) || a.username.localeCompare(b.username)
  })

  res.json({ users: result, knockout_total: koTotal })
})

export default router
