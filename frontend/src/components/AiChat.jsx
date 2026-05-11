import { useState, useRef, useEffect } from 'react'
import { Icon } from './shared'

const SUGGESTIONS = [
  '¿Qué área necesita atención urgente?',
  'Resume OTs prioritarias por taller',
  '¿Cuánto hay en ventas no pagadas?',
  'Stock crítico — ¿qué hacer?',
]

export function AiChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hola 👋 Soy el asistente IA de Plastimar. ¿En qué te ayudo?' }
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
      setMessages([...next, { role: 'assistant', content: 'Esta función estará disponible cuando se conecte el RAG del ERP.' }])
      setLoading(false)
    }, 900)
  }

  const renderContent = (text) => text.split('\n').filter(Boolean).map((line, i) => {
    if (line.startsWith('- ') || line.startsWith('• ')) return <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3 }}><span style={{ color: 'var(--green-600)', flexShrink: 0 }}>•</span><span>{line.slice(2)}</span></div>
    if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{ fontWeight: 600, marginBottom: 4 }}>{line.slice(2, -2)}</div>
    return <div key={i} style={{ marginBottom: 4 }}>{line}</div>
  })

  const panelStyle = {
    position: 'fixed', bottom: 90, right: 28, zIndex: 200,
    width: 370, height: 500, borderRadius: 16,
    animation: 'fadeUp 0.2s ease',
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} title="Asistente IA" style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 200,
        width: 50, height: 50, borderRadius: '50%', background: 'var(--green-900)',
        boxShadow: '0 4px 20px oklch(0 0 0 / 0.22)', border: '2px solid var(--green-700)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        transition: 'transform 0.18s',
      }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open
          ? <Icon name="x" size={18} color="#fff" />
          : <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <circle cx="9" cy="10" r="1" fill="white" stroke="none"/>
              <circle cx="12" cy="10" r="1" fill="white" stroke="none"/>
              <circle cx="15" cy="10" r="1" fill="white" stroke="none"/>
            </svg>
        }
        {!open && <span style={{ position: 'absolute', top: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: 'var(--amber)', border: '2px solid var(--green-900)' }} />}
      </button>

      {open && (
        <div style={{ ...panelStyle, background: '#fff', boxShadow: '0 12px 48px oklch(0 0 0 / 0.17)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ background: 'var(--green-900)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--green-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="messageSquare" size={14} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>Asistente Plastimar IA</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>RAG · Datos en tiempo real</div>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Online</span>
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
                  {m.role === 'assistant' ? renderContent(m.content) : m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: 4, padding: '9px 13px', background: 'var(--bg)', borderRadius: '14px 14px 14px 3px', border: '1px solid var(--border)', alignSelf: 'flex-start' }}>
                {[0,1,2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green-600)', display: 'inline-block' }} />)}
              </div>
            )}
            {messages.length === 1 && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Sugerencias</span>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => send(s)} style={{
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
                placeholder="Pregunta sobre ventas, stock, OTs…" rows={1}
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
