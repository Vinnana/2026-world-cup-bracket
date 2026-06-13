/**
 * Live match scores — proxies ESPN's public scoreboard API so the browser
 * never has to worry about CORS.  Results are cached for 45 seconds server-side
 * and the endpoint always returns 200 (empty scores on error) so the UI can
 * treat live scores as supplemental, best-effort information.
 *
 * GET /api/live  →  { scores: { [matchId]: LiveScore } }
 *
 * LiveScore {
 *   status:      'live' | 'ht' | 'ft'
 *   home_score:  number
 *   away_score:  number
 *   clock:       string  e.g. "67:00", "90:00+3", "0:00"
 *   status_name: string  e.g. "STATUS_IN_PROGRESS", "STATUS_HALFTIME"
 * }
 */

import { Router } from 'express'
import { ALL_MATCHES } from '../matches.js'

const router = Router()

const CACHE_TTL_MS = 45_000   // refresh at most every 45 s

let _cache = null   // { ts: number, scores: Object }

// ── Team-name normalisation ──────────────────────────────────────────────────
// ESPN sometimes uses different names from the ones in teams.js.
// Keys are lowercase ESPN display names; values are our canonical spellings.
const ESPN_ALIAS = {
  'turkey':                       'Türkiye',
  "cote d'ivoire":                'Ivory Coast',
  "côte d'ivoire":                'Ivory Coast',
  'south korea':                  'Korea Republic',
  'czech republic':               'Czechia',
  'curacao':                      'Curaçao',
  'dr congo':                     'DR Congo',
  'congo dr':                     'DR Congo',
  'democratic republic of congo': 'DR Congo',
  'bosnia & herzegovina':         'Bosnia and Herzegovina',
  'bosnia-herzegovina':           'Bosnia and Herzegovina',
  'bosnia herzegovina':           'Bosnia and Herzegovina',
  'cabo verde':                   'Cape Verde',
}

function normalizeTeam(espnName) {
  if (!espnName) return ''
  const lower = espnName.trim().toLowerCase()
  // Return canonical name from alias map (or original, trimmed, for comparison)
  return (ESPN_ALIAS[lower] || espnName.trim()).toLowerCase()
}

function findMatchByTeams(espnHome, espnAway) {
  const nh = normalizeTeam(espnHome)
  const na = normalizeTeam(espnAway)
  return ALL_MATCHES.find(m => {
    if (typeof m.home !== 'string' || typeof m.away !== 'string') return false
    return m.home.toLowerCase() === nh && m.away.toLowerCase() === na
  }) || null
}

// ── ESPN fetch ───────────────────────────────────────────────────────────────
async function fetchLiveScores() {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) {
    return _cache.scores
  }

  const scores = {}

  // Check today + yesterday (UTC) to catch late-night matches still in progress
  const now    = new Date()
  const yest   = new Date(Date.now() - 86_400_000)
  const toDate = d => d.toISOString().slice(0, 10).replace(/-/g, '')
  const dates  = [toDate(now), toDate(yest)]

  for (const dateStr of dates) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateStr}`
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
      if (!res.ok) continue
      const data = await res.json()

      for (const event of data.events || []) {
        const state      = event.status?.type?.state       // 'pre' | 'in' | 'post'
        const statusName = event.status?.type?.name || ''  // 'STATUS_IN_PROGRESS' etc.

        // Only track matches in progress or finished
        if (state !== 'in' && state !== 'post') continue

        const comp    = event.competitions?.[0]
        if (!comp) continue

        const homeC = comp.competitors?.find(c => c.homeAway === 'home')
        const awayC = comp.competitors?.find(c => c.homeAway === 'away')
        if (!homeC || !awayC) continue

        const match = findMatchByTeams(homeC.team?.displayName, awayC.team?.displayName)
        if (!match) continue

        // Derive a clean status string
        let status = 'live'
        if (state === 'post') status = 'ft'
        else if (statusName === 'STATUS_HALFTIME') status = 'ht'

        scores[match.id] = {
          status,
          status_name: statusName,
          home_score: parseInt(homeC.score) || 0,
          away_score: parseInt(awayC.score) || 0,
          clock: event.status?.displayClock || '',
        }
      }
    } catch (err) {
      console.warn(`[live-scores] ESPN fetch error for ${dateStr}:`, err.message)
    }
  }

  _cache = { ts: Date.now(), scores }
  return scores
}

// ── Route ────────────────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const scores = await fetchLiveScores()
    res.json({ scores })
  } catch (err) {
    console.error('[live-scores] Unhandled error:', err.message)
    res.json({ scores: {} })   // always 200 — live scores are supplemental
  }
})

export default router
