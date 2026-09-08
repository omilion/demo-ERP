import { Link } from 'react-router-dom'
import { useCrmOrdenLink } from '../../api/crm'

export function CrmOrdenBanner({ item, detalle, style = {} }) {
  const crmId = item?.id || detalle?.id
  const { data: ordenLink } = useCrmOrdenLink(crmId, Boolean(crmId))
  const orden = ordenLink?.orden || detalle?.orden || item?.orden

  const etapa = String(item?.etapaComercial || item?.estado || detalle?.etapaComercial || detalle?.estado || '').toUpperCase()
  const isCerrado = etapa === 'CERRADO' || etapa === '3'
  const resultado = item?.resultadoCierre || detalle?.resultadoCierre
  const isGanada = resultado === 'GANADO' || (isCerrado && resultado !== 'PERDIDO')

  if (!orden && !isGanada) return null

  const nroOrden = orden?.nInterno ? `#${orden.nInterno}` : (orden?.id ? `#${orden.id}` : null)

  return (
    <div
      style={{
        padding: '14px 20px',
        background: isGanada
          ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'
          : '#f8fafc',
        borderBottom: '1px solid var(--border)',
        borderTop: isGanada ? '1px solid #bbf7d0' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
        ...style,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isGanada && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: '#16a34a',
                color: '#ffffff',
                fontSize: 10,
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: 999,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                boxShadow: '0 1px 3px rgba(22, 163, 74, 0.25)',
              }}
            >
              ✓ Ganada
            </span>
          )}
          <span
            style={{
              fontSize: isGanada ? 15 : 13,
              fontWeight: 750,
              color: isGanada ? '#14532d' : 'var(--text-1)',
              letterSpacing: -0.2,
            }}
          >
            {isGanada ? 'Cotización ganada asignada a orden:' : 'Cotización vinculada a orden:'}
          </span>
          {nroOrden && (
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontWeight: 800,
                fontSize: isGanada ? 16 : 13,
                color: isGanada ? '#15803d' : 'var(--text-1)',
                background: isGanada ? '#ffffff' : '#f1f5f9',
                padding: '2px 9px',
                borderRadius: 6,
                border: isGanada ? '1.5px solid #86efac' : '1px solid var(--border)',
                boxShadow: isGanada ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              {nroOrden}
            </span>
          )}
        </div>

        {orden && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, flexWrap: 'wrap' }}>
            <span
              style={{
                background: isGanada ? '#ffffff' : '#e2e8f0',
                color: 'var(--text-2)',
                padding: '2px 7px',
                borderRadius: 4,
                fontWeight: 600,
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              {orden.estado || 'Activa'}
            </span>
            <span
              style={{
                background: orden.estadoPago === 'Pagada' ? '#dcfce7' : '#fef3c7',
                color: orden.estadoPago === 'Pagada' ? '#166534' : '#92400e',
                padding: '2px 7px',
                borderRadius: 4,
                fontWeight: 650,
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              Pago: {orden.estadoPago || 'No pagada'}
            </span>
            <span
              style={{
                background: orden.estadoEntrega === 'Entregado' ? '#dcfce7' : '#dbeafe',
                color: orden.estadoEntrega === 'Entregado' ? '#166534' : '#1e40af',
                padding: '2px 7px',
                borderRadius: 4,
                fontWeight: 650,
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              Entrega: {orden.estadoEntrega || 'Pendiente entrega'}
            </span>
          </div>
        )}
      </div>

      {(orden?.id || item?.ordenId) && (
        <Link
          to={`/ventas/${orden?.id || item?.ordenId}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#15803d',
            color: '#ffffff',
            padding: '9px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 2px 6px rgba(21, 128, 61, 0.3)',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#166534'
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(21, 128, 61, 0.4)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#15803d'
            e.currentTarget.style.transform = 'none'
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(21, 128, 61, 0.3)'
          }}
        >
          <span>Ir a la venta</span>
          <span style={{ fontSize: 15, lineHeight: 1 }}>→</span>
        </Link>
      )}
    </div>
  )
}
