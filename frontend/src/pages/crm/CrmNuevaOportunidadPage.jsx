import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Btn, PageHeader } from '../../components/shared'
import { useCrmCatalogos, useCrmCreate } from '../../api/crm'
import { toast } from '../../store/notif'

const input = { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, background: '#fff', font: 'inherit', fontSize: 13, boxSizing: 'border-box' }
const fallbackFlows = [
  { canal: 'WEB', tipoVenta: 'VENTA_WEB', etiqueta: 'Venta Web' },
  { canal: 'LICITACION', tipoVenta: 'LICITACION', etiqueta: 'Licitacion' },
]

export default function CrmNuevaOportunidadPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const create = useCrmCreate()
  const { data: catalogos } = useCrmCatalogos()
  const flows = catalogos?.flujosComerciales || fallbackFlows
  const initialCanal = searchParams.get('canal')
  const selectedCanal = flows.some(flow => flow.canal === initialCanal) && initialCanal !== 'WEB' ? initialCanal : 'LICITACION'
  const [form, setForm] = useState({ nombre: '', rsocial: '', rut: '', email: '', telefono: '', prioridad: 'Media', canalVenta: selectedCanal, comentarios: '' })
  const selected = flows.find(flow => flow.canal === form.canalVenta) || flows[0]
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  const continueToQuote = async () => {
    if (!form.nombre.trim() && !form.rsocial.trim()) return toast.warning('Indica un contacto o razon social')
    if (!form.email.trim() && !form.telefono.trim()) return toast.warning('Indica correo o telefono de contacto')
    try {
      const crm = await create.mutateAsync({ ...form, canalVenta: selected.canal, tipoVenta: selected.tipoVenta })
      const paths = {
        WEB: `/ventas/nueva?tipo=Venta%20Web&crmId=${crm.id}`,
        LICITACION: `/crm/nueva/licitacion?crmId=${crm.id}`,
      }
      navigate(paths[selected.canal])
    } catch (error) { toast.error(error.response?.data?.error || 'No se pudo crear la oportunidad') }
  }
  return <main className="page page-wide">
    <PageHeader title="Nueva oportunidad y cotizacion" subtitle="Crea la oportunidad y continua en el formato comercial real del canal." breadcrumb={['Inicio', 'Ventas', 'CRM', 'Nueva oportunidad']} actions={<Btn variant="secondary" size="sm" onClick={() => navigate('/crm')}>Volver al CRM</Btn>} />
    <section style={{ maxWidth: 980, margin: '0 auto', border: '1px solid var(--border)', borderRadius: 12, background: '#fff', padding: 24 }}>
      <div style={{ marginBottom: 22, padding: '13px 15px', borderRadius: 9, background: '#f0fdf4', border: '1px solid #bbf7d0' }}><strong>Primero identificamos la oportunidad.</strong><div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>Al continuar se abrira la cotizacion completa de {selected?.etiqueta || 'este canal'}, con sus productos, precios y validaciones reales.</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        <Field label="Canal comercial"><div style={{ ...input, background: 'var(--bg)', color: 'var(--text-2)' }}>{selected?.etiqueta || '—'}</div></Field>
        <Field label="Formato de cotizacion"><div style={{ ...input, background: 'var(--bg)', color: 'var(--text-2)' }}>{selected?.etiqueta || '—'}</div></Field>
        <Field label="Nombre contacto"><input value={form.nombre} onChange={set('nombre')} style={input} /></Field>
        <Field label="Razon social"><input value={form.rsocial} onChange={set('rsocial')} style={input} /></Field>
        <Field label="RUT"><input value={form.rut} onChange={set('rut')} style={input} /></Field>
        <Field label="Correo"><input type="email" value={form.email} onChange={set('email')} style={input} /></Field>
        <Field label="Telefono"><input value={form.telefono} onChange={set('telefono')} style={input} /></Field>
        <Field label="Prioridad"><select value={form.prioridad} onChange={set('prioridad')} style={input}><option>Alta</option><option>Media</option><option>Baja</option></select></Field>
        <Field label="Contexto comercial" full><textarea value={form.comentarios} onChange={set('comentarios')} rows={4} style={{ ...input, resize: 'vertical' }} placeholder="Antecedentes para el ejecutivo y la cotizacion..." /></Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}><Btn variant="secondary" onClick={() => navigate('/crm')}>Cancelar</Btn><Btn variant="primary" onClick={continueToQuote} disabled={create.isPending}>{create.isPending ? 'Creando oportunidad...' : `Continuar a cotizacion ${selected?.etiqueta || ''}`}</Btn></div>
    </section>
  </main>
}

function Field({ label, children, full = false }) {
  return <label style={{ display: 'block', gridColumn: full ? '1 / -1' : 'auto', fontSize: 12, fontWeight: 650, color: 'var(--text-2)' }}><span style={{ display: 'block', marginBottom: 6 }}>{label}</span>{children}</label>
}
