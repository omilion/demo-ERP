import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table } from '../../components/shared'
import { useDespachoColaOperativa } from '../../api/despachos'
import { PackingProgress } from '../despachos/shared-ui'
import { useAuthStore } from '../../store/auth'
import { can, ventaPath } from '../../utils/permissions'
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

  const abrirPacking = row => navigate(`/despachos/ordenes/${encodeURIComponent(String(row.ordenId))}/packing`)
  const abrirPedido = row => navigate(ventaPath(row.ordenId))

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
            onClick={() => abrirPedido(row)}
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
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => abrirPedido(row)}
          >
            Ver pedido
          </Btn>
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
        <KpiCard label="Pedidos en Packing" value={items.length} sublabel="En preparación física" tone="blue" />
        <KpiCard label="Packing Completo" value={items.filter(i => i.packing?.completo).length} sublabel="Listos para despacho" tone="green" />
        <KpiCard label="Packing Parcial" value={items.filter(i => i.packing?.preparados > 0 && !i.packing?.completo).length} sublabel="En proceso de empaque" tone="amber" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <Table
          columns={columns}
          rows={filtrados}
          onRowClick={abrirPacking}
          loading={isLoading}
          emptyMessage="No hay pedidos en cola de packing."
          ariaLabel="Pedidos en cola de packing; haz clic en una fila para abrir su detalle"
          toolbarExtra={<>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por venta, interno, cliente o transporte..." style={{ height: 28, width: 280 }} />
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: '#fff' }}
            >
              <option value="todos">Todos los estados de packing</option>
              <option value="pendiente">Sin iniciar</option>
              <option value="iniciado">Empaque en curso</option>
              <option value="completo">Empaque 100% completo</option>
            </select>
          </>}
        />
      </div>
    </main>
  )
}
