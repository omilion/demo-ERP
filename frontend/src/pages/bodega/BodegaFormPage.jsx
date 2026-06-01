import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm } from '../../components/forms/index'
import { useProducto, useUpdateProducto, useCreateProducto, useHistorialPrecios, useMovimientos, useAddMovimiento, useUploadProductoImagen } from '../../api/productos'
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

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })
}

function ImageUploadField({ label, value, onUploaded, size = 'chica', append = false, previewSize = 120 }) {
  const upload = useUploadProductoImagen()

  const handleFile = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await readAsDataUrl(file)
      const uploaded = await upload.mutateAsync({ dataUrl, size })
      onUploaded(uploaded.url, append)
      event.target.value = ''
    } catch (error) {
      alert(error?.response?.data?.error || error.message || 'No se pudo subir la imagen')
    }
  }

  const previews = append
    ? String(value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    : (value ? [value] : [])

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>JPG, PNG o WEBP. Maximo 4 MB.</div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 34, padding: '7px 12px', borderRadius: 7, background: 'var(--green-700)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: upload.isPending ? 'default' : 'pointer', opacity: upload.isPending ? 0.6 : 1 }}>
          {upload.isPending ? 'Subiendo...' : append ? 'Agregar imagen' : 'Subir imagen'}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={upload.isPending} style={{ display: 'none' }} />
        </label>
      </div>
      {previews.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {previews.slice(0, append ? 8 : 1).map((url, idx) => (
            <img key={`${url}-${idx}`} src={url} alt="" style={{ width: previewSize, height: previewSize, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }} onError={e => { e.currentTarget.style.display = 'none' }} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function BodegaFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const { data: found } = useProducto(isEdit ? Number(id) : null)
  const { data: categoriasApi = [] } = useCategorias()
  const createProducto = useCreateProducto()
  const updateProducto = useUpdateProducto()
  const { data: historial = [] } = useHistorialPrecios(found?.id)

  const { data, set, errors, validate } = useForm({
    cod: '', nombre: '', cat: '', bodega: 'Inventario', stock: '', minimo: '', precio: '',
    codigoBarra: '', proveedor: '', ubicacion: '', descripcion: '', precioMarco: '',
    categoriaId: '', subcategoriaId: '', porcDesc: '',
    idMarco: '', unidadMedida: '', estadoInventario: '',
    visibleWeb: false, destacadoWeb: false, fotoUrl: '', fotoUrlGrande: '', fotosGaleria: '',
    descripcionWeb: '', precioWeb: '', ordenWeb: '',
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

  const selectedCategoria = categoriasApi.find(c => String(c.id) === String(data.categoriaId))
    || categoriasApi.find(c => c.nombre === data.cat)
  const subcategorias = selectedCategoria?.subcategorias || []
  const categoriaOptions = categoriasApi.length
    ? [
        { value: '', label: 'Sin categoria' },
        ...categoriasApi.map(c => ({ value: String(c.id), label: c.nombre })),
      ]
    : [
        { value: '', label: data.cat || 'Sin categoria' },
        ...['Espumas','Viscoelastico','Telas','Maderas','Colchones','Fibras','Accesorios','Latex','Bases','Protectores'].map(v => ({ value: v, label: v })),
      ]

  const setCategoria = (value) => {
    const cat = categoriasApi.find(c => String(c.id) === String(value))
    set('categoriaId', cat ? String(cat.id) : '')
    set('cat', cat?.nombre || value)
    set('subcategoriaId', '')
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
    if (!validate({ nombre: { required: true }, cod: { required: true } })) return
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
      descripcion: data.descripcion || undefined,
      precioMarco: data.precioMarco !== '' ? Number(data.precioMarco) : undefined,
      idMarco: data.idMarco || undefined,
      unidadMedida: data.unidadMedida || undefined,
      estadoInventario: data.estadoInventario || undefined,
      visibleWeb: !!data.visibleWeb,
      destacadoWeb: !!data.destacadoWeb,
      fotoUrl: data.fotoUrl || undefined,
      fotoUrlGrande: data.fotoUrlGrande || undefined,
      fotosGaleria: data.fotosGaleria ? data.fotosGaleria.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : undefined,
      descripcionWeb: data.descripcionWeb || undefined,
      precioWeb: data.precioWeb !== '' ? Number(data.precioWeb) : undefined,
      ordenWeb: data.ordenWeb !== '' ? Number(data.ordenWeb) : undefined,
    }
    if (isEdit && data.subcategoriaId === '') payload.subcategoriaId = null
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
      <FormDivider label="Datos del producto" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Código" required error={errors.cod}>
          <Input value={data.cod} onChange={v => set('cod', v)} placeholder="ESP-001" error={errors.cod} disabled={isEdit} />
        </FormField>
        <FormField label="Código de barra">
          <Input value={data.codigoBarra} onChange={v => set('codigoBarra', v)} placeholder="7800000000000" />
        </FormField>
        <FormField label="Categoría">
          <Select
            value={data.categoriaId || data.cat}
            onChange={setCategoria}
            options={categoriaOptions}
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
        <FormField label="Subcategoria">
          <Select
            value={data.subcategoriaId}
            onChange={v => set('subcategoriaId', v)}
            disabled={!subcategorias.length}
            options={[{ value: '', label: 'Sin subcategoria' }, ...subcategorias.map(sc => ({ value: String(sc.id), label: sc.nombre }))]}
          />
        </FormField>
        <FormField label="Unidad medida" hint="ej. UN, MT, KG">
          <Input value={data.unidadMedida} onChange={v => set('unidadMedida', v)} placeholder="UN" />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Ubicación física" hint="Pasillo/Rack">
          <Input value={data.ubicacion} onChange={v => set('ubicacion', v)} placeholder="A-12" />
        </FormField>
        <FormField label="Proveedor habitual">
          <Input value={data.proveedor} onChange={v => set('proveedor', v)} placeholder="Nombre proveedor" />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        <FormField label="Estado inventario" hint="Activo/Descontinuado/etc">
          <Select value={data.estadoInventario} onChange={v => set('estadoInventario', v)} options={['', 'Inventariado', 'Activo', 'Descontinuado', 'En transito', 'Reserva']} />
        </FormField>
      </div>

      <FormDivider label="Inventario" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Stock actual" hint="Unidades">
          <Input value={data.stock} onChange={v => set('stock', v)} type="number" placeholder="0" disabled={isEdit} />
          {isEdit && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Para cambiar stock use movimientos de bodega.</div>}
        </FormField>
        <FormField label="Stock mínimo" hint="Alerta bajo">
          <Input value={data.minimo} onChange={v => set('minimo', v)} type="number" placeholder="0" />
        </FormField>
      </div>

      <FormDivider label="Precios" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Precio lista">
          <Input value={data.precio} onChange={v => set('precio', v)} type="number" prefix="$" placeholder="0" />
        </FormField>
        <FormField label="Precio marco" hint="Convenio">
          <Input value={data.precioMarco} onChange={v => set('precioMarco', v)} type="number" prefix="$" placeholder="0" />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <FormField label="Descuento (%)" hint="Equivalente a descuento legacy">
        <Input value={data.porcDesc} onChange={v => set('porcDesc', v)} type="number" placeholder="0" />
      </FormField>
      <FormField label="ID Convenio Marco" hint="Código del rubro/línea en CM">
        <Input value={data.idMarco} onChange={v => set('idMarco', v)} placeholder="123456" />
      </FormField>
      </div>

      <FormDivider label="Imagenes del producto" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <ImageUploadField
          label="Miniatura"
          value={data.fotoUrl}
          onUploaded={(url, append) => setUploadedImage('fotoUrl', url, append)}
          size="chica"
          previewSize={112}
        />
        <ImageUploadField
          label="Foto principal"
          value={data.fotoUrlGrande}
          onUploaded={(url, append) => setUploadedImage('fotoUrlGrande', url, append)}
          size="grande"
          previewSize={160}
        />
      </div>
      <ImageUploadField
        label="Galeria"
        value={data.fotosGaleria}
        onUploaded={(url, append) => setUploadedImage('fotosGaleria', url, append)}
        size="grande"
        append
        previewSize={72}
      />

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
          {data.__legacyUrlEditor && (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormField label="Foto (URL miniatura)" hint="JPG/PNG público">
              <Input value={data.fotoUrl} onChange={v => set('fotoUrl', v)} placeholder="/uploads/productos/chicas/123-1.jpeg" />
              {data.fotoUrl && <img src={data.fotoUrl} alt="" style={{ marginTop: 8, maxWidth: 120, maxHeight: 120, borderRadius: 6, border: '1px solid var(--border)' }} onError={e => { e.currentTarget.style.display = 'none' }} />}
            </FormField>
            <FormField label="Foto grande (URL)">
              <Input value={data.fotoUrlGrande} onChange={v => set('fotoUrlGrande', v)} placeholder="/uploads/productos/grandes/123-1.jpeg" />
              {data.fotoUrlGrande && <img src={data.fotoUrlGrande} alt="" style={{ marginTop: 8, maxWidth: 200, maxHeight: 200, borderRadius: 6, border: '1px solid var(--border)' }} onError={e => { e.currentTarget.style.display = 'none' }} />}
            </FormField>
          </div>
          <FormField label="Galeria" hint="Una URL por linea. Se publica junto a la foto principal.">
            <Textarea value={data.fotosGaleria} onChange={v => set('fotosGaleria', v)} rows={3} placeholder="/uploads/fotos_grandes/producto-2.jpeg" />
            {data.fotosGaleria && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {data.fotosGaleria.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 6).map((url, idx) => (
                  <img key={`${url}-${idx}`} src={url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} onError={e => { e.currentTarget.style.display = 'none' }} />
                ))}
              </div>
            )}
          </FormField>
          </>
          )}
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
