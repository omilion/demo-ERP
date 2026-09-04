import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Badge, KpiCard, SectionCard, ActionRow, PageHeader, Btn } from '../../components/shared'
import { useDashboardStats } from '../../api/dashboard'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { useCrmPendientesHoy } from '../../api/crm'
import { useRrhhOperativo } from '../../api/rrhh'
import { NotificacionesBell } from '../../components/NotificacionesBell'

const TALLER_ICONS = { Espumas: 'layers', Confecciones: 'scissors', Madera: 'box', Externo: 'truck' }

function TallerBar({ tipo, activas, urgentes = 0, max }) {
  const [hov, setHov] = useState(false)
  const navigate = useNavigate()
  const pct = max > 0 ? Math.round((activas / max) * 100) : 0
  const color = pct > 70 ? 'var(--red)' : pct > 40 ? 'var(--amber)' : 'var(--green-600)'
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => navigate(`/taller?tipo=${tipo}`)}
      style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', background: hov ? 'var(--green-50)' : 'transparent', transition: 'all 0.14s', marginBottom: 2 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: 'var(--green-600)' }}><Icon name={TALLER_ICONS[tipo] || 'tool'} size={13} /></span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{tipo}</span>
          {urgentes > 0 && (
            <span
              onClick={e => { e.stopPropagation(); navigate(`/taller?tipo=${tipo}&prioridad=urgente`) }}
              style={{ marginLeft: 4 }}
            >
              <Badge tone="red">{urgentes} urgente{urgentes !== 1 ? 's' : ''}</Badge>
            </span>
          )}
        </div>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color }}>{activas.toLocaleString('es-CL')}</span>
      </div>
      <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
        <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function StockRow({ label, icon, critico, sinStock, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 8, cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--green-50)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ color: 'var(--green-600)', flexShrink: 0 }}><Icon name={icon} size={14} /></span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 5 }}>
        {critico > 0 && <Badge tone="amber">{critico.toLocaleString('es-CL')} crítico{critico !== 1 ? 's' : ''}</Badge>}
        {sinStock > 0 && <Badge tone="red">{sinStock.toLocaleString('es-CL')} sin stock</Badge>}
        {critico === 0 && sinStock === 0 && <Badge tone="neutral">OK</Badge>}
      </div>
    </div>
  )
}

// Reloj en vivo del panel de ventas. Se actualiza cada 30s (suficiente para
// no atrasar el minuto mostrado sin re-renderizar de mas).
function LiveDateTime() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  const fecha = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1)
  const hora = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ textAlign: 'right', lineHeight: 1.35 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>{fechaCap}</div>
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700,
        color: 'var(--text-1)', letterSpacing: 0.3, fontVariantNumeric: 'tabular-nums',
      }}>{hora}</div>
    </div>
  )
}

// Agrupa campanita + fecha/hora en un solo bloque elevado, en vez de dos
// elementos sueltos flotando en el header — lee como una sola pieza de UI.
function HeaderUtilityCluster() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
      padding: '6px 16px 6px 6px',
      boxShadow: '0 1px 2px oklch(0 0 0 / 0.05), 0 1px 8px oklch(0 0 0 / 0.04)',
    }}>
      <NotificacionesBell dark={false} />
      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
      <LiveDateTime />
    </div>
  )
}

