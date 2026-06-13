/**
 * Maps usernames (as stored in the DB) to real / display names.
 * Lookup is case-insensitive and strips email domains first.
 */
const NICKNAME_MAP = {
  'nextwcnepalko':    'Bishesh',
  'bellinghampalace': 'Avash',
  'signing4england':  'Bishav',
  'jai shambo':       'Rakshya',
  'sonsofpitches':    'Smriti',
  'madam':            'Adya',
  'chukita':          'Chahana',
  'ny_picks':         'Nanda',
  'radpicks':         'Rohit',
  'tarbus':           'Subrat',
  'die_elf':          'Satish',
  'princesspeach':    'Neha',
  'moon2':            'Priyanka',
  'obsidian':         'Suyesh',
  'stk':              'Sirish',
  'kajispaji':        'Abhisesh',
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
