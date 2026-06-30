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

// Schedule window: 5 min before kickoff to 3.5 h after (covers 90 min + HT + AET + PKs + buffer).
// Used as a fallback when ESPN is unavailable and for pre-kick detection.
const GAME_LEAD_MS   = 5 * 60 * 1000
const GAME_WINDOW_MS = 3.5 * 60 * 60 * 1000
function anyGameInWindow() {
  const now = Date.now()
  return Object.values(MATCH_DATES).some(iso => {
    const ko = new Date(iso).getTime()
    return Number.isFinite(ko) && now >= ko - GAME_LEAD_MS && now <= ko + GAME_WINDOW_MS
  })
}

// Ticks of LIVE_FETCH_INTERVAL_MIN polling to do after ESPN stops showing active matches.
// Gives football-data.org (and other providers) time to publish the final result.
const POST_GAME_COOLDOWN_TICKS = 10   // ~10 min of 1-min polling after game ends
let _cooldownTicks = 0

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
  console.log(`Auto-fetch (${activeProvider()}): ${ACTIVE_FETCH_INTERVAL_SEC}s live / ${LIVE_FETCH_INTERVAL_MIN}m pre-kick / ${IDLE_FETCH_INTERVAL_MIN}m idle (when turned on in Admin).`)

  // Self-rescheduling loop whose cadence adapts to actual ESPN live status.
  //
  // Modes:
  //   live      — ESPN: ≥1 match status='live'|'ht' (incl. AET, PKs) → ACTIVE_FETCH_INTERVAL_SEC (30 s)
  //   finishing — ESPN: all matches 'ft', cooldown running             → LIVE_FETCH_INTERVAL_MIN  (1 min)
  //   active    — within schedule window, game not yet kicked off      → LIVE_FETCH_INTERVAL_MIN  (1 min)
  //   idle      — nothing scheduled, cooldown expired                  → IDLE_FETCH_INTERVAL_MIN  (15 min)
  //
  // ESPN is always checked unconditionally so AET/PKs that exceed the schedule window are handled.
  // The post-game cooldown keeps syncing at 1-min after ESPN shows 'ft' so football-data.org has
  // time to publish the final result before we drop back to idle.
  async function tick() {
    let intervalMs = IDLE_FETCH_INTERVAL_MIN * 60_000
    let mode = 'idle'
    const inWindow = anyGameInWindow()

    try {
      const scores = await fetchLiveScores()
      const anyActive = Object.values(scores).some(s => s.status === 'live' || s.status === 'ht')

      if (anyActive) {
        // Game in progress (regular time, HT, AET, or PKs) — poll fast
        intervalMs = ACTIVE_FETCH_INTERVAL_SEC * 1000
        mode = 'live'
        _cooldownTicks = POST_GAME_COOLDOWN_TICKS   // reset cooldown each live tick
      } else if (inWindow) {
        // In schedule window but game hasn't started yet (or window still open after FT)
        intervalMs = LIVE_FETCH_INTERVAL_MIN * 60_000
        mode = 'active'
        // If cooldown was counting down and we're still in the window, keep it running
      } else if (_cooldownTicks > 0) {
        // Game just ended — keep syncing at 1 min so the provider has time to publish the result
        intervalMs = LIVE_FETCH_INTERVAL_MIN * 60_000
        mode = 'finishing'
        _cooldownTicks--
      }
      // else: mode = 'idle', intervalMs = 15 min
    } catch {
      // ESPN unavailable — fall back to schedule-window detection + cooldown
      if (inWindow) {
        intervalMs = LIVE_FETCH_INTERVAL_MIN * 60_000
        mode = 'active'
      } else if (_cooldownTicks > 0) {
        intervalMs = LIVE_FETCH_INTERVAL_MIN * 60_000
        mode = 'finishing'
        _cooldownTicks--
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
