import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useState } from 'react'
import { Badge, PageHeader, Btn, Icon } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import {
  useReglasDescuento,
  useCreateReglaDescuento,
  useUpdateReglaDescuento,
  useDeleteReglaDescuento,
  useSolicitudesDescuento,
  useAprobarDescuentoSolicitud,
  useRechazarDescuentoSolicitud,
} from '../../api/descuentos'

const RULE_DEFAULTS = {
  nombre: '',
  codigo: '',
  tipoVenta: 'Todos',
  tipoDescuento: 'porcentaje',
  valor: '',
  porcentajeAutoaprobado: '',
  porcentajeMaximo: '',
  montoMinimo: '',
  categoriaNombres: '',
  proveedorNombres: '',
  productoIds: '',
  vigenciaDesde: '',
  vigenciaHasta: '',
  prioridad: '0',
  requiereAprobacion: false,
  activo: true,
  descripcion: '',
}

const TIPO_VENTA_OPTIONS = [
  'Todos',
  'Normal',
  'Venta Sala',
  'Venta Web',
  'Convenio Marco',
  'Licitacion',
]

const TIPO_DESCUENTO_OPTIONS = [
  { value: 'porcentaje', label: 'Porcentaje' },
]

function apiError(error, fallback = 'No se pudo guardar') {
  return error?.response?.data?.error || fallback
}

function dateInput(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function normalizeTiposVenta(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean)
  return []
}

function normalizeCsv(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  if (typeof value === 'string') return value
  return ''
}

function csvToList(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean)
}

function csvToIds(value) {
  return csvToList(value).map(Number).filter(Number.isInteger)
}

function normalizeReglas(data) {
  const source = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.reglas)
        ? data.reglas
        : []

  return source.map((regla, idx) => {
    const tiposVenta = normalizeTiposVenta(firstDefined(regla.tiposVenta, regla.condiciones?.tiposVenta, regla.tipoVenta, regla.tipo_venta, regla.tipo))
    const valor = firstDefined(
      regla.valor,
      regla.porcentaje,
      regla.descuentoPct,
      regla.valorDescuento,
      regla.porcentajeSugerido,
      regla.efecto?.porcentajeSugerido,
      regla.efecto?.porcentaje,
      regla.porcentajeMaximo,
      regla.porcentajeMax
    )
    const tipoDescuento = firstDefined(regla.tipoDescuento, regla.tipo_descuento, regla.modo, 'porcentaje')
    return {
      id: regla.id ?? regla.codigo ?? `regla-${idx}`,
      version: regla.version || 1,
      nombre: firstDefined(regla.nombre, regla.name, regla.titulo, `Regla ${idx + 1}`),
      codigo: firstDefined(regla.codigo, regla.code, ''),
      tipoVenta: tiposVenta.length ? tiposVenta.join(', ') : 'Todos',
      tipoDescuento,
      valor,
      porcentajeAutoaprobado: firstDefined(regla.porcentajeAutoaprobado, regla.efecto?.porcentajeAutoaprobado, ''),
      porcentajeMaximo: firstDefined(regla.porcentajeMaximo, regla.porcentajeMax, ''),
      montoMinimo: firstDefined(regla.montoMinimo, regla.monto_minimo, regla.condiciones?.montoMinimo, regla.minimo, ''),
      categoriaNombres: normalizeCsv(firstDefined(regla.categoriaNombres, regla.condiciones?.categoriaNombres, '')),
      proveedorNombres: normalizeCsv(firstDefined(regla.proveedorNombres, regla.condiciones?.proveedorNombres, '')),
      productoIds: normalizeCsv(firstDefined(regla.productoIds, regla.condiciones?.productoIds, '')),
      vigenciaDesde: firstDefined(regla.vigenciaDesde, regla.vigencia_desde, regla.vigenteDesde, regla.desde, ''),
      vigenciaHasta: firstDefined(regla.vigenciaHasta, regla.vigencia_hasta, regla.vigenteHasta, regla.hasta, ''),
      prioridad: firstDefined(regla.prioridad, regla.priority, ''),
      requiereAprobacion: Boolean(firstDefined(regla.requiereAprobacion, regla.requiere_aprobacion, regla.requiresApproval, false)),
      activo: firstDefined(regla.activo, regla.enabled, true) !== false,
      descripcion: String(firstDefined(regla.descripcion, regla.description, '') || ''),
      creadoPor: regla.creadoPor?.nombre || null,
      modificadoPor: regla.modificadoPor?.nombre || null,
      raw: regla,
    }
  })
}

