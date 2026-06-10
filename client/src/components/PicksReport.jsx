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
  const PW = doc.internal.pageSize.width   // 841.89 pt
  const PH = doc.internal.pageSize.height  // 595.28 pt

  // ── Colour palette ──────────────────────────────────────────────────────────
  const DARK   = [21,  19,  12]
  const GOLD   = [201, 162, 39]
  const WHITE  = [255, 255, 255]
  const LGRAY  = [247, 247, 247]
  const MGRAY  = [155, 155, 155]
  const BLACK  = [22,  22,  22]
  const GOLDDK = [140, 100,  5]
  // Pick tier – light pastels, dark text (legible on paper)
  const T10F = [187, 247, 208];  const T10T = [20,  83,  45]
  const T6F  = [254, 243, 169];  const T6T  = [113, 63,   0]
  const T4F  = [254, 215, 170];  const T4T  = [154, 52,  18]
  const T0F  = [254, 202, 202];  const T0T  = [153, 27,  27]
  const TNOF = [243, 243, 243];  const TNOT = [120, 120, 120]

  // ── PAGE 1 — Cover + Standings ──────────────────────────────────────────────
  doc.setFillColor(...DARK)
  doc.rect(0, 0, PW, 62, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...GOLD)
  doc.text('2026 FIFA World Cup Score Picks', 30, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(200, 200, 200)
  doc.text('Full Player Picks Report', 30, 48)
  doc.setFontSize(8)
  doc.setTextColor(...MGRAY)
  doc.text(`Generated: ${new Date(generated_at).toLocaleString()}`, PW - 30, 48, { align: 'right' })

  // Gold rule
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(1.2)
  doc.line(30, 70, PW - 30, 70)

  // Standings heading
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BLACK)
  doc.text('STANDINGS', 30, 88)

  autoTable(doc, {
    startY: 94,
    head: [['Rank', 'Player', 'Points']],
    body: users.map((u, i) => [`#${i + 1}`, u.username, `${totals[u.id] ?? 0} pts`]),
    headStyles: { fillColor: DARK, textColor: GOLD, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { textColor: BLACK, fillColor: WHITE, fontSize: 10 },
    alternateRowStyles: { fillColor: LGRAY },
    columnStyles: {
      0: { cellWidth: 32, halign: 'center' },
      1: { cellWidth: 160 },
      2: { cellWidth: 72, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: 30 },
    tableWidth: 264,
    styles: { cellPadding: 4.5 },
  })

  // Scoring key
  const keyY = doc.lastAutoTable.finalY + 24
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BLACK)
  doc.text('SCORING KEY', 30, keyY)

  const tiers = [
    { label: '10 pts  Exact score',            fill: T10F, text: T10T },
    { label: '6 pts  Right result + goal diff', fill: T6F,  text: T6T  },
    { label: '4 pts  Right result only',        fill: T4F,  text: T4T  },
    { label: '0 pts  Wrong result',             fill: T0F,  text: T0T  },
  ]
  let kx = 30
  tiers.forEach(t => {
    const bw = 175, bh = 22
    doc.setFillColor(...t.fill)
    doc.roundedRect(kx, keyY + 8, bw, bh, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...t.text)
    doc.text(t.label, kx + bw / 2, keyY + 21, { align: 'center' })
    kx += bw + 8
  })

  // ── PAGE 2+ — All Picks table ───────────────────────────────────────────────
  doc.addPage()

  const HEADER_H = 38

  function drawPicksPageHeader() {
    const pg = doc.internal.getCurrentPageInfo().pageNumber
    doc.setFillColor(...DARK)
    doc.rect(0, 0, PW, HEADER_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...GOLD)
    doc.text('WC 2026 Score Picks — All Picks', 30, 24)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MGRAY)
    doc.text(`Page ${pg}`, PW - 30, 24, { align: 'right' })
  }

  // Dynamic column widths
  const avail   = PW - 60   // 30pt margin each side
  const fixedW  = 24 + 52 + 90 + 90 + 38   // # + grp + home + away + result = 294
  const userW   = Math.max(42, Math.floor((avail - fixedW) / Math.max(users.length, 1)))

  const colStyles = {
    0: { cellWidth: 24, halign: 'center' },
    1: { cellWidth: 52 },
    2: { cellWidth: 90 },
    3: { cellWidth: 90 },
    4: { cellWidth: 38, halign: 'center' },
  }
  users.forEach((_, i) => { colStyles[5 + i] = { cellWidth: userW, halign: 'center' } })

  // Build table body with section-header rows
  const rows = []
  let prevRound = null, prevGroup = null

  for (const m of matches) {
    const totalCols = 5 + users.length

    // Round-level header
    if (m.round !== prevRound) {
      rows.push([{
        content: (ROUND_LABELS[m.round] || m.round).toUpperCase(),
        colSpan: totalCols,
        styles: {
          fillColor: DARK, textColor: GOLD, fontStyle: 'bold', fontSize: 8.5,
          cellPadding: { top: 5, bottom: 5, left: 10, right: 10 },
        },
      }])
      prevRound = m.round
      prevGroup = null
    }

    // Group sub-header (Group stage only)
    if (m.round === 'Group' && m.group && m.group !== prevGroup) {
      rows.push([{
        content: `  Group ${m.group}`,
        colSpan: totalCols,
        styles: {
          fillColor: [40, 38, 26], textColor: [215, 175, 60], fontStyle: 'bold', fontSize: 8,
          cellPadding: { top: 3, bottom: 3, left: 10, right: 10 },
        },
      }])
      prevGroup = m.group
    }

    const resultStr = m.result ? `${m.result.home_goals}-${m.result.away_goals}` : '-'

    const userCells = users.map(u => {
      const p = m.picks[u.id]
      if (!p) return { content: '', styles: { fillColor: TNOF, textColor: TNOT, halign: 'center' } }
      const pick   = `${p.home_goals}-${p.away_goals}`
      const ptsStr = p.pts != null ? `  +${p.pts}` : ''
      let fill = TNOF, text = TNOT
      if (p.pts === 10) { fill = T10F; text = T10T }
      else if (p.pts === 6)  { fill = T6F;  text = T6T  }
      else if (p.pts === 4)  { fill = T4F;  text = T4T  }
      else if (p.pts === 0)  { fill = T0F;  text = T0T  }
      return {
        content: pick + ptsStr,
        styles: { fillColor: fill, textColor: text, fontStyle: 'bold', halign: 'center', fontSize: 7.5 },
      }
    })

    rows.push([
      { content: `${m.no}`, styles: { textColor: MGRAY, halign: 'center', fontSize: 7 } },
      { content: m.round === 'Group' ? (m.group ? `Grp ${m.group}` : '') : '', styles: { textColor: MGRAY, fontSize: 7 } },
      { content: m.home, styles: { textColor: BLACK, fontSize: 7.5 } },
      { content: m.away, styles: { textColor: BLACK, fontSize: 7.5 } },
      { content: resultStr, styles: { fontStyle: 'bold', textColor: GOLDDK, halign: 'center', fontSize: 8 } },
      ...userCells,
    ])
  }

  // Footer totals row
  const footRow = [
    { content: 'TOTAL', colSpan: 5, styles: { fontStyle: 'bold', textColor: BLACK, halign: 'right', fontSize: 9 } },
    ...users.map(u => ({
      content: `${totals[u.id] ?? 0} pts`,
      styles: { fontStyle: 'bold', textColor: GOLDDK, halign: 'center', fontSize: 9 },
    })),
  ]

  autoTable(doc, {
    startY: HEADER_H + 6,
    head: [['#', 'Grp', 'Home Team', 'Away Team', 'Result', ...users.map(u => u.username)]],
    body: rows,
    foot: [footRow],
    headStyles: {
      fillColor: [40, 38, 26], textColor: GOLD, fontStyle: 'bold', fontSize: 8,
      lineColor: [80, 72, 40], lineWidth: 0.4,
    },
    bodyStyles: { textColor: BLACK, fillColor: WHITE, fontSize: 7.5 },
    alternateRowStyles: { fillColor: LGRAY },
    footStyles: { fillColor: [240, 240, 240], textColor: BLACK, fontStyle: 'bold' },
    margin: { left: 30, right: 30, top: HEADER_H + 6 },
    styles: { cellPadding: 2.5, lineColor: [218, 218, 218], lineWidth: 0.25, overflow: 'ellipsize' },
    columnStyles: colStyles,
    showHead: 'everyPage',
    didDrawPage: () => drawPicksPageHeader(),
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
