import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Icon } from '../../components/shared'
import {
  useImportaciones,
  useCreateImportacion,
  useUpdateImportacion,
  useSumarStockImportacion,
  useDeleteImportacion,
} from '../../api/importaciones'
import { useProveedores } from '../../api/proveedores'
import { useProductos } from '../../api/productos'
import { toast, confirmDialog } from '../../store/notif'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { downloadFromBackend } from '../../utils/csv'

function money(value) {
  return '$' + Number(value || 0).toLocaleString('es-CL')
}

function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('es-CL')
}

function etaDaysRemaining(etaIso) {
  if (!etaIso) return null
  const eta = new Date(etaIso)
  if (isNaN(eta.getTime())) return null
  const now = new Date()
  const diffTime = eta.getTime() - now.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function estadoBadgeTone(estado) {
  if (estado === 'Recepcionado') return 'green'
  if (estado === 'En tránsito') return 'blue'
  if (estado === 'En aduana') return 'amber'
  if (estado === 'Cancelado') return 'red'
  return 'gray'
}

export default function ImportacionesPage({ embedded = false }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWriteBodega = can(user, 'bodega', 'write')
  const canDeleteBodega = can(user, 'bodega', 'delete')

  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState('all')
  const [tipoTransporte, setTipoTransporte] = useState('all')
  const [proveedorId, setProveedorId] = useState('')
  const [modalFormOpen, setModalFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [sumarStockItem, setSumarStockItem] = useState(null)

  const queryParams = useMemo(() => {
    const q = {}
    if (search) q.search = search
    if (estado !== 'all') q.estado = estado
    if (tipoTransporte !== 'all') q.tipoTransporte = tipoTransporte
    if (proveedorId) q.proveedorId = proveedorId
    return q
  }, [search, estado, tipoTransporte, proveedorId])

  const { data = { items: [], total: 0, kpis: {} }, isLoading } = useImportaciones(queryParams)
  const { data: proveedoresData = { items: [] } } = useProveedores()
  const proveedoresList = proveedoresData.items || []

  const deleteMutation = useDeleteImportacion()

  const handleDelete = async (row) => {
    if (row.estado === 'Recepcionado') {
      toast.error('No se puede eliminar una importación que ya fue sumada al inventario')
      return
    }
    if (!(await confirmDialog({
      title: 'Eliminar Importación',
      detail: `¿Desea eliminar la importación del contenedor ${row.numeroContenedor}?`,
      tone: 'danger',
    }))) return

    deleteMutation.mutate(row.id, {
      onSuccess: () => toast.success('Importación eliminada correctamente'),
      onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar importación'),
    })
  }

  const columns = [
    {
      key: 'numeroContenedor',
      header: 'Contenedor / Tracking',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-3)' }}>
              {row.tipoTransporte === 'Marítimo' ? <Icon name="ship" size={15} />
                : row.tipoTransporte === 'Aéreo' ? <Icon name="plane" size={15} />
                : <Icon name="truck" size={15} />}
            </span>
            <span>{row.numeroContenedor}</span>
          </div>
          {row.navieraAgencia && (
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {row.navieraAgencia} {row.documentoAduana ? `· Doc: ${row.documentoAduana}` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'tipoTransporte',
      header: 'Transporte',
      render: (row) => (
        <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {row.tipoTransporte}
        </span>
      ),
    },
    {
      key: 'proveedor',
      header: 'Proveedor / Origen',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{row.proveedorNombre || row.proveedor?.nombre || '-'}</div>
          {row.origen && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Origen: {row.origen}</div>}
        </div>
      ),
    },
    {
      key: 'puertoDestino',
      header: 'Destino',
      render: (row) => (
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.puertoDestino || 'San Antonio'}</span>
      ),
    },
    {
      key: 'fechaEta',
      header: 'Fecha ETA (Arribo)',
      render: (row) => {
        const days = etaDaysRemaining(row.fechaEta)
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{formatDate(row.fechaEta)}</div>
            {row.estado !== 'Recepcionado' && days !== null && (
              <span style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: days < 0 ? 'var(--red)' : days <= 3 ? 'oklch(0.48 0.14 68)' : 'var(--blue)',
              }}>
                {days < 0 ? `Atrasado (${Math.abs(days)}d)` : days === 0 ? 'Arriba hoy' : `En ${days} días`}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'items',
      header: 'Mercadería / Unidades',
      render: (row) => {
        const totalQty = (row.items || []).reduce((acc, it) => acc + (it.cantidadEsperada || 0), 0)
        const itemCount = row.items?.length || 0
        return (
          <div>
            <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{totalQty.toLocaleString('es-CL')} un.</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>({itemCount} {itemCount === 1 ? 'ítem' : 'ítems'})</span>
          </div>
        )
      },
    },
    {
      key: 'totalCif',
      header: 'Total CIF',
      align: 'right',
      render: (row) => (
        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12 }}>
          {money(row.totalCif)}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (row) => (
        <Badge tone={estadoBadgeTone(row.estado)} size="sm">
          {row.estado}
        </Badge>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          {row.estado !== 'Recepcionado' && canWriteBodega && (
            <button
              onClick={(e) => { e.stopPropagation(); setSumarStockItem(row) }}
              title="Sumar físicamente al inventario"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'var(--green-600, #16a34a)',
                color: '#fff',
                fontSize: 11.5,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              }}
            >
              <Icon name="plusCircle" size={13} />
              Sumar al Stock
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); setDetailItem(row) }}
            title="Ver detalle del contenedor"
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              background: '#f8fafc',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              color: 'var(--text-2)',
            }}
          >
            <Icon name="eye" size={13} />
          </button>

          {row.estado !== 'Recepcionado' && canWriteBodega && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditingItem(row); setModalFormOpen(true) }}
              title="Editar"
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: '#f8fafc',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--text-2)',
              }}
            >
              <Icon name="edit" size={13} />
            </button>
          )}

          {row.estado !== 'Recepcionado' && canDeleteBodega && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(row) }}
              title="Eliminar"
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: '#fff',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--red)',
              }}
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      ),
    },
  ]

  const kpis = data.kpis || {}

  return (
    <main style={{ padding: embedded ? '0' : '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {!embedded && (
        <PageHeader
          title="Importaciones y Mercadería en Tránsito"
          subtitle="Control de contenedores marítimos, aéreos y recepción física en bodega"
          breadcrumb={['Inicio', 'Bodega', 'Importaciones']}
          actions={
            <>
              <Btn
                variant="secondary"
                icon="download"
                size="sm"
                onClick={() => downloadFromBackend('/importaciones/export', `importaciones_${new Date().toISOString().slice(0, 10)}.csv`)}
              >
                Exportar Excel
              </Btn>
              {canWriteBodega && (
                <Btn
                  variant="primary"
                  icon="plusCircle"
                  size="sm"
                  onClick={() => { setEditingItem(null); setModalFormOpen(true) }}
                >
                  Nuevo Embarque / Contenedor
                </Btn>
              )}
            </>
          }
        />
      )}

      {/* KPI Cards */}
      <div className="kpi-strip" style={{ marginBottom: 16 }}>
        <KpiCard
          label="Contenedores en Tránsito"
          value={kpis.contenedoresActivos ?? 0}
          icon="ship"
          sublabel="Embarques activos"
          onClick={() => { setEstado('En tránsito') }}
        />
        <KpiCard
          label="Unidades en Camino"
          value={(kpis.unidadesEnTransito ?? 0).toLocaleString('es-CL')}
          icon="package"
          tone="blue"
          sublabel="Mercadería en tránsito"
        />
        <KpiCard
          label="Próximos Arribos (7 días)"
          value={kpis.proximosArribos7Dias ?? 0}
          icon="clock"
          tone="amber"
          sublabel="Llegadas inminentes ETA"
        />
        <KpiCard
          label="Total Recepcionados"
          value={kpis.totalRecepcionados ?? 0}
          icon="checkCircle"
          tone="green"
          sublabel="Sumados al stock"
          onClick={() => { setEstado('Recepcionado') }}
        />
      </div>

      {/* Toolbar / Filtros */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          background: '#fafafa',
        }}>
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Buscar por contenedor, naviera, proveedor, producto..."
            />
          </div>

          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, background: '#fff', cursor: 'pointer' }}
          >
            <option value="all">Todos los estados</option>
            <option value="En tránsito">En tránsito</option>
            <option value="En aduana">En aduana</option>
            <option value="Recepcionado">Recepcionado</option>
            <option value="Cancelado">Cancelado</option>
          </select>

          <select
            value={tipoTransporte}
            onChange={(e) => setTipoTransporte(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, background: '#fff', cursor: 'pointer' }}
          >
            <option value="all">Todo transporte</option>
            <option value="Marítimo">Marítimo</option>
            <option value="Aéreo">Aéreo</option>
            <option value="Terrestre">Terrestre</option>
          </select>

          <select
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, background: '#fff', cursor: 'pointer', maxWidth: 180 }}
          >
            <option value="">Todos los proveedores</option>
            {proveedoresList.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>

          {embedded && canWriteBodega && (
            <Btn
              variant="primary"
              icon="plusCircle"
              size="sm"
              onClick={() => { setEditingItem(null); setModalFormOpen(true) }}
            >
              Nuevo Contenedor
            </Btn>
          )}
        </div>

        {/* Tabla */}
        <Table
          columns={columns}
          rows={data.items || []}
          emptyMessage="No se encontraron importaciones con los filtros seleccionados"
          onRowDoubleClick={(row) => setDetailItem(row)}
          getRowKey={(row) => row.id}
          stickyHeader
        />
      </div>

      {/* Modal Crear / Editar */}
      {modalFormOpen && (
        <ImportacionFormModal
          item={editingItem}
          proveedores={proveedoresList}
          onClose={() => { setModalFormOpen(false); setEditingItem(null) }}
        />
      )}

      {/* Modal Detalle */}
      {detailItem && (
        <ImportacionDetalleModal
          item={detailItem}
          canWriteBodega={canWriteBodega}
          onSumarStock={() => { setSumarStockItem(detailItem); setDetailItem(null) }}
          onClose={() => setDetailItem(null)}
        />
      )}

      {/* Modal Sumar al Stock */}
      {sumarStockItem && (
        <SumarStockModal
          item={sumarStockItem}
          onClose={() => setSumarStockItem(null)}
        />
      )}
    </main>
  )
}

