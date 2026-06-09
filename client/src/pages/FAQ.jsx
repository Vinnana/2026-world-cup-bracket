const SCORING = [
  ['🥇 Group 1st place (correct)', '3 pts'],
  ['🥈 Group 2nd place (correct)', '2 pts'],
  ['🥉 Group 3rd place (correct & advances) *', '1 pt'],
  ['Round of 32 winner', '2 pts'],
  ['Round of 16 winner', '3 pts'],
  ['Quarter-final winner', '4 pts'],
  ['Semi-final winner', '5 pts'],
  ['Champion', '8 pts'],
  ['Runner-up', '3 pts'],
]

const RULES = [
  {
    q: 'How do I make my picks?',
    a: 'Go to My Bracket. On the Group Stage tab pick 1st, 2nd, and 3rd for all 12 groups. On the Knockout Bracket tab, teams auto-fill from your group picks — click a team to advance them through each round to the Final. Hit Save Picks when done (you can edit anytime until brackets lock).',
  },
  {
    q: 'How does scoring work?',
    a: 'You earn points for each correct prediction — group standings plus every knockout winner. The deeper the round, the more a correct pick is worth. See the table above.',
  },
  {
    q: 'Why don’t all my 3rd-place picks count?',
    a: 'Only the 8 best 3rd-place teams advance to the knockouts. A correct 3rd-place pick scores its point only if that team is one of the 8 that qualify. Your 3rd-place picks in the other 4 groups score nothing. 1st and 2nd place picks always score.',
  },
  {
    q: 'When do brackets lock?',
    a: 'The admin locks all brackets before the first match kicks off. Once locked, no one can change their picks — so submit before the deadline. The lock status is shown on your bracket and the leaderboard.',
  },
  {
    q: 'How does the bracket update?',
    a: 'Results come in two ways: the admin can enter them by hand, or the app can auto-fetch them from a live football data feed on a schedule. Either way, scores recalculate automatically and the leaderboard reorders. Correct picks are highlighted green and wrong ones red on everyone’s bracket, and the leaderboard refreshes on its own every 30 seconds.',
  },
  {
    q: 'Can I see everyone else’s picks?',
    a: 'Not until brackets lock. To keep things fair, every player’s picks stay secret until the admin locks submissions (at the set deadline). After that, the All Brackets page reveals everyone’s full group-stage and knockout picks with their live scores. Before lock you can only see your own bracket.',
  },
  {
    q: 'What happens in a tie?',
    a: 'Players with the same point total share the same rank. If you want a tiebreaker for prizes, agree on one with the group (e.g. whoever picked the correct champion, or correct final score).',
  },
]

export default function FAQ() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">❓ Rules &amp; FAQ</h1>

      <div className="card mb-6">
        <h2 className="font-bold text-fifa-gold mb-3">Scoring</h2>
        <div className="divide-y divide-gray-800">
          {SCORING.map(([label, pts]) => (
            <div key={label} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-300">{label}</span>
              <span className="font-bold tabular-nums">{pts}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-gray-500">
          * Only the 8 best 3rd-place teams advance — a correct 3rd-place pick scores only if that team
          is one of the 8 that qualify.
        </p>
      </div>

      <div className="space-y-4">
        {RULES.map(({ q, a }) => (
          <div key={q} className="card">
            <h3 className="font-semibold text-fifa-gold mb-1">{q}</h3>
            <p className="text-sm text-gray-300">{a}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
