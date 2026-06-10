/**
 * PicksReport — comprehensive admin view of all players' picks.
 * Exportable as CSV or PDF (jsPDF + jspdf-autotable).
 */
import { useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { admin as adminApi } from '../api'

// ─── Colour helpers ───────────────────────────────────────────────────────────
function ptsBadge(pts) {
  if (pts === 10) return 'bg-green-700/80 text-green-100'
  if (pts === 6)  return 'bg-yellow-700/80 text-yellow-100'
  if (pts === 4)  return 'bg-orange-700/80 text-orange-100'
  if (pts === 0)  return 'bg-red-900/60 text-red-300'
  return 'bg-gray-700 text-gray-400'
}

// jsPDF fill colour per pts value
function ptsRgb(pts) {
  if (pts === 10) return [22, 101, 52]    // green-800
  if (pts === 6)  return [133, 77, 14]    // yellow-800
  if (pts === 4)  return [154, 52, 18]    // orange-800
  if (pts === 0)  return [127, 29, 29]    // red-900
  return [55, 65, 81]                     // gray-700
}

const ROUND_ORDER = ['Group', 'R32', 'R16', 'QF', 'SF', 'Final']
const ROUND_LABELS = { Group: 'Group Stage', R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-finals', SF: 'Semi-finals', Final: 'Final' }

// ─── CSV export ──────────────────────────────────────────────────────────────
function downloadCSV(report) {
  const { users, matches, totals } = report

  // Header row
  const userCols = users.flatMap(u => [`${u.username} Pick`, `${u.username} Pts`])
  const header = ['#', 'Round', 'Group', 'Home Team', 'Away Team', 'Result', ...userCols]

  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`

  const rows = matches.map(m => {
    const result = m.result ? `${m.result.home_goals}-${m.result.away_goals}` : ''
    const userCells = users.flatMap(u => {
      const p = m.picks[u.id]
      if (!p) return ['', '']
      return [
        `${p.home_goals}-${p.away_goals}`,
        p.pts != null ? p.pts : '',
      ]
    })
    return [m.no, ROUND_LABELS[m.round] || m.round, m.group || '', m.home, m.away, result, ...userCells].map(q).join(',')
  })

  // Totals row
  const totalCells = users.flatMap(u => ['', totals[u.id] ?? 0])
  rows.push(['', '', '', '', '', 'TOTAL', ...totalCells].map(q).join(','))

  const csv = [header.map(q).join(','), ...rows].join('\r\n')
  const blob = new Blob(['﻿' + csv, { type: 'text/csv;charset=utf-8;' }])
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `wc2026-picks-report-${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ─── PDF export ───────────────────────────────────────────────────────────────
function downloadPDF(report) {
  const { users, matches, totals, generated_at } = report
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const gold = [201, 162, 39]
  const dark = [21, 19, 12]

  // ── Title block ────────────────────────────────────────────────────────────
  doc.setFillColor(...dark)
  doc.rect(0, 0, doc.internal.pageSize.width, 50, 'F')
  doc.setTextColor(...gold)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('WC 2026 Score Picks — Full Report', 30, 28)
  doc.setFontSize(9)
  doc.setTextColor(160, 160, 160)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generated: ${new Date(generated_at).toLocaleString()}`, 30, 42)

  // ── Leaderboard summary ────────────────────────────────────────────────────
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Standings', 30, 66)
  autoTable(doc, {
    startY: 72,
    head: [['Rank', 'Player', 'Total Points']],
    body: users.map((u, i) => [
      i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`,
      u.username,
      `${totals[u.id] ?? 0} pts`,
    ]),
    headStyles: { fillColor: gold, textColor: dark, fontStyle: 'bold' },
    bodyStyles: { textColor: [220, 220, 220], fillColor: [30, 27, 20] },
    alternateRowStyles: { fillColor: [40, 37, 28] },
    margin: { left: 30 },
    tableWidth: 260,
    styles: { fontSize: 9 },
  })

  // ── Full picks table ───────────────────────────────────────────────────────
  const startY = doc.lastAutoTable.finalY + 20
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('All Picks', 30, startY - 6)

  const colHeaders = ['#', 'Round', 'Home', 'Away', 'Result', ...users.map(u => u.username)]

  // Build body rows grouped by round
  const body = []
  const groupColors = {}  // track alternating group colours
  let lastRound = null

  for (const m of matches) {
    // Section divider row for new round
    if (m.round !== lastRound) {
      body.push({ isSection: true, label: ROUND_LABELS[m.round] || m.round })
      lastRound = m.round
    }

    const resultStr = m.result ? `${m.result.home_goals}–${m.result.away_goals}` : '–'
    const userCells = users.map(u => {
      const p = m.picks[u.id]
      if (!p) return { content: '–', styles: { textColor: [100, 100, 100] } }
      const pick = `${p.home_goals}–${p.away_goals}`
      const pts  = p.pts != null ? `+${p.pts}` : ''
      return {
        content: pts ? `${pick}\n${pts}` : pick,
        styles: {
          textColor: [255, 255, 255],
          fillColor: p.pts != null ? ptsRgb(p.pts) : [40, 37, 28],
          fontStyle: 'bold',
        },
      }
    })

    body.push([
      { content: m.no, styles: { textColor: [180, 180, 180] } },
      { content: m.group ? `Grp ${m.group}` : (ROUND_LABELS[m.round] || m.round), styles: { textColor: [180, 180, 180] } },
      { content: m.home, styles: { textColor: [220, 220, 220] } },
      { content: m.away, styles: { textColor: [220, 220, 220] } },
      { content: resultStr, styles: { fontStyle: 'bold', textColor: [201, 162, 39] } },
      ...userCells,
    ])
  }

  // Totals footer
  const totalRow = [
    { content: '', styles: {} },
    { content: 'TOTAL', styles: { fontStyle: 'bold', textColor: gold } },
    { content: '', styles: {} },
    { content: '', styles: {} },
    { content: '', styles: {} },
    ...users.map(u => ({
      content: `${totals[u.id] ?? 0} pts`,
      styles: { fontStyle: 'bold', textColor: gold },
    })),
  ]

  autoTable(doc, {
    startY,
    head: [colHeaders],
    body: body.filter(r => !r.isSection).map(r => r),
    headStyles: { fillColor: dark, textColor: gold, fontStyle: 'bold', lineWidth: 0.5, lineColor: gold },
    bodyStyles: { fillColor: [30, 27, 20], textColor: [220, 220, 220], fontSize: 7.5 },
    alternateRowStyles: { fillColor: [38, 35, 25] },
    foot: [totalRow],
    footStyles: { fillColor: dark, textColor: gold },
    margin: { left: 30, right: 30 },
    styles: { cellPadding: 3, lineColor: [60, 57, 45], lineWidth: 0.3 },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 48 }, 2: { cellWidth: 72 }, 3: { cellWidth: 72 }, 4: { cellWidth: 38 } },
    didDrawPage: (data) => {
      // Repeat header on every page
      doc.setFillColor(...dark)
      doc.rect(0, 0, doc.internal.pageSize.width, 18, 'F')
      doc.setTextColor(...gold)
      doc.setFontSize(7)
      doc.text('WC 2026 Score Picks Report', 30, 12)
      doc.setTextColor(120, 120, 120)
      doc.text(`Page ${data.pageNumber}`, doc.internal.pageSize.width - 50, 12)
    },
  })

  doc.save(`wc2026-picks-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PicksReport() {
  const [report,  setReport]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState('')

  async function generate() {
    setLoading(true); setErr('')
    try {
      const res = await adminApi.report()
      setReport(res.data)
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  // ── No report yet ──────────────────────────────────────────────────────────
  if (!report) {
    return (
      <div className="card text-center py-10 space-y-4">
        <div className="text-4xl">📊</div>
        <div>
          <h3 className="font-bold text-white mb-1">Picks Report</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">
            Generate a full breakdown of every player's predictions, scores, and
            points. Export as CSV to open in Excel, or PDF to share with everyone.
          </p>
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={generate} disabled={loading} className="btn-primary mx-auto px-6">
          {loading ? '⏳ Generating…' : '📊 Generate Report'}
        </button>
      </div>
    )
  }

  const { users, matches, totals, generated_at } = report
  const resultsIn = matches.filter(m => m.result).length

  // ── Report view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header bar */}
      <div className="card flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {users.length} players · {resultsIn} results in
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Generated {new Date(generated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={generate}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg"
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => downloadCSV(report)}
            className="text-xs bg-green-800 hover:bg-green-700 text-white font-semibold px-3 py-1.5 rounded-lg"
          >
            ⬇ CSV
          </button>
          <button
            onClick={() => downloadPDF(report)}
            className="text-xs bg-red-800 hover:bg-red-700 text-white font-semibold px-3 py-1.5 rounded-lg"
          >
            ⬇ PDF
          </button>
        </div>
      </div>

      {/* Standings summary */}
      <div className="card">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Standings</p>
        <div className="space-y-1.5">
          {users.map((u, i) => (
            <div key={u.id} className="flex items-center gap-3">
              <span className="text-base w-7 text-center">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-xs text-gray-500">#{i+1}</span>}
              </span>
              <span className="flex-1 text-sm font-medium text-white">{u.username}</span>
              <span className="text-sm font-black text-fifa-gold tabular-nums">{totals[u.id] ?? 0} pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Full picks table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-xs min-w-max">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/80">
              <th className="text-left px-3 py-2 text-gray-400 font-semibold w-8">#</th>
              <th className="text-left px-3 py-2 text-gray-400 font-semibold">Home</th>
              <th className="text-center px-2 py-2 text-gray-400 font-semibold w-12">Result</th>
              <th className="text-left px-3 py-2 text-gray-400 font-semibold">Away</th>
              {users.map(u => (
                <th key={u.id} className="text-center px-3 py-2 text-fifa-gold font-bold min-w-[80px]">
                  {u.username}
                  <span className="block text-gray-500 font-normal">{totals[u.id] ?? 0} pts</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROUND_ORDER.map(round => {
              const roundMatches = matches.filter(m => m.round === round)
              if (!roundMatches.length) return null

              // Group stage: sub-group by letter
              if (round === 'Group') {
                const groups = [...new Set(roundMatches.map(m => m.group))].sort()
                return groups.map(letter => (
                  <>
                    <tr key={`grp-${letter}`} className="bg-gray-800/60">
                      <td colSpan={4 + users.length} className="px-3 py-1.5 text-xs font-bold text-fifa-gold tracking-wide">
                        Group {letter}
                      </td>
                    </tr>
                    {roundMatches.filter(m => m.group === letter).map(m => (
                      <MatchRow key={m.id} m={m} users={users} />
                    ))}
                  </>
                ))
              }

              return (
                <>
                  <tr key={`round-${round}`} className="bg-gray-800/60">
                    <td colSpan={4 + users.length} className="px-3 py-1.5 text-xs font-bold text-gray-300 tracking-wide">
                      {ROUND_LABELS[round] || round}
                    </td>
                  </tr>
                  {roundMatches.map(m => (
                    <MatchRow key={m.id} m={m} users={users} />
                  ))}
                </>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-600 bg-gray-800/80">
              <td colSpan={4} className="px-3 py-2 text-xs font-bold text-gray-300">TOTAL</td>
              {users.map(u => (
                <td key={u.id} className="text-center px-3 py-2 font-black text-fifa-gold tabular-nums">
                  {totals[u.id] ?? 0}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function MatchRow({ m, users }) {
  const hasResult = m.result != null
  return (
    <tr className="border-b border-gray-800/60 hover:bg-gray-800/20 transition-colors">
      <td className="px-3 py-1.5 text-gray-600 tabular-nums">{m.no}</td>
      <td className="px-3 py-1.5 text-gray-200">{m.home}</td>
      <td className="text-center px-2 py-1.5 font-bold tabular-nums text-fifa-gold">
        {hasResult ? `${m.result.home_goals}–${m.result.away_goals}` : <span className="text-gray-700">–</span>}
      </td>
      <td className="px-3 py-1.5 text-gray-200">{m.away}</td>
      {users.map(u => {
        const p = m.picks[u.id]
        if (!p) return (
          <td key={u.id} className="text-center px-3 py-1.5 text-gray-700">–</td>
        )
        return (
          <td key={u.id} className="text-center px-2 py-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${p.pts != null ? ptsBadge(p.pts) : 'text-gray-300'}`}>
              {p.home_goals}–{p.away_goals}
              {p.pts != null && (
                <span className="opacity-80 font-normal">
                  {p.pts > 0 ? `+${p.pts}` : '✗'}
                </span>
              )}
            </span>
          </td>
        )
      })}
    </tr>
  )
}
