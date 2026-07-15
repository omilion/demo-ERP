import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm } from '../../components/forms/index'
import { Badge, Btn, Icon } from '../../components/shared'
import { useVenta, useCreateVenta, useUpdateVenta, useAnularVenta, useActivarVenta, useVentaCargos, useAddCargo, useDeleteCargo, useUpdateItemEntregados } from '../../api/ventas'
import { useAuthStore } from '../../store/auth'
import { useClientes, useClienteSucursales } from '../../api/clientes'
import { FormCliente } from '../../components/forms/FormCliente'
import { useProductos } from '../../api/productos'
import { useRegiones, useComunas } from '../../api/locations'
import { useUsuarios } from '../../api/usuarios'
import { useMultas, useCreateMulta, useDeleteMulta } from '../../api/multas'
import { useCrearDocumentoVenta } from '../../api/caja'
import { useDescuentos, useEvaluarDescuentos, useSolicitarDescuento, useSolicitudesDescuento } from '../../api/descuentos'
import { can, canAny } from '../../utils/permissions'
import { PRODUCT_PLACEHOLDER_IMAGE, useProductPlaceholderOnError } from '../../utils/assets'

const DOCUMENTOS_VENTA = ['Factura Plast', 'Factura Laura', 'Boleta Electronica', 'NC Plast', 'NC Laura', 'NC Inter Plast', 'ND Plast', 'ND Laura']

const TIPOS = ['Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']
const TIPO_DEFAULT = 'Venta Sala'

function isConvenioMarco(tipo) {
  return normalizeText(tipo) === 'convenio marco'
}

function isNormalDiscountTipo(tipo) {
  const text = normalizeText(tipo)
  return text === 'normal' || text === 'venta sala' || text === 'venta web' || text === 'venta directa'
}

function defaultPrecioUnitario(producto, tipoVenta) {
  if (!isConvenioMarco(tipoVenta)) return Number(producto.consultaPrecios?.precioNormalSalaVentaIva ?? producto.precioLista ?? 0)
  const precioMarco = Number(producto.consultaPrecios?.precioConvMarco ?? producto.precioMarco ?? producto.precioLista ?? 0)
  return precioMarco > 0 ? Math.round(precioMarco * 1.19) : 0
}

function ProductoSearch({ onAdd, tipoVenta, disabled = false }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const inputRef = useRef()

  const { data: result } = useProductos(!disabled && q.length >= 2 ? { search: q } : {})
  const productos = result?.items ?? []

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(p) {
    if (disabled) return
    onAdd(p)
    setQ('')
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}>
          <Icon name="search" size={14} />
        </span>
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(!disabled) }}
          onFocus={() => !disabled && q.length >= 2 && setOpen(true)}
          disabled={disabled}
          placeholder="Buscar producto por codigo, nombre o ID Marco... (minimo 2 caracteres)"
          style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: disabled ? 'var(--bg)' : '#fff', color: disabled ? 'var(--text-3)' : 'inherit', boxSizing: 'border-box', cursor: disabled ? 'not-allowed' : 'text' }}
          onKeyDown={e => e.key === 'Escape' && setOpen(false)}
        />
      </div>
      {!disabled && open && q.length >= 2 && productos.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', maxHeight: 260, overflowY: 'auto' }}>
          {productos.slice(0, 15).map(p => (
            <button key={p.id} onClick={() => select(p)}
              style={{ display: 'flex', width: '100%', padding: '9px 14px', gap: 10, textAlign: 'left', background: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: 'none', borderRight: 'none', borderTop: 'none', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--green-50)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {p.fotoUrl
                ? <img src={p.fotoUrl} alt="" loading="lazy" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }} onError={useProductPlaceholderOnError} />
                : <img src={PRODUCT_PLACEHOLDER_IMAGE} alt="" loading="lazy" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }} onError={useProductPlaceholderOnError} />}
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--text-3)', flexShrink: 0, paddingTop: 2, minWidth: 80 }}>{p.codigoInterno}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  Stock: <strong style={{ color: p.stock > 0 ? 'var(--green-600)' : 'var(--red)' }}>{p.stock}</strong>
                  {!p.precioLista && defaultPrecioUnitario(p, tipoVenta) > 0 && <span> - Lista: <strong>${defaultPrecioUnitario(p, tipoVenta).toLocaleString('es-CL')}</strong></span>}
                  {p.precioLista > 0 && <span> · Lista: <strong>${p.precioLista.toLocaleString('es-CL')}</strong></span>}
                  {isConvenioMarco(tipoVenta) && defaultPrecioUnitario(p, tipoVenta) > 0 && <span> · Marco + IVA: <strong>${defaultPrecioUnitario(p, tipoVenta).toLocaleString('es-CL')}</strong></span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {!disabled && open && q.length >= 2 && productos.length === 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-3)' }}>
          Sin resultados para "{q}"
        </div>
      )}
    </div>
  )
}

function ItemsTable({ items, onChange, locked = false, isLicitacion = false }) {
  function update(idx, field, value) {
    if (locked) return
    onChange(items.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }
  function remove(idx) {
    if (locked) return
    onChange(items.filter((_, i) => i !== idx))
  }
  // En licitacion los campos de nombre/descripcion son editables (override solo para esa venta).
  const fieldsEditable = isLicitacion && !locked

  const subtotal = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0), 0)

  if (items.length === 0) return (
    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>
      Busca y agrega productos con el buscador de arriba
    </div>
  )

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {[['Producto', 'left', ''], ['SKU', 'left', '120px'], ['Descripción', 'left', '220px'], ['Cant.', 'right', '80px'], ['P. Unit.', 'right', '130px'], ['Subtotal', 'right', '120px'], ['', 'center', '36px']].map(([h, align, w], i) => (
              <th key={i} style={{ padding: '8px ' + (i === 0 ? '12px' : '8px'), textAlign: align, fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4, width: w || 'auto' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const sub = (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0)
            return (
              <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <img src={item.fotoUrl || PRODUCT_PLACEHOLDER_IMAGE} alt="" loading="lazy" onError={useProductPlaceholderOnError}
                      style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--border)', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {fieldsEditable ? (
                        <input value={item.nombre || ''} onChange={e => update(idx, 'nombre', e.target.value)} placeholder="Nombre"
                          style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, background: '#fff' }} />
                      ) : (
                        <div style={{ fontWeight: 500 }}>{item.nombre}</div>
                      )}
                      {Number(item.nEntregados || 0) > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--green-700)', marginTop: 2 }}>Entregados: {item.nEntregados}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                  {fieldsEditable ? (
                    <input value={item.codigoInterno || ''} onChange={e => update(idx, 'codigoInterno', e.target.value)} placeholder="SKU"
                      style={{ width: '100%', padding: '5px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", background: '#fff' }} />
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{item.codigoInterno || '—'}</span>
                  )}
                </td>
                <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                  {fieldsEditable ? (
                    <textarea value={item.descripcion || ''} onChange={e => update(idx, 'descripcion', e.target.value)} placeholder="Descripción" rows={2}
                      style={{ width: '100%', padding: '5px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', background: '#fff', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.3 }} />
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'normal' }}>{item.descripcion || '—'}</span>
                  )}
                </td>
                <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                  <input type="number" min="1" value={item.cantidad} onChange={e => update(idx, 'cantidad', e.target.value)} disabled={locked}
                    style={{ width: '100%', padding: '5px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right', background: locked ? 'var(--bg)' : '#fff', color: locked ? 'var(--text-2)' : 'inherit', cursor: locked ? 'not-allowed' : 'text' }} />
                </td>
                <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                  <input type="number" min="0" value={item.precioUnitario} onChange={e => update(idx, 'precioUnitario', e.target.value)} disabled={locked}
                    style={{ width: '100%', padding: '5px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right', background: locked ? 'var(--bg)' : '#fff', color: locked ? 'var(--text-2)' : 'inherit', cursor: locked ? 'not-allowed' : 'text' }} />
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600, verticalAlign: 'top' }}>
                  ${sub.toLocaleString('es-CL')}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                  <button onClick={() => remove(idx)} disabled={locked} title={locked ? 'Productos bloqueados por entregas, pagos o documentos registrados' : 'Quitar producto'} style={{ padding: '4px', borderRadius: 4, border: 'none', background: 'none', cursor: locked ? 'not-allowed' : 'pointer', color: 'var(--text-3)', opacity: locked ? 0.45 : 1 }}
                    onMouseEnter={e => { if (!locked) e.currentTarget.style.color = 'var(--red)' }}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
            <td colSpan={5} style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right', color: 'var(--text-2)' }}>Subtotal</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 14 }}>${subtotal.toLocaleString('es-CL')}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function requiredNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return NaN
  return Number(value)
}

