/**
 * Live results fetcher — two interchangeable providers.
 *
 * Recommended: football-data.org (free, reliable since 2014)
 *   • Sign up at https://www.football-data.org/client/register  (instant key)
 *   • Set env var:  FOOTBALL_DATA_TOKEN=<your_key>
 *   • Rate limit:   10 calls/min on free tier (plenty for a 15-min scheduler)
 *   • Competition:  defaults to 'WC' (FIFA World Cup)
 *
 * Backup: API-Football / api-sports.io
 *   • Sign up at https://www.api-football.com  (100 calls/day free)
 *   • Set env var:  API_FOOTBALL_KEY=<your_key>
 *   • Switch with:  RESULTS_PROVIDER=api-football
 *
 * What gets updated on each sync:
 *   1. match_scores  — individual match goals (home_goals / away_goals) for the
 *                      score-prediction scoring system (10 / 6 / 4 pts)
 *   2. match_results — group standings (1st/2nd/3rd) and knockout winners, used by
 *                      the legacy bracket system and for resolving knockout teams
 */

import { GROUPS, KNOCKOUT } from './teams.js'
import { GROUP_MATCHES } from './matches.js'

// ─── Shared stage → round key mapping ───────────────────────────────────────
const STAGE_TO_ROUND = {
  LAST_32: 'R32', LAST_16: 'R16',
  QUARTER_FINALS: 'QF', SEMI_FINALS: 'SF', FINAL: 'Final',
}

