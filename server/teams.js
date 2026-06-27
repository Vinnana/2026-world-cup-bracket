// 2026 FIFA World Cup — 48 teams, 12 groups
// Verify group assignments at fifa.com and update if needed

export const GROUPS = {
  A: { teams: ['Mexico', 'South Africa', 'Korea Republic', 'Czechia'] },
  B: { teams: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'] },
  C: { teams: ['Brazil', 'Morocco', 'Haiti', 'Scotland'] },
  D: { teams: ['United States', 'Paraguay', 'Australia', 'Türkiye'] },
  E: { teams: ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'] },
  F: { teams: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'] },
  G: { teams: ['Belgium', 'Egypt', 'Iran', 'New Zealand'] },
  H: { teams: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'] },
  I: { teams: ['France', 'Senegal', 'Iraq', 'Norway'] },
  J: { teams: ['Argentina', 'Algeria', 'Austria', 'Jordan'] },
  K: { teams: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'] },
  L: { teams: ['England', 'Croatia', 'Ghana', 'Panama'] },
}

// Round display order
export const ROUNDS = [
  { key: 'R32', label: 'Round of 32' },
  { key: 'R16', label: 'Round of 16' },
  { key: 'QF', label: 'Quarter-finals' },
  { key: 'SF', label: 'Semi-finals' },
  { key: 'Third', label: '3rd Place' },
  { key: 'Final', label: 'Final' },
]

// Official 2026 World Cup knockout bracket (ESPN / FIFA match numbers 73–104).
// Single source of truth for both the API and the UI.
//
// A side ("home"/"away") is either:
//   • a group-position slot string: '1A' (Group A winner), '2B' (Group B runner-up)
//   • a 3rd-place wildcard: '3RD:ABCDF' (one of the 8 best 3rd-place teams; assigned
//     by FIFA only after the group stage, so it can't be predicted in advance)
//   • a reference to a prior match winner: { win: 'm73' }
//
// `next` / `slot` describe where this match's winner advances.
export const KNOCKOUT = [
  // ---- Round of 32 (matches 73–88) ----
  { id: 'm73', no: 73, round: 'R32', home: '2A',         away: '2B',          next: 'm90',  slot: 'home' },
  { id: 'm74', no: 74, round: 'R32', home: '1E',         away: '3RD:ABCDF',   next: 'm89',  slot: 'home' },
  { id: 'm75', no: 75, round: 'R32', home: '1F',         away: '2C',          next: 'm90',  slot: 'away' },
  { id: 'm76', no: 76, round: 'R32', home: '1C',         away: '2F',          next: 'm91',  slot: 'home' },
  { id: 'm77', no: 77, round: 'R32', home: '1I',         away: '3RD:CDFGH',   next: 'm89',  slot: 'away' },
  { id: 'm78', no: 78, round: 'R32', home: '2E',         away: '2I',          next: 'm91',  slot: 'away' },
  { id: 'm79', no: 79, round: 'R32', home: '1A',         away: '3RD:CEFHI',   next: 'm92',  slot: 'home' },
  { id: 'm80', no: 80, round: 'R32', home: '1L',         away: '3RD:EHIJK',   next: 'm92',  slot: 'away' },
  { id: 'm81', no: 81, round: 'R32', home: '1D',         away: '3RD:BEFIJ',   next: 'm94',  slot: 'home' },
  { id: 'm82', no: 82, round: 'R32', home: '1G',         away: '3RD:AEHIJ',   next: 'm94',  slot: 'away' },
  { id: 'm83', no: 83, round: 'R32', home: '2K',         away: '2L',          next: 'm93',  slot: 'home' },
  { id: 'm84', no: 84, round: 'R32', home: '1H',         away: '2J',          next: 'm93',  slot: 'away' },
  { id: 'm85', no: 85, round: 'R32', home: '1B',         away: '3RD:EFGIJ',   next: 'm96',  slot: 'home' },
  { id: 'm86', no: 86, round: 'R32', home: '1J',         away: '2H',          next: 'm95',  slot: 'home' },
  { id: 'm87', no: 87, round: 'R32', home: '1K',         away: '3RD:DEIJL',   next: 'm96',  slot: 'away' },
  { id: 'm88', no: 88, round: 'R32', home: '2D',         away: '2G',          next: 'm95',  slot: 'away' },

  // ---- Round of 16 (matches 89–96) ----
  { id: 'm89', no: 89, round: 'R16', home: { win: 'm74' }, away: { win: 'm77' }, next: 'm97',  slot: 'home' },
  { id: 'm90', no: 90, round: 'R16', home: { win: 'm73' }, away: { win: 'm75' }, next: 'm97',  slot: 'away' },
  { id: 'm91', no: 91, round: 'R16', home: { win: 'm76' }, away: { win: 'm78' }, next: 'm99',  slot: 'home' },
  { id: 'm92', no: 92, round: 'R16', home: { win: 'm79' }, away: { win: 'm80' }, next: 'm99',  slot: 'away' },
  { id: 'm93', no: 93, round: 'R16', home: { win: 'm83' }, away: { win: 'm84' }, next: 'm98',  slot: 'home' },
  { id: 'm94', no: 94, round: 'R16', home: { win: 'm81' }, away: { win: 'm82' }, next: 'm98',  slot: 'away' },
  { id: 'm95', no: 95, round: 'R16', home: { win: 'm86' }, away: { win: 'm88' }, next: 'm100', slot: 'home' },
  { id: 'm96', no: 96, round: 'R16', home: { win: 'm85' }, away: { win: 'm87' }, next: 'm100', slot: 'away' },

  // ---- Quarter-finals (matches 97–100) ----
  { id: 'm97',  no: 97,  round: 'QF', home: { win: 'm89' }, away: { win: 'm90' }, next: 'm101', slot: 'home' },
  { id: 'm98',  no: 98,  round: 'QF', home: { win: 'm93' }, away: { win: 'm94' }, next: 'm101', slot: 'away' },
  { id: 'm99',  no: 99,  round: 'QF', home: { win: 'm91' }, away: { win: 'm92' }, next: 'm102', slot: 'home' },
  { id: 'm100', no: 100, round: 'QF', home: { win: 'm95' }, away: { win: 'm96' }, next: 'm102', slot: 'away' },

  // ---- Semi-finals (matches 101–102) ----
  { id: 'm101', no: 101, round: 'SF', home: { win: 'm97' }, away: { win: 'm98' },  next: 'm104', slot: 'home' },
  { id: 'm102', no: 102, round: 'SF', home: { win: 'm99' }, away: { win: 'm100' }, next: 'm104', slot: 'away' },

  // ---- 3rd Place Playoff (match 103) ----
  { id: 'm103', no: 103, round: 'Third', home: { lose: 'm101' }, away: { lose: 'm102' }, next: null, slot: null },

  // ---- Final (match 104) ----
  { id: 'm104', no: 104, round: 'Final', home: { win: 'm101' }, away: { win: 'm102' }, next: null, slot: null },
]

export const SCORING = {
  group_first: 3,
  group_second: 2,
  group_third: 1,
  r32: 2,
  r16: 3,
  qf: 4,
  sf: 5,
  final_winner: 8,
  final_runnerup: 3,
}
