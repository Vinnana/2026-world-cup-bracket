/**
 * One-time seeder for Adya's South Africa vs Canada pick.
 * Pick: 1-1 draw, Canada to advance.
 * Runs on every startup; re-seeds if SEED_VERSION changes.
 */

const SEED_VERSION = '1'

function findSaCanadaMatchId(db) {
  const normalize = s => (s || '').toLowerCase().replace(/[^a-z]/g, '')
  const nSA = normalize('South Africa')
  const nCA = normalize('Canada')
  for (const s of db.getAllMatchScores()) {
    if (!s.home_team || !s.away_team) continue
    const mh = normalize(s.home_team)
    const ma = normalize(s.away_team)
    if ((mh === nSA && ma === nCA) || (mh === nCA && ma === nSA)) return s.match_id
  }
  return null
}

export async function seedAdyaPicks(db) {
  // Accept any casing / email suffix, e.g. "Adya", "adya", "adya@gmail.com"
  const user = db.getAllUsers().find(u => u.username.toLowerCase().startsWith('adya'))
  if (!user) {
    console.log('[seed:adya] User "Adya" not found — will retry on next restart once they register')
    return
  }

  const storedVersion = db.getSetting('adya_picks_seed_version')
  if (storedVersion === SEED_VERSION) {
    console.log(`[seed:adya] Picks already at v${SEED_VERSION} — skipping`)
    return
  }

  const matchId = findSaCanadaMatchId(db)
  if (!matchId) {
    console.log('[seed:adya] SA vs Canada match not yet in match_scores — will retry on next restart')
    return
  }

  // Score pick: 1-1 (draw, orientation doesn't matter)
  db.upsertScorePick(user.id, matchId, 1, 1)

  // Bracket pick: Canada advances
  const row = db.getBracketByUserId(user.id)
  let picks = {}
  if (row) { try { picks = JSON.parse(row.picks) } catch {} }
  if (!picks.knockout) picks.knockout = {}
  picks.knockout[matchId] = 'Canada'
  db.upsertBracket(user.id, JSON.stringify(picks))

  db.setSetting('adya_picks_seed_version', SEED_VERSION)
  console.log(`[seed:adya] Seeded SA 1-1 Canada + advances Canada for "${user.username}" (id ${user.id}), match ${matchId}`)
}
