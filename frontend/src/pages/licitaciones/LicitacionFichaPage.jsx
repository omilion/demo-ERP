import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Btn } from '../../components/shared'
import { useCotizacion } from '../../api/cotizaciones'
import { plazoLabel } from '../../utils/licitacionFields'

const fmt = n => '$ ' + Number(n || 0).toLocaleString('es-CL')
const fallbackImg = '/legacy-img/no_foto_chica.jpg'

function fmtDate(value, withTime = false) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('es-CL', withTime ? { hour: '2-digit', minute: '2-digit' } : undefined)
}

function itemImage(item) {
  return item.fotoUrlGrande || item.fotoUrl || fallbackImg
}

export default function LicitacionFichaPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useCotizacion(id)

  useEffect(() => {
    if (!data) return
    const timer = setTimeout(() => window.print(), 250)
    return () => clearTimeout(timer)
  }, [data])

  if (isLoading) return <main style={{ padding: 24 }}>Cargando...</main>
  if (!data) return <main style={{ padding: 24 }}>No encontrada</main>

  const items = data.items || []
  const neto = items.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.precio || 0), 0)
  const iva = Math.round(neto * 0.19)
  const total = neto + iva
  const cliente = data.cliente || {}

  return (
    <main style={{ background: '#f3f4f6', minHeight: '100vh', padding: '24px 0' }}>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          main { padding: 0 !important; background: #fff !important; }
          .ficha { box-shadow: none !important; border: 0 !important; width: 100% !important; }
        }
      `}</style>

      <div className="no-print" style={{ maxWidth: 920, margin: '0 auto 12px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="secondary" size="sm" onClick={() => navigate(`/licitaciones/${data.id}`)}>Volver</Btn>
        <Btn variant="primary" size="sm" icon="printer" onClick={() => window.print()}>Imprimir ficha</Btn>
      </div>

      <section className="ficha" style={{ width: 860, margin: '0 auto', background: '#fff', border: '2px solid #d1d5db', boxShadow: 'var(--shadow-md)', color: '#111827', fontFamily: 'Verdana, Geneva, sans-serif', fontSize: 12 }}>
        <header style={{ textAlign: 'center', padding: '18px 22px 10px' }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 1, color: '#064e3b' }}>PLASTIMAR</div>
          <div style={{ marginTop: 10, fontSize: 18 }}>FICHA TECNICA Y ECONOMICA ID: <strong>{data.idLicitacion || data.id}</strong></div>
          <div style={{ marginTop: 18, textAlign: 'right' }}>Fecha: {fmtDate(data.fecha)}</div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: '230px 1fr 220px', gap: 16, padding: '8px 18px 14px', borderBottom: '1px solid #111' }}>
          <div style={{ border: '1px solid #cbd5e1', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#075985', textAlign: 'center', padding: 12 }}>
            Licitacion Plastimar
          </div>
          <div>
            <Info label="Razon Social" value={cliente.razonSocial || cliente.nombre || '-'} />
            <Info label="Rut" value={cliente.rut || data.rutCliente || '-'} />
            <Info label="Unidad de compra" value={cliente.giro || '-'} />
            <Info label="Region" value={cliente.region || '-'} />
            <Info label="Comuna" value={cliente.comuna || cliente.ciudad || '-'} />
            <Info label="Referencia" value={data.referencia || '-'} />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <Info label="Plazo licitación" value={plazoLabel(data)} />
            <Info label="Plazo límite" value={fmtDate(data.fechaPlazo)} />
            <Info label="Envíos parciales" value={data.enviosParciales ? 'Permitido' : 'No'} />
            <Info label="Monto despacho" value={fmt(data.montoDespacho)} />
            <Info label="Ejecutivo(a)" value={data.usuario || '-'} />
            <Info label="Creacion" value={fmtDate(data.fechaCreacion, true)} />
          </div>
        </section>

        <section style={{ padding: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {['Item', 'Nombre', 'Cant.', 'Descripcion del producto', 'Foto referencial', 'Valor Unit Neto', 'Totales Netos'].map((header, index) => (
                  <th key={header} style={{ border: '1px solid #111', background: '#7dd3fc', padding: 6, width: [44, 140, 52, 210, 130, 105, 115][index], textAlign: 'center' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id || index}>
                  <td style={tdCenter}>{index + 1}</td>
                  <td style={td}>{item.nombre || item.codigoInterno || '-'}</td>
                  <td style={tdCenter}>{item.cantidad || 0}</td>
                  <td style={td}>{item.descripcion || '-'}</td>
                  <td style={tdCenter}>
                    <img src={itemImage(item)} alt="" style={{ width: 90, height: 90, objectFit: 'contain' }} onError={e => { e.currentTarget.src = fallbackImg }} />
                  </td>
                  <td style={tdCenter}>{fmt(item.precio)}</td>
                  <td style={tdCenter}>{fmt(Number(item.precio || 0) * Number(item.cantidad || 0))}</td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan={7} style={{ ...tdCenter, padding: 18 }}>Sin productos cotizados</td></tr>
              )}
            </tbody>
          </table>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 140px', marginTop: 14, rowGap: 6 }}>
            <div />
            <strong>TOTAL NETO</strong>
            <strong style={totalCell}>{fmt(neto)}</strong>
            <div />
            <strong>IVA</strong>
            <strong style={totalCell}>{fmt(iva)}</strong>
            <div />
            <strong>TOTAL</strong>
            <strong style={totalCell}>{fmt(total)}</strong>
          </div>
        </section>

        {data.obs && (
          <section style={{ padding: '8px 20px 18px', whiteSpace: 'pre-wrap' }}>
            {data.obs}
          </section>
        )}

        <footer style={{ textAlign: 'center', padding: '14px 20px 18px', borderTop: '1px solid #d1d5db', lineHeight: 1.45 }}>
          Plastimar Ltda.<br />
          www.plastimar.cl<br />
          Telefonos: 032-2699514 - 032-2711383<br />
          Casa Matriz 5 Oriente 134, Vina del Mar
        </footer>
      </section>
    </main>
  )
}

function Info({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '126px 1fr', gap: 8, marginBottom: 5 }}>
      <strong>{label}:</strong>
      <span>{value}</span>
    </div>
  )
}

const td = { border: '1px solid #111', padding: 6, verticalAlign: 'middle', wordBreak: 'break-word' }
const tdCenter = { ...td, textAlign: 'center' }
const totalCell = { border: '1px solid #111', textAlign: 'right', padding: '6px 10px' }
