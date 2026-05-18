import { useState, useRef, useEffect } from 'react'
import { Icon } from './shared'

const SUGGESTIONS = [
  'Que podra consultar cuando se conecte',
  'Estado de implementacion del asistente',
  'Que falta para activar RAG',
]

export function AiChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'El asistente IA aun no esta conectado al RAG del ERP. Por ahora este panel solo deja visible el acceso futuro.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef()

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open])

  const send = (text) => {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setLoading(true)
    setTimeout(() => {
      setMessages([...next, {
        role: 'assistant',
        content: 'Pendiente de implementacion: falta conectar embeddings, busqueda semantica, permisos de consulta y respuestas con datos reales del ERP.',
      }])
      setLoading(false)
    }, 500)
  }

  const panelStyle = {
    position: 'fixed', bottom: 90, right: 28, zIndex: 200,
    width: 370, height: 500, borderRadius: 16,
    animation: 'fadeUp 0.2s ease',
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} title="Asistente IA pendiente" style={{
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
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>Asistente Plastimar IA</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>RAG pendiente de conexion</div>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>No conectado</span>
            </span>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '84%', padding: '9px 13px', fontSize: 13, lineHeight: 1.5,
                  background: m.role === 'user' ? 'var(--green-900)' : 'var(--bg)',
                  color: m.role === 'user' ? '#fff' : 'var(--text-1)',
                  borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                  border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: 4, padding: '9px 13px', background: 'var(--bg)', borderRadius: '14px 14px 14px 3px', border: '1px solid var(--border)', alignSelf: 'flex-start' }}>
                {[0, 1, 2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green-600)', display: 'inline-block' }} />)}
              </div>
            )}
            {messages.length === 1 && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0 }}>Sugerencias</span>
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
                placeholder="Consulta no conectada aun" rows={1}
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
