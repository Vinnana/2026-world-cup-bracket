/**
 * PostgreSQL-backed database implementation.
 * Mirrors the same synchronous API as database-json.js:
 *   • On init() — tables are created, all rows loaded into memory
 *   • Read ops  — served from in-memory cache (fast, sync)
 *   • Write ops — update cache immediately, fire async PG write (fire-and-forget)
 *
 * This lets ALL existing routes / resultsFetcher stay unchanged — no `await` needed.
 */

import pkg from 'pg'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pkg
const __dirname    = path.dirname(fileURLToPath(import.meta.url))
const BUNDLED_PATH = path.join(__dirname, 'bracket.json')

// ─── Table DDL ───────────────────────────────────────────────────────────────
const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS wc_users (
    id               INTEGER PRIMARY KEY,
    username         TEXT    UNIQUE NOT NULL,
    password_hash    TEXT    NOT NULL,
    is_admin         INTEGER DEFAULT 0,
    reset_requested  BOOLEAN DEFAULT FALSE,
    reset_requested_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS wc_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS wc_score_picks (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    match_id    TEXT    NOT NULL,
    home_goals  INTEGER NOT NULL,
    away_goals  INTEGER NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, match_id)
  );
  CREATE TABLE IF NOT EXISTS wc_match_scores (
    id          INTEGER PRIMARY KEY,
    match_id    TEXT    UNIQUE NOT NULL,
    home_team   TEXT,
    away_team   TEXT,
    home_goals  INTEGER,
    away_goals  INTEGER,
    played_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS wc_match_results (
    id              INTEGER PRIMARY KEY,
    match_id        TEXT    UNIQUE NOT NULL,
    home_team       TEXT,
    away_team       TEXT,
    winner          TEXT,
    round           TEXT,
    third_advanced  BOOLEAN DEFAULT FALSE,
    played_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS wc_brackets (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER UNIQUE NOT NULL,
    picks        TEXT    NOT NULL DEFAULT '{}',
    score        INTEGER DEFAULT 0,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
  );
`

const DEFAULT_SETTINGS = {
  brackets_locked:    'false',
  lock_time:          '',
  tournament_started: 'false',
  picks_locked:       'false',
  picks_lock_time:    '',
  knockout_picks_open:'false',
}

export default class PgDB {
  constructor(connectionString) {
    this._pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    })
    this._data = null
  }

  // ─── Startup ──────────────────────────────────────────────────────────────

  async init() {
    await this._pool.query(CREATE_SQL)

    // Seed from bracket.json if the DB is empty (first deploy)
    const { rows } = await this._pool.query('SELECT COUNT(*) AS cnt FROM wc_users')
    if (parseInt(rows[0].cnt) === 0 && existsSync(BUNDLED_PATH)) {
      try {
        console.log('[db-pg] Empty DB — seeding from bracket.json...')
        const seed = JSON.parse(readFileSync(BUNDLED_PATH, 'utf8'))
        await this._seedFromJson(seed)
        console.log('[db-pg] Seed complete')
      } catch (e) {
        console.warn('[db-pg] Seed failed:', e.message)
      }
    }

    await this._reload()
    console.log(`[db-pg] Ready: ${this._data.users.length} users, ${this._data.score_picks.length} picks, ${this._data.match_scores.length} scores`)
  }

  async _reload() {
    const [u, s, sp, ms, mr, br] = await Promise.all([
      this._pool.query('SELECT * FROM wc_users ORDER BY id'),
      this._pool.query('SELECT key, value FROM wc_settings'),
      this._pool.query('SELECT * FROM wc_score_picks ORDER BY id'),
      this._pool.query('SELECT * FROM wc_match_scores ORDER BY id'),
      this._pool.query('SELECT * FROM wc_match_results ORDER BY id'),
      this._pool.query('SELECT * FROM wc_brackets ORDER BY id'),
    ])

    const settingsMap = Object.fromEntries(s.rows.map(r => [r.key, r.value]))

    this._data = {
      users: u.rows.map(r => ({
        ...r,
        is_admin:         Number(r.is_admin),
        reset_requested:  !!r.reset_requested,
      })),
      settings: { ...DEFAULT_SETTINGS, ...settingsMap },
      score_picks: sp.rows.map(r => ({
        ...r,
        home_goals: Number(r.home_goals),
        away_goals: Number(r.away_goals),
      })),
      match_scores: ms.rows.map(r => ({
        ...r,
        home_goals: r.home_goals != null ? Number(r.home_goals) : null,
        away_goals: r.away_goals != null ? Number(r.away_goals) : null,
      })),
      match_results: mr.rows.map(r => ({
        ...r,
        third_advanced: !!r.third_advanced,
      })),
      brackets: br.rows,  // picks stored as TEXT; routes call JSON.parse() as before
      _seq: {
        users:         u.rows.reduce((m, r) => Math.max(m, r.id), 0),
        brackets:      br.rows.reduce((m, r) => Math.max(m, r.id), 0),
        score_picks:   sp.rows.reduce((m, r) => Math.max(m, r.id), 0),
        match_scores:  ms.rows.reduce((m, r) => Math.max(m, r.id), 0),
        match_results: mr.rows.reduce((m, r) => Math.max(m, r.id), 0),
      },
    }
  }

  async _seedFromJson(data) {
    const now = new Date().toISOString()
    for (const u of (data.users || [])) {
      await this._pool.query(
        `INSERT INTO wc_users (id,username,password_hash,is_admin,reset_requested,reset_requested_at,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [u.id, u.username, u.password_hash, u.is_admin||0, u.reset_requested||false, u.reset_requested_at||null, u.created_at||now]
      )
    }
    for (const [key, value] of Object.entries(data.settings || {})) {
      await this._pool.query(
        `INSERT INTO wc_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`,
        [key, String(value)]
      )
    }
    for (const p of (data.score_picks || [])) {
      await this._pool.query(
        `INSERT INTO wc_score_picks (id,user_id,match_id,home_goals,away_goals,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [p.id, p.user_id, p.match_id, p.home_goals, p.away_goals, p.created_at||now, p.updated_at||now]
      )
    }
    for (const s of (data.match_scores || [])) {
      await this._pool.query(
        `INSERT INTO wc_match_scores (id,match_id,home_team,away_team,home_goals,away_goals,played_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [s.id, s.match_id, s.home_team||null, s.away_team||null, s.home_goals??null, s.away_goals??null, s.played_at||now, s.updated_at||now]
      )
    }
    for (const r of (data.match_results || [])) {
      await this._pool.query(
        `INSERT INTO wc_match_results (id,match_id,home_team,away_team,winner,round,third_advanced,played_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.match_id, r.home_team||null, r.away_team||null, r.winner||null, r.round, !!r.third_advanced, r.played_at||now, r.updated_at||now]
      )
    }
    for (const b of (data.brackets || [])) {
      const picks = typeof b.picks === 'string' ? b.picks : JSON.stringify(b.picks)
      await this._pool.query(
        `INSERT INTO wc_brackets (id,user_id,picks,score,submitted_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [b.id, b.user_id, picks, b.score||0, b.submitted_at||now, b.updated_at||now]
      )
    }
  }

  // Fire-and-forget PG write — updates are already in memory
  _w(query, params) {
    this._pool.query(query, params).catch(err =>
      console.error('[db-pg] Write error:', err.message, '\n  query:', query.slice(0, 120))
    )
  }

  // ─── Users ────────────────────────────────────────────────────────────────

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
    const now  = new Date().toISOString()
    const user = { id: this._data._seq.users, username, password_hash, is_admin: 0, created_at: now }
    this._data.users.push(user)
    this._w(
      `INSERT INTO wc_users (id,username,password_hash,is_admin,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [user.id, username, password_hash, 0, now]
    )
    return user
  }

  changeUsername(id, newUsername) {
    const u = this._data.users.find(u => u.id === id)
    if (!u) return false
    u.username = newUsername
    this._w('UPDATE wc_users SET username=$1 WHERE id=$2', [newUsername, id])
    return true
  }

  deleteUser(id) {
    this._data.users        = this._data.users.filter(u => u.id !== id)
    this._data.score_picks  = (this._data.score_picks || []).filter(p => p.user_id !== id)
    this._w('DELETE FROM wc_score_picks WHERE user_id=$1', [id])
    this._w('DELETE FROM wc_users WHERE id=$1', [id])
  }

  promoteUser(id) {
    const u = this._data.users.find(u => u.id === id)
    if (u) { u.is_admin = 1; this._w('UPDATE wc_users SET is_admin=1 WHERE id=$1', [id]) }
  }

  setPassword(id, password_hash) {
    const u = this._data.users.find(u => u.id === id)
    if (!u) return false
    u.password_hash   = password_hash
    u.reset_requested = false
    this._w('UPDATE wc_users SET password_hash=$1, reset_requested=FALSE WHERE id=$2', [password_hash, id])
    return true
  }

  requestReset(username) {
    const u = this._data.users.find(u => u.username === username)
    if (!u) return false
    const now = new Date().toISOString()
    u.reset_requested    = true
    u.reset_requested_at = now
    this._w("UPDATE wc_users SET reset_requested=TRUE, reset_requested_at=$1 WHERE username=$2", [now, username])
    return true
  }

  // ─── Brackets ─────────────────────────────────────────────────────────────

  getBracketByUserId(user_id) {
    return this._data.brackets.find(b => b.user_id === user_id) || null
  }

  upsertBracket(user_id, picks) {
    const now      = new Date().toISOString()
    const existing = this._data.brackets.find(b => b.user_id === user_id)
    if (existing) {
      existing.picks      = picks
      existing.updated_at = now
      this._w('UPDATE wc_brackets SET picks=$1,updated_at=$2 WHERE user_id=$3', [picks, now, user_id])
    } else {
      this._data._seq.brackets += 1
      const b = { id: this._data._seq.brackets, user_id, picks, score: 0, submitted_at: now, updated_at: now }
      this._data.brackets.push(b)
      this._w(
        'INSERT INTO wc_brackets (id,user_id,picks,score,submitted_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [b.id, user_id, picks, 0, now, now]
      )
    }
  }

  updateBracketScore(user_id, score) {
    const b = this._data.brackets.find(b => b.user_id === user_id)
    if (b) { b.score = score; this._w('UPDATE wc_brackets SET score=$1 WHERE user_id=$2', [score, user_id]) }
  }

  // ─── Score picks ──────────────────────────────────────────────────────────

  upsertScorePick(user_id, match_id, home_goals, away_goals) {
    if (!this._data.score_picks) this._data.score_picks = []
    const now      = new Date().toISOString()
    const existing = this._data.score_picks.find(p => p.user_id === user_id && p.match_id === match_id)
    if (existing) {
      existing.home_goals = home_goals
      existing.away_goals = away_goals
      existing.updated_at = now
      this._w(
        'UPDATE wc_score_picks SET home_goals=$1,away_goals=$2,updated_at=$3 WHERE user_id=$4 AND match_id=$5',
        [home_goals, away_goals, now, user_id, match_id]
      )
    } else {
      this._data._seq.score_picks += 1
      const p = { id: this._data._seq.score_picks, user_id, match_id, home_goals, away_goals, created_at: now, updated_at: now }
      this._data.score_picks.push(p)
      this._w(
        `INSERT INTO wc_score_picks (id,user_id,match_id,home_goals,away_goals,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id,match_id) DO UPDATE SET home_goals=$4,away_goals=$5,updated_at=$7`,
        [p.id, user_id, match_id, home_goals, away_goals, now, now]
      )
    }
  }

  getScorePicksByUser(user_id) {
    return (this._data.score_picks || []).filter(p => p.user_id === user_id)
  }

  getAllScorePicks() {
    return this._data.score_picks || []
  }

  deletePicksByUser(user_id) {
    this._data.score_picks = (this._data.score_picks || []).filter(p => p.user_id !== user_id)
    this._w('DELETE FROM wc_score_picks WHERE user_id=$1', [user_id])
  }

  // ─── Match scores ─────────────────────────────────────────────────────────
  // NOTE: upsertMatchScore and deleteMatchScore are ASYNC — they await the PG
  // write directly so that callers can detect and surface failures.  All other
  // write methods remain fire-and-forget via _w() because they are less
  // critical and would require a much larger refactor to make awaitable.

  async upsertMatchScore(match_id, { home_team, away_team, home_goals, away_goals }) {
    if (!this._data.match_scores) this._data.match_scores = []
    const now      = new Date().toISOString()
    const existing = this._data.match_scores.find(s => s.match_id === match_id)
    if (existing) {
      if (home_team  !== undefined) existing.home_team  = home_team
      if (away_team  !== undefined) existing.away_team  = away_team
      if (home_goals !== undefined) existing.home_goals = home_goals
      if (away_goals !== undefined) existing.away_goals = away_goals
      existing.updated_at = now
      await this._pool.query(
        `UPDATE wc_match_scores
           SET home_team  = COALESCE($1, home_team),
               away_team  = COALESCE($2, away_team),
               home_goals = COALESCE($3, home_goals),
               away_goals = COALESCE($4, away_goals),
               updated_at = $5
         WHERE match_id = $6`,
        [home_team ?? null, away_team ?? null, home_goals ?? null, away_goals ?? null, now, match_id]
      )
    } else {
      this._data._seq.match_scores += 1
      const s = {
        id: this._data._seq.match_scores, match_id,
        home_team: home_team || null, away_team: away_team || null,
        home_goals: home_goals ?? null, away_goals: away_goals ?? null,
        played_at: now, updated_at: now,
      }
      this._data.match_scores.push(s)
      // ON CONFLICT safeguard: if a race or retry attempts the same match_id,
      // merge rather than fail with a unique-constraint error.
      await this._pool.query(
        `INSERT INTO wc_match_scores (id,match_id,home_team,away_team,home_goals,away_goals,played_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (match_id) DO UPDATE
           SET home_team  = COALESCE(EXCLUDED.home_team,  wc_match_scores.home_team),
               away_team  = COALESCE(EXCLUDED.away_team,  wc_match_scores.away_team),
               home_goals = COALESCE(EXCLUDED.home_goals, wc_match_scores.home_goals),
               away_goals = COALESCE(EXCLUDED.away_goals, wc_match_scores.away_goals),
               updated_at = EXCLUDED.updated_at`,
        [s.id, match_id, s.home_team, s.away_team, s.home_goals, s.away_goals, now, now]
      )
    }
  }

  getMatchScore(match_id) {
    return (this._data.match_scores || []).find(s => s.match_id === match_id) || null
  }

  getAllMatchScores() {
    return this._data.match_scores || []
  }

  async deleteMatchScore(match_id) {
    this._data.match_scores = (this._data.match_scores || []).filter(s => s.match_id !== match_id)
    await this._pool.query('DELETE FROM wc_match_scores WHERE match_id=$1', [match_id])
  }

  // ─── Match results ────────────────────────────────────────────────────────

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
    const now      = new Date().toISOString()
    const existing = this._data.match_results.find(r => r.match_id === match_id)
    if (existing) {
      Object.assign(existing, {
        home_team: home_team ?? null, away_team: away_team ?? null,
        winner: winner ?? null, round, third_advanced: !!third_advanced, updated_at: now,
      })
      this._w(
        `UPDATE wc_match_results
           SET home_team=$1,away_team=$2,winner=$3,round=$4,third_advanced=$5,updated_at=$6
         WHERE match_id=$7`,
        [home_team||null, away_team||null, winner||null, round, !!third_advanced, now, match_id]
      )
    } else {
      this._data._seq.match_results += 1
      const r = {
        id: this._data._seq.match_results, match_id,
        home_team: home_team||null, away_team: away_team||null,
        winner: winner||null, round, third_advanced: !!third_advanced,
        played_at: now, updated_at: now,
      }
      this._data.match_results.push(r)
      this._w(
        `INSERT INTO wc_match_results (id,match_id,home_team,away_team,winner,round,third_advanced,played_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [r.id, match_id, r.home_team, r.away_team, r.winner, round, !!third_advanced, now, now]
      )
    }
  }

  deleteMatchResult(match_id) {
    this._data.match_results = this._data.match_results.filter(r => r.match_id !== match_id)
    this._w('DELETE FROM wc_match_results WHERE match_id=$1', [match_id])
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  getSetting(key) {
    return this._data.settings[key] ?? null
  }

  setSetting(key, value) {
    this._data.settings[key] = String(value)
    this._w(
      `INSERT INTO wc_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`,
      [key, String(value)]
    )
  }

  getAllSettings() {
    return { ...this._data.settings }
  }
}
