import { toast } from '../../store/notif'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormPanel, ViewPanel, FormDivider, DetailRow, useForm } from './index'
import { Badge } from '../shared'
import { useCliente, useCreateCliente, useUpdateCliente, useCreateClienteSucursal } from '../../api/clientes'
import { useAuthStore } from '../../store/auth'
import { odtPath, ventaPath } from '../../utils/permissions'
import { ClienteCampos, CLIENTE_RULES, clienteToForm, clienteFormToPayload } from './clienteFields'
import { SucursalesCliente, sucursalToPayload } from './SucursalesCliente'

// ── FormCliente ────────────────────────────────────────────────────────────────
// Panel lateral usado desde Nueva Venta. Comparte la ficha con la pagina del
// modulo Clientes; lo unico propio es el contenedor y que al guardar devuelve
// el cliente a la venta en curso en vez de navegar a otra pantalla.
export function FormCliente({ initial, onClose, onSaved }) {
  const isEdit = !!initial
  const { data, set, errors, validate } = useForm(clienteToForm(initial))
  // Sucursales agregadas antes de que el cliente exista: se crean despues de él,
  // para que la venta pueda elegir direccion de entrega de inmediato.
  const [sucursalesNuevas, setSucursalesNuevas] = useState([])

  const createMutation = useCreateCliente()
  const updateMutation = useUpdateCliente()
  const createSucursal = useCreateClienteSucursal()
  const saving = createMutation.isPending || updateMutation.isPending || createSucursal.isPending

  const handleSave = () => {
    if (!validate(CLIENTE_RULES)) return
    const payload = clienteFormToPayload(data)
    const onError = (err) => toast.error(err?.response?.data?.error || (isEdit ? 'Error al guardar' : 'Error al crear'))

    if (isEdit) {
      updateMutation.mutate({ id: initial.id, data: payload }, {
        onSuccess: (saved) => { onSaved && onSaved(saved); onClose() },
        onError,
      })
      return
    }

    createMutation.mutate(payload, {
      onSuccess: async (creado) => {
        const fallidas = []
        for (const sucursal of sucursalesNuevas) {
          try {
            await createSucursal.mutateAsync({ clienteId: creado.id, data: sucursalToPayload(sucursal) })
          } catch {
            fallidas.push(sucursal.nombre)
          }
        }
        if (fallidas.length) toast.error(`Cliente creado, pero no se pudieron agregar: ${fallidas.join(', ')}`)
        onSaved && onSaved(creado)
        onClose()
      },
      onError,
    })
  }

  return (
    <FormPanel
      title={isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}
      subtitle={isEdit ? initial.nombre : 'Registrar nuevo cliente en el sistema'}
      onClose={onClose} onSave={handleSave} saving={saving}
    >
      <ClienteCampos data={data} set={set} errors={errors} />
      {isEdit
        ? <SucursalesCliente cliente={initial} />
        : <SucursalesCliente cliente={null} borradores={sucursalesNuevas} onBorradoresChange={setSucursalesNuevas} />}
    </FormPanel>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = n => '$' + (n || 0).toLocaleString('es-CL')
const fmtM = n => (Math.abs(n || 0) / 1_000_000).toFixed(1) + 'M'

const TIPO_TONE = { Institucional: 'blue', Municipal: 'neutral', Gobierno: 'neutral', Distribuidor: 'amber', Empresa: 'gray' }
const PAGO_TONE = { Pagada: 'green', Parcial: 'amber', 'No pagada': 'red' }
const ENTREGA_TONE = { Entregada: 'green', 'En despacho': 'blue', Parcial: 'amber', 'Pendiente entrega': 'red' }
const ODT_TONE = { Prioritaria: 'red', 'En proceso': 'blue', Pendiente: 'amber', Terminada: 'green' }

function TabBtn({ active, onClick, children, badge }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', fontSize: 13, fontWeight: active ? 700 : 400,
      color: active ? 'var(--green-700)' : 'var(--text-2)',
      borderBottom: active ? '2px solid var(--green-600)' : '2px solid transparent',
      background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {children}
      {badge != null && badge > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'var(--green-600)' : 'var(--border)', color: active ? '#fff' : 'var(--text-3)', borderRadius: 99, padding: '1px 6px' }}>
          {badge}
        </span>
      )}
    </button>
  )
}

