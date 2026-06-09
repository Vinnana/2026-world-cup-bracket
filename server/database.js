import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'bracket.json')

function defaults() {
  return {
    users: [],
    brackets: [],
    match_results: [],
    settings: {
      brackets_locked: 'false',
      lock_time: '',
      tournament_started: 'false',
    },
    _seq: { users: 0, brackets: 0, match_results: 0 },
  }
}

function load() {
  if (!existsSync(DB_PATH)) return defaults()
  try { return JSON.parse(readFileSync(DB_PATH, 'utf8')) } catch { return defaults() }
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

export default new DB()