// ── MODAL CREAR / EDITAR IMPORTACIÓN ─────────────────────────────────────────
function ImportacionFormModal({ item, proveedores = [], onClose }) {
  const isEditing = Boolean(item?.id)
  const createMutation = useCreateImportacion()
  const updateMutation = useUpdateImportacion()

  const [numeroContenedor, setNumeroContenedor] = useState(item?.numeroContenedor || '')
  const [tipoTransporte, setTipoTransporte] = useState(item?.tipoTransporte || 'Marítimo')
  const [proveedorId, setProveedorId] = useState(item?.proveedorId ? String(item.proveedorId) : '')
  const [origen, setOrigen] = useState(item?.origen || '')
  const [puertoDestino, setPuertoDestino] = useState(item?.puertoDestino || 'San Antonio')
  const [navieraAgencia, setNavieraAgencia] = useState(item?.navieraAgencia || '')
  const [fechaEmbarque, setFechaEmbarque] = useState(item?.fechaEmbarque ? item.fechaEmbarque.slice(0, 10) : '')
  const [fechaEta, setFechaEta] = useState(item?.fechaEta ? item.fechaEta.slice(0, 10) : '')
  const [documentoAduana, setDocumentoAduana] = useState(item?.documentoAduana || '')
  const [costoFlete, setCostoFlete] = useState(item?.costoFlete || 0)
  const [costoSeguro, setCostoSeguro] = useState(item?.costoSeguro || 0)
  const [costoAduana, setCostoAduana] = useState(item?.costoAduana || 0)
  const [observaciones, setObservaciones] = useState(item?.observaciones || '')

  // Items list
  const [items, setItems] = useState(
    item?.items?.length
      ? item.items.map((it) => ({
          productoId: it.productoId || null,
          codigoInterno: it.codigoInterno || '',
          nombre: it.nombre || '',
          cantidadEsperada: it.cantidadEsperada || 1,
          costoUnitario: it.costoUnitario || 0,
        }))
      : [{ productoId: null, codigoInterno: '', nombre: '', cantidadEsperada: 100, costoUnitario: 0 }]
  )

  // Autocomplete helpers
  const [productSearch, setProductSearch] = useState('')
  const { data: searchResult = { items: [] } } = useProductos({ search: productSearch, limit: 10 })
  const searchSuggestions = searchResult.items || []

  const handleAddItem = () => {
    setItems((prev) => [...prev, { productoId: null, codigoInterno: '', nombre: '', cantidadEsperada: 100, costoUnitario: 0 }])
  }

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleSelectProduct = (index, prod) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        productoId: prod.id,
        codigoInterno: prod.codigoInterno,
        nombre: prod.nombre,
        costoUnitario: prod.precioLista || next[index].costoUnitario || 0,
      }
      return next
    })
  }

  const subtotalProductos = items.reduce((acc, it) => acc + (Number(it.cantidadEsperada || 0) * Number(it.costoUnitario || 0)), 0)
  const totalCifEstimado = subtotalProductos + Number(costoFlete || 0) + Number(costoSeguro || 0) + Number(costoAduana || 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!numeroContenedor.trim()) {
      toast.error('El número de contenedor o documento de embarque es requerido')
      return
    }
    if (items.length === 0 || !items.some((i) => i.nombre.trim() || i.codigoInterno.trim())) {
      toast.error('Debe incluir al menos un producto en el contenedor')
      return
    }

    const selectedProv = proveedores.find((p) => String(p.id) === String(proveedorId))

    const payload = {
      numeroContenedor: numeroContenedor.trim(),
      tipoTransporte,
      proveedorId: proveedorId ? Number(proveedorId) : null,
      proveedorNombre: selectedProv?.nombre || null,
      origen: origen.trim() || null,
      puertoDestino: puertoDestino.trim() || null,
      navieraAgencia: navieraAgencia.trim() || null,
      fechaEmbarque: fechaEmbarque || null,
      fechaEta: fechaEta || null,
      documentoAduana: documentoAduana.trim() || null,
      costoFlete: Number(costoFlete || 0),
      costoSeguro: Number(costoSeguro || 0),
      costoAduana: Number(costoAduana || 0),
      observaciones: observaciones.trim() || null,
      items: items.map((it) => ({
        productoId: it.productoId,
        codigoInterno: it.codigoInterno,
        nombre: it.nombre,
        cantidadEsperada: Number(it.cantidadEsperada || 1),
        costoUnitario: Number(it.costoUnitario || 0),
      })),
    }

    if (isEditing) {
      updateMutation.mutate(
        { id: item.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Importación actualizada correctamente')
            onClose()
          },
          onError: (err) => toast.error(err.response?.data?.error || 'Error al actualizar importación'),
        }
      )
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success('Embarque de importación registrado exitosamente')
          onClose()
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Error al registrar importación'),
      })
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 860, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              {isEditing ? `Editar Contenedor ${item.numeroContenedor}` : 'Registrar Nuevo Embarque / Contenedor'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
              Seguimiento de mercadería en tránsito y fechas de arribo
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>N° Contenedor / Tracking *</label>
              <input
                type="text"
                required
                value={numeroContenedor}
                onChange={(e) => setNumeroContenedor(e.target.value)}
                placeholder="Ej: MSKU-982341-2 / AWB-8129"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Tipo de Transporte</label>
              <select
                value={tipoTransporte}
                onChange={(e) => setTipoTransporte(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              >
                <option value="Marítimo">Marítimo (Barco)</option>
                <option value="Aéreo">Aéreo (Avión)</option>
                <option value="Terrestre">Terrestre (Camión)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Proveedor / Embarcador</label>
              <select
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              >
                <option value="">Seleccione proveedor...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Naviera / Courier / BL</label>
              <input
                type="text"
                value={navieraAgencia}
                onChange={(e) => setNavieraAgencia(e.target.value)}
                placeholder="Ej: Maersk, MSC, DHL"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Puerto / Ciudad Origen</label>
              <input
                type="text"
                value={origen}
                onChange={(e) => setOrigen(e.target.value)}
                placeholder="Ej: Ningbo, China"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Puerto Destino</label>
              <input
                type="text"
                value={puertoDestino}
                onChange={(e) => setPuertoDestino(e.target.value)}
                placeholder="Ej: San Antonio"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Fecha Embarque (ETD)</label>
              <input
                type="date"
                value={fechaEmbarque}
                onChange={(e) => setFechaEmbarque(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Fecha Estimada Arribo (ETA) *</label>
              <input
                type="date"
                required
                value={fechaEta}
                onChange={(e) => setFechaEta(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>
          </div>

          {/* Tabla de Productos / Ítems */}
          <div style={{ marginTop: 16, marginBottom: 16, background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Productos y Mercadería Contenida</span>
              <Btn type="button" variant="secondary" size="sm" icon="plus" onClick={handleAddItem}>
                Agregar Producto
              </Btn>
            </div>

            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 110px 110px 32px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <input
                    type="text"
                    placeholder="Cód. Interno"
                    value={it.codigoInterno}
                    onChange={(e) => {
                      handleItemChange(idx, 'codigoInterno', e.target.value)
                      setProductSearch(e.target.value)
                    }}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                  />
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Nombre del producto"
                    value={it.nombre}
                    onChange={(e) => {
                      handleItemChange(idx, 'nombre', e.target.value)
                      setProductSearch(e.target.value)
                    }}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                  />
                  {productSearch && searchSuggestions.length > 0 && it.codigoInterno.toLowerCase() === productSearch.toLowerCase() && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                      background: '#fff', borderRadius: 6, boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)',
                      maxHeight: 140, overflowY: 'auto',
                    }}>
                      {searchSuggestions.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => { handleSelectProduct(idx, s); setProductSearch('') }}
                          style={{ padding: '6px 10px', fontSize: 11.5, cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                          onMouseLeave={(e) => e.target.style.background = '#fff'}
                        >
                          <strong>{s.codigoInterno}</strong> - {s.nombre} (Stock: {s.stock})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <input
                    type="number"
                    min="1"
                    placeholder="Cantidad"
                    value={it.cantidadEsperada}
                    onChange={(e) => handleItemChange(idx, 'cantidadEsperada', e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }}
                  />
                </div>

                <div>
                  <input
                    type="number"
                    min="0"
                    placeholder="Costo FOB/CIF"
                    value={it.costoUnitario}
                    onChange={(e) => handleItemChange(idx, 'costoUnitario', e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }}
                  />
                </div>

                <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", textAlign: 'right', fontWeight: 600, color: 'var(--text-2)' }}>
                  {money((Number(it.cantidadEsperada) || 0) * (Number(it.costoUnitario) || 0))}
                </div>

                <div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, paddingTop: 10, borderTop: '1px dashed var(--border)', fontSize: 12 }}>
              <span>Total Unidades: <strong>{items.reduce((acc, it) => acc + (Number(it.cantidadEsperada) || 0), 0).toLocaleString('es-CL')} un.</strong></span>
              <span>Subtotal Mercadería: <strong>{money(subtotalProductos)}</strong></span>
            </div>
          </div>

          {/* Costos Flete / Aduana / Seguro */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-2)', marginBottom: 4 }}>Costo Flete</label>
              <input
                type="number"
                min="0"
                value={costoFlete}
                onChange={(e) => setCostoFlete(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-2)', marginBottom: 4 }}>Costo Seguro</label>
              <input
                type="number"
                min="0"
                value={costoSeguro}
                onChange={(e) => setCostoSeguro(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-2)', marginBottom: 4 }}>Gastos Aduana / DIN</label>
              <input
                type="number"
                min="0"
                value={costoAduana}
                onChange={(e) => setCostoAduana(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
              />
            </div>
            <div style={{ background: '#f0fdf4', padding: '6px 12px', borderRadius: 7, border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, color: '#166534' }}>Total Estimado CIF</span>
              <strong style={{ fontSize: 14, color: '#15803d', fontFamily: "'DM Mono', monospace" }}>{money(totalCifEstimado)}</strong>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Observaciones / Notas de Tránsito</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              placeholder="Notas sobre el despacho, condiciones de recepción, etc."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <Btn type="button" variant="secondary" onClick={onClose}>Cancelar</Btn>
            <Btn type="submit" variant="primary" loading={createMutation.isPending || updateMutation.isPending}>
              {isEditing ? 'Guardar Cambios' : 'Registrar Embarque'}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── MODAL DETALLE DE IMPORTACIÓN ─────────────────────────────────────────────
function ImportacionDetalleModal({ item, canWriteBodega, onSumarStock, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 780, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Contenedor {item.numeroContenedor}</h2>
              <Badge tone={estadoBadgeTone(item.estado)}>{item.estado}</Badge>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Transporte {item.tipoTransporte} · Naviera: {item.navieraAgencia || '-'}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18, background: '#f8fafc', padding: 14, borderRadius: 10 }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>Proveedor / Embarcador</span>
            <strong style={{ fontSize: 13 }}>{item.proveedorNombre || item.proveedor?.nombre || '-'}</strong>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>Origen / Destino</span>
            <span style={{ fontSize: 12 }}>{item.origen || '-'} ➔ {item.puertoDestino || 'San Antonio'}</span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>Fecha ETA (Arribo)</span>
            <strong style={{ fontSize: 13, color: 'var(--blue)' }}>{formatDate(item.fechaEta)}</strong>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>Total CIF</span>
            <strong style={{ fontSize: 13, fontFamily: "'DM Mono', monospace" }}>{money(item.totalCif)}</strong>
          </div>
          {item.fechaRecepcion && (
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>Fecha Recepción en Bodega</span>
              <strong style={{ fontSize: 12, color: 'var(--green-700)' }}>{formatDate(item.fechaRecepcion)}</strong>
            </div>
          )}
        </div>

        {/* Detalle de Productos */}
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Desglose de Mercadería</h4>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>Código</th>
                  <th style={{ padding: '8px 10px' }}>Producto</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cant. Esperada</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cant. Recibida</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Costo Unit.</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Subtotal</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {(item.items || []).map((it) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{it.codigoInterno || '-'}</td>
                    <td style={{ padding: '8px 10px' }}>{it.nombre || '-'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{it.cantidadEsperada.toLocaleString('es-CL')}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: it.recibido ? 'var(--green-700)' : 'var(--text-3)' }}>
                      {it.cantidadRecibida.toLocaleString('es-CL')}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>{money(it.costoUnitario)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                      {money(it.cantidadEsperada * it.costoUnitario)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {it.recibido ? <Badge tone="green" size="sm">Recibido</Badge> : <Badge tone="amber" size="sm">En camino</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {item.observaciones && (
          <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 18 }}>
            <strong>Observaciones:</strong> {item.observaciones}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="secondary" onClick={onClose}>Cerrar</Btn>
          {item.estado !== 'Recepcionado' && canWriteBodega && (
            <Btn variant="primary" icon="plusCircle" onClick={onSumarStock}>
              Sumar al Stock Físico
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}

// ── MODAL SUMAR AL STOCK (RECEPCIÓN FÍSICA) ──────────────────────────────────
function SumarStockModal({ item, onClose }) {
  const sumarMutation = useSumarStockImportacion()
  const [cantidades, setCantidades] = useState(
    (item.items || []).reduce((acc, it) => {
      acc[it.id] = it.cantidadEsperada
      return acc
    }, {})
  )

  const handleQtyChange = (itemId, val) => {
    setCantidades((prev) => ({
      ...prev,
      [itemId]: Math.max(0, Number(val) || 0),
    }))
  }

  const handleConfirm = () => {
    sumarMutation.mutate(
      { id: item.id, payload: { cantidadesRecibidas: cantidades } },
      {
        onSuccess: (data) => {
          toast.success(data.message || 'Mercadería inyectada exitosamente al stock de bodega')
          onClose()
        },
        onError: (err) => {
          toast.error(err.response?.data?.error || 'Error al sumar mercadería al stock')
        },
      }
    )
  }

  const totalUnidades = Object.values(cantidades).reduce((a, b) => a + Number(b || 0), 0)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 680, maxWidth: '95vw', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="package" size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Recepción de Mercadería: Sumar al Stock</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Contenedor: <strong>{item.numeroContenedor}</strong> · Inyección directa al inventario físico
            </p>
          </div>
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e', marginBottom: 14 }}>
          Al confirmar, el sistema incrementará automáticamente las existencias de cada producto en la base de datos de Bodega y generará el registro de movimiento con trazabilidad.
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Código</th>
                <th style={{ padding: '8px 10px' }}>Producto</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Esperado</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cantidad a Ingresar</th>
              </tr>
            </thead>
            <tbody>
              {(item.items || []).map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 10px', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{it.codigoInterno || '-'}</td>
                  <td style={{ padding: '8px 10px' }}>{it.nombre}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-3)' }}>{it.cantidadEsperada.toLocaleString('es-CL')}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                    <input
                      type="number"
                      min="0"
                      value={cantidades[it.id] ?? it.cantidadEsperada}
                      onChange={(e) => handleQtyChange(it.id, e.target.value)}
                      style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', textAlign: 'right', fontWeight: 600, fontSize: 12 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Total unidades a incorporar: <strong>{totalUnidades.toLocaleString('es-CL')} un.</strong></span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" icon="check" loading={sumarMutation.isPending} onClick={handleConfirm}>
            Confirmar e Inyectar al Inventario
          </Btn>
        </div>
      </div>
    </div>
  )
}