// ── Tab: Datos ─────────────────────────────────────────────────────────────────
function TabDatos({ c }) {
  return (
    <>
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--green-700)' }}>{(c.nombre || '?')[0]}</span>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{c.nombre}</div>
          {c.razonSocial && c.razonSocial !== c.nombre && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.razonSocial}</div>}
          <Badge tone={TIPO_TONE[c.tipo] || 'gray'} style={{ marginTop: 4 }}>{c.tipo}</Badge>
        </div>
      </div>

      <FormDivider label="Identificación" />
      <DetailRow label="RUT" value={c.rut} mono />
      {c.razonSocial && <DetailRow label="Razon Social" value={c.razonSocial} />}
      {c.giro && <DetailRow label="Giro" value={c.giro} />}

      <FormDivider label="Direccion" />
      {c.direccion && <DetailRow label="Direccion" value={c.direccion} />}
      {c.region && <DetailRow label="Region" value={c.region} />}
      {c.comuna && <DetailRow label="Comuna" value={c.comuna} />}
      <DetailRow label="País" value={c.pais || 'Chile'} />

      <FormDivider label="Contacto" />
      {c.email
        ? <DetailRow label="Email" value={c.email} />
        : <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '4px 0 8px' }}>Sin email registrado</div>
      }
      {c.telefono && <DetailRow label="Teléfono" value={c.telefono} mono />}

      <FormDivider label="Crédito y deuda" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 4 }}>Límite Crédito</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 15 }}>{c.limiteCredito > 0 ? fmt(c.limiteCredito) : 'Sin límite'}</div>
        </div>
        <div style={{ background: c.saldo > 0 ? '#fef2f2' : 'var(--bg)', borderRadius: 8, padding: '12px 14px', border: `1px solid ${c.saldo > 0 ? 'var(--red)' : 'var(--border)'}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: c.saldo > 0 ? 'var(--red)' : 'var(--text-3)', marginBottom: 4 }}>Saldo Deuda</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 15, color: c.saldo > 0 ? 'var(--red)' : 'var(--green-600)' }}>
            {c.saldo > 0 ? fmt(c.saldo) : 'Sin deuda'}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Tab: Ventas ────────────────────────────────────────────────────────────────
function TabVentas({ ventas, resumen, onVentaClick }) {
  if (!ventas?.length) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Sin ventas registradas</div>
  }

  const cantidad = resumen?.total ?? ventas.length
  const totalVentas = resumen?.montoTotal ?? ventas.reduce((s, v) => s + (v.total || 0), 0)
  const noPagadas = resumen?.noPagadas ?? ventas.filter(v => v.estadoPago === 'No pagada').length

  return (
    <>
      {cantidad > ventas.length && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, textAlign: 'center' }}>
          Mostrando las {ventas.length} ventas más recientes de {cantidad}.
        </div>
      )}
      {/* KPIs mini */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Total ventas', value: cantidad, tone: null },
          { label: 'Monto total', value: '$' + fmtM(totalVentas), tone: null },
          { label: 'No pagadas', value: noPagadas, tone: noPagadas > 0 ? 'red' : 'neutral' },
        ].map(({ label, value, tone }, i) => (
          <div key={i} style={{ background: tone === 'red' ? '#fef2f2' : 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: `1px solid ${tone === 'red' ? 'var(--red)' : 'var(--border)'}`, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: tone === 'red' ? 'var(--red)' : 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>{label}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 14, color: tone === 'red' ? 'var(--red)' : 'var(--text-1)' }}>{value}</div>
          </div>
        ))}
      </div>

      {ventas.map(v => (
        <div key={v.id} onClick={() => onVentaClick(v.id)} style={{
          border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', marginBottom: 8,
          cursor: 'pointer', transition: 'border-color 0.12s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--green-600)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 700, color: 'var(--green-700)' }}>#{v.id}</span>
              <Badge tone={v.tipo === 'Licitación' ? 'blue' : v.tipo === 'Convenio Marco' ? 'neutral' : 'gray'} style={{ fontSize: 10 }}>{v.tipo}</Badge>
            </div>
            <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{fmt(v.total)}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge tone={PAGO_TONE[v.estadoPago] ?? 'gray'} style={{ fontSize: 10 }}>{v.estadoPago}</Badge>
            <Badge tone={ENTREGA_TONE[v.estadoEntrega] ?? 'gray'} style={{ fontSize: 10 }}>{v.estadoEntrega}</Badge>
            {v.licitacion && <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace", alignSelf: 'center' }}>OC: {v.licitacion}</span>}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{v.creadorNombre || '—'}</span>
            <span style={{ fontFamily: "'DM Mono',monospace" }}>{new Date(v.createdAt).toLocaleDateString('es-CL')}</span>
          </div>
        </div>
      ))}
    </>
  )
}

// ── Tab: Taller ────────────────────────────────────────────────────────────────
function TabTaller({ odts, total, onOdtClick }) {
  if (!odts?.length) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Sin órdenes de trabajo asociadas</div>
  }
  return (
    <div>
      {total > odts.length && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, textAlign: 'center' }}>
          Mostrando las {odts.length} órdenes más recientes de {total}.
        </div>
      )}
      {odts.map(odt => (
        <div key={odt.id} onClick={() => onOdtClick && onOdtClick(odt)} style={{
          border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', marginBottom: 8,
          cursor: 'pointer', transition: 'border-color 0.12s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--green-600)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 700, color: 'var(--green-700)' }}>OT #{odt.id}</span>
              {odt.tipo && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{odt.tipo}</span>}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {odt.prioridad && odt.prioridad !== 'normal' && (
                <Badge tone={odt.prioridad === 'urgente' ? 'red' : 'amber'} style={{ fontSize: 10 }}>{odt.prioridad}</Badge>
              )}
              <Badge tone={ODT_TONE[odt.estado] ?? 'gray'} style={{ fontSize: 10 }}>{odt.estado}</Badge>
            </div>
          </div>
          {odt.descripcion && (
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4, marginBottom: 5 }}>
              {odt.descripcion.length > 100 ? odt.descripcion.slice(0, 100) + '…' : odt.descripcion}
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-3)' }}>
            <span>{new Date(odt.createdAt).toLocaleDateString('es-CL')}</span>
            {odt.ordenId && <span>← Venta #{odt.ordenId}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── ViewClientePanel ───────────────────────────────────────────────────────────
export function ViewClientePanel({ cliente, onClose, onEdit, canWrite = true }) {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [tab, setTab] = useState('datos')
  const { data: full, isLoading } = useCliente(cliente.id, cliente.activo === false ? { includeInactivos: 'true' } : {})

  const c = full || cliente
  const ventas = full?.ventas ?? []
  const odts = full?.odts ?? []
  // Los KPIs salen del resumen que calcula el servidor sobre la tabla completa,
  // no de estas listas, que vienen acotadas para no cargar miles de filas.
  const ventasResumen = full?.ventasResumen ?? null
  const odtsTotal = full?.odtsTotal ?? odts.length

  return (
    <ViewPanel
      title={c.nombre}
      subtitle={`RUT: ${c.rut} · ${c.tipo || 'Cliente'}`}
      onClose={onClose}
      onEdit={canWrite ? onEdit : undefined}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16, marginTop: -6 }}>
        <TabBtn active={tab === 'datos'}  onClick={() => setTab('datos')}>Datos</TabBtn>
        <TabBtn active={tab === 'ventas'} onClick={() => setTab('ventas')} badge={ventas.length}>Ventas</TabBtn>
        <TabBtn active={tab === 'taller'} onClick={() => setTab('taller')} badge={odts.length}>Taller</TabBtn>
      </div>

      {isLoading && !full && (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando historial…</div>
      )}

      {tab === 'datos' && <TabDatos c={c} />}

      {tab === 'ventas' && (
        <TabVentas
          ventas={ventas}
          resumen={ventasResumen}
          onVentaClick={id => { navigate(ventaPath(id, user)); onClose() }}
        />
      )}

      {tab === 'taller' && (
        <TabTaller
          odts={odts}
          total={odtsTotal}
          onOdtClick={odt => { navigate(odtPath(odt.id, user)); onClose() }}
        />
      )}
    </ViewPanel>
  )
}