// ─── Team-name normalisation & alias table ───────────────────────────────────
function normalize(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const ALIASES = {
  usa:                        'United States',
  unitedstatesofamerica:      'United States',
  southkorea:                 'Korea Republic',
  republicofkorea:            'Korea Republic',
  korea:                      'Korea Republic',
  turkey:                     'Türkiye',
  turkiye:                    'Türkiye',
  czechrepublic:              'Czechia',
  cotedivoire:                'Ivory Coast',
  caboverde:                  'Cape Verde',
  cabo:                       'Cape Verde',
  congodr:                    'DR Congo',
  drcongo:                    'DR Congo',
  democraticrepublicofcongo:  'DR Congo',
  bosnia:                     'Bosnia and Herzegovina',
  bosniaherzegovina:          'Bosnia and Herzegovina',
  curacao:                    'Curaçao',
}

const ALL_TEAMS  = Object.values(GROUPS).flatMap(g => g.teams)
const TEAM_INDEX = {}
for (const t of ALL_TEAMS)              TEAM_INDEX[normalize(t)] = t
for (const [k, v] of Object.entries(ALIASES)) TEAM_INDEX[k] = v

function mapTeam(apiName) {
  return apiName ? (TEAM_INDEX[normalize(apiName)] || null) : null
}

const TEAM_GROUP = {}
for (const [letter, g] of Object.entries(GROUPS))
  for (const t of g.teams) TEAM_GROUP[t] = letter

// ─── Match-ID lookup helpers ─────────────────────────────────────────────────

/** Returns the m1–m72 match ID if this pair appears in the group schedule. */
function findGroupMatchId(home, away) {
  return GROUP_MATCHES.find(m =>
    (m.home === home && m.away === away) ||
    (m.home === away && m.away === home)
  )?.id || null
}

/**
 * For knockout matches the teams aren't fixed up-front — find the m73–m104 ID
 * by cross-referencing what we already recorded in match_results / match_scores.
 */
function findKnockoutMatchId(home, away, db) {
  const check = rows => {
    for (const r of rows) {
      if (!r.home_team || !r.away_team) continue
      if ((r.home_team === home && r.away_team === away) ||
          (r.home_team === away && r.away_team === home)) return r.match_id
    }
    return null
  }
  return check(db.getKnockoutResults()) || check(db.getAllMatchScores()) || null
}

// ─── Provider 1: football-data.org ──────────────────────────────────────────

async function httpJson(url, headers) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url.split('?')[0]}`)
  return res.json()
}

async function fetchFootballData() {
  const token = process.env.FOOTBALL_DATA_TOKEN
  if (!token) throw new Error('FOOTBALL_DATA_TOKEN is not set.')
  const comp    = process.env.FOOTBALL_DATA_COMPETITION || 'WC'
  const base    = 'https://api.football-data.org/v4'
  const headers = { 'X-Auth-Token': token }

  const [standingsRes, matchesRes] = await Promise.all([
    httpJson(`${base}/competitions/${comp}/standings`, headers),
    httpJson(`${base}/competitions/${comp}/matches`,   headers),
  ])

  const standings = (standingsRes.standings || [])
    .filter(s => s.type === 'TOTAL' && s.group)
    .map(s => ({
      group: s.group,
      table: (s.table || []).map(r => ({
        position:       r.position,
        team:           { name: r.team?.name },
        points:         r.points         ?? 0,
        goalDifference: r.goalDifference ?? 0,
        goalsFor:       r.goalsFor       ?? 0,
        playedGames:    r.playedGames    ?? 0,
      })),
    }))

  const matches = (matchesRes.matches || []).map(m => ({
    stage:    m.stage,
    status:   m.status,
    homeTeam: { name: m.homeTeam?.name },
    awayTeam: { name: m.awayTeam?.name },
    score: {
      winner: m.score?.winner ?? null,
      home:   m.score?.fullTime?.home ?? null,  // ← actual goals
      away:   m.score?.fullTime?.away ?? null,
    },
  }))

  return { standings, matches }
}

// ─── Provider 2: API-Football / api-sports.io ────────────────────────────────

const AF_ROUND_TO_STAGE = {
  'round of 32': 'LAST_32', 'round of 16': 'LAST_16',
  'quarter-finals': 'QUARTER_FINALS', 'quarterfinals': 'QUARTER_FINALS',
  'semi-finals': 'SEMI_FINALS', 'semifinals': 'SEMI_FINALS',
  'final': 'FINAL',
}
function afStage(round) {
  const r = (round || '').toLowerCase()
  if (r.includes('group'))                      return 'GROUP_STAGE'
  if (r.includes('3rd place') || r.includes('third')) return 'THIRD_PLACE'
  for (const [k, v] of Object.entries(AF_ROUND_TO_STAGE))
    if (r === k || r.includes(k)) return v
  return null
}

async function fetchApiFootball() {
  const key    = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error('API_FOOTBALL_KEY is not set.')
  const league = process.env.API_FOOTBALL_LEAGUE  || '1'
  const season = process.env.API_FOOTBALL_SEASON  || '2026'
  const base   = 'https://v3.football.api-sports.io'
  const headers = { 'x-apisports-key': key }

  const [standRes, fixRes] = await Promise.all([
    httpJson(`${base}/standings?league=${league}&season=${season}`, headers),
    httpJson(`${base}/fixtures?league=${league}&season=${season}`,  headers),
  ])

  const groupTables = standRes.response?.[0]?.league?.standings || []
  const standings = groupTables.map(table => {
    const letter = (table[0]?.group || '').replace(/group/i, '').trim().toUpperCase()
    return {
      group: `GROUP_${letter}`,
      table: table.map(r => ({
        position:       r.rank,
        team:           { name: r.team?.name },
        points:         r.points          ?? 0,
        goalDifference: r.goalsDiff       ?? 0,
        goalsFor:       r.all?.goals?.for ?? 0,
        playedGames:    r.all?.played     ?? 0,
      })),
    }
  })

  const FINISHED = new Set(['FT', 'AET', 'PEN'])
  const matches = (fixRes.response || []).map(f => {
    const home = f.teams?.home, away = f.teams?.away
    let winner = null
    if (home?.winner === true) winner = 'HOME_TEAM'
    else if (away?.winner === true) winner = 'AWAY_TEAM'
    return {
      stage:    afStage(f.league?.round),
      status:   FINISHED.has(f.fixture?.status?.short) ? 'FINISHED' : (f.fixture?.status?.short || ''),
      homeTeam: { name: home?.name },
      awayTeam: { name: away?.name },
      score: {
        winner,
        home: f.goals?.home ?? null,   // ← actual goals
        away: f.goals?.away ?? null,
      },
    }
  })

  return { standings, matches }
}

// ─── Provider selection ──────────────────────────────────────────────────────

export function activeProvider() {
  return process.env.RESULTS_PROVIDER === 'api-football' ? 'api-football' : 'football-data'
}
export function isConfigured() {
  return activeProvider() === 'api-football'
    ? !!process.env.API_FOOTBALL_KEY
    : !!process.env.FOOTBALL_DATA_TOKEN
}
async function fetchFromProvider() {
  return activeProvider() === 'api-football' ? fetchApiFootball() : fetchFootballData()
}

// ─── Processing: match scores → match_scores table (score-prediction system) ─

export function processMatchScores(db, matches, summary) {
  const processed = []
  const unmatched = []

  for (const m of matches) {
    const fin = m.status === 'FINISHED' || m.status === 'AWARDED'
    if (!fin) continue
    const hGoals = m.score?.home, aGoals = m.score?.away
    if (hGoals == null || aGoals == null) continue

    const home = mapTeam(m.homeTeam?.name)
    const away = mapTeam(m.awayTeam?.name)
    if (!home || !away) continue

    // Try group stage first (teams are fixed)
    const groupId = findGroupMatchId(home, away)
    if (groupId) {
      db.upsertMatchScore(groupId, { home_team: home, away_team: away, home_goals: hGoals, away_goals: aGoals })
      processed.push(groupId)
      continue
    }

    // Try knockout (resolved via previously recorded teams)
    const round = STAGE_TO_ROUND[m.stage]
    if (round) {
      const koId = findKnockoutMatchId(home, away, db)
      if (koId) {
        db.upsertMatchScore(koId, { home_team: home, away_team: away, home_goals: hGoals, away_goals: aGoals })
        processed.push(koId)
      } else {
        unmatched.push(`${home} vs ${away} (${round})`)
      }
    }
  }

  summary.scores     = processed
  summary.unmatched  = unmatched
}

// ─── Processing: group standings → match_results (bracket / 3rd-place system) ─

export function processGroups(db, standings, summary) {
  const thirdPlace = []
  const standingByGroup = {}
  for (const s of standings) {
    if (!s.group) continue
    standingByGroup[s.group.replace('GROUP_', '')] = s.table
  }

  for (const [letter, table] of Object.entries(standingByGroup)) {
    const complete = table.length >= 3 && table.every(t => (t.playedGames ?? 0) >= 3)
    if (!complete) continue
    db.upsertMatchResult({
      match_id:      `group_result_${letter}`,
      home_team:     mapTeam(table[0]?.team?.name),
      away_team:     mapTeam(table[1]?.team?.name),
      winner:        mapTeam(table[2]?.team?.name),
      round:         'Group',
      third_advanced: false,
    })
    summary.groups.push(letter)
    const third = mapTeam(table[2]?.team?.name)
    if (third) thirdPlace.push({
      letter, team: third,
      points: table[2].points ?? 0, gd: table[2].goalDifference ?? 0, gf: table[2].goalsFor ?? 0,
    })
  }

  if (thirdPlace.length === 12) {
    const ranked    = [...thirdPlace].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf)
    const advancing = new Set(ranked.slice(0, 8).map(t => t.letter))
    for (const t of thirdPlace) {
      const r = standingByGroup[t.letter]
      db.upsertMatchResult({
        match_id:      `group_result_${t.letter}`,
        home_team:     mapTeam(r[0]?.team?.name),
        away_team:     mapTeam(r[1]?.team?.name),
        winner:        t.team, round: 'Group',
        third_advanced: advancing.has(t.letter),
      })
    }
    summary.thirdsRanked = [...advancing]
  }
}

// ─── Processing: knockout winners → match_results ────────────────────────────

function resolveSide(side, groupResults, koResults) {
  if (typeof side === 'string') {
    if (side.startsWith('3RD:')) return { wildcard: true, allowed: side.slice(4).split('') }
    const pos = side[0], g = side[1]
    const gr  = groupResults[g]
    return { team: gr ? (pos === '1' ? gr.first : gr.second) : null }
  }
  if (side?.win) return { team: koResults[side.win]?.winner || null }
  return { team: null }
}

export function processKnockout(db, matches, summary) {
  const apiByRound = {}
  for (const m of matches) {
    const round = STAGE_TO_ROUND[m.stage]
    if (!round || m.status !== 'FINISHED') continue
    const home = mapTeam(m.homeTeam?.name)
    const away = mapTeam(m.awayTeam?.name)
    if (!home || !away) continue
    const w = m.score?.winner === 'HOME_TEAM' ? home : m.score?.winner === 'AWAY_TEAM' ? away : null
    ;(apiByRound[round] ||= []).push({ home, away, winner: w, consumed: false })
  }

  const reread = () => {
    const gr = {}
    for (const row of db.getGroupResults()) {
      if (row.match_id.startsWith('group_result_'))
        gr[row.match_id.replace('group_result_', '')] =
          { first: row.home_team, second: row.away_team, third: row.winner }
    }
    const ko = {}
    for (const row of db.getKnockoutResults()) ko[row.match_id] = { winner: row.winner }
    return { groupResults: gr, koResults: ko }
  }

  for (const round of ['R32', 'R16', 'QF', 'SF', 'Final']) {
    const ourMatches = KNOCKOUT.filter(m => m.round === round)
    const candidates = apiByRound[round] || []
    for (const M of ourMatches) {
      const { groupResults, koResults } = reread()
      const hs = resolveSide(M.home, groupResults, koResults)
      const as = resolveSide(M.away, groupResults, koResults)

      const cand = candidates.find(c => {
        if (c.consumed) return false
        const teams = [c.home, c.away]
        if (!hs.wildcard && !as.wildcard) {
          return hs.team && as.team && teams.includes(hs.team) && teams.includes(as.team)
        }
        const known = hs.wildcard ? as : hs
        const wild  = hs.wildcard ? hs : as
        if (!known.team || !teams.includes(known.team)) return false
        const other = teams.find(t => t !== known.team)
        return other && wild.allowed.includes(TEAM_GROUP[other])
      })

      if (cand?.winner) {
        cand.consumed = true
        db.upsertMatchResult({
          match_id: M.id, home_team: cand.home, away_team: cand.away,
          winner: cand.winner, round: M.round,
        })
        summary.knockout.push(M.id)
      }
    }
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Full sync: fetches from provider, updates both match_scores AND match_results.
 * Returns a summary object for logging and display.
 */
export async function runResultsSync(db) {
  if (!isConfigured()) {
    throw new Error(`${activeProvider()} is not configured — set the API key to enable auto-fetch.`)
  }
  const summary = {
    provider: activeProvider(),
    groups: [], knockout: [], scores: [], unmatched: [],
    thirdsRanked: null,
    at: new Date().toISOString(),
  }
  const { standings, matches } = await fetchFromProvider()
  processMatchScores(db, matches, summary)   // ← score-prediction system (new)
  processGroups(db, standings, summary)       // ← bracket system (legacy)
  processKnockout(db, matches, summary)       // ← bracket system (legacy)
  return summary
}
