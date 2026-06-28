/**
 * One-time seeder for pdai's group-stage picks.
 * Runs on every server startup; re-seeds when SEED_VERSION changes.
 *
 * home_goals / away_goals are stored relative to ALL_MATCHES home/away order.
 * 24 matches (every group's 4th and 5th fixture) have home/away swapped vs
 * the source spreadsheet — goals for those matches are transposed accordingly.
 */

const SEED_VERSION = '2'   // bump this whenever picks data changes

const PICKS = [
  // ── Group A  (m1=Mex-SA, m2=Kor-Cze, m3=Mex-Kor, m4=Cze-SA, m5=Cze-Mex, m6=SA-Kor)
  { match_id: 'm1',  home_goals: 2, away_goals: 1 }, // Mexico 2–1 South Africa
  { match_id: 'm2',  home_goals: 2, away_goals: 0 }, // Korea Republic 2–0 Czechia
  { match_id: 'm3',  home_goals: 1, away_goals: 1 }, // Mexico 1–1 Korea Republic
  { match_id: 'm4',  home_goals: 1, away_goals: 1 }, // Czechia 1–1 South Africa
  { match_id: 'm5',  home_goals: 0, away_goals: 2 }, // Czechia 0–2 Mexico  (sheet: Mexico 2–0 Czechia, flipped)
  { match_id: 'm6',  home_goals: 1, away_goals: 1 }, // South Africa 1–1 Korea Republic

  // ── Group B  (m7=Can-Bos, m8=Qat-Swi, m9=Can-Qat, m10=Swi-Bos, m11=Swi-Can, m12=Bos-Qat)
  { match_id: 'm7',  home_goals: 1, away_goals: 1 }, // Canada 1–1 Bosnia
  { match_id: 'm8',  home_goals: 0, away_goals: 2 }, // Qatar 0–2 Switzerland
  { match_id: 'm9',  home_goals: 2, away_goals: 1 }, // Canada 2–1 Qatar
  { match_id: 'm10', home_goals: 2, away_goals: 1 }, // Switzerland 2–1 Bosnia  (sheet: Bosnia 1–2 Switzerland, flipped)
  { match_id: 'm11', home_goals: 1, away_goals: 1 }, // Switzerland 1–1 Canada  (draw, same either way)
  { match_id: 'm12', home_goals: 2, away_goals: 1 }, // Bosnia 2–1 Qatar

  // ── Group C  (m13=Bra-Mor, m14=Hai-Sco, m15=Bra-Hai, m16=Sco-Mor, m17=Sco-Bra, m18=Mor-Hai)
  { match_id: 'm13', home_goals: 2, away_goals: 1 }, // Brazil 2–1 Morocco
  { match_id: 'm14', home_goals: 0, away_goals: 1 }, // Haiti 0–1 Scotland
  { match_id: 'm15', home_goals: 2, away_goals: 0 }, // Brazil 2–0 Haiti
  { match_id: 'm16', home_goals: 0, away_goals: 2 }, // Scotland 0–2 Morocco  (sheet: Morocco 2–0 Scotland, flipped)
  { match_id: 'm17', home_goals: 0, away_goals: 3 }, // Scotland 0–3 Brazil   (sheet: Brazil 3–0 Scotland, flipped)
  { match_id: 'm18', home_goals: 2, away_goals: 0 }, // Morocco 2–0 Haiti

  // ── Group D  (m19=USA-Par, m20=Aus-Tur, m21=USA-Aus, m22=Tur-Par, m23=Tur-USA, m24=Par-Aus)
  { match_id: 'm19', home_goals: 2, away_goals: 0 }, // United States 2–0 Paraguay
  { match_id: 'm20', home_goals: 1, away_goals: 1 }, // Australia 1–1 Türkiye
  { match_id: 'm21', home_goals: 1, away_goals: 1 }, // United States 1–1 Australia
  { match_id: 'm22', home_goals: 2, away_goals: 1 }, // Türkiye 2–1 Paraguay  (sheet: Paraguay 1–2 Türkiye, flipped)
  { match_id: 'm23', home_goals: 1, away_goals: 2 }, // Türkiye 1–2 United States  (sheet: USA 2–1 Türkiye, flipped)
  { match_id: 'm24', home_goals: 1, away_goals: 1 }, // Paraguay 1–1 Australia

  // ── Group E  (m25=Ger-Cur, m26=Ivo-Ecu, m27=Ger-Ivo, m28=Ecu-Cur, m29=Ecu-Ger, m30=Cur-Ivo)
  { match_id: 'm25', home_goals: 2, away_goals: 1 }, // Germany 2–1 Curaçao
  { match_id: 'm26', home_goals: 1, away_goals: 1 }, // Ivory Coast 1–1 Ecuador
  { match_id: 'm27', home_goals: 2, away_goals: 1 }, // Germany 2–1 Ivory Coast
  { match_id: 'm28', home_goals: 2, away_goals: 0 }, // Ecuador 2–0 Curaçao  (sheet: Curaçao 0–2 Ecuador, flipped)
  { match_id: 'm29', home_goals: 1, away_goals: 1 }, // Ecuador 1–1 Germany  (draw, same either way)
  { match_id: 'm30', home_goals: 1, away_goals: 2 }, // Curaçao 1–2 Ivory Coast

  // ── Group F  (m31=Ned-Jpn, m32=Swe-Tun, m33=Ned-Swe, m34=Tun-Jpn, m35=Tun-Ned, m36=Jpn-Swe)
  { match_id: 'm31', home_goals: 2, away_goals: 1 }, // Netherlands 2–1 Japan
  { match_id: 'm32', home_goals: 1, away_goals: 0 }, // Sweden 1–0 Tunisia
  { match_id: 'm33', home_goals: 2, away_goals: 1 }, // Netherlands 2–1 Sweden
  { match_id: 'm34', home_goals: 0, away_goals: 1 }, // Tunisia 0–1 Japan  (sheet: Japan 1–0 Tunisia, flipped)
  { match_id: 'm35', home_goals: 1, away_goals: 2 }, // Tunisia 1–2 Netherlands  (sheet: Netherlands 2–1 Tunisia, flipped)
  { match_id: 'm36', home_goals: 1, away_goals: 0 }, // Japan 1–0 Sweden

  // ── Group G  (m37=Bel-Egy, m38=Ira-NZL, m39=Bel-Ira, m40=NZL-Egy, m41=NZL-Bel, m42=Egy-Ira)
  { match_id: 'm37', home_goals: 2, away_goals: 1 }, // Belgium 2–1 Egypt
  { match_id: 'm38', home_goals: 1, away_goals: 1 }, // Iran 1–1 New Zealand
  { match_id: 'm39', home_goals: 1, away_goals: 1 }, // Belgium 1–1 Iran
  { match_id: 'm40', home_goals: 0, away_goals: 1 }, // New Zealand 0–1 Egypt  (sheet: Egypt 1–0 New Zealand, flipped)
  { match_id: 'm41', home_goals: 0, away_goals: 2 }, // New Zealand 0–2 Belgium  (sheet: Belgium 2–0 New Zealand, flipped)
  { match_id: 'm42', home_goals: 1, away_goals: 1 }, // Egypt 1–1 Iran

  // ── Group H  (m43=Esp-CPV, m44=KSA-URU, m45=Esp-KSA, m46=URU-CPV, m47=URU-Esp, m48=CPV-KSA)
  { match_id: 'm43', home_goals: 3, away_goals: 0 }, // Spain 3–0 Cape Verde
  { match_id: 'm44', home_goals: 0, away_goals: 2 }, // Saudi Arabia 0–2 Uruguay
  { match_id: 'm45', home_goals: 2, away_goals: 1 }, // Spain 2–1 Saudi Arabia
  { match_id: 'm46', home_goals: 2, away_goals: 0 }, // Uruguay 2–0 Cape Verde  (sheet: Cape Verde 0–2 Uruguay, flipped)
  { match_id: 'm47', home_goals: 1, away_goals: 2 }, // Uruguay 1–2 Spain  (sheet: Spain 2–1 Uruguay, flipped)
  { match_id: 'm48', home_goals: 0, away_goals: 2 }, // Cape Verde 0–2 Saudi Arabia

  // ── Group I  (m49=Fra-Sen, m50=Ira-Nor, m51=Fra-Ira, m52=Nor-Sen, m53=Nor-Fra, m54=Sen-Ira)
  { match_id: 'm49', home_goals: 2, away_goals: 1 }, // France 2–1 Senegal
  { match_id: 'm50', home_goals: 0, away_goals: 2 }, // Iraq 0–2 Norway
  { match_id: 'm51', home_goals: 2, away_goals: 0 }, // France 2–0 Iraq
  { match_id: 'm52', home_goals: 2, away_goals: 1 }, // Norway 2–1 Senegal  (sheet: Senegal 1–2 Norway, flipped)
  { match_id: 'm53', home_goals: 2, away_goals: 1 }, // Norway 2–1 France   (sheet: France 1–2 Norway, flipped)
  { match_id: 'm54', home_goals: 3, away_goals: 0 }, // Senegal 3–0 Iraq

  // ── Group J  (m55=Arg-Alg, m56=Aut-Jor, m57=Arg-Aut, m58=Jor-Alg, m59=Jor-Arg, m60=Alg-Aut)
  { match_id: 'm55', home_goals: 3, away_goals: 0 }, // Argentina 3–0 Algeria
  { match_id: 'm56', home_goals: 2, away_goals: 1 }, // Austria 2–1 Jordan
  { match_id: 'm57', home_goals: 2, away_goals: 1 }, // Argentina 2–1 Austria
  { match_id: 'm58', home_goals: 0, away_goals: 1 }, // Jordan 0–1 Algeria  (sheet: Algeria 1–0 Jordan, flipped)
  { match_id: 'm59', home_goals: 0, away_goals: 3 }, // Jordan 0–3 Argentina  (sheet: Argentina 3–0 Jordan, flipped)
  { match_id: 'm60', home_goals: 0, away_goals: 2 }, // Algeria 0–2 Austria

  // ── Group K  (m61=Por-DRC, m62=Uzb-Col, m63=Por-Uzb, m64=Col-DRC, m65=Col-Por, m66=DRC-Uzb)
  { match_id: 'm61', home_goals: 2, away_goals: 0 }, // Portugal 2–0 DR Congo
  { match_id: 'm62', home_goals: 0, away_goals: 2 }, // Uzbekistan 0–2 Colombia
  { match_id: 'm63', home_goals: 1, away_goals: 1 }, // Portugal 1–1 Uzbekistan
  { match_id: 'm64', home_goals: 2, away_goals: 1 }, // Colombia 2–1 DR Congo  (sheet: DR Congo 1–2 Colombia, flipped)
  { match_id: 'm65', home_goals: 1, away_goals: 1 }, // Colombia 1–1 Portugal  (draw, same either way)
  { match_id: 'm66', home_goals: 1, away_goals: 1 }, // DR Congo 1–1 Uzbekistan

  // ── Group L  (m67=Eng-Cro, m68=Gha-Pan, m69=Eng-Gha, m70=Pan-Cro, m71=Pan-Eng, m72=Cro-Gha)
  { match_id: 'm67', home_goals: 2, away_goals: 0 }, // England 2–0 Croatia
  { match_id: 'm68', home_goals: 1, away_goals: 1 }, // Ghana 1–1 Panama
  { match_id: 'm69', home_goals: 3, away_goals: 0 }, // England 3–0 Ghana
  { match_id: 'm70', home_goals: 1, away_goals: 2 }, // Panama 1–2 Croatia  (sheet: Croatia 2–1 Panama, flipped)
  { match_id: 'm71', home_goals: 0, away_goals: 2 }, // Panama 0–2 England  (sheet: England 2–0 Panama, flipped)
  { match_id: 'm72', home_goals: 2, away_goals: 1 }, // Croatia 2–1 Ghana
]

export async function seedPdaiPicks(db) {
  const user = db.getUserByUsername('pdai')
  if (!user) {
    console.log('[seed:pdai] User "pdai" not found — will retry on next restart once they register')
    return
  }

  // Re-seed whenever SEED_VERSION bumps (catches orientation-error corrections).
  const storedVersion = db.getSetting('pdai_picks_seed_version')
  if (storedVersion === SEED_VERSION) {
    console.log(`[seed:pdai] Picks already at v${SEED_VERSION} — skipping`)
    return
  }

  const existing = db.getScorePicksByUser(user.id)
  if (existing.length > 0) {
    console.log(`[seed:pdai] Clearing ${existing.length} stale picks before v${SEED_VERSION} re-seed`)
    db.deletePicksByUser(user.id)
  }

  for (const pick of PICKS) {
    db.upsertScorePick(user.id, pick.match_id, pick.home_goals, pick.away_goals)
  }

  db.setSetting('pdai_picks_seed_version', SEED_VERSION)
  console.log(`[seed:pdai] Seeded ${PICKS.length} picks for "${user.username}" (id ${user.id}) @ v${SEED_VERSION}`)
}
