import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useMemo, useState } from 'react'
import { Badge, Btn, Icon, KpiCard, PageHeader, SearchBar, Table } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import {
  useComisionesMeta,
  useComisionReglas,
  useCreateComisionRegla,
  useDeleteComisionRegla,
  useUpdateComisionRegla,
} from '../../api/admin'
import { useUsuarios } from '../../api/usuarios'

const DEFAULT_META = {
  tiposVenta: ['Todos', 'Venta sala', 'Venta directa', 'Normal', 'Venta Web', 'Convenio Marco', 'Licitaci\u00f3n'],
  modalidades: ['FIJA', 'ESCALA_MONTO'],
  bases: ['VENDIDO', 'COBRADO'],
}

const EMPTY_TRAMO = { montoDesde: '0', montoHasta: '', porcentaje: '' }
const FORM_DEFAULTS = {
  nombre: '',
  descripcion: '',
  tipoVenta: 'Todos',
  vendedorId: '',
  modalidad: 'FIJA',
  base: 'VENDIDO',
  porcentaje: '',
  prioridad: '100',
  vigenteDesde: '',
  vigenteHasta: '',
  activo: true,
  tramos: [EMPTY_TRAMO],
}

const modalidadOptions = [
  { value: 'FIJA', label: 'Porcentaje unico' },
  { value: 'ESCALA_MONTO', label: 'Escala por monto' },
]

const baseOptions = [
  { value: 'VENDIDO', label: 'Vendido' },
  { value: 'COBRADO', label: 'Cobrado' },
]

function apiError(err, fallback) {
  return err?.response?.data?.error || fallback
}

