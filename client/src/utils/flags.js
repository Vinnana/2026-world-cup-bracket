/** Map of team name → country flag emoji */
export const FLAGS = {
  // Group A
  'Mexico':                   '🇲🇽',
  'South Africa':             '🇿🇦',
  'Korea Republic':           '🇰🇷',
  'Czechia':                  '🇨🇿',
  // Group B
  'Canada':                   '🇨🇦',
  'Bosnia and Herzegovina':   '🇧🇦',
  'Qatar':                    '🇶🇦',
  'Switzerland':              '🇨🇭',
  // Group C
  'Brazil':                   '🇧🇷',
  'Morocco':                  '🇲🇦',
  'Haiti':                    '🇭🇹',
  'Scotland':                 '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  // Group D
  'United States':            '🇺🇸',
  'Paraguay':                 '🇵🇾',
  'Australia':                '🇦🇺',
  'Türkiye':                  '🇹🇷',
  // Group E
  'Germany':                  '🇩🇪',
  'Curaçao':                  '🇨🇼',
  'Ivory Coast':              '🇨🇮',
  'Ecuador':                  '🇪🇨',
  // Group F
  'Netherlands':              '🇳🇱',
  'Japan':                    '🇯🇵',
  'Sweden':                   '🇸🇪',
  'Tunisia':                  '🇹🇳',
  // Group G
  'Belgium':                  '🇧🇪',
  'Egypt':                    '🇪🇬',
  'Iran':                     '🇮🇷',
  'New Zealand':              '🇳🇿',
  // Group H
  'Spain':                    '🇪🇸',
  'Cape Verde':               '🇨🇻',
  'Saudi Arabia':             '🇸🇦',
  'Uruguay':                  '🇺🇾',
  // Group I
  'France':                   '🇫🇷',
  'Senegal':                  '🇸🇳',
  'Iraq':                     '🇮🇶',
  'Norway':                   '🇳🇴',
  // Group J
  'Argentina':                '🇦🇷',
  'Algeria':                  '🇩🇿',
  'Austria':                  '🇦🇹',
  'Jordan':                   '🇯🇴',
  // Group K
  'Portugal':                 '🇵🇹',
  'DR Congo':                 '🇨🇩',
  'Uzbekistan':               '🇺🇿',
  'Colombia':                 '🇨🇴',
  // Group L
  'England':                  '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Croatia':                  '🇭🇷',
  'Ghana':                    '🇬🇭',
  'Panama':                   '🇵🇦',
}

export function getFlag(team) {
  return FLAGS[team] || ''
}

/** FIFA-style 3-letter country codes */
export const CODES = {
  'Mexico':                   'MEX',
  'South Africa':             'RSA',
  'Korea Republic':           'KOR',
  'Czechia':                  'CZE',
  'Canada':                   'CAN',
  'Bosnia and Herzegovina':   'BIH',
  'Qatar':                    'QAT',
  'Switzerland':              'SUI',
  'Brazil':                   'BRA',
  'Morocco':                  'MAR',
  'Haiti':                    'HAI',
  'Scotland':                 'SCO',
  'United States':            'USA',
  'Paraguay':                 'PAR',
  'Australia':                'AUS',
  'Türkiye':                  'TUR',
  'Germany':                  'GER',
  'Curaçao':                  'CUW',
  'Ivory Coast':              'CIV',
  'Ecuador':                  'ECU',
  'Netherlands':              'NED',
  'Japan':                    'JPN',
  'Sweden':                   'SWE',
  'Tunisia':                  'TUN',
  'Belgium':                  'BEL',
  'Egypt':                    'EGY',
  'Iran':                     'IRN',
  'New Zealand':              'NZL',
  'Spain':                    'ESP',
  'Cape Verde':               'CPV',
  'Saudi Arabia':             'KSA',
  'Uruguay':                  'URU',
  'France':                   'FRA',
  'Senegal':                  'SEN',
  'Iraq':                     'IRQ',
  'Norway':                   'NOR',
  'Argentina':                'ARG',
  'Algeria':                  'ALG',
  'Austria':                  'AUT',
  'Jordan':                   'JOR',
  'Portugal':                 'POR',
  'DR Congo':                 'COD',
  'Uzbekistan':               'UZB',
  'Colombia':                 'COL',
  'England':                  'ENG',
  'Croatia':                  'CRO',
  'Ghana':                    'GHA',
  'Panama':                   'PAN',
}

export function getCode(team) {
  return CODES[team] || team?.slice(0, 3).toUpperCase() || '?'
}
