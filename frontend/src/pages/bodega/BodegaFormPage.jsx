import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm } from '../../components/forms/index'
import { useAuthStore } from '../../store/auth'
import { useProducto, useUpdateProducto, useCreateProducto, useHistorialPrecios, useAddPrecio, useMovimientos, useAddMovimiento } from '../../api/productos'
import { useCategorias } from '../../api/categorias'

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
  const { data: categoriasApi = [] } = useCategorias()
  const createProducto = useCreateProducto()
  const updateProducto = useUpdateProducto()
  const { data: historial = [] } = useHistorialPrecios(found?.id)
  const addPrecio = useAddPrecio()

  const { data, set, errors, validate } = useForm({
    cod: '', nombre: '', cat: 'Espumas', bodega: 'Inventario', stock: '', minimo: '', precio: '',
    codigoBarra: '', proveedor: '', ubicacion: '', descripcion: '', precioMarco: '',
    idMarco: '', unidadMedida: '', estadoInventario: '',
    visibleWeb: false, destacadoWeb: false, fotoUrl: '', fotoUrlGrande: '',
    descripcionWeb: '', precioWeb: '', ordenWeb: '',
  })

  useEffect(() => {
    if (found) {
      set('cod', found.codigoInterno)
      set('nombre', found.nombre)
      set('cat', found.categoria || '')
      set('bodega', found.bodega)
      set('stock', String(found.stock))
      set('minimo', String(found.stockCritico))
      set('precio', String(found.precioLista))
      set('visibleWeb', !!found.visibleWeb)
      set('destacadoWeb', !!found.destacadoWeb)
      set('fotoUrl', found.fotoUrl || '')
      set('fotoUrlGrande', found.fotoUrlGrande || '')
      set('descripcionWeb', found.descripcionWeb || '')
      set('precioWeb', found.precioWeb != null ? String(found.precioWeb) : '')
      set('ordenWeb', found.ordenWeb != null ? String(found.ordenWeb) : '')
      set('codigoBarra', found.codigoBarra || '')
      set('proveedor', found.proveedor || '')
      set('ubicacion', found.ubicacion || '')
      set('descripcion', found.descripcion || '')
      set('precioMarco', found.precioMarco != null ? String(found.precioMarco) : '')
      set('idMarco', found.idMarco || '')
      set('unidadMedida', found.unidadMedida || '')
      set('estadoInventario', found.estadoInventario || '')
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
      codigoBarra: data.codigoBarra || undefined,
      proveedor: data.proveedor || undefined,
      ubicacion: data.ubicacion || undefined,
      descripcion: data.descripcion || undefined,
      precioMarco: data.precioMarco !== '' ? Number(data.precioMarco) : undefined,
      idMarco: data.idMarco || undefined,
      unidadMedida: data.unidadMedida || undefined,
      estadoInventario: data.estadoInventario || undefined,
      visibleWeb: !!data.visibleWeb,
      destacadoWeb: !!data.destacadoWeb,
      fotoUrl: data.fotoUrl || undefined,
      fotoUrlGrande: data.fotoUrlGrande || undefined,
      descripcionWeb: data.descripcionWeb || undefined,
      precioWeb: data.precioWeb !== '' ? Number(data.precioWeb) : undefined,
      ordenWeb: data.ordenWeb !== '' ? Number(data.ordenWeb) : undefined,
    }
    if (isEdit) {
      updateProducto.mutate({ id: found.id, data: payload }, {
        onSuccess: () => {
          if (Number(data.precio) !== found.precioLista) {
            addPrecio.mutate({
              productoId: found.id,
              data: {
                precioAnterior: found.precioLista,
                precioNuevo: Number(data.precio),
                usuarioNombre: user?.email || 'sistema',
              },
            })
          }
          navigate('/bodega')
        },
        onError: () => alert('Error al guardar el producto. Intente nuevamente.'),
      })
    } else {
      createProducto.mutate(
        { ...payload, codigoInterno: data.cod },
        {
          onSuccess: () => navigate('/bodega'),
          onError: () => alert('Error al crear el producto. Intente nuevamente.'),
        }
      )
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Código" required error={errors.cod}>
          <Input value={data.cod} onChange={v => set('cod', v)} placeholder="ESP-001" error={errors.cod} disabled={isEdit} />
        </FormField>
        <FormField label="Código de barra">
          <Input value={data.codigoBarra} onChange={v => set('codigoBarra', v)} placeholder="7800000000000" />
        </FormField>
        <FormField label="Categoría">
          <Select
            value={data.cat}
            onChange={v => set('cat', v)}
            options={(() => {
              const fromApi = categoriasApi.map(c => c.nombre).filter(Boolean)
              const fallback = ['Espumas','Viscoelástico','Telas','Maderas','Colchones','Fibras','Accesorios','Látex','Bases','Protectores']
              const all = fromApi.length ? fromApi : fallback
              if (data.cat && !all.includes(data.cat)) return [data.cat, ...all]
              return all
            })()}
          />
        </FormField>
      </div>
      <FormField label="Nombre / Descripción corta" required error={errors.nombre}>
        <Input value={data.nombre} onChange={v => set('nombre', v)} placeholder="Espuma Alta Densidad 15cm 2x1" error={errors.nombre} />
      </FormField>
      <FormField label="Descripción larga" hint="Detalles internos">
        <Textarea value={data.descripcion} onChange={v => set('descripcion', v)} rows={2} />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Bodega">
          <Select value={data.bodega} onChange={v => set('bodega', v)} options={['Inventario','Taller']} />
        </FormField>
        <FormField label="Unidad medida" hint="ej. UN, MT, KG">
          <Input value={data.unidadMedida} onChange={v => set('unidadMedida', v)} placeholder="UN" />
        </FormField>
        <FormField label="Ubicación física" hint="Pasillo/Rack">
          <Input value={data.ubicacion} onChange={v => set('ubicacion', v)} placeholder="A-12" />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Proveedor habitual">
          <Input value={data.proveedor} onChange={v => set('proveedor', v)} placeholder="Nombre proveedor" />
        </FormField>
        <FormField label="Estado inventario" hint="Activo/Descontinuado/etc">
          <Select value={data.estadoInventario} onChange={v => set('estadoInventario', v)} options={['', 'Activo', 'Descontinuado', 'En tránsito', 'Reserva']} />
        </FormField>
      </div>

      <FormDivider label="Stock y Precio" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Stock actual" hint="Unidades">
          <Input value={data.stock} onChange={v => set('stock', v)} type="number" placeholder="0" />
        </FormField>
        <FormField label="Stock mínimo" hint="Alerta bajo">
          <Input value={data.minimo} onChange={v => set('minimo', v)} type="number" placeholder="0" />
        </FormField>
        <FormField label="Precio lista">
          <Input value={data.precio} onChange={v => set('precio', v)} type="number" prefix="$" placeholder="0" />
        </FormField>
        <FormField label="Precio marco" hint="Convenio">
          <Input value={data.precioMarco} onChange={v => set('precioMarco', v)} type="number" prefix="$" placeholder="0" />
        </FormField>
      </div>
      <FormField label="ID Convenio Marco" hint="Código del rubro/línea en CM">
        <Input value={data.idMarco} onChange={v => set('idMarco', v)} placeholder="123456" />
      </FormField>

      <FormDivider label="Tienda Web" />
      <div style={{ display: 'flex', gap: 24, marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!data.visibleWeb} onChange={e => set('visibleWeb', e.target.checked)} />
          Visible en tienda web
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!data.destacadoWeb} onChange={e => set('destacadoWeb', e.target.checked)} disabled={!data.visibleWeb} />
          Destacado
        </label>
      </div>
      {data.visibleWeb && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormField label="Foto (URL miniatura)" hint="JPG/PNG público">
              <Input value={data.fotoUrl} onChange={v => set('fotoUrl', v)} placeholder="https://..." />
            </FormField>
            <FormField label="Foto grande (URL)">
              <Input value={data.fotoUrlGrande} onChange={v => set('fotoUrlGrande', v)} placeholder="https://..." />
            </FormField>
          </div>
          <FormField label="Descripción web" hint="Texto largo para tienda">
            <Textarea value={data.descripcionWeb} onChange={v => set('descripcionWeb', v)} rows={3} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormField label="Precio web" hint="Vacío = usa precio lista">
              <Input value={data.precioWeb} onChange={v => set('precioWeb', v)} type="number" prefix="$" placeholder="0" />
            </FormField>
            <FormField label="Orden" hint="Menor primero">
              <Input value={data.ordenWeb} onChange={v => set('ordenWeb', v)} type="number" placeholder="0" />
            </FormField>
          </div>
        </>
      )}

      {isEdit && found && <div id="movimientos"><MovimientosSection productoId={found.id} stockActual={found.stock} /></div>}

      <PrecioHistorial historial={historial} />
    </FormPage>
  )
}

