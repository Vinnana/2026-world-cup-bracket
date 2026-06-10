/**
 * One-time migration: bracket.json → PostgreSQL
 *
 * Usage (run once before switching the live server to DATABASE_URL):
 *
 *   DATABASE_URL=postgresql://... node migrate.js
 *
 * The script is idempotent — safe to run multiple times.
 * Existing rows are left untouched (ON CONFLICT DO NOTHING).
 */

import pkg from 'pg'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pkg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('\nERROR: DATABASE_URL environment variable is required.\n')
  console.error('  Usage: DATABASE_URL=postgresql://... node migrate.js\n')
  process.exit(1)
}

const BRACKET_JSON = path.join(__dirname, 'bracket.json')
if (!existsSync(BRACKET_JSON)) {
  console.error('\nERROR: bracket.json not found at', BRACKET_JSON, '\n')
  process.exit(1)
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
const data = JSON.parse(readFileSync(BRACKET_JSON, 'utf8'))
const now  = new Date().toISOString()

async function run() {
  console.log('\n── WC 2026 bracket.json → PostgreSQL migration ──')
  console.log(`  Users:         ${(data.users || []).length}`)
  console.log(`  Score picks:   ${(data.score_picks || []).length}`)
  console.log(`  Match scores:  ${(data.match_scores || []).length}`)
  console.log(`  Match results: ${(data.match_results || []).length}`)
  console.log(`  Brackets:      ${(data.brackets || []).length}`)
  console.log(`  Settings:      ${Object.keys(data.settings || {}).length} keys\n`)

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wc_users (
      id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, is_admin INTEGER DEFAULT 0,
      reset_requested BOOLEAN DEFAULT FALSE, reset_requested_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wc_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS wc_score_picks (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, match_id TEXT NOT NULL,
      home_goals INTEGER NOT NULL, away_goals INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, match_id)
    );
    CREATE TABLE IF NOT EXISTS wc_match_scores (
      id INTEGER PRIMARY KEY, match_id TEXT UNIQUE NOT NULL,
      home_team TEXT, away_team TEXT, home_goals INTEGER, away_goals INTEGER,
      played_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wc_match_results (
      id INTEGER PRIMARY KEY, match_id TEXT UNIQUE NOT NULL,
      home_team TEXT, away_team TEXT, winner TEXT, round TEXT,
      third_advanced BOOLEAN DEFAULT FALSE,
      played_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wc_brackets (
      id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL,
      picks TEXT NOT NULL DEFAULT '{}', score INTEGER DEFAULT 0,
      submitted_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
  console.log('Tables created (or already exist) ✓')

  // Users
  let cnt = 0
  for (const u of (data.users || [])) {
    const { rowCount } = await pool.query(
      `INSERT INTO wc_users (id,username,password_hash,is_admin,reset_requested,reset_requested_at,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [u.id, u.username, u.password_hash, u.is_admin||0, u.reset_requested||false, u.reset_requested_at||null, u.created_at||now]
    )
    cnt += rowCount
  }
  console.log(`Users inserted: ${cnt} / ${(data.users||[]).length}`)

  // Settings
  cnt = 0
  for (const [key, value] of Object.entries(data.settings || {})) {
    await pool.query(
      `INSERT INTO wc_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`,
      [key, String(value)]
    )
    cnt++
  }
  console.log(`Settings upserted: ${cnt}`)

  // Score picks
  cnt = 0
  for (const p of (data.score_picks || [])) {
    const { rowCount } = await pool.query(
      `INSERT INTO wc_score_picks (id,user_id,match_id,home_goals,away_goals,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.user_id, p.match_id, p.home_goals, p.away_goals, p.created_at||now, p.updated_at||now]
    )
    cnt += rowCount
  }
  console.log(`Score picks inserted: ${cnt} / ${(data.score_picks||[]).length}`)

  // Match scores
  cnt = 0
  for (const s of (data.match_scores || [])) {
    const { rowCount } = await pool.query(
      `INSERT INTO wc_match_scores (id,match_id,home_team,away_team,home_goals,away_goals,played_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.match_id, s.home_team||null, s.away_team||null, s.home_goals??null, s.away_goals??null, s.played_at||now, s.updated_at||now]
    )
    cnt += rowCount
  }
  console.log(`Match scores inserted: ${cnt} / ${(data.match_scores||[]).length}`)

  // Match results
  cnt = 0
  for (const r of (data.match_results || [])) {
    const { rowCount } = await pool.query(
      `INSERT INTO wc_match_results (id,match_id,home_team,away_team,winner,round,third_advanced,played_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.match_id, r.home_team||null, r.away_team||null, r.winner||null, r.round, !!r.third_advanced, r.played_at||now, r.updated_at||now]
    )
    cnt += rowCount
  }
  console.log(`Match results inserted: ${cnt} / ${(data.match_results||[]).length}`)

  // Brackets
  cnt = 0
  for (const b of (data.brackets || [])) {
    const picks = typeof b.picks === 'string' ? b.picks : JSON.stringify(b.picks)
    const { rowCount } = await pool.query(
      `INSERT INTO wc_brackets (id,user_id,picks,score,submitted_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [b.id, b.user_id, picks, b.score||0, b.submitted_at||now, b.updated_at||now]
    )
    cnt += rowCount
  }
  console.log(`Brackets inserted: ${cnt} / ${(data.brackets||[]).length}`)

  console.log('\nMigration complete ✓\n')
  await pool.end()
}

run().catch(err => {
  console.error('\nMigration failed:', err.message)
  process.exit(1)
})
