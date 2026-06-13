/**
 * Maps usernames (as stored in the DB) to real / display names.
 * Lookup is case-insensitive and strips email domains first.
 */
const NICKNAME_MAP = {
  'nextwcnepalko':          'Bishesh',
  'bellinghampalace':       'Avash',
  'singing4england':        'Bishav',
  'jai shambo 🦚💐🇳🇵':  'Rakshya',
  'sonsofpitches':          'Smriti',
  'madam':                  'Adya',
  'chukita':                'Chahana',
  'ny_picks':               'Nanda',
  'radpicks':               'Rohit',
  'tarbus':                 'Subrat',
  'die_elf':                'Satish',
  'princesspeach':          'Neha',
  'moon2':                  'Priyanka',
  'obsidian':               'Suyesh',
  'stk':                    'Sirish',
  'kajispaji':              'Abhisesh',
  'gurungsubodh':           'Subodh',
  'pdai':                   'Prashant',
  'prajwol123':             'Prajwol',
  'shreeshbhattarai':       'Shreesh',
  'sasindhu7':              'Sindhu',
  'shraddha09':             'Shraddha',
  'deepar':                 'Deepa',
  'kalyan':                 'Kalyan',
  'bibekkarki':             'Bibek K',
  'bbibek':                 'B Bibek',
  'sajagkarki':             'Sajag',
  'phamal':                 'Prakash',
}

/**
 * Returns the real name for a username, or null if not mapped.
 * Strips an email domain before looking up (e.g. "foo@gmail.com" → "foo").
 */
export function getRealName(username) {
  if (!username) return null
  const stripped = username.replace(/@.+$/, '').trim()
  return NICKNAME_MAP[stripped.toLowerCase()] ?? null
}