function normalizeItems(items, { withOverrides = false } = {}) {
  return items.map(i => ({
    productoId: requiredNumber(i.productoId),
    cantidad: requiredNumber(i.cantidad),
    precioUnitario: requiredNumber(i.precioUnitario),
    // Overrides de nombre/descripcion/SKU solo en licitacion (no modifican el producto base).
    ...(withOverrides ? { nombre: i.nombre || undefined, descripcion: i.descripcion || undefined, codigoInterno: i.codigoInterno || undefined } : {}),
  }))
}

function validateItems(items) {
  if (items.length === 0) return 'Agrega al menos un producto a la venta'

  const normalized = normalizeItems(items)
  const invalidIndex = normalized.findIndex(i =>
    !Number.isInteger(i.productoId) || i.productoId <= 0 ||
    !Number.isInteger(i.cantidad) || i.cantidad <= 0 ||
    !Number.isFinite(i.precioUnitario) || i.precioUnitario < 0
  )

  if (invalidIndex >= 0) return `Revisa producto, cantidad y precio del item ${invalidIndex + 1}`

  return null
}

function hasDeliveredItems(venta) {
  return (venta?.items || []).some(item => Number(item.nEntregados) > 0)
}

function hasFinancialTrace(venta) {
  if (!venta) return false
  if (Number(venta.abono || 0) > 0) return true
  if (venta.estadoPago && venta.estadoPago !== 'No pagada') return true
  return (venta.pagos || []).some(p => !p.eliminado)
}