// Las agendas de los distintos roles son la misma pieza: un titulo, un par de
// contadores, una lista corta donde cada fila abre su ficha, y un pie que lleva
// al listado completo. Se comparte la estructura para que un cambio de forma no
// haya que repetirlo en cada rol.
function AgendaCard({ titulo, badges = [], filas, vacio, cargando, pie, onPie }) {
  return (
    <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 22, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{titulo}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {badges.map(b => <Badge key={b.texto} tone={b.tone}>{b.texto}</Badge>)}
        </div>
      </div>

      {cargando && <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--text-3)' }}>Cargando…</div>}
      {!cargando && filas.length === 0 && (
        <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--text-3)' }}>{vacio}</div>
      )}

      {filas.map(fila => (
        <button
          key={fila.key}
          type="button"
          onClick={fila.onClick}
          style={{
            width: '100%', display: 'grid', gridTemplateColumns: '4px minmax(0, 1fr) auto',
            alignItems: 'center', gap: 12, padding: '10px 16px', border: 0,
            borderBottom: '1px solid var(--border)', background: 'transparent',
            cursor: 'pointer', textAlign: 'left', font: 'inherit',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--green-50)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ alignSelf: 'stretch', borderRadius: 99, background: fila.urgente ? 'var(--red)' : 'var(--amber)' }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{fila.titulo}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{fila.detalle}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {fila.badge && <Badge tone={fila.badgeTone || 'red'}>{fila.badge}</Badge>}
            <span style={{ color: 'var(--green-600)' }}><Icon name={fila.icon || 'chevronRight'} size={15} /></span>
          </span>
        </button>
      ))}

      {pie && (
        <div style={{ padding: '8px 16px 12px' }}>
          <button type="button" onClick={onPie} style={{ fontSize: 12, color: 'var(--green-600)', fontWeight: 600, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>
            {pie}
          </button>
        </div>
      )}
    </section>
  )
}

// Dias transcurridos desde una fecha, con el reloj fijado por quien llama para
// no leerlo durante el render.
function diasDesde(fecha, ahora) {
  if (!fecha) return 0
  return Math.max(0, Math.floor((ahora - new Date(fecha).getTime()) / 86_400_000))
}

// Un contador de "12 pendientes" no dice a quien llamar. Esta agenda lista los
// leads con nombre y telefono, vencidos primero, y cada fila abre su gestion:
// el vendedor entra al dia sabiendo su primera llamada.
function AgendaCrmCard({ pendientes, isLoading, onAbrirLead, onVerTodo }) {
  const vencidas = pendientes?.vencidas ?? []
  const hoy = pendientes?.hoy ?? []
  const resumen = pendientes?.resumen ?? { vencidas: 0, hoy: 0, total: 0 }
  const filas = [
    ...vencidas.map(lead => ({ lead, atrasada: true })),
    ...hoy.map(lead => ({ lead, atrasada: false })),
  ]

  // Se fija al montar: leer el reloj durante el render hace que el mismo dato
  // cambie entre renders sin que cambien los datos.
  const [ahora] = useState(() => Date.now())
  const diasDeAtraso = fecha => {
    if (!fecha) return 0
    const dia = 24 * 60 * 60 * 1000
    return Math.max(0, Math.floor((ahora - new Date(fecha).getTime()) / dia))
  }

  return (
    <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 22, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>A quién contactar hoy</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {resumen.vencidas > 0 && <Badge tone="red">{resumen.vencidas} atrasada{resumen.vencidas !== 1 ? 's' : ''}</Badge>}
          {resumen.hoy > 0 && <Badge tone="amber">{resumen.hoy} para hoy</Badge>}
          {!isLoading && resumen.total === 0 && <Badge tone="neutral">Al día</Badge>}
        </div>
      </div>

      {isLoading && <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--text-3)' }}>Cargando tu agenda…</div>}

      {!isLoading && filas.length === 0 && (
        <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--text-3)' }}>
          No tienes gestiones pendientes. Buen momento para prospectar.
        </div>
      )}

      {filas.map(({ lead, atrasada }) => {
        const dias = diasDeAtraso(lead.fechaProximo)
        return (
          <button
            key={lead.id}
            type="button"
            onClick={() => onAbrirLead(lead.id)}
            style={{
              width: '100%', display: 'grid', gridTemplateColumns: '4px minmax(0, 1fr) auto',
              alignItems: 'center', gap: 12, padding: '10px 16px', border: 0,
              borderBottom: '1px solid var(--border)', background: 'transparent',
              cursor: 'pointer', textAlign: 'left', font: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--green-50)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ alignSelf: 'stretch', borderRadius: 99, background: atrasada ? 'var(--red)' : 'var(--amber)' }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>
                {lead.rsocial || lead.nombre || lead.rut || 'Cliente sin nombre'}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {lead.telefono || 'Sin teléfono'}
                {lead.ncotizacion ? ` · Cot. ${lead.ncotizacion}` : ''}
                {atrasada && dias > 0 ? ` · ${dias} día${dias !== 1 ? 's' : ''} de atraso` : ''}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {String(lead.prioridad || '').toLowerCase() === 'alta' && <Badge tone="red">Alta</Badge>}
              <span style={{ color: 'var(--green-600)' }}><Icon name="phone" size={15} /></span>
            </span>
          </button>
        )
      })}

      <div style={{ padding: '8px 16px 12px' }}>
        <button type="button" onClick={onVerTodo} style={{ fontSize: 12, color: 'var(--green-600)', fontWeight: 600, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>
          Ver todo el CRM →
        </button>
      </div>
    </section>
  )
}

// El taller sabia cuantas OT tenia pendientes, no cual tomar primero.
//
// Se muestra el compromiso cuando existe y, si no, hace cuanto espera la OT:
// hoy ninguna tiene fecha cargada, y una tarjeta que solo mirara el compromiso
// se veria vacia teniendo 45 ordenes en cola.
function TallerAgendaCard({ odts, isLoading, onAbrir, onVerTodo }) {
  const [ahora] = useState(() => Date.now())
  const atrasadas = odts.filter(o => (o.fechaEntregaCompromiso || o.plazo) && diasDesde(o.fechaEntregaCompromiso || o.plazo, ahora) > 0).length
  const filas = odts.map(odt => {
    const compromiso = odt.fechaEntregaCompromiso || odt.plazo
    const diasAtraso = compromiso ? diasDesde(compromiso, ahora) : 0
    const enCola = diasDesde(odt.createdAt, ahora)
    const alta = String(odt.prioridad || '').toLowerCase() === 'alta'
    return {
      key: odt.id,
      urgente: alta || diasAtraso > 0,
      titulo: odt.clienteNombre || `OT ${odt.legacyNInterno ?? odt.id}`,
      detalle: [
        odt.tipo || 'Sin taller',
        odt.estado,
        compromiso
          ? (diasAtraso > 0 ? `${diasAtraso} día${diasAtraso !== 1 ? 's' : ''} de atraso` : 'vence hoy')
          : `${enCola} día${enCola !== 1 ? 's' : ''} en cola`,
      ].filter(Boolean).join(' · '),
      badge: diasAtraso > 0 ? 'Atrasada' : alta ? 'Prioritaria' : null,
      badgeTone: diasAtraso > 0 ? 'red' : 'amber',
      icon: 'wrench',
      onClick: () => onAbrir(odt.id),
    }
  })
  return (
    <AgendaCard
      titulo="Qué trabajar primero"
      badges={[
        ...(atrasadas > 0 ? [{ texto: `${atrasadas} atrasada${atrasadas !== 1 ? 's' : ''}`, tone: 'red' }] : []),
        ...(!isLoading && odts.length === 0 ? [{ texto: 'Sin OT en cola', tone: 'neutral' }] : []),
      ]}
      filas={filas}
      vacio="No hay órdenes de trabajo pendientes."
      cargando={isLoading}
      pie="Ver todas las OT →"
      onPie={onVerTodo}
    />
  )
}

// Bodega veia "75 pendientes de entrega" sin saber cual sacar primero.
function EntregasAgendaCard({ entregas, isLoading, onAbrir, onVerTodo }) {
  const [ahora] = useState(() => Date.now())
  const filas = entregas.map(orden => {
    const dias = diasDesde(orden.createdAt, ahora)
    return {
      key: orden.id,
      urgente: dias > 7,
      titulo: `N° ${orden.nInterno ?? orden.id}${orden.rutCliente ? ` · ${orden.rutCliente}` : ''}`,
      detalle: `${dias} día${dias !== 1 ? 's' : ''} esperando${orden.estadoPago === 'No pagada' ? ' · sin pagar' : ''}`,
      badge: orden.estadoPago === 'No pagada' ? 'No pagada' : null,
      badgeTone: 'amber',
      icon: 'truck',
      onClick: () => onAbrir(orden.id),
    }
  })
  return (
    <AgendaCard
      titulo="Qué despachar primero"
      badges={filas.length ? [{ texto: 'Las más antiguas', tone: 'neutral' }] : []}
      filas={filas}
      vacio="No hay entregas pendientes."
      cargando={isLoading}
      pie="Ver todas las entregas →"
      onPie={onVerTodo}
    />
  )
}

// RRHH tenia los conteos pero no los nombres. Vienen del modulo de personal
// (/rrhh/operativo), donde los datos personales si corresponden: el bloque del
// tablero se mantiene como conteos.
function RrhhAgendaCard({ operativo, isLoading, onAbrir, onVerTodo }) {
  const [ahora] = useState(() => Date.now())
  const contratos = operativo?.contratosPorVencer ?? []
  const licencias = operativo?.licenciasActivas ?? []
  const filas = [
    ...contratos.map(item => {
      const dias = -diasDesde(item.termino, ahora)
      return {
        key: `c-${item.id}`,
        urgente: dias <= 7,
        titulo: item.trabajador?.nombre || 'Trabajador',
        detalle: `Contrato vence ${item.termino ? new Date(item.termino).toLocaleDateString('es-CL') : 'sin fecha'}${item.trabajador?.cargo ? ` · ${item.trabajador.cargo}` : ''}`,
        badge: 'Contrato',
        badgeTone: dias <= 7 ? 'red' : 'amber',
        icon: 'fileText',
        onClick: () => onAbrir(item.trabajador?.id),
      }
    }),
    ...licencias.map(item => ({
      key: `l-${item.id}`,
      urgente: false,
      titulo: item.trabajador?.nombre || 'Trabajador',
      detalle: `Con licencia hasta ${item.termino ? new Date(item.termino).toLocaleDateString('es-CL') : 'sin fecha'}`,
      badge: 'Ausente',
      badgeTone: 'amber',
      icon: 'users',
      onClick: () => onAbrir(item.trabajador?.id),
    })),
  ].slice(0, 8)

  return (
    <AgendaCard
      titulo="Personal que requiere gestión"
      badges={[
        ...(contratos.length ? [{ texto: `${contratos.length} por vencer`, tone: 'amber' }] : []),
        ...(licencias.length ? [{ texto: `${licencias.length} con licencia`, tone: 'neutral' }] : []),
        ...(!isLoading && !filas.length ? [{ texto: 'Sin pendientes', tone: 'neutral' }] : []),
      ]}
      filas={filas}
      vacio="No hay contratos por vencer ni licencias activas."
      cargando={isLoading}
      pie="Ver todo el personal →"
      onPie={onVerTodo}
    />
  )
}

// El coordinador responde por el avance del equipo, no solo por el suyo. El
// backend entrega este bloque unicamente a quien tiene `equipo_comercial`
// (backend/src/routes/dashboard/stats.js), asi que aqui no hay que volver a
// decidir quien lo ve: si llega, se muestra.
function EquipoComercialCard({ equipo, isLoading, onVerDetalle }) {
  const vendedores = equipo?.vendedores ?? []
  const total = equipo?.total ?? 0
  const fmt = monto => monto.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
  const lider = vendedores[0]?.total || 0
  const mes = new Date().toLocaleDateString('es-CL', { month: 'long' })

  return (
    <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 22, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>
          Equipo comercial · {mes}
        </h2>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            hoy {isLoading ? '…' : fmt(equipo?.totalHoy ?? 0)}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: 'var(--green-600)' }}>
            {isLoading ? '…' : fmt(total)}
          </span>
        </span>
      </div>

      {!isLoading && vendedores.length === 0 && (
        <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--text-3)' }}>
          Todavía no hay ventas registradas este mes.
        </div>
      )}

      <div style={{ padding: '6px 8px' }}>
        {vendedores.map(v => {
          const pct = lider > 0 ? Math.round((v.total / lider) * 100) : 0
          return (
            <div key={v.vendedor} style={{ padding: '8px 8px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{v.vendedor}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
                  {/* Lo que interesa al coordinador es quien esta parado hoy,
                      no solo quien acumula mas en el mes. */}
                  {v.ordenesHoy > 0
                    ? <Badge tone="green">hoy {fmt(v.hoy)}</Badge>
                    : <Badge tone="neutral">sin venta hoy</Badge>}
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{v.ordenes.toLocaleString('es-CL')} {v.ordenes === 1 ? 'venta' : 'ventas'}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{fmt(v.total)}</span>
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', background: 'var(--green-600)', borderRadius: 99, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '8px 16px 12px' }}>
        <button type="button" onClick={onVerDetalle} style={{ fontSize: 12, color: 'var(--green-600)', fontWeight: 600, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>
          Ver reporte comercial completo →
        </button>
      </div>
    </section>
  )
}

// Los accesos cuelgan de su modulo, asi que repiten su color pero apagado: si
// compitieran en saturacion con el boton principal, la columna dejaria de
// leerse como "un modulo y lo que hay dentro".
const MODULE_TINTS = {
  green: { bg: '#eaf3ef', hover: '#dfeee7', fg: '#0b5138', border: '#cbe3d8' },
  blue:  { bg: '#e8f1f9', hover: '#dbe9f6', fg: '#11507f', border: '#c9dff1' },
  amber: { bg: '#fdf3e2', hover: '#fbebd2', fg: '#8a5a10', border: '#f3dfbc' },
  slate: { bg: '#eef1f5', hover: '#e4e9ef', fg: '#33415a', border: '#d8dfe8' },
  red:   { bg: '#fceded', hover: '#fae2e2', fg: '#93231f', border: '#f3d3d3' },
}

function SubAccessTile({ label, icon, badge, tone = 'green', onClick }) {
  const [hov, setHov] = useState(false)
  const palette = MODULE_TINTS[tone] || MODULE_TINTS.green
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        minHeight: 46,
        width: '100%',
        border: `1px solid ${palette.border}`,
        borderRadius: 7,
        background: hov ? palette.hover : palette.bg,
        color: palette.fg,
        display: 'grid',
        gridTemplateColumns: '20px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 9,
        padding: '8px 11px',
        cursor: 'pointer',
        textAlign: 'left',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hov ? '0 4px 12px oklch(0 0 0 / 0.07)' : 'none',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85 }}>
        <Icon name={icon} size={16} />
      </span>
      <span style={{ fontSize: 12.5, lineHeight: 1.2, fontWeight: 600, overflowWrap: 'anywhere' }}>{label}</span>
      {badge != null && (
        <span style={{
          minWidth: 24,
          justifySelf: 'end',
          padding: '2px 6px',
          borderRadius: 999,
          background: 'oklch(0 0 0 / 0.07)',
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          fontWeight: 700,
          textAlign: 'center',
        }}>{badge}</span>
      )}
    </button>
  )
}

function MainMenuTile({ label, icon, route, tone = 'green', onClick }) {
  const [hov, setHov] = useState(false)
  const colors = {
    green: { bg: '#064e3b', hover: '#075f48', fg: '#fff', iconBg: 'oklch(1 0 0 / 0.12)', glow: 'oklch(0.42 0.10 155 / 0.22)' },
    blue: { bg: '#0f5f9e', hover: '#136daf', fg: '#fff', iconBg: 'oklch(1 0 0 / 0.14)', glow: 'oklch(0.48 0.12 240 / 0.22)' },
    amber: { bg: '#b7791f', hover: '#c38425', fg: '#fff', iconBg: 'oklch(1 0 0 / 0.16)', glow: 'oklch(0.62 0.11 70 / 0.22)' },
    slate: { bg: '#334155', hover: '#3d4b5f', fg: '#fff', iconBg: 'oklch(1 0 0 / 0.12)', glow: 'oklch(0.38 0.03 250 / 0.18)' },
    red: { bg: '#b91c1c', hover: '#c92121', fg: '#fff', iconBg: 'oklch(1 0 0 / 0.14)', glow: 'oklch(0.46 0.13 25 / 0.22)' },
  }
  const palette = colors[tone] || colors.green
  return (
    <button
      type="button"
      onClick={() => onClick(route)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        minHeight: 92,
        border: 0,
        borderRadius: 8,
        background: `linear-gradient(145deg, ${hov ? palette.hover : palette.bg}, ${palette.bg})`,
        color: palette.fg,
        display: 'grid',
        gridTemplateRows: '1fr auto',
        alignItems: 'center',
        justifyItems: 'center',
        gap: 8,
        padding: '12px 10px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov
          ? `0 14px 28px ${palette.glow}, inset 0 1px 0 oklch(1 0 0 / 0.18)`
          : '0 10px 24px oklch(0 0 0 / 0.12)',
        outline: hov ? '1px solid oklch(1 0 0 / 0.16)' : '1px solid transparent',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, outline-color 0.18s ease, background 0.18s ease',
      }}
    >
      <span style={{
        position: 'absolute',
        inset: 0,
        opacity: hov ? 1 : 0,
        background: 'radial-gradient(circle at 30% 12%, oklch(1 0 0 / 0.12), transparent 32%), linear-gradient(120deg, transparent, oklch(1 0 0 / 0.08), transparent)',
        transform: hov ? 'translateX(6%)' : 'translateX(-18%)',
        transition: 'opacity 0.18s ease, transform 0.36s ease',
        pointerEvents: 'none',
      }} />
      <span style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: palette.iconBg,
        transform: hov ? 'scale(1.04)' : 'scale(1)',
        transition: 'transform 0.18s ease, background 0.18s ease',
        position: 'relative',
      }}>
        <Icon name={icon} size={24} />
      </span>
      <span style={{ fontSize: 14, lineHeight: 1.15, fontWeight: 800, letterSpacing: 0, position: 'relative', textAlign: 'center' }}>{label}</span>
    </button>
  )
}

// La botonera es la pantalla de inicio porque es la que el equipo ya sabe usar:
// viene del ERP anterior y es su punto de partida diario. El tablero de
// indicadores (DashboardOperativoPage) es del ERP nuevo y hoy queda sin enlace
// -no borrado- hasta que el equipo lo pida.
//
// Por eso esta pantalla tiene que bastarse sola: ademas de los botones, muestra
// los numeros que cada rol mira al llegar y lleva a los filtros que abre todos
// los dias.

// Un KPI vale la pena solo si al hacer clic deja al usuario en la lista
// filtrada que iba a abrir igual. Si no lleva a ninguna parte, es decoracion.
function buildKpis({ show, canReadProveedores, stats, inv, tal, isLoading }) {
  const n = v => isLoading ? '…' : (v ?? 0).toLocaleString('es-CL')
  const invCritico = (inv.critico ?? 0) + (inv.sinStock ?? 0)
  const talCritico = (tal.critico ?? 0) + (tal.sinStock ?? 0)
  const rrhh = stats?.rrhh ?? {}
  const provPagos = stats?.proveedoresPagos ?? {}

  const equipo = stats?.equipoComercial
  return [
    // Doble llave: el permiso decide y el dato confirma que el backend lo
    // entrego. Colgarlo solo del dato dejaria la decision en manos de la API.
    show.equipoComercial && equipo && {
      label: 'Venta del equipo (mes)',
      value: isLoading ? '…' : '$' + Math.round((equipo.total || 0) / 1_000_000 * 10) / 10 + 'M',
      icon: 'trendingUp', tone: 'neutral',
      sublabel: `${(equipo.vendedores?.length ?? 0).toLocaleString('es-CL')} vendedores con venta`,
      route: '/reportes/gerenciales',
    },
    show.ventas && {
      label: 'Ventas no pagadas', value: n(stats?.ventas?.noPagadas), icon: 'dollarSign',
      tone: (stats?.ventas?.noPagadas ?? 0) > 0 ? 'red' : 'neutral',
      sublabel: 'Requieren cobranza', route: '/ventas?noPagada=1',
    },
    show.ventas && {
      label: 'Pendientes de entrega', value: n(stats?.ventas?.pendienteEntrega), icon: 'truck',
      tone: 'blue', sublabel: 'Por despachar', route: '/ventas?pendienteEntrega=1',
    },
    show.crm && {
      label: 'CRM pendientes', value: n(stats?.crm?.pendientes), icon: 'phone',
      tone: (stats?.crm?.altaPrioridad ?? 0) > 0 ? 'red' : 'blue',
      sublabel: `${n(stats?.crm?.altaPrioridad)} de prioridad alta`, route: '/crm',
    },
    show.taller && {
      label: 'OT activas', value: n(stats?.odts?.total), icon: 'wrench',
      tone: (stats?.odts?.urgentes ?? 0) > 0 ? 'amber' : 'neutral',
      sublabel: `${n(stats?.odts?.urgentes)} urgentes`, route: '/taller?pendiente=si',
    },
    show.bodega && {
      label: 'Stock crítico inventario', value: n(invCritico), icon: 'alertTriangle',
      tone: invCritico > 0 ? 'amber' : 'neutral',
      sublabel: `${n(inv.sinStock)} sin stock`, route: '/bodega?filtro=critico',
    },
    show.bodega && {
      label: 'Stock crítico taller', value: n(talCritico), icon: 'alertTriangle',
      tone: talCritico > 0 ? 'amber' : 'neutral',
      sublabel: `${n(tal.sinStock)} sin stock`, route: '/bodega?tab=taller&filtro=critico',
    },
    show.cobranza && {
      label: 'Cobranza pendiente', value: n(stats?.cobranzaHistorico?.pendientes), icon: 'dollarSign',
      tone: (stats?.cobranzaHistorico?.pendientes ?? 0) > 0 ? 'amber' : 'neutral',
      sublabel: 'Documentos por cobrar', route: '/cobranza',
    },
    canReadProveedores && {
      label: 'Facturas prov. por pagar', value: n(provPagos.facturasNoPagadas), icon: 'briefcase',
      tone: (provPagos.facturasNoPagadas ?? 0) > 0 ? 'amber' : 'neutral',
      sublabel: `${n(provPagos.boletasNoPagadas)} boletas`, route: '/pagos-proveedores?doc=Factura&estado=Pendiente',
    },
    // El backend ya entrega este bloque solo a quien puede ver rrhh
    // (backend/src/routes/dashboard/stats.js); son conteos, no datos personales.
    show.rrhh && {
      label: 'Dotación activa', value: n(rrhh.dotacionActiva), icon: 'users',
      tone: 'neutral', sublabel: 'Trabajadores vigentes', route: '/rrhh',
    },
    // RrhhPage todavia no lee filtros por query param, asi que estos llevan al
    // listado completo. Prometer ?filtro=... daria un clic que no filtra nada.
    show.rrhh && {
      label: 'Contratos por vencer', value: n(rrhh.contratosPorVencer), icon: 'fileText',
      tone: (rrhh.contratosPorVencer ?? 0) > 0 ? 'amber' : 'neutral',
      sublabel: 'Próximos a término', route: '/rrhh',
    },
    show.rrhh && {
      label: 'Licencias activas', value: n(rrhh.licenciasActivas), icon: 'alertTriangle',
      tone: (rrhh.licenciasActivas ?? 0) > 0 ? 'amber' : 'neutral',
      sublabel: 'Ausencias en curso', route: '/rrhh',
    },
  ].filter(Boolean)
}

function buildQuickAccess({ show, canReadCatalogo, canReadReportes, canWriteVentas, canWriteTaller, canWriteBodega, canReadDespacho, canWriteDespacho, canReadProveedores, canReadCaja, canWriteCaja, canWriteRrhh, isOperario, stats, inv, tal, isLoading }) {
  const n = v => isLoading ? '...' : (v ?? 0).toLocaleString('es-CL')
  const invCritico = (inv.critico ?? 0) + (inv.sinStock ?? 0)
  const talCritico = (tal.critico ?? 0) + (tal.sinStock ?? 0)
  const talleres = stats?.talleres ?? []
  const porTipo = tipo => talleres.find(t => t.tipo === tipo) ?? {}
  // El operario no gestiona la OT: solo registra avance sobre las suyas
  // (permiso 'taller.avance'). Ofrecerle el listado de gestion completo lo manda
  // a una pantalla donde no puede hacer nada.
  const showGestionTaller = show.taller && !isOperario
  // El desglose por tipo de taller es la carga de trabajo del jefe. Al vendedor
  // y a bodega les basta el total: cinco tarjetas de OT les tapan lo suyo.
  const showDesgloseTaller = canWriteTaller
  // "Mantencion" es mantener el maestro de productos. Quien solo lee no puede,
  // y el titulo le prometia una accion que la pantalla le niega.
  const mantencion = canWriteBodega ? 'Mantención' : 'Consultar'

  return [
    // Comercial
    canWriteVentas && { label: 'Nueva Venta', icon: 'plusCircle', tone: 'green', route: '/ventas/nueva' },
    show.ventas && { label: 'Matriz Ventas', icon: 'grid', tone: 'blue', route: '/ventas' },
    show.ventas && { label: 'Ventas No pagadas', icon: 'alertTriangle', tone: 'red', badge: n(stats?.ventas?.noPagadas), route: '/ventas?noPagada=1' },
    show.ventas && { label: 'Ventas Pendientes entrega', icon: 'truck', tone: 'amber', badge: n(stats?.ventas?.pendienteEntrega), route: '/ventas?pendienteEntrega=1' },
    // El CRM lo trabaja quien vende. Bodega y caja tienen ventas:read para
    // consultar notas, no para gestionar prospectos.
    canWriteVentas && { label: 'SISVENTA', icon: 'trendingUp', tone: 'blue', badge: n(stats?.crm?.pendientes), route: '/crm' },
    canWriteVentas && { label: 'Nueva Cotización', icon: 'clipboard', tone: 'cyan', route: '/crm/nueva/cotizacion-simple' },
    canReadCatalogo && { label: 'Consulta Precios', icon: 'tag', tone: 'blue', route: '/consulta-precios' },
    canReadReportes && { label: 'Reportería Gerencial', icon: 'barChart2', tone: 'slate', route: '/reportes/gerenciales' },
    // La ruta es solo de admin (router.jsx), asi que el acceso tambien.
    show.admin && { label: 'Comisiones', icon: 'dollarSign', tone: 'slate', route: '/reportes/comisiones' },
    show.clientes && { label: 'Clientes', icon: 'users', tone: 'green', route: '/clientes' },

    // Bodega y despacho
    show.bodega && { label: `${mantencion} Bodega Inventario y Web`, icon: 'warehouse', tone: 'green', route: '/bodega' },
    show.bodega && { label: 'Stock Crítico Bodega Inventario', icon: 'alertTriangle', tone: 'red', badge: n(invCritico), route: '/bodega?filtro=critico' },
    show.bodega && { label: `${mantencion} Bodega Taller`, icon: 'box', tone: 'green', route: '/bodega?tab=taller' },
    show.bodega && { label: 'Stock Crítico Bodega Taller', icon: 'alertTriangle', tone: 'red', badge: n(talCritico), route: '/bodega?tab=taller&filtro=critico' },
    canWriteBodega && { label: 'Ingreso de Mercadería', icon: 'plusCircle', tone: 'cyan', route: '/stock-ingresos' },
    canReadDespacho && { label: 'Despachos', icon: 'truck', tone: 'blue', route: '/despachos' },
    canWriteDespacho && { label: 'Nueva Guía de Despacho', icon: 'fileText', tone: 'cyan', route: '/despachos/guias/nueva' },

    // Operaciones y taller
    isOperario && { label: 'Mis Órdenes de Trabajo', icon: 'wrench', tone: 'cyan', badge: n(stats?.odts?.pendientes), route: '/taller-operario' },
    isOperario && { label: 'Terminal de Corte', icon: 'scissors', tone: 'blue', route: '/taller-corte' },
    canWriteTaller && { label: 'Nueva OT', icon: 'plusCircle', tone: 'green', route: '/taller/nueva' },
    showGestionTaller && { label: 'OT Taller Pendientes', icon: 'wrench', tone: 'cyan', badge: n(stats?.odts?.pendientes), route: '/taller?pendiente=si' },
    showGestionTaller && { label: 'OT Taller Prioritarias', icon: 'wrench', tone: 'red', badge: n(stats?.odts?.urgentes), route: '/taller?prioridad=urgente' },
    showDesgloseTaller && { label: 'OT Taller Espumas Pendientes', icon: 'wrench', tone: 'cyan', badge: n(porTipo('Espumas').activas), route: '/taller?tipo=Espumas&pendiente=si' },
    showDesgloseTaller && { label: 'OT Taller Confecciones Pendientes', icon: 'wrench', tone: 'cyan', badge: n(porTipo('Confecciones').activas), route: '/taller?tipo=Confecciones&pendiente=si' },
    showDesgloseTaller && { label: 'OT Taller Madera Pendientes', icon: 'wrench', tone: 'cyan', badge: n(porTipo('Externo').activas), route: '/taller?tipo=Externo&pendiente=si' },
    canWriteTaller && { label: 'Bitácora de Taller', icon: 'edit', tone: 'green', route: '/bitacora-taller' },
    show.taller && { label: 'Historial de Materiales', icon: 'layers', tone: 'green', route: '/historial-materiales' },

    // Finanzas
    show.cobranza && { label: 'Cobranza', icon: 'dollarSign', tone: 'amber', route: '/cobranza' },
    canReadCaja && { label: 'Movimientos de caja', icon: 'creditCard', tone: 'amber', route: '/caja' },
    canWriteCaja && { label: 'Nuevo Movimiento de caja', icon: 'plusCircle', tone: 'amber', route: '/caja/nuevo' },
    canReadProveedores && { label: 'Pagos a proveedores', icon: 'briefcase', tone: 'amber', route: '/pagos-proveedores' },

    // Personas
    show.rrhh && { label: 'Trabajadores', icon: 'users', tone: 'purple', route: '/rrhh' },
    canWriteRrhh && { label: 'Nuevo Trabajador', icon: 'plusCircle', tone: 'purple', route: '/rrhh/nuevo' },

    // Administración
    show.admin && { label: 'Usuarios', icon: 'users', tone: 'red', route: '/usuarios' },
    show.admin && { label: 'Auditoría de Actividad', icon: 'fileText', tone: 'red', route: '/admin/auditoria' },
    show.admin && { label: 'Integridad de Datos', icon: 'alertTriangle', tone: 'red', route: '/admin/integridad' },
  ].filter(Boolean)
}

function getAccessModel(user, stats, isLoading) {
  const role = user?.role || 'admin'
  const canReadVentas = can(user, 'ventas')
  const canReadBodega = can(user, 'bodega')
  const canReadCatalogo = can(user, 'catalogo')
  const canReadTaller = can(user, 'taller')
  const canReadCaja = can(user, 'caja')
  const canReadClientes = can(user, 'clientes')
  const canReadProveedores = can(user, 'proveedores')
  const canReadDespacho = can(user, 'despacho')
  const canWriteVentas = can(user, 'ventas', 'write')
  const canWriteTaller = can(user, 'taller', 'write')
  const canWriteBodega = can(user, 'bodega', 'write')
  const canWriteDespacho = can(user, 'despacho', 'write')
  const canWriteCaja = can(user, 'caja', 'write')
  const canWriteRrhh = can(user, 'rrhh', 'write')
  // Registra avance pero no gestiona: 'taller.avance' sin 'taller:write'.
  const isOperario = canReadTaller && !canWriteTaller && can(user, 'taller.avance', 'write')
  const show = {
    ventas: canReadVentas,
    bodega: canReadBodega,
    taller: canReadTaller,
    // Tiene que ser el mismo permiso que usa el backend para entregar el bloque
    // (soloSi(ve('cobranza')) en dashboard/stats.js). Colgaba de ventas||caja||
    // proveedores, asi que bodega veia la tarjeta y al abrirla recibia un 403.
    cobranza: can(user, 'cobranza'),
    admin: role === 'admin',
    clientes: canReadClientes,
    crm: canReadVentas,
    caja: canReadCaja,
    rrhh: can(user, 'rrhh'),
    licitaciones: can(user, 'licitaciones'),
    equipoComercial: can(user, 'equipo_comercial'),
    despacho: canReadDespacho,
  }
  const inv = stats?.stock?.Inventario ?? {}
  const tal = stats?.stock?.Taller ?? {}
  const quickAccess = buildQuickAccess({
    show, canReadCatalogo, canReadReportes: can(user, 'reportes'), canWriteVentas, canWriteTaller, canWriteBodega,
    canReadDespacho, canWriteDespacho, canReadProveedores, canReadCaja, canWriteCaja,
    canWriteRrhh, isOperario, stats, inv, tal, isLoading,
  })
  const kpis = buildKpis({ show, canReadProveedores, stats, inv, tal, isLoading })
  return { show, inv, tal, quickAccess, kpis, isOperario }
}

// Centraba vertical contra el alto de la ventana porque era una portada sin
// barra. Con la barra arriba eso empujaba el contenido hacia abajo y agregaba
// scroll en una pantalla que cabia entera.
const dashboardStartShell = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  background: 'var(--bg)',
  padding: 'clamp(16px, 3vh, 34px) clamp(12px, 2vw, 28px)',
}

