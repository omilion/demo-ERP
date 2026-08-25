import { toast } from '../../store/notif'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, useForm } from '../../components/forms/index'
import { useCliente, useCreateCliente, useUpdateCliente, useCreateClienteSucursal, useUpdateClienteSucursal } from '../../api/clientes'
import { PAISES_LATAM, REGIONES_CHILE, COMUNAS_POR_REGION } from '../../data/geoLatam'

// Si el valor guardado no calza con ninguna opcion del desplegable (dato legacy
// sin normalizar, o de un pais sin division en el catalogo), se agrega como
// opcion extra al final para no perderlo silenciosamente al editar.
function withCurrentValue(options, current) {
  if (!current || options.includes(current)) return options
  return [...options, current]
}

export default function ClientesFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const { data: found, isLoading } = useCliente(isEdit ? Number(id) : null, isEdit ? { includeInactivos: 'true' } : {})

  const { data, set, errors, validate } = useForm({
    rut: '', nombre: '', razonSocial: '', giro: '', tipo: 'Empresa',
    direccion: '', region: '', comuna: '', pais: 'Chile',
    email: '', telefono: '', segmento: 'C',
    limiteCredito: '', diasInactivoAlerta: '',
  })

  useEffect(() => {
    if (found) {
      set('rut', found.rut || '')
      set('nombre', found.nombre || '')
      set('razonSocial', found.razonSocial || '')
      set('giro', found.giro || '')
      set('tipo', found.tipo || 'Empresa')
      set('direccion', found.direccion || '')
      set('region', found.region || '')
      set('comuna', found.comuna || '')
      set('pais', found.pais || 'Chile')
      set('email', found.email || '')
      set('telefono', found.telefono || '')
      set('segmento', found.segmento || 'C')
      set('limiteCredito', found.limiteCredito != null ? String(found.limiteCredito) : '')
      set('diasInactivoAlerta', found.diasInactivoAlerta != null ? String(found.diasInactivoAlerta) : '')
    }
  }, [found, set])

  const createMutation = useCreateCliente()
  const updateMutation = useUpdateCliente()

  const saving = createMutation.isPending || updateMutation.isPending

  const handleSave = () => {
    if (!validate({ nombre: { required: true }, rut: { required: true } })) return

    const payload = {
      rut: data.rut,
      nombre: data.nombre,
      razonSocial: data.razonSocial || undefined,
      giro: data.giro || undefined,
      tipo: data.tipo || undefined,
      direccion: data.direccion || undefined,
      region: data.region || undefined,
      comuna: data.comuna || undefined,
      pais: data.pais || undefined,
      email: data.email || undefined,
      telefono: data.telefono || undefined,
      segmento: data.segmento || undefined,
      limiteCredito: data.limiteCredito ? Number(data.limiteCredito) : undefined,
      diasInactivoAlerta: data.diasInactivoAlerta ? Number(data.diasInactivoAlerta) : undefined,
    }

    if (isEdit) {
      updateMutation.mutate(
        { id: Number(id), data: payload },
        {
          onSuccess: () => navigate('/clientes'),
          onError: (err) => toast.error(err?.response?.data?.error || 'Error al guardar'),
        }
      )
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => navigate('/clientes'),
        onError: (err) => toast.error(err?.response?.data?.error || 'Error al guardar'),
      })
    }
  }

  if (isEdit && isLoading) return <main style={{ padding: 24 }}><p>Cargando...</p></main>

  return (
    <FormPage
      title={isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}
      subtitle={isEdit ? `Editando cliente #${id}` : 'Registrar nuevo cliente en el sistema'}
      breadcrumb={['Inicio', 'Clientes', isEdit ? 'Editar Cliente' : 'Nuevo Cliente']}
      onSave={handleSave}
      saving={saving}
    >
      <FormDivider label="Identificación" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="RUT / Identificador" required error={errors.rut}>
          <Input value={data.rut} onChange={v => set('rut', v)} placeholder="76123456-7" error={errors.rut} />
        </FormField>
        <FormField label="Tipo de Cliente">
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']} />
        </FormField>
      </div>
      <FormField label="Nombre" required error={errors.nombre}>
        <Input value={data.nombre} onChange={v => set('nombre', v)} placeholder="Nombre comercial" error={errors.nombre} />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Razón Social" hint="Como en SII">
          <Input value={data.razonSocial} onChange={v => set('razonSocial', v)} placeholder="Razón social legal" />
        </FormField>
        <FormField label="Giro" hint="Actividad económica">
          <Input value={data.giro} onChange={v => set('giro', v)} placeholder="Ej: Comercio al por mayor" />
        </FormField>
      </div>

      <FormDivider label="Dirección" />
      <FormField label="Dirección">
        <Input value={data.direccion} onChange={v => set('direccion', v)} placeholder="Calle 123, Of. 4" />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="País">
          <Select value={data.pais} onChange={v => { set('pais', v); if (v !== 'Chile') { set('region', ''); set('comuna', '') } }} options={withCurrentValue(PAISES_LATAM, data.pais)} />
        </FormField>
        <FormField label="Región">
          {data.pais === 'Chile'
            ? <Select value={data.region} onChange={v => { set('region', v); set('comuna', '') }} options={['', ...withCurrentValue(REGIONES_CHILE, data.region)]} />
            : <Input value={data.region} onChange={v => set('region', v)} placeholder="Región / provincia" />}
        </FormField>
        <FormField label="Comuna">
          {data.pais === 'Chile'
            ? <Select value={data.comuna} onChange={v => set('comuna', v)} options={['', ...withCurrentValue(COMUNAS_POR_REGION[data.region] || [], data.comuna)]} disabled={!data.region} />
            : <Input value={data.comuna} onChange={v => set('comuna', v)} placeholder="Comuna / distrito" />}
        </FormField>
      </div>

      <FormDivider label="Contacto" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Email">
          <Input value={data.email} onChange={v => set('email', v)} type="email" placeholder="correo@empresa.cl" />
        </FormField>
        <FormField label="Teléfono">
          <Input value={data.telefono} onChange={v => set('telefono', v)} placeholder="+56 32 000 0000" />
        </FormField>
      </div>

      <FormDivider label="Crédito y segmentación" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Segmento" hint="A=Top, B=Medio, C=Base">
          <Select value={data.segmento} onChange={v => set('segmento', v)} options={['A', 'B', 'C']} />
        </FormField>
        <FormField label="Límite de Crédito" hint="0 = sin límite">
          <Input value={data.limiteCredito} onChange={v => set('limiteCredito', v)} type="number" prefix="$" placeholder="0" />
        </FormField>
        <FormField label="Días inactivo alerta" hint="Avisa si no compra">
          <Input value={data.diasInactivoAlerta} onChange={v => set('diasInactivoAlerta', v)} type="number" placeholder="90" />
        </FormField>
      </div>

      {isEdit && found?.activo === false && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 14, color: 'var(--text-2)', fontSize: 13, background: 'var(--bg)' }}>
          Cliente inactivo: puedes corregir sus datos generales, pero las sucursales se administran despues de reactivarlo.
        </div>
      )}
      {isEdit && found && found.activo !== false && <SucursalesCliente cliente={found} />}
      {isEdit && found && <HistorialCliente cliente={found} navigate={navigate} />}
    </FormPage>
  )
}

