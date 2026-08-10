// Componentes JSX compartidos entre DespachosPage.jsx y las paginas de
// formulario de despachos/guias. Constantes/funciones puras en shared.js.
import { Badge, Btn } from '../../components/shared'
import { useRegiones, useComunas } from '../../api/locations'
import { TRANSPORTISTAS } from '../../utils/facturacion'
import { packingResumen, input, grid } from './shared'

const numberFmt = value => Number(value || 0).toLocaleString('es-CL')

export function Mono({ children, strong = false, muted = false }) {
  return <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: strong ? 700 : 500, color: muted ? 'var(--text-3)' : undefined }}>{children}</span>
}

export function Field({ label, children }) {
  return <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}><span style={{ display: 'block', marginBottom: 5 }}>{label}</span>{children}</label>
}

export function Footer({ saving, onClose, onSave, closeLabel = 'Cancelar' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
      <Btn variant="ghost" onClick={onClose} disabled={saving}>{closeLabel}</Btn>
      <Btn variant="primary" icon="check" onClick={onSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Btn>
    </div>
  )
}

export function PackingProgress({ row }) {
  const resumen = packingResumen(row)
  const tone = resumen.estado === 'Completo' ? 'green' : resumen.estado === 'Parcial' ? 'amber' : 'gray'
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <Badge tone={tone}>{resumen.estado}</Badge>
        <Mono strong>{resumen.pct}%</Mono>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: 'oklch(0.92 0.003 220)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, resumen.pct)}%`, background: resumen.estado === 'Completo' ? 'var(--green-600)' : 'var(--amber)' }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--text-3)' }}>
        {numberFmt(resumen.entregados)}/{numberFmt(resumen.total)} entregados
      </div>
    </div>
  )
}

// Campos de logistica del despacho, reutilizados tal cual en DespachoFormPage
// (standalone) y dentro de GuiaFormPage (crear despacho sin salir del flujo).
export function DespachoCamposFields({ form, set }) {
  const { data: regiones = [] } = useRegiones()
  const regionSel = regiones.find(r => r.nombre === form.region)
  const { data: comunas = [] } = useComunas(regionSel?.codigo)
  const transporteEsOtro = !!form.transporte && !TRANSPORTISTAS.includes(form.transporte)

  return (
    <>
      <div style={grid}>
        <Field label="Fecha límite de entrega (plazo)"><input type="date" value={form.plazoEntrega || ''} onChange={e => set('plazoEntrega', e.target.value)} style={input} /></Field>
        <Field label="Fecha entrega"><input type="date" value={form.fechaEntrega || ''} onChange={e => set('fechaEntrega', e.target.value)} style={input} /></Field>
        <Field label="Tipo"><input value={form.tipoDespacho || ''} onChange={e => set('tipoDespacho', e.target.value)} style={input} /></Field>
        <Field label="Transporte">
          <select value={(!!form.transporte && !TRANSPORTISTAS.includes(form.transporte)) ? 'Otro' : (form.transporte || '')} onChange={e => set('transporte', e.target.value === 'Otro' ? '' : e.target.value)} style={input}>
            <option value="">Seleccionar...</option>
            {TRANSPORTISTAS.map(t => <option key={t} value={t}>{t}</option>)}
            <option value="Otro">Otro: indicar</option>
          </select>
          {(transporteEsOtro || form.transporte === '') && (
            <input value={transporteEsOtro ? form.transporte : ''} onChange={e => set('transporte', e.target.value)} placeholder="Nombre del transportista" style={{ ...input, marginTop: 6 }} />
          )}
        </Field>
        <Field label="N° de seguimiento"><input value={form.numeroSeguimiento || ''} onChange={e => set('numeroSeguimiento', e.target.value)} style={input} /></Field>
        <Field label="Monto envío"><input value={form.montoEnvio || ''} onChange={e => set('montoEnvio', e.target.value)} style={input} /></Field>
        <Field label="Contacto"><input value={form.contacto || ''} onChange={e => set('contacto', e.target.value)} style={input} /></Field>
        <Field label="Correo contacto despacho *"><input type="email" required value={form.emailContacto || ''} onChange={e => set('emailContacto', e.target.value)} placeholder="contacto@cliente.cl" style={input} /></Field>
        <Field label="Región">
          <select value={form.region || ''} onChange={e => { set('region', e.target.value); set('comuna', '') }} style={input}>
            <option value="">Seleccionar región...</option>
            {regiones.map(r => <option key={r.codigo} value={r.nombre}>{r.nombre}</option>)}
          </select>
        </Field>
        <Field label="Comuna">
          <select value={form.comuna || ''} onChange={e => set('comuna', e.target.value)} style={input} disabled={!form.region}>
            <option value="">{form.region ? 'Seleccionar comuna...' : 'Elige región primero'}</option>
            {comunas.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Direccion"><textarea value={form.direccion || ''} onChange={e => set('direccion', e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} /></Field>
    </>
  )
}
