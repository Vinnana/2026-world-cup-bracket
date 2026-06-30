import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import bracketRoutes from './routes/brackets.js'
import adminRoutes from './routes/admin.js'
import picksRoutes from './routes/picks.js'
import liveRoutes, { fetchLiveScores } from './routes/liveScores.js'
import db, { initDB } from './database.js'
import { seedPdaiPicks } from './seeds/pdai-picks.js'
import { seedAdyaPicks } from './seeds/adya-picks.js'
import { runResultsSync, addSyncHistory, isConfigured, activeProvider } from './resultsFetcher.js'
import { GROUPS, KNOCKOUT, ROUNDS } from './teams.js'
import { MATCH_DATES } from './schedule.js'

const app = express()
const PORT = process.env.PORT || 3001
// Poll fast while a match is in play, slowly when nothing is on.
const ACTIVE_FETCH_INTERVAL_SEC = Number(process.env.ACTIVE_FETCH_INTERVAL_SEC || 30) // during live play
const LIVE_FETCH_INTERVAL_MIN   = Number(process.env.LIVE_FETCH_INTERVAL_MIN   || 1)  // in schedule window, pre-kick
const IDLE_FETCH_INTERVAL_MIN   = Number(process.env.IDLE_FETCH_INTERVAL_MIN   || 15) // nothing scheduled

// A match counts as "in play" from ~5 min before kickoff until ~2.5h after, which
// comfortably covers a full match incl. halftime and stoppage time.
const GAME_LEAD_MS   = 5 * 60 * 1000
const GAME_WINDOW_MS = 2.5 * 60 * 60 * 1000
function anyGameLive() {
  const now = Date.now()
  return Object.values(MATCH_DATES).some(iso => {
    const ko = new Date(iso).getTime()
    return Number.isFinite(ko) && now >= ko - GAME_LEAD_MS && now <= ko + GAME_WINDOW_MS
  })
}

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/brackets', bracketRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/picks', picksRoutes)
app.use('/api/live',  liveRoutes)

// Public: tournament data for bracket building
app.get('/api/tournament', (req, res) => {
  res.json({ groups: GROUPS, knockout: KNOCKOUT, rounds: ROUNDS })
})

// Scheduled auto-fetch of results. Only runs when the admin has enabled it
// (settings.auto_fetch === 'true') AND a FOOTBALL_DATA_TOKEN is configured.
function startScheduler() {
  if (!isConfigured()) {
    console.log(`Auto-fetch: ${activeProvider()} not configured — results are admin-entered only.`)
    return
  }
  console.log(`Auto-fetch (${activeProvider()}): enabled, polling every ${LIVE_FETCH_INTERVAL_MIN} min during live games, every ${IDLE_FETCH_INTERVAL_MIN} min otherwise (when turned on in Admin).`)

  // Self-rescheduling loop so the cadence adapts to actual match activity.
  // Three modes:
  //   live   — ESPN says a match is in progress (including HT) → every ACTIVE_FETCH_INTERVAL_SEC (30 s)
  //   active — within schedule window but ESPN not yet live    → every LIVE_FETCH_INTERVAL_MIN (1 min)
  //   idle   — nothing scheduled                               → every IDLE_FETCH_INTERVAL_MIN (15 min)
  async function tick() {
    let intervalMs = IDLE_FETCH_INTERVAL_MIN * 60_000
    let mode = 'idle'

    if (anyGameLive()) {
      intervalMs = LIVE_FETCH_INTERVAL_MIN * 60_000
      mode = 'active'
      // Check ESPN to see if a match is actually in progress right now
      try {
        const scores = await fetchLiveScores()
        const anyPlaying = Object.values(scores).some(s => s.status === 'live' || s.status === 'ht')
        if (anyPlaying) {
          intervalMs = ACTIVE_FETCH_INTERVAL_SEC * 1000
          mode = 'live'
        }
      } catch {
        // ESPN unavailable — stay at 1-min window cadence
      }
    }

    // Keep the admin panel's displayed interval and mode in sync.
    db.setSetting('fetch_interval_min', String(intervalMs / 60_000))
    db.setSetting('fetch_mode', mode)

    if (db.getSetting('auto_fetch') === 'true') {
      try {
        const summary = await runResultsSync(db)
        db.setSetting('last_fetch_at', summary.at)
        db.setSetting('last_fetch_status', JSON.stringify(summary))
        addSyncHistory(db, summary)
        console.log(`Auto-fetch: ${summary.groups.length} groups, ${summary.knockout.length} knockout updated (${mode}, next in ${intervalMs / 1000}s).`)
      } catch (err) {
        db.setSetting('last_fetch_status', JSON.stringify({ error: err.message, at: new Date().toISOString() }))
        console.warn('Auto-fetch failed:', err.message)
      }
    }

    setTimeout(tick, intervalMs)
  }

  tick()
}

// ── Startup: init DB first, then open the server ────────────────────────────
async function main() {
  try {
    await initDB()
    await seedPdaiPicks(db)
    await seedAdyaPicks(db)
    // Baseline for admin display; each scheduler tick overwrites these with the real cadence.
    db.setSetting('fetch_interval_min', String(IDLE_FETCH_INTERVAL_MIN))
    db.setSetting('fetch_mode', 'idle')
  } catch (err) {
    console.error('Failed to initialise database:', err.message)
    process.exit(1)
  }

  app.listen(PORT, () => {
    console.log(`WC2026 Bracket server running on http://localhost:${PORT}`)
    startScheduler()
  })
}

main()