function normalizeSolicitudes(data) {
  const source = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.solicitudes)
        ? data.solicitudes
        : []

  return source.map(item => ({
    id: item.id,
    estado: String(item.estado || '').toUpperCase(),
    regla: item.regla?.nombre || item.resultadoSnapshot?.reglaNombre || item.reglaNombre || `Regla #${item.reglaId || '-'}`,
    origen: item.origenTipo || item.origen || '-',
    solicitante: item.solicitanteNombre || item.solicitante?.nombre || '-',
    porcentaje: firstDefined(item.descuentoPctAprobado, item.descuentoPctSolicitado, item.resultadoSnapshot?.porcentaje, ''),
    base: firstDefined(item.subtotalBase, item.resultadoSnapshot?.baseElegible, 0),
    monto: firstDefined(item.descuentoMontoAprobado, item.descuentoMontoSolicitado, item.resultadoSnapshot?.montoDescuento, 0),
    motivo: item.motivo || item.resultadoSnapshot?.motivo || '',
    createdAt: item.createdAt,
  }))
}

function formFromRule(regla) {
  const tiposVenta = normalizeTiposVenta(firstDefined(regla.raw?.condiciones?.tiposVenta, regla.raw?.tiposVenta, regla.tipoVenta))
  return {
    nombre: regla.nombre || '',
    codigo: regla.codigo || '',
    tipoVenta: tiposVenta[0] || 'Todos',
    tipoDescuento: regla.tipoDescuento || 'porcentaje',
    valor: regla.valor !== undefined && regla.valor !== null ? String(regla.valor) : '',
    porcentajeAutoaprobado: regla.porcentajeAutoaprobado !== undefined && regla.porcentajeAutoaprobado !== null ? String(regla.porcentajeAutoaprobado) : '',
    porcentajeMaximo: regla.porcentajeMaximo !== undefined && regla.porcentajeMaximo !== null ? String(regla.porcentajeMaximo) : '',
    montoMinimo: regla.montoMinimo !== undefined && regla.montoMinimo !== null ? String(regla.montoMinimo) : '',
    categoriaNombres: regla.categoriaNombres || '',
    proveedorNombres: regla.proveedorNombres || '',
    productoIds: regla.productoIds || '',
    vigenciaDesde: dateInput(regla.vigenciaDesde),
    vigenciaHasta: dateInput(regla.vigenciaHasta),
    prioridad: regla.prioridad !== undefined && regla.prioridad !== null ? String(regla.prioridad) : '0',
    requiereAprobacion: Boolean(regla.requiereAprobacion),
    activo: regla.activo !== false,
    descripcion: regla.descripcion || '',
  }
}

