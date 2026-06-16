// Renderer de markdown ligero, sin dependencias, para las respuestas del
// asistente IA. Cubre lo que el modelo genera: tablas GFM, **negrita**, listas
// con viñetas/numeradas, encabezados y párrafos. No interpreta HTML (seguro).

function renderInline(text, keyPrefix) {
  // Negrita **...** → <strong>. Se parte por el delimitador.
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={`${keyPrefix}-b${i}`}>{p.slice(2, -2)}</strong>
    }
    return <span key={`${keyPrefix}-t${i}`}>{p}</span>
  })
}

function splitRow(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => c.trim())
}

const isTableSep = line => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')

export function Markdown({ text }) {
  const lines = String(text || '').split('\n')
  const blocks = []
  let i = 0
  let listBuf = null // { ordered, items: [] }

  const flushList = () => {
    if (listBuf) {
      const Tag = listBuf.ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag key={`l${blocks.length}`} style={{ margin: '4px 0', paddingLeft: 20 }}>
          {listBuf.items.map((it, j) => <li key={j} style={{ marginBottom: 2 }}>{renderInline(it, `li${blocks.length}-${j}`)}</li>)}
        </Tag>,
      )
      listBuf = null
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // Tabla: fila con | seguida de una fila separadora |---|---|
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushList()
      const header = splitRow(line)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]))
        i++
      }
      blocks.push(
        <div key={`tw${blocks.length}`} style={{ overflowX: 'auto', margin: '6px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
            <thead>
              <tr>{header.map((h, j) => (
                <th key={j} style={{ textAlign: 'left', padding: '6px 9px', background: 'var(--green-900)', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', border: '1px solid var(--green-700)' }}>{renderInline(h, `th${j}`)}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} style={{ background: ri % 2 ? 'var(--bg)' : '#fff' }}>
                  {r.map((c, ci) => <td key={ci} style={{ padding: '5px 9px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{renderInline(c, `td${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Encabezado markdown (#, ##, ###)
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      flushList()
      const size = [16, 15, 14, 13][h[1].length - 1] || 13
      blocks.push(<div key={`h${blocks.length}`} style={{ fontWeight: 700, fontSize: size, margin: '8px 0 4px' }}>{renderInline(h[2], `h${blocks.length}`)}</div>)
      i++; continue
    }

    // Lista con viñetas (-, *) o numerada (1.)
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      if (!listBuf || listBuf.ordered !== ordered) { flushList(); listBuf = { ordered, items: [] } }
      listBuf.items.push((bullet || numbered)[1])
      i++; continue
    }

    // Línea en blanco → separa párrafos
    if (!line.trim()) { flushList(); i++; continue }

    // Párrafo normal (acumula líneas consecutivas)
    flushList()
    const paraLines = [line]
    i++
    while (i < lines.length && lines[i].trim() && !lines[i].includes('|') && !/^\s*[-*]\s+/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      paraLines.push(lines[i]); i++
    }
    blocks.push(<div key={`p${blocks.length}`} style={{ margin: '2px 0', lineHeight: 1.5 }}>{renderInline(paraLines.join(' '), `p${blocks.length}`)}</div>)
  }
  flushList()

  return <>{blocks}</>
}