const dashboardStartFrame = {
  width: 'clamp(320px, 75vw, 1440px)',
  maxWidth: '100%',
  minWidth: 0,
}

// Cada modulo encabeza una columna y debajo cuelgan sus accesos mas usados. La
// lista larga de "accesos rapidos" en un bloque aparte obligaba a leer 30
// botones para encontrar uno; aqui el modulo dice donde mirar.
//
// El orden manda: se toman los TRES primeros que el rol pueda ver, asi que el
// mismo modulo se adapta al puesto sin escribir una lista por rol.
const MAX_ACCESOS_POR_MODULO = 3

function accesosDelModulo(rutas, quickAccess) {
  const encontrados = []
  for (const ruta of rutas) {
    const item = quickAccess.find(a => a.route === ruta)
    if (item) encontrados.push(item)
    if (encontrados.length === MAX_ACCESOS_POR_MODULO) break
  }
  return encontrados
}

function buildModuleColumns({ user, show, quickAccess, isOperario, isComercial }) {
  const modulos = [
    show.ventas && {
      label: 'Ventas', icon: 'shoppingCart', tone: 'blue', route: '/ventas',
      // Quien vende parte por crear; quien supervisa parte por lo que quedo pendiente.
      rutas: isComercial
        ? ['/ventas/nueva', '/crm', '/consulta-precios', '/ventas', '/ventas?noPagada=1']
        : show.admin
          ? ['/ventas', '/crm', '/clientes', '/ventas?noPagada=1']
          : ['/ventas', '/ventas?noPagada=1', '/ventas?pendienteEntrega=1', '/consulta-precios', '/clientes'],
    },
    // Solo reporteria: colgarle Clientes o Consulta Precios lo convertia en el
    // cajon de lo que no calzaba en otra columna.
    can(user, 'reportes') && {
      label: 'Gerencia', icon: 'barChart2', tone: 'slate', route: '/reportes/gerenciales',
      rutas: ['/reportes/gerenciales', '/reportes/comisiones'],
    },
    show.bodega && {
      label: 'Bodega', icon: 'warehouse', tone: 'green', route: '/bodega',
      rutas: ['/bodega', '/bodega?filtro=critico', '/stock-ingresos', '/despachos', '/bodega?tab=taller'],
    },
    show.caja && {
      label: 'Caja', icon: 'creditCard', tone: 'slate', route: '/caja',
      rutas: ['/caja', '/caja/nuevo', '/cobranza', '/pagos-proveedores'],
    },
    show.rrhh && {
      label: 'RRHH', icon: 'users', tone: 'amber', route: '/rrhh',
      rutas: ['/rrhh', '/rrhh/nuevo'],
    },
    show.taller && {
      label: 'Taller', icon: 'wrench', tone: 'green', route: isOperario ? '/taller-operario' : '/taller',
      rutas: isOperario
        ? ['/taller-operario', '/taller-corte', '/historial-materiales']
        : ['/taller/nueva', '/taller?pendiente=si', '/taller?prioridad=urgente', '/bitacora-taller'],
    },
    show.admin && {
      label: 'Admin', icon: 'settings', tone: 'red', route: '/usuarios',
      rutas: ['/usuarios', '/admin/auditoria', '/admin/integridad'],
    },
  ].filter(Boolean)

  return modulos.map(modulo => ({ ...modulo, items: accesosDelModulo(modulo.rutas, quickAccess) }))
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading } = useDashboardStats()
  const { user } = useAuthStore()
  const { show, quickAccess, kpis, isOperario } = getAccessModel(user, stats, isLoading)

  // Las gestiones de hoy + las vencidas es lo que el vendedor tiene que hacer
  // ahora; el total de pendientes del CRM incluye lo que aun no vence.
  // Se pide solo a quien vende: bodega y caja tienen ventas:read y estarian
  // pagando una consulta cuyo resultado no se muestra en ninguna parte.
  const canWriteVentas = can(user, 'ventas', 'write')
  const { data: pendientesCrm } = useCrmPendientesHoy(canWriteVentas)
  // Los nombres del personal viven en su modulo, no en el bloque de conteos
  // del tablero; se piden aparte y solo a quien de verdad gestiona personal
  // -no a quien solo puede leer el modulo, como admin o solo_lectura- para no
  // pagar una consulta cuyo resultado no se va a mostrar.
  const isRrhhOperativo = can(user, 'rrhh', 'write') && !show.admin
  const { data: rrhhOperativo, isLoading: cargandoRrhh } = useRrhhOperativo({ dias: 30 }, isRrhhOperativo)
  // El endpoint devuelve hasta 10 filas para la agenda; el total real viene en
  // `resumen`. Contar las filas dejaba el badge pegado en 10.
  const totalCrmPendientes = pendientesCrm?.resumen?.total ?? 0
  const sisventa = quickAccess.find(item => item.route === '/crm')
  if (sisventa && pendientesCrm) sisventa.badge = totalCrmPendientes.toLocaleString('es-CL')

  // Una agenda es "tu tarea de hoy": cuelga de quien HACE el trabajo -permiso
  // de escritura del rol operativo-, nunca de quien solo puede leer el modulo.
  // show.taller/despacho/rrhh son de lectura y admin los tiene los tres via
  // '*': con eso, admin (y de paso vendedor/coordinador/solo_lectura, que solo
  // leen taller y despacho) terminaban viendo listas de tareas que no son
  // suyas. El admin ya tiene sus KPIs de vista general; no necesita la cola.
  //
  // Mismo patron que isComercial: permiso de escritura Y no-admin, porque
  // admin tiene '*' y heredaria el permiso de escritura igual.
  const isComercial = canWriteVentas && !show.admin
  const canWriteTaller = can(user, 'taller', 'write')
  const isTallerOperativo = canWriteTaller && !show.admin
  const isBodegaOperativa = can(user, 'despacho', 'write') && !show.admin
  const columnas = buildModuleColumns({ user, show, quickAccess, isOperario, isComercial })
  const saludo = user?.nombre ? `¡Hola, ${user.nombre}!` : '¡Hola!'

  return (
    <main className="page" style={dashboardStartShell}>
      <div style={dashboardStartFrame}>
        <PageHeader
          title={saludo}
          subtitle="Tu panel de inicio"
          breadcrumb={['Inicio']}
          actions={<HeaderUtilityCluster />}
        />

        {/* Solo para quien gestiona su propia cartera. El admin ve los leads de
            TODA la empresa (applyScopeByRole en routes/crm), asi que titularlo
            "a quien contactar hoy" le prometia una agenda personal que no es
            suya; su vista del CRM es el KPI de pendientes. */}
        {isComercial && (
          <AgendaCrmCard
            pendientes={pendientesCrm}
            isLoading={!pendientesCrm}
            onAbrirLead={id => navigate(`/crm/${id}/gestion`)}
            onVerTodo={() => navigate('/crm')}
          />
        )}

        {isTallerOperativo && stats?.tallerAgenda && (
          <TallerAgendaCard
            odts={stats.tallerAgenda}
            isLoading={isLoading}
            onAbrir={id => navigate(canWriteTaller ? `/taller/${id}/editar` : `/taller/${id}`)}
            onVerTodo={() => navigate('/taller?pendiente=si')}
          />
        )}

        {isBodegaOperativa && stats?.entregasAgenda && (
          <EntregasAgendaCard
            entregas={stats.entregasAgenda}
            isLoading={isLoading}
            onAbrir={id => navigate(`/ventas/${id}`)}
            onVerTodo={() => navigate('/ventas?pendienteEntrega=1')}
          />
        )}

        {isRrhhOperativo && (
          <RrhhAgendaCard
            operativo={rrhhOperativo}
            isLoading={cargandoRrhh}
            onAbrir={id => navigate(id ? `/rrhh/${id}` : '/rrhh')}
            onVerTodo={() => navigate('/rrhh')}
          />
        )}

        {show.equipoComercial && stats?.equipoComercial && (
          <EquipoComercialCard
            equipo={stats.equipoComercial}
            isLoading={isLoading}
            onVerDetalle={() => navigate('/reportes/gerenciales')}
          />
        )}

        {/* Los numeros primero: son el estado del dia. Los modulos vienen
            despues, porque son la respuesta a lo que esos numeros muestran. */}
        {kpis.length > 0 && (
          <section className="kpi-strip" style={{ margin: '16px 0 22px' }}>
            {kpis.map(kpi => (
              <KpiCard
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                icon={kpi.icon}
                tone={kpi.tone}
                sublabel={kpi.sublabel}
                onClick={() => navigate(kpi.route)}
              />
            ))}
          </section>
        )}

        {/* Cada modulo con lo que mas se abre dentro de el, en su misma columna. */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 12, alignItems: 'start' }}>
          {columnas.map(modulo => (
            <div key={modulo.route} style={{ display: 'grid', gap: 7, minWidth: 0 }}>
              <MainMenuTile
                label={modulo.label}
                icon={modulo.icon}
                tone={modulo.tone}
                route={modulo.route}
                onClick={navigate}
              />
              {modulo.items.map(item => (
                <SubAccessTile
                  key={`${item.route}-${item.label}`}
                  label={item.label}
                  icon={item.icon}
                  badge={item.badge}
                  tone={modulo.tone}
                  onClick={() => navigate(item.route)}
                />
              ))}
            </div>
          ))}
        </section>

        <div style={{ marginTop: 28, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Plastimar ERP · Sucursal 5 Oriente</span>
        </div>
      </div>
    </main>
  )
}

