/**
 * Modern crest-style logo for WC 2026 Bracket.
 * Uses Nepal crimson colors + gold accents.
 */
export default function Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      {/* SVG crest */}
      <div className="relative flex items-center justify-center" style={{ width: 47, height: 51 }}>
        <svg
          viewBox="0 0 40 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {/* Shield / crest body */}
          <path
            d="M20 1.5 L38 8 V25 Q38 39.5 20 43 Q2 39.5 2 25 V8 Z"
            fill="#7B0000"
            stroke="#c9a227"
            strokeWidth="1.6"
          />
          {/* Upper crimson band — Nepal red */}
          <path
            d="M20 2.5 L37 8.5 V21 Q31 26 20 28 Q9 26 3 21 V8.5 Z"
            fill="#C41E3A"
          />
          {/* Gold star at top */}
          <text
            x="20"
            y="14"
            textAnchor="middle"
            fontSize="9"
            fill="#c9a227"
            style={{ fontFamily: 'serif' }}
          >
            ★
          </text>
          {/* Small decorative line under star */}
          <line x1="13" y1="16.5" x2="27" y2="16.5" stroke="#c9a227" strokeWidth="0.8" opacity="0.5" />
          {/* Bottom shield tip accent */}
          <path d="M16 41.5 Q20 43.5 24 41.5" stroke="#c9a227" strokeWidth="1" fill="none" opacity="0.6" />
        </svg>

        {/* Rhino emoji sits in the lower half of the crest */}
        <span
          style={{
            position: 'relative',
            fontSize: 27,
            marginTop: 12,
            filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))',
            lineHeight: 1,
          }}
        >
          🦏
        </span>
      </div>

      {/* Text lockup */}
      {!compact && (
        <div className="flex flex-col leading-none gap-0.5">
          <span
            className="text-fifa-gold font-black tracking-tight"
            style={{ fontSize: 25, letterSpacing: '-0.02em' }}
          >
            WC 2026
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[11px] tracking-[0.18em] uppercase text-gray-500 font-semibold">
              Score Picks
            </span>
            <span className="text-[12px]">🇳🇵</span>
          </div>
        </div>
      )}
    </div>
  )
}
