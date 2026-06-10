/**
 * One-time seeder for pdai's group-stage picks.
 * Runs on every server startup but skips if picks already exist.
 */

// All 72 group-stage picks for pdai.
// match_id = "m" + match number from schedule; home_goals / away_goals follow
// the same Team 1 / Team 2 order as the original submission.
const PICKS = [
  // ── Group A ──
  { match_id: 'm1',  home_goals: 2, away_goals: 1 }, // Mexico 2-1 South Africa
  { match_id: 'm2',  home_goals: 2, away_goals: 0 }, // South Korea 2-0 Czechia
  { match_id: 'm25', home_goals: 1, away_goals: 1 }, // Czechia 1-1 South Africa
  { match_id: 'm28', home_goals: 1, away_goals: 1 }, // Mexico 1-1 South Korea
  { match_id: 'm53', home_goals: 0, away_goals: 2 }, // Czechia 0-2 Mexico
  { match_id: 'm54', home_goals: 1, away_goals: 1 }, // South Africa 1-1 South Korea

  // ── Group B ──
  { match_id: 'm3',  home_goals: 1, away_goals: 1 }, // Canada 1-1 Bosnia and Herzegovina
  { match_id: 'm5',  home_goals: 0, away_goals: 2 }, // Qatar 0-2 Switzerland
  { match_id: 'm26', home_goals: 2, away_goals: 1 }, // Switzerland 2-1 Bosnia and Herzegovina
  { match_id: 'm27', home_goals: 2, away_goals: 1 }, // Canada 2-1 Qatar
  { match_id: 'm49', home_goals: 1, away_goals: 1 }, // Switzerland 1-1 Canada
  { match_id: 'm50', home_goals: 2, away_goals: 1 }, // Bosnia and Herzegovina 2-1 Qatar

  // ── Group C ──
  { match_id: 'm6',  home_goals: 2, away_goals: 1 }, // Brazil 2-1 Morocco
  { match_id: 'm7',  home_goals: 0, away_goals: 1 }, // Haiti 0-1 Scotland
  { match_id: 'm30', home_goals: 0, away_goals: 2 }, // Scotland 0-2 Morocco
  { match_id: 'm31', home_goals: 2, away_goals: 0 }, // Brazil 2-0 Haiti
  { match_id: 'm51', home_goals: 2, away_goals: 0 }, // Morocco 2-0 Haiti
  { match_id: 'm52', home_goals: 0, away_goals: 3 }, // Scotland 0-3 Brazil

  // ── Group D ──
  { match_id: 'm4',  home_goals: 2, away_goals: 0 }, // United States 2-0 Paraguay
  { match_id: 'm8',  home_goals: 1, away_goals: 1 }, // Australia 1-1 Turkey
  { match_id: 'm29', home_goals: 1, away_goals: 1 }, // United States 1-1 Australia
  { match_id: 'm32', home_goals: 2, away_goals: 1 }, // Turkey 2-1 Paraguay
  { match_id: 'm59', home_goals: 1, away_goals: 2 }, // Turkey 1-2 United States
  { match_id: 'm60', home_goals: 1, away_goals: 1 }, // Paraguay 1-1 Australia

  // ── Group E ──
  { match_id: 'm9',  home_goals: 2, away_goals: 1 }, // Germany 2-1 Curacao
  { match_id: 'm11', home_goals: 1, away_goals: 1 }, // Ivory Coast 1-1 Ecuador
  { match_id: 'm34', home_goals: 2, away_goals: 1 }, // Germany 2-1 Ivory Coast
  { match_id: 'm35', home_goals: 2, away_goals: 0 }, // Ecuador 2-0 Curacao
  { match_id: 'm55', home_goals: 1, away_goals: 2 }, // Curacao 1-2 Ivory Coast
  { match_id: 'm56', home_goals: 1, away_goals: 1 }, // Ecuador 1-1 Germany

  // ── Group F ──
  { match_id: 'm10', home_goals: 2, away_goals: 1 }, // Netherlands 2-1 Japan
  { match_id: 'm12', home_goals: 1, away_goals: 0 }, // Sweden 1-0 Tunisia
  { match_id: 'm33', home_goals: 2, away_goals: 1 }, // Netherlands 2-1 Sweden
  { match_id: 'm36', home_goals: 0, away_goals: 1 }, // Tunisia 0-1 Japan
  { match_id: 'm57', home_goals: 1, away_goals: 2 }, // Tunisia 1-2 Netherlands
  { match_id: 'm58', home_goals: 1, away_goals: 0 }, // Japan 1-0 Sweden

  // ── Group G ──
  { match_id: 'm14', home_goals: 2, away_goals: 1 }, // Belgium 2-1 Egypt
  { match_id: 'm16', home_goals: 1, away_goals: 1 }, // Iran 1-1 New Zealand
  { match_id: 'm38', home_goals: 1, away_goals: 1 }, // Belgium 1-1 Iran
  { match_id: 'm40', home_goals: 0, away_goals: 1 }, // New Zealand 0-1 Egypt
  { match_id: 'm65', home_goals: 0, away_goals: 2 }, // New Zealand 0-2 Belgium
  { match_id: 'm66', home_goals: 1, away_goals: 1 }, // Egypt 1-1 Iran

  // ── Group H ──
  { match_id: 'm13', home_goals: 3, away_goals: 0 }, // Spain 3-0 Cape Verde
  { match_id: 'm15', home_goals: 0, away_goals: 2 }, // Saudi Arabia 0-2 Uruguay
  { match_id: 'm37', home_goals: 2, away_goals: 1 }, // Spain 2-1 Saudi Arabia
  { match_id: 'm39', home_goals: 2, away_goals: 0 }, // Uruguay 2-0 Cape Verde
  { match_id: 'm63', home_goals: 0, away_goals: 2 }, // Cape Verde 0-2 Saudi Arabia
  { match_id: 'm64', home_goals: 1, away_goals: 2 }, // Uruguay 1-2 Spain

  // ── Group I ──
  { match_id: 'm17', home_goals: 2, away_goals: 1 }, // France 2-1 Senegal
  { match_id: 'm18', home_goals: 0, away_goals: 2 }, // Iraq 0-2 Norway
  { match_id: 'm42', home_goals: 2, away_goals: 0 }, // France 2-0 Iraq
  { match_id: 'm43', home_goals: 2, away_goals: 1 }, // Norway 2-1 Senegal
  { match_id: 'm61', home_goals: 2, away_goals: 1 }, // Norway 2-1 France
  { match_id: 'm62', home_goals: 3, away_goals: 0 }, // Senegal 3-0 Iraq

  // ── Group J ──
  { match_id: 'm19', home_goals: 3, away_goals: 0 }, // Argentina 3-0 Algeria
  { match_id: 'm20', home_goals: 2, away_goals: 1 }, // Austria 2-1 Jordan
  { match_id: 'm41', home_goals: 2, away_goals: 1 }, // Argentina 2-1 Austria
  { match_id: 'm44', home_goals: 0, away_goals: 1 }, // Jordan 0-1 Algeria
  { match_id: 'm71', home_goals: 0, away_goals: 2 }, // Algeria 0-2 Austria
  { match_id: 'm72', home_goals: 0, away_goals: 3 }, // Jordan 0-3 Argentina

  // ── Group K ──
  { match_id: 'm21', home_goals: 2, away_goals: 0 }, // Portugal 2-0 DR Congo
  { match_id: 'm24', home_goals: 0, away_goals: 2 }, // Uzbekistan 0-2 Colombia
  { match_id: 'm45', home_goals: 1, away_goals: 1 }, // Portugal 1-1 Uzbekistan
  { match_id: 'm48', home_goals: 2, away_goals: 1 }, // Colombia 2-1 DR Congo
  { match_id: 'm69', home_goals: 1, away_goals: 1 }, // Colombia 1-1 Portugal
  { match_id: 'm70', home_goals: 1, away_goals: 1 }, // DR Congo 1-1 Uzbekistan

  // ── Group L ──
  { match_id: 'm22', home_goals: 2, away_goals: 0 }, // England 2-0 Croatia
  { match_id: 'm23', home_goals: 1, away_goals: 1 }, // Ghana 1-1 Panama
  { match_id: 'm46', home_goals: 3, away_goals: 0 }, // England 3-0 Ghana
  { match_id: 'm47', home_goals: 1, away_goals: 2 }, // Panama 1-2 Croatia
  { match_id: 'm67', home_goals: 0, away_goals: 2 }, // Panama 0-2 England
  { match_id: 'm68', home_goals: 2, away_goals: 1 }, // Croatia 2-1 Ghana
]

export async function seedPdaiPicks(db) {
  const user = db.getUserByUsername('pdai')
  if (!user) {
    console.log('[seed:pdai] User "pdai" not found — skipping (will retry on next restart once they register)')
    return
  }

  const existing = db.getScorePicksByUser(user.id)

  if (existing.length === PICKS.length) {
    console.log(`[seed:pdai] Already has all ${PICKS.length} picks — skipping`)
    return
  }

  // Incomplete or empty — clear whatever is there and re-seed the full set
  if (existing.length > 0) {
    console.log(`[seed:pdai] Found only ${existing.length}/${PICKS.length} picks — clearing and re-seeding`)
    db.deletePicksByUser(user.id)
  }

  for (const pick of PICKS) {
    db.upsertScorePick(user.id, pick.match_id, pick.home_goals, pick.away_goals)
  }

  console.log(`[seed:pdai] Seeded ${PICKS.length} picks for user "${user.username}" (id ${user.id})`)
}
