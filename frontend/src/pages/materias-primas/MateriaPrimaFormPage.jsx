import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormSection, Input, Select } from '../../components/forms'
import { Badge, Btn, Table } from '../../components/shared'
import { useBodegaTallerItem, useBodegaTallerLotes, useCreateBodegaTaller, useUpdateBodegaTaller } from '../../api/bodegaTaller'
import { useMaterialesHistorialPrecios } from '../../api/costeo'
import { useCategoriasBodegaTaller } from '../../api/categoriasBodegaTaller'
import { useProveedores } from '../../api/proveedores'
import { useSucursales } from '../../api/locations'
import { useTalleres } from '../../api/pasarTaller'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { toast } from '../../store/notif'

// Ficha unica de materia prima.
//
// La misma tabla se administraba desde dos modulos con formularios distintos:
// Bodega Taller tenia categoria, proveedor, sucursal y stock critico, y Costeo
// no, de modo que un material creado desde Costeo nacia incompleto y habia que
// ir a arreglarlo al otro modulo. Ahora hay un solo formulario y dos listados
// que lo abren.

const UNIDADES = ['kg', 'mt', 'm2', 'm3', 'lt', 'plancha', 'rollo', 'unidad', 'Unidad', 'Unidades', 'Mts', 'Mts2', 'Litros', 'Kg', 'Rollos', 'Cajas']

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.data)) return value.data
  return []
}

const VACIO = {
  codigoInterno: '', codigoBarra: '', nombre: '', detalle: '', unidadMedida: 'kg',
  precio: '', motivo: '', stock: '', stockCritico: '',
  tallerId: '', categoriaId: '', subcategoriaId: '', proveedorId: '', sucursalId: '',
  densidadKgM3: '', espesorMm: '', formato: '',
}

const idTexto = valor => (valor === null || valor === undefined ? '' : String(valor))

const desdeMaterial = material => ({
  codigoInterno: material.codigoInterno || '',
  codigoBarra: material.codigoBarra || '',
  nombre: material.nombre || '',
  detalle: material.detalle || '',
  unidadMedida: material.unidadMedida || 'kg',
  precio: material.precio ?? '',
  motivo: '',
  stock: material.stock ?? '',
  stockCritico: material.stockCritico ?? '',
  tallerId: idTexto(material.tallerId),
  categoriaId: idTexto(material.categoriaId),
  subcategoriaId: idTexto(material.subcategoriaId),
  proveedorId: idTexto(material.proveedorId),
  sucursalId: idTexto(material.sucursalId),
  densidadKgM3: material.densidadKgM3 ?? '',
  espesorMm: material.espesorMm ?? '',
  formato: material.formato || '',
})

const numeroOpcional = valor => (valor === '' || valor === null || valor === undefined ? null : Number(valor))
const idOpcional = valor => (valor ? Number(valor) : null)
const moneda = valor => '$' + Number(valor || 0).toLocaleString('es-CL')

