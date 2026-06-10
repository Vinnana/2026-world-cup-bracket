/**
 * One-time seeder for pdai's group-stage picks.
 * Runs on every server startup but skips if all 72 picks already exist.
 *
 * IMPORTANT: match_id values here are our SYSTEM IDs (m1–m72, sequential
 * per group), NOT the FIFA schedule numbers from pdai's submission sheet.
 * Every pick was mapped by team name against teams.js to get the correct
 * home/away assignment. home_goals = goals scored by the HOME team in our
 * system; away_goals = goals scored by the AWAY team.
 *
 * System match ordering per group (t1,t2,t3,t4 from teams.js):
 *   base+0: t1 v t2   base+1: t3 v t4
 *   base+2: t1 v t3   base+3: t2 v t4
 *   base+4: t1 v t4   base+5: t2 v t3
 */

const PICKS = [
  // ── Group A  (base=1) ──────────────────────────────────────────────────────
  // t1=Mexico  t2=South Africa  t3=Korea Republic  t4=Czechia
  { match_id: 'm1', home_goals: 2, away_goals: 1 }, // m1  Mexico       vs South Africa   pdai: Mexico 2–1 South Africa
  { match_id: 'm2', home_goals: 2, away_goals: 0 }, // m2  Korea Rep.   vs Czechia        pdai: South Korea 2–0 Czechia
  { match_id: 'm3', home_goals: 1, away_goals: 1 }, // m3  Mexico       vs Korea Rep.     pdai: Mexico 1–1 South Korea
  { match_id: 'm4', home_goals: 1, away_goals: 1 }, // m4  South Africa vs Czechia        pdai: Czechia 1–1 South Africa
  { match_id: 'm5', home_goals: 2, away_goals: 0 }, // m5  Mexico       vs Czechia        pdai: Czechia 0–2 Mexico
  { match_id: 'm6', home_goals: 1, away_goals: 1 }, // m6  South Africa vs Korea Rep.     pdai: South Africa 1–1 South Korea

  // ── Group B  (base=7) ──────────────────────────────────────────────────────
  // t1=Canada  t2=Bosnia and Herzegovina  t3=Qatar  t4=Switzerland
  { match_id: 'm7',  home_goals: 1, away_goals: 1 }, // m7  Canada  vs Bosnia & Herz.  pdai: Canada 1–1 Bosnia & Herz.
  { match_id: 'm8',  home_goals: 0, away_goals: 2 }, // m8  Qatar   vs Switzerland    pdai: Qatar 0–2 Switzerland
  { match_id: 'm9',  home_goals: 2, away_goals: 1 }, // m9  Canada  vs Qatar          pdai: Canada 2–1 Qatar
  { match_id: 'm10', home_goals: 1, away_goals: 2 }, // m10 Bosnia  vs Switzerland    pdai: Switzerland 2–1 Bosnia (away wins)
  { match_id: 'm11', home_goals: 1, away_goals: 1 }, // m11 Canada  vs Switzerland    pdai: Switzerland 1–1 Canada
  { match_id: 'm12', home_goals: 2, away_goals: 1 }, // m12 Bosnia  vs Qatar          pdai: Bosnia 2–1 Qatar

  // ── Group C  (base=13) ─────────────────────────────────────────────────────
  // t1=Brazil  t2=Morocco  t3=Haiti  t4=Scotland
  { match_id: 'm13', home_goals: 2, away_goals: 1 }, // m13 Brazil   vs Morocco  pdai: Brazil 2–1 Morocco
  { match_id: 'm14', home_goals: 0, away_goals: 1 }, // m14 Haiti    vs Scotland  pdai: Haiti 0–1 Scotland
  { match_id: 'm15', home_goals: 2, away_goals: 0 }, // m15 Brazil   vs Haiti     pdai: Brazil 2–0 Haiti
  { match_id: 'm16', home_goals: 2, away_goals: 0 }, // m16 Morocco  vs Scotland  pdai: Scotland 0–2 Morocco (away wins)
  { match_id: 'm17', home_goals: 3, away_goals: 0 }, // m17 Brazil   vs Scotland  pdai: Scotland 0–3 Brazil (away wins)
  { match_id: 'm18', home_goals: 2, away_goals: 0 }, // m18 Morocco  vs Haiti     pdai: Morocco 2–0 Haiti

  // ── Group D  (base=19) ─────────────────────────────────────────────────────
  // t1=United States  t2=Paraguay  t3=Australia  t4=Türkiye
  { match_id: 'm19', home_goals: 2, away_goals: 0 }, // m19 USA       vs Paraguay  pdai: USA 2–0 Paraguay
  { match_id: 'm20', home_goals: 1, away_goals: 1 }, // m20 Australia vs Türkiye   pdai: Australia 1–1 Turkey
  { match_id: 'm21', home_goals: 1, away_goals: 1 }, // m21 USA       vs Australia pdai: USA 1–1 Australia
  { match_id: 'm22', home_goals: 1, away_goals: 2 }, // m22 Paraguay  vs Türkiye   pdai: Turkey 2–1 Paraguay (away wins)
  { match_id: 'm23', home_goals: 2, away_goals: 1 }, // m23 USA       vs Türkiye   pdai: Turkey 1–2 USA (away wins)
  { match_id: 'm24', home_goals: 1, away_goals: 1 }, // m24 Paraguay  vs Australia pdai: Paraguay 1–1 Australia

  // ── Group E  (base=25) ─────────────────────────────────────────────────────
  // t1=Germany  t2=Curaçao  t3=Ivory Coast  t4=Ecuador
  { match_id: 'm25', home_goals: 2, away_goals: 1 }, // m25 Germany      vs Curaçao      pdai: Germany 2–1 Curacao
  { match_id: 'm26', home_goals: 1, away_goals: 1 }, // m26 Ivory Coast  vs Ecuador      pdai: Ivory Coast 1–1 Ecuador
  { match_id: 'm27', home_goals: 2, away_goals: 1 }, // m27 Germany      vs Ivory Coast  pdai: Germany 2–1 Ivory Coast
  { match_id: 'm28', home_goals: 0, away_goals: 2 }, // m28 Curaçao      vs Ecuador      pdai: Ecuador 2–0 Curacao (away wins)
  { match_id: 'm29', home_goals: 1, away_goals: 1 }, // m29 Germany      vs Ecuador      pdai: Ecuador 1–1 Germany
  { match_id: 'm30', home_goals: 1, away_goals: 2 }, // m30 Curaçao      vs Ivory Coast  pdai: Curacao 1–2 Ivory Coast

  // ── Group F  (base=31) ─────────────────────────────────────────────────────
  // t1=Netherlands  t2=Japan  t3=Sweden  t4=Tunisia
  { match_id: 'm31', home_goals: 2, away_goals: 1 }, // m31 Netherlands vs Japan    pdai: Netherlands 2–1 Japan
  { match_id: 'm32', home_goals: 1, away_goals: 0 }, // m32 Sweden      vs Tunisia  pdai: Sweden 1–0 Tunisia
  { match_id: 'm33', home_goals: 2, away_goals: 1 }, // m33 Netherlands vs Sweden   pdai: Netherlands 2–1 Sweden
  { match_id: 'm34', home_goals: 1, away_goals: 0 }, // m34 Japan       vs Tunisia  pdai: Tunisia 0–1 Japan (away wins)
  { match_id: 'm35', home_goals: 2, away_goals: 1 }, // m35 Netherlands vs Tunisia  pdai: Tunisia 1–2 Netherlands (away wins)
  { match_id: 'm36', home_goals: 1, away_goals: 0 }, // m36 Japan       vs Sweden   pdai: Japan 1–0 Sweden

  // ── Group G  (base=37) ─────────────────────────────────────────────────────
  // t1=Belgium  t2=Egypt  t3=Iran  t4=New Zealand
  { match_id: 'm37', home_goals: 2, away_goals: 1 }, // m37 Belgium     vs Egypt       pdai: Belgium 2–1 Egypt
  { match_id: 'm38', home_goals: 1, away_goals: 1 }, // m38 Iran        vs New Zealand pdai: Iran 1–1 New Zealand
  { match_id: 'm39', home_goals: 1, away_goals: 1 }, // m39 Belgium     vs Iran        pdai: Belgium 1–1 Iran
  { match_id: 'm40', home_goals: 1, away_goals: 0 }, // m40 Egypt       vs New Zealand pdai: New Zealand 0–1 Egypt (away wins)
  { match_id: 'm41', home_goals: 2, away_goals: 0 }, // m41 Belgium     vs New Zealand pdai: New Zealand 0–2 Belgium (away wins)
  { match_id: 'm42', home_goals: 1, away_goals: 1 }, // m42 Egypt       vs Iran        pdai: Egypt 1–1 Iran

  // ── Group H  (base=43) ─────────────────────────────────────────────────────
  // t1=Spain  t2=Cape Verde  t3=Saudi Arabia  t4=Uruguay
  { match_id: 'm43', home_goals: 3, away_goals: 0 }, // m43 Spain        vs Cape Verde   pdai: Spain 3–0 Cape Verde
  { match_id: 'm44', home_goals: 0, away_goals: 2 }, // m44 Saudi Arabia vs Uruguay      pdai: Saudi Arabia 0–2 Uruguay
  { match_id: 'm45', home_goals: 2, away_goals: 1 }, // m45 Spain        vs Saudi Arabia pdai: Spain 2–1 Saudi Arabia
  { match_id: 'm46', home_goals: 0, away_goals: 2 }, // m46 Cape Verde   vs Uruguay      pdai: Uruguay 2–0 Cape Verde (away wins)
  { match_id: 'm47', home_goals: 2, away_goals: 1 }, // m47 Spain        vs Uruguay      pdai: Uruguay 1–2 Spain (away wins)
  { match_id: 'm48', home_goals: 0, away_goals: 2 }, // m48 Cape Verde   vs Saudi Arabia pdai: Cape Verde 0–2 Saudi Arabia

  // ── Group I  (base=49) ─────────────────────────────────────────────────────
  // t1=France  t2=Senegal  t3=Iraq  t4=Norway
  { match_id: 'm49', home_goals: 2, away_goals: 1 }, // m49 France   vs Senegal pdai: France 2–1 Senegal
  { match_id: 'm50', home_goals: 0, away_goals: 2 }, // m50 Iraq     vs Norway  pdai: Iraq 0–2 Norway
  { match_id: 'm51', home_goals: 2, away_goals: 0 }, // m51 France   vs Iraq    pdai: France 2–0 Iraq
  { match_id: 'm52', home_goals: 1, away_goals: 2 }, // m52 Senegal  vs Norway  pdai: Norway 2–1 Senegal (away wins)
  { match_id: 'm53', home_goals: 1, away_goals: 2 }, // m53 France   vs Norway  pdai: Norway 2–1 France (away wins)
  { match_id: 'm54', home_goals: 3, away_goals: 0 }, // m54 Senegal  vs Iraq    pdai: Senegal 3–0 Iraq

  // ── Group J  (base=55) ─────────────────────────────────────────────────────
  // t1=Argentina  t2=Algeria  t3=Austria  t4=Jordan
  { match_id: 'm55', home_goals: 3, away_goals: 0 }, // m55 Argentina vs Algeria pdai: Argentina 3–0 Algeria
  { match_id: 'm56', home_goals: 2, away_goals: 1 }, // m56 Austria   vs Jordan  pdai: Austria 2–1 Jordan
  { match_id: 'm57', home_goals: 2, away_goals: 1 }, // m57 Argentina vs Austria pdai: Argentina 2–1 Austria
  { match_id: 'm58', home_goals: 1, away_goals: 0 }, // m58 Algeria   vs Jordan  pdai: Jordan 0–1 Algeria (away wins)
  { match_id: 'm59', home_goals: 3, away_goals: 0 }, // m59 Argentina vs Jordan  pdai: Jordan 0–3 Argentina (away wins)
  { match_id: 'm60', home_goals: 0, away_goals: 2 }, // m60 Algeria   vs Austria pdai: Algeria 0–2 Austria

  // ── Group K  (base=61) ─────────────────────────────────────────────────────
  // t1=Portugal  t2=DR Congo  t3=Uzbekistan  t4=Colombia
  { match_id: 'm61', home_goals: 2, away_goals: 0 }, // m61 Portugal   vs DR Congo   pdai: Portugal 2–0 DR Congo
  { match_id: 'm62', home_goals: 0, away_goals: 2 }, // m62 Uzbekistan vs Colombia   pdai: Uzbekistan 0–2 Colombia
  { match_id: 'm63', home_goals: 1, away_goals: 1 }, // m63 Portugal   vs Uzbekistan pdai: Portugal 1–1 Uzbekistan
  { match_id: 'm64', home_goals: 1, away_goals: 2 }, // m64 DR Congo   vs Colombia   pdai: Colombia 2–1 DR Congo (away wins)
  { match_id: 'm65', home_goals: 1, away_goals: 1 }, // m65 Portugal   vs Colombia   pdai: Colombia 1–1 Portugal
  { match_id: 'm66', home_goals: 1, away_goals: 1 }, // m66 DR Congo   vs Uzbekistan pdai: DR Congo 1–1 Uzbekistan

  // ── Group L  (base=67) ─────────────────────────────────────────────────────
  // t1=England  t2=Croatia  t3=Ghana  t4=Panama
  { match_id: 'm67', home_goals: 2, away_goals: 0 }, // m67 England vs Croatia pdai: England 2–0 Croatia
  { match_id: 'm68', home_goals: 1, away_goals: 1 }, // m68 Ghana   vs Panama  pdai: Ghana 1–1 Panama
  { match_id: 'm69', home_goals: 3, away_goals: 0 }, // m69 England vs Ghana   pdai: England 3–0 Ghana
  { match_id: 'm70', home_goals: 2, away_goals: 1 }, // m70 Croatia vs Panama  pdai: Panama 1–2 Croatia (away wins)
  { match_id: 'm71', home_goals: 2, away_goals: 0 }, // m71 England vs Panama  pdai: Panama 0–2 England (away wins)
  { match_id: 'm72', home_goals: 2, away_goals: 1 }, // m72 Croatia vs Ghana   pdai: Croatia 2–1 Ghana
]

export async function seedPdaiPicks(db) {
  const user = db.getUserByUsername('pdai')
  if (!user) {
    console.log('[seed:pdai] User "pdai" not found — will retry on next restart once they register')
    return
  }

  const existing = db.getScorePicksByUser(user.id)

  if (existing.length === PICKS.length) {
    console.log(`[seed:pdai] Already has all ${PICKS.length} picks — skipping`)
    return
  }

  // Incomplete or stale — clear and re-seed the full correct set
  if (existing.length > 0) {
    console.log(`[seed:pdai] Found ${existing.length}/${PICKS.length} picks — clearing and re-seeding with corrected data`)
    db.deletePicksByUser(user.id)
  }

  for (const pick of PICKS) {
    db.upsertScorePick(user.id, pick.match_id, pick.home_goals, pick.away_goals)
  }

  console.log(`[seed:pdai] Seeded ${PICKS.length} picks for "${user.username}" (id ${user.id})`)
}
