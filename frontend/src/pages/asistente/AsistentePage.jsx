import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/shared'
import { Markdown } from '../../components/Markdown'
import { useAuthStore } from '../../store/auth'
import {
  streamChat, useConversaciones, useConversacion,
  useCrearConversacion, useGuardarMensajes, useEliminarConversacion,
} from '../../api/ai'

const WELCOME = { role: 'assistant', content: 'Hola. Soy el Asistente Gerencial de Plastimar. Puedo consultar ventas, taller, caja, CRM, inventario y RRHH en vivo, y generar reportes en Excel o PowerPoint. ¿Qué necesitas?' }

const TOOL_LABELS = {
  consultar_ventas: 'Consultando ventas…',
  ranking_ventas: 'Calculando ranking de ventas…',
  comparar_ventas_anios: 'Comparando ventas entre años…',
  consultar_comisiones: 'Calculando comisiones…',
  consultar_planillas: 'Consultando planillas de sueldo…',
  consultar_taller: 'Consultando taller…',
  consultar_caja: 'Consultando caja…',
  consultar_crm: 'Consultando CRM…',
  consultar_stock: 'Consultando inventario…',
  consultar_rrhh: 'Consultando RRHH…',
  generar_excel: 'Generando Excel…',
  generar_pptx: 'Generando PowerPoint…',
  consultar_documentacion: 'Buscando en la documentación…',
}

export default function AsistentePage() {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toolStatus, setToolStatus] = useState(null)
  const scrollRef = useRef()
  const abortRef = useRef(null)

  const { data: convData } = useConversaciones()
  const conversaciones = convData?.items || []
  const { data: convActiva } = useConversacion(activeId)
  const crearConv = useCrearConversacion()
  const guardarMensajes = useGuardarMensajes()
  const eliminarConv = useEliminarConversacion()

  // Al abrir una conversación existente, cargar sus mensajes.
  useEffect(() => {
    if (convActiva?.mensajes) {
      setMessages(convActiva.mensajes.length
        ? convActiva.mensajes.map(m => ({ role: m.role, content: m.content, documents: m.documents || [] }))
        : [WELCOME])
    }
  }, [convActiva])

  // Al venir desde el pop-up: ?conv=ID abre esa conversación; ?nueva arranca limpia.
  useEffect(() => {
    const conv = searchParams.get('conv')
    if (conv) {
      setActiveId(parseInt(conv, 10))
      setSearchParams({}, { replace: true })
    } else if (searchParams.get('nueva')) {
      setActiveId(null)
      setMessages([WELCOME])
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, toolStatus])

  if (user?.role !== 'admin') return <main style={{ padding: 24 }}>No tienes acceso al asistente.</main>

  const nuevaConversacion = () => {
    setActiveId(null)
    setMessages([WELCOME])
    setInput('')
  }

  const send = async (text) => {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    const history = messages.filter(m => m !== WELCOME)

    // Asegurar conversación: crear si es la primera vez.
    let convId = activeId
    if (!convId) {
      try {
        const created = await crearConv.mutateAsync({ primerMensaje: q })
        convId = created.id
        setActiveId(created.id)
      } catch {
        // Si falla la persistencia, igual seguimos el chat (no bloquear).
      }
    }

    setMessages(m => [...m, { role: 'user', content: q }, { role: 'assistant', content: '', documents: [] }])
    setLoading(true)
    setToolStatus(null)

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
      onDone: () => {
        setLoading(false); setToolStatus(null); abortRef.current = null
        // Persistir el turno completo (pregunta + respuesta) en la conversación.
        if (convId) {
          setMessages(curr => {
            const ultima = curr[curr.length - 1]
            const turno = [{ role: 'user', content: q }, { role: 'assistant', content: ultima.content, documents: ultima.documents || [] }]
            guardarMensajes.mutate({ id: convId, mensajes: turno })
            return curr
          })
        }
      },
      onError: (msg) => {
        setToolStatus(null); setLoading(false); abortRef.current = null
        updateLast(a => ({ ...a, content: a.content || `⚠️ ${msg}`, error: !a.content }))
      },
    })
  }

  return (
    <main style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Sidebar de historial */}
      <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <button onClick={nuevaConversacion} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px', borderRadius: 8, border: 'none', background: 'var(--green-900)', color: '#fff',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            <Icon name="plusCircle" size={15} color="#fff" /> Nueva conversación
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {conversaciones.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>Sin conversaciones aún.</div>
          )}
          {conversaciones.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 7, marginBottom: 2, cursor: 'pointer',
              background: c.id === activeId ? 'var(--green-50)' : 'transparent',
            }}
              onClick={() => setActiveId(c.id)}
              onMouseEnter={e => c.id !== activeId && (e.currentTarget.style.background = '#fff')}
              onMouseLeave={e => c.id !== activeId && (e.currentTarget.style.background = 'transparent')}
            >
              <Icon name="messageSquare" size={13} color="var(--text-3)" />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titulo}</span>
              <button onClick={e => { e.stopPropagation(); if (confirm('¿Eliminar esta conversación?')) { eliminarConv.mutate(c.id); if (c.id === activeId) nuevaConversacion() } }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }} title="Eliminar">
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <section style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
        <div style={{ background: 'var(--green-900)', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--green-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="messageSquare" size={14} color="#fff" />
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Asistente Gerencial IA</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Datos en vivo del ERP</div>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: m.role === 'assistant' ? '80%' : '70%',
                padding: '10px 15px', fontSize: 14, lineHeight: 1.55,
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
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', maxWidth: 900, margin: '0 auto' }}>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Pregunta sobre ventas, taller, caja…" rows={1}
              style={{ flex: 1, borderRadius: 10, border: '1px solid var(--border)', padding: '11px 15px', fontSize: 14, fontFamily: 'inherit', resize: 'none', outline: 'none', background: 'var(--bg)', color: 'var(--text-1)', lineHeight: 1.4 }}
            />
            <button onClick={() => send()} disabled={!input.trim() || loading} style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: (!input.trim() || loading) ? 'var(--border)' : 'var(--green-900)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
            }}>
              <Icon name="send" size={16} color="#fff" />
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