function SucursalesCliente({ cliente }) {
  const [form, setForm] = useState({ nombre: '', direccion: '', region: '', comuna: '', ciudad: '', pais: 'Chile', contacto: '', telefono: '', email: '', isPrincipal: false })
  const [editingId, setEditingId] = useState(null)
  const createSucursal = useCreateClienteSucursal()
  const updateSucursal = useUpdateClienteSucursal()
  const sucursales = cliente.sucursales || []
  const saving = createSucursal.isPending || updateSucursal.isPending

  function edit(s) {
    setEditingId(s.id)
    setForm({
      nombre: s.nombre || '',
      direccion: s.direccion || '',
      region: s.region || '',
      comuna: s.comuna || '',
      ciudad: s.ciudad || '',
      pais: s.pais || 'Chile',
      contacto: s.contacto || '',
      telefono: s.telefono || '',
      email: s.email || '',
      isPrincipal: !!s.isPrincipal,
    })
  }

  function reset() {
    setEditingId(null)
    setForm({ nombre: '', direccion: '', region: '', comuna: '', ciudad: '', pais: 'Chile', contacto: '', telefono: '', email: '', isPrincipal: false })
  }

  function save() {
    if (!form.nombre.trim()) { toast.warning('Nombre de sucursal requerido'); return }
    const data = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && !v.trim() ? undefined : v]))
    if (editingId) {
      updateSucursal.mutate({ clienteId: cliente.id, sucursalId: editingId, data }, { onSuccess: reset, onError: e => toast.error(e.response?.data?.error || 'Error al guardar sucursal') })
    } else {
      createSucursal.mutate({ clienteId: cliente.id, data }, { onSuccess: reset, onError: e => toast.error(e.response?.data?.error || 'Error al crear sucursal') })
    }
  }

  const field = (key, value) => setForm(f => ({ ...f, [key]: value }))

  return (
    <>
      <FormDivider label={`Sucursales / direcciones (${sucursales.length})`} />
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        {sucursales.length === 0
          ? <div style={{ padding: 16, color: 'var(--text-3)', fontSize: 13 }}>Sin sucursales registradas.</div>
          : sucursales.map(s => (
            <button key={s.id} type="button" onClick={() => edit(s)} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1fr', gap: 12, width: '100%', padding: '10px 14px', borderBottom: '1px solid var(--border)', textAlign: 'left', background: '#fff', cursor: 'pointer' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{s.nombre} {s.isPrincipal ? <span style={{ color: 'var(--green-700)', fontSize: 11 }}>(Principal)</span> : null}</span>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{[s.direccion, s.comuna, s.ciudad, s.region].filter(Boolean).join(', ') || '-'}</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.contacto || s.telefono || '-'}</span>
            </button>
          ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
        <FormField label="Nombre"><Input value={form.nombre} onChange={v => field('nombre', v)} placeholder="Casa matriz, sede norte..." /></FormField>
        <FormField label="Direccion"><Input value={form.direccion} onChange={v => field('direccion', v)} placeholder="Calle y numero" /></FormField>
        <FormField label="País">
          <Select value={form.pais} onChange={v => { field('pais', v); if (v !== 'Chile') { field('region', ''); field('comuna', '') } }} options={withCurrentValue(PAISES_LATAM, form.pais)} />
        </FormField>
        <FormField label="Región">
          {form.pais === 'Chile'
            ? <Select value={form.region} onChange={v => { field('region', v); field('comuna', '') }} options={['', ...withCurrentValue(REGIONES_CHILE, form.region)]} />
            : <Input value={form.region} onChange={v => field('region', v)} />}
        </FormField>
        <FormField label="Comuna">
          {form.pais === 'Chile'
            ? <Select value={form.comuna} onChange={v => field('comuna', v)} options={['', ...withCurrentValue(COMUNAS_POR_REGION[form.region] || [], form.comuna)]} disabled={!form.region} />
            : <Input value={form.comuna} onChange={v => field('comuna', v)} />}
        </FormField>
        <FormField label="Ciudad"><Input value={form.ciudad} onChange={v => field('ciudad', v)} /></FormField>
        <FormField label="Contacto"><Input value={form.contacto} onChange={v => field('contacto', v)} /></FormField>
        <FormField label="Telefono"><Input value={form.telefono} onChange={v => field('telefono', v)} /></FormField>
        <FormField label="Email"><Input type="email" value={form.email} onChange={v => field('email', v)} /></FormField>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-2)' }}>
            <input type="checkbox" checked={form.isPrincipal} onChange={e => field('isPrincipal', e.target.checked)} />
            Principal
          </label>
          <button type="button" onClick={save} disabled={saving} style={smallBtn('var(--green-700)', saving)}>{editingId ? 'Actualizar' : 'Agregar'}</button>
          {editingId && <button type="button" onClick={reset} style={smallBtn('var(--text-2)')}>Cancelar</button>}
        </div>
      </div>
    </>
  )
}

function HistorialCliente({ cliente, navigate }) {
  const ventas = cliente.ventas || []
  const odts = cliente.odts || []
  const fmt = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-CL') : '—'

  if (ventas.length === 0 && odts.length === 0) return null

  return (
    <>
      <FormDivider label={`Historial · ${ventas.length} ventas · ${odts.length} OT`} />
      {ventas.length > 0 && (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 12, maxHeight: 280, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Fecha', 'N° / Tipo', 'Estado', 'Pago', 'Entrega', 'Total'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventas.map(v => (
                <tr key={v.id} onClick={() => navigate(`/ventas/${v.id}/editar`)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: '8px 14px', fontFamily: "'DM Mono', monospace" }}>{fmtDate(v.createdAt)}</td>
                  <td style={{ padding: '8px 14px' }}>#{v.id} · {v.tipo || '—'}</td>
                  <td style={{ padding: '8px 14px' }}>{v.estado}</td>
                  <td style={{ padding: '8px 14px' }}>{v.estadoPago}</td>
                  <td style={{ padding: '8px 14px' }}>{v.estadoEntrega || '—'}</td>
                  <td style={{ padding: '8px 14px', fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{fmt(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {odts.length > 0 && (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Fecha', 'OT', 'Taller', 'Estado'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {odts.map(o => (
                <tr key={o.id} onClick={() => navigate(`/odts/${o.id}`)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: '8px 14px', fontFamily: "'DM Mono', monospace" }}>{fmtDate(o.createdAt)}</td>
                  <td style={{ padding: '8px 14px', fontWeight: 600 }}>#{o.id}</td>
                  <td style={{ padding: '8px 14px' }}>{o.taller || '—'}</td>
                  <td style={{ padding: '8px 14px' }}>{o.estado || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

const smallBtn = (color, disabled = false) => ({
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: '#fff',
  color,
  fontSize: 12,
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
})
