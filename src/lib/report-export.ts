/**
 * Report export helpers (spec §8: ?format=csv|xlsx).
 * CSV is UTF-8 with BOM (Excel-friendly); XLSX via ExcelJS.
 */
import ExcelJS from 'exceljs'
import { NextResponse } from 'next/server'

export type Cell = string | number | null

export async function exportResponse(opts: {
  filename: string
  format: string
  title: string
  headers: string[]
  rows: Cell[][]
}): Promise<NextResponse> {
  if (opts.format === 'csv') {
    const esc = (v: Cell) => {
      const s = v === null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
    }
    const csv = [opts.headers, ...opts.rows].map((r) => r.map(esc).join(',')).join('\r\n')
    return new NextResponse('\uFEFF' + csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${opts.filename}.csv"`,
      },
    })
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(opts.title.slice(0, 31))
  ws.addRow(opts.headers)
  for (const r of opts.rows) ws.addRow(r.map((c) => (c === null ? '' : c)))
  ws.getRow(1).font = { bold: true }
  ws.columns.forEach((col) => {
    let max = 10
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      max = Math.max(max, String(cell.value ?? '').length + 2)
    })
    col.width = Math.min(40, max)
  })
  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${opts.filename}.xlsx"`,
    },
  })
}
