import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm } from '../../components/forms/index'
import { useOdt, useCreateOdt, useUpdateOdt } from '../../api/odts'

export default function TallerFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const { data: found } = useOdt(isEdit ? Number(id) : null)
  const createOdt = useCreateOdt()
  const updateOdt = useUpdateOdt()

  const { data, set, errors, validate } = useForm({
    tipo: 'Espumas', clienteNombre: '', descripcion: '',
    estado: 'Pendiente', prioridad: 'normal', plazo: '',
  })

  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (found && !initialized) {
      set('tipo', found.tipo || 'Espumas')
      set('clienteNombre', found.clienteNombre ?? '')
      set('descripcion', found.descripcion ?? '')
      set('estado', found.estado || 'Pendiente')
      set('prioridad', found.prioridad || 'normal')
      set('plazo', found.plazo ? new Date(found.plazo).toISOString().slice(0, 10) : '')
      setInitialized(true)
    }
  }, [found?.id])

  const handleSave = () => {
    if (!validate({ descripcion: { required: true } })) return
    const payload = {
      tipo: data.tipo,
      clienteNombre: data.clienteNombre,
      descripcion: data.descripcion,
      estado: data.estado,
      prioridad: data.prioridad,
      plazo: data.plazo ? new Date(data.plazo).toISOString() : undefined,
    }
    if (isEdit) {
      updateOdt.mutate({ id: Number(id), data: payload }, {
        onSuccess: () => navigate('/taller'),
        onError: () => alert('Error al guardar la ODT'),
      })
    } else {
      createOdt.mutate(payload, {
        onSuccess: () => navigate('/taller'),
        onError: () => alert('Error al crear la ODT'),
      })
    }
  }

  return (
    <FormPage
      title={isEdit ? 'Editar ODT' : 'Nueva ODT'}
      subtitle={isEdit ? `Editando ODT #${id}` : 'Crear orden de trabajo'}
      breadcrumb={['Inicio', 'Taller', isEdit ? 'Editar ODT' : 'Nueva ODT']}
      onSave={handleSave}
      saving={createOdt.isPending || updateOdt.isPending}
    >
      <FormDivider label="Trabajo" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Tipo de Trabajo">
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Espumas', 'Confecciones', 'Madera', 'Externo']} />
        </FormField>
        <FormField label="Estado">
          <Select value={data.estado} onChange={v => set('estado', v)} options={['Pendiente', 'En proceso', 'Prioritaria', 'Terminada']} />
        </FormField>
        <FormField label="Prioridad">
          <Select value={data.prioridad} onChange={v => set('prioridad', v)} options={[
            { value: 'normal', label: 'Normal' },
            { value: 'alta', label: 'Alta' },
            { value: 'urgente', label: 'Urgente' },
          ]} />
        </FormField>
      </div>
      <FormField label="Cliente">
        <Input value={data.clienteNombre} onChange={v => set('clienteNombre', v)} placeholder="Nombre del cliente" />
      </FormField>
      <FormField label="Descripción del trabajo" required error={errors.descripcion}>
        <Textarea value={data.descripcion} onChange={v => set('descripcion', v)} placeholder="Detalle del trabajo a realizar" rows={3} error={errors.descripcion} />
      </FormField>
      <FormField label="Plazo de entrega">
        <Input type="date" value={data.plazo} onChange={v => set('plazo', v)} />
      </FormField>

      {isEdit && found?.items?.length > 0 && (
        <>
          <FormDivider label={`Items en proceso (${found.items.length})`} />
          <OdtItemsTable items={found.items} />
        </>
      )}
    </FormPage>
  )
}

const TALLER_TONE = {
  pendiente: 'gray', en_proceso: 'blue', 'en proceso': 'blue', listo: 'green', completado: 'green', cancelado: 'red',
}

function OdtItemsTable({ items }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map(it => (
        <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{it.nombre || it.codigoInterno || `Item #${it.id}`}</div>
              {it.codigoInterno && it.nombre && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{it.codigoInterno}</div>
              )}
              {it.obs && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{it.obs}</div>}
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600 }}>{it.cantidad} u.</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-muted)', textTransform: 'uppercase' }}>{it.estado}</span>
            </div>
          </div>
          {it.talleres && it.talleres.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
              {it.talleres.map(t => {
                const tone = TALLER_TONE[(t.estado || 'pendiente').toLowerCase()] || 'gray'
                return (
                  <div key={t.id} style={{ padding: 8, background: 'var(--bg-muted)', borderRadius: 6, fontSize: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong style={{ textTransform: 'capitalize', fontSize: 12 }}>{t.taller?.nombre || `Taller ${t.tallerId}`}</strong>
                      <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: `var(--${tone}-100, var(--bg-card))`, color: `var(--${tone}-700, var(--text-2))` }}>{t.estado}</span>
                    </div>
                    {t.fechaInicio && <div style={{ color: 'var(--text-3)' }}>Inicio: {new Date(t.fechaInicio).toLocaleDateString('es-CL')}</div>}
                    {t.fechaListo && <div style={{ color: 'var(--green-700)' }}>Listo: {new Date(t.fechaListo).toLocaleDateString('es-CL')}</div>}
                    {t.usuario && <div style={{ color: 'var(--text-3)' }}>Por: {t.usuario}{t.usuarioListo && ` → ${t.usuarioListo}`}</div>}
                    {t.obs && <div style={{ color: 'var(--text-2)', marginTop: 4, fontStyle: 'italic' }}>{t.obs}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
