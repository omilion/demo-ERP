import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, useForm, useSave } from '../../components/forms/index'
import { useCliente, useCreateCliente, useUpdateCliente } from '../../api/clientes'

export default function ClientesFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const { data: found, isLoading } = useCliente(isEdit ? Number(id) : null)

  const { data, set, errors, validate } = useForm({
    rut: '', nombre: '', razonSocial: '', giro: '', tipo: 'Empresa',
    direccion: '', region: '', comuna: '', ciudad: '',
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
      set('ciudad', found.ciudad || '')
      set('email', found.email || '')
      set('telefono', found.telefono || '')
      set('segmento', found.segmento || 'C')
      set('limiteCredito', found.limiteCredito != null ? String(found.limiteCredito) : '')
      set('diasInactivoAlerta', found.diasInactivoAlerta != null ? String(found.diasInactivoAlerta) : '')
    }
  }, [found])

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
      ciudad: data.ciudad || undefined,
      email: data.email || undefined,
      telefono: data.telefono || undefined,
      segmento: data.segmento || undefined,
      limiteCredito: data.limiteCredito ? Number(data.limiteCredito) : undefined,
      diasInactivoAlerta: data.diasInactivoAlerta ? Number(data.diasInactivoAlerta) : undefined,
    }

    if (isEdit) {
      const { rut, ...updatePayload } = payload
      updateMutation.mutate(
        { id: Number(id), data: updatePayload },
        {
          onSuccess: () => navigate('/clientes'),
          onError: (err) => alert(err?.response?.data?.error || 'Error al guardar'),
        }
      )
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => navigate('/clientes'),
        onError: (err) => alert(err?.response?.data?.error || 'Error al guardar'),
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
          <Input value={data.rut} onChange={v => set('rut', v)} placeholder="76123456-7" error={errors.rut} disabled={isEdit} />
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
        <FormField label="Región">
          <Input value={data.region} onChange={v => set('region', v)} placeholder="Valparaíso" />
        </FormField>
        <FormField label="Comuna">
          <Input value={data.comuna} onChange={v => set('comuna', v)} placeholder="Viña del Mar" />
        </FormField>
        <FormField label="Ciudad">
          <Input value={data.ciudad} onChange={v => set('ciudad', v)} placeholder="Viña del Mar" />
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

      {isEdit && found && <HistorialCliente cliente={found} navigate={navigate} />}
    </FormPage>
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
      <FormDivider label={`Historial · ${ventas.length} ventas · ${odts.length} ODT`} />
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
                {['Fecha', 'ODT', 'Taller', 'Estado'].map(h => (
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