function dateInput(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function fmtPct(value) {
  if (value === null || value === undefined || value === '') return '-'
  return `${Number(value).toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`
}

function fmtRuleValue(regla) {
  if (regla.modalidad === 'FIJA') return fmtPct(regla.porcentaje)
  const tramos = regla.tramos || []
  if (!tramos.length) return 'Sin tramos'
  return `${tramos.length} tramo${tramos.length !== 1 ? 's' : ''}`
}

function formFromRule(regla) {
  return {
    nombre: regla.nombre || '',
    descripcion: regla.descripcion || '',
    tipoVenta: regla.tipoVenta || 'Todos',
    vendedorId: regla.vendedorId ? String(regla.vendedorId) : '',
    modalidad: regla.modalidad || 'FIJA',
    base: regla.base || 'VENDIDO',
    porcentaje: regla.porcentaje ?? '',
    prioridad: regla.prioridad ?? '100',
    vigenteDesde: dateInput(regla.vigenteDesde),
    vigenteHasta: dateInput(regla.vigenteHasta),
    activo: regla.activo !== false,
    tramos: regla.tramos?.length
      ? regla.tramos.map(tramo => ({
          montoDesde: String(tramo.montoDesde ?? ''),
          montoHasta: tramo.montoHasta === null || tramo.montoHasta === undefined ? '' : String(tramo.montoHasta),
          porcentaje: String(tramo.porcentaje ?? ''),
        }))
      : [EMPTY_TRAMO],
  }
}

function toNumber(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function buildPayload(form) {
  const payload = {
    nombre: form.nombre.trim(),
    descripcion: form.descripcion.trim() || null,
    tipoVenta: form.tipoVenta || 'Todos',
    vendedorId: form.vendedorId ? Number(form.vendedorId) : null,
    modalidad: form.modalidad,
    base: form.base,
    prioridad: toNumber(form.prioridad, 100),
    vigenteDesde: form.vigenteDesde || null,
    vigenteHasta: form.vigenteHasta || null,
    activo: Boolean(form.activo),
  }

  if (form.modalidad === 'FIJA') {
    payload.porcentaje = toNumber(form.porcentaje)
    payload.tramos = []
  } else {
    payload.porcentaje = null
    payload.tramos = form.tramos.map(tramo => ({
      montoDesde: toNumber(tramo.montoDesde, 0),
      montoHasta: tramo.montoHasta === '' ? null : toNumber(tramo.montoHasta),
      porcentaje: toNumber(tramo.porcentaje),
    }))
  }
  return payload
}

function validateForm(form) {
  if (!form.nombre.trim()) return 'Nombre requerido'
  if (form.modalidad === 'FIJA' && toNumber(form.porcentaje) === null) return 'Porcentaje requerido'
  if (form.modalidad === 'ESCALA_MONTO') {
    if (!form.tramos.length) return 'Debe existir al menos un tramo'
    for (const tramo of form.tramos) {
      if (toNumber(tramo.montoDesde) === null || toNumber(tramo.porcentaje) === null) return 'Tramos incompletos'
      if (tramo.montoHasta !== '' && toNumber(tramo.montoHasta) === null) return 'Monto hasta invalido'
    }
  }
  return ''
}

export default function ComisionesPage() {
  const metaQuery = useComisionesMeta()
  const reglasQuery = useComisionReglas()
  const { data: usuarios = [] } = useUsuarios()
  const createRule = useCreateComisionRegla()
  const updateRule = useUpdateComisionRegla()
  const deleteRule = useDeleteComisionRegla()
  const [form, setForm] = useState(FORM_DEFAULTS)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState('activos')
  const [tipo, setTipo] = useState('')

  const meta = metaQuery.data || DEFAULT_META
  const reglas = useMemo(() => reglasQuery.data || [], [reglasQuery.data])
  const vendedores = usuarios.filter(user => user.role === 'vendedor' && user.activo !== false)
  const pending = createRule.isPending || updateRule.isPending || deleteRule.isPending

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reglas.filter(regla => {
      const haystack = [
        regla.nombre,
        regla.descripcion,
        regla.tipoVentaLabel,
        regla.vendedorNombre,
        regla.modalidad,
        regla.base,
      ].filter(Boolean).join(' ').toLowerCase()
      const matchesSearch = !q || haystack.includes(q)
      const matchesEstado = estado === 'todos' || (estado === 'activos' ? regla.activo : !regla.activo)
      const matchesTipo = !tipo || (tipo === 'Todos' ? !regla.tipoVenta : regla.tipoVenta === tipo)
      return matchesSearch && matchesEstado && matchesTipo
    })
  }, [reglas, search, estado, tipo])

  const activas = reglas.filter(regla => regla.activo).length
  const escalas = reglas.filter(regla => regla.modalidad === 'ESCALA_MONTO').length
  const porVendedor = reglas.filter(regla => regla.vendedorId).length

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function setTramo(index, field, value) {
    setForm(current => ({
      ...current,
      tramos: current.tramos.map((tramo, i) => i === index ? { ...tramo, [field]: value } : tramo),
    }))
  }

  function addTramo() {
    setForm(current => ({ ...current, tramos: [...current.tramos, { ...EMPTY_TRAMO, montoDesde: '' }] }))
  }

  function removeTramo(index) {
    setForm(current => ({ ...current, tramos: current.tramos.filter((_, i) => i !== index) }))
  }

  function resetForm() {
    setEditingId(null)
    setError('')
    setForm(FORM_DEFAULTS)
  }

  function startEdit(regla) {
    setEditingId(regla.id)
    setError('')
    setForm(formFromRule(regla))
  }

  async function submit(event) {
    event.preventDefault()
    const validation = validateForm(form)
    if (validation) {
      setError(validation)
      return
    }
    try {
      const payload = buildPayload(form)
      if (editingId) await updateRule.mutateAsync({ id: editingId, data: payload })
      else await createRule.mutateAsync(payload)
      resetForm()
    } catch (err) {
      setError(apiError(err, 'No se pudo guardar la regla'))
    }
  }

  async function deactivate(regla) {
    if (!await confirmDialog({ title: 'Confirmar', detail: `Desactivar regla "${regla.nombre}"?`, tone: 'danger' })) return
    try {
      await deleteRule.mutateAsync(regla.id)
      if (editingId === regla.id) resetForm()
    } catch (err) {
      setError(apiError(err, 'No se pudo desactivar la regla'))
    }
  }

  const columns = [
    { key: 'nombre', label: 'Regla', required: true, render: (v, row) => (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{v}</div>
        {row.descripcion && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{row.descripcion}</div>}
      </div>
    ) },
    { key: 'tipoVentaLabel', label: 'Tipo venta', render: v => <Badge tone="blue">{v || 'Todos'}</Badge> },
    { key: 'vendedorNombre', label: 'Vendedor', render: v => v || <span style={muted}>Global</span> },
    { key: 'modalidad', label: 'Modalidad', render: v => v === 'ESCALA_MONTO' ? 'Escala' : 'Unica' },
    { key: 'base', label: 'Base', render: v => <Badge tone={v === 'COBRADO' ? 'amber' : 'green'}>{v === 'COBRADO' ? 'Cobrado' : 'Vendido'}</Badge> },
    { key: 'porcentaje', label: 'Valor', align: 'right', render: (_, row) => <span style={mono}>{fmtRuleValue(row)}</span> },
    { key: 'prioridad', label: 'Prioridad', align: 'right', render: v => <span style={mono}>{v}</span> },
    { key: 'vigenteDesde', label: 'Vigencia', render: (_, row) => <span style={mono}>{dateInput(row.vigenteDesde) || 'sin inicio'} / {dateInput(row.vigenteHasta) || 'sin termino'}</span> },
    { key: 'activo', label: 'Estado', render: v => <Badge tone={v ? 'green' : 'gray'}>{v ? 'Activa' : 'Inactiva'}</Badge> },
    { key: '_acc', label: '', required: true, render: (_, row) => (
      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => startEdit(row)} title="Editar" style={iconBtn('var(--blue)', pending)}>
          <Icon name="edit" size={15} />
        </button>
        <button type="button" onClick={() => deactivate(row)} title="Desactivar" style={iconBtn('var(--red)', pending)}>
          <Icon name="trash" size={15} />
        </button>
      </div>
    ) },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Comisiones"
        subtitle="Reglas comerciales para calculo estimado por vendedor"
        breadcrumb={['Inicio', 'Admin', 'Comisiones']}
        actions={<Btn variant="secondary" icon="refreshCw" size="sm" onClick={() => reglasQuery.refetch()} disabled={reglasQuery.isFetching}>Actualizar</Btn>}
      />

      <div className="kpi-strip">
        <KpiCard label="Reglas" value={reglas.length} icon="list" sublabel="Configuradas" />
        <KpiCard label="Activas" value={activas} icon="check" sublabel="Disponibles" />
        <KpiCard label="Por vendedor" value={porVendedor} icon="user" tone="blue" sublabel="Especificas" />
        <KpiCard label="Escalas" value={escalas} icon="barChart2" tone="amber" sublabel="Por monto" />
      </div>

      <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
          <form onSubmit={submit} style={{ padding: 16, background: 'var(--bg)', borderRight: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{editingId ? 'Editar regla' : 'Nueva regla'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Administra alcance, base y vigencia.</div>
              </div>
              {editingId && <Badge tone="blue">#{editingId}</Badge>}
            </div>

            {error && <div style={{ marginBottom: 14, padding: '9px 11px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, fontWeight: 700 }}>{error}</div>}

            <FormField label="Nombre" required>
              <Input value={form.nombre} onChange={v => setField('nombre', v)} placeholder="Ej: Venta sala vendedor senior" disabled={pending} />
            </FormField>
            <Textarea value={form.descripcion} onChange={v => setField('descripcion', v)} placeholder="Descripcion interna" rows={2} />

            <div style={fieldGrid}>
              <FormField label="Tipo de venta">
                <Select value={form.tipoVenta} onChange={v => setField('tipoVenta', v)} options={meta.tiposVenta || DEFAULT_META.tiposVenta} disabled={pending} />
              </FormField>
              <FormField label="Vendedor">
                <Select
                  value={form.vendedorId}
                  onChange={v => setField('vendedorId', v)}
                  options={[{ value: '', label: 'Global' }, ...vendedores.map(v => ({ value: String(v.id), label: v.nombre || v.email }))]}
                  disabled={pending}
                />
              </FormField>
            </div>

            <div style={fieldGrid}>
              <FormField label="Modalidad">
                <Select value={form.modalidad} onChange={v => setField('modalidad', v)} options={modalidadOptions} disabled={pending} />
              </FormField>
              <FormField label="Base">
                <Select value={form.base} onChange={v => setField('base', v)} options={baseOptions} disabled={pending} />
              </FormField>
            </div>

            {form.modalidad === 'FIJA' ? (
              <FormField label="Porcentaje" required>
                <Input value={form.porcentaje} onChange={v => setField('porcentaje', v)} type="number" step="0.01" min="0" max="100" placeholder="0" disabled={pending} />
              </FormField>
            ) : (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>Tramos</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {form.tramos.map((tramo, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 92px 32px', gap: 8, alignItems: 'center' }}>
                      <Input value={tramo.montoDesde} onChange={v => setTramo(index, 'montoDesde', v)} type="number" min="0" placeholder="Desde" disabled={pending} />
                      <Input value={tramo.montoHasta} onChange={v => setTramo(index, 'montoHasta', v)} type="number" min="0" placeholder="Hasta" disabled={pending} />
                      <Input value={tramo.porcentaje} onChange={v => setTramo(index, 'porcentaje', v)} type="number" step="0.01" min="0" max="100" placeholder="%" disabled={pending} />
                      <button type="button" onClick={() => removeTramo(index)} disabled={pending || form.tramos.length === 1} title="Quitar tramo" style={iconBtn('var(--red)', pending || form.tramos.length === 1)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addTramo} disabled={pending} style={{ ...smallBtn, marginTop: 8 }}>
                  <Icon name="plus" size={13} /> Agregar tramo
                </button>
              </div>
            )}

            <div style={fieldGrid}>
              <FormField label="Vigente desde">
                <Input value={form.vigenteDesde} onChange={v => setField('vigenteDesde', v)} type="date" disabled={pending} />
              </FormField>
              <FormField label="Vigente hasta">
                <Input value={form.vigenteHasta} onChange={v => setField('vigenteHasta', v)} type="date" disabled={pending} />
              </FormField>
            </div>

            <div style={fieldGrid}>
              <FormField label="Prioridad">
                <Input value={form.prioridad} onChange={v => setField('prioridad', v)} type="number" placeholder="100" disabled={pending} />
              </FormField>
              <label style={checkStyle}>
                <input type="checkbox" checked={form.activo} onChange={event => setField('activo', event.target.checked)} disabled={pending} />
                Activa
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn type="submit" variant="primary" size="sm" icon={editingId ? 'check' : 'plus'} disabled={pending}>
                {editingId ? 'Guardar' : 'Crear'}
              </Btn>
              <Btn variant="ghost" size="sm" onClick={resetForm} disabled={pending}>Limpiar</Btn>
            </div>
          </form>

          <div style={{ padding: 16, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <SearchBar placeholder="Buscar regla, vendedor o tipo" value={search} onChange={setSearch} style={{ width: 300 }} />
              <select value={tipo} onChange={event => setTipo(event.target.value)} style={selectMini}>
                <option value="">Todos los tipos</option>
                {(meta.tiposVenta || DEFAULT_META.tiposVenta).map(item => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={estado} onChange={event => setEstado(event.target.value)} style={selectMini}>
                <option value="activos">Activas</option>
                <option value="inactivos">Inactivas</option>
                <option value="todos">Todos los estados</option>
              </select>
            </div>

            {reglasQuery.isLoading ? (
              <div style={emptyState}>Cargando reglas...</div>
            ) : reglasQuery.isError ? (
              <div style={emptyState}>No fue posible cargar reglas</div>
            ) : (
              <Table
                columns={columns}
                rows={filtered}
                emptyMessage="Sin reglas de comision"
                keyboard
                stickyHeader
                ariaLabel="Reglas de comision"
                getRowKey={row => row.id}
                onRowDoubleClick={startEdit}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

const mono = { fontFamily: "'DM Mono', monospace", fontSize: 12 }
const muted = { color: 'var(--text-3)', fontSize: 12 }
const fieldGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }
const selectMini = {
  height: 38,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: '#fff',
  color: 'var(--text-1)',
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '0 12px',
}
const emptyState = {
  padding: '44px 18px',
  textAlign: 'center',
  color: 'var(--text-3)',
  fontSize: 13,
  border: '1px dashed var(--border)',
  borderRadius: 10,
  background: 'var(--bg)',
}
const checkStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 38,
  marginTop: 22,
  fontSize: 13,
  color: 'var(--text-2)',
  fontWeight: 600,
}
const smallBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: '1px solid var(--border)',
  borderRadius: 7,
  background: '#fff',
  color: 'var(--text-2)',
  height: 32,
  padding: '0 10px',
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

function iconBtn(color, disabled = false) {
  return {
    width: 30,
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border)',
    borderRadius: 7,
    background: '#fff',
    color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
  }
}
