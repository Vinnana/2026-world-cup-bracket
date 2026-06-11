/**
 * PicksReport — admin view of every participant's group-stage picks.
 * Group stage only (72 matches). Exports as PDF (user-batched) and CSV.
 */
import { useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { admin as adminApi } from '../api'

// ── Scoring palette ────────────────────────────────────────────────────────────
function ptsBadgeClass(pts) {
  if (pts === 10) return 'bg-green-800/70 text-green-200'
  if (pts === 6)  return 'bg-yellow-800/70 text-yellow-100'
  if (pts === 4)  return 'bg-orange-800/70 text-orange-100'
  if (pts === 0)  return 'bg-red-900/60 text-red-300'
  return 'bg-gray-700/40 text-gray-400'
}

// jsPDF pastel fill + dark text — legible when printed
function ptsPalette(pts) {
  if (pts === 10) return { fill: [187, 247, 208], text: [20,  83,  45]  }
  if (pts === 6)  return { fill: [254, 243, 169], text: [113, 63,   0]  }
  if (pts === 4)  return { fill: [254, 215, 170], text: [154, 52,  18]  }
  if (pts === 0)  return { fill: [254, 202, 202], text: [153, 27,  27]  }
  return           { fill: [240, 240, 240],   text: [150, 150, 150] }  // no pick / no result yet
}

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L']

// ── CSV export ─────────────────────────────────────────────────────────────────
function downloadCSV(report) {
  const { users, matches, totals } = report
  const gMatches = matches.filter(m => m.round === 'Group')

  // Quote every cell
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`

  // Header: fixed columns then one pair per user
  const userHeaders = users.flatMap(u => [u.username, `${u.username}_pts`])
  const header = ['#', 'Group', 'Home', 'Away', 'Result', ...userHeaders]

  const rows = gMatches.map(m => {
    const result = m.result ? `${m.result.home_goals}-${m.result.away_goals}` : ''
    const userCells = users.flatMap(u => {
      const p = m.picks[u.id]
      if (!p) return ['-', '']
      return [`${p.home_goals}-${p.away_goals}`, p.pts != null ? String(p.pts) : '']
    })
    return [m.no, m.group || '', m.home, m.away, result, ...userCells].map(q).join(',')
  })

  // Totals footer row
  const totalCells = users.flatMap(u => ['', String(totals[u.id] ?? 0)])
  rows.push(['', '', '', '', 'TOTAL', ...totalCells].map(q).join(','))

  const csv  = [header.map(q).join(','), ...rows].join('\r\n')
  // '﻿' = UTF-8 BOM so Excel opens accented names correctly
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `wc2026-picks-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── PDF export ─────────────────────────────────────────────────────────────────
function downloadPDF(report) {
  const { users, matches, totals, generated_at } = report
  const gMatches = matches.filter(m => m.round === 'Group')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const PW  = doc.internal.pageSize.width    // 841.89 pt
  // const PH  = doc.internal.pageSize.height  // 595.28 pt  (unused but kept for reference)

  // ── Palette ──────────────────────────────────────────────────────────────────
  const DARK   = [15,  15,  15]
  const GOLD   = [201, 162,  39]
  const GOLDDK = [140, 100,   5]
  const WHITE  = [255, 255, 255]
  const LGRAY  = [248, 248, 248]
  const MGRAY  = [140, 140, 140]
  const DKGRAY = [50,  50,  50]
  const GRPHDR = [30,  28,  16]   // group separator row bg

  // ── Page 1: Cover + Standings + Scoring key ───────────────────────────────────
  doc.setFillColor(...DARK)
  doc.rect(0, 0, PW, 70, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...GOLD)
  doc.text('2026 FIFA World Cup — Admin Picks Report', 32, 33)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(190, 190, 190)
  doc.text(`Group Stage · 72 Matches · ${users.length} Participants`, 32, 52)

  doc.setFontSize(8)
  doc.setTextColor(...MGRAY)
  doc.text(`Generated: ${new Date(generated_at).toLocaleString()}`, PW - 32, 52, { align: 'right' })

  // Gold rule
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(1)
  doc.line(32, 78, PW - 32, 78)

  // Standings
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...DKGRAY)
  doc.text('STANDINGS', 32, 95)

  autoTable(doc, {
    startY: 101,
    head: [['Rank', 'Player', 'Total Pts']],
    body: users.map((u, i) => [`#${i + 1}`, u.username, `${totals[u.id] ?? 0}`]),
    headStyles:         { fillColor: DARK, textColor: GOLD, fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles:         { textColor: DKGRAY, fontSize: 9 },
    alternateRowStyles: { fillColor: LGRAY },
    columnStyles: {
      0: { cellWidth: 38,  halign: 'center' },
      1: { cellWidth: 160 },
      2: { cellWidth: 72,  halign: 'center', fontStyle: 'bold' },
    },
    margin:     { left: 32 },
    tableWidth: 270,
    styles:     { cellPadding: 4.5 },
  })

  // Scoring legend
  const legY = doc.lastAutoTable.finalY + 24
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...DKGRAY)
  doc.text('SCORING KEY', 32, legY)

  const tiers = [
    { label: '10 pts — Exact score',             fill: [187,247,208], text: [20,83,45]    },
    { label: '6 pts — Right result + goal diff', fill: [254,243,169], text: [113,63,0]    },
    { label: '4 pts — Right result only',        fill: [254,215,170], text: [154,52,18]   },
    { label: '0 pts — Wrong result',             fill: [254,202,202], text: [153,27,27]   },
    { label: '— No pick submitted',              fill: [240,240,240], text: [140,140,140] },
  ]
  let lx = 32
  tiers.forEach(t => {
    const bw = 145, bh = 22
    doc.setFillColor(...t.fill)
    doc.roundedRect(lx, legY + 7, bw, bh, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...t.text)
    doc.text(t.label, lx + bw / 2, legY + 20, { align: 'center' })
    lx += bw + 7
  })

  // ── Pages 2+: Picks tables, batched by user ───────────────────────────────────
  // Layout: fit as many user columns as possible at USER_W each
  const MARGIN   = 32
  const HDR_H    = 40
  const FIX_W    = 22 + 30 + 90 + 90 + 44   // #(22) Grp(30) Home(90) Away(90) Result(44) = 276
  const AVAIL    = PW - MARGIN * 2            // 777.89 pt
  const USER_W   = 50                         // pt per user column (fits "2-1 +10")
  const PER_PAGE = Math.max(1, Math.floor((AVAIL - FIX_W) / USER_W))  // ≈10

  // Slice users into batches
  const batches = []
  for (let i = 0; i < users.length; i += PER_PAGE) {
    batches.push(users.slice(i, i + PER_PAGE))
  }

  batches.forEach(batchUsers => {
    doc.addPage()

    // Page header drawn on every page (via didDrawPage callback below)
    function drawPageHeader() {
      const pg  = doc.internal.getCurrentPageInfo().pageNumber
      const lo  = batchUsers[0].username
      const hi  = batchUsers[batchUsers.length - 1].username
      const label = batchUsers.length === 1 ? lo : `${lo} → ${hi}`

      doc.setFillColor(...DARK)
      doc.rect(0, 0, PW, HDR_H, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...GOLD)
      doc.text('WC 2026 · Group Stage Picks', MARGIN, 24)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(180, 180, 180)
      doc.text(`Players: ${label}`, MARGIN, 35)

      doc.setTextColor(...MGRAY)
      doc.text(`Page ${pg}`, PW - MARGIN, 24, { align: 'right' })
    }

    // Column styles
    const colStyles = {
      0: { cellWidth: 22, halign: 'center' },   // #
      1: { cellWidth: 30, halign: 'center' },   // Grp
      2: { cellWidth: 90 },                     // Home
      3: { cellWidth: 90 },                     // Away
      4: { cellWidth: 44, halign: 'center' },   // Result
    }
    batchUsers.forEach((_, ci) => {
      colStyles[5 + ci] = { cellWidth: USER_W, halign: 'center' }
    })

    // Build rows — group separator row + 6 match rows per group
    const tableRows = []

    GROUP_LETTERS.forEach(letter => {
      const letterMatches = gMatches.filter(m => m.group === letter)
      if (!letterMatches.length) return

      // Group separator
      tableRows.push([{
        content: `  GROUP ${letter}`,
        colSpan: 5 + batchUsers.length,
        styles: {
          fillColor: GRPHDR,
          textColor: GOLD,
          fontStyle:  'bold',
          fontSize:   8.5,
          cellPadding: { top: 4, bottom: 4, left: 10, right: 8 },
        },
      }])

      letterMatches.forEach(m => {
        const resultStr = m.result
          ? `${m.result.home_goals}–${m.result.away_goals}`
          : '–'

        const pickCells = batchUsers.map(u => {
          const p = m.picks[u.id]
          if (!p) {
            return {
              content: '–',
              styles: { fillColor: [240,240,240], textColor: [170,170,170], fontSize: 7, halign: 'center' },
            }
          }
          const pal    = ptsPalette(p.pts)
          const score  = `${p.home_goals}–${p.away_goals}`
          const suffix = p.pts != null ? (p.pts > 0 ? ` +${p.pts}` : ' 0') : ''
          return {
            content: score + suffix,
            styles: {
              fillColor:  pal.fill,
              textColor:  pal.text,
              fontStyle:  'bold',
              fontSize:   7.5,
              halign:     'center',
            },
          }
        })

        tableRows.push([
          { content: String(m.no),  styles: { textColor: [170,170,170], fontSize: 6.5, halign: 'center' } },
          { content: letter,        styles: { textColor: [170,170,170], fontSize: 6.5, halign: 'center' } },
          { content: m.home,        styles: { textColor: DKGRAY, fontSize: 7 } },
          { content: m.away,        styles: { textColor: DKGRAY, fontSize: 7 } },
          {
            content: resultStr,
            styles: {
              fontStyle:  'bold',
              textColor:  m.result ? GOLDDK : [190,190,190],
              halign:     'center',
              fontSize:   8,
            },
          },
          ...pickCells,
        ])
      })
    })

    // Totals footer
    const footRow = [
      {
        content:  'TOTAL',
        colSpan:  5,
        styles:   { fontStyle: 'bold', textColor: DKGRAY, halign: 'right', fontSize: 8 },
      },
      ...batchUsers.map(u => ({
        content: `${totals[u.id] ?? 0} pts`,
        styles:  { fontStyle: 'bold', textColor: GOLDDK, halign: 'center', fontSize: 8 },
      })),
    ]

    // Build header row
    const headRow = [
      { content: '#',      styles: { halign: 'center' } },
      { content: 'Grp',    styles: { halign: 'center' } },
      { content: 'Home Team' },
      { content: 'Away Team' },
      { content: 'Result', styles: { halign: 'center' } },
      ...batchUsers.map(u => ({ content: u.username, styles: { halign: 'center' } })),
    ]

    autoTable(doc, {
      startY:             HDR_H + 4,
      head:               [headRow],
      body:               tableRows,
      foot:               [footRow],
      headStyles:         {
        fillColor:  [35, 33, 20],
        textColor:  GOLD,
        fontStyle:  'bold',
        fontSize:   7.5,
        lineColor:  [80, 72, 40],
        lineWidth:  0.4,
      },
      bodyStyles:         { textColor: DKGRAY, fillColor: WHITE, fontSize: 7 },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      footStyles:         {
        fillColor:  [235, 235, 235],
        textColor:  DKGRAY,
        fontStyle:  'bold',
        lineColor:  [200,200,200],
        lineWidth:  0.3,
      },
      margin:             { left: MARGIN, right: MARGIN, top: HDR_H + 4 },
      styles:             {
        cellPadding: 2.5,
        lineColor:   [220, 220, 220],
        lineWidth:   0.25,
        overflow:    'ellipsize',
      },
      columnStyles:       colStyles,
      showHead:           'everyPage',
      showFoot:           'lastPage',
      didDrawPage:        drawPageHeader,
    })
  })

  doc.save(`wc2026-picks-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ── On-screen table row ────────────────────────────────────────────────────────
function MatchRow({ m, users }) {
  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/20">
      <td className="px-2 py-1.5 text-gray-600 tabular-nums text-center">{m.no}</td>
      <td className="px-2 py-1.5 text-gray-500 text-center">{m.group}</td>
      <td className="px-3 py-1.5 text-gray-200">{m.home}</td>
      <td className="px-2 py-1.5 font-bold tabular-nums text-center text-fifa-gold">
        {m.result ? `${m.result.home_goals}–${m.result.away_goals}` : <span className="text-gray-700">–</span>}
      </td>
      <td className="px-3 py-1.5 text-gray-200">{m.away}</td>
      {users.map(u => {
        const p = m.picks[u.id]
        if (!p) return (
          <td key={u.id} className="text-center px-2 py-1.5 text-gray-700 text-[11px]">–</td>
        )
        return (
          <td key={u.id} className="px-1.5 py-1">
            <span className={`flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums ${ptsBadgeClass(p.pts)}`}>
              {p.home_goals}–{p.away_goals}
              {p.pts != null && (
                <span className="opacity-75 font-normal text-[10px] ml-0.5">
                  {p.pts > 0 ? `+${p.pts}` : '0'}
                </span>
              )}
            </span>
          </td>
        )
      })}
    </tr>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────
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

  // ── No report yet ────────────────────────────────────────────────────────────
  if (!report) {
    return (
      <div className="card text-center py-12 space-y-4">
        <div className="text-5xl">📊</div>
        <div>
          <h3 className="font-bold text-white mb-1">Picks Report</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">
            Generates a full breakdown of every participant's group-stage predictions.
            Export as <strong className="text-white">CSV</strong> (Excel-ready) or{' '}
            <strong className="text-white">PDF</strong> (printable, colour-coded).
          </p>
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={generate} disabled={loading} className="btn-primary mx-auto px-8">
          {loading ? '⏳ Loading…' : '📊 Generate Report'}
        </button>
      </div>
    )
  }

  const { users, matches, totals, generated_at } = report
  const gMatches   = matches.filter(m => m.round === 'Group')
  const resultsIn  = gMatches.filter(m => m.result).length

  // ── Report view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header bar */}
      <div className="card flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {users.length} participants · {gMatches.length} group-stage matches · {resultsIn} results in
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
            className="text-xs bg-emerald-800 hover:bg-emerald-700 text-white font-semibold px-4 py-1.5 rounded-lg"
          >
            ⬇ CSV
          </button>
          <button
            onClick={() => downloadPDF(report)}
            className="text-xs bg-red-800 hover:bg-red-700 text-white font-semibold px-4 py-1.5 rounded-lg"
          >
            ⬇ PDF
          </button>
        </div>
      </div>

      {/* Standings summary */}
      <div className="card">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Standings</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
          {users.map((u, i) => (
            <div key={u.id} className="flex items-center gap-2">
              <span className="text-sm w-6 text-center shrink-0">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (
                  <span className="text-xs text-gray-600">#{i+1}</span>
                )}
              </span>
              <span className="flex-1 text-sm text-white truncate">{u.username}</span>
              <span className="text-sm font-black text-fifa-gold tabular-nums shrink-0">{totals[u.id] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Picks matrix — group stage only */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-xs min-w-max border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-900 border-b border-gray-700">
              <th className="px-2 py-2 text-gray-500 font-semibold text-center w-8">#</th>
              <th className="px-2 py-2 text-gray-500 font-semibold text-center w-8">Grp</th>
              <th className="px-3 py-2 text-gray-400 font-semibold text-left">Home</th>
              <th className="px-2 py-2 text-gray-500 font-semibold text-center w-10">Score</th>
              <th className="px-3 py-2 text-gray-400 font-semibold text-left">Away</th>
              {users.map(u => (
                <th key={u.id} className="px-2 py-2 text-center min-w-[64px]">
                  <span className="block text-fifa-gold font-bold truncate max-w-[60px]">{u.username}</span>
                  <span className="block text-gray-600 font-normal text-[10px]">{totals[u.id] ?? 0} pts</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUP_LETTERS.map(letter => {
              const letterMatches = gMatches.filter(m => m.group === letter)
              if (!letterMatches.length) return null
              return (
                <>
                  <tr key={`hdr-${letter}`} className="bg-gray-800/80">
                    <td
                      colSpan={5 + users.length}
                      className="px-3 py-1.5 text-xs font-bold text-fifa-gold tracking-widest uppercase"
                    >
                      Group {letter}
                    </td>
                  </tr>
                  {letterMatches.map(m => (
                    <MatchRow key={m.id} m={m} users={users} />
                  ))}
                </>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-600 bg-gray-900/80 sticky bottom-0">
              <td colSpan={5} className="px-3 py-2 text-xs font-bold text-gray-300 text-right">TOTAL</td>
              {users.map(u => (
                <td key={u.id} className="text-center px-2 py-2 font-black text-fifa-gold tabular-nums">
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
