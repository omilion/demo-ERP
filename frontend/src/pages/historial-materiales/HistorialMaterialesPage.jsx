import { toast, confirmDialog } from '../../store/notif'
import { useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, Pager, Table } from '../../components/shared'
import { FormField, Input, Select } from '../../components/forms'
import { useDeleteHistorialMaterial, useDeleteManyHistorialMaterial, useHistorialMateriales } from '../../api/historialMateriales'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const mono = { fontFamily: "'DM Mono', monospace" }

export default function HistorialMaterialesPage() {
  const user = useAuthStore(s => s.user)
  const canDelete = can(user, 'taller', 'delete')
  const [operario, setOperario] = useState('')
  const [taller, setTaller] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [odtId, setOdtId] = useState('')
  const [tipoMovimiento, setTipoMovimiento] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState([])

  const setFilter = setter => value => {
    setter(value)
    setPage(1)
    setSelectedIds([])
  }

  const params = { page: String(page) }
  if (operario) params.operario = operario
  if (taller) params.taller = taller
  if (codigo) params.codigoInterno = codigo
  if (nombre) params.nombre = nombre
  if (odtId) params.odtId = odtId
  if (tipoMovimiento) params.tipoMovimiento = tipoMovimiento
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta

  const { data = { items: [], total: 0, limit: 100, pages: 1, totalEgreso: 0, totalIngreso: 0 }, isLoading } = useHistorialMateriales(params)
  const delMut = useDeleteHistorialMaterial()
  const delManyMut = useDeleteManyHistorialMaterial()
  const rows = data.items || []
  const selectedSet = new Set(selectedIds)
  const visibleIds = rows.map(r => r.id).filter(Boolean)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedSet.has(id))

  const toggleRow = id => {
    setSelectedIds(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  }

  const toggleVisible = () => {
    setSelectedIds(current => {
      const currentSet = new Set(current)
      if (allVisibleSelected) {
        for (const id of visibleIds) currentSet.delete(id)
      } else {
        for (const id of visibleIds) currentSet.add(id)
      }
      return [...currentSet]
    })
  }

  const deleteSelected = async () => {
    if (!selectedIds.length) return
    if (!await confirmDialog({ title: 'Confirmar', detail: `Eliminar ${selectedIds.length} movimiento(s) seleccionados?`, tone: 'danger' })) return
    delManyMut.mutate(selectedIds, {
      onSuccess: () => setSelectedIds([]),
      onError: err => toast.error(err?.response?.data?.error || 'Error al eliminar seleccion'),
    })
  }

  const cols = [
    ...(canDelete ? [{
      key: '_sel',
      label: '',
      render: (_, row) => (
        <input
          type="checkbox"
          checked={selectedSet.has(row.id)}
          onChange={e => { e.stopPropagation(); toggleRow(row.id) }}
          onClick={e => e.stopPropagation()}
        />
      ),
    }] : []),
    { key: 'fecha', label: 'Fecha',
      render: v => <span style={{ ...mono, fontSize: 11 }}>{v ? new Date(v).toLocaleString('es-CL') : '-'}</span> },
    { key: 'codigoInterno', label: 'Codigo',
      render: v => <span style={{ ...mono, fontWeight: 600, color: 'var(--green-700)' }}>{v}</span> },
    { key: 'nombre', label: 'Material', wrap: true,
      render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    { key: 'ubicacion', label: 'Ubicacion',
      render: v => v ? <span style={{ ...mono, fontSize: 11 }}>{v}</span> : '-' },
    { key: 'taller', label: 'Taller',
      render: v => v ? <Badge tone="blue">{v}</Badge> : '-' },
    { key: 'usuario', label: 'Operario' },
    { key: 'odtId', label: 'OT',
      render: v => v ? <span style={mono}>#{v}</span> : '-' },
    { key: 'egreso', label: 'Egreso', align: 'right',
      render: v => Number(v || 0) ? <span style={{ ...mono, color: 'var(--red-700)', fontWeight: 600 }}>-{v}</span> : '-' },
    { key: 'ingreso', label: 'Ingreso', align: 'right',
      render: v => Number(v || 0) ? <span style={{ ...mono, color: 'var(--green-700)', fontWeight: 600 }}>+{v}</span> : '-' },
    { key: '_saldo', label: 'Saldo', align: 'right',
      render: (_, row) => {
        const saldo = Number(row.ingreso || 0) - Number(row.egreso || 0)
        return <span style={{ ...mono, color: saldo < 0 ? 'var(--red-700)' : 'var(--green-700)' }}>{saldo.toLocaleString('es-CL', { maximumFractionDigits: 2 })}</span>
      } },
    { key: 'unidad', label: 'Unidad' },
    ...(canDelete ? [{
      key: '_acc',
      label: '',
      render: (_, row) => (
        <button
          onClick={async (e) => {
            e.stopPropagation()
            if (await confirmDialog({ title: 'Confirmar', detail: 'Eliminar movimiento?', tone: 'danger' })) delMut.mutate(row.id)
          }}
          style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer', fontSize: 12 }}
        >
          Borrar
        </button>
      ),
    }] : []),
  ]

  const exportar = () => {
    const exportParams = { ...params }
    delete exportParams.page
    downloadFromBackend('/historial-materiales/export', `historial_materiales_${new Date().toISOString().slice(0, 10)}.csv`, exportParams)
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title="Historial de Materiales"
        subtitle="Movimientos en talleres"
        breadcrumb={['Inicio', 'Taller', 'Historial']}
        actions={<>
          {canDelete && selectedIds.length > 0 && <Btn variant="danger" size="sm" icon="trash" onClick={deleteSelected} disabled={delManyMut.isPending}>Eliminar seleccion</Btn>}
          <Btn variant="secondary" size="sm" icon="download" onClick={exportar}>Exportar CSV</Btn>
        </>}
      />
      <div className="kpi-strip">
        <KpiCard label="Movimientos" value={data.total} icon="repeat" />
        <KpiCard label="Total egreso" value={Number(data.totalEgreso || 0).toFixed(2)} icon="trendingDown" tone="red" />
        <KpiCard label="Total ingreso" value={Number(data.totalIngreso || 0).toFixed(2)} icon="trendingUp" tone="green" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <FormField label="Desde"><Input type="date" value={desde} onChange={setFilter(setDesde)} /></FormField>
          <FormField label="Hasta"><Input type="date" value={hasta} onChange={setFilter(setHasta)} /></FormField>
          <FormField label="Operario"><Input value={operario} onChange={setFilter(setOperario)} /></FormField>
          <FormField label="Taller"><Input value={taller} onChange={setFilter(setTaller)} /></FormField>
          <FormField label="Codigo interno"><Input value={codigo} onChange={setFilter(setCodigo)} /></FormField>
          <FormField label="Material"><Input value={nombre} onChange={setFilter(setNombre)} /></FormField>
          <FormField label="OT"><Input type="number" value={odtId} onChange={setFilter(setOdtId)} /></FormField>
          <FormField label="Movimiento">
            <Select value={tipoMovimiento} onChange={setFilter(setTipoMovimiento)} options={[
              { value: '', label: 'Todos' },
              { value: 'egreso', label: 'Egreso' },
              { value: 'ingreso', label: 'Ingreso' },
            ]} />
          </FormField>
        </div>
        {canDelete && rows.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-2)' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} />
              Seleccionar pagina
            </label>
            {selectedIds.length > 0 && <span style={mono}>{selectedIds.length} seleccionados</span>}
          </div>
        )}
        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center' }}>Cargando...</div>
          : <Table columns={cols} rows={rows} emptyMessage="Sin movimientos" keyboard ariaLabel="Historial de materiales" getRowKey={(row, index) => row.id || index} />
        }
        <Pager
          page={data.page || page}
          pages={data.pages || 1}
          total={data.total || 0}
          limit={data.limit || 100}
          shown={rows.length}
          onChange={nextPage => { setPage(nextPage); setSelectedIds([]) }}
          disabled={isLoading}
        />
      </div>
    </main>
  )
}
