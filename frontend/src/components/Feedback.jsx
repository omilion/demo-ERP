import { useEffect, useRef, useState } from 'react'
import { useNotifStore } from '../store/notif'
import { Icon, Btn } from './shared'

// ── Toast Individual ──────────────────────────────────────────────────────────
function ToastItem({ id, type, message, onDismiss }) {
  useEffect(() => {
    const duration = type === 'error' || type === 'warning' ? 7000 : 4000
    const timer = setTimeout(() => onDismiss(id), duration)
    return () => clearTimeout(timer)
  }, [id, type, onDismiss])

  const styles = {
    success: { border: '1px solid var(--green-100)', bg: 'var(--green-50)', text: 'var(--green-700)', icon: 'checkCircle' },
    error:   { border: '1px solid var(--red-bg)',   bg: 'var(--red-bg)',   text: 'var(--red)',       icon: 'xCircle' },
    warning: { border: '1px solid var(--amber-bg)', bg: 'var(--amber-bg)', text: 'var(--amber)',     icon: 'alertTriangle' },
    info:    { border: '1px solid var(--blue-bg)',  bg: 'var(--blue-bg)',  text: 'var(--blue)',      icon: 'info' },
  }
  const config = styles[type] || styles.info

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 10,
        background: '#fff',
        borderLeft: `4px solid ${config.text}`,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
        animation: 'slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        maxWidth: 360,
        minWidth: 280,
        pointerEvents: 'auto',
      }}
    >
      <span style={{ color: config.text, marginTop: 1, flexShrink: 0 }}>
        <Icon name={config.icon} size={18} />
      </span>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)', lineHeight: 1.4 }}>
        {message}
      </div>
      <button
        onClick={() => onDismiss(id)}
        aria-label="Cerrar"
        style={{
          color: 'var(--text-3)',
          padding: 2,
          marginTop: -2,
          marginRight: -4,
          borderRadius: 4,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}

// ── Toaster Container ────────────────────────────────────────────────────────
export function Toaster() {
  const notifs = useNotifStore((s) => s.notifs)
  const dismiss = useNotifStore((s) => s.dismiss)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 96,
        right: 28,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {notifs.map((n) => (
        <ToastItem key={n.id} {...n} onDismiss={dismiss} />
      ))}
    </div>
  )
}

// ── Dialog Host (Confirm & Prompt Modals) ────────────────────────────────────
export function DialogHost() {
  const dialog = useNotifStore((s) => s.dialog)
  const [inputValue, setInputValue] = useState('')
  const containerRef = useRef(null)

  useEffect(() => {
    if (dialog) {
      // A newly opened prompt owns a fresh input value from the notification store.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInputValue(dialog.defaultValue || '')
      // Capture/trap focus
      setTimeout(() => {
        const input = containerRef.current?.querySelector('input, textarea')
        const confirmBtn = containerRef.current?.querySelector('.dialog-confirm-btn')
        if (input) {
          input.focus()
        } else if (confirmBtn) {
          confirmBtn.focus()
        }
      }, 50)
    }
  }, [dialog])

  // ESC handler to cancel
  useEffect(() => {
    if (!dialog) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        dialog.resolve(dialog.type === 'prompt' ? null : false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dialog])

  if (!dialog) return null

  const handleConfirm = (e) => {
    e.preventDefault()
    if (dialog.type === 'prompt') {
      dialog.resolve(inputValue)
    } else {
      dialog.resolve(true)
    }
  }

  const handleCancel = () => {
    dialog.resolve(dialog.type === 'prompt' ? null : false)
  }

  // Trap focus (Tab cycling)
  const handleTabKey = (e) => {
    if (e.key !== 'Tab') return
    const focusable = containerRef.current?.querySelectorAll('button, input, textarea')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (e.shiftKey) {
      if (document.activeElement === first) {
        last.focus()
        e.preventDefault()
      }
    } else {
      if (document.activeElement === last) {
        first.focus()
        e.preventDefault()
      }
    }
  }

  const isDanger = dialog.tone === 'danger'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onKeyDown={handleTabKey}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={handleCancel}
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px var(--border)',
          width: '100%',
          maxWidth: 440,
          overflow: 'hidden',
          animation: 'dropIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ padding: '20px 24px 16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {isDanger && (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'var(--red-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--red)',
                  flexShrink: 0,
                }}
              >
                <Icon name="alertTriangle" size={20} />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <h2
                id="dialog-title"
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--text-1)',
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {dialog.title || 'Confirmación'}
              </h2>
              {dialog.detail && (
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-3)',
                    marginTop: 8,
                    lineHeight: 1.45,
                  }}
                >
                  {dialog.detail}
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleConfirm}>
            {dialog.type === 'prompt' && (
              <div style={{ marginTop: 16 }}>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={dialog.placeholder || 'Escriba aquí…'}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: '#fff',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    color: 'var(--text-1)',
                    outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--green-600)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 24,
              }}
            >
              <Btn variant="ghost" size="sm" onClick={handleCancel}>
                Cancelar
              </Btn>
              <Btn
                type="submit"
                variant={isDanger ? 'danger' : 'primary'}
                size="sm"
                className="dialog-confirm-btn"
              >
                {dialog.confirmLabel || (dialog.type === 'prompt' ? 'Aceptar' : 'Confirmar')}
              </Btn>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
