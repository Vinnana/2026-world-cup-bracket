import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
// Local fallback (dev / no disk configured)
const BUNDLED_PATH = path.join(__dirname, 'bracket.json')
// On Render: set DB_PATH=/data/bracket.json and attach a Persistent Disk at /data
const DB_PATH = process.env.DB_PATH || BUNDLED_PATH

function defaults() {
  return {
    users: [],
    brackets: [],
    match_results: [],
    score_picks: [],   // { id, user_id, match_id, home_goals, away_goals, created_at, updated_at }
    match_scores: [],  // { id, match_id, home_team?, away_team?, home_goals, away_goals, played_at, updated_at }
    settings: {
      brackets_locked: 'false',
      lock_time: '',
      tournament_started: 'false',
      picks_locked: 'false',
      picks_lock_time: '',
      knockout_picks_open: 'false',
    },
    _seq: { users: 0, brackets: 0, match_results: 0, score_picks: 0, match_scores: 0 },
  }
}

function load() {
  // Ensure parent directory exists (important when DB_PATH points to a mounted disk)
  const dir = path.dirname(DB_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  if (!existsSync(DB_PATH)) {
    // First boot on a fresh persistent disk — seed from the bundled bracket.json
    // so existing users / settings are preserved without a full redeploy.
    if (DB_PATH !== BUNDLED_PATH && existsSync(BUNDLED_PATH)) {
      try {
        const seed = readFileSync(BUNDLED_PATH, 'utf8')
        writeFileSync(DB_PATH, seed)
        console.log(`[db] Seeded ${DB_PATH} from bundled bracket.json`)
        return JSON.parse(seed)
      } catch (e) {
        console.warn('[db] Seed failed, starting fresh:', e.message)
      }
    }
    return defaults()
  }

  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf8'))
  } catch (e) {
    console.warn('[db] Could not parse DB file, starting fresh:', e.message)
    return defaults()
  }
}

function save(data) {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}

// Minimal synchronous DB API that mirrors the sqlite call patterns used in routes

class DB {
  constructor() { this._data = load() }

  _save() { save(this._data) }

  // ---------- users ----------
  getUserByUsername(username) {
    return this._data.users.find(u => u.username === username) || null
  }
  getUserById(id) {
    return this._data.users.find(u => u.id === id) || null
  }
  getAllUsers() {
    return [...this._data.users].sort((a, b) => a.username.localeCompare(b.username))
  }
  createUser({ username, password_hash }) {
    this._data._seq.users += 1
    const user = {
      id: this._data._seq.users,
      username,
      password_hash,
      is_admin: 0,
      created_at: new Date().toISOString(),
    }
    this._data.users.push(user)
    this._save()
    return user
  }
  deleteUser(id) {
    this._data.users = this._data.users.filter(u => u.id !== id)
    // Also wipe their picks so no orphaned data remains
    if (this._data.score_picks) {
      this._data.score_picks = this._data.score_picks.filter(p => p.user_id !== id)
    }
    this._save()
  }
  promoteUser(id) {
    const u = this._data.users.find(u => u.id === id)
    if (u) { u.is_admin = 1; this._save() }
  }
  setPassword(id, password_hash) {
    const u = this._data.users.find(u => u.id === id)
    if (!u) return false
    u.password_hash = password_hash
    u.reset_requested = false // clear any pending request
    this._save()
    return true
  }
  requestReset(username) {
    const u = this._data.users.find(u => u.username === username)
    if (!u) return false
    u.reset_requested = true
    u.reset_requested_at = new Date().toISOString()
    this._save()
    return true
  }

