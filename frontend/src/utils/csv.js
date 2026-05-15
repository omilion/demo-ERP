// Cliente: descarga CSV desde array de filas
import api from '../api/client'

// Descarga endpoint backend que ya devuelve CSV con auth
export async function downloadFromBackend(url, filename, params = {}) {
  const res = await api.get(url, { params, responseType: 'blob' })
  const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objUrl)
}

// Parsea CSV simple (separador detecta , o ;) — usado por importadores
export function parseCsv(text) {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) return { headers: [], rows: [] }
  const lines = trimmed.split(/\r?\n/)
  const sep = lines[0].includes(';') ? ';' : ','
  const split = (line) => {
    const out = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (c === sep && !inQ) {
        out.push(cur); cur = ''
      } else cur += c
    }
    out.push(cur)
    return out
  }
  const headers = split(lines[0]).map(h => h.trim())
  const rows = lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = split(l)
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? '']))
  })
  return { headers, rows }
}


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
