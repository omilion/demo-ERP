import { useState, useRef } from 'react'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { Btn } from '../../components/shared'
import { toast } from '../../store/notif'
import { useRegistrarAbonoProveedor, uploadComprobantePago } from '../../api/pagosProveedores'

const BANCOS_CHILE = [
  'BancoEstado',
  'Banco de Chile',
  'Banco Santander',
  'BCI',
  'Scotiabank',
  'Banco Itaú',
  'Banco BICE',
  'Banco Security',
  'Banco Falabella',
  'Banco Ripley',
  'Banco Consorcio',
  'Otro',
]

const MEDIOS_BANCO = [
  'Transferencia',
  'Cheque',
  'Tarjeta de Débito',
  'Tarjeta de Crédito',
  'Vale Vista',
]

const MEDIOS_CAJA = [
  'Efectivo',
  'Tarjeta de Débito',
]

const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')

export default function ModalRegistrarAbono({ pago, onClose, onSuccess }) {
  const registrarMut = useRegistrarAbonoProveedor()
  const fileInputRef = useRef(null)

  const saldoNum = Number(pago?.saldo || 0)
  const [monto, setMonto] = useState(saldoNum > 0 ? String(saldoNum) : '')
  const [origenFondos, setOrigenFondos] = useState('Banco')
  const [medioPago, setMedioPago] = useState('Transferencia')
  const [bancoOrigen, setBancoOrigen] = useState('BancoEstado')
  const [numeroOperacion, setNumeroOperacion] = useState('')
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [comprobanteUrl, setComprobanteUrl] = useState('')
  const [uploadingFile, setUploadingFile] = useState(false)

  const handleOrigenChange = (newOrigen) => {
    setOrigenFondos(newOrigen)
    if (newOrigen === 'Caja') {
      setMedioPago('Efectivo')
    } else {
      setMedioPago('Transferencia')
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFile(true)
    try {
      const res = await uploadComprobantePago(file)
      setComprobanteUrl(res.url)
      toast.success('Comprobante adjuntado correctamente')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir comprobante')
    } finally {
      setUploadingFile(false)
    }
  }

  const handleSubmit = (e) => {
    e?.preventDefault?.()
    const montoNum = Number(monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return toast.warning('Ingrese un monto válido mayor a $0')
    }
    if (montoNum > saldoNum) {
      return toast.warning(`El monto (${fmt(montoNum)}) no puede superar el saldo pendiente (${fmt(saldoNum)})`)
    }

    const payload = {
      monto: montoNum,
      origenFondos,
      medioPago,
      bancoOrigen: origenFondos === 'Banco' ? bancoOrigen : null,
      numeroOperacion: origenFondos === 'Banco' ? numeroOperacion : null,
      fechaPago,
      obs: obs.trim() || null,
      comprobanteUrl: comprobanteUrl || null,
    }

    registrarMut.mutate({ id: pago.id, data: payload }, {
      onSuccess: (res) => {
        toast.success(`Pago de ${fmt(montoNum)} registrado con éxito`)
        onSuccess?.(res)
        onClose?.()
      },
      onError: (err) => {
        toast.error(err.response?.data?.error || 'Error al registrar pago')
      },
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 540,
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden', border: '1px solid var(--border)',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
              Registrar Pago a Proveedor
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {pago?.documento} {pago?.nDoc ? `N° ${pago.nDoc}` : `#${pago?.id}`} — {pago?.proveedor?.nombre || 'Proveedor'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 18, color: 'var(--text-3)', padding: 4, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Resumen de Saldo */}
        <div style={{
          background: 'var(--bg-subtle, #f8fafc)', padding: '12px 20px',
          borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Total Doc</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{fmt(pago?.total)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Pagado</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-700, #15803d)' }}>{fmt(pago?.montoPagado)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Saldo Pendiente</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber-700, #b45309)' }}>{fmt(pago?.saldo)}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          {/* Botones de atajo de monto */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setMonto(String(saldoNum))}
              style={{
                flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 600,
                borderRadius: 6, border: '1px solid var(--border)',
                background: monto === String(saldoNum) ? 'var(--blue-50, #eff6ff)' : '#fff',
                color: monto === String(saldoNum) ? 'var(--blue-700, #1d4ed8)' : 'var(--text-2)',
                cursor: 'pointer',
              }}
            >
              Pagar saldo total ({fmt(saldoNum)})
            </button>
            {saldoNum > 1000 && (
              <button
                type="button"
                onClick={() => setMonto(String(Math.round(saldoNum / 2)))}
                style={{
                  flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 600,
                  borderRadius: 6, border: '1px solid var(--border)',
                  background: monto === String(Math.round(saldoNum / 2)) ? 'var(--blue-50, #eff6ff)' : '#fff',
                  color: monto === String(Math.round(saldoNum / 2)) ? 'var(--blue-700, #1d4ed8)' : 'var(--text-2)',
                  cursor: 'pointer',
                }}
              >
                Pagar 50% ({fmt(Math.round(saldoNum / 2))})
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Monto a pagar" required>
              <Input
                type="number"
                prefix="$"
                value={monto}
                onChange={setMonto}
                placeholder="0"
                min="1"
                max={saldoNum}
                autoFocus
              />
            </FormField>

            <FormField label="Fecha de Pago" required>
              <Input
                type="date"
                value={fechaPago}
                onChange={setFechaPago}
              />
            </FormField>
          </div>

          {/* Selector de Origen de Fondos */}
          <div style={{ marginTop: 12 }}>
            <FormField label="Origen de Fondos" required>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  borderRadius: 6, border: `1px solid ${origenFondos === 'Banco' ? 'var(--primary, #2563eb)' : 'var(--border)'}`,
                  background: origenFondos === 'Banco' ? 'var(--blue-50, #eff6ff)' : '#fff', cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="origenFondos"
                    value="Banco"
                    checked={origenFondos === 'Banco'}
                    onChange={() => handleOrigenChange('Banco')}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Banco / Transferencia</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>No requiere turno de caja</div>
                  </div>
                </label>

                <label style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  borderRadius: 6, border: `1px solid ${origenFondos === 'Caja' ? 'var(--primary, #2563eb)' : 'var(--border)'}`,
                  background: origenFondos === 'Caja' ? 'var(--blue-50, #eff6ff)' : '#fff', cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="origenFondos"
                    value="Caja"
                    checked={origenFondos === 'Caja'}
                    onChange={() => handleOrigenChange('Caja')}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Caja Local (Efectivo)</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Genera egreso en turno</div>
                  </div>
                </label>
              </div>
            </FormField>
          </div>

          {/* Alerta explicativa si es Caja */}
          {origenFondos === 'Caja' && (
            <div style={{
              margin: '10px 0', padding: '10px 12px', borderRadius: 6,
              background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontSize: 12,
            }}>
              💡 <strong>Impacto en Tesorería:</strong> Se registrará un egreso inmediato en el turno de caja abierto del usuario autenticado.
            </div>
          )}

          {/* Campos específicos de Banco */}
          {origenFondos === 'Banco' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <FormField label="Banco de Origen">
                <Select
                  value={bancoOrigen}
                  onChange={setBancoOrigen}
                  options={BANCOS_CHILE.map(b => ({ value: b, label: b }))}
                />
              </FormField>

              <FormField label="N° Operación / Transf.">
                <Input
                  value={numeroOperacion}
                  onChange={setNumeroOperacion}
                  placeholder="Ej: 19482745"
                />
              </FormField>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <FormField label="Medio de Pago">
                <Select
                  value={medioPago}
                  onChange={setMedioPago}
                  options={MEDIOS_CAJA.map(m => ({ value: m, label: m }))}
                />
              </FormField>
            </div>
          )}

          {/* Adjuntar Comprobante */}
          <div style={{ marginTop: 12 }}>
            <FormField label="Comprobante de Pago (PDF / Imagen)">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  style={{ display: 'none' }}
                />
                <Btn
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon="upload"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                >
                  {uploadingFile ? 'Subiendo...' : (comprobanteUrl ? 'Cambiar Comprobante' : 'Adjuntar Comprobante')}
                </Btn>
                {comprobanteUrl && (
                  <span style={{ fontSize: 12, color: 'var(--green-700)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    ✓ Adjunto listo
                  </span>
                )}
              </div>
            </FormField>
          </div>

          <div style={{ marginTop: 12 }}>
            <FormField label="Observaciones">
              <Textarea
                value={obs}
                onChange={setObs}
                placeholder="Glosa o detalle del pago (opcional)"
                rows={2}
              />
            </FormField>
          </div>

          {/* Footer Actions */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16,
            borderTop: '1px solid var(--border)',
          }}>
            <Btn type="button" variant="secondary" onClick={onClose} disabled={registrarMut.isPending}>
              Cancelar
            </Btn>
            <Btn type="submit" variant="primary" disabled={registrarMut.isPending || uploadingFile}>
              {registrarMut.isPending ? 'Registrando...' : `Confirmar Pago de ${fmt(Number(monto) || 0)}`}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  )
}
