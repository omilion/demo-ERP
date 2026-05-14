// Util genérico para exportar listas a CSV (Excel-compatible)

function esc(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(rows, columns) {
  // columns: [{ key, label, fmt? }]
  const header = columns.map(c => esc(c.label || c.key)).join(',')
  const lines = rows.map(r =>
    columns.map(c => {
      const val = typeof c.key === 'function' ? c.key(r) : r[c.key]
      return esc(c.fmt ? c.fmt(val, r) : val)
    }).join(',')
  )
  // BOM para que Excel detecte UTF-8 con acentos
  return '\uFEFF' + [header, ...lines].join('\r\n')
}

export function csvReply(reply, filename, rows, columns) {
  const csv = toCsv(rows, columns)
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${filename}.csv"`)
    .send(csv)
}
