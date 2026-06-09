// Automatic result fetching with two interchangeable providers.
//
// Pick one with RESULTS_PROVIDER:
//   • 'football-data' (default) — needs FOOTBALL_DATA_TOKEN
//       optional: FOOTBALL_DATA_COMPETITION (default 'WC')
//   • 'api-football'            — needs API_FOOTBALL_KEY
//       optional: API_FOOTBALL_LEAGUE (default '1'), API_FOOTBALL_SEASON (default '2026')
//
// Both providers normalize into one internal shape:
//   standings: [{ group: 'GROUP_A', table: [{ position, team:{name}, points,
//                 goalDifference, goalsFor, playedGames }] }]
//   matches:   [{ stage, status:'FINISHED'|…, homeTeam:{name}, awayTeam:{name},
//                 score:{ winner:'HOME_TEAM'|'AWAY_TEAM'|null } }]
//
// The fetcher is best-effort and never throws into the server loop:
//   • Group standings → group_result_<X> (1st/2nd/3rd + the 8 best 3rd-place teams)
//   • Knockout matches → mapped to our match IDs (m73…m104) by participant teams
// Anything it can't confidently map is reported in the summary for manual entry.

import { GROUPS, KNOCKOUT } from './teams.js'

const STAGE_TO_ROUND = {
  LAST_32: 'R32',
  LAST_16: 'R16',
  QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF',
  FINAL: 'Final',
}

