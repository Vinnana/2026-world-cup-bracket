import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import bracketRoutes from './routes/brackets.js'
import adminRoutes from './routes/admin.js'
import picksRoutes from './routes/picks.js'
import liveRoutes from './routes/liveScores.js'
import db, { initDB } from './database.js'
import { seedPdaiPicks } from './seeds/pdai-picks.js'
import { runResultsSync, addSyncHistory } from './resultsFetcher.js'
import { GROUPS, KNOCKOUT, ROUNDS } from './teams.js'

const app = express()
const PORT = process.env.PORT || 3001
const FETCH_INTERVAL_MIN = Number(process.env.FETCH_INTERVAL_MIN || 15)

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
  if (!process.env.FOOTBALL_DATA_TOKEN) {
    console.log('Auto-fetch: FOOTBALL_DATA_TOKEN not set — results are admin-entered only.')
    return
  }
  console.log(`Auto-fetch: enabled, polling every ${FETCH_INTERVAL_MIN} min when turned on in Admin.`)
  setInterval(async () => {
    if (db.getSetting('auto_fetch') !== 'true') return
    try {
      const summary = await runResultsSync(db)
      db.setSetting('last_fetch_at', summary.at)
      db.setSetting('last_fetch_status', JSON.stringify(summary))
      addSyncHistory(db, summary)
      console.log(`Auto-fetch: ${summary.groups.length} groups, ${summary.knockout.length} knockout matches updated.`)
    } catch (err) {
      db.setSetting('last_fetch_status', JSON.stringify({ error: err.message, at: new Date().toISOString() }))
      console.warn('Auto-fetch failed:', err.message)
    }
  }, FETCH_INTERVAL_MIN * 60 * 1000)
}

// ── Startup: init DB first, then open the server ────────────────────────────
async function main() {
  try {
    await initDB()
    await seedPdaiPicks(db)
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