function discountAmount(subtotal, pct) {
  return Math.round(Number(subtotal || 0) * Number(pct || 0) / 100)
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function discountApiError(error, fallback = 'No fue posible procesar descuentos') {
  return error?.response?.data?.error || fallback
}

function money(value) {
  return '$' + Number(value || 0).toLocaleString('es-CL')
}

function normalizeRuleValue(rule) {
  const value = firstDefined(rule.valor, rule.porcentaje, rule.descuentoPct, rule.valorDescuento)
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeRuleStatus(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeEvaluatedRule(rule, defaults = {}, idx = 0) {
  const estado = normalizeRuleStatus(firstDefined(rule.estado, rule.status, defaults.estado, ''))
  const isPending = estado === 'PENDIENTE'
  const isRejected = estado === 'RECHAZADA'
  const isAuthorized = estado === 'AUTORIZADA'
  const requiresApproval = Boolean(firstDefined(
    rule.requiereAprobacion,
    rule.requiere_aprobacion,
    rule.requiresApproval,
    defaults.requiereAprobacion,
    false
  )) || isPending
  const disponibleRaw = firstDefined(rule.disponible, rule.aplicable, rule.aprobada, defaults.disponible)
  return {
    id: firstDefined(rule.id, rule.reglaId, rule.codigo, defaults.id, `regla-${idx}`),
    codigo: firstDefined(rule.codigo, rule.code, ''),
    nombre: firstDefined(rule.nombre, rule.name, rule.titulo, defaults.nombre, `Regla ${idx + 1}`),
    descripcion: firstDefined(rule.descripcion, rule.description, rule.motivo, rule.razon, ''),
    valor: normalizeRuleValue(rule),
    tipoDescuento: firstDefined(rule.tipoDescuento, rule.tipo_descuento, rule.modo, defaults.tipoDescuento, 'porcentaje'),
    montoDescuento: firstDefined(rule.montoDescuento, rule.descuentoMonto, null),
    totalConDescuento: firstDefined(rule.totalConDescuento, rule.totalFinal, null),
    requiereAprobacion: requiresApproval,
    estado,
    disponible: isAuthorized ? true : isPending || isRejected ? false : disponibleRaw === undefined ? !requiresApproval : Boolean(disponibleRaw),
    origen: defaults.origen || rule.origen || 'regla',
  }
}

function normalizeEvaluacionDescuentos(result) {
  const grupos = []
  const add = (items, defaults) => {
    if (Array.isArray(items)) grupos.push(...items.map((item, idx) => normalizeEvaluatedRule(item, defaults, grupos.length + idx)))
  }

  if (Array.isArray(result)) add(result, {})
  else {
    add(result?.disponibles, { disponible: true })
    add(result?.aplicables, { disponible: true })
    add(result?.reglasDisponibles, { disponible: true })
    add(result?.solicitables, { requiereAprobacion: true, disponible: false })
    add(result?.requierenAprobacion, { requiereAprobacion: true, disponible: false })
    add(result?.requiereAprobacion, { requiereAprobacion: true, disponible: false })
    if (!grupos.length) add(result?.items, {})
    if (!grupos.length) add(result?.reglas, {})
  }

  const seen = new Set()
  return grupos.filter(rule => {
    const key = `${rule.id || ''}-${rule.codigo || ''}-${rule.nombre}-${rule.valor}`
    if (seen.has(key)) return false
    seen.add(key)
    return rule.valor !== null
  })
}

function legacyDiscountRules(catalogo, tipoVenta) {
  const catalogKey = isConvenioMarco(tipoVenta) ? 'marco' : isNormalDiscountTipo(tipoVenta) ? 'normales' : null
  if (!catalogKey) return []
  return (catalogo?.[catalogKey] || []).map(item => ({
    id: `legacy-${catalogKey}-${item.id ?? item.valor}`,
    codigo: 'LEGACY',
    nombre: `Catalogo autorizado ${item.valor}%`,
    descripcion: catalogKey === 'marco' ? 'Porcentaje autorizado para Convenio Marco' : 'Porcentaje autorizado para venta normal',
    valor: Number(item.valor),
    tipoDescuento: 'porcentaje',
    requiereAprobacion: false,
    disponible: true,
    origen: 'legacy',
  }))
}

function buildVentaDiscountPayload({ venta, items, subtotal, cargosTotal, totalBase }) {
  return {
    origen: 'venta',
    tipoVenta: venta.tipo,
    clienteId: venta.clienteId ? Number(venta.clienteId) : null,
    clienteSucursalId: venta.clienteSucursalId ? Number(venta.clienteSucursalId) : null,
    licitacion: venta.licitacion || null,
    subtotal,
    cargosTotal,
    totalBase,
    descuentoPctActual: Number(venta.descuentoPct || 0),
    items: normalizeItems(items).map((item, idx) => ({
      ...item,
      nombre: items[idx]?.nombre,
      codigoInterno: items[idx]?.codigoInterno,
    })),
  }
}

function buildVentaDiscountKey({ venta, items, cargosTotal }) {
  return JSON.stringify({
    tipo: venta.tipo || 'Normal',
    clienteId: venta.clienteId ? Number(venta.clienteId) : null,
    clienteSucursalId: venta.clienteSucursalId ? Number(venta.clienteSucursalId) : null,
    licitacion: venta.licitacion || null,
    cargosTotal: Number(cargosTotal || 0),
    items: normalizeItems(items).map((item, idx) => ({
      productoId: item.productoId ?? null,
      codigoInterno: items[idx]?.codigoInterno || '',
      cantidad: Number(item.cantidad || 0),
      precioUnitario: Number(item.precioUnitario || 0),
    })),
  })
}

function DescuentosDisponiblesPanel({ venta, items, subtotal, cargosTotal, totalBase, catalogo, selectedRule, onSelect, disabled = false }) {
  const evaluar = useEvaluarDescuentos()
  const solicitar = useSolicitarDescuento()
  const solicitudesQuery = useSolicitudesDescuento(items.length > 0)
  const [evaluacion, setEvaluacion] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const hasContext = items.length > 0 && totalBase > 0
  const payload = buildVentaDiscountPayload({ venta, items, subtotal, cargosTotal, totalBase })
  const evaluatedRules = normalizeEvaluacionDescuentos(evaluacion)
  const legacyRules = legacyDiscountRules(catalogo, venta.tipo)
  const rules = evaluatedRules.length ? evaluatedRules : legacyRules
  const usingLegacy = !evaluatedRules.length && legacyRules.length > 0
  const solicitudes = Array.isArray(solicitudesQuery.data) ? solicitudesQuery.data : []

  function findSolicitud(rule, estados) {
    const draftHash = evaluacion?.draftHash
    if (!draftHash || rule.origen === 'legacy') return null
    return solicitudes.find(solicitud => {
      const estado = String(solicitud.estado || '').toUpperCase()
      const hash = solicitud.resultadoSnapshot?.draftHash || solicitud.contextoSnapshot?.draftHash
      const pct = Number(solicitud.descuentoPctAprobado ?? solicitud.descuentoPctSolicitado ?? solicitud.resultadoSnapshot?.porcentaje ?? 0)
      return estados.includes(estado) &&
        hash === draftHash &&
        Number(solicitud.reglaId || 0) === Number(rule.id || 0) &&
        Number(rule.valor || 0) === pct
    }) || null
  }

  function montoSolicitud(solicitud, fallback) {
    return firstDefined(
      solicitud?.descuentoMontoAprobado,
      solicitud?.descuentoMontoSolicitado,
      solicitud?.resultadoSnapshot?.montoDescuento,
      fallback
    )
  }

  function evaluate() {
    if (!hasContext) return
    setError('')
    setMessage('')
    evaluar.mutate(payload, {
      onSuccess: data => setEvaluacion(data),
      onError: err => {
        setEvaluacion(null)
        setError(discountApiError(err, 'No fue posible evaluar reglas. Se muestra el catalogo autorizado si aplica.'))
      },
    })
  }

  useEffect(() => {
    if (!hasContext) {
      const timer = setTimeout(() => setEvaluacion(null), 0)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => evaluate(), 450)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasContext, venta.tipo, venta.clienteId, venta.clienteSucursalId, venta.licitacion, venta.descuentoPct, subtotal, cargosTotal, totalBase, items])

  function applyRule(rule) {
    if (disabled || rule.requiereAprobacion || rule.disponible === false) return
    if (rule.origen === 'legacy') {
      onSelect(rule)
      setMessage(`Regla aplicada: ${rule.nombre}`)
      return
    }
    if (rule.autorizacionId) {
      onSelect(rule)
      setMessage('Autorizacion aprobada aplicada al borrador')
      return
    }
    setError('')
    setMessage('')
    solicitar.mutate({
      ...payload,
      origenTipo: 'venta',
      reglaId: rule.id,
      reglaCodigo: rule.codigo || null,
      reglaNombre: rule.nombre,
      descuentoPct: rule.valor,
      porcentaje: rule.valor,
      descuentoPctSolicitado: rule.valor,
    }, {
      onSuccess: res => {
        onSelect({ ...rule, autorizacionId: res?.solicitud?.id })
        setMessage('Regla autorizada y aplicada al borrador')
      },
      onError: err => setError(discountApiError(err, 'No se pudo autorizar la regla')),
    })
  }

  async function requestRule(rule) {
    if (disabled) return
    const motivo = await promptDialog({ title: 'Motivo de solicitud de descuento' })
    if (motivo === null) return
    setError('')
    setMessage('')
    solicitar.mutate({
      ...payload,
      origenTipo: 'venta',
      reglaId: String(rule.id).startsWith('legacy-') ? null : rule.id,
      reglaCodigo: rule.codigo || null,
      reglaNombre: rule.nombre,
      descuentoPct: rule.valor,
      porcentaje: rule.valor,
      descuentoPctSolicitado: rule.valor,
      motivo: motivo.trim() || undefined,
    }, {
      onSuccess: () => setMessage('Solicitud de descuento enviada'),
      onError: err => setError(discountApiError(err, 'No se pudo enviar la solicitud')),
    })
  }

  return (
    <section style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Reglas de descuento disponibles</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Evaluacion comercial sobre {money(totalBase)}</div>
        </div>
        <Btn variant="secondary" size="sm" icon="refreshCw" onClick={evaluate} disabled={!hasContext || evaluar.isPending}>
          {evaluar.isPending ? 'Evaluando...' : 'Evaluar'}
        </Btn>
      </div>
      <div style={{ padding: 14 }}>
        {!hasContext && <div style={discountEmpty}>Agrega productos para evaluar reglas.</div>}
        {hasContext && error && (
          <div style={{ ...discountNotice, background: 'var(--amber-bg)', color: 'var(--text-2)' }}>
            {error}
          </div>
        )}
        {hasContext && message && (
          <div style={{ ...discountNotice, background: 'var(--green-50)', color: 'var(--green-700)' }}>
            {message}
          </div>
        )}
        {hasContext && usingLegacy && (
          <div style={{ ...discountNotice, background: 'var(--bg)', color: 'var(--text-3)' }}>
            Mostrando catalogo autorizado como respaldo.
          </div>
        )}
        {hasContext && rules.length === 0 && !evaluar.isPending && <div style={discountEmpty}>Sin reglas disponibles para esta venta.</div>}
        {hasContext && rules.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {rules.map(rule => {
              const approvedSolicitud = findSolicitud(rule, ['AUTORIZADA'])
              const pendingSolicitud = findSolicitud(rule, ['PENDIENTE'])
              const actionableRule = approvedSolicitud
                ? {
                    ...rule,
                    autorizacionId: approvedSolicitud.id,
                    estado: 'AUTORIZADA',
                    disponible: true,
                    requiereAprobacion: false,
                    montoDescuento: montoSolicitud(approvedSolicitud, rule.montoDescuento),
                  }
                : rule
              const selected = selectedRule?.id === actionableRule.id && (!actionableRule.autorizacionId || selectedRule?.autorizacionId === actionableRule.autorizacionId)
              const canApply = !disabled && actionableRule.disponible !== false && !actionableRule.requiereAprobacion && actionableRule.estado !== 'RECHAZADA'
              const canRequest = !disabled && !pendingSolicitud && actionableRule.estado !== 'RECHAZADA' && (rule.requiereAprobacion || rule.disponible === false) && rule.origen !== 'legacy'
              return (
                <article key={rule.id} style={{ border: `1px solid ${selected ? 'var(--green-600)' : 'var(--border)'}`, borderRadius: 8, padding: 10, background: selected ? 'var(--green-50)' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{rule.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{rule.descripcion || rule.codigo || 'Regla comercial'}</div>
                    </div>
                    <strong style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, color: 'var(--green-700)' }}>{rule.valor}%</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <Badge tone={rule.origen === 'legacy' ? 'gray' : 'blue'}>{rule.origen === 'legacy' ? 'Catalogo' : 'Regla'}</Badge>
                    {actionableRule.estado && <Badge tone={actionableRule.estado === 'AUTORIZADA' ? 'green' : actionableRule.estado === 'PENDIENTE' ? 'amber' : 'red'}>{actionableRule.estado}</Badge>}
                    {pendingSolicitud && <Badge tone="amber">Solicitud enviada</Badge>}
                    {actionableRule.montoDescuento != null && <Badge tone="green">{money(actionableRule.montoDescuento)}</Badge>}
                    {rule.requiereAprobacion && !approvedSolicitud && <Badge tone="amber">Solicitar</Badge>}
                    {selected && <Badge tone="green">Seleccionada</Badge>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
                    {canRequest && <Btn variant="secondary" size="xs" onClick={() => requestRule(rule)} disabled={solicitar.isPending}>Solicitar</Btn>}
                    <Btn variant={selected ? 'primary' : 'secondary'} size="xs" onClick={() => applyRule(actionableRule)} disabled={!canApply || solicitar.isPending}>
                      {selected ? 'Aplicada' : 'Aplicar'}
                    </Btn>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function CargosSection({ ordenId, locked = false }) {
  const { data: cargos = [], isLoading } = useVentaCargos(ordenId)
  const addCargo = useAddCargo()
  const delCargo = useDeleteCargo()
  const [draft, setDraft] = useState({ nombre: '', valor: '' })
  const fmt = n => '$' + (n || 0).toLocaleString('es-CL')
  const total = cargos.reduce((s, c) => s + (c.valor || 0), 0)

  function add() {
    if (locked) { toast.warning('No se pueden modificar cargos con pagos o documentos registrados'); return }
    if (!draft.nombre || !draft.valor) { toast.warning('Nombre y valor requeridos'); return }
    addCargo.mutate({ ordenId, nombre: draft.nombre, valor: Number(draft.valor) }, {
      onSuccess: () => setDraft({ nombre: '', valor: '' }),
      onError: e => toast.error(e.response?.data?.error || 'Error'),
    })
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Cargos transporte ({cargos.length})</span>
        <span style={{ fontSize: 13, fontFamily: "'DM Mono',monospace" }}>Total: {fmt(total)}</span>
      </div>
      {isLoading
        ? <div style={{ padding: 14, fontSize: 12, color: 'var(--text-3)' }}>Cargando…</div>
        : cargos.length === 0
          ? <div style={{ padding: 14, fontSize: 12, color: 'var(--text-3)' }}>Sin cargos</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {cargos.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 12px' }}>{c.nombre}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(c.valor)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'center', width: 36 }}>
                      <button
                        onClick={() => {
                          if (locked) { toast.warning('No se pueden modificar cargos con pagos o documentos registrados'); return }
                          delCargo.mutate({ ordenId, cargoId: c.id })
                        }}
                        disabled={locked}
                        style={{ padding: 4, border: 'none', background: 'none', cursor: locked ? 'not-allowed' : 'pointer', color: 'var(--text-3)', opacity: locked ? 0.45 : 1 }}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      <div style={{ background: '#fafafa', borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
        <input placeholder="Nombre cargo (ej. Despacho Santiago)" value={draft.nombre} onChange={e => setDraft({ ...draft, nombre: e.target.value })} disabled={locked}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12 }} />
        <input type="number" placeholder="Valor" value={draft.valor} onChange={e => setDraft({ ...draft, valor: e.target.value })} disabled={locked}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right' }} />
        <button onClick={add} disabled={addCargo.isPending || locked}
          style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--green-700)', background: 'var(--green-700)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
          {addCargo.isPending ? '...' : 'Agregar'}
        </button>
      </div>
    </div>
  )
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function DocumentosVentaSection({ ordenId, pagos = [] }) {
  const crearDocumento = useCrearDocumentoVenta()
  const [draft, setDraft] = useState({ documento: 'Factura Plast', nDoc: '', monto: '', tipoDocumento: '', fecha: '' })
  const referenciales = pagos.filter(p => normalizeText(p.medioPago) === 'referencial')
  const pagosReales = pagos.filter(p => normalizeText(p.medioPago) !== 'referencial')
  const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')

  function update(field, value) {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  function submit() {
    const monto = Number(draft.monto)
    if (!draft.documento || !draft.nDoc || !Number.isFinite(monto) || monto <= 0) {
      toast.warning('Documento, numero y monto son requeridos')
      return
    }
    crearDocumento.mutate({
      ordenId,
      data: {
        documento: draft.documento,
        nDoc: draft.nDoc,
        monto,
        tipoDocumento: draft.tipoDocumento || undefined,
        fecha: draft.fecha || undefined,
      },
    }, {
      onSuccess: () => setDraft(prev => ({ ...prev, nDoc: '', monto: '', tipoDocumento: '', fecha: '' })),
      onError: err => toast.error(err.response?.data?.error || 'No se pudo crear el documento'),
    })
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, padding: 12, background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <Select value={draft.documento} onChange={v => update('documento', v)} options={DOCUMENTOS_VENTA} />
        <Input value={draft.nDoc} onChange={v => update('nDoc', v)} placeholder="N doc" />
        <Input value={draft.monto} onChange={v => update('monto', v)} type="number" prefix="$" placeholder="Monto" />
        <Input value={draft.tipoDocumento} onChange={v => update('tipoDocumento', v)} placeholder="Tipo doc" />
        <Input value={draft.fecha} onChange={v => update('fecha', v)} type="date" />
        <button type="button" onClick={submit} disabled={crearDocumento.isPending} style={{ ...actionBtn('var(--green-700)'), justifyContent: 'center' }}>
          <Icon name="plusCircle" size={13} /> {crearDocumento.isPending ? 'Creando' : 'Crear'}
        </button>
      </div>
      {referenciales.length === 0 ? (
        <div style={{ padding: 14, fontSize: 12, color: 'var(--text-3)' }}>Sin documentos referenciales</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              {['Documento', 'N doc', 'Fecha', 'Monto', 'Estado', 'Pagos asociados'].map((h, i) => (
                <th key={h} style={{ padding: '8px 10px', textAlign: i >= 3 ? 'right' : 'left', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {referenciales.map(doc => {
              const pagosDoc = pagosReales.filter(p => p.documento === doc.documento && p.nDoc === doc.nDoc)
              const totalPagos = pagosDoc.reduce((sum, p) => sum + Number(p.monto || 0), 0)
              return (
                <tr key={doc.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px' }}>{doc.documento}</td>
                  <td style={{ padding: '8px 10px', fontFamily: "'DM Mono',monospace" }}>{doc.nDoc}</td>
                  <td style={{ padding: '8px 10px', fontFamily: "'DM Mono',monospace" }}>{doc.fecha ? new Date(doc.fecha).toLocaleDateString('es-CL') : '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(doc.monto)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{doc.estadoPagoDoc || 'No pagada'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" }}>{fmt(totalPagos)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function EntregaSection({ items }) {
  const updateEnt = useUpdateItemEntregados()
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['Producto', 'Cant.', 'Entregados', 'Pendiente', ''].map((h, i) => (
              <th key={i} style={{ padding: '7px 12px', textAlign: i >= 1 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(it => {
            const cant = it.cantidad
            const ent = it.nEntregados ?? 0
            const pend = cant - ent
            return (
              <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 12px' }}>{it.nombre || it.producto?.nombre || `#${it.productoId}`}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace" }}>{cant}</td>
                <td style={{ padding: '4px 12px', textAlign: 'right' }}>
                  <input type="number" min={0} max={cant} defaultValue={ent}
                    onBlur={e => {
                      const n = parseInt(e.target.value || '0', 10)
                      if (n !== ent) updateEnt.mutate({ itemId: it.id, nEntregados: n }, {
                        onError: er => toast.error(er.response?.data?.error || 'Error'),
                      })
                    }}
                    style={{ width: 70, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right' }} />
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: pend > 0 ? 'var(--amber)' : 'var(--green-600)', fontWeight: 600 }}>{pend}</td>
                <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                  {ent === cant
                    ? <Icon name="check" size={14} color="var(--green-600)" />
                    : ent === 0
                      ? <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                      : <span style={{ color: 'var(--amber)', fontSize: 11, fontWeight: 600 }}>parcial</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MultasSection({ ordenId }) {
  const { data = { items: [], total: 0 }, isLoading } = useMultas({ ordenId })
  const createM = useCreateMulta()
  const deleteM = useDeleteMulta()
  const [draft, setDraft] = useState({ monto: '', nDocumento: '', numero: '', fecha: '', interno: '' })

  const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

  function add() {
    if (!draft.monto) { toast.warning('Monto requerido'); return }
    createM.mutate({
      ordenId,
      monto: Number(draft.monto),
      nDocumento: draft.nDocumento || undefined,
      numero: draft.numero || undefined,
      fecha: draft.fecha || undefined,
      interno: draft.interno || undefined,
    }, {
      onSuccess: () => setDraft({ monto: '', nDocumento: '', numero: '', fecha: '', interno: '' }),
      onError: e => toast.error(e.response?.data?.error || 'Error'),
    })
  }

  async function remove(id) {
    if (!await confirmDialog({ title: 'Confirmar', detail: '¿Eliminar esta multa?', tone: 'danger' })) return
    deleteM.mutate(id, { onError: e => toast.error(e.response?.data?.error || 'Error') })
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Multas aplicadas ({data.items.length})</span>
        <span style={{ fontSize: 13, fontFamily: "'DM Mono',monospace", color: 'var(--red)' }}>Total: {fmt(data.total)}</span>
      </div>

      {isLoading
        ? <div style={{ padding: 16, fontSize: 12, color: 'var(--text-3)' }}>Cargando…</div>
        : data.items.length === 0
          ? <div style={{ padding: 16, fontSize: 12, color: 'var(--text-3)' }}>Sin multas registradas</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {['Fecha', 'N° Doc', 'N° Multa', 'Interno', 'Monto', ''].map((h, i) => (
                    <th key={i} style={{ padding: '6px 10px', textAlign: i === 4 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map(m => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', fontFamily: "'DM Mono',monospace" }}>{m.fecha ? new Date(m.fecha).toLocaleDateString('es-CL') : '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{m.nDocumento || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{m.numero || '—'}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-3)' }}>{m.interno || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600, color: 'var(--red)' }}>{fmt(m.monto)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <button onClick={() => remove(m.id)} disabled={deleteM.isPending} style={{ padding: 4, borderRadius: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

      <div style={{ background: '#fafafa', borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'grid', gridTemplateColumns: '110px 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
        <input type="date" value={draft.fecha} onChange={e => setDraft({ ...draft, fecha: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit' }} />
        <input placeholder="N° documento" value={draft.nDocumento} onChange={e => setDraft({ ...draft, nDocumento: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit' }} />
        <input placeholder="N° multa" value={draft.numero} onChange={e => setDraft({ ...draft, numero: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit' }} />
        <input placeholder="Interno" value={draft.interno} onChange={e => setDraft({ ...draft, interno: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit' }} />
        <input type="number" placeholder="Monto" value={draft.monto} onChange={e => setDraft({ ...draft, monto: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right' }} />
        <button onClick={add} disabled={createM.isPending}
          style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--green-700)', background: 'var(--green-700)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
          {createM.isPending ? '...' : 'Agregar'}
        </button>
      </div>
    </div>
  )
}

function SearchableSelect({ value, onChange, options, disabled, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const ref = useRef()

  const selectedOption = options.find(o => String(o.value) === String(value))

  useEffect(() => {
    if (selectedOption) {
      setSearchTerm(selectedOption.value ? selectedOption.label : '')
    } else {
      setSearchTerm('')
    }
  }, [value, selectedOption])

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false)
        if (selectedOption) {
          setSearchTerm(selectedOption.value ? selectedOption.label : '')
        } else {
          setSearchTerm('')
        }
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [selectedOption])

  const filteredOptions = options.filter(o => {
    if (!o.value) return false
    const term = searchTerm.toLowerCase()
    return o.label.toLowerCase().includes(term) || (o.value && String(o.value).includes(term))
  })

  function select(opt) {
    onChange(opt.value)
    setSearchTerm(opt.label)
    setIsOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        value={searchTerm}
        disabled={disabled}
        placeholder={placeholder || "Escribe para buscar cliente..."}
        onFocus={() => !disabled && setIsOpen(true)}
        onChange={e => {
          setSearchTerm(e.target.value)
          setIsOpen(true)
          if (!e.target.value) {
            onChange('')
          }
        }}
        style={{
          width: '100%',
          padding: '9px 32px 9px 12px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          fontSize: 13,
          fontFamily: 'inherit',
          outline: 'none',
          background: disabled ? 'var(--bg)' : '#fff',
          color: disabled ? 'var(--text-3)' : 'inherit',
          boxSizing: 'border-box',
          cursor: disabled ? 'not-allowed' : 'text',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'calc(100% - 12px) center',
        }}
      />
      {isOpen && !disabled && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 300,
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-md)',
          maxHeight: 260,
          overflowY: 'auto'
        }}>
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '9px 12px', fontSize: 13, color: 'var(--text-3)' }}>
              Sin resultados
            </div>
          ) : (
            filteredOptions.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => select(o)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '9px 12px',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--text-1)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--green-50)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function VentasFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = !!id
  const user = useAuthStore(s => s.user)
  const canDeleteVentas = can(user, 'ventas', 'delete')
  const canPasarTaller = canAny(user, [['taller', 'write'], ['ventas', 'write']])

  const { data: found, isLoading } = useVenta(isEdit ? Number(id) : null)
  const { data: clientesResult } = useClientes()
  const clientesData = clientesResult?.items ?? []
  const createVenta = useCreateVenta()
  const updateVenta = useUpdateVenta()
  const anularVenta = useAnularVenta()
  const activarVenta = useActivarVenta()
  const { data: descuentosCatalogo } = useDescuentos()

  async function handleAnular() {
    if (!await confirmDialog({ title: 'Confirmar', detail: `¿Anular venta #${id}? Quedará marcada como Nula y eliminada.`, tone: 'danger' })) return
    anularVenta.mutate(Number(id), { onSuccess: () => navigate('/ventas'), onError: e => toast.error(e.response?.data?.error || 'Error') })
  }
  function handleActivar() {
    activarVenta.mutate(Number(id), { onError: e => toast.error(e.response?.data?.error || 'Error') })
  }
  function handleImprimir() {
    const w = window.open(`${window.location.origin}/ventas/${id}/imprimir`, '_blank')
    if (!w) toast.warning('Habilita popups para imprimir')
  }
  function handlePasarTaller() {
    navigate(`/pasar-taller?ordenId=${id}`)
  }

  const { data, set } = useForm({
    clienteId: '', clienteSucursalId: '', tipo: searchParams.get('tipo') || TIPO_DEFAULT, estado: 'Activa',
    estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega',
    abono: '', guias: '', facturado: '', descuentoPct: '', licitacion: searchParams.get('oc') || '', observaciones: searchParams.get('obs') || '',
    licitacionFecha: '', licitacionPlazo: '', licitacionReferencia: '', licitacionOC: '',
    enviosParciales: false, montoDespacho: '', fechaPlazo: '',
    direccionDespacho: '', direccionDespachoExtra: '', contactoDespacho: '', telefonoContactoDespacho: '',
    regionDespacho: '', comunaDespacho: '', ciudadDespacho: '', vendedorId: '',
  })
  const selectedClienteId = data.clienteId ? Number(data.clienteId) : null
  const { data: sucursalesCliente = [] } = useClienteSucursales(selectedClienteId)

  // Despacho: regiones y comunas encadenadas (la region elegida filtra las comunas).
  const { data: regiones = [] } = useRegiones()
  const regionSel = regiones.find(r => r.nombre === data.regionDespacho)
  const { data: comunas = [] } = useComunas(regionSel?.codigo)

  // Vendedor: solo el admin puede elegir; un vendedor crea siempre a su nombre.
  const isAdmin = user?.role === 'admin'
  const { data: usuarios = [] } = useUsuarios({ enabled: isAdmin })
  const vendedores = (Array.isArray(usuarios) ? usuarios : usuarios?.items || [])
    .filter(u => u.activo !== false && (u.role === 'vendedor' || u.role === 'admin'))

  const [items, setItems] = useState([])
  const [selectedDiscountRule, setSelectedDiscountRule] = useState(null)
  const [initializedId, setInitializedId] = useState(null)
  const [showNewCliente, setShowNewCliente] = useState(false)

  useEffect(() => {
    if (found && initializedId !== found.id) {
      set('clienteId', String(found.clienteId || ''))
      set('clienteSucursalId', String(found.clienteSucursalId || ''))
      set('tipo', found.tipo || 'Normal')
      set('estado', found.estado || 'Activa')
      set('estadoPago', found.estadoPago || 'No pagada')
      set('estadoEntrega', found.estadoEntrega || 'Pendiente entrega')
      set('abono', found.abono != null ? String(found.abono) : '')
      set('guias', found.guias != null ? String(found.guias) : '')
      set('facturado', found.facturado != null ? String(found.facturado) : '')
      set('descuentoPct', found.descuentoPct != null ? String(found.descuentoPct) : '')
      set('licitacion', found.licitacion || '')
      set('observaciones', found.observaciones || '')

      set('enviosParciales', !!found.enviosParciales)
      set('montoDespacho', found.montoDespacho != null ? String(found.montoDespacho) : '')
      set('fechaPlazo', found.fechaPlazo ? new Date(found.fechaPlazo).toISOString().slice(0, 10) : '')
      set('direccionDespacho', found.direccionDespacho || '')
      set('direccionDespachoExtra', found.direccionDespachoExtra || '')
      set('contactoDespacho', found.contactoDespacho || '')
      set('telefonoContactoDespacho', found.telefonoContactoDespacho || '')
      set('regionDespacho', found.regionDespacho || '')
      set('comunaDespacho', found.comunaDespacho || '')
      set('ciudadDespacho', found.ciudadDespacho || '')

      const firstCot = found.cotizaciones?.[0]
      set('licitacionFecha', firstCot?.fecha ? new Date(firstCot.fecha).toISOString().slice(0, 10) : '')
      set('licitacionPlazo', firstCot?.plazo || '')
      set('licitacionReferencia', firstCot?.referencia || '')
      set('licitacionOC', firstCot?.ordenCompra || '')

      const initialItems = found.items?.length
        ? found.items.map(i => ({
          productoId: i.productoId,
          nombre: i.nombre || i.producto?.nombre || `Producto #${i.productoId}`,
          descripcion: i.descripcion || i.producto?.descripcion || '',
          codigoInterno: i.codigoInterno || i.producto?.codigoInterno || i.codigo || '',
          fotoUrl: i.fotoUrl || i.producto?.fotoUrl || null,
          cantidad: i.cantidad,
          nEntregados: i.nEntregados ?? 0,
          precioUnitario: i.precioUnitario ?? i.precio ?? 0,
        }))
        : []
      const timer = setTimeout(() => {
        setItems(initialItems)
        setSelectedDiscountRule(null)
        setInitializedId(found.id)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [found, initializedId, set])

  const descuento = Number(data.descuentoPct) || 0
  const subtotal = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0), 0)
  const cargosTotal = (found?.cargos || []).reduce((s, c) => s + Number(c.valor || 0), 0)
  const totalBase = subtotal + cargosTotal
  const discountDraftKey = buildVentaDiscountKey({ venta: data, items, cargosTotal })
  const activeSelectedDiscountRule = selectedDiscountRule && (!selectedDiscountRule.draftKey || selectedDiscountRule.draftKey === discountDraftKey)
    ? selectedDiscountRule
    : null
  const descuentoMonto = activeSelectedDiscountRule?.montoDescuento != null
    ? Number(activeSelectedDiscountRule.montoDescuento || 0)
    : discountAmount(totalBase, descuento)
  const totalCalculado = totalBase - descuentoMonto
  const itemsLocked = isEdit && (hasDeliveredItems(found) || hasFinancialTrace(found))
  const financialLocked = isEdit && hasFinancialTrace(found)

  useEffect(() => {
    if (selectedDiscountRule?.draftKey && selectedDiscountRule.draftKey !== discountDraftKey) {
      const timer = setTimeout(() => {
        setSelectedDiscountRule(null)
        set('descuentoPct', '')
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [discountDraftKey, selectedDiscountRule, set])

  function addProducto(p) {
    if (itemsLocked) return
    setItems(prev => {
      const existing = prev.findIndex(i => i.productoId === p.id)
      if (existing >= 0) return prev.map((item, idx) => idx === existing ? { ...item, cantidad: Number(item.cantidad) + 1 } : item)
      return [...prev, { productoId: p.id, nombre: p.nombre, descripcion: p.descripcion || '', codigoInterno: p.codigoInterno || '', fotoUrl: p.fotoUrl || null, cantidad: 1, precioUnitario: defaultPrecioUnitario(p, data.tipo) }]
    })
  }

  const saving = createVenta.isPending || updateVenta.isPending

  function handleSave() {
    const shouldSendItems = !isEdit || !itemsLocked
    const itemError = shouldSendItems ? validateItems(items) : null
    if (itemError) { toast.error(itemError); return }
    if (!isEdit && !data.clienteId) {
      toast.warning('Selecciona un cliente')
      return
    }
    if (isConvenioMarco(data.tipo) && !String(data.licitacion || '').replace(/\s+/g, '').trim()) {
      toast.warning('Ingresa la OC de Convenio Marco')
      return
    }
    if (data.tipo === 'Licitación') {
      if (!String(data.licitacion || '').trim()) {
        toast.warning('Ingresa el ID de Licitación')
        return
      }
      if (!data.licitacionFecha) {
        toast.warning('Ingresa la Fecha de la Licitación')
        return
      }
    }

    const normalizedItems = shouldSendItems ? normalizeItems(items, { withOverrides: data.tipo === 'Licitación' }) : null
    const payload = {
      tipo: data.tipo, estado: data.estado,
      estadoEntrega: data.estadoEntrega,
      licitacion: data.licitacion || undefined,
      observaciones: data.observaciones || undefined,
      enviosParciales: !!data.enviosParciales,
      montoDespacho: Number(data.montoDespacho) || 0,
      fechaPlazo: data.fechaPlazo ? new Date(data.fechaPlazo) : null,
      direccionDespacho: data.direccionDespacho || null,
      direccionDespachoExtra: data.direccionDespachoExtra || null,
      contactoDespacho: data.contactoDespacho || null,
      telefonoContactoDespacho: data.telefonoContactoDespacho || null,
      regionDespacho: data.regionDespacho || null,
      comunaDespacho: data.comunaDespacho || null,
      ciudadDespacho: data.ciudadDespacho || null,
    }
    if (data.tipo === 'Licitación') {
      payload.licitacionFecha = data.licitacionFecha || undefined
      payload.licitacionPlazo = data.licitacionPlazo || undefined
      payload.licitacionReferencia = data.licitacionReferencia || undefined
      payload.licitacionOC = data.licitacionOC || undefined
    }
    if (data.clienteId) payload.clienteId = Number(data.clienteId)
    payload.clienteSucursalId = data.clienteSucursalId ? Number(data.clienteSucursalId) : null
    // Vendedor: solo el admin asigna; el backend ignora esto para no-admins.
    if (!isEdit && isAdmin && data.vendedorId) payload.vendedorId = Number(data.vendedorId)
    if (data.descuentoPct !== '') payload.descuentoPct = Number(data.descuentoPct)
    if (activeSelectedDiscountRule?.id && !String(activeSelectedDiscountRule.id).startsWith('legacy-')) {
      payload.descuentoReglaId = activeSelectedDiscountRule.id
      if (activeSelectedDiscountRule.codigo) payload.descuentoReglaCodigo = activeSelectedDiscountRule.codigo
    }
    if (activeSelectedDiscountRule?.autorizacionId) {
      payload.descuentoAutorizacionId = Number(activeSelectedDiscountRule.autorizacionId)
    }

    if (isEdit) {
      if (data.guias !== '') payload.guias = parseInt(data.guias, 10)
      if (shouldSendItems) payload.items = normalizedItems
      updateVenta.mutate({ id: Number(id), data: payload }, {
        onSuccess: () => navigate('/ventas'),
        onError: err => toast.error(err.response?.data?.error || 'Error al guardar'),
      })
    } else {
      createVenta.mutate({
        ...payload,
        items: normalizedItems,
      }, {
        onSuccess: (created) => {
          // Tras crear, ir directo al detalle segun el tipo de venta.
          if (data.tipo === 'Licitación' && created?.cotizacionId) {
            navigate('/licitaciones/' + created.cotizacionId)
          } else if (created?.id) {
            navigate('/ventas/' + created.id)
          } else {
            navigate('/ventas')
          }
        },
        onError: err => toast.error(err.response?.data?.error || 'Error al crear'),
      })
    }
  }

  const clienteOptions = [
    { value: '', label: '— Seleccionar cliente —' },
    ...clientesData.map(c => ({ value: String(c.id), label: `${c.nombre} (${c.rut})` })),
  ]

  const sucursalOptions = [
    { value: '', label: sucursalesCliente.length ? 'Sin sucursal especifica' : 'Sin sucursales registradas' },
    ...sucursalesCliente.map(s => ({ value: String(s.id), label: `${s.nombre}${s.comuna ? ` - ${s.comuna}` : ''}` })),
  ]
  const selectedSucursal = sucursalesCliente.find(s => String(s.id) === data.clienteSucursalId)
  const normalDiscountValues = (descuentosCatalogo?.normales || []).map(d => String(d.valor))
  const marcoDiscountValues = (descuentosCatalogo?.marco || []).map(d => String(d.valor))
  const normalDiscountOptions = [
    { value: '', label: 'Sin descuento' },
    ...normalDiscountValues.map(v => ({ value: v, label: `${v}%` })),
    ...(data.descuentoPct !== '' && isNormalDiscountTipo(data.tipo) && !normalDiscountValues.includes(String(data.descuentoPct))
      ? [{ value: String(data.descuentoPct), label: `${data.descuentoPct}% (valor actual)` }]
      : []),
  ]
  const marcoDiscountOptions = [
    { value: '', label: 'Sin descuento' },
    ...marcoDiscountValues.map(v => ({ value: v, label: `${v}%` })),
    ...(data.descuentoPct !== '' && isConvenioMarco(data.tipo) && !marcoDiscountValues.includes(String(data.descuentoPct))
      ? [{ value: String(data.descuentoPct), label: `${data.descuentoPct}% (valor actual)` }]
      : []),
  ]

  if (isEdit && isLoading) return <main style={{ padding: 24 }}><p>Cargando...</p></main>

  return (
    <FormPage
      title={isEdit ? 'Editar Venta' : 'Nueva Venta'}
      subtitle={isEdit ? `Editando venta #${id}` : 'Crear nueva orden de venta'}
      breadcrumb={['Inicio', 'Ventas', isEdit ? 'Editar Venta' : 'Nueva Venta']}
      onSave={handleSave}
      saving={saving}
      saveLabel={isEdit ? 'Guardar' : 'Crear Venta'}
    >
      <FormDivider label="Tipo de Venta" />
      <FormField label="Tipo de Venta">
        <Select
          value={data.tipo}
          onChange={v => set('tipo', v)}
          options={TIPOS.includes(data.tipo) ? TIPOS : [data.tipo, ...TIPOS]}
          style={{ 
            backgroundColor: '#fffbeb', // Soft yellow background
            borderColor: '#fcd34d',     // Warm golden border
            fontSize: '15.6px',         // 20% larger font size (default is 13px)
            fontWeight: '600',          // slightly bolder
            height: '42px',             // more height/padding
            color: '#78350f',           // contrast color
            width: '100%',
          }}
        />
      </FormField>

      {/* Selector de vendedor: solo visible para admin al crear. El vendedor se autoasigna. */}
      {!isEdit && isAdmin && (
        <FormField label="Vendedor asignado" hint="Asigna la venta a un vendedor, o usa 'Venta del Admin'">
          <Select
            value={data.vendedorId || ''}
            onChange={v => set('vendedorId', v)}
            options={[
              { value: '', label: '— Seleccionar vendedor —' },
              { value: String(user.id), label: `Venta del Admin (${user.nombre})` },
              ...vendedores.filter(v => v.id !== user.id).map(v => ({ value: String(v.id), label: v.nombre + (v.codigoVendedor ? ` · ${v.codigoVendedor}` : '') })),
            ]}
          />
        </FormField>
      )}

      {data.tipo === 'Licitación' && (
        <>
          <FormDivider label="Detalles de la Licitación" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormField label="ID Licitación (Requerido)" hint="Ej: 61602954-LE15-1">
              <Input value={data.licitacion || ''} onChange={v => set('licitacion', v)} placeholder="Codigo de seguimiento" />
            </FormField>
            <FormField label="Fecha Licitación (Requerido)">
              <Input type="date" value={data.licitacionFecha || ''} onChange={v => set('licitacionFecha', v)} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
            <FormField label="Plazo">
              <Input value={data.licitacionPlazo || ''} onChange={v => set('licitacionPlazo', v)} placeholder="Ej: 30 días" />
            </FormField>
            <FormField label="Referencia">
              <Input value={data.licitacionReferencia || ''} onChange={v => set('licitacionReferencia', v)} placeholder="Ej: Escuela Municipal" />
            </FormField>
            <FormField label="Orden de Compra">
              <Input value={data.licitacionOC || ''} onChange={v => set('licitacionOC', v)} placeholder="Ej: 12345-67-SE16" />
            </FormField>
          </div>
        </>
      )}

      {isConvenioMarco(data.tipo) && (
        <>
          <FormDivider label="Detalles del Convenio Marco" />
          <FormField label="N OC Convenio Marco (Requerido)" hint="Obligatorio y no duplicable">
            <Input value={data.licitacion || ''} onChange={v => set('licitacion', v)} placeholder="Numero OC" />
          </FormField>
        </>
      )}

      <FormDivider label="Cliente" />
      <FormField label="Cliente / Organismo">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <SearchableSelect value={data.clienteId} onChange={v => { set('clienteId', v); set('clienteSucursalId', '') }} options={clienteOptions} />
          </div>
          <button 
            type="button" 
            onClick={() => setShowNewCliente(true)}
            style={{
              padding: '9px 14px',
              borderRadius: 8,
              border: '1px solid var(--green-600)',
              background: 'var(--green-50, #f0fdf4)',
              color: 'var(--green-700, #15803d)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              height: '38px', // matches SearchableSelect height
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--green-100)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--green-50)'
            }}
          >
            <Icon name="plus" size={14} />
            Nuevo Cliente
          </button>
        </div>
      </FormField>
      <FormField label="Sucursal / Direccion de entrega">
        <Select value={data.clienteSucursalId} onChange={v => set('clienteSucursalId', v)} options={sucursalOptions} disabled={!selectedClienteId || !sucursalesCliente.length} />
      </FormField>
      {isEdit && found?.cliente && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8, marginBottom: 4 }}>
          Actual: <strong style={{ color: 'var(--text-2)' }}>{found.cliente.nombre}</strong> · {found.cliente.rut}
        </div>
      )}
      {selectedSucursal && (
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: -8, marginBottom: 4, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)' }}>
          {selectedSucursal.direccion || 'Sin direccion'} {selectedSucursal.comuna ? `- ${selectedSucursal.comuna}` : ''} {selectedSucursal.contacto ? `- Contacto: ${selectedSucursal.contacto}` : ''}
        </div>
      )}

      <FormDivider label="Información de Despacho" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <FormField label="Fecha Plazo de Entrega">
          <Input type="date" value={data.fechaPlazo || ''} onChange={v => set('fechaPlazo', v)} />
        </FormField>
        <FormField label="Monto Despacho Cotizado">
          <Input type="number" value={data.montoDespacho || ''} onChange={v => set('montoDespacho', v)} prefix="$" placeholder="0" />
        </FormField>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            <input type="checkbox" checked={!!data.enviosParciales} onChange={e => set('enviosParciales', e.target.checked)} />
            Permite envíos parciales
          </label>
        </div>
      </div>
      {/* Región y Comuna encadenadas: elegir región filtra las comunas disponibles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
        <FormField label="Región Despacho">
          <Select
            value={data.regionDespacho || ''}
            onChange={v => { set('regionDespacho', v); set('comunaDespacho', '') }}
            options={[{ value: '', label: '— Seleccionar región —' }, ...regiones.map(r => ({ value: r.nombre, label: r.nombre }))]}
          />
        </FormField>
        <FormField label="Comuna Despacho">
          <Select
            value={data.comunaDespacho || ''}
            onChange={v => set('comunaDespacho', v)}
            disabled={!data.regionDespacho}
            options={[{ value: '', label: data.regionDespacho ? '— Seleccionar comuna —' : 'Elige región primero' }, ...comunas.map(c => ({ value: c.nombre, label: c.nombre }))]}
          />
        </FormField>
        <FormField label="Ciudad Despacho">
          <Input value={data.ciudadDespacho || ''} onChange={v => set('ciudadDespacho', v)} placeholder="Ciudad" />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <FormField label="Dirección de Despacho (Override)" hint="Dejar vacío para usar dirección por defecto del cliente">
          <Input value={data.direccionDespacho || ''} onChange={v => set('direccionDespacho', v)} placeholder="Calle y número" />
        </FormField>
        <FormField label="Datos extra de dirección" hint="Depto, oficina, referencia, etc.">
          <Input value={data.direccionDespachoExtra || ''} onChange={v => set('direccionDespachoExtra', v)} placeholder="Depto / referencia (opcional)" />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <FormField label="Contacto de Despacho">
          <Input value={data.contactoDespacho || ''} onChange={v => set('contactoDespacho', v)} placeholder="Nombre del contacto" />
        </FormField>
        <FormField label="Teléfono Contacto Despacho">
          <Input value={data.telefonoContactoDespacho || ''} onChange={v => set('telefonoContactoDespacho', v)} placeholder="Teléfono del contacto" />
        </FormField>
      </div>
      {isEdit && found?.cotizaciones?.length > 0 && (
        <div style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', background: 'var(--bg)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Cotizacion / licitacion vinculada</div>
          {found.cotizaciones.map(c => (
            <button key={c.id} type="button" onClick={() => navigate(`/licitaciones/${c.id}`)} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', padding: '9px 10px', background: '#fff', borderTop: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', fontSize: 12 }}>
              <span><strong>{c.idLicitacion || `#${c.id}`}</strong> {c.referencia || c.ordenCompra || ''}</span>
              <span style={{ color: 'var(--green-700)', fontWeight: 600 }}>Ver</span>
            </button>
          ))}
        </div>
      )}

      <FormDivider label="Estados de la Orden" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Estado de la orden">
          <Select value={data.estado} onChange={v => set('estado', v)} options={['Activa', 'Cerrada', 'Nula', 'Completada', 'En proceso']} />
        </FormField>
        <FormField label="Estado Pago">
          <Input value={data.estadoPago} onChange={() => null} disabled />
        </FormField>
        <FormField label="Estado Entrega">
          <Select value={data.estadoEntrega} onChange={v => set('estadoEntrega', v)} options={['Pendiente entrega', 'Entregada', 'En despacho', 'Parcial']} />
        </FormField>
      </div>

      <FormDivider label={isEdit ? `Productos (${items.length})` : 'Agregar productos'} />
      {itemsLocked && (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--amber)', borderRadius: 8, background: '#fff8e6', color: 'var(--text-2)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="lock" size={15} color="var(--amber)" />
          <span>Los productos de esta venta no se pueden modificar porque ya registran entregas, pagos o documentos. Para mantener la trazabilidad, solo puedes actualizar campos administrativos.</span>
        </div>
      )}
      <ProductoSearch onAdd={addProducto} tipoVenta={data.tipo} disabled={itemsLocked} />
      <div style={{ marginTop: 12 }}>
        <ItemsTable items={items} onChange={setItems} locked={itemsLocked} isLicitacion={data.tipo === 'Licitación'} />
      </div>
      {items.length > 0 && (
        <div style={{ marginTop: 10, background: 'var(--bg)', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: 24, alignItems: 'center' }}>
          {descuento > 0 && <>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Subtotal: <strong style={{ fontFamily: "'DM Mono',monospace" }}>${subtotal.toLocaleString('es-CL')}</strong></span>
            {cargosTotal > 0 && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Cargos: <strong style={{ fontFamily: "'DM Mono',monospace" }}>${cargosTotal.toLocaleString('es-CL')}</strong></span>}
            <span style={{ fontSize: 12, color: 'var(--green-600)' }}>Dto. ({descuento}%): <strong style={{ fontFamily: "'DM Mono',monospace" }}>-${descuentoMonto.toLocaleString('es-CL')}</strong></span>
          </>}
          <span style={{ fontSize: 15, fontWeight: 700 }}>Total: <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--green-700)' }}>${totalCalculado.toLocaleString('es-CL')}</span></span>
        </div>
      )}

      {!isEdit && (
        <DescuentosDisponiblesPanel
          venta={data}
          items={items}
          subtotal={subtotal}
          cargosTotal={cargosTotal}
          totalBase={totalBase}
          catalogo={descuentosCatalogo}
          selectedRule={activeSelectedDiscountRule}
          disabled={financialLocked}
          onSelect={rule => {
            set('descuentoPct', String(rule.valor))
            setSelectedDiscountRule({ ...rule, draftKey: discountDraftKey })
          }}
        />
      )}

      <FormDivider label="Seguimiento financiero" />
      <div style={{ display: 'grid', gridTemplateColumns: isEdit ? '1fr 1fr 1fr 1fr' : '1fr', gap: 14 }}>
        <FormField
          label={isConvenioMarco(data.tipo) ? 'Descuento Convenio Marco' : isNormalDiscountTipo(data.tipo) ? 'Descuento normal' : 'Descuento %'}
          hint={isConvenioMarco(data.tipo) || isNormalDiscountTipo(data.tipo) ? 'Catalogo de porcentajes autorizados' : 'Porcentaje global sobre subtotal'}
        >
          {isConvenioMarco(data.tipo)
            ? <Select value={data.descuentoPct} onChange={v => { set('descuentoPct', v); setSelectedDiscountRule(null) }} options={marcoDiscountOptions} disabled={financialLocked} />
            : isNormalDiscountTipo(data.tipo)
              ? <Select value={data.descuentoPct} onChange={v => { set('descuentoPct', v); setSelectedDiscountRule(null) }} options={normalDiscountOptions} disabled={financialLocked} />
              : <Input value={data.descuentoPct} onChange={v => { set('descuentoPct', v); setSelectedDiscountRule(null) }} type="number" placeholder="0" disabled={financialLocked} />}
        </FormField>
        {isEdit && <>
          <FormField label="Abono recibido">
            <Input value={data.abono} onChange={() => null} type="number" prefix="$" placeholder="0" disabled />
          </FormField>
          <FormField label="Monto facturado">
            <Input value={data.facturado} onChange={() => null} type="number" prefix="$" placeholder="0" disabled />
          </FormField>
          <FormField label="N° Guía despacho">
            <Input value={data.guias} onChange={v => set('guias', v)} type="number" placeholder="—" />
          </FormField>
        </>}
      </div>

      {isEdit && (
        <>
          <FormDivider label="Documentos de venta" />
          <DocumentosVentaSection ordenId={Number(id)} pagos={found?.pagos || []} />
        </>
      )}

      {isEdit && (
        <>
          <FormDivider label="Acciones" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={handleImprimir} style={actionBtn('var(--green-700)')}>
              <Icon name="printer" size={13} /> Imprimir nota
            </button>
            {canPasarTaller && (
              <button onClick={handlePasarTaller} style={actionBtn('var(--blue)')}>
                <Icon name="tool" size={13} /> Pasar a taller
              </button>
            )}
            {canDeleteVentas && found?.estado !== 'Nula' && (
              <button onClick={handleAnular} disabled={anularVenta.isPending} style={actionBtn('var(--red)')}>
                <Icon name="x" size={13} /> Anular
              </button>
            )}
            {canDeleteVentas && found?.estado === 'Nula' && (
              <button onClick={handleActivar} disabled={activarVenta.isPending} style={actionBtn('var(--green-700)')}>
                <Icon name="check" size={13} /> Reactivar
              </button>
            )}
          </div>
        </>
      )}

      {isEdit && found?.items?.length > 0 && (
        <>
          <FormDivider label="Entrega de productos" />
          <EntregaSection items={found.items} />
        </>
      )}

      {isEdit && (
        <>
          <FormDivider label="Cargos transporte" />
          <CargosSection ordenId={Number(id)} locked={financialLocked} />
        </>
      )}

      {isEdit && data.tipo === 'Licitación' && (
        <>
          <FormDivider label="Multas" />
          <MultasSection ordenId={Number(id)} />
        </>
      )}

      <FormDivider label="Observaciones" />
      <FormField label="Notas internas">
        <Textarea value={data.observaciones || ''} onChange={v => set('observaciones', v)} placeholder="Instrucciones especiales, condiciones de entrega, etc." rows={3} />
      </FormField>

      {showNewCliente && (
        <FormCliente 
          onClose={() => setShowNewCliente(false)}
          onSaved={(newCliente) => {
            set('clienteId', String(newCliente.id))
            set('clienteSucursalId', '')
          }}
        />
      )}
    </FormPage>
  )
}

const actionBtn = (color) => ({
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', fontSize: 12, fontWeight: 500,
  borderRadius: 6, border: `1px solid ${color}`,
  background: '#fff', color, cursor: 'pointer',
})

const discountEmpty = {
  padding: 14,
  borderRadius: 8,
  border: '1px dashed var(--border)',
  background: 'var(--bg)',
  color: 'var(--text-3)',
  fontSize: 13,
  textAlign: 'center',
}

const discountNotice = {
  padding: '8px 10px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 10,
}
