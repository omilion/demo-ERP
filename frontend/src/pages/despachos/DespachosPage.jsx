import { toast, promptDialog } from '../../store/notif'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { useDespachoConsolidadoTaller, useDespachos, useGuias, useDeleteDespacho, useDeleteGuia, useDespachoColaOperativa } from '../../api/despachos'
import { useAuthStore } from '../../store/auth'
import { can, odtPath, ventaPath } from '../../utils/permissions'
import { openDtePdf } from '../../utils/dteDocuments'
import { trackingTone, showError, linkButton } from './shared'
import { Mono, PackingProgress } from './shared-ui'
import api from '../../api/client'

const TABS = [
  { id: 'salidas', label: 'Salidas Listas (Despacho)' },
  { id: 'aislados', label: 'Despachos Aislados' },
  { id: 'guias', label: 'Guías de Despacho (DTE 52)' },
  { id: 'registros', label: 'Histórico Despachos' },
  { id: 'taller', label: 'Consolidado Taller' },
  { id: 'admin', label: 'Panel Administrador General' },
]

const fmt = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-CL')
const dateFmt = value => value ? new Date(value).toLocaleDateString('es-CL') : '-'

export default function DespachosPage({ defaultTab }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ordenIdParam = searchParams.get('ordenId') || ''
  const odtIdParam = searchParams.get('odtId') || ''
  const { user } = useAuthStore()
  const canWriteDespacho = can(user, 'despacho', 'write')
  const canDeleteDespacho = can(user, 'despacho', 'delete')
  const canWriteFacturacion = can(user, 'facturacion', 'write')

  const tabParam = defaultTab || searchParams.get('tab')
  const [tab, setTab] = useState(TABS.some(t => t.id === tabParam) ? tabParam : 'salidas')
  const [page] = useState(1)
  const [search, setSearch] = useState('')

  const baseParams = { page: String(page) }
  if (search) baseParams.search = search
  if (odtIdParam) baseParams.odt = odtIdParam
  if (ordenIdParam) baseParams.ordenId = ordenIdParam

  // Salidas listas & Admin cola
  const colaSalidas = useDespachoColaOperativa({ etapa: 'despacho', search }, { enabled: tab === 'salidas' })
  const colaAdmin = useDespachoColaOperativa({ etapa: 'admin', search }, { enabled: tab === 'admin' })

  // Despachos aislados
  const despachosAisladosQuery = useDespachos({ ...baseParams, origenTipo: 'manual' }, { enabled: tab === 'aislados' })

  // Guias
  const guiasQuery = useGuias(baseParams, { enabled: tab === 'guias' || tab === 'admin' })

  // Registros historicos
  const registrosQuery = useDespachos(baseParams, { enabled: tab === 'registros' })

  // Consolidado taller
  const tallerQuery = useDespachoConsolidadoTaller({ search }, { enabled: tab === 'taller' })

  const delDespachoMut = useDeleteDespacho()
  const delGuiaMut = useDeleteGuia()

  const solicitarEliminacion = async (tipo, id) => {
    const motivo = await promptDialog({
      title: `Eliminar ${tipo === 'despacho' ? 'despacho' : 'guía'} #${id}`,
      message: 'Ingresa el motivo obligatorio para mantener la trazabilidad de auditoría:',
      confirmLabel: 'Eliminar registro',
      placeholder: 'Ej.: Error en datos de dirección, reprogramación autorizada...',
    })
    if (!motivo) return
    try {
      if (tipo === 'despacho') {
        await delDespachoMut.mutateAsync({ id, motivo })
        toast.success('Despacho eliminado.')
      } else {
        await delGuiaMut.mutateAsync({ id, motivo })
        toast.success('Guía eliminada.')
      }
    } catch (err) {
      showError(err)
    }
  }

  const emitirGuiaSii = async (guiaId) => {
    try {
      const res = await api.post(`/despachos/guias/${guiaId}/emitir-sii`)
      toast.success(`Guía emitida al SII exitosamente con Folio ${res.data.folio}`)
      guiasQuery.refetch()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al emitir la guía al SII')
    }
  }

  const renderOdtLink = v => (
    v ? <button onClick={e => { e.stopPropagation(); navigate(odtPath(v, user)) }} style={linkButton('var(--amber-700)')}>OT #{v}</button> : '-'
  )

  // Columnas Salidas Listas
  const colsSalidas = [
    {
      key: 'ordenId',
      label: 'Venta',
      render: (_, r) => (
        <div>
          <button onClick={() => navigate(ventaPath(r.ordenId, user))} style={{ fontWeight: 700, color: 'var(--blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            #{r.nInterno || r.ordenId}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.tipoVenta || 'Venta normal'}</div>
        </div>
      ),
    },
    {
      key: 'cliente',
      label: 'Cliente / Contacto',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.clienteNombre || 'Sin cliente'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.contacto || r.clienteRut || '-'}</div>
        </div>
      ),
    },
    {
      key: 'destino',
      label: 'Destino',
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          <div>{r.comuna ? `${r.comuna}, ${r.region || ''}` : r.direccion || 'Retiro'}</div>
          {r.transporte && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Transporte: {r.transporte}</div>}
        </div>
      ),
    },
    {
      key: 'estadoLogistico',
      label: 'Estado Logístico',
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Badge tone={r.estadoLogistico?.tone || 'blue'}>{r.estadoLogistico?.label || 'Listo'}</Badge>
          {r.tieneMulta && <Badge tone="red">⚠️ Multa Licitación</Badge>}
        </div>
      ),
    },
    {
      key: 'packing',
      label: 'Packing',
      render: (_, r) => <PackingProgress row={{ packing: r.packing }} />,
    },
    {
      key: '_acc',
      label: 'Acciones',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {canWriteDespacho && (
            <Btn variant="primary" size="sm" onClick={() => navigate(`/despachos/nuevo?ordenId=${r.ordenId}&nInterno=${r.nInterno || ''}`)}>
              Programar Salida
            </Btn>
          )}
          {canWriteDespacho && (
            <Btn variant="secondary" size="sm" onClick={() => navigate(`/despachos/guias/nueva?ordenId=${r.ordenId}`)}>
              Preparar Guía
            </Btn>
          )}
        </div>
      ),
    },
  ]

  // Columnas Despachos Aislados
  const colsAislados = [
    { key: 'id', label: 'N° Despacho', render: v => <Mono strong>#{v}</Mono> },
    { key: 'createdAt', label: 'Fecha Creación', render: dateFmt },
    { key: 'motivoOperacion', label: 'Motivo Operación *', render: v => <strong style={{ color: 'var(--text-1)' }}>{v || 'Sin motivo'}</strong> },
    { key: 'receptorRazonSocial', label: 'Destinatario', render: (v, r) => v ? <div><div>{v}</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.receptorRut}</div></div> : r.contacto || '-' },
    { key: 'direccion', label: 'Dirección / Ciudad', render: (v, r) => <div><div>{v || '-'}</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{[r.comuna, r.ciudad, r.region].filter(Boolean).join(', ')}</div></div> },
    { key: 'transporte', label: 'Transporte', render: v => v || '-' },
    {
      key: 'items',
      label: 'Ítems',
      render: v => Array.isArray(v) && v.length ? (
        <div style={{ fontSize: 11 }}>{v.map((it, idx) => <div key={idx}>• {it.nombre} ×{it.cantidad} {it.unidad || ''}</div>)}</div>
      ) : <span style={{ color: 'var(--text-3)' }}>Sin detalle</span>,
    },
    { key: 'usuario', label: 'Responsable', render: v => v || '-' },
    {
      key: '_acc',
      label: 'Acciones',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {canWriteDespacho && (
            <Btn variant="primary" size="sm" onClick={() => navigate(`/despachos/guias/nueva?despachoId=${r.id}`)}>
              Preparar Guía DTE 52
            </Btn>
          )}
          <button onClick={() => navigate(`/despachos/${r.id}/tracking`)} style={linkButton('var(--blue)')}>Track</button>
          {canWriteDespacho && <button onClick={() => navigate(`/despachos/${r.id}/editar`)} style={linkButton('var(--green-700)')}>Editar</button>}
          {canDeleteDespacho && <button onClick={() => solicitarEliminacion('despacho', r.id)} style={linkButton('var(--red)')}>Borrar</button>}
        </div>
      ),
    },
  ]

  // Columnas Guias DTE 52
  const colsGuias = [
    { key: 'nGuia', label: 'N° Guía / Folio', render: (v, r) => <Mono strong>{r.documentoDte?.folio ? `Folio ${r.documentoDte.folio}` : (v || `#${r.id}`)}</Mono> },
    { key: 'fechaGuia', label: 'Fecha', render: dateFmt },
    {
      key: 'origenTipo',
      label: 'Origen',
      render: (v, r) => r.ordenId ? (
        <button onClick={() => navigate(ventaPath(r.ordenId, user))} style={linkButton('var(--blue)')}>
          Venta #{r.nInterno || r.ordenId}
        </button>
      ) : (
        <Badge tone="amber">Despacho Aislado #{r.despachoId || '-'}</Badge>
      ),
    },
    {
      key: 'destinatario',
      label: 'Destinatario',
      render: (_, r) => r.despacho?.receptorRazonSocial || r.despacho?.direccion || r.origen || '-',
    },
    {
      key: 'documentoDte',
      label: 'Estado SII (DTE 52)',
      render: v => v ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Badge tone={v.estado === 'borrador' ? 'amber' : 'green'}>
            {v.estado === 'borrador' ? 'Borrador (Sin emitir)' : `Emitido (Folio ${v.folio})`}
          </Badge>
        </div>
      ) : <Badge tone="gray">Sin DTE</Badge>,
    },
    {
      key: '_acc',
      label: 'Acciones',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {r.documentoDte?.estado === 'borrador' && canWriteFacturacion && (
            <Btn variant="primary" size="sm" onClick={() => emitirGuiaSii(r.id)}>
              Emitir al SII
            </Btn>
          )}
          {r.documentoDte?.folio && (
            <button onClick={() => openDtePdf(r.documentoDte)} style={linkButton('var(--blue)')}>Ver PDF</button>
          )}
          {canWriteDespacho && (
            <button onClick={() => navigate(`/despachos/guias/${r.id}/editar`)} style={linkButton('var(--green-700)')}>Editar</button>
          )}
          {canDeleteDespacho && (
            <button onClick={() => solicitarEliminacion('guia', r.id)} style={linkButton('var(--red)')}>Borrar</button>
          )}
        </div>
      ),
    },
  ]

  // Columnas Registros Historicos
  const colsRegistros = [
    { key: 'fechaEntrega', label: 'Fecha entrega', render: dateFmt },
    { key: 'interno', label: 'N interno', render: v => <Mono strong>{v || '-'}</Mono> },
    { key: 'ordenId', label: 'Orden', render: v => v ? <button onClick={() => navigate(ventaPath(v, user))} style={linkButton('var(--blue)')}>#{v}</button> : '-' },
    { key: 'origenTipo', label: 'Origen', render: v => v === 'manual' ? <Badge tone="amber">Aislado</Badge> : <Badge tone="blue">Venta</Badge> },
    { key: 'motivoOperacion', label: 'Motivo', render: v => v || '-' },
    { key: 'odtId', label: 'OT', render: renderOdtLink },
    { key: 'tipoDespacho', label: 'Tipo', render: v => v ? <Badge tone="blue">{v}</Badge> : '-' },
    { key: 'transporte', label: 'Transporte' },
    { key: 'contacto', label: 'Contacto' },
    { key: 'direccion', label: 'Dirección', wrap: true, render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    { key: 'montoEnvio', label: 'Envío', align: 'right', render: v => <Mono>{fmt(v)}</Mono> },
    {
      key: 'parcial',
      label: 'Estado',
      render: (v, r) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {v && <Badge tone="amber">Parcial</Badge>}
          {r.tieneMulta && <Badge tone="red">Multa</Badge>}
          {r.tracking?.estado && <Badge tone={trackingTone(r.tracking.estado)}>{r.tracking.estado}</Badge>}
        </div>
      ),
    },
    {
      key: '_acc',
      label: 'Acciones',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(`/despachos/${r.id}/tracking`)} style={linkButton('var(--blue)')}>Track</button>
          {canWriteDespacho && <button onClick={() => navigate(`/despachos/${r.id}/editar`)} style={linkButton('var(--green-700)')}>Editar</button>}
          {canDeleteDespacho && <button onClick={() => solicitarEliminacion('despacho', r.id)} style={linkButton('var(--red)')}>Borrar</button>}
        </div>
      ),
    },
  ]

  // Columnas Consolidado Taller
  const colsTaller = [
    { key: 'taller', label: 'Taller', render: v => <span style={{ fontWeight: 700 }}>{v}</span> },
    { key: 'itemsListos', label: 'Ítems listos', align: 'right', render: v => <Badge tone={v ? 'green' : 'gray'}>{v}</Badge> },
    { key: 'cantidad', label: 'Unidades', align: 'right', render: v => <Mono strong>{Number(v || 0).toLocaleString('es-CL')}</Mono> },
    { key: 'items', label: 'Carga disponible', wrap: true, render: items => <div style={{ fontSize: 12 }}>{(items || []).map((it, i) => <div key={i}>OT #{it.odtId} · {it.nombre} ×{it.cantidad}</div>)}</div> },
  ]

  // Columnas Panel Administrador General
  const colsAdmin = [
    {
      key: 'ordenId',
      label: 'Venta / Interno',
      render: (_, r) => (
        <div>
          <button onClick={() => navigate(ventaPath(r.ordenId, user))} style={{ fontWeight: 700, color: 'var(--blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            #{r.nInterno || r.ordenId}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.clienteNombre}</div>
        </div>
      ),
    },
    {
      key: 'estadoLogistico',
      label: 'Estado Embudo',
      render: (_, r) => <Badge tone={r.estadoLogistico?.tone || 'blue'}>{r.estadoLogistico?.label || '-'}</Badge>,
    },
    {
      key: 'taller',
      label: 'Taller (Pendiente/Listo)',
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          {Number(r.preparacion?.pendienteTaller || 0) > 0 ? (
            <span style={{ color: 'var(--amber-700)', fontWeight: 600 }}>⏳ {r.preparacion.pendienteTaller} u. pendientes</span>
          ) : (
            <span style={{ color: 'var(--green-700)' }}>✓ 0 pendientes</span>
          )}
        </div>
      ),
    },
    {
      key: 'picking',
      label: 'Picking / Stock',
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          <span>{r.preparacion?.disponiblePicking || 0} u. disp.</span>
        </div>
      ),
    },
    {
      key: 'packing',
      label: 'Packing',
      render: (_, r) => <PackingProgress row={{ packing: r.packing }} />,
    },
    {
      key: 'guias',
      label: 'Guía SII',
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          {r.guias?.length ? (
            <Badge tone={r.guias[0].dteEstado === 'borrador' ? 'amber' : 'green'}>
              {r.guias[0].dteEstado === 'borrador' ? 'Borrador' : `Folio ${r.guias[0].dteFolio || r.guias[0].nGuia}`}
            </Badge>
          ) : <span style={{ color: 'var(--text-3)' }}>Sin guía</span>}
        </div>
      ),
    },
    {
      key: 'riesgo',
      label: 'Alertas / Multa',
      render: (_, r) => (
        <div>
          {r.tieneMulta && <Badge tone="red">⚠️ Multa Licitación</Badge>}
          {r.plazoEntrega && new Date(r.plazoEntrega) < new Date() && <Badge tone="amber">Plazo Vencido</Badge>}
        </div>
      ),
    },
    {
      key: '_acc',
      label: 'Acciones',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="ghost" size="sm" onClick={() => navigate(ventaPath(r.ordenId, user))}>Ver Venta</Btn>
          {canWriteDespacho && (
            <Btn variant="primary" size="sm" onClick={() => navigate(`/despachos/ordenes/${r.ordenId}/packing`)}>
              Packing
            </Btn>
          )}
        </div>
      ),
    },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Despachos y Salidas · Bodega"
        breadcrumb={['Inicio', 'Logística', 'Despachos']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {canWriteDespacho && (
              <Btn variant="primary" onClick={() => navigate('/despachos/nuevo')}>
                + Programar Salida
              </Btn>
            )}
            {canWriteDespacho && (
              <Btn variant="secondary" onClick={() => navigate('/despachos/guias/nueva')}>
                + Preparar Guía DTE 52
              </Btn>
            )}
          </div>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* KPI Cards por Tab */}
      {tab === 'salidas' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, margin: '20px 0' }}>
          <KpiCard title="Salidas Listas" value={colaSalidas.data?.items?.length || 0} subtitle="Packing 100% o parcial listo" tone="green" />
          <KpiCard title="Total Unidades Listas" value={(colaSalidas.data?.items || []).reduce((sum, r) => sum + Number(r.packing?.preparados || 0), 0)} subtitle="Listas para entrega física" tone="blue" />
        </div>
      )}

      {tab === 'admin' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '20px 0' }}>
          <KpiCard title="En Fabricación Taller" value={(colaAdmin.data?.items || []).reduce((sum, r) => sum + Number(r.preparacion?.pendienteTaller || 0), 0)} subtitle="Unidades en curso" tone="amber" />
          <KpiCard title="Listas para Picking" value={(colaAdmin.data?.items || []).reduce((sum, r) => sum + Number(r.preparacion?.disponiblePicking || 0), 0)} subtitle="Stock disponible" tone="blue" />
          <KpiCard title="En Preparación Packing" value={colaAdmin.data?.stats?.enPacking || 0} subtitle="Pedidos en preparación" tone="teal" />
          <KpiCard title="Total Salidas Hoy" value={registrosQuery.data?.total || 0} subtitle="Despachos registrados" tone="green" />
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 16, margin: '20px 0' }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por venta, interno, destinatario, RUT o transporte..." />
      </div>

      {tab === 'salidas' && (
        <Table
          columns={colsSalidas}
          rows={colaSalidas.data?.items || []}
          loading={colaSalidas.isLoading}
          emptyMessage="No hay pedidos listos para salida en este momento."
        />
      )}

      {tab === 'aislados' && (
        <Table
          columns={colsAislados}
          rows={despachosAisladosQuery.data?.items || []}
          loading={despachosAisladosQuery.isLoading}
          emptyMessage="No hay despachos aislados registrados."
        />
      )}

      {tab === 'guias' && (
        <Table
          columns={colsGuias}
          rows={guiasQuery.data?.items || []}
          loading={guiasQuery.isLoading}
          emptyMessage="No hay guías de despacho registradas."
        />
      )}

      {tab === 'registros' && (
        <Table
          columns={colsRegistros}
          rows={registrosQuery.data?.items || []}
          loading={registrosQuery.isLoading}
          emptyMessage="No hay registros históricos de despacho."
        />
      )}

      {tab === 'taller' && (
        <Table
          columns={colsTaller}
          rows={tallerQuery.data?.items || []}
          loading={tallerQuery.isLoading}
          emptyMessage="No hay carga consolidada de taller."
        />
      )}

      {tab === 'admin' && (
        <Table
          columns={colsAdmin}
          rows={colaAdmin.data?.items || []}
          loading={colaAdmin.isLoading}
          emptyMessage="No hay ventas activas en el embudo logístico."
        />
      )}
    </main>
  )
}
