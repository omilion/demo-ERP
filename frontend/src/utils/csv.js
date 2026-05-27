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

function cleanCell(value) {
  if (value == null) return ''
  return typeof value === 'string' ? value.trim() : value
}

function uniqueHeader(header, index, used) {
  const base = String(header || '').trim() || `columna_${index + 1}`
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }
  used.add(candidate)
  return candidate
}

export function tableRowsToObjects(tableRows) {
  const table = (tableRows || [])
    .map(row => (Array.isArray(row) ? row : []).map(cleanCell))
    .filter(row => row.some(value => String(value ?? '').trim() !== ''))

  if (!table.length) return { headers: [], rows: [] }

  const used = new Set()
  const headers = table[0].map((header, index) => uniqueHeader(header, index, used))
  const rows = table.slice(1)
    .map(row => Object.fromEntries(headers.map((header, index) => [header, cleanCell(row[index])])))
    .filter(row => Object.values(row).some(value => String(value ?? '').trim() !== ''))

  return { headers, rows }
}

function fileExtension(file) {
  return String(file?.name || '').split('.').pop()?.toLowerCase() || ''
}

export async function parseTabularFile(file) {
  const ext = fileExtension(file)
  if (ext === 'csv' || file?.type === 'text/csv') {
    const parsed = parseCsv(await file.text())
    return { ...parsed, format: 'CSV' }
  }

  if (ext === 'xlsx' || file?.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    const table = await readXlsxFile(file)
    const parsed = tableRowsToObjects(table)
    return { ...parsed, format: 'Excel XLSX' }
  }

  throw new Error('Formato no soportado. Use CSV o Excel .xlsx.')
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
