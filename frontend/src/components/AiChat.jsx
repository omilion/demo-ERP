import { useState, useRef, useEffect } from 'react'
import { Icon } from './shared'
import { Markdown } from './Markdown'
import { useAuthStore } from '../store/auth'
import { streamChat } from '../api/ai'

const SUGGESTIONS = [
  '¿Cuántas ODT pendientes hay y cuántas atrasadas?',
  'Resumen de ventas del mes actual',
  'Genera un Excel con el stock crítico',
]

const WELCOME = { role: 'assistant', content: 'Hola. Soy el Asistente Gerencial de Plastimar. Puedo consultar ventas, taller, caja, CRM, inventario y RRHH en vivo, y generar reportes en Excel o PowerPoint. ¿Qué necesitas?' }

export function AiChat() {
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toolStatus, setToolStatus] = useState(null)
  const scrollRef = useRef()
  const abortRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open, toolStatus])

  // Solo gerencia (admin) tiene acceso al asistente por ahora.
  if (user?.role !== 'admin') return null

  const TOOL_LABELS = {
    consultar_ventas: 'Consultando ventas…',
    consultar_taller: 'Consultando taller…',
    consultar_caja: 'Consultando caja…',
    consultar_crm: 'Consultando CRM…',
    consultar_stock: 'Consultando inventario…',
    consultar_rrhh: 'Consultando RRHH…',
    generar_excel: 'Generando Excel…',
    generar_pptx: 'Generando PowerPoint…',
  }

  const send = (text) => {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    const history = [...messages].filter(m => m !== WELCOME)
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setLoading(true)
    setToolStatus(null)

    // Placeholder de respuesta que se va llenando con el stream.
    setMessages(m => [...m, { role: 'assistant', content: '', documents: [] }])
    const updateLast = (fn) => setMessages(m => {
      const copy = [...m]
      copy[copy.length - 1] = fn(copy[copy.length - 1])
      return copy
    })

    const controller = new AbortController()
    abortRef.current = controller

    streamChat({
      messages: [...history, { role: 'user', content: q }],
      signal: controller.signal,
      onText: (delta) => { setToolStatus(null); updateLast(a => ({ ...a, content: a.content + delta })) },
      onTool: ({ name }) => setToolStatus(TOOL_LABELS[name] || 'Consultando datos…'),
      onDocument: ({ url, tipo }) => updateLast(a => ({ ...a, documents: [...(a.documents || []), { url, tipo }] })),
      onDone: () => { setLoading(false); setToolStatus(null); abortRef.current = null },
      onError: (msg) => {
        setToolStatus(null); setLoading(false); abortRef.current = null
        updateLast(a => ({ ...a, content: a.content || `⚠️ ${msg}`, error: !a.content }))
      },
    })
  }

  const panelStyle = expanded
    ? {
        position: 'fixed', top: 24, bottom: 24, right: 24, left: 24, zIndex: 200,
        width: 'auto', height: 'auto', maxWidth: 1100, margin: '0 auto', borderRadius: 16,
        animation: 'fadeUp 0.2s ease',
      }
    : {
        position: 'fixed', bottom: 90, right: 28, zIndex: 200,
        width: 390, height: 540, borderRadius: 16,
        animation: 'fadeUp 0.2s ease',
      }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} title="Asistente Gerencial IA" style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 200,
        width: 50, height: 50, borderRadius: '50%', background: 'var(--green-900)',
        boxShadow: '0 4px 20px oklch(0 0 0 / 0.22)', border: '2px solid var(--green-700)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        transition: 'transform 0.18s',
      }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? <Icon name="x" size={18} color="#fff" /> : <Icon name="messageSquare" size={20} color="#fff" />}
      </button>

      {open && (
        <div style={{ ...panelStyle, background: '#fff', boxShadow: '0 12px 48px oklch(0 0 0 / 0.17)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ background: 'var(--green-900)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--green-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="messageSquare" size={14} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>Asistente Gerencial IA</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Datos en vivo del ERP</div>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-400, #4ade80)', display: 'inline-block' }} />
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>Conectado</span>
            </span>
            <button onClick={() => setExpanded(e => !e)} title={expanded ? 'Reducir' : 'Pantalla completa'}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}>
              <Icon name={expanded ? 'minimize' : 'maximize'} size={14} color="#fff" />
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: m.role === 'assistant' ? (expanded ? '96%' : '92%') : '86%',
                  padding: '9px 13px', fontSize: 13, lineHeight: 1.5,
                  background: m.role === 'user' ? 'var(--green-900)' : 'var(--bg)',
                  color: m.role === 'user' ? '#fff' : 'var(--text-1)',
                  borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                  border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal',
                }}>
                  {m.role === 'assistant'
                    ? (m.content ? <Markdown text={m.content} /> : (loading && i === messages.length - 1 ? '…' : ''))
                    : m.content}
                  {(m.documents || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {m.documents.map((d, j) => (
                        <a key={j} href={d.url} target="_blank" rel="noreferrer" download style={{
                          display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600,
                          color: 'var(--green-700)', background: '#fff', border: '1px solid var(--green-600)',
                          borderRadius: 8, padding: '7px 11px', textDecoration: 'none',
                        }}>
                          <Icon name="download" size={13} /> Descargar {d.tipo === 'pptx' ? 'PowerPoint' : 'Excel'}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {toolStatus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', padding: '7px 13px', fontSize: 12, color: 'var(--text-3)', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green-600)', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                {toolStatus}
              </div>
            )}
            {messages.length === 1 && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Sugerencias</span>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} style={{
                    textAlign: 'left', fontSize: 13, padding: '9px 13px', borderRadius: 10,
                    border: '1px solid var(--border)', background: '#fff', color: 'var(--text-2)', cursor: 'pointer', transition: 'all 0.13s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--green-50)'; e.currentTarget.style.borderColor = 'var(--green-100)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = 'var(--border)' }}
                  >{s}</button>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Pregunta sobre ventas, taller, caja…" rows={1}
                style={{ flex: 1, borderRadius: 10, border: '1px solid var(--border)', padding: '9px 13px', fontSize: 14, fontFamily: 'inherit', resize: 'none', outline: 'none', background: 'var(--bg)', color: 'var(--text-1)', lineHeight: 1.4 }}
                onFocus={e => e.target.style.borderColor = 'var(--green-600)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              <button onClick={() => send()} disabled={!input.trim() || loading} style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: (!input.trim() || loading) ? 'var(--border)' : 'var(--green-900)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
              }}>
                <Icon name="send" size={15} color="#fff" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
