import { useState } from 'react'
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

export default function PanelPackingPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWriteDespacho = can(user, 'despacho', 'write')
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  const { data: colaData, isLoading, refetch } = useDespachoColaOperativa({ etapa: 'packing', search })
  const items = colaData?.items || []

  const filtrados = items.filter(item => {
    if (filtroEstado === 'iniciado') return (item.packing?.preparados > 0 && !item.packing?.completo)
    if (filtroEstado === 'completo') return item.packing?.completo
    if (filtroEstado === 'pendiente') return Number(item.packing?.preparados || 0) === 0
    return true
  })

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
      label: 'Cliente / Contacto',
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{row.clienteNombre || 'Sin cliente'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{row.contacto || row.clienteRut || '-'}</div>
        </div>
      ),
    },
    {
      key: 'destino',
      label: 'Destino / Transporte',
      render: (_, row) => (
        <div style={{ fontSize: 12 }}>
          <div>{row.comuna ? `${row.comuna}, ${row.region || ''}` : row.direccion || 'Retiro'}</div>
          {row.transporte && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{row.transporte}</div>}
        </div>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (_, row) => (
        <Badge tone={tone(row.estadoLogistico)}>
          {row.estadoLogistico?.label || 'En packing'}
        </Badge>
      ),
    },
    {
      key: 'progreso',
      label: 'Progreso Packing',
      render: (_, row) => (
        <PackingProgress row={{ packing: row.packing }} />
      ),
    },
    {
      key: 'bultos',
      label: 'Bultos Registrados',
      render: (_, row) => (
        <div style={{ fontSize: 12 }}>
          {row.bultosCount ? (
            <Badge tone="blue">{row.bultosCount} bultos</Badge>
          ) : (
            <span style={{ color: 'var(--text-3)' }}>Sin bultos aún</span>
          )}
        </div>
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
              onClick={() => navigate(`/despachos/ordenes/${row.ordenId}/packing`)}
            >
              Abrir Packing & Escáner
            </Btn>
          )}
          {row.packing?.completo && canWriteDespacho && (
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/despachos/nuevo?ordenId=${row.ordenId}&nInterno=${row.nInterno || ''}`)}
            >
              Programar Salida
            </Btn>
          )}
        </div>
      ),
    },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Panel Packing & Bultos · Bodega"
        breadcrumb={['Inicio', 'Bodega', 'Panel Packing']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => refetch()}>Actualizar</Btn>
            <BotonExportar url="/api/despachos/export" params={{ etapa: 'packing', search }} nombreArchivo="panel_packing" />
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard title="Pedidos en Packing" value={items.length} subtitle="En preparación física" tone="blue" />
        <KpiCard title="Packing Completo" value={items.filter(i => i.packing?.completo).length} subtitle="Listos para despacho" tone="green" />
        <KpiCard title="Packing Parcial" value={items.filter(i => i.packing?.preparados > 0 && !i.packing?.completo).length} subtitle="En proceso de empaque" tone="amber" />
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 280, flex: 1 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por venta, interno, cliente o transporte..." />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}
            >
              <option value="todos">Todos los estados de packing</option>
              <option value="pendiente">Sin iniciar</option>
              <option value="iniciado">Empaque en curso</option>
              <option value="completo">Empaque 100% completo</option>
            </select>
          </div>
        </div>
      </div>

      <Table
        columns={columns}
        rows={filtrados}
        loading={isLoading}
        emptyMessage="No hay pedidos en cola de packing."
      />
    </main>
  )
}
