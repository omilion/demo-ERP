// Cliente: descarga CSV desde array de filas

function esc(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function downloadCsv(filename, rows, columns) {
  const header = columns.map(c => esc(c.label || c.key)).join(',')
  const lines = rows.map(r =>
    columns.map(c => {
      const val = typeof c.key === 'function' ? c.key(r) : r[c.key]
      return esc(c.fmt ? c.fmt(val, r) : val)
    }).join(',')
  )
  const csv = '\uFEFF' + [header, ...lines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