export default function MateriaPrimaFormPage() {
  const { id } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  const esNueva = !id
  const puedeEscribir = can(user, ['taller', 'costeo'], 'write')
  const editando = (esNueva || location.pathname.endsWith('/editar')) && puedeEscribir
  const soloLectura = !editando
  const volverA = searchParams.get('volver') || '/bodega-taller'

  const { data: material, isLoading, isError } = useBodegaTallerItem(id)
  const { data: talleresData } = useTalleres()
  const { data: categoriasData } = useCategoriasBodegaTaller()
  const { data: proveedoresData } = useProveedores({ page: '1' })
  const { data: sucursalesData } = useSucursales()
  const { data: historialData } = useMaterialesHistorialPrecios(soloLectura ? id : null)
  const { data: lotesData } = useBodegaTallerLotes(soloLectura ? id : null)
  const crear = useCreateBodegaTaller()
  const actualizar = useUpdateBodegaTaller()

  const talleres = toArray(talleresData)
  const categorias = toArray(categoriasData)
  const proveedores = toArray(proveedoresData)
  const sucursales = toArray(sucursalesData)
  const historial = toArray(historialData)
  const lotes = toArray(lotesData)

  const [form, setForm] = useState(VACIO)
  const set = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }))

  useEffect(() => {
    if (material) {
      // El formulario se rehidrata cuando cambia la ficha remota.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(desdeMaterial(material))
    }
  }, [material])

  const subcategorias = categorias.find(c => String(c.id) === form.categoriaId)?.subcategorias ?? []
  const precioOriginal = material?.precio ?? null
  const precioCambio = !esNueva && form.precio !== '' && Number(form.precio) !== Number(precioOriginal || 0)
  const stockCambio = !esNueva && form.stock !== '' && Number(form.stock) !== Number(material?.stock || 0)

  const guardar = async () => {
    if (!form.codigoInterno.trim() || !form.nombre.trim()) {
      toast.warning('Código y nombre son obligatorios')
      return
    }
    if (form.precio !== '' && !Number.isFinite(Number(form.precio))) {
      toast.warning('El costo unitario debe ser un número')
      return
    }

    const base = {
      codigoInterno: form.codigoInterno.trim(),
      codigoBarra: form.codigoBarra.trim() || null,
      nombre: form.nombre.trim(),
      detalle: form.detalle.trim() || null,
      unidadMedida: form.unidadMedida || null,
      stockCritico: numeroOpcional(form.stockCritico) ?? 0,
      tallerId: idOpcional(form.tallerId),
      categoriaId: idOpcional(form.categoriaId),
      subcategoriaId: idOpcional(form.subcategoriaId),
      proveedorId: idOpcional(form.proveedorId),
      sucursalId: idOpcional(form.sucursalId),
      densidadKgM3: numeroOpcional(form.densidadKgM3),
      espesorMm: numeroOpcional(form.espesorMm),
      formato: form.formato.trim() || null,
    }

    try {
      if (esNueva) {
        const creada = await crear.mutateAsync({
          ...base,
          precio: Number(form.precio) || 0,
          stock: Number(form.stock) || 0,
        })
        toast.success('Materia prima creada')
        navigate(`/materias-primas/${creada.id}?volver=${encodeURIComponent(volverA)}`, { replace: true })
        return
      }
      // Precio y stock solo viajan cuando cambian de verdad: mandarlos siempre
      // dejaba el costo en 0 si el campo quedaba vacio, ensuciaba el historial
      // de precios y generaba movimientos de ajuste que nadie hizo.
      const data = { ...base }
      if (precioCambio) {
        data.precio = Number(form.precio)
        data.motivo = form.motivo.trim() || undefined
      }
      if (stockCambio) data.stock = Number(form.stock)

      await actualizar.mutateAsync({ id: Number(id), data })
      toast.success('Materia prima actualizada')
      navigate(`/materias-primas/${id}?volver=${encodeURIComponent(volverA)}`)
    } catch (error) {
      toast.error(error.response?.data?.error || 'No se pudo guardar la materia prima')
    }
  }

  if (!esNueva && isLoading) return <main style={{ padding: 24 }}>Cargando ficha…</main>
  if (!esNueva && (isError || !material)) return <main style={{ padding: 24 }}>Materia prima no encontrada</main>

  const guardando = crear.isPending || actualizar.isPending
  const titulo = esNueva ? 'Nueva materia prima' : `${material.codigoInterno} · ${material.nombre}`
  const enlaceVolver = `${volverA}`
  const enlaceFicha = `/materias-primas/${id}?volver=${encodeURIComponent(volverA)}`

  const acciones = soloLectura
    ? (
      <>
        <Btn variant="ghost" onClick={() => navigate(enlaceVolver)}>← Volver</Btn>
        {puedeEscribir && (
          <Btn variant="primary" icon="edit" onClick={() => navigate(`/materias-primas/${id}/editar?volver=${encodeURIComponent(volverA)}`)}>Editar</Btn>
        )}
      </>
    )
    : (
      <>
        <Btn variant="ghost" onClick={() => navigate(esNueva ? enlaceVolver : enlaceFicha)}>Cancelar</Btn>
        <Btn variant="primary" icon={guardando ? 'refreshCw' : 'check'} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : esNueva ? 'Crear' : 'Guardar cambios'}
        </Btn>
      </>
    )

  const opciones = (lista, vacio, etiqueta = x => x.nombre) => [
    { value: '', label: vacio },
    ...lista.map(item => ({ value: String(item.id), label: etiqueta(item) })),
  ]

  return (
    <FormPage title={titulo} headerActions={acciones} footerActions={acciones}>
      <FormSection title="Identificación">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <FormField label="Código interno" required>
            <Input value={form.codigoInterno} onChange={v => set('codigoInterno', v)} placeholder="ej. MP-ALGODON" disabled={soloLectura} />
          </FormField>
          <FormField label="Código de barra">
            <Input value={form.codigoBarra} onChange={v => set('codigoBarra', v)} disabled={soloLectura} />
          </FormField>
          <FormField label="Nombre" required>
            <Input value={form.nombre} onChange={v => set('nombre', v)} placeholder="ej. Algodón" disabled={soloLectura} />
          </FormField>
          <FormField label="Detalle">
            <Input value={form.detalle} onChange={v => set('detalle', v)} placeholder="marca, formato u observación" disabled={soloLectura} />
          </FormField>
          <FormField label="Taller" hint="Define qué taller lo consume y con qué tarifas se costea.">
            <Select value={form.tallerId} onChange={v => set('tallerId', v)} disabled={soloLectura}
              options={opciones(talleres, 'Sin asignar', t => t.label || t.nombre)} />
          </FormField>
          <FormField label="Categoría">
            <Select value={form.categoriaId} onChange={v => { set('categoriaId', v); set('subcategoriaId', '') }} disabled={soloLectura}
              options={opciones(categorias, 'Sin categoría')} />
          </FormField>
          <FormField label="Subcategoría">
            <Select value={form.subcategoriaId} onChange={v => set('subcategoriaId', v)} disabled={soloLectura || !form.categoriaId || !subcategorias.length}
              options={opciones(subcategorias, 'Sin subcategoría')} />
          </FormField>
          <FormField label="Proveedor">
            <Select value={form.proveedorId} onChange={v => set('proveedorId', v)} disabled={soloLectura}
              options={opciones(proveedores, 'Sin proveedor', p => p.nombre || p.razonSocial || `Proveedor #${p.id}`)} />
          </FormField>
          <FormField label="Sucursal">
            <Select value={form.sucursalId} onChange={v => set('sucursalId', v)} disabled={soloLectura}
              options={opciones(sucursales, 'Sin sucursal')} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Costo e inventario" tone="price">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <FormField label="Unidad de medida">
            <Select value={form.unidadMedida} onChange={v => set('unidadMedida', v)} options={UNIDADES} disabled={soloLectura} />
          </FormField>
          <FormField label="Costo por unidad ($)" hint={precioCambio ? `Antes: ${moneda(precioOriginal)}` : undefined}>
            <Input type="number" min="0" value={form.precio} onChange={v => set('precio', v)} placeholder="0" disabled={soloLectura} />
          </FormField>
          {precioCambio && (
            <FormField label="Motivo del cambio de precio" hint="Queda en el historial de la ficha.">
              <Input value={form.motivo} onChange={v => set('motivo', v)} placeholder="ej. Ajuste proveedor" />
            </FormField>
          )}
          <FormField label="Stock" hint={stockCambio ? 'El cambio se registra como movimiento de ajuste manual.' : undefined}>
            <Input type="number" value={form.stock} onChange={v => set('stock', v)} placeholder="0" disabled={soloLectura} />
          </FormField>
          <FormField label="Stock crítico">
            <Input type="number" min="0" value={form.stockCritico} onChange={v => set('stockCritico', v)} placeholder="0" disabled={soloLectura} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Ficha técnica de espuma" tone="inventory">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <FormField label="Densidad (kg/m³)">
            <Input type="number" min="0" step="0.01" value={form.densidadKgM3} onChange={v => set('densidadKgM3', v)} placeholder="ej. 25" disabled={soloLectura} />
          </FormField>
          <FormField label="Espesor (mm)">
            <Input type="number" min="0" step="0.01" value={form.espesorMm} onChange={v => set('espesorMm', v)} placeholder="ej. 50" disabled={soloLectura} />
          </FormField>
          <FormField label="Formato">
            <Input value={form.formato} onChange={v => set('formato', v)} placeholder="ej. plancha 2 x 1 m" disabled={soloLectura} />
          </FormField>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
          La densidad identifica la espuma y obliga a consumirla por lote aprobado en las órdenes de taller. Lote, calidad y merma se controlan en Taller.
        </div>
      </FormSection>

      {soloLectura && (
        <FormSection title="Historial de precios">
          {historial.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 18 }}>Sin cambios de precio registrados.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {historial.map(registro => (
                <div key={registro.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 12px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace" }}>
                    {moneda(registro.precioAnterior)} → <strong>{moneda(registro.precioNuevo)}</strong>
                  </span>
                  <span style={{ flex: 1, color: 'var(--text-2)', fontSize: 12 }}>{registro.motivo || 'Sin motivo'}</span>
                  <Badge tone="gray">{new Date(registro.createdAt).toLocaleDateString('es-CL')}</Badge>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{registro.userNombre || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </FormSection>
      )}

      {soloLectura && lotes.length > 0 && (
        <FormSection title="Lotes registrados">
          <div style={{ marginBottom: 18 }}>
            <Table
              columns={[
                { key: 'codigo', label: 'Lote' },
                { key: 'cantidadInicial', label: 'Ingreso', align: 'right', render: v => Number(v || 0).toFixed(2) },
                { key: 'cantidadDisponible', label: 'Disponible', align: 'right', render: v => Number(v || 0).toFixed(2) },
                { key: 'estadoCalidad', label: 'Calidad', render: v => <Badge tone={v === 'aprobado' ? 'green' : v === 'observado' ? 'amber' : 'red'}>{v}</Badge> },
                { key: 'observacion', label: 'Observación', render: v => v || '—' },
              ]}
              rows={lotes}
              getRowKey={row => row.id}
              ariaLabel="Lotes de la materia prima"
              emptyMessage="Sin lotes registrados"
            />
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
              El ingreso de lotes se registra desde Bodega Taller, junto con su control de calidad.
            </div>
          </div>
        </FormSection>
      )}
    </FormPage>
  )
}
