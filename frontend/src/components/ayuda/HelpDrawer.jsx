import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useHelpDrawerStore } from '../../store/helpDrawer'
import { resolveHelpContext, searchHelpArticles } from '../../pages/ayuda/helpContextData'
import { useAuthStore } from '../../store/auth'
import { Icon } from '../shared'

export function HelpDrawer() {
  const { isOpen, close, searchTerm, setSearchTerm } = useHelpDrawerStore()
  const location = useLocation()
  const user = useAuthStore(state => state.user)
  const [showChecklist, setShowChecklist] = useState(true)
  const [showWarnings, setShowWarnings] = useState(true)
  const [expandedSummary, setExpandedSummary] = useState(false)
  const inputRef = useRef(null)

  // Resolves contextual help according to the current location.pathname
  const context = useMemo(() => resolveHelpContext(location.pathname), [location.pathname])

  // Search results when user enters a search query
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return []
    return searchHelpArticles(searchTerm, user)
  }, [searchTerm, user])

  // Focus search input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  // Keyboard shortcut: Escape to close, F1 to toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F1') {
        e.preventDefault()
        useHelpDrawerStore.getState().toggle()
      }
      if (e.key === 'Escape' && isOpen) {
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

  const handleOpenFeedback = () => {
    close()
    window.dispatchEvent(new CustomEvent('open-pilot-feedback', {
      detail: { section: context.sectionTitle }
    }))
  }

  return (
    <>
      {/* Floating Trigger Tab on right edge when drawer is closed */}
      {!isOpen && (
        <button
          onClick={() => useHelpDrawerStore.getState().open()}
          title="Abrir Ayuda Rápida de esta vista (F1)"
          aria-label="Abrir panel de ayuda rápida contextual"
          style={{
            position: 'fixed',
            right: 0,
            top: '46%',
            transform: 'translateY(-50%)',
            zIndex: 1090,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            background: 'var(--green-700)',
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRight: 'none',
            borderTopLeftRadius: 8,
            borderBottomLeftRadius: 8,
            padding: '9px 6px',
            boxShadow: '-3px 4px 16px rgba(0, 0, 0, 0.18)',
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            transition: 'transform 0.18s ease, background 0.18s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-50%) translateX(-4px)'
            e.currentTarget.style.background = 'var(--green-800)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(-50%) translateX(0)'
            e.currentTarget.style.background = 'var(--green-700)'
          }}
        >
          <Icon name="helpCircle" size={16} color="#ffffff" />
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>
            Ayuda
          </span>
        </button>
      )}

      {/* Drawer and Backdrop when open */}
      {isOpen && (
        <>
          {/* Semi-transparent backdrop */}
      <div
        onClick={close}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.35)',
          backdropFilter: 'blur(1.5px)',
          zIndex: 1198,
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-label="Panel de Ayuda Rápida"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 440,
          maxWidth: '92vw',
          background: '#ffffff',
          boxShadow: '-6px 0 28px rgba(0, 0, 0, 0.16)',
          zIndex: 1199,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          animation: 'slideInRight 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header (Google Ads style) */}
        <header
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to bottom, #ffffff, #fafafa)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(4, 120, 87, 0.12)',
                color: 'var(--green-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="bookOpen" size={18} color="var(--green-700)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
                Ayuda rápida
              </h2>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>
                SisGestión 3.0 · Guías operativas
              </div>
            </div>
          </div>

          <button
            onClick={close}
            title="Cerrar ayuda (Esc)"
            style={{
              padding: 6,
              borderRadius: 6,
              color: 'var(--text-3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.06)'
              e.currentTarget.style.color = 'var(--text-1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-3)'
            }}
          >
            <Icon name="x" size={18} />
          </button>
        </header>

        {/* Search input */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
            }}
          >
            <Icon name="search" size={15} color="var(--text-3)" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar en la ayuda rápida..."
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 13,
                color: 'var(--text-1)',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                title="Limpiar búsqueda"
                style={{ padding: 2, color: 'var(--text-3)', display: 'flex' }}
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Body content (scrollable) */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* SEARCH RESULTS MODE */}
          {searchTerm.trim() ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 12 }}>
                RESULTADOS PARA “{searchTerm}” ({searchResults.length})
              </div>

              {searchResults.length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-3)' }}>
                  <Icon name="info" size={28} color="var(--text-3)" />
                  <p style={{ marginTop: 8, fontSize: 13 }}>No se encontraron manuales con ese término.</p>
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{ marginTop: 6, fontSize: 12, color: 'var(--green-700)', fontWeight: 600 }}
                  >
                    Ver ayuda relevante de esta página
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {searchResults.map((res, i) => (
                    <a
                      key={res.id + i}
                      href={res.href}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'block',
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: '#fff',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = res.tone || 'var(--green-700)'
                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: res.tone, textTransform: 'uppercase' }}>
                          {res.badge}
                        </span>
                        <Icon name="externalLink" size={12} color="var(--text-3)" />
                      </div>
                      <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                        {res.title}
                      </h4>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
                        {res.description}
                      </p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* CONTEXTUAL MODE (ADAPTS TO CURRENT VIEW) */
            <>
              {/* Context Section Header */}
              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: 'rgba(4, 120, 87, 0.08)',
                    color: 'var(--green-700)',
                    fontSize: 11,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-600)' }} />
                  Relevante para esta página: {context.sectionTitle}
                </div>

                {/* Primary Card (Hero card) */}
                <div
                  style={{
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: '#ffffff',
                    boxShadow: 'var(--shadow-sm)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '14px 16px',
                      background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
                      borderBottom: '1px solid rgba(4, 120, 87, 0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: '.04em',
                          color: '#047857',
                          background: 'rgba(4, 120, 87, 0.12)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {context.docId}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{context.sectionBadge}</span>
                    </div>

                    <h3 style={{ margin: '4px 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                      {context.sectionTitle}
                    </h3>

                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      {expandedSummary || context.summary.length <= 150
                        ? context.summary
                        : `${context.summary.slice(0, 145)}... `}
                      {context.summary.length > 150 && (
                        <button
                          onClick={() => setExpandedSummary(!expandedSummary)}
                          style={{ color: 'var(--green-700)', fontWeight: 600, fontSize: 12, padding: 0 }}
                        >
                          {expandedSummary ? 'Ver menos' : 'Ver más'}
                        </button>
                      )}
                    </p>
                  </div>

                  {/* Checklist & Operational Tips */}
                  {context.checklist && context.checklist.length > 0 && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <div
                        onClick={() => setShowChecklist(!showChecklist)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          ✓ Recomendaciones operativas
                        </span>
                        <Icon name={showChecklist ? 'chevronDown' : 'chevronRight'} size={14} color="var(--text-3)" />
                      </div>

                      {showChecklist && (
                        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                          {context.checklist.map((item, idx) => (
                            <li key={idx} style={{ marginBottom: 6 }}>
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Warnings / Puntos Críticos */}
                  {context.warnings && context.warnings.length > 0 && (
                    <div style={{ padding: '12px 16px', background: '#fffbeb', borderBottom: '1px solid #fef3c7' }}>
                      <div
                        onClick={() => setShowWarnings(!showWarnings)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Icon name="alertTriangle" size={13} color="#b45309" />
                          Puntos críticos / Qué evitar
                        </span>
                        <Icon name={showWarnings ? 'chevronDown' : 'chevronRight'} size={14} color="#92400e" />
                      </div>

                      {showWarnings && (
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#78350f', lineHeight: 1.45 }}>
                          {context.warnings.map((w, idx) => (
                            <li key={idx} style={{ marginBottom: 4 }}>
                              {w}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Action Link to Full Manual */}
                  <div style={{ padding: '10px 16px', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                    <a
                      href={context.href}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        color: 'var(--green-700)',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      <span>Abrir manual completo</span>
                      <Icon name="externalLink" size={13} color="var(--green-700)" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Related Topics Section */}
              {context.relatedArticles && context.relatedArticles.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Procedimientos y temas relacionados
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {context.relatedArticles.map((art) => (
                      <a
                        key={art.id}
                        href={art.href}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: '#fff',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'var(--green-600)'
                          e.currentTarget.style.background = '#f9fafb'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--border)'
                          e.currentTarget.style.background = '#fff'
                        }}
                      >
                        <div style={{ marginTop: 2, color: 'var(--green-700)', flexShrink: 0 }}>
                          <Icon name="fileText" size={15} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>
                            {art.title}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.35 }}>
                            {art.description}
                          </div>
                        </div>
                        <Icon name="chevronRight" size={13} color="var(--text-3)" style={{ marginTop: 3 }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Persistent Bottom Help Options (Google Ads style "¿Necesitas más ayuda?") */}
          <div
            style={{
              marginTop: 'auto',
              paddingTop: 16,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>
              ¿Necesitas más ayuda?
            </div>

            {/* Trigger to PilotFeedbackWidget */}
            <button
              onClick={handleOpenFeedback}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #fee2e2',
                background: '#fef2f2',
                color: '#991b1b',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fef2f2')}
            >
              <Icon name="alertTriangle" size={14} color="#dc2626" />
              <span>Reportar falla o duda en esta pantalla</span>
            </button>

            {/* Link to Full Help Center */}
            <a
              href="/ayuda/index.html"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: '#fff',
                color: 'var(--text-1)',
                fontSize: 12,
                fontWeight: 500,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <Icon name="book" size={14} color="var(--green-700)" />
              <span style={{ flex: 1 }}>Índice completo de manuales</span>
              <Icon name="externalLink" size={12} color="var(--text-3)" />
            </a>

            <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>
              Atajo de teclado: pulsa <kbd style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', background: '#f1f5f9', fontFamily: 'monospace' }}>F1</kbd> en cualquier vista
            </div>
          </div>
        </div>
      </aside>
        </>
      )}

      {/* Global CSS animations for Help Drawer */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  )
}