function buildRulePayload(form) {
  const nombre = form.nombre.trim()
  if (!nombre) return { error: 'Ingresa un nombre de regla' }

  const valor = Number(form.valor)
  if (!Number.isFinite(valor) || valor < 0) return { error: 'Ingresa un valor valido' }
  if (form.tipoDescuento === 'porcentaje' && valor > 100) return { error: 'El porcentaje debe estar entre 0 y 100' }

  const porcentajeAutoaprobado = form.porcentajeAutoaprobado === '' ? valor : Number(form.porcentajeAutoaprobado)
  const porcentajeMaximo = form.porcentajeMaximo === '' ? valor : Number(form.porcentajeMaximo)
  if (!Number.isFinite(porcentajeAutoaprobado) || porcentajeAutoaprobado < 0 || porcentajeAutoaprobado > 100) return { error: 'Autoaprobado invalido' }
  if (!Number.isFinite(porcentajeMaximo) || porcentajeMaximo < 0 || porcentajeMaximo > 100) return { error: 'Maximo invalido' }
  if (porcentajeAutoaprobado > porcentajeMaximo) return { error: 'Autoaprobado no puede superar el maximo' }
  if (valor > porcentajeMaximo) return { error: 'El porcentaje sugerido no puede superar el maximo' }

  const montoMinimo = form.montoMinimo === '' ? null : Number(form.montoMinimo)
  if (montoMinimo !== null && (!Number.isFinite(montoMinimo) || montoMinimo < 0)) return { error: 'Monto minimo invalido' }
  const productoIdTokens = csvToList(form.productoIds)
  const productoIds = csvToIds(form.productoIds)
  if (productoIdTokens.length !== productoIds.length) return { error: 'IDs de producto deben ser numericos' }

  if (form.vigenciaDesde && form.vigenciaHasta && form.vigenciaDesde > form.vigenciaHasta) {
    return { error: 'La fecha desde no puede ser posterior a la fecha hasta' }
  }

  const prioridad = form.prioridad === '' ? 0 : Number(form.prioridad)
  if (!Number.isFinite(prioridad)) return { error: 'Prioridad invalida' }

  return {
    payload: {
      nombre,
      codigo: form.codigo.trim() || undefined,
      alcance: 'ventas',
      tiposVenta: form.tipoVenta === 'Todos' ? [] : [form.tipoVenta],
      tipoVenta: form.tipoVenta === 'Todos' ? null : form.tipoVenta,
      tipoDescuento: form.tipoDescuento,
      valor,
      porcentajeSugerido: valor,
      porcentajeAutoaprobado,
      porcentajeMaximo,
      montoMinimo,
      categoriaNombres: csvToList(form.categoriaNombres),
      proveedorNombres: csvToList(form.proveedorNombres),
      productoIds,
      vigenciaDesde: form.vigenciaDesde || null,
      vigenciaHasta: form.vigenciaHasta || null,
      prioridad,
      requiereAprobacion: Boolean(form.requiereAprobacion),
      activo: Boolean(form.activo),
      descripcion: form.descripcion.trim() || undefined,
    },
  }
}

function fmtMoney(value) {
  const number = Number(value || 0)
  return '$' + number.toLocaleString('es-CL')
}

function fmtRuleValue(regla) {
  const tipo = String(regla.tipoDescuento || '').toLowerCase()
  return tipo.includes('monto') ? fmtMoney(regla.valor) : `${regla.valor}%`
}

function fmtDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

function statusTone(estado) {
  if (estado === 'AUTORIZADA' || estado === 'APLICADA') return 'green'
  if (estado === 'PENDIENTE') return 'amber'
  if (estado === 'RECHAZADA') return 'red'
  return 'gray'
}

function ruleNeedsScopeWarning(form) {
  return form.tipoVenta === 'Todos' && Number(form.montoMinimo || 0) <= 0 && !form.categoriaNombres && !form.proveedorNombres && !form.productoIds
}

function expirationState(value) {
  if (!value) return null
  const end = new Date(`${String(value).slice(0, 10)}T23:59:59`)
  if (Number.isNaN(end.getTime())) return null
  const days = Math.ceil((end.getTime() - Date.now()) / 86400000)
  if (days < 0) return { label: 'Vencida', tone: 'red' }
  if (days <= 30) return { label: `Vence en ${days} día${days === 1 ? '' : 's'}`, tone: 'amber' }
  return null
}

