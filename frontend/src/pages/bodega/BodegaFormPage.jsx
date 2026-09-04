import { toast, confirmDialog } from '../../store/notif'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, FormSection, Input, Select, Textarea, useForm } from '../../components/forms/index'
import { Btn, Badge, Icon } from '../../components/shared'
import { useProducto, useUpdateProducto, useCreateProducto, useHistorialPrecios, useMovimientos, useAddMovimiento, useUploadProductoImagen, useProductoProveedores, useUpsertProductoProveedor, useUpdateProductoProveedor, useDeleteProductoProveedor } from '../../api/productos'
import { useCategorias } from '../../api/categorias'
import { useProveedores } from '../../api/proveedores'
import { useCreateUbicacion, useUbicaciones } from '../../api/ubicaciones'
import UbicacionEstructuradaModal from '../../components/bodega/UbicacionEstructuradaModal'
import ProveedorFormModal from '../proveedores/ProveedorFormModal'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const ESTADO_INVENTARIO_OPTIONS = [
  { value: 'Inventariado', label: 'Inventariado' },
  { value: 'Transitorio', label: 'Transitorio' },
  { value: 'Activo', label: 'Activo' },
  { value: 'Descontinuado', label: 'Descontinuado' },
  { value: 'En transito', label: 'En transito' },
  { value: 'Reserva', label: 'Reservado' },
]

const MOTIVO_CATEGORIAS_POR_TIPO = {
  egreso: ['', 'Perdida', 'Otro'],
  ajuste: ['', 'Perdida', 'Error inventario', 'Otro'],
  dano: ['', 'Dano'],
  merma: ['', 'Merma'],
}

