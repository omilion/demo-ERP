import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Btn } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { EmitirDteModal } from '../../components/facturacion/DteModals'
import { toast } from '../../store/notif'

const emptyItem = () => ({ nombre: '', cantidad: 1, precioUnitario: 0, exento: false })

const inputStyle = { width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box' }

export default function EmitirManualPage() {
  const navigate = useNavigate()
  const [receptor, setReceptor] = useState({ rut: '', razonSocial: '', giro: '', direccion: '', comuna: '', ciudad: '' })
  const [items, setItems] = useState([emptyItem()])
  const [showModal, setShowModal] = useState(false)

  const setField = (field, value) => setReceptor(r => ({ ...r, [field]: value }))
  const updateItem = (index, patch) => setItems(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  const addItem = () => setItems(rows => [...rows, emptyItem()])
  const removeItem = index => setItems(rows => rows.filter((_, i) => i !== index))

  const itemsValidos = items.filter(item => item.nombre.trim() && Number(item.cantidad) > 0)
  const puedeContinuar = itemsValidos.length > 0

  // EmitirDteModal solo necesita un objeto "venta" con cliente + items en la
  // forma que ya usa el resto del sistema (mapVentaItems/buildReceptor) — se
  // arma uno sintetico en vez de duplicar el modal para el caso sin venta.
  const ventaSintetica = {
    id: null,
    clienteId: null,
    cliente: receptor,
    items: itemsValidos.map((item, index) => ({
      id: `manual-${index}`,
      nombre: item.nombre.trim(),
      cantidad: Number(item.cantidad),
      // precioUnitario se interpreta CON IVA incluido salvo exento (ver mapVentaItems).
      precioUnitario: Number(item.precioUnitario),
      exento: item.exento,
    })),
  }

  return (
    <main className="page">
      <PageHeader title="Emitir documento" subtitle="Factura o boleta sin venta asociada" breadcrumb={['Inicio', 'Facturación', 'Emitir documento']} />

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 760 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Receptor</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
          <FormField label="RUT"><Input value={receptor.rut} onChange={v => setField('rut', v)} placeholder="Ej: 12345678-9 (vacío = consumidor final)" /></FormField>
          <FormField label="Razón social / Nombre"><Input value={receptor.razonSocial} onChange={v => setField('razonSocial', v)} /></FormField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <FormField label="Giro"><Input value={receptor.giro} onChange={v => setField('giro', v)} /></FormField>
          <FormField label="Dirección"><Input value={receptor.direccion} onChange={v => setField('direccion', v)} /></FormField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <FormField label="Comuna"><Input value={receptor.comuna} onChange={v => setField('comuna', v)} /></FormField>
          <FormField label="Ciudad"><Input value={receptor.ciudad} onChange={v => setField('ciudad', v)} /></FormField>
        </div>

        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Ítems</div>
        {items.map((item, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 1fr 0.6fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
            <div>
              {index === 0 && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Nombre</label>}
              <input value={item.nombre} onChange={e => updateItem(index, { nombre: e.target.value })} style={inputStyle} placeholder="Producto o servicio" />
            </div>
            <div>
              {index === 0 && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Cant.</label>}
              <input type="number" min="1" value={item.cantidad} onChange={e => updateItem(index, { cantidad: e.target.value })} style={inputStyle} />
            </div>
            <div>
              {index === 0 && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Precio {item.exento ? '' : '(con IVA)'}</label>}
              <input type="number" min="0" value={item.precioUnitario} onChange={e => updateItem(index, { precioUnitario: e.target.value })} style={inputStyle} />
            </div>
            <div>
              {index === 0 && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Exento</label>}
              <input type="checkbox" checked={item.exento} onChange={e => updateItem(index, { exento: e.target.checked })} style={{ width: 18, height: 18, marginTop: 6 }} />
            </div>
            <button type="button" onClick={() => removeItem(index)} disabled={items.length === 1} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: items.length === 1 ? 'not-allowed' : 'pointer', opacity: items.length === 1 ? 0.4 : 1, fontSize: 13, padding: '9px 4px' }}>×</button>
          </div>
        ))}
        <button type="button" onClick={addItem} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, fontSize: 13, padding: 0, marginBottom: 20 }}>
          + Agregar ítem
        </button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" onClick={() => navigate('/facturacion/documentos')}>Cancelar</Btn>
          <Btn variant="primary" disabled={!puedeContinuar} onClick={() => setShowModal(true)}>Continuar a emisión</Btn>
        </div>
      </div>

      {showModal && (
        <EmitirDteModal
          venta={ventaSintetica}
          onClose={() => setShowModal(false)}
          onSuccess={({ emitido, documento }) => {
            setShowModal(false)
            toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`)
            navigate('/facturacion/documentos')
          }}
        />
      )}
    </main>
  )
}
