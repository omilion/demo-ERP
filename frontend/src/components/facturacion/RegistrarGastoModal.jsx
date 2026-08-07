import { useState } from 'react'
import { FormField, Input, Select, Textarea } from '../forms'
import { Btn, Icon } from '../shared'
import { useProveedores } from '../../api/proveedores'
import { useCreatePagoProveedor } from '../../api/pagosProveedores'
import { toast } from '../../store/notif'

// Centro de costo: reusa el mismo campo `bodega` de PagoProveedor que ya
// distingue lo que afecta stock (Inventario/Materias/Taller) de lo que no
// (ver STOCK_BODEGAS en StockIngresosPage.jsx) — no se crea un catalogo
// paralelo, solo se agrupan esos mismos valores bajo las 3 etiquetas que
// pidio Bodega: Materias Primas / Mercadería / Gastos.
const CENTROS = [
  { value: 'Materias', label: 'Materias Primas' },
  { value: 'Inventario', label: 'Mercadería' },
  { value: 'Gastos', label: 'Gastos' },
]
const GASTO_SUBTIPOS = [
  { value: 'GAdministrativos', label: 'Gastos administrativos' },
  { value: 'GOperacionales', label: 'Gastos operacionales' },
  { value: 'GMantencion', label: 'Gastos de mantención' },
  { value: 'GTransporte', label: 'Gastos de transporte' },
]
const DOCUMENTOS = ['Factura', 'Boleta', 'Nota']
const normalizarRut = value => String(value || '').replace(/[^0-9kK]/g, '').toUpperCase()
const inferDocumento = tipoDte => [56, 61].includes(Number(tipoDte)) ? 'Nota' : [39, 41].includes(Number(tipoDte)) ? 'Boleta' : 'Factura'