function MiniTable({ columns, rows, getRowKey, maxHeight }) {
  if (!rows.length) return null
  return (
    <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', maxHeight, overflowY: maxHeight ? 'auto' : undefined }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {columns.map(c => (
              <th key={c.key} style={{ padding: '8px 14px', textAlign: c.align || 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={getRowKey ? getRowKey(row, i) : i} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
              {columns.map(c => (
                <td key={c.key} style={{ padding: c.padding || '9px 14px', textAlign: c.align || 'left' }}>
                  {c.render ? c.render(row, i) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PrecioHistorial({ historial }) {
  if (!historial.length) return null

  const fmt = n => '$' + Number(n).toLocaleString('es-CL')
  const fmtDate = iso => new Date(iso).toLocaleString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  return (
    <>
      <FormDivider label="Historial de precios" />
      <MiniTable
        columns={[
          { key: 'fecha', label: 'Fecha', render: e => <span style={{ color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}>{fmtDate(e.createdAt)}</span> },
          { key: 'anterior', label: 'Precio anterior', render: e => <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-3)' }}>{fmt(e.precioAnterior)}</span> },
          { key: 'nuevo', label: 'Precio nuevo', render: e => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--text-1)' }}>{fmt(e.precioNuevo)}</span> },
          { key: 'variacion', label: 'Variación', render: e => {
            const up = Number(e.pct) > 0
            return <span style={{ color: up ? 'var(--red)' : 'var(--green-600)', fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{up ? '↑' : '↓'} {Math.abs(Number(e.pct))}%</span>
          } },
          { key: 'usuario', label: 'Usuario', render: e => <span style={{ color: 'var(--text-3)' }}>{e.usuarioNombre}</span> },
        ]}
        rows={historial}
      />
    </>
  )
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })
}

function ImageUploadField({ label, value, onUploaded, size = 'chica', append = false, previewSize = 96 }) {
  const upload = useUploadProductoImagen()

  const handleFile = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      toast.warning('La imagen supera el máximo de 4 MB. Reduce su tamaño e inténtalo de nuevo.')
      event.target.value = ''
      return
    }
    try {
      const dataUrl = await readAsDataUrl(file)
      const uploaded = await upload.mutateAsync({ dataUrl, size })
      onUploaded(uploaded.url, append)
      event.target.value = ''
    } catch (error) {
      const data = error?.response?.data
      toast.error(data?.error || data?.message || error.message || 'No se pudo subir la imagen')
      event.target.value = ''
    }
  }

  const previews = append
    ? String(value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    : (value ? [value] : [])

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>JPG, PNG o WEBP. Máx. 4 MB.</div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 32, padding: '6px 11px', borderRadius: 7, background: 'var(--green-900)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: upload.isPending ? 'default' : 'pointer', opacity: upload.isPending ? 0.6 : 1, flexShrink: 0 }}>
          {upload.isPending ? '…' : append ? '+ Agregar' : 'Subir'}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={upload.isPending} style={{ display: 'none' }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1, alignItems: 'flex-start' }}>
        {previews.length > 0 ? previews.slice(0, append ? 8 : 1).map((url, idx) => (
          <img key={`${url}-${idx}`} src={url} alt="" style={{ width: previewSize, height: previewSize, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }} onError={e => { e.currentTarget.style.display = 'none' }} />
        )) : (
          <div style={{ width: previewSize, height: previewSize, borderRadius: 6, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            <Icon name="package" size={20} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function BodegaFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const { data: found } = useProducto(isEdit ? Number(id) : null)
  const { data: categoriasApi = [] } = useCategorias()
  const { data: ubicacionesResult = { items: [] } } = useUbicaciones()
  const { data: proveedoresData = { items: [] } } = useProveedores()
  const createUbicacion = useCreateUbicacion()
  const [nuevaUbicacion, setNuevaUbicacion] = useState(false)
  const [gestionandoProveedores, setGestionandoProveedores] = useState(false)
  const [registrandoProveedor, setRegistrandoProveedor] = useState(false)
  const { user } = useAuthStore()
  const createProducto = useCreateProducto()
  const updateProducto = useUpdateProducto()
  const { data: historial = [] } = useHistorialPrecios(found?.id)
  const { data: proveedoresProducto = { items: [], stockTotal: 0, costoPonderado: 0 } } = useProductoProveedores(isEdit ? found?.id : null)

  const { data, set, errors, validate } = useForm({
    cod: '', nombre: '', cat: '', bodega: 'Inventario', stock: '', minimo: '', precio: '',
    codigoBarra: '', proveedor: '', ubicacion: '', ubicacionId: '',
    categoriaId: '', subcategoriaId: '', porcDesc: '',
    unidadMedida: '', estadoInventario: 'Inventariado', edad: '',
    visibleWeb: false, destacadoWeb: false, fotoUrl: '', fotoUrlGrande: '', fotosGaleria: '',
    descripcionWeb: '', ordenWeb: '',
  })

  useEffect(() => {
    if (found) {
      set('cod', found.codigoInterno)
      set('nombre', found.nombre)
      set('cat', found.categoria || '')
      set('categoriaId', found.categoriaId != null ? String(found.categoriaId) : '')
      set('subcategoriaId', found.subcategoriaId != null ? String(found.subcategoriaId) : '')
      set('bodega', found.bodega)
      set('stock', String(found.stock))
      set('minimo', String(found.stockCritico))
      set('precio', String(found.precioLista))
      set('porcDesc', found.porcDesc != null ? String(found.porcDesc) : '')
      set('visibleWeb', !!found.visibleWeb)
      set('destacadoWeb', !!found.destacadoWeb)
      set('fotoUrl', found.fotoUrl || '')
      set('fotoUrlGrande', found.fotoUrlGrande || '')
      set('fotosGaleria', Array.isArray(found.fotosGaleria) ? found.fotosGaleria.join('\n') : '')
      set('descripcionWeb', found.descripcionWeb || '')
      set('ordenWeb', found.ordenWeb != null ? String(found.ordenWeb) : '')
      set('codigoBarra', found.codigoBarra || '')
      set('proveedor', found.proveedor || '')
      set('ubicacion', found.ubicacion || '')
      set('ubicacionId', found.ubicacionId != null ? String(found.ubicacionId) : '')
      set('edad', found.edad || '')
      set('unidadMedida', found.unidadMedida || '')
      set('estadoInventario', found.estadoInventario || 'Inventariado')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.id])

  if (isEdit && !found) return <main style={{ padding: 24 }}><p>Cargando...</p></main>

  const selectedCategoria = categoriasApi.find(c => String(c.id) === String(data.categoriaId))
    || categoriasApi.find(c => c.nombre === data.cat)
  const subcategorias = selectedCategoria?.subcategorias || []
  const categoriaOptions = categoriasApi.length
    ? [
        { value: '', label: 'Sin categoría' },
        ...categoriasApi.map(c => ({ value: String(c.id), label: c.nombre })),
      ]
    : [
        { value: '', label: data.cat || 'Sin categoría' },
        ...['Espumas','Viscoelastico','Telas','Maderas','Colchones','Fibras','Accesorios','Latex','Bases','Protectores'].map(v => ({ value: v, label: v })),
      ]

  const ubicaciones = ubicacionesResult.items || []
  const ubicacionOptions = [
    { value: '', label: 'Sin ubicacion' },
    ...ubicaciones.map(u => ({ value: String(u.id), label: u.nombre })),
  ]
  const canCreateUbicacion = can(user, 'config', 'write')

  const proveedoresHabituales = proveedoresData.items || []
  const proveedoresHabitualesPorNombre = new Map()
  for (const p of proveedoresHabituales) {
    if (!proveedoresHabitualesPorNombre.has(p.nombre)) proveedoresHabitualesPorNombre.set(p.nombre, p)
  }
  const proveedorHabitualMatch = proveedoresHabitualesPorNombre.get(data.proveedor)
  const proveedorHabitualOptions = [
    { value: '', label: 'Sin proveedor habitual' },
    ...Array.from(proveedoresHabitualesPorNombre.values()).map(p => ({ value: p.nombre, label: `${p.nombre}${p.rut ? ` (${p.rut})` : ''}` })),
    ...(data.proveedor && !proveedorHabitualMatch ? [{ value: data.proveedor, label: `${data.proveedor} (no registrado)` }] : []),
  ]

  const setCategoria = (value) => {
    const cat = categoriasApi.find(c => String(c.id) === String(value))
    set('categoriaId', cat ? String(cat.id) : '')
    set('cat', cat?.nombre || value)
    set('subcategoriaId', '')
  }

  const setUbicacionCatalogo = (value) => {
    const ubicacion = ubicaciones.find(u => String(u.id) === String(value))
    set('ubicacionId', ubicacion ? String(ubicacion.id) : '')
    set('ubicacion', ubicacion?.nombre || '')
  }

  const crearUbicacionEstructurada = async (campos) => {
    const created = await createUbicacion.mutateAsync(campos)
    set('ubicacionId', String(created.id))
    set('ubicacion', created.nombre)
    setNuevaUbicacion(false)
    toast.success(`Ubicación "${created.nombre}" creada.`)
  }

  const setUploadedImage = (field, url, append = false) => {
    if (append) {
      const current = data[field] ? `${data[field]}\n` : ''
      set(field, `${current}${url}`)
      return
    }
    set(field, url)
  }

  const handleSave = () => {
    if (!validate({ nombre: { required: true }, cod: { required: true }, codigoBarra: { required: true } })) return
    const payload = {
      nombre: data.nombre,
      categoriaId: data.categoriaId !== '' ? Number(data.categoriaId) : undefined,
      subcategoriaId: data.subcategoriaId !== '' ? Number(data.subcategoriaId) : undefined,
      bodega: data.bodega,
      stockCritico: Number(data.minimo),
      precioLista: Number(data.precio),
      porcDesc: data.porcDesc !== '' ? Number(data.porcDesc) : 0,
      codigoBarra: data.codigoBarra || undefined,
      proveedor: data.proveedor || undefined,
      ubicacion: data.ubicacion || undefined,
      ubicacionId: data.ubicacionId !== '' ? Number(data.ubicacionId) : undefined,
      edad: isEdit ? data.edad : data.edad || undefined,
      unidadMedida: data.unidadMedida || undefined,
      estadoInventario: data.estadoInventario || 'Inventariado',
      visibleWeb: !!data.visibleWeb,
      destacadoWeb: !!data.destacadoWeb,
      fotoUrl: data.fotoUrl || undefined,
      fotoUrlGrande: data.fotoUrlGrande || undefined,
      fotosGaleria: data.fotosGaleria ? data.fotosGaleria.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : undefined,
      descripcionWeb: data.descripcionWeb || undefined,
      ordenWeb: data.ordenWeb !== '' ? Number(data.ordenWeb) : undefined,
    }
    if (isEdit && data.subcategoriaId === '') payload.subcategoriaId = null
    if (isEdit && data.ubicacionId === '') payload.ubicacionId = null
    if (isEdit && data.categoriaId === '') {
      payload.categoriaId = null
      payload.subcategoriaId = null
      payload.categoria = ''
    }
    if (!isEdit) payload.stock = Number(data.stock)
    if (isEdit) {
      updateProducto.mutate({ id: found.id, data: payload }, {
        onSuccess: () => {
          navigate('/bodega')
        },
        onError: () => toast.error('Error al guardar el producto. Intente nuevamente.'),
      })
    } else {
      createProducto.mutate(
        { ...payload, codigoInterno: data.cod },
        {
          onSuccess: () => navigate('/bodega'),
          onError: () => toast.error('Error al crear el producto. Intente nuevamente.'),
        }
      )
    }
  }

  const saving = updateProducto.isPending || createProducto.isPending
  const sinProveedoresCosto = (proveedoresProducto.items || []).length === 0

  return (
    <FormPage
      title={isEdit ? 'Editar Producto' : 'Nuevo Producto'}
      subtitle={isEdit ? `Editando código ${data.cod}` : 'Registrar producto en bodega'}
      breadcrumb={['Inicio', 'Bodega', isEdit ? 'Editar Producto' : 'Nuevo Producto']}
      onSave={handleSave}
      saving={saving}
    >
      <FormSection title="Imágenes del producto">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <ImageUploadField
          label="Miniatura"
          value={data.fotoUrl}
          onUploaded={(url, append) => setUploadedImage('fotoUrl', url, append)}
          size="chica"
        />
        <ImageUploadField
          label="Foto principal"
          value={data.fotoUrlGrande}
          onUploaded={(url, append) => setUploadedImage('fotoUrlGrande', url, append)}
          size="grande"
        />
        <ImageUploadField
          label="Galería"
          value={data.fotosGaleria}
          onUploaded={(url, append) => setUploadedImage('fotosGaleria', url, append)}
          size="grande"
          append
          previewSize={64}
        />
      </div>
      </FormSection>

      <FormSection title="Datos del producto">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <FormField label="Código" required error={errors.cod}>
          <Input value={data.cod} onChange={v => set('cod', v)} placeholder="ESP-001" error={errors.cod} disabled={isEdit} />
        </FormField>
        <FormField label="Código de barra" required error={errors.codigoBarra}>
          <Input value={data.codigoBarra} onChange={v => set('codigoBarra', v)} placeholder="7800000000000" error={errors.codigoBarra} />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <FormField label="Categoría">
          <Select
            value={data.categoriaId || data.cat}
            onChange={setCategoria}
            options={categoriaOptions}
          />
        </FormField>
        <FormField label="Subcategoría">
          <Select
            value={data.subcategoriaId}
            onChange={v => set('subcategoriaId', v)}
            disabled={!subcategorias.length}
            options={[{ value: '', label: 'Sin subcategoría' }, ...subcategorias.map(sc => ({ value: String(sc.id), label: sc.nombre }))]}
          />
        </FormField>
      </div>
      <FormField label="Nombre / Descripción corta" required error={errors.nombre}>
        <Input value={data.nombre} onChange={v => set('nombre', v)} placeholder="Espuma Alta Densidad 15cm 2x1" error={errors.nombre} />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <FormField label="Edad">
          <Input value={data.edad} onChange={v => set('edad', v)} placeholder="Ej. adulto, infantil" />
        </FormField>
        <FormField label="Proveedor habitual" hint={data.proveedor && !proveedorHabitualMatch ? 'No está registrado en el catálogo de proveedores.' : undefined}>
          <div style={{ display: 'grid', gridTemplateColumns: proveedorHabitualMatch || (data.proveedor && !proveedorHabitualMatch) ? '1fr auto' : '1fr', gap: 8 }}>
            <Select value={data.proveedor} onChange={v => set('proveedor', v)} options={proveedorHabitualOptions} />
            {proveedorHabitualMatch && (
              <Btn type="button" variant="secondary" size="sm" icon="arrowRight" title="Ver proveedor" onClick={() => navigate(`/proveedores/${proveedorHabitualMatch.id}`)}>
                Ver
              </Btn>
            )}
            {data.proveedor && !proveedorHabitualMatch && (
              <Btn type="button" variant="secondary" size="sm" icon="plusCircle" title="Registrar proveedor" onClick={() => setRegistrandoProveedor(true)}>
                Registrar
              </Btn>
            )}
          </div>
        </FormField>
      </div>
      <FormField label="Descripción" hint="Se usa en la ficha y, si el producto es visible, en la tienda web.">
        <Textarea value={data.descripcionWeb} onChange={v => set('descripcionWeb', v)} rows={3} />
      </FormField>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!data.visibleWeb} onChange={e => set('visibleWeb', e.target.checked)} />
          Visible en tienda web
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!data.destacadoWeb} onChange={e => set('destacadoWeb', e.target.checked)} disabled={!data.visibleWeb} />
          Destacado
        </label>
        {data.visibleWeb && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Orden</span>
            <Input value={data.ordenWeb} onChange={v => set('ordenWeb', v)} type="number" placeholder="0" style={{ width: 80 }} />
          </div>
        )}
      </div>
      </FormSection>

      <FormSection title="Inventario" tone="inventory">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <FormField label="Bodega">
          <Select value={data.bodega} onChange={v => set('bodega', v)} options={['Inventario','Taller']} />
        </FormField>
        <FormField label="Estado inventario" hint="Inventariado descuenta stock. Transitorio se usa para taller.">
          <Select value={data.estadoInventario} onChange={v => set('estadoInventario', v)} options={ESTADO_INVENTARIO_OPTIONS} />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <FormField label="Unidad medida" hint="ej. UN, MT, KG">
          <Input value={data.unidadMedida} onChange={v => set('unidadMedida', v)} placeholder="UN" />
        </FormField>
        <FormField label="Ubicación física" hint="Catalogo de ubicaciones">
          <div style={{ display: 'grid', gridTemplateColumns: canCreateUbicacion ? '1fr auto' : '1fr', gap: 8 }}>
            <Select value={data.ubicacionId} onChange={setUbicacionCatalogo} options={ubicacionOptions} />
            {canCreateUbicacion && (
              <Btn type="button" variant="secondary" size="sm" icon="plusCircle" onClick={() => setNuevaUbicacion(true)} disabled={createUbicacion.isPending}>
                Nueva
              </Btn>
            )}
          </div>
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <FormField label="Stock actual" hint="Unidades">
          <Input value={data.stock} onChange={v => set('stock', v)} type="number" placeholder="0" disabled={isEdit} />
          {isEdit && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Cambiar en Movimientos.</div>}
        </FormField>
        <FormField label="Stock mínimo" hint="Alerta bajo">
          <Input value={data.minimo} onChange={v => set('minimo', v)} type="number" placeholder="0" />
        </FormField>
        <FormField label="Descuento (%)" hint="Legacy">
          <Input value={data.porcDesc} onChange={v => set('porcDesc', v)} type="number" placeholder="0" />
        </FormField>
      </div>
      </FormSection>

      {isEdit && found && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', margin: '18px 0', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
          <Icon name="truck" size={16} color="var(--text-3)" />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            Costo ponderado: <b style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-1)' }}>${Number(sinProveedoresCosto ? found.precioLista : proveedoresProducto.costoPonderado).toLocaleString('es-CL')}</b>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {(proveedoresProducto.items || []).length} proveedor(es) asignado(s)
          </span>
          <Btn variant="secondary" size="sm" icon="briefcase" onClick={() => setGestionandoProveedores(true)} style={{ marginLeft: 'auto' }}>
            Gestionar proveedores y costos
          </Btn>
        </div>
      )}

      {isEdit && found && <div id="movimientos"><MovimientosSection productoId={found.id} stockActual={found.stockFisico ?? found.stock} stockReservado={found.stockReservado} stockDanado={found.stockDanado} stockDisponible={found.stockDisponible} /></div>}

      <PrecioHistorial historial={historial} />

      {nuevaUbicacion && (
        <UbicacionEstructuradaModal
          ubicacionesExistentes={ubicaciones}
          creating={createUbicacion.isPending}
          onClose={() => setNuevaUbicacion(false)}
          onCreate={crearUbicacionEstructurada}
        />
      )}

      {gestionandoProveedores && found && (
        <ProveedoresModal productoId={found.id} precioCostoActual={found.precioLista} onClose={() => setGestionandoProveedores(false)} />
      )}

      {registrandoProveedor && (
        <ProveedorFormModal proveedor={{ nombre: data.proveedor }} onClose={() => setRegistrandoProveedor(false)} />
      )}
    </FormPage>
  )
}

function ProveedoresModal({ productoId, precioCostoActual, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 800, background: 'oklch(0 0 0 / .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={event => event.stopPropagation()} style={{ background: '#fff', width: 640, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', borderRadius: 12, boxShadow: '0 16px 48px oklch(0 0 0 / .2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Proveedores y costos</div>
          <button onClick={onClose} title="Cerrar" style={{ padding: 4, color: 'var(--text-3)' }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 18 }}>
          <ProveedoresSection productoId={productoId} precioCostoActual={precioCostoActual} />
        </div>
      </div>
    </div>
  )
}

function ProveedoresSection({ productoId, precioCostoActual }) {
  const { data = { items: [], stockTotal: 0, costoPonderado: 0 } } = useProductoProveedores(productoId)
  const sinProveedores = (data.items || []).length === 0
  const { data: proveedoresData = { items: [] } } = useProveedores()
  const upsert = useUpsertProductoProveedor()
  const update = useUpdateProductoProveedor()
  const remove = useDeleteProductoProveedor()
  const [proveedorId, setProveedorId] = useState('')
  const [costo, setCosto] = useState('')
  const [cantidad, setCantidad] = useState('')

  const money = n => '$' + Number(n || 0).toLocaleString('es-CL')
  const proveedorOptions = proveedoresData.items || []

  const add = () => {
    if (!proveedorId) { toast.warning('Selecciona un proveedor'); return }
    upsert.mutate(
      { productoId, proveedorId: Number(proveedorId), costo: Number(costo || 0), cantidad: Number(cantidad || 0) },
      {
        onSuccess: () => { setProveedorId(''); setCosto(''); setCantidad('') },
        onError: e => toast.error(e.response?.data?.error || 'No se pudo guardar el proveedor'),
      },
    )
  }

  const setRow = (row, field, value) => {
    const payload = { productoId, proveedorId: row.proveedorId, costo: row.costo, cantidad: row.cantidad, [field]: Number(value || 0) }
    update.mutate(payload, { onError: e => toast.error(e.response?.data?.error || 'No se pudo actualizar') })
  }

  const del = async (row) => {
    if (!await confirmDialog({ title: 'Confirmar', detail: `Quitar proveedor ${row.proveedorNombre || row.proveedorId}?`, tone: 'danger' })) return
    remove.mutate({ productoId, proveedorId: row.proveedorId }, { onError: e => toast.error(e.response?.data?.error || 'No se pudo quitar') })
  }

  return (
    <>
      <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <span>Stock total: <b style={{ color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>{Number(data.stockTotal || 0).toLocaleString('es-CL')}</b></span>
        <span>Costo ponderado: <b style={{ color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>{money(sinProveedores ? precioCostoActual : data.costoPonderado)}</b></span>
        <span style={{ color: 'var(--text-3)' }}>El costo ponderado de los proveedores es el <b>precio costo</b> del producto.</span>
      </div>
      {sinProveedores && (
        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--border)', padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--text-2)' }}>
          Este producto aún no tiene proveedores asignados. Su precio costo actual es <b style={{ fontFamily: "'DM Mono', monospace" }}>{money(precioCostoActual)}</b> (valor cargado). Asigna un proveedor con su costo para que el sistema lo recalcule automáticamente.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 12, alignItems: 'end' }}>
        <FormField label="Proveedor">
          <Select
            value={proveedorId}
            onChange={setProveedorId}
            options={[{ value: '', label: 'Seleccionar...' }, ...proveedorOptions.map(p => ({ value: String(p.id), label: `${p.nombre}${p.rut ? ` (${p.rut})` : ''}` }))]}
          />
        </FormField>
        <FormField label="Costo">
          <Input value={costo} onChange={setCosto} type="number" prefix="$" placeholder="0" />
        </FormField>
        <FormField label="Cantidad">
          <Input value={cantidad} onChange={setCantidad} type="number" placeholder="0" />
        </FormField>
        <Btn variant="primary" size="sm" icon="plus" onClick={add} disabled={upsert.isPending} style={{ height: 38 }}>
          {upsert.isPending ? '…' : 'Agregar'}
        </Btn>
      </div>
      <MiniTable
        columns={[
          { key: 'proveedor', label: 'Proveedor', render: row => (
            <>
              <div style={{ fontWeight: 600 }}>{row.proveedorNombre || `#${row.proveedorId}`}</div>
              {row.proveedorRut && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{row.proveedorRut}</div>}
            </>
          ) },
          { key: 'costo', label: 'Costo', padding: '6px 14px', render: row => <Input value={String(row.costo)} onChange={v => setRow(row, 'costo', v)} type="number" prefix="$" /> },
          { key: 'cantidad', label: 'Cantidad', padding: '6px 14px', render: row => <Input value={String(row.cantidad)} onChange={v => setRow(row, 'cantidad', v)} type="number" /> },
          { key: 'acciones', label: '', align: 'right', render: row => <Btn variant="ghost" size="xs" icon="trash" onClick={() => del(row)} style={{ color: 'var(--red)' }}>Quitar</Btn> },
        ]}
        rows={data.items}
        getRowKey={row => row.id}
      />
    </>
  )
}

function MovimientosSection({ productoId, stockActual, stockReservado = 0, stockDanado = 0, stockDisponible }) {
  const { data: movs = [] } = useMovimientos(productoId)
  const addMov = useAddMovimiento()
  const [tipo, setTipo] = useState('ingreso')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [motivoCategoria, setMotivoCategoria] = useState('')

  const cantidadNumero = parseInt(cantidad, 10)
  const disponibleActual = Number(stockDisponible ?? (Number(stockActual || 0) - Number(stockReservado || 0) - Number(stockDanado || 0)))
  const requiereCategoria = tipo === 'egreso' || tipo === 'dano' || tipo === 'merma' || (tipo === 'ajuste' && !isNaN(cantidadNumero) && cantidadNumero < Number(stockActual || 0))
  const motivoCategoriaOptions = requiereCategoria ? (MOTIVO_CATEGORIAS_POR_TIPO[tipo] || ['']) : ['']
  useEffect(() => {
    if (!motivoCategoriaOptions.includes(motivoCategoria)) setMotivoCategoria('')
  }, [tipo, requiereCategoria, motivoCategoria])
  const movementLabels = {
    ingreso: 'Ingreso: suma físico',
    egreso: 'Egreso: resta disponible',
    ajuste: 'Ajuste: fija físico',
    reserva: 'Reserva: compromete disponible',
    liberacion: 'Liberación: devuelve disponible',
    dano: 'Daño: aparta unidades',
    recuperacion: 'Recuperación: devuelve unidades',
    merma: 'Merma: descuenta dañadas',
  }
  const impacto = !Number.isInteger(cantidadNumero) ? 'Ingrese una cantidad' : {
    ingreso: `Físico +${cantidadNumero}`,
    egreso: `Físico -${cantidadNumero}`,
    ajuste: `Físico = ${cantidadNumero}`,
    reserva: `Reservado +${cantidadNumero}`,
    liberacion: `Reservado -${cantidadNumero}`,
    dano: `Dañado +${cantidadNumero}`,
    recuperacion: `Dañado -${cantidadNumero}`,
    merma: `Físico y dañado -${cantidadNumero}`,
  }[tipo]

  const submit = () => {
    const c = parseInt(cantidad, 10)
    if (isNaN(c)) { toast.warning('Cantidad inválida'); return }
    if (!motivo.trim()) { toast.warning('Motivo requerido'); return }
    if (requiereCategoria && !motivoCategoria) { toast.warning('Motivo operacional requerido'); return }
    addMov.mutate({ productoId, tipo, cantidad: c, motivo: motivo.trim(), motivoCategoria: requiereCategoria ? motivoCategoria : undefined }, {
      onSuccess: () => { setCantidad(''); setMotivo(''); setMotivoCategoria('') },
      onError: e => toast.error(e.response?.data?.error || 'Error'),
    })
  }

  const fmtDate = iso => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const parseMotivo = motivoTexto => {
    const match = String(motivoTexto || '').match(/^(Merma|Perdida|Dano|Error inventario|Otro):\s*(.*)$/i)
    return match ? { categoria: match[1], detalle: match[2] || '' } : { categoria: '', detalle: motivoTexto }
  }

  return (
    <>
      <FormDivider label="Movimientos manuales de stock" />
      <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--text-2)' }}>
        Físico: <b style={{ color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>{stockActual}</b>
        {' · '}Disponible: <b style={{ color: 'var(--green-700)', fontFamily: "'DM Mono', monospace" }}>{disponibleActual}</b>
        {' · '}Reservado: <b style={{ color: 'var(--amber-700)', fontFamily: "'DM Mono', monospace" }}>{stockReservado}</b>
        {' · '}Dañado: <b style={{ color: 'var(--red)', fontFamily: "'DM Mono', monospace" }}>{stockDanado}</b>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12, alignItems: 'start' }}>
        <Select value={tipo} onChange={setTipo} options={Object.entries(movementLabels).map(([value, label]) => ({ value, label }))} />
        <Input value={cantidad} onChange={setCantidad} type="number" placeholder={tipo === 'ajuste' ? 'Nuevo físico' : '0'} />
        <Select
          value={motivoCategoria}
          onChange={setMotivoCategoria}
          disabled={!requiereCategoria}
          options={motivoCategoriaOptions.map(value => ({ value, label: value || 'Motivo operacional' }))}
        />
        <Input value={motivo} onChange={setMotivo} placeholder="Motivo (obligatorio)" />
        <Btn variant="primary" size="sm" icon="check" onClick={submit} disabled={addMov.isPending} style={{ width: '100%' }}>
          {addMov.isPending ? '…' : 'Aplicar'}
        </Btn>
      </div>
      <div style={{ margin: '-4px 0 12px', fontSize: 12, color: 'var(--text-3)' }}>
        {impacto}. {requiereCategoria ? 'Debe indicar el motivo operacional.' : 'El motivo describe la operación.'}
      </div>
      <MiniTable
        maxHeight={240}
        columns={[
          { key: 'fecha', label: 'Fecha', render: m => <span style={{ color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}>{fmtDate(m.createdAt)}</span> },
          { key: 'tipo', label: 'Tipo', render: m => <span style={{ textTransform: 'capitalize' }}>{m.tipo}</span> },
          { key: 'cantidad', label: 'Cantidad', render: m => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: m.cantidad >= 0 ? 'var(--green-700)' : 'var(--red)' }}>{m.cantidad > 0 ? '+' : ''}{m.cantidad}</span> },
          { key: 'saldos', label: 'Saldos', render: m => m.stockPosterior == null ? '-' : <span style={{ color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>F {m.stockPosterior} · D {m.stockPosterior - Number(m.reservadoFinal || 0) - Number(m.danadoFinal || 0)} · R {m.reservadoFinal || 0} · Ñ {m.danadoFinal || 0}</span> },
          { key: 'motivo', label: 'Motivo', render: m => {
            const motivoInfo = parseMotivo(m.motivo)
            return (
              <span style={{ color: 'var(--text-2)' }}>
                {motivoInfo.categoria && <span style={{ marginRight: 6, display: 'inline-block' }}><Badge tone="red" size="sm">{motivoInfo.categoria}</Badge></span>}
                {motivoInfo.detalle}
              </span>
            )
          } },
        ]}
        rows={movs}
        getRowKey={m => m.id}
      />
    </>
  )
}
