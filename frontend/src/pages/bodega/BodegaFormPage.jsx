import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, useForm } from '../../components/forms/index'
import { useAuthStore } from '../../store/auth'
import { useProducto, useUpdateProducto, useCreateProducto, useHistorialPrecios, useAddPrecio } from '../../api/productos'

function PrecioHistorial({ historial }) {
  if (!historial.length) return null

  const fmt = n => '$' + Number(n).toLocaleString('es-CL')
  const fmtDate = iso => new Date(iso).toLocaleString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  return (
    <>
      <FormDivider label="Historial de precios" />
      <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['Fecha', 'Precio anterior', 'Precio nuevo', 'Variación', 'Usuario'].map(h => (
                <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {historial.map((e, i) => {
              const up = Number(e.pct) > 0
              return (
                <tr key={i} style={{ borderBottom: i < historial.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '9px 14px', color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}>{fmtDate(e.createdAt)}</td>
                  <td style={{ padding: '9px 14px', fontFamily: "'DM Mono', monospace", color: 'var(--text-3)' }}>{fmt(e.precioAnterior)}</td>
                  <td style={{ padding: '9px 14px', fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--text-1)' }}>{fmt(e.precioNuevo)}</td>
                  <td style={{ padding: '9px 14px' }}>
                    <span style={{ color: up ? 'var(--red)' : 'var(--green-600)', fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                      {up ? '↑' : '↓'} {Math.abs(Number(e.pct))}%
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>{e.usuarioNombre}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function BodegaFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const user = useAuthStore(s => s.user)

  const { data: found } = useProducto(isEdit ? Number(id) : null)
  const createProducto = useCreateProducto()
  const updateProducto = useUpdateProducto()
  const { data: historial = [] } = useHistorialPrecios(found?.id)
  const addPrecio = useAddPrecio()

  const { data, set, errors, validate } = useForm({
    cod: '', nombre: '', cat: 'Espumas', bodega: 'Inventario', stock: '', minimo: '', precio: '',
  })

  useEffect(() => {
    if (found) {
      set('cod', found.codigoInterno)
      set('nombre', found.nombre)
      set('cat', found.categoria || 'Espumas')
      set('bodega', found.bodega)
      set('stock', String(found.stock))
      set('minimo', String(found.stockCritico))
      set('precio', String(found.precioLista))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.id])

  if (isEdit && !found) return <main style={{ padding: 24 }}><p>Cargando...</p></main>

  const handleSave = () => {
    if (!validate({ nombre: { required: true }, cod: { required: true } })) return
    const payload = {
      nombre: data.nombre,
      categoria: data.cat,
      bodega: data.bodega,
      stock: Number(data.stock),
      stockCritico: Number(data.minimo),
      precioLista: Number(data.precio),
    }
    if (isEdit && found && Number(data.precio) !== found.precioLista) {
      addPrecio.mutate({
        productoId: found.id,
        data: { precioAnterior: found.precioLista, precioNuevo: Number(data.precio), usuarioNombre: user?.email || 'sistema' },
      })
    }
    if (isEdit) {
      updateProducto.mutate({ id: found.id, data: payload }, { onSuccess: () => navigate('/bodega') })
    } else {
      createProducto.mutate({ ...payload, codigoInterno: data.cod }, { onSuccess: () => navigate('/bodega') })
    }
  }

  const saving = updateProducto.isPending || createProducto.isPending

  return (
    <FormPage
      title={isEdit ? 'Editar Producto' : 'Nuevo Producto'}
      subtitle={isEdit ? `Editando código ${data.cod}` : 'Registrar producto en bodega'}
      breadcrumb={['Inicio', 'Bodega', isEdit ? 'Editar Producto' : 'Nuevo Producto']}
      onSave={handleSave}
      saving={saving}
    >
      <FormDivider label="Identificación" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Código" required error={errors.cod}>
          <Input value={data.cod} onChange={v => set('cod', v)} placeholder="ESP-001" error={errors.cod} />
        </FormField>
        <FormField label="Categoría">
          <Select value={data.cat} onChange={v => set('cat', v)} options={['Espumas','Viscoelástico','Telas','Maderas','Colchones','Fibras','Accesorios','Látex','Bases','Protectores']} />
        </FormField>
      </div>
      <FormField label="Nombre / Descripción" required error={errors.nombre}>
        <Input value={data.nombre} onChange={v => set('nombre', v)} placeholder="Espuma Alta Densidad 15cm 2x1" error={errors.nombre} />
      </FormField>
      <FormField label="Bodega">
        <Select value={data.bodega} onChange={v => set('bodega', v)} options={['Inventario','Taller']} />
      </FormField>

      <FormDivider label="Stock y Precio" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Stock actual" hint="Unidades">
          <Input value={data.stock} onChange={v => set('stock', v)} type="number" placeholder="0" />
        </FormField>
        <FormField label="Stock mínimo" hint="Alerta bajo">
          <Input value={data.minimo} onChange={v => set('minimo', v)} type="number" placeholder="0" />
        </FormField>
        <FormField label="Precio">
          <Input value={data.precio} onChange={v => set('precio', v)} type="number" prefix="$" placeholder="0" />
        </FormField>
      </div>

      <PrecioHistorial historial={historial} />
    </FormPage>
  )
}