function MovimientosSection({ productoId, stockActual }) {
  const { data: movs = [] } = useMovimientos(productoId)
  const addMov = useAddMovimiento()
  const [tipo, setTipo] = useState('ingreso')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')

  const submit = () => {
    const c = parseInt(cantidad, 10)
    if (isNaN(c)) { alert('Cantidad inválida'); return }
    if (!motivo.trim()) { alert('Motivo requerido'); return }
    addMov.mutate({ productoId, tipo, cantidad: c, motivo: motivo.trim() }, {
      onSuccess: () => { setCantidad(''); setMotivo('') },
      onError: e => alert(e.response?.data?.error || 'Error'),
    })
  }

  const fmtDate = iso => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <FormDivider label="Movimientos manuales de stock" />
      <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--text-2)' }}>
        Stock actual: <b style={{ color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>{stockActual}</b>
        {' · '}Ingreso suma · Egreso resta · Ajuste fija stock al valor indicado
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 110px 1fr auto', gap: 8, marginBottom: 12 }}>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}>
          <option value="ingreso">Ingreso</option>
          <option value="egreso">Egreso</option>
          <option value="ajuste">Ajuste</option>
        </select>
        <Input value={cantidad} onChange={setCantidad} type="number" placeholder="0" />
        <Input value={motivo} onChange={setMotivo} placeholder="Motivo (obligatorio)" />
        <button onClick={submit} disabled={addMov.isPending} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: 'var(--green-700)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          {addMov.isPending ? '…' : 'Aplicar'}
        </button>
      </div>
      {movs.length > 0 && (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Fecha', 'Tipo', 'Cantidad', 'Motivo'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movs.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: i < movs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '8px 14px', color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}>{fmtDate(m.createdAt)}</td>
                  <td style={{ padding: '8px 14px', textTransform: 'capitalize' }}>{m.tipo}</td>
                  <td style={{ padding: '8px 14px', fontFamily: "'DM Mono', monospace", fontWeight: 600, color: m.cantidad >= 0 ? 'var(--green-700)' : 'var(--red)' }}>{m.cantidad > 0 ? '+' : ''}{m.cantidad}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--text-2)' }}>{m.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