export function DashboardOperativoPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading } = useDashboardStats()
  const { user } = useAuthStore()
  const role = user?.role || 'admin'
  const canReadVentas = can(user, 'ventas')
  const canReadBodega = can(user, 'bodega')
  const canReadCatalogo = can(user, 'catalogo')
  const canReadTaller = can(user, 'taller')
  const canReadDespacho = can(user, 'despacho')
  const canReadClientes = can(user, 'clientes')
  const canReadCaja = can(user, 'caja')
  const canReadProveedores = can(user, 'proveedores')
  const canWriteVentas = can(user, 'ventas', 'write')
  const canWriteTaller = can(user, 'taller', 'write')
  const canWriteBodega = can(user, 'bodega', 'write')
  const canWriteClientes = can(user, 'clientes', 'write')
  const canWriteProveedores = can(user, 'proveedores', 'write')
  const show = {
    ventas: canReadVentas,
    bodega: canReadBodega,
    taller: canReadTaller,
    cobranza: canReadVentas || canReadCaja || canReadProveedores,
    admin: role === 'admin',
    clientes: canReadClientes,
    crm: canReadVentas,
  }

  const inv = stats?.stock?.Inventario ?? {}
  const tal = stats?.stock?.Taller ?? {}
  const maxTaller = Math.max(...(stats?.talleres ?? []).map(t => t.activas), 1)
  const crm = stats?.crm ?? { pendientes: 0, enGestion: 0, altaPrioridad: 0 }
  const proveedores = stats?.proveedores ?? { total: 0 }
  const cobHist = stats?.cobranzaHistorico ?? { cobrado: 0, pendientes: 0 }
  const provPagos = stats?.proveedoresPagos ?? { facturasNoPagadas: 0, boletasNoPagadas: 0 }
  const cal = stats?.productosCalidad ?? { sinCodigoBarra: 0, sinCodigoInterno: 0, sinCategoria: 0, sinProveedor: 0 }
  const webPend = stats?.ventas?.webPendientes ?? 0
  const fmtM = n => '$' + (Math.abs(n || 0) / 1_000_000).toFixed(1) + 'M'
  const n = v => isLoading ? '…' : (v ?? 0).toLocaleString('es-CL')

  const now = new Date()
  const hora = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const fecha = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <main className="page page-wide">
      <PageHeader
        title="Inicio operativo"
        subtitle={`${fecha} · ${hora} · Sucursal 5 Oriente`}
        breadcrumb={['Inicio', 'Dashboard']}
        actions={
          canWriteVentas && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/ventas/nueva')}>Nueva Venta</Btn>
        }
      />

      <div className="kpi-strip">
        {canReadVentas && (
          <KpiCard label="Ventas No Pagadas" value={n(stats?.ventas?.noPagadas)} icon="dollarSign" tone="red"
            sublabel="Gestión cobranza requerida" onClick={() => navigate('/matriz-ventas?noPagada=1')} />
        )}
        {canReadVentas && (
          <KpiCard label="Pendientes Entrega" value={n(stats?.ventas?.pendienteEntrega)} icon="truck" tone="blue"
            sublabel="Órdenes por despachar" onClick={() => navigate('/matriz-ventas?pendienteEntrega=1')} />
        )}
        {show.ventas && (
          <KpiCard label="Cotizaciones Web" value={n(webPend)} icon="cloud" tone={webPend > 0 ? 'amber' : 'neutral'}
            sublabel="Pendientes revision" onClick={() => navigate('/ordenes-compra?estado=Pendiente')} />
        )}
        {show.taller && (
          <KpiCard label="OT Activas" value={n(stats?.odts?.total)} icon="wrench"
            sublabel={!isLoading ? `${n(stats?.odts?.urgentes)} urgentes` : ''}
            tone={stats?.odts?.urgentes > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/taller')} />
        )}
        {show.bodega && (
          <KpiCard label="Stock Crítico - Inv." value={n((inv.critico ?? 0) + (inv.sinStock ?? 0))} icon="alertTriangle" tone="amber"
            sublabel={!isLoading ? `${inv.sinStock ?? 0} sin stock` : ''} onClick={() => navigate('/bodega?filtro=critico')} />
        )}
        {show.bodega && (
          <KpiCard label="Stock Crítico - Taller" value={n((tal.critico ?? 0) + (tal.sinStock ?? 0))} icon="alertTriangle" tone="amber"
            sublabel={!isLoading ? `${tal.sinStock ?? 0} sin stock` : ''} onClick={() => navigate('/bodega?tab=taller&filtro=critico')} />
        )}
        {show.crm && (
          <KpiCard label="CRM - Pendientes" value={n(crm.pendientes)} icon="phone" tone={crm.altaPrioridad > 0 ? 'red' : 'blue'}
            sublabel={!isLoading ? `${crm.altaPrioridad} prioridad alta` : ''} onClick={() => navigate('/crm')} />
        )}
        {canReadVentas && (
          <KpiCard label="Cobranza Cobrado" value={isLoading ? '...' : fmtM(cobHist.cobrado)} icon="trendingUp" tone="neutral"
            sublabel={!isLoading ? `${cobHist.pendientes} pendientes` : ''} onClick={() => navigate('/cobranza')} />
        )}
      </div>

      <div className="dash-grid">
        {canReadVentas && (
          <SectionCard title="Ventas & Cumplimiento Metas" icon="trendingUp">
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* YoY YTD Comparison */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2, #64748b)' }}>Ventas YoY YTD (Acumulado Anual)</span>
                  {stats?.kpis?.variacionYtd !== undefined && (
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: stats.kpis.variacionYtd >= 0 ? '#10b981' : '#ef4444',
                      background: stats.kpis.variacionYtd >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      padding: '2px 8px', borderRadius: 4
                    }}>
                      {stats.kpis.variacionYtd >= 0 ? '▲' : '▼'} {Math.abs(stats.kpis.variacionYtd)}% vs YTD Anterior
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ background: 'var(--bg, #f8fafc)', padding: 12, borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3, #94a3b8)', fontWeight: 600, textTransform: 'uppercase' }}>Este Año YTD</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace", marginTop: 4 }}>
                      {isLoading ? '...' : (stats?.kpis?.ytd?.total || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg, #f8fafc)', padding: 12, borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3, #94a3b8)', fontWeight: 600, textTransform: 'uppercase' }}>Año Anterior YTD</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)', fontFamily: "'DM Mono', monospace", marginTop: 4 }}>
                      {isLoading ? '...' : (stats?.kpis?.prevYtd?.total || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Meta Progress */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2, #64748b)' }}>Meta Mensual de Ventas</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
                    {isLoading ? '...' : (stats?.kpis?.mes?.gran || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })} / {isLoading ? '...' : (stats?.kpis?.metaMensualVentas || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                {(() => {
                  const actual = stats?.kpis?.mes?.gran || 0
                  const meta = stats?.kpis?.metaMensualVentas || 0
                  const pct = meta > 0 ? Math.min(100, Math.round((actual / meta) * 100)) : 0
                  const color = pct >= 100 ? '#10b981' : pct >= 75 ? 'var(--green-600)' : pct >= 50 ? 'var(--amber)' : '#ef4444'
                  const diff = meta - actual
                  return (
                    <div>
                      <div style={{ height: 12, background: 'var(--border, #e2e8f0)', borderRadius: 99, overflow: 'hidden', position: 'relative', marginBottom: 8 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}, #34d399)`, borderRadius: 99, transition: 'width 0.4s ease' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3, #94a3b8)', fontWeight: 600 }}>
                        <span>Progreso: {pct}%</span>
                        {diff > 0 ? (
                          <span>Faltan {diff.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}</span>
                        ) : (
                          <span style={{ color: '#10b981' }}>¡Meta superada! 🎉</span>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </SectionCard>
        )}

        {show.taller && (
          <SectionCard title="Talleres - OT Activas" icon="tool">
            <div style={{ padding: '4px 14px 8px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--blue)', fontSize: 13 }}>{n(stats?.odts?.enProceso)}</span> en proceso
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--amber)', fontSize: 13 }}>{n(stats?.odts?.pendientes)}</span> pendientes
                </span>
                {!isLoading && stats?.odts?.urgentes > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--red)', fontSize: 13 }}>{stats.odts.urgentes}</span> urgentes
                  </span>
                )}
              </div>
              <button onClick={() => navigate('/taller')} style={{ fontSize: 11, color: 'var(--green-600)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Ver todas →</button>
            </div>
            {(stats?.talleres ?? []).map(t => <TallerBar key={t.tipo} {...t} max={maxTaller} />)}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            {canWriteTaller && <ActionRow icon="plusCircle" label="Nueva OT" onClick={() => navigate('/taller/nueva')} />}
            {/* Registrar es escribir: solo_lectura veia el boton porque este
                ActionRow no tenia el guard que si tienen sus vecinos. */}
            {canWriteTaller && <ActionRow icon="edit" label="Registrar Bitácora" onClick={() => navigate('/bitacora-taller')} />}
            {canWriteTaller && <ActionRow icon="package" label="Excepciones de Taller" onClick={() => navigate('/excepciones-taller')} />}
            <ActionRow icon="layers" label="Historial Materiales" onClick={() => navigate('/historial-materiales')} />
          </SectionCard>
        )}

        {show.bodega && (
          <SectionCard title="Bodega Inventario" icon="warehouse">
            <StockRow label="Stock Crítico / 0" icon="alertTriangle"
              critico={inv.critico ?? 0} sinStock={inv.sinStock ?? 0} onClick={() => navigate('/bodega?filtro=critico')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="warehouse" label="Mantención productos" onClick={() => navigate('/bodega')} />
            {canWriteBodega && <ActionRow icon="plusCircle" label="Ingreso Mercadería" onClick={() => navigate('/stock-ingresos')} />}
            <ActionRow icon="tag" label="Consulta Precios" onClick={() => navigate('/consulta-precios')} />
            {canReadDespacho && <ActionRow icon="truck" label="Despachos" onClick={() => navigate('/despachos')} />}
            <ActionRow icon="users" label="Proveedores" badge={n(proveedores.total)} badgeTone="neutral" onClick={() => navigate('/proveedores')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="alertTriangle" label="Sin Código Barra" badge={cal.sinCodigoBarra} badgeTone={cal.sinCodigoBarra > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_codigo_barra')} />
            <ActionRow icon="alertTriangle" label="Sin Código Interno" badge={cal.sinCodigoInterno} badgeTone={cal.sinCodigoInterno > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_codigo_interno')} />
            <ActionRow icon="alertTriangle" label="Sin Categoría" badge={cal.sinCategoria} badgeTone={cal.sinCategoria > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_categoria')} />
            <ActionRow icon="alertTriangle" label="Sin Proveedor" badge={cal.sinProveedor} badgeTone={cal.sinProveedor > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_proveedor')} />
          </SectionCard>
        )}

        {show.taller && (
          <SectionCard title="Bodega Taller" icon="box">
            <StockRow label="Stock Crítico / 0" icon="alertTriangle"
              critico={tal.critico ?? 0} sinStock={tal.sinStock ?? 0} onClick={() => navigate('/bodega?tab=taller&filtro=critico')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            {canReadCatalogo && <ActionRow icon="box" label="Mantención productos" onClick={() => navigate('/bodega?tab=taller')} />}
            <ActionRow icon="layers" label="Telas" onClick={() => navigate('/telas')} />
            <ActionRow icon="box" label="Bodega Taller" onClick={() => navigate('/bodega-taller')} />
          </SectionCard>
        )}

        {show.ventas && (
          <SectionCard title="Ventas" icon="shoppingCart">
            <ActionRow icon="grid" label="Matriz Ventas" onClick={() => navigate('/matriz-ventas')} />
            <ActionRow icon="dollarSign" label="Ventas No Pagadas" badge={n(stats?.ventas?.noPagadas)} badgeTone="red" onClick={() => navigate('/matriz-ventas?noPagada=1')} />
            <ActionRow icon="truck" label="Pendientes Entrega" badge={n(stats?.ventas?.pendienteEntrega)} badgeTone="blue" onClick={() => navigate('/matriz-ventas?pendienteEntrega=1')} />
            <ActionRow icon="cloud" label="Cotizaciones Web" badge={n(webPend)} badgeTone={webPend > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/ordenes-compra?estado=Pendiente')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            {canWriteVentas && <ActionRow icon="plusCircle" label="Nueva Venta Sala" onClick={() => navigate('/ventas/nueva')} />}
            {canWriteVentas && <ActionRow icon="clipboard" label="Nueva Licitación" onClick={() => navigate('/crm/nueva/licitacion')} />}
            <ActionRow icon="briefcase" label="Convenio Marco" onClick={() => navigate('/ventas?tipo=convenio-marco')} />
            {can(user, 'reportes') && <ActionRow icon="fileText" label="Reporte de Licitaciones" onClick={() => navigate('/reportes/gerenciales')} />}
            {canReadCatalogo && <ActionRow icon="tag" label="Consulta Precios" onClick={() => navigate('/consulta-precios')} />}
          </SectionCard>
        )}

        {(show.crm || show.clientes) && (
          <SectionCard title="CRM & Clientes" icon="phone">
            {show.crm && (
              <div style={{ padding: '4px 14px 8px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--amber)', fontSize: 13 }}>{n(crm.pendientes)}</span> pendientes
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--blue)', fontSize: 13 }}>{n(crm.enGestion)}</span> en gestión
                  </span>
                  {!isLoading && crm.altaPrioridad > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--red)', fontSize: 13 }}>{crm.altaPrioridad}</span> alta
                    </span>
                  )}
                </div>
              </div>
            )}
            {show.crm && <ActionRow icon="phone" label="Ver CRM" onClick={() => navigate('/crm')} />}
            {canReadClientes && <ActionRow icon="users" label="Clientes" onClick={() => navigate('/clientes')} />}
            {canWriteClientes && <ActionRow icon="plusCircle" label="Nuevo Cliente" onClick={() => navigate('/clientes/nuevo')} />}
          </SectionCard>
        )}

        {show.cobranza && (
          <SectionCard title="Cobranza & Pagos Proveedores" icon="dollarSign">
            {canReadVentas && <ActionRow icon="dollarSign" label="Menú Cobranza" onClick={() => navigate('/cobranza')} />}
            {canWriteProveedores && <ActionRow icon="plusCircle" label="Nueva Boleta/Factura Prov." onClick={() => navigate('/pagos-proveedores')} />}
            {canReadProveedores && <ActionRow icon="alertTriangle" label="Facturas No Pagadas" badge={n(provPagos.facturasNoPagadas)} badgeTone={provPagos.facturasNoPagadas > 0 ? 'red' : 'neutral'} onClick={() => navigate('/pagos-proveedores?doc=Factura&estado=Pendiente')} />}
            {canReadProveedores && <ActionRow icon="alertTriangle" label="Boletas No Pagadas" badge={n(provPagos.boletasNoPagadas)} badgeTone={provPagos.boletasNoPagadas > 0 ? 'red' : 'neutral'} onClick={() => navigate('/pagos-proveedores?doc=Boleta&estado=Pendiente')} />}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            {canReadCaja && <ActionRow icon="creditCard" label="Caja Movimientos" onClick={() => navigate('/caja')} />}
            {canReadVentas && <ActionRow icon="fileText" label="Ordenes Compra Online" onClick={() => navigate('/ordenes-compra')} />}
          </SectionCard>
        )}

        {show.admin && (
          <SectionCard title="Administración" icon="settings">
            <ActionRow icon="tag" label="Reglas de Descuento" onClick={() => navigate('/descuentos')} />
            <ActionRow icon="users" label="Usuarios" onClick={() => navigate('/usuarios')} />
            <ActionRow icon="settings" label="Configuración" onClick={() => navigate('/config')} />
            <ActionRow icon="user" label="RRHH Trabajadores" onClick={() => navigate('/rrhh')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="alertTriangle" label="Integridad de Datos" onClick={() => navigate('/admin/integridad')} />
            <ActionRow icon="fileText" label="Auditoría de Actividad" onClick={() => navigate('/admin/auditoria')} />
          </SectionCard>
        )}
      </div>

      <div style={{ marginTop: 28, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Plastimar ERP · Sucursal 5 Oriente</span>
        {!isLoading && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {(inv.total ?? 0).toLocaleString('es-CL')} productos inventario · {(tal.total ?? 0).toLocaleString('es-CL')} en taller
          </span>
        )}
      </div>
    </main>
  )
}
