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
import { KNOCKOUT } from '../teams.js'
import db from '../database.js'

const KNOCKOUT_IDS = new Set(KNOCKOUT.map(m => m.id))

const router = Router()

const CACHE_TTL_MS = 15_000   // refresh at most every 15 s (short so live→ft transitions are caught quickly)

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
  'cape verde islands':           'Cape Verde',
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
  // Try exact order first; fall back to reversed order (ESPN sometimes flips home/away)
  const exact = ALL_MATCHES.find(m => {
    if (typeof m.home !== 'string' || typeof m.away !== 'string') return false
    return m.home.toLowerCase() === nh && m.away.toLowerCase() === na
  })
  if (exact) return { matchId: exact.id, swapped: false }

  const reversed = ALL_MATCHES.find(m => {
    if (typeof m.home !== 'string' || typeof m.away !== 'string') return false
    return m.home.toLowerCase() === na && m.away.toLowerCase() === nh
  })
  if (reversed) return { matchId: reversed.id, swapped: true }

  // Fallback: match knockout matches by the actual teams stored in match_scores
  // (knockout m.home/m.away are slot codes, not real team names)
  const allScores = db.getAllMatchScores()
  for (const s of allScores) {
    if (!KNOCKOUT_IDS.has(s.match_id) || !s.home_team || !s.away_team) continue
    const mh = normalizeTeam(s.home_team)
    const ma = normalizeTeam(s.away_team)
    if (mh === nh && ma === na) return { matchId: s.match_id, swapped: false }
    if (mh === na && ma === nh) return { matchId: s.match_id, swapped: true }
  }

  // Special case: m103 (Third Place) teams are never written to match_scores —
  // derive them from the SF losers (m101/m102) at lookup time.
  // winner lives in wc_match_results (separate table), not in match_scores.
  const sf1 = allScores.find(s => s.match_id === 'm101')
  const sf2 = allScores.find(s => s.match_id === 'm102')
  if (sf1?.home_team && sf1?.away_team && sf2?.home_team && sf2?.away_team) {
    const koWinners = {}
    for (const r of db.getKnockoutResults()) { if (r.winner) koWinners[r.match_id] = r.winner }

    function sfLoser(sf) {
      let w = koWinners[sf.match_id]
      if (!w && sf.home_goals != null && sf.away_goals != null) {
        if (sf.home_goals > sf.away_goals) w = sf.home_team
        else if (sf.away_goals > sf.home_goals) w = sf.away_team
      }
      if (!w) return null
      return w === sf.home_team ? sf.away_team : sf.home_team
    }

    const l1 = sfLoser(sf1)
    const l2 = sfLoser(sf2)
    if (l1 && l2) {
      const ml1 = normalizeTeam(l1)
      const ml2 = normalizeTeam(l2)
      if (ml1 === nh && ml2 === na) return { matchId: 'm103', swapped: false }
      if (ml1 === na && ml2 === nh) return { matchId: 'm103', swapped: true }
    }
  }

  return null
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

        const found = findMatchByTeams(homeC.team?.displayName, awayC.team?.displayName)
        if (!found) continue
        const { matchId, swapped } = found

        // Derive a clean status string
        let status = 'live'
        if (state === 'post') status = 'ft'
        else if (statusName === 'STATUS_HALFTIME') status = 'ht'

        const espnHome = parseInt(homeC.score) || 0
        const espnAway = parseInt(awayC.score) || 0

        // If ESPN had the teams in the opposite order to our schedule, swap the scores
        scores[matchId] = {
          status,
          status_name: statusName,
          home_score: swapped ? espnAway : espnHome,
          away_score: swapped ? espnHome : espnAway,
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

export { fetchLiveScores }

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
