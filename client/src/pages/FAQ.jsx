const SCORING = [
  { pts: '+10', label: 'Exact score',                        color: 'bg-green-700 text-green-100' },
  { pts: '+6',  label: 'Right winner / draw + goal diff',    color: 'bg-yellow-700 text-yellow-100' },
  { pts: '+4',  label: 'Right winner / draw only',           color: 'bg-orange-700 text-orange-100' },
  { pts: '0',   label: 'Wrong outcome',                      color: 'bg-gray-700 text-gray-400' },
]

const RULES = [
  {
    q: 'How do I submit my picks?',
    a: 'Go to Score Picks. You\'ll see all 12 groups with 6 matches each — enter a predicted score for every game (e.g. "2 – 1"). Your picks save automatically as you tab between fields. The Knockout tab opens after the group stage ends (Phase 2).',
  },
  {
    q: 'How does scoring work?',
    a: 'Every match prediction earns up to 10 points based on accuracy. Exact score = 10 pts. Correct winner (or draw) with the right goal difference = 6 pts. Just the correct winner / draw = 4 pts. Wrong outcome = 0 pts. See the examples in the table above.',
  },
  {
    q: 'Can you give me an example?',
    a: 'Real result: USA 3–1 Paraguay. If you predicted 3–1 → +10 pts. Predicted 2–0 (USA still wins by 2) → +6 pts. Predicted 1–0 (USA wins, any margin) → +4 pts. Predicted 0–1 (Paraguay) → 0 pts.',
  },
  {
    q: 'What is the two-phase system?',
    a: 'Phase 1 — Group Stage: predict scores for all 72 group matches before the tournament starts. Phase 2 — Knockout: after the group stage ends, the knockout bracket opens and you get a fresh start to predict all 32 knockout matches. You still compete even if your favourite teams were eliminated.',
  },
  {
    q: 'When do picks lock?',
    a: 'The admin locks group-stage picks before the first match kicks off (June 12, 2026). Once locked, no edits are allowed. Knockout picks have their own lock set when Phase 2 opens. The lock status is visible on the picks page.',
  },
  {
    q: 'Can I see everyone else\'s picks?',
    a: 'Not until picks lock. To keep things fair, all predictions stay private until the admin locks submissions. After that, the All Picks page reveals every player\'s full picks with color-coded scores. Before lock you can only see your own.',
  },
  {
    q: 'How does the leaderboard update?',
    a: 'The admin enters actual match scores as games are played (or the app auto-fetches them). Points recalculate instantly and the leaderboard refreshes every 30 seconds.',
  },
  {
    q: 'What happens in a tie?',
    a: 'Tied players share the same rank. Agree on a tiebreaker with the group before the tournament — e.g. whoever predicted the correct final score, or the champion, wins the tie.',
  },
]

export default function FAQ() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">❓ Rules &amp; FAQ</h1>

      {/* Scoring table */}
      <div className="card mb-6">
        <h2 className="font-bold text-fifa-gold mb-4">Scoring</h2>
        <div className="space-y-2">
          {SCORING.map(({ pts, label, color }) => (
            <div key={pts} className="flex items-center gap-3">
              <span className={`${color} font-black px-2.5 py-1 rounded text-sm w-12 text-center flex-shrink-0`}>
                {pts}
              </span>
              <span className="text-sm text-gray-300">{label}</span>
            </div>
          ))}
        </div>

        {/* Example */}
        <div className="mt-4 pt-4 border-t border-gray-800">
          <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Example — USA 3–1 Paraguay</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {[
              ['Predicted 3–1', '+10 pts', 'text-green-400'],
              ['Predicted 2–0', '+6 pts', 'text-yellow-400'],
              ['Predicted 1–0', '+4 pts', 'text-orange-400'],
              ['Predicted 0–1', '0 pts', 'text-red-400'],
            ].map(([pred, pts, cls]) => (
              <div key={pred} className="flex justify-between bg-gray-800/50 rounded px-2 py-1">
                <span className="text-gray-300">{pred}</span>
                <span className={`font-bold ${cls}`}>{pts}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ cards */}
      <div className="space-y-3">
        {RULES.map(({ q, a }) => (
          <div key={q} className="card">
            <h3 className="font-semibold text-fifa-gold mb-1.5">{q}</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{a}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
