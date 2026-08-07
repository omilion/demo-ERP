import { useState } from 'react'
import { Btn, Icon } from '../shared'

const CUERPO_OPTIONS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// Cada campo se guarda con SELECT de valores ya usados (para no repetir
// "Bodega 3" vs "bodega3" vs "Bod. 3" entre operarios distintos) mas la
// opcion de escribir uno nuevo la primera vez que se necesita.
function CampoConSelect({ label, value, onChange, existentes, placeholder }) {
  const [modoNuevo, setModoNuevo] = useState(!existentes.length)
  if (modoNuevo) {
    return (
      <div>
        <label style={labelStyle}>{label} <span style={{ color: 'var(--red)' }}>*</span></label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} style={inputStyle} autoFocus />
          {!!existentes.length && <button type="button" onClick={() => setModoNuevo(false)} style={linkBtnStyle}>Elegir existente</button>}
        </div>
      </div>
    )
  }
  return (
    <div>
      <label style={labelStyle}>{label} <span style={{ color: 'var(--red)' }}>*</span></label>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={value} onChange={event => onChange(event.target.value)} style={inputStyle}>
          <option value="">Seleccionar...</option>
          {existentes.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <button type="button" onClick={() => { onChange(''); setModoNuevo(true) }} style={linkBtnStyle}>+ Nueva</button>
      </div>
    </div>
  )
}

export default function UbicacionEstructuradaModal({ ubicacionesExistentes, onClose, onCreate, creating }) {
  const [sucursal, setSucursal] = useState('')
  const [area, setArea] = useState('')
  const [estante, setEstante] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [nivel, setNivel] = useState('')
  const [error, setError] = useState('')

  const distinctValues = campo => Array.from(new Set(ubicacionesExistentes.map(u => u[campo]).filter(Boolean))).sort()
  const sucursales = distinctValues('sucursal')
  const areas = distinctValues('area')

  const nombre = [sucursal, area, estante, cuerpo, nivel].map(v => v.trim()).join('-')
  const completo = [sucursal, area, estante, cuerpo, nivel].every(v => v.trim())

  const confirmar = async () => {
    if (!completo) { setError('Completa los 5 campos.'); return }
    try {
      await onCreate({ sucursal: sucursal.trim(), area: area.trim(), estante: estante.trim(), cuerpo: cuerpo.trim(), nivel: nivel.trim() })
    } catch (cause) {
      setError(cause?.response?.data?.error || 'No se pudo crear la ubicación.')
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 800, background: 'oklch(0 0 0 / .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={event => event.stopPropagation()} style={{ background: '#fff', width: 420, maxWidth: '100%', borderRadius: 12, boxShadow: '0 16px 48px oklch(0 0 0 / .2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Nueva ubicación física</div>
          <button onClick={onClose} title="Cerrar" style={{ padding: 4, color: 'var(--text-3)' }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <CampoConSelect label="Sucursal" value={sucursal} onChange={setSucursal} existentes={sucursales} placeholder="Ej: Forestal, 5 Oriente, Santa Inés" />
          <CampoConSelect label="Área / Bodega" value={area} onChange={setArea} existentes={areas} placeholder="Ej: Bodega 1" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Estante <span style={{ color: 'var(--red)' }}>*</span></label>
              <input value={estante} onChange={event => setEstante(event.target.value)} placeholder="01" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Cuerpo <span style={{ color: 'var(--red)' }}>*</span></label>
              <select value={cuerpo} onChange={event => setCuerpo(event.target.value)} style={inputStyle}>
                <option value="">-</option>
                {CUERPO_OPTIONS.map(letra => <option key={letra} value={letra}>{letra}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Nivel <span style={{ color: 'var(--red)' }}>*</span></label>
              <input value={nivel} onChange={event => setNivel(event.target.value)} placeholder="01" style={inputStyle} />
            </div>
          </div>
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '9px 12px', fontFamily: "'DM Mono',monospace", fontSize: 13, color: nombre.replace(/-+/g, '') ? 'var(--text-1)' : 'var(--text-3)' }}>
            {nombre.replace(/^-+|-+$/g, '') || 'Sucursal-Área-Estante-Cuerpo-Nivel'}
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" onClick={confirmar} disabled={!completo || creating}>{creating ? 'Creando...' : 'Crear ubicación'}</Btn>
        </div>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }
const inputStyle = { width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', background: '#fff' }
const linkBtnStyle = { border: 0, background: 'none', color: 'var(--blue)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
