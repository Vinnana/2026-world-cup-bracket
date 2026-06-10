/**
 * Database factory + transparent proxy.
 *
 * Usage:
 *   import db from './database.js'           // same as before — no route changes
 *   import { initDB } from './database.js'   // call once at server startup
 *
 * When DATABASE_URL is set → PostgreSQL (Render / Supabase).
 * Otherwise              → local JSON file (development / fallback).
 *
 * The proxy ensures all existing route code continues to work identically:
 * every db.method() call is forwarded to the real instance after initDB() resolves.
 */

let _db = null

export async function initDB() {
  if (_db) return _db

  if (process.env.DATABASE_URL) {
    const { default: PgDB } = await import('./database-pg.js')
    _db = new PgDB(process.env.DATABASE_URL)
    await _db.init()
  } else {
    const { default: JsonDB } = await import('./database-json.js')
    _db = new JsonDB()
  }
  return _db
}

// Transparent proxy — routes call db.xyz() exactly as before.
// All method calls are forwarded synchronously to the real instance.
// (PgDB keeps an in-memory cache so every method is synchronous after init.)
const db = new Proxy({}, {
  get(_, prop) {
    return (...args) => {
      if (!_db) throw new Error(`DB not ready — initDB() has not completed yet (called: ${String(prop)})`)
      if (typeof _db[prop] !== 'function') return _db[prop]
      return _db[prop](...args)
    }
  },
})

export default db
