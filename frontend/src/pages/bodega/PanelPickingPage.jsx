import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table } from '../../components/shared'
import { useDespachoColaOperativa } from '../../api/despachos'
import { PackingProgress } from '../despachos/shared-ui'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import BotonExportar from '../../components/BotonExportar'

function tone(estado) {
  return estado?.tone || 'gray'
}

export default function PanelPickingPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWriteDespacho = can(user, 'despacho', 'write')
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')

  const { data: colaData, isLoading, refetch } = useDespachoColaOperativa({ etapa: 'picking', search })
  const items = useMemo(() => colaData?.items || [], [colaData])

  const prepStats = useMemo(() => items.reduce((acc, item) => {
    const prep = item.preparacion || {}
    acc.disponibleInventario += Number(prep.disponibleInventario || 0)
    acc.disponibleTaller += Number(prep.disponibleTaller || 0)
    acc.pendienteTaller += Number(prep.pendienteTaller || 0)
    return acc
  }, { disponibleInventario: 0, disponibleTaller: 0, pendienteTaller: 0 }), [items])

  const filtrados = useMemo(() => {
    return items.filter(item => {
      const prep = item.preparacion || {}
      const inv = Number(prep.disponibleInventario || 0)
      const talListo = Number(prep.disponibleTaller || 0)
      const talPend = Number(prep.pendienteTaller || 0)

      if (filtroTipo === 'mixto') return (inv > 0 && (talListo > 0 || talPend > 0))
      if (filtroTipo === 'inventario') return (inv > 0 && talListo === 0 && talPend === 0)
      if (filtroTipo === 'taller_listo') return (talListo > 0)
      if (filtroTipo === 'con_pendiente') return (talPend > 0)
      return true
    })
  }, [items, filtroTipo])

  const columns = [
    {
      key: 'venta',
      label: 'Venta',
      render: (_, row) => (
        <div>
          <button
            type="button"
            onClick={() => navigate(`/ventas/${row.ordenId}`)}
            style={{ fontWeight: 700, color: 'var(--blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            #{row.nInterno || row.ordenId}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{row.tipoVenta || 'Venta normal'}</div>
        </div>
      ),
    },
    {
      key: 'cliente',
      label: 'Cliente',
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{row.clienteNombre || 'Sin cliente'}</div>
          {row.clienteRut && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{row.clienteRut}</div>}
        </div>
      ),
    },
    {
      key: 'destino',
      label: 'Destino',
      render: (_, row) => (
        <div style={{ fontSize: 12 }}>
          <div>{row.comuna ? `${row.comuna}, ${row.region || ''}` : row.direccion || 'Retiro en bodega'}</div>
          {row.transporte && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Transporte: {row.transporte}</div>}
        </div>
      ),
    },
    {
      key: 'estadoLogistico',
      label: 'Estado Logístico',
      render: (_, row) => (
        <Badge tone={tone(row.estadoLogistico)}>
          {row.estadoLogistico?.label || 'En preparación'}
        </Badge>
      ),
    },
    {
      key: 'disponibilidad',
      label: 'Disponibilidad Picking',
      render: (_, row) => {
        const prep = row.preparacion || {}
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Number(prep.disponibleInventario || 0) > 0 && (
                <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--blue-50, #eff6ff)', color: 'var(--blue-700, #1d4ed8)', borderRadius: 4, fontWeight: 600 }}>
                  Stock: {prep.disponibleInventario} u.
                </span>
              )}
              {Number(prep.disponibleTaller || 0) > 0 && (
                <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--green-50, #f0fdf4)', color: 'var(--green-700, #15803d)', borderRadius: 4, fontWeight: 600 }}>
                  Taller Listo: {prep.disponibleTaller} u.
                </span>
              )}
            </div>
            {Number(prep.pendienteTaller || 0) > 0 && (
              <div style={{ fontSize: 11, color: 'var(--amber-700, #b45309)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>⏳ Pendiente Taller: {prep.pendienteTaller} u.</span>
                <a href={`/pasar-taller?ordenId=${row.ordenId}`} style={{ color: 'var(--blue)', textDecoration: 'underline' }}>ver</a>
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'packing',
      label: 'Packing / Bultos',
      render: (_, row) => (
        <PackingProgress row={{ packing: row.packing }} />
      ),
    },
    {
      key: '_acc',
      label: 'Acciones',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {canWriteDespacho && (
            <Btn
              variant="primary"
              size="sm"
              onClick={() => navigate(`/despachos/ordenes/${row.ordenId}/picking`)}
            >
              Confirmar Picking
            </Btn>
          )}
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/ventas/${row.ordenId}`)}
          >
            Ver Venta
          </Btn>
        </div>
      ),
    },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Panel Picking · Bodega"
        breadcrumb={['Inicio', 'Bodega', 'Panel Picking']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => refetch()}>Actualizar</Btn>
            <BotonExportar url="/api/despachos/export" params={{ etapa: 'picking', search }} nombreArchivo="panel_picking" />
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard title="Ventas en Picking" value={items.length} subtitle="Listas o en proceso" tone="blue" />
        <KpiCard title="Disponibles en Stock" value={prepStats.disponibleInventario} subtitle="Unidades inventariadas" tone="green" />
        <KpiCard title="Listas de Taller" value={prepStats.disponibleTaller} subtitle="Unidades de ODTs completadas" tone="teal" />
        <KpiCard title="Pendientes en Taller" value={prepStats.pendienteTaller} subtitle="Unidades en fabricación" tone={prepStats.pendienteTaller > 0 ? 'amber' : 'gray'} />
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 280, flex: 1 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar venta, cliente, RUT o comuna..." />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}
            >
              <option value="todos">Todos los orígenes ({items.length})</option>
              <option value="inventario">Solo Inventario / Stock</option>
              <option value="taller_listo">Con productos de Taller listos</option>
              <option value="mixto">Ventas Mixtas (Stock + Taller)</option>
              <option value="con_pendiente">Con unidades pendientes de Taller</option>
            </select>
          </div>
        </div>
      </div>

      <Table
        columns={columns}
        rows={filtrados}
        loading={isLoading}
        emptyMessage="No hay pedidos pendientes de picking con los filtros seleccionados."
      />
    </main>
  )
}
