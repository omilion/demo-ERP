import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useVenta } from '../../api/ventas'

const fmtDate = d => d ? new Date(d).toLocaleDateString('es-CL', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'
const fmtTime = d => d ? new Date(d).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''

export default function VentaBodegaPrintPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: venta, isLoading } = useVenta(Number(id))

  useEffect(() => {
    if (venta && !isLoading) {
      const t = setTimeout(() => window.print(), 350)
      return () => clearTimeout(t)
    }
  }, [venta, isLoading])

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', fontSize: 14 }}>Cargando datos de bodega…</div>
  if (!venta) return <div style={{ padding: 40, textAlign: 'center', fontSize: 14 }}>Venta no encontrada</div>

  const odts = venta.odts || []
  const odtItemsPorProducto = new Map()
  for (const odt of odts) {
    for (const odtItem of odt.items || []) {
      const key = odtItem.productoId
      if (key) {
        if (!odtItemsPorProducto.has(key)) odtItemsPorProducto.set(key, [])
        odtItemsPorProducto.get(key).push({ ...odtItem, odtId: odt.id, odtTipo: odt.tipo, odtEstado: odt.estado })
      }
      if (odtItem.codigoInterno) {
        const codKey = `code:${odtItem.codigoInterno.trim().toUpperCase()}`
        if (!odtItemsPorProducto.has(codKey)) odtItemsPorProducto.set(codKey, [])
        odtItemsPorProducto.get(codKey).push({ ...odtItem, odtId: odt.id, odtTipo: odt.tipo, odtEstado: odt.estado })
      }
    }
  }

  const getOdtsForItem = (item) => {
    const byId = odtItemsPorProducto.get(item.productoId) || []
    if (byId.length > 0) return byId
    const cod = (item.codigoInterno || item.producto?.codigoInterno || '').trim().toUpperCase()
    if (cod) return odtItemsPorProducto.get(`code:${cod}`) || []
    return []
  }

  const items = venta.items || []
  const despachos = (venta.despachos || []).filter(d => !d.eliminado)
  const primerDespacho = despachos[0] || null

  // Determinar la dirección de entrega priorizando datos específicos de despacho
  const direccionEntrega = primerDespacho?.direccionDestino ||
    primerDespacho?.direccion ||
    venta.direccionDespacho ||
    venta.clienteSucursal?.direccion ||
    venta.cliente?.direccion ||
    '—'

  const comunaEntrega = primerDespacho?.comunaDestino ||
    primerDespacho?.comuna ||
    venta.comunaDespacho ||
    venta.clienteSucursal?.comuna ||
    venta.cliente?.comuna ||
    '—'

  const contactoEntrega = primerDespacho?.destinatario ||
    primerDespacho?.contacto ||
    venta.contactoDespacho ||
    venta.cliente?.nombre ||
    venta.cliente?.razonSocial ||
    '—'

  const telefonoEntrega = primerDespacho?.telefono ||
    venta.telefonoDespacho ||
    venta.cliente?.telefono ||
    '—'

  const tipoEnvio = primerDespacho?.tipoEnvio || primerDespacho?.transporte || venta.tipoDespacho || 'Despacho interno / Bodega'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 32px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111', background: '#fff' }}>
      <style>{`
        @media print {
          @page { margin: 10mm; size: portrait; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Botonera superior sólo visible en pantalla */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
        <button
          onClick={() => window.history.back()}
          style={{ padding: '7px 14px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
        >
          ← Volver
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => window.print()}
            style={{ padding: '8px 18px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
          >
            🖨️ Imprimir Hoja de Bodega
          </button>
        </div>
      </div>

      {/* Encabezado del Documento */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0d9488', paddingBottom: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: -0.5, color: '#0f766e' }}>PLASTIMAR</div>
          <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.8, color: '#111827', marginTop: 2 }}>
            HOJA DE PREPARACIÓN Y DESPACHO (BODEGA / TALLER)
          </div>
          <div style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>
            Documento operativo interno · Excluye información financiera
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280' }}>N° Venta Interna</div>
          <div style={{ fontWeight: 800, fontSize: 22, fontFamily: "'DM Mono', monospace", color: '#111827' }}>
            #{venta.nInterno || venta.id}
          </div>
          <div style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>
            Fecha: <b>{fmtDate(venta.createdAt)}</b> {fmtTime(venta.createdAt)}
          </div>
        </div>
      </div>

      {/* Bloque de Información: Cliente y Destino de Despacho */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 14, marginBottom: 16 }}>
        {/* Cliente */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', background: '#f9fafb' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#4b5563', marginBottom: 6, borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>
            1. Datos del Cliente
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>
            {venta.cliente?.razonSocial || venta.cliente?.nombre || 'Cliente sin nombre'}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151', marginTop: 2 }}>
            RUT: {venta.rutCliente || venta.cliente?.rut || '—'}
          </div>
          <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
            <b>Vendedor:</b> {venta.creadorNombre || '—'}
          </div>
          {venta.licitacion && (
            <div style={{ fontSize: 11, color: '#0369a1', marginTop: 2, fontWeight: 600 }}>
              OC / Licitación: {venta.licitacion}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>
            <b>Tipo Venta:</b> {venta.tipo || 'Venta'}
          </div>
        </div>

        {/* Destino de Despacho / Entrega destacado */}
        <div style={{ border: '2px solid #0d9488', borderRadius: 8, padding: '10px 14px', background: '#f0fdfa' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#0f766e', marginBottom: 6, borderBottom: '1px solid #ccfbf1', paddingBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>2. Lugar y Destino de Despacho / Entrega</span>
            <span style={{ fontWeight: 700, color: '#115e59' }}>{tipoEnvio}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: '#374151' }}>Dirección:</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>{direccionEntrega}</span>

            <span style={{ fontWeight: 700, color: '#374151' }}>Comuna / Ciudad:</span>
            <span style={{ color: '#111827' }}>{comunaEntrega}</span>

            <span style={{ fontWeight: 700, color: '#374151' }}>Contacto / Recibe:</span>
            <span style={{ color: '#111827' }}>{contactoEntrega}</span>

            <span style={{ fontWeight: 700, color: '#374151' }}>Teléfono:</span>
            <span style={{ color: '#111827', fontFamily: 'monospace' }}>{telefonoEntrega}</span>
          </div>
          {venta.plazoEntregaDias != null && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#0f766e', fontWeight: 600 }}>
              ⏱️ Plazo Comprometido: {venta.plazoEntregaDias} días {venta.plazoEntregaTipo || 'corridos'}
            </div>
          )}
        </div>
      </div>

      {/* Tabla de Productos para Bodega */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#111827', marginBottom: 6 }}>
          3. Detalle de Productos a Preparar y Despachar ({items.length} ítems)
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, border: '1px solid #d1d5db' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #9ca3af' }}>
              <th style={{ padding: '6px 4px', textAlign: 'center', width: 28, fontWeight: 700, color: '#374151' }}>Nº</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', width: 90, fontWeight: 700, color: '#374151' }}>Código</th>
              <th style={{ padding: '6px 6px', textAlign: 'right', width: 50, fontWeight: 700, color: '#111' }}>Cant.</th>
              <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#111' }}>Producto y Especificaciones</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', width: 85, fontWeight: 700, color: '#374151' }}>Ubicación</th>
              <th style={{ padding: '6px 6px', textAlign: 'right', width: 50, fontWeight: 700, color: '#374151' }}>Stock</th>
              <th style={{ padding: '6px 6px', textAlign: 'right', width: 55, fontWeight: 700, color: '#166534' }}>Entreg.</th>
              <th style={{ padding: '6px 6px', textAlign: 'right', width: 55, fontWeight: 700, color: '#9a3412' }}>Pend.</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', width: 140, fontWeight: 700, color: '#374151' }}>Estado Taller / OT</th>
              <th style={{ padding: '6px 4px', textAlign: 'center', width: 34, fontWeight: 700, color: '#374151' }}>Check</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const odtList = getOdtsForItem(item)
              const stockVal = item.producto?.stock
              const pendiente = item.cantidad - (item.nEntregados ?? 0)

              return (
                <tr key={item.id || i} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                  {/* 1. Nº */}
                  <td style={{ padding: '6px 4px', textAlign: 'center', fontFamily: 'monospace', color: '#6b7280', fontWeight: 600 }}>
                    {i + 1}
                  </td>

                  {/* 2. Código */}
                  <td style={{ padding: '6px 8px', textAlign: 'left', fontFamily: 'monospace', fontWeight: 700, color: '#111' }}>
                    {item.producto?.codigoInterno || item.codigoInterno || '—'}
                  </td>

                  {/* 3. Cant. */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: '#111' }}>
                    {item.cantidad}
                  </td>

                  {/* 4. Producto & Requerimientos */}
                  <td style={{ padding: '6px 10px', textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, color: '#111827', fontSize: 12 }}>
                      {item.producto?.nombre || item.nombre || `Producto #${item.productoId}`}
                    </div>
                    {item.descripcion && (
                      <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, border: '1px solid #e5e7eb', lineHeight: 1.3 }}>
                        <b>Esp:</b> {item.descripcion}
                      </div>
                    )}
                  </td>

                  {/* 5. Ubicación */}
                  <td style={{ padding: '6px 8px', textAlign: 'left', fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: '#1e40af' }}>
                    {item.producto?.ubicacion || item.ubicacion || '—'}
                  </td>

                  {/* 6. Stock */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', color: stockVal <= 0 ? '#dc2626' : '#4b5563' }}>
                    {stockVal !== undefined && stockVal !== null ? stockVal : '—'}
                  </td>

                  {/* 7. Entregados */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#166534', fontWeight: 600 }}>
                    {item.nEntregados ?? 0}
                  </td>

                  {/* 8. Pendiente */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: pendiente > 0 ? '#b45309' : '#166534' }}>
                    {pendiente}
                  </td>

                  {/* 9. Estado Taller */}
                  <td style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10 }}>
                    {odtList.length > 0 ? (
                      odtList.map((oi, idx) => {
                        const listo = oi.estado === 'Listo' || oi.estado === 'listo'
                        const tallerNom = (oi.talleres || []).map(t => t.nombreTaller).filter(Boolean).join(', ') || oi.odtTipo || 'Taller'
                        return (
                          <div key={idx} style={{ lineHeight: 1.3, marginBottom: 2 }}>
                            <b>OT #{oi.odtId}</b> ({tallerNom}): <span style={{ color: listo ? '#166534' : '#b45309', fontWeight: 700 }}>{listo ? 'Listo' : 'Pendiente'}</span>
                          </div>
                        )
                      })
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>

                  {/* 10. Check */}
                  <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                    <div style={{ width: 14, height: 14, border: '1.5px solid #6b7280', borderRadius: 3, margin: '0 auto' }} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Observaciones de la venta / despacho */}
      {venta.observaciones && (
        <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', marginBottom: 16, background: '#fffbeb' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#92400e', marginBottom: 3 }}>
            ⚠️ Observaciones e Instrucciones Especiales
          </div>
          <div style={{ fontSize: 11, color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
            {venta.observaciones}
          </div>
        </div>
      )}

      {/* Cuadros de Firma y Control */}
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <div style={{ border: '1px solid #9ca3af', borderRadius: 6, padding: 8, height: 85, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#4b5563', textAlign: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 2 }}>
            Preparado en Bodega
          </div>
          <div style={{ borderTop: '1px dashed #9ca3af', paddingTop: 3, fontSize: 9, color: '#6b7280', textAlign: 'center' }}>
            Nombre / Firma / Fecha
          </div>
        </div>

        <div style={{ border: '1px solid #9ca3af', borderRadius: 6, padding: 8, height: 85, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#4b5563', textAlign: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 2 }}>
            Control Calidad / Taller
          </div>
          <div style={{ borderTop: '1px dashed #9ca3af', paddingTop: 3, fontSize: 9, color: '#6b7280', textAlign: 'center' }}>
            Nombre / Firma / Fecha
          </div>
        </div>

        <div style={{ border: '1px solid #9ca3af', borderRadius: 6, padding: 8, height: 85, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#4b5563', textAlign: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 2 }}>
            Despacho / Chofer
          </div>
          <div style={{ borderTop: '1px dashed #9ca3af', paddingTop: 3, fontSize: 9, color: '#6b7280', textAlign: 'center' }}>
            Patente / Nombre / Firma
          </div>
        </div>

        <div style={{ border: '1px solid #9ca3af', borderRadius: 6, padding: 8, height: 85, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#4b5563', textAlign: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 2 }}>
            Recepción Conforme
          </div>
          <div style={{ borderTop: '1px dashed #9ca3af', paddingTop: 3, fontSize: 9, color: '#6b7280', textAlign: 'center' }}>
            Nombre / RUT / Firma
          </div>
        </div>
      </div>
    </div>
  )
}