export default function RegistrarGastoModal({ recibido, onClose, onSuccess }) {
  const [centro, setCentro] = useState('Gastos')
  const [gastoSubtipo, setGastoSubtipo] = useState('GAdministrativos')
  const [documento, setDocumento] = useState(inferDocumento(recibido.tipoDte))
  const [nDoc, setNDoc] = useState(recibido.folio ? String(recibido.folio) : '')
  const [fechaDoc, setFechaDoc] = useState(recibido.fechaEmision ? String(recibido.fechaEmision).slice(0, 10) : '')
  const [total, setTotal] = useState(String(recibido.totales?.total ?? ''))
  const [obs, setObs] = useState('')
  // Arranca buscando por el RUT del emisor para auto-matchear el proveedor
  // ya existente; si el usuario cambia la busqueda a mano, autoMatchDone
  // corta el intento automatico para no pisarle la seleccion.
  const [proveedorSearch, setProveedorSearch] = useState(recibido.rutEmisor || '')
  const [proveedorId, setProveedorId] = useState('')
  const [autoMatchDone, setAutoMatchDone] = useState(!recibido.rutEmisor)
  const [error, setError] = useState('')
  const crear = useCreatePagoProveedor()

  const { data: proveedores = { items: [] }, isSuccess: proveedoresListos } = useProveedores(proveedorSearch ? { search: proveedorSearch } : {})
  // Ajuste de estado durante el render (no en un efecto): recien cuando la
  // busqueda inicial por RUT realmente resuelve (isSuccess, no el fallback
  // {items:[]} del primer render) se intenta el match automatico, una vez.
  if (!autoMatchDone && proveedoresListos) {
    const match = (proveedores.items || []).find(p => normalizarRut(p.rut) === normalizarRut(recibido.rutEmisor))
    if (match) setProveedorId(String(match.id))
    setAutoMatchDone(true)
  }
  const proveedorEncontrado = (proveedores.items || []).find(p => String(p.id) === proveedorId)

  const bodega = centro === 'Gastos' ? gastoSubtipo : centro

  const confirmar = async () => {
    if (!proveedorId) { setError('Selecciona el proveedor.'); return }
    if (!nDoc.trim()) { setError('Indica el N° de documento.'); return }
    const totalNum = Number(total)
    if (!Number.isFinite(totalNum) || totalNum < 0) { setError('Indica un monto total válido.'); return }
    setError('')
    try {
      const result = await crear.mutateAsync({
        documento,
        nDoc: nDoc.trim(),
        proveedorId: Number(proveedorId),
        bodega,
        estado: 'Pendiente',
        total: totalNum,
        fechaDoc: fechaDoc || undefined,
        obs: obs.trim() || undefined,
        documentoRecibidoId: recibido.id,
        ingresaStock: false,
        detalles: [],
      })
      toast.success(`Registrado como ${CENTROS.find(c => c.value === centro)?.label || centro}.`)
      onSuccess?.(result)
    } catch (cause) {
      setError(cause?.response?.data?.error || 'No se pudo registrar el documento.')
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'oklch(0 0 0 / .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={event => event.stopPropagation()} style={{ background: '#fff', width: 520, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', borderRadius: 12, boxShadow: '0 16px 48px oklch(0 0 0 / .2)' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Asignar Centro de Costo</div>
            <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 12 }}>{recibido.razonSocialEmisor || 'Sin emisor'} · {recibido.rutEmisor || 'sin RUT'}</div>
          </div>
          <button onClick={onClose} title="Cerrar" style={{ padding: 4, color: 'var(--text-3)' }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Centro de Costo / Asiento</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {CENTROS.map(c => (
                <button key={c.value} type="button" onClick={() => setCentro(c.value)} style={{
                  padding: '10px 8px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: centro === c.value ? '2px solid var(--blue)' : '1px solid var(--border)',
                  background: centro === c.value ? 'var(--blue-50)' : '#fff', color: 'var(--text)',
                }}>{c.label}</button>
              ))}
            </div>
            {centro === 'Gastos' && (
              <div style={{ marginTop: 10 }}>
                <Select value={gastoSubtipo} onChange={setGastoSubtipo} options={GASTO_SUBTIPOS} />
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
            <FormField label="Proveedor" required>
              {proveedorEncontrado ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1, padding: 9, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', fontSize: 13 }}>{proveedorEncontrado.nombre}</div>
                  <button type="button" onClick={() => { setProveedorId(''); setProveedorSearch('') }} style={{ border: 0, background: 'none', color: 'var(--blue)', fontSize: 12, cursor: 'pointer' }}>Cambiar</button>
                </div>
              ) : (
                <>
                  <Input value={proveedorSearch} onChange={setProveedorSearch} placeholder="Buscar por nombre o RUT..." />
                  {proveedorSearch.length >= 2 && (
                    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, maxHeight: 140, overflowY: 'auto' }}>
                      {(proveedores.items || []).length ? proveedores.items.map(p => (
                        <button key={p.id} type="button" onClick={() => setProveedorId(String(p.id))} style={{ display: 'block', width: '100%', padding: '8px 10px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                          <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{p.rut || 'sin RUT'}</div>
                        </button>
                      )) : <div style={{ padding: 10, color: 'var(--text-3)', fontSize: 12 }}>Sin resultados.</div>}
                    </div>
                  )}
                </>
              )}
            </FormField>
            <FormField label="Tipo de documento"><Select value={documento} onChange={setDocumento} options={DOCUMENTOS} /></FormField>
            <FormField label="N° Documento" required><Input value={nDoc} onChange={setNDoc} /></FormField>
            <FormField label="Fecha"><Input type="date" value={fechaDoc} onChange={setFechaDoc} /></FormField>
            <FormField label="Total" required><Input type="number" value={total} onChange={setTotal} prefix="$" /></FormField>
          </div>
          <FormField label="Observación"><Textarea value={obs} onChange={setObs} rows={2} placeholder="Opcional" /></FormField>
          {error && <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" icon="check" onClick={confirmar} disabled={crear.isPending}>{crear.isPending ? 'Registrando...' : 'Registrar'}</Btn>
        </div>
      </div>
    </div>
  )
}