  // ---------- brackets ----------
  getBracketByUserId(user_id) {
    return this._data.brackets.find(b => b.user_id === user_id) || null
  }
  upsertBracket(user_id, picks) {
    const existing = this._data.brackets.find(b => b.user_id === user_id)
    if (existing) {
      existing.picks = picks
      existing.updated_at = new Date().toISOString()
    } else {
      this._data._seq.brackets += 1
      this._data.brackets.push({
        id: this._data._seq.brackets,
        user_id,
        picks,
        score: 0,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
    this._save()
  }
  updateBracketScore(user_id, score) {
    const b = this._data.brackets.find(b => b.user_id === user_id)
    if (b) { b.score = score; this._save() }
  }

  // ---------- score picks (score-prediction system) ----------
  upsertScorePick(user_id, match_id, home_goals, away_goals) {
    if (!this._data.score_picks) this._data.score_picks = []
    const existing = this._data.score_picks.find(
      p => p.user_id === user_id && p.match_id === match_id
    )
    const now = new Date().toISOString()
    if (existing) {
      existing.home_goals = home_goals
      existing.away_goals = away_goals
      existing.updated_at = now
    } else {
      if (!this._data._seq.score_picks) this._data._seq.score_picks = 0
      this._data._seq.score_picks += 1
      this._data.score_picks.push({
        id: this._data._seq.score_picks,
        user_id, match_id, home_goals, away_goals,
        created_at: now, updated_at: now,
      })
    }
    this._save()
  }

  getScorePicksByUser(user_id) {
    return (this._data.score_picks || []).filter(p => p.user_id === user_id)
  }

  getAllScorePicks() {
    return this._data.score_picks || []
  }

  deletePicksByUser(user_id) {
    if (!this._data.score_picks) return
    this._data.score_picks = this._data.score_picks.filter(p => p.user_id !== user_id)
    this._save()
  }

  // ---------- match scores (admin-entered actual results for scoring system) ----------
  upsertMatchScore(match_id, { home_team, away_team, home_goals, away_goals }) {
    if (!this._data.match_scores) this._data.match_scores = []
    const existing = this._data.match_scores.find(s => s.match_id === match_id)
    const now = new Date().toISOString()
    if (existing) {
      if (home_team   !== undefined) existing.home_team   = home_team
      if (away_team   !== undefined) existing.away_team   = away_team
      if (home_goals  !== undefined) existing.home_goals  = home_goals
      if (away_goals  !== undefined) existing.away_goals  = away_goals
      existing.updated_at = now
    } else {
      if (!this._data._seq.match_scores) this._data._seq.match_scores = 0
      this._data._seq.match_scores += 1
      this._data.match_scores.push({
        id: this._data._seq.match_scores,
        match_id,
        home_team: home_team || null,
        away_team: away_team || null,
        home_goals: home_goals ?? null,
        away_goals: away_goals ?? null,
        played_at: now, updated_at: now,
      })
    }
    this._save()
  }

  getMatchScore(match_id) {
    return (this._data.match_scores || []).find(s => s.match_id === match_id) || null
  }

  getAllMatchScores() {
    return this._data.match_scores || []
  }

  deleteMatchScore(match_id) {
    if (!this._data.match_scores) return
    this._data.match_scores = this._data.match_scores.filter(s => s.match_id !== match_id)
    this._save()
  }

  // ---------- match results ----------
  getMatchResult(match_id) {
    return this._data.match_results.find(r => r.match_id === match_id) || null
  }
  getAllMatchResults() {
    return this._data.match_results
  }
  getGroupResults() {
    return this._data.match_results.filter(r => r.round === 'Group')
  }
  getKnockoutResults() {
    return this._data.match_results.filter(r => r.round !== 'Group')
  }
  upsertMatchResult({ match_id, home_team, away_team, winner, round, third_advanced }) {
    const existing = this._data.match_results.find(r => r.match_id === match_id)
    const now = new Date().toISOString()
    if (existing) {
      Object.assign(existing, { home_team, away_team, winner, round, third_advanced: !!third_advanced, updated_at: now })
    } else {
      this._data._seq.match_results += 1
      this._data.match_results.push({
        id: this._data._seq.match_results,
        match_id, home_team, away_team, winner, round,
        third_advanced: !!third_advanced,
        played_at: now, updated_at: now,
      })
    }
    this._save()
  }
  deleteMatchResult(match_id) {
    this._data.match_results = this._data.match_results.filter(r => r.match_id !== match_id)
    this._save()
  }

  // ---------- settings ----------
  getSetting(key) {
    return this._data.settings[key] ?? null
  }
  setSetting(key, value) {
    this._data.settings[key] = String(value)
    this._save()
  }
  getAllSettings() {
    return { ...this._data.settings }
  }
}

export default DB
