// G11: utility CSV/Excel-compatible (con BOM UTF-8 para Excel)
export function rowsToCsv(rows, columns) {
  if (!Array.isArray(rows) || !columns?.length) return ''
  const esc = v => {
    if (v == null) return ''
    const s = v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ') : String(v)
    if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const header = columns.map(c => esc(c.label || c.key)).join(';')
  const lines = rows.map(r => columns.map(c => {
    const v = typeof c.format === 'function' ? c.format(r[c.key], r) : r[c.key]
    return esc(v)
  }).join(';'))
  // BOM \uFEFF para que Excel detecte UTF-8
  return '\uFEFF' + header + '\n' + lines.join('\n')
}

export function sendCsv(reply, filename, csv) {
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(csv)
}
