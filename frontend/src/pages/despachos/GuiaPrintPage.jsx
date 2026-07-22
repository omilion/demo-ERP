import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useGuiaDetalle } from '../../api/despachos'

const fmtDate = d => d ? new Date(d).toLocaleDateString('es-CL') : '—'

export default function GuiaPrintPage() {
  const { id } = useParams()
  const { data, isLoading } = useGuiaDetalle(Number(id))

  useEffect(() => {
    if (data && !isLoading) {
      const t = setTimeout(() => window.print(), 300)
      return () => clearTimeout(t)
    }
  }, [data, isLoading])

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', fontSize: 14 }}>Cargando…</div>
  if (!data?.guia) return <div style={{ padding: 40, textAlign: 'center', fontSize: 14 }}>Guía no encontrada</div>

  const { guia, despacho, orden, items } = data
  const cliente = orden?.cliente

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 28, fontFamily: 'system-ui, sans-serif', color: '#111', background: '#fff' }}>
      <style>{`@media print { @page { margin: 12mm } body { -webkit-print-color-adjust: exact } .no-print { display: none } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 22 }}>Plastimar</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>Guía de despacho</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#555' }}>N° Guía</div>
          <div style={{ fontWeight: 700, fontSize: 20, fontFamily: 'monospace' }}>{guia.nGuia || guia.id}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{fmtDate(guia.fechaGuia)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#777', marginBottom: 4 }}>Cliente</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{cliente?.razonSocial || cliente?.nombre || '—'}</div>
          <div style={{ fontSize: 12, color: '#444', fontFamily: 'monospace' }}>{orden?.rutCliente || '—'}</div>
          {(despacho?.direccion || cliente?.direccion) && <div style={{ fontSize: 11, color: '#555' }}>{despacho?.direccion || cliente?.direccion}</div>}
          {(despacho?.region || despacho?.comuna) && <div style={{ fontSize: 11, color: '#555' }}>{[despacho?.comuna, despacho?.region].filter(Boolean).join(', ')}</div>}
          {despacho?.contacto && <div style={{ fontSize: 11, color: '#555' }}>Contacto: {despacho.contacto}</div>}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#777', marginBottom: 4 }}>Despacho</div>
          <div style={{ fontSize: 12 }}>N° Interno venta: <b>{orden?.nInterno || '—'}</b></div>
          <div style={{ fontSize: 12 }}>Transporte: {despacho?.transporte || 'Por confirmar'}</div>
          {despacho?.numeroSeguimiento && <div style={{ fontSize: 12 }}>N° Seguimiento: {despacho.numeroSeguimiento}</div>}
          {!despacho && <div style={{ fontSize: 12, color: '#a00' }}>Sin despacho asignado todavía</div>}
          {guia.origen && <div style={{ fontSize: 12 }}>Origen: {guia.origen}</div>}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18, fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={th}>Código</th>
            <th style={th}>Producto</th>
            <th style={{ ...th, textAlign: 'right' }}>Cantidad enviada</th>
          </tr>
        </thead>
        <tbody>
          {items.length ? items.map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ ...td, fontFamily: 'monospace' }}>{item.codigoInterno || '—'}</td>
              <td style={td}>{item.nombre}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{item.enviado}</td>
            </tr>
          )) : (
            <tr><td colSpan={3} style={{ ...td, textAlign: 'center', color: '#777' }}>Sin ítems registrados para esta guía</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 40 }}>
        <div style={{ borderTop: '1px solid #111', paddingTop: 6, fontSize: 11, color: '#555', textAlign: 'center' }}>Firma quien envía</div>
        <div style={{ borderTop: '1px solid #111', paddingTop: 6, fontSize: 11, color: '#555', textAlign: 'center' }}>Firma quien recibe</div>
      </div>

      <div className="no-print" style={{ textAlign: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px dashed #ccc' }}>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Imprimir</button>
      </div>
    </div>
  )
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #ccc' }
const td = { padding: '7px 10px' }
