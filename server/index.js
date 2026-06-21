import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import bracketRoutes from './routes/brackets.js'
import adminRoutes from './routes/admin.js'
import picksRoutes from './routes/picks.js'
import liveRoutes from './routes/liveScores.js'
import db, { initDB } from './database.js'
import { seedPdaiPicks } from './seeds/pdai-picks.js'
import { runResultsSync, addSyncHistory, isConfigured, activeProvider } from './resultsFetcher.js'
import { GROUPS, KNOCKOUT, ROUNDS } from './teams.js'
import { MATCH_DATES } from './schedule.js'

const app = express()
const PORT = process.env.PORT || 3001
// Poll fast while a match is in play, slowly when nothing is on.
const LIVE_FETCH_INTERVAL_MIN = Number(process.env.LIVE_FETCH_INTERVAL_MIN || 1)
const IDLE_FETCH_INTERVAL_MIN = Number(process.env.IDLE_FETCH_INTERVAL_MIN || 15)

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

  // Self-rescheduling loop so the cadence can change with the schedule.
  async function tick() {
    const live = anyGameLive()
    const intervalMin = live ? LIVE_FETCH_INTERVAL_MIN : IDLE_FETCH_INTERVAL_MIN
    // Keep the admin panel's displayed interval in sync with the live cadence.
    db.setSetting('fetch_interval_min', String(intervalMin))

    if (db.getSetting('auto_fetch') === 'true') {
      try {
        const summary = await runResultsSync(db)
        db.setSetting('last_fetch_at', summary.at)
        db.setSetting('last_fetch_status', JSON.stringify(summary))
        addSyncHistory(db, summary)
        console.log(`Auto-fetch: ${summary.groups.length} groups, ${summary.knockout.length} knockout matches updated (${live ? 'live' : 'idle'}, next in ${intervalMin}m).`)
      } catch (err) {
        db.setSetting('last_fetch_status', JSON.stringify({ error: err.message, at: new Date().toISOString() }))
        console.warn('Auto-fetch failed:', err.message)
      }
    }

    setTimeout(tick, intervalMin * 60 * 1000)
  }

  tick()
}

// ── Startup: init DB first, then open the server ────────────────────────────
async function main() {
  try {
    await initDB()
    await seedPdaiPicks(db)
    // Baseline for the admin display; the scheduler updates this each tick to the
    // live (1 min) or idle (15 min) cadence as games come and go.
    db.setSetting('fetch_interval_min', String(IDLE_FETCH_INTERVAL_MIN))
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