export default function DescuentosPage() {
  const reglasQuery = useReglasDescuento()
  const createRule = useCreateReglaDescuento()
  const updateRule = useUpdateReglaDescuento()
  const deleteRule = useDeleteReglaDescuento()
  const solicitudesQuery = useSolicitudesDescuento()
  const aprobarSolicitud = useAprobarDescuentoSolicitud()
  const rechazarSolicitud = useRechazarDescuentoSolicitud()

  const [form, setForm] = useState(RULE_DEFAULTS)
  const [editingId, setEditingId] = useState(null)
  const [ruleError, setRuleError] = useState('')

  const reglas = normalizeReglas(reglasQuery.data)
  const solicitudes = normalizeSolicitudes(solicitudesQuery.data)
  const rulePending = createRule.isPending || updateRule.isPending || deleteRule.isPending
  const solicitudPending = aprobarSolicitud.isPending || rechazarSolicitud.isPending

  const setRuleField = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function submitRule(e) {
    e.preventDefault()
    setRuleError('')
    const built = buildRulePayload(form)
    if (built.error) { setRuleError(built.error); return }
    try {
      const result = editingId
        ? await updateRule.mutateAsync({ id: editingId, data: built.payload })
        : await createRule.mutateAsync(built.payload)
      for (const warning of result?.warnings || []) toast.warning(warning)
      setEditingId(null)
      setForm(RULE_DEFAULTS)
    } catch (err) {
      setRuleError(apiError(err, 'No se pudo guardar la regla'))
    }
  }

  function startEdit(regla) {
    setRuleError('')
    setEditingId(regla.id)
    setForm(formFromRule(regla))
  }

  function cancelEdit() {
    setRuleError('')
    setEditingId(null)
    setForm(RULE_DEFAULTS)
  }

  async function removeRule(regla) {
    if (!await confirmDialog({ title: 'Confirmar', detail: `Eliminar regla "${regla.nombre}"?`, tone: 'danger' })) return
    setRuleError('')
    try {
      await deleteRule.mutateAsync(regla.id)
      if (editingId === regla.id) cancelEdit()
    } catch (err) {
      setRuleError(apiError(err, 'No se pudo eliminar la regla'))
    }
  }

  async function resolveSolicitud(solicitud, action) {
    const promptLabel = action === 'aprobar' ? 'Motivo de aprobacion' : 'Motivo de rechazo'
    const motivo = await promptDialog({ title: promptLabel, defaultValue: action === 'aprobar' ? 'Aprobada' : 'Rechazada' })
    if (motivo === null) return
    try {
      if (action === 'aprobar') await aprobarSolicitud.mutateAsync({ id: solicitud.id, motivo })
      else await rechazarSolicitud.mutateAsync({ id: solicitud.id, motivo })
    } catch (err) {
      toast.error(apiError(err, 'No se pudo resolver la solicitud'))
    }
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title="Reglas de Descuento"
        subtitle="Reglas comerciales y porcentajes autorizados"
        breadcrumb={['Inicio', 'Config', 'Reglas de Descuento']}
      />

      <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>Administracion de reglas</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>Condiciones, vigencia y porcentaje disponible para ventas. Al editar se crea una nueva versión y la anterior queda como historial.</div>
          </div>
          {reglasQuery.isError && <Badge tone="amber">Reglas no disponibles</Badge>}
        </div>

        {ruleError && (
          <div style={{ margin: '14px 16px 0', padding: '9px 11px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>
            {ruleError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 420px) 1fr', gap: 0 }}>
          <form onSubmit={submitRule} style={{ padding: 16, borderRight: '1px solid var(--border)', background: 'var(--bg)' }}>
            <FormField label="Nombre de regla" required>
              <Input value={form.nombre} onChange={v => setRuleField('nombre', v)} placeholder="Ej: Venta sala mayorista" disabled={rulePending} />
            </FormField>
            <FormField label="Código interno" hint={editingId ? 'El código se mantiene para conservar el historial de versiones' : undefined}>
              <Input value={form.codigo} onChange={v => setRuleField('codigo', v)} placeholder="Ej: VS-MAY-10" disabled={rulePending || Boolean(editingId)} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Tipo de venta">
                <Select value={form.tipoVenta} onChange={v => setRuleField('tipoVenta', v)} options={TIPO_VENTA_OPTIONS} disabled={rulePending} />
              </FormField>
              <FormField label="Tipo descuento">
                <Select value={form.tipoDescuento} onChange={v => setRuleField('tipoDescuento', v)} options={TIPO_DESCUENTO_OPTIONS} disabled={rulePending} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label={form.tipoDescuento === 'porcentaje' ? 'Porcentaje sugerido' : 'Monto'} required>
                <Input value={form.valor} onChange={v => setRuleField('valor', v)} type="number" placeholder="0" disabled={rulePending} />
              </FormField>
              <FormField label="Monto minimo">
                <Input value={form.montoMinimo} onChange={v => setRuleField('montoMinimo', v)} type="number" placeholder="0" disabled={rulePending} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Máximo sin aprobación (%)">
                <Input value={form.porcentajeAutoaprobado} onChange={v => setRuleField('porcentajeAutoaprobado', v)} type="number" placeholder={form.valor || '0'} disabled={rulePending} />
              </FormField>
              <FormField label="Máximo permitido (%)">
                <Input value={form.porcentajeMaximo} onChange={v => setRuleField('porcentajeMaximo', v)} type="number" placeholder={form.valor || '0'} disabled={rulePending} />
              </FormField>
            </div>
            <FormField label="Categorias elegibles">
              <Input value={form.categoriaNombres} onChange={v => setRuleField('categoriaNombres', v)} placeholder="Ej: Sillas, Mesas" disabled={rulePending} />
            </FormField>
            <FormField label="Proveedores elegibles">
              <Input value={form.proveedorNombres} onChange={v => setRuleField('proveedorNombres', v)} placeholder="Separados por coma" disabled={rulePending} />
            </FormField>
            <FormField label="IDs de producto elegibles">
              <Input value={form.productoIds} onChange={v => setRuleField('productoIds', v)} placeholder="Ej: 1201, 1202" disabled={rulePending} />
            </FormField>
            {ruleNeedsScopeWarning(form) && (
              <div style={{ margin: '0 0 12px', padding: '9px 10px', borderRadius: 8, background: 'var(--amber-bg)', color: 'var(--amber-700)', fontSize: 12 }}>
                Esta regla no tiene condiciones comerciales: podría aplicar a cualquier venta con productos. Revísala antes de guardarla.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Vigencia desde">
                <Input value={form.vigenciaDesde} onChange={v => setRuleField('vigenciaDesde', v)} type="date" disabled={rulePending} />
              </FormField>
              <FormField label="Vigencia hasta">
                <Input value={form.vigenciaHasta} onChange={v => setRuleField('vigenciaHasta', v)} type="date" disabled={rulePending} />
              </FormField>
            </div>
            <FormField label="Prioridad">
              <Input value={form.prioridad} onChange={v => setRuleField('prioridad', v)} type="number" placeholder="0" disabled={rulePending} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <label style={checkStyle}>
                <input type="checkbox" checked={form.requiereAprobacion} onChange={e => setRuleField('requiereAprobacion', e.target.checked)} disabled={rulePending} />
                Requiere aprobacion
              </label>
              <label style={checkStyle}>
                <input type="checkbox" checked={form.activo} onChange={e => setRuleField('activo', e.target.checked)} disabled={rulePending} />
                Activa
              </label>
            </div>
            <FormField label="Condiciones / notas">
              <Textarea value={form.descripcion} onChange={v => setRuleField('descripcion', v)} rows={3} placeholder="Condiciones comerciales visibles para venta" />
            </FormField>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn type="submit" variant="primary" size="sm" disabled={rulePending} icon={editingId ? 'check' : 'plus'}>
                {editingId ? 'Guardar regla' : 'Crear regla'}
              </Btn>
              {editingId && <Btn variant="ghost" size="sm" onClick={cancelEdit} disabled={rulePending}>Cancelar</Btn>}
            </div>
          </form>

          <div style={{ padding: 16 }}>
            {reglasQuery.isLoading && <div style={emptyState}>Cargando reglas...</div>}
            {!reglasQuery.isLoading && reglasQuery.isError && (
              <div style={emptyState}>No fue posible cargar reglas. Se mantiene el catalogo de porcentajes autorizado.</div>
            )}
            {!reglasQuery.isLoading && !reglasQuery.isError && reglas.length === 0 && (
              <div style={emptyState}>Sin reglas definidas</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {reglas.map(regla => (
                <article key={regla.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{regla.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{regla.codigo || `#${regla.id}`}</div>
                    </div>
                    <strong style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: 'var(--green-700)', flexShrink: 0 }}>{fmtRuleValue(regla)}</strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    <Badge tone={regla.activo ? 'green' : 'gray'}>{regla.activo ? 'Activa' : 'Inactiva'}</Badge>
                    <Badge tone="gray">v{regla.version}</Badge>
                    <Badge tone="blue">{regla.tipoVenta || 'Todos'}</Badge>
                    {regla.requiereAprobacion && <Badge tone="amber">Aprobacion</Badge>}
                    {expirationState(regla.vigenciaHasta) && <Badge tone={expirationState(regla.vigenciaHasta).tone}>{expirationState(regla.vigenciaHasta).label}</Badge>}
                  </div>
                  <div style={{ marginTop: 10, display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                    <span>Auto/max: <strong style={mono}>{regla.porcentajeAutoaprobado || 0}% / {regla.porcentajeMaximo || regla.valor}%</strong></span>
                    <span>Minimo: <strong style={mono}>{regla.montoMinimo ? fmtMoney(regla.montoMinimo) : 'Sin minimo'}</strong></span>
                    <span>Categorias: <strong style={mono}>{regla.categoriaNombres || 'Todas'}</strong></span>
                    <span>Proveedores: <strong style={mono}>{regla.proveedorNombres || 'Todos'}</strong></span>
                    {regla.productoIds && <span>Productos: <strong style={mono}>{regla.productoIds}</strong></span>}
                    <span>Vigencia: <strong style={mono}>{dateInput(regla.vigenciaDesde) || 'Sin inicio'} / {dateInput(regla.vigenciaHasta) || 'Sin termino'}</strong></span>
                    <span>Auditada por: <strong style={mono}>{regla.modificadoPor || regla.creadoPor || 'Registro anterior sin autor'}</strong></span>
                    {regla.descripcion && <span style={{ color: 'var(--text-3)' }}>{regla.descripcion}</span>}
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <button type="button" onClick={() => startEdit(regla)} disabled={rulePending} title="Editar regla" style={iconBtn('var(--blue)', rulePending)}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button type="button" onClick={() => removeRule(regla)} disabled={rulePending} title="Eliminar regla" style={iconBtn('var(--red)', rulePending)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>Solicitudes de aprobacion</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>Autorizaciones pendientes y trazabilidad de descuentos aplicados</div>
          </div>
          <Badge tone="amber">{solicitudes.filter(s => s.estado === 'PENDIENTE').length} pendientes</Badge>
        </div>
        <div style={{ padding: 16 }}>
          {solicitudesQuery.isLoading && <div style={emptyState}>Cargando solicitudes...</div>}
          {!solicitudesQuery.isLoading && solicitudes.length === 0 && <div style={emptyState}>Sin solicitudes registradas</div>}
          {solicitudes.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {solicitudes.map(solicitud => (
                <article key={solicitud.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: '#fff' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{solicitud.regla}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{solicitud.origen} · {solicitud.solicitante} · {fmtDateTime(solicitud.createdAt)}</div>
                  </div>
                  <div style={{ minWidth: 0, fontSize: 12, color: 'var(--text-2)' }}>
                    <span style={mono}>Base {fmtMoney(solicitud.base)}</span>
                    <span style={{ display: 'block', marginTop: 2, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{solicitud.motivo || 'Sin motivo adicional'}</span>
                  </div>
                  <strong style={{ fontFamily: "'DM Mono', monospace", color: 'var(--green-700)', textAlign: 'right' }}>{solicitud.porcentaje}%</strong>
                  <strong style={{ fontFamily: "'DM Mono', monospace", color: 'var(--green-700)', textAlign: 'right' }}>{fmtMoney(solicitud.monto)}</strong>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                    <Badge tone={statusTone(solicitud.estado)}>{solicitud.estado || '-'}</Badge>
                    {solicitud.estado === 'PENDIENTE' && (
                      <>
                        <button type="button" onClick={() => resolveSolicitud(solicitud, 'aprobar')} disabled={solicitudPending} title="Aprobar" style={iconBtn('var(--green-700)', solicitudPending)}>
                          <Icon name="check" size={15} />
                        </button>
                        <button type="button" onClick={() => resolveSolicitud(solicitud, 'rechazar')} disabled={solicitudPending} title="Rechazar" style={iconBtn('var(--red)', solicitudPending)}>
                          <Icon name="x" size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

    </main>
  )
}

const mono = { fontFamily: "'DM Mono', monospace" }

const emptyState = {
  padding: 18,
  borderRadius: 10,
  border: '1px dashed var(--border)',
  background: 'var(--bg)',
  color: 'var(--text-3)',
  fontSize: 13,
  textAlign: 'center',
}

const checkStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: '#fff',
  fontSize: 12,
  color: 'var(--text-2)',
  cursor: 'pointer',
}

const iconBtn = (color, disabled) => ({
  color,
  padding: 5,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.45 : 1,
})