// ---- team-name normalization & aliases ----
function normalize(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Aliases: normalized external spelling → our canonical team name
const ALIASES = {
  usa: 'United States',
  unitedstatesofamerica: 'United States',
  southkorea: 'Korea Republic',
  republicofkorea: 'Korea Republic',
  korea: 'Korea Republic',
  turkey: 'Türkiye',
  turkiye: 'Türkiye',
  czechrepublic: 'Czechia',
  cotedivoire: 'Ivory Coast',
  cabo: 'Cape Verde',
  caboverde: 'Cape Verde',
  congodr: 'DR Congo',
  drcongo: 'DR Congo',
  democraticrepublicofcongo: 'DR Congo',
  bosnia: 'Bosnia and Herzegovina',
  bosniaherzegovina: 'Bosnia and Herzegovina',
  curacao: 'Curaçao',
}

const ALL_TEAMS = Object.values(GROUPS).flatMap(g => g.teams)
const TEAM_INDEX = {} // normalized → canonical
for (const t of ALL_TEAMS) TEAM_INDEX[normalize(t)] = t
for (const [k, v] of Object.entries(ALIASES)) TEAM_INDEX[k] = v

function mapTeam(apiName) {
  if (!apiName) return null
  return TEAM_INDEX[normalize(apiName)] || null
}

const TEAM_GROUP = {} // canonical team → group letter
for (const [letter, g] of Object.entries(GROUPS)) for (const t of g.teams) TEAM_GROUP[t] = letter

// =====================================================================
// Providers — each returns { standings, matches } in the internal shape
// =====================================================================

async function httpJson(url, headers) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.split('?')[0]}`)
  return res.json()
}

// ---- Provider 1: football-data.org ----
async function fetchFootballData() {
  const token = process.env.FOOTBALL_DATA_TOKEN
  if (!token) throw new Error('FOOTBALL_DATA_TOKEN is not set.')
  const comp = process.env.FOOTBALL_DATA_COMPETITION || 'WC'
  const base = 'https://api.football-data.org/v4'
  const headers = { 'X-Auth-Token': token }

  const [standingsRes, matchesRes] = await Promise.all([
    httpJson(`${base}/competitions/${comp}/standings`, headers),
    httpJson(`${base}/competitions/${comp}/matches`, headers),
  ])

  const standings = (standingsRes.standings || [])
    .filter(s => s.type === 'TOTAL' && s.group)
    .map(s => ({
      group: s.group,
      table: (s.table || []).map(r => ({
        position: r.position,
        team: { name: r.team?.name },
        points: r.points ?? 0,
        goalDifference: r.goalDifference ?? 0,
        goalsFor: r.goalsFor ?? 0,
        playedGames: r.playedGames ?? 0,
      })),
    }))

  const matches = (matchesRes.matches || []).map(m => ({
    stage: m.stage,
    status: m.status,
    homeTeam: { name: m.homeTeam?.name },
    awayTeam: { name: m.awayTeam?.name },
    score: { winner: m.score?.winner ?? null },
  }))

  return { standings, matches }
}

// ---- Provider 2: API-Football (api-sports.io) ----
const APIFOOTBALL_ROUND_TO_STAGE = {
  'round of 32': 'LAST_32',
  'round of 16': 'LAST_16',
  'quarter-finals': 'QUARTER_FINALS',
  'quarterfinals': 'QUARTER_FINALS',
  'semi-finals': 'SEMI_FINALS',
  'semifinals': 'SEMI_FINALS',
  'final': 'FINAL',
}
function apiFootballStage(round) {
  const r = (round || '').toLowerCase()
  if (r.includes('group')) return 'GROUP_STAGE'
  if (r.includes('3rd place') || r.includes('third place')) return 'THIRD_PLACE'
  for (const [k, v] of Object.entries(APIFOOTBALL_ROUND_TO_STAGE)) {
    if (r === k || r.includes(k)) return v
  }
  return null
}

async function fetchApiFootball() {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error('API_FOOTBALL_KEY is not set.')
  const league = process.env.API_FOOTBALL_LEAGUE || '1'
  const season = process.env.API_FOOTBALL_SEASON || '2026'
  const base = 'https://v3.football.api-sports.io'
  const headers = { 'x-apisports-key': key }

  const [standRes, fixRes] = await Promise.all([
    httpJson(`${base}/standings?league=${league}&season=${season}`, headers),
    httpJson(`${base}/fixtures?league=${league}&season=${season}`, headers),
  ])

  // Standings: response[0].league.standings is an array of group tables
  const groupTables = standRes.response?.[0]?.league?.standings || []
  const standings = groupTables.map(table => {
    const letter = (table[0]?.group || '').replace(/group/i, '').trim().toUpperCase()
    return {
      group: `GROUP_${letter}`,
      table: table.map(r => ({
        position: r.rank,
        team: { name: r.team?.name },
        points: r.points ?? 0,
        goalDifference: r.goalsDiff ?? 0,
        goalsFor: r.all?.goals?.for ?? 0,
        playedGames: r.all?.played ?? 0,
      })),
    }
  })

  const FINISHED = new Set(['FT', 'AET', 'PEN'])
  const matches = (fixRes.response || []).map(f => {
    const home = f.teams?.home
    const away = f.teams?.away
    let winner = null
    if (home?.winner === true) winner = 'HOME_TEAM'
    else if (away?.winner === true) winner = 'AWAY_TEAM'
    return {
      stage: apiFootballStage(f.league?.round),
      status: FINISHED.has(f.fixture?.status?.short) ? 'FINISHED' : (f.fixture?.status?.short || ''),
      homeTeam: { name: home?.name },
      awayTeam: { name: away?.name },
      score: { winner },
    }
  })

  return { standings, matches }
}

// ---- provider selection ----
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

// =====================================================================
// Processing — shared across providers
// =====================================================================

// ---- group standings → results ----
export function processGroups(db, standings, summary) {
  const thirdPlace = [] // { letter, team, points, gd, gf }
  const standingByGroup = {}
  for (const s of standings) {
    if (!s.group) continue
    standingByGroup[s.group.replace('GROUP_', '')] = s.table
  }

  for (const [letter, table] of Object.entries(standingByGroup)) {
    // A 4-team group is complete once everyone has played 3 games.
    const complete = table.length >= 3 && table.every(t => (t.playedGames ?? 0) >= 3)
    if (!complete) continue
    db.upsertMatchResult({
      match_id: `group_result_${letter}`,
      home_team: mapTeam(table[0]?.team?.name),
      away_team: mapTeam(table[1]?.team?.name),
      winner: mapTeam(table[2]?.team?.name),
      round: 'Group', third_advanced: false, // set below once we know the 8 best
    })
    summary.groups.push(letter)
    const third = mapTeam(table[2]?.team?.name)
    if (third) thirdPlace.push({
      letter, team: third,
      points: table[2].points ?? 0, gd: table[2].goalDifference ?? 0, gf: table[2].goalsFor ?? 0,
    })
  }

  // Once all 12 third-place teams are known, rank them and mark the best 8.
  if (thirdPlace.length === 12) {
    const ranked = [...thirdPlace].sort((a, b) =>
      b.points - a.points || b.gd - a.gd || b.gf - a.gf)
    const advancing = new Set(ranked.slice(0, 8).map(t => t.letter))
    for (const t of thirdPlace) {
      const r = standingByGroup[t.letter]
      db.upsertMatchResult({
        match_id: `group_result_${t.letter}`,
        home_team: mapTeam(r[0]?.team?.name),
        away_team: mapTeam(r[1]?.team?.name),
        winner: t.team, round: 'Group',
        third_advanced: advancing.has(t.letter),
      })
    }
    summary.thirdsRanked = [...advancing]
  }
}

// ---- knockout matches → results ----
function resolveSide(side, groupResults, koResults) {
  if (typeof side === 'string') {
    if (side.startsWith('3RD:')) return { wildcard: true, allowed: side.slice(4).split('') }
    const pos = side[0], g = side[1]
    const gr = groupResults[g]
    return { team: gr ? (pos === '1' ? gr.first : gr.second) : null }
  }
  if (side && side.win) return { team: koResults[side.win]?.winner || null }
  return { team: null }
}

function apiWinner(match) {
  const w = match.score?.winner
  if (w === 'HOME_TEAM') return mapTeam(match.homeTeam?.name)
  if (w === 'AWAY_TEAM') return mapTeam(match.awayTeam?.name)
  return null
}

export function processKnockout(db, matches, summary) {
  const apiByRound = {}
  for (const m of matches) {
    const round = STAGE_TO_ROUND[m.stage]
    if (!round || m.status !== 'FINISHED') continue
    const home = mapTeam(m.homeTeam?.name)
    const away = mapTeam(m.awayTeam?.name)
    if (!home || !away) continue
    ;(apiByRound[round] ||= []).push({ home, away, winner: apiWinner(m), consumed: false })
  }

  const reread = () => {
    const groupResults = {}
    for (const row of db.getGroupResults()) {
      if (row.match_id.startsWith('group_result_')) {
        groupResults[row.match_id.replace('group_result_', '')] =
          { first: row.home_team, second: row.away_team, third: row.winner }
      }
    }
    const koResults = {}
    for (const row of db.getKnockoutResults()) koResults[row.match_id] = { winner: row.winner }
    return { groupResults, koResults }
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
        const wild = hs.wildcard ? hs : as
        if (!known.team || !teams.includes(known.team)) return false
        const other = teams.find(t => t !== known.team)
        return other && wild.allowed.includes(TEAM_GROUP[other])
      })

      if (cand && cand.winner) {
        cand.consumed = true
        db.upsertMatchResult({
          match_id: M.id, home_team: cand.home, away_team: cand.away,
          winner: cand.winner, round: M.round,
        })
        summary.knockout.push(M.id)
      } else if (candidates.some(c => !c.consumed)) {
        summary.unmatched.push(`${M.id} (${round})`)
      }
    }
  }
}

export async function runResultsSync(db) {
  if (!isConfigured()) {
    throw new Error(`${activeProvider()} provider is not configured — set its API key to enable auto-fetch.`)
  }
  const summary = {
    provider: activeProvider(),
    groups: [], knockout: [], unmatched: [], thirdsRanked: null,
    at: new Date().toISOString(),
  }
  const { standings, matches } = await fetchFromProvider()
  processGroups(db, standings, summary)
  processKnockout(db, matches, summary)
  return summary
}
