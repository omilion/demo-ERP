import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Icon } from '../../components/shared'
import {
  useTrabajadores, useTrabajador, useCreateTrabajador, useUpdateTrabajador, useDeleteTrabajador,
  useRrhhCargos, useRrhhOperativo, useResumenRRHH,
  contratos, liquidaciones, anticipos, licencias, vacaciones, epps, useUploadRrhhDocumento,
} from '../../api/rrhh'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const fmtPeso = n => '$' + (Number(n) || 0).toLocaleString('es-CL')
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-CL') : '—'
const fullName = t => `${t?.nombres || ''} ${t?.apellidoPaterno || ''} ${t?.apellidoMaterno || ''}`.trim()
const dateInput = value => value ? String(value).slice(0, 10) : ''

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}

function isValidDocumentUrl(value) {
  const text = String(value || '').trim()
  return /^\/uploads\/\S+/i.test(text) || /^https?:\/\/\S+/i.test(text)
}

// ── TabBtn ────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children, badge }) {
  return (
    <button onClick={onClick} style={{
      flex: '0 0 auto', minWidth: 112, padding: '12px 14px', fontSize: 12, fontWeight: active ? 700 : 500,
      color: active ? 'var(--green-700)' : 'var(--text-3)',
      background: 'none', border: 'none', borderBottom: active ? '2px solid var(--green-600)' : '2px solid transparent',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      whiteSpace: 'nowrap',
    }}>
      {children}
      {badge != null && badge > 0 && (
        <span style={{ fontSize: 10, background: 'var(--green-100)', color: 'var(--green-700)', padding: '1px 6px', borderRadius: 8 }}>{badge}</span>
      )}
    </button>
  )
}

// ── TabDatos ─────────────────────────────────────────────────────────────
function DataRow({ l, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{l}</span>
      <span style={{ fontSize: 12, textAlign: 'right' }}>{v || '—'}</span>
    </div>
  )
}

function TabDatos({ t }) {
  return (
    <>
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--green-700)' }}>{(t.nombres || '?')[0]}</span>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{fullName(t)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t.cargo || 'Sin cargo'}</div>
          <Badge tone={t.empresa === 'plastimar' ? 'green' : 'amber'}>{t.empresa}</Badge>
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 8 }}>Identificación</div>
      <DataRow l="RUT" v={t.rut} />
      <DataRow l="Nacimiento" v={t.fechaNacimiento} />
      <DataRow l="Estado civil" v={t.estadoCivil} />
      <DataRow l="Cargas familiares" v={t.cargasFamiliares} />
      <DataRow l="Nacionalidad" v={t.nacionalidad} />

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Contacto</div>
      <DataRow l="Email" v={t.email} />
      <DataRow l="Teléfono" v={t.telefono} />
      <DataRow l="Dirección" v={t.direccion} />
      <DataRow l="Comuna" v={t.comuna} />
      <DataRow l="Emergencia" v={t.contactoEmergencia ? `${t.contactoEmergencia} — ${t.numeroEmergencia || ''}` : null} />

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Previsión</div>
      <DataRow l="AFP" v={t.afp} />
      <DataRow l="Salud" v={t.salud} />

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Pago</div>
      <DataRow l="Banco" v={t.banco} />
      <DataRow l="Tipo cuenta" v={t.tipoCuenta} />
      <DataRow l="N° cuenta" v={t.numeroCuenta} />
      <DataRow l="Sueldo líquido" v={t.sueldoLiquido} />

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Contrato</div>
      <DataRow l="Fecha ingreso" v={t.fechaIngreso} />
      <DataRow l="Fecha término" v={fmtDate(t.fechaTermino)} />
      <DataRow l="Tipo contrato" v={t.tipoContrato} />
      <DataRow l="Cargo" v={t.cargo} />
      {t.observacion && <DataRow l="Observación" v={t.observacion} />}
    </>
  )
}

// ── ViewTrabajadorPage ───────────────────────────────────────────────
const RRHH_TAB_CONFIG = {
  contratos: {
    label: 'Contratos', singular: 'contrato', addLabel: 'Nuevo contrato',
    resource: contratos, documentField: 'imagen', required: ['contrato'],
    defaults: { contrato: '', plazo: '', inicio: '', termino: '', estado: true, imagen: '' },
    fields: [
      { key: 'contrato', label: 'Contrato', required: true }, { key: 'plazo', label: 'Plazo' },
      { key: 'inicio', label: 'Inicio', type: 'date' }, { key: 'termino', label: 'Termino', type: 'date' },
      { key: 'estado', label: 'Vigente', type: 'checkbox' },
    ],
    columns: [
      ['Contrato', 'contrato'], ['Plazo', 'plazo'],
      ['Inicio', it => fmtDate(it.inicio)], ['Termino', it => fmtDate(it.termino)],
      ['Estado', it => it.estado ? <Badge tone="green">Vigente</Badge> : <Badge tone="gray">Cerrado</Badge>],
    ],
  },
  liquidaciones: {
    label: 'Liquidaciones', singular: 'liquidacion', addLabel: 'Nueva liquidacion',
    resource: liquidaciones, documentField: 'imagen',
    defaults: { anio: '', mes: '', sueldoBase: '', totalImponible: '', totalHaberes: '', totalDescuentos: '', liquidoPagar: '', horasExtras: '', totalExtras: '', imagen: '', estado: true },
    fields: [
      { key: 'anio', label: 'Ano' }, { key: 'mes', label: 'Mes' },
      { key: 'sueldoBase', label: 'Sueldo base', type: 'number' }, { key: 'totalImponible', label: 'Total imponible', type: 'number' },
      { key: 'totalHaberes', label: 'Total haberes', type: 'number' }, { key: 'totalDescuentos', label: 'Total descuentos', type: 'number' },
      { key: 'liquidoPagar', label: 'Liquido a pagar', type: 'number' }, { key: 'horasExtras', label: 'Horas extra', type: 'number', step: '0.5' },
      { key: 'totalExtras', label: 'Total extras', type: 'number' }, { key: 'estado', label: 'Activa', type: 'checkbox' },
    ],
    columns: [
      ['Periodo', it => [it.anio, it.mes].filter(Boolean).join('-') || '-'],
      ['Sueldo base', it => fmtPeso(it.sueldoBase)], ['Imponible', it => fmtPeso(it.totalImponible)],
      ['Liquido', it => fmtPeso(it.liquidoPagar)], ['Horas extra', it => `${it.horasExtras || 0} hrs`],
    ],
  },
  anticipos: {
    label: 'Anticipos', singular: 'anticipo', addLabel: 'Nuevo anticipo',
    resource: anticipos,
    defaults: { anio: '', mes: '', banco: '', tipoCuenta: '', cuenta: '', fecha: '', monto: '' },
    fields: [
      { key: 'anio', label: 'Ano' }, { key: 'mes', label: 'Mes' }, { key: 'banco', label: 'Banco' },
      { key: 'tipoCuenta', label: 'Tipo cuenta' }, { key: 'cuenta', label: 'Cuenta' },
      { key: 'fecha', label: 'Fecha', type: 'date' }, { key: 'monto', label: 'Monto', type: 'number' },
    ],
    columns: [
      ['Periodo', it => [it.anio, it.mes].filter(Boolean).join('-') || '-'],
      ['Fecha', it => fmtDate(it.fecha)], ['Banco', 'banco'], ['Monto', it => fmtPeso(it.monto)],
    ],
  },
  vacaciones: {
    label: 'Vacaciones', singular: 'vacacion', addLabel: 'Nueva vacacion',
    resource: vacaciones, documentField: 'imagen', required: ['fechaInicio', 'fechaTermino'],
    defaults: { inicioContrato: '', diasPendientes: '', periodo: '', dias: '', saldo: '', fechaInicio: '', fechaTermino: '', imagen: '', estado: true },
    fields: [
      { key: 'inicioContrato', label: 'Inicio contrato', type: 'date' }, { key: 'diasPendientes', label: 'Dias pendientes' },
      { key: 'periodo', label: 'Periodo' }, { key: 'dias', label: 'Dias', type: 'number' }, { key: 'saldo', label: 'Saldo', type: 'number' },
      { key: 'fechaInicio', label: 'Fecha inicio', type: 'date', required: true }, { key: 'fechaTermino', label: 'Fecha termino', type: 'date', required: true },
      { key: 'estado', label: 'Activa', type: 'checkbox' },
    ],
    columns: [
      ['Periodo', 'periodo'], ['Inicio', it => fmtDate(it.fechaInicio)], ['Termino', it => fmtDate(it.fechaTermino)],
      ['Dias', 'dias'], ['Saldo', 'saldo'],
    ],
  },
  licencias: {
    label: 'Licencias', singular: 'licencia', addLabel: 'Nueva licencia',
    resource: licencias, documentField: 'imagen', required: ['inicio', 'termino'],
    defaults: { fecha: '', inicio: '', termino: '', dias: '', tipo: '', reposo: '', imagen: '', estado: true },
    fields: [
      { key: 'fecha', label: 'Fecha', type: 'date' }, { key: 'inicio', label: 'Inicio', type: 'date', required: true },
      { key: 'termino', label: 'Termino', type: 'date', required: true }, { key: 'dias', label: 'Dias', type: 'number' },
      { key: 'tipo', label: 'Tipo' }, { key: 'reposo', label: 'Reposo' }, { key: 'estado', label: 'Activa', type: 'checkbox' },
    ],
    columns: [
      ['Tipo', 'tipo'], ['Inicio', it => fmtDate(it.inicio)], ['Termino', it => fmtDate(it.termino)],
      ['Dias', 'dias'], ['Reposo', 'reposo'],
      ['Estado', it => it.estado ? <Badge tone="green">Activa</Badge> : <Badge tone="gray">Inactiva</Badge>],
    ],
  },
  epps: {
    label: 'EPP', singular: 'EPP', addLabel: 'Nuevo EPP',
    resource: epps, documentField: 'documento', required: ['epp', 'cantidad', 'fechaEntrega'],
    defaults: { epp: '', marca: '', cantidad: '', fechaEntrega: '', documento: '', observacion: '' },
    fields: [
      { key: 'epp', label: 'EPP', required: true }, { key: 'marca', label: 'Marca' },
      { key: 'cantidad', label: 'Cantidad', type: 'number', required: true },
      { key: 'fechaEntrega', label: 'Fecha entrega', type: 'date', required: true },
      { key: 'observacion', label: 'Observacion', wide: true },
    ],
    columns: [
      ['EPP', 'epp'], ['Marca', 'marca'], ['Cantidad', 'cantidad'],
      ['Entrega', it => fmtDate(it.fechaEntrega)], ['Observacion', 'observacion'],
    ],
  },
}

function normalizeSubresourceForm(config, item) {
  const base = { ...config.defaults }
  if (!item) return base
  for (const key of Object.keys(base)) {
    const value = item[key]
    const field = config.fields.find(f => f.key === key)
    if (field?.type === 'date') base[key] = dateInput(value)
    else if (field?.type === 'checkbox') base[key] = value !== false
    else base[key] = value ?? ''
  }
  if (config.documentField) {
    const documentUrl = item[config.documentField]
    base[config.documentField] = isValidDocumentUrl(documentUrl) ? String(documentUrl).trim() : ''
  }
  return base
}

function RrhhInputField({ field, value, onChange }) {
  if (field.type === 'checkbox') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
        {field.label}
      </label>
    )
  }
  return (
    <div style={{ gridColumn: field.wide ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{field.label}{field.required ? ' *' : ''}</div>
      <input type={field.type || 'text'} step={field.step} value={value ?? ''} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
    </div>
  )
}

function RrhhDocumentField({ trabajadorId, value, onChange, disabled }) {
  const upload = useUploadRrhhDocumento()
  const hasValidDocument = isValidDocumentUrl(value)
  const handleFile = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await readAsDataUrl(file)
      const uploaded = await upload.mutateAsync({ trabajadorId, dataUrl })
      onChange(uploaded.url)
      event.target.value = ''
    } catch (error) {
      alert(error?.response?.data?.error || error.message || 'No se pudo subir el documento')
    }
  }
  return (
    <div style={{ gridColumn: '1 / -1', border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Documento adjunto</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>PDF, JPG, PNG o WEBP. Maximo 10 MB.</div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '7px 12px', borderRadius: 7, background: 'var(--green-700)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: disabled || upload.isPending ? 'default' : 'pointer', opacity: disabled || upload.isPending ? 0.6 : 1 }}>
          <Icon name="upload" size={14} />
          {upload.isPending ? 'Subiendo...' : 'Subir documento'}
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={handleFile} disabled={disabled || upload.isPending} style={{ display: 'none' }} />
        </label>
      </div>
      {hasValidDocument && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, fontSize: 12 }}>
          <span style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
          <a href={value} target="_blank" rel="noreferrer" style={{ color: 'var(--green-700)', fontWeight: 700, whiteSpace: 'nowrap' }}>Ver documento</a>
        </div>
      )}
    </div>
  )
}

function SubresourceFormModal({ trabajadorId, config, item, onClose }) {
  const [form, setForm] = useState(() => normalizeSubresourceForm(config, item))
  const create = config.resource.useCreate()
  const update = config.resource.useUpdate()
  const pending = create.isPending || update.isPending
  const isEdit = !!item?.id
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const handleSave = () => {
    const missing = (config.required || []).find(key => String(form[key] ?? '').trim() === '')
    if (missing) {
      const field = config.fields.find(f => f.key === missing)
      return alert(`${field?.label || missing} es requerido`)
    }
    const payload = { ...form, trabajadorId }
    if (isEdit) update.mutate({ id: item.id, ...payload }, { onSuccess: onClose })
    else create.mutate(payload, { onSuccess: onClose })
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 560, background: 'oklch(0 0 0 / 0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 18px 50px oklch(0 0 0 / 0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{isEdit ? `Editar ${config.singular}` : config.addLabel}</div>
          <button type="button" onClick={onClose} style={{ color: 'var(--text-3)', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          {config.fields.map(field => <RrhhInputField key={field.key} field={field} value={form[field.key]} onChange={value => set(field.key, value)} />)}
          {config.documentField && <RrhhDocumentField trabajadorId={trabajadorId} value={form[config.documentField]} onChange={value => set(config.documentField, value)} disabled={pending} />}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancelar</Btn>
          <Btn size="sm" icon="check" onClick={handleSave} disabled={pending}>{pending ? 'Guardando...' : 'Guardar'}</Btn>
        </div>
      </div>
    </div>
  )
}

function EditableRrhhTab({ trabajadorId, config, items = [], canWrite }) {
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const documentField = config.documentField
  const documentBtnBase = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    minHeight: 28,
    padding: '4px 9px',
    borderRadius: 7,
    fontSize: 11,
    fontWeight: 700,
  }
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{config.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{items?.length || 0} registros</div>
        </div>
        {canWrite && <Btn size="sm" icon="plus" onClick={() => setCreating(true)}>{config.addLabel}</Btn>}
      </div>
      {(!items || items.length === 0) && <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Sin registros</div>}
      {items?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(it => (
            <div key={it.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '4px 14px' }}>
                {config.columns.map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '2px 0' }}>
                    <span style={{ color: 'var(--text-3)' }}>{l}</span>
                    <span style={{ textAlign: 'right', fontWeight: 500 }}>{typeof v === 'function' ? v(it) : it[v] || '-'}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {documentField && (isValidDocumentUrl(it[documentField]) ? (
                  <a href={String(it[documentField]).trim()} target="_blank" rel="noreferrer" style={{ ...documentBtnBase, border: '1px solid var(--green-100)', background: '#fff', color: 'var(--green-700)' }}>
                    <Icon name="fileText" size={13} /> Ver documento
                  </a>
                ) : (
                  <button type="button" disabled title="No hay documento" style={{ ...documentBtnBase, border: '1px solid var(--border)', background: 'oklch(0.95 0.003 220)', color: 'var(--text-3)', cursor: 'not-allowed', opacity: 0.85 }}>
                    <Icon name="fileText" size={13} /> Sin documento
                  </button>
                ))}
                {canWrite && <Btn variant="secondary" size="xs" icon="edit" onClick={() => setEditing(it)}>Editar</Btn>}
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && <SubresourceFormModal key={`${config.label}-new`} trabajadorId={trabajadorId} config={config} onClose={() => setCreating(false)} />}
      {editing && <SubresourceFormModal key={`${config.label}-${editing.id}`} trabajadorId={trabajadorId} config={config} item={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ViewTrabajadorPage({ trabajador, onClose, onEdit, canWrite, canDelete }) {
  const [tab, setTab] = useState('datos')
  const { data: full, isLoading } = useTrabajador(trabajador.id)
  const t = full || trabajador
  const del = useDeleteTrabajador()
  const name = fullName(t) || 'Trabajador'

  const handleDelete = () => {
    if (!canDelete) return
    if (!confirm(`¿Dar de baja a ${name}? (estado=false)`)) return
    del.mutate(t.id, { onSuccess: onClose })
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title={name}
        subtitle={t.rut || 'Ficha trabajador'}
        breadcrumb={['Inicio', 'RRHH', 'Trabajador']}
        actions={(
          <>
            {canWrite && <Btn variant="secondary" size="sm" icon="edit" onClick={() => onEdit(t)}>Editar</Btn>}
            {canDelete && <Btn variant="secondary" size="sm" onClick={handleDelete} disabled={del.isPending} style={{ color: 'var(--red)' }}>Baja</Btn>}
            <Btn variant="ghost" size="sm" icon="x" onClick={onClose}>Cerrar</Btn>
          </>
        )}
      />

      <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
          <TabBtn active={tab === 'datos'} onClick={() => setTab('datos')}>Datos</TabBtn>
          <TabBtn active={tab === 'contratos'} onClick={() => setTab('contratos')} badge={full?.contratos?.length}>Contratos</TabBtn>
          <TabBtn active={tab === 'liquidaciones'} onClick={() => setTab('liquidaciones')} badge={full?.liquidaciones?.length}>Liquidaciones</TabBtn>
          <TabBtn active={tab === 'anticipos'} onClick={() => setTab('anticipos')} badge={full?.anticipos?.length}>Anticipos</TabBtn>
          <TabBtn active={tab === 'vacaciones'} onClick={() => setTab('vacaciones')} badge={full?.vacaciones?.length}>Vacaciones</TabBtn>
          <TabBtn active={tab === 'licencias'} onClick={() => setTab('licencias')} badge={full?.licencias?.length}>Licencias</TabBtn>
          <TabBtn active={tab === 'epps'} onClick={() => setTab('epps')} badge={full?.epps?.length}>EPP</TabBtn>
        </div>

        <div style={{ padding: '18px 22px' }}>
          {isLoading && !full && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>}
          {tab === 'datos' && <TabDatos t={t} />}
          {tab === 'contratos' && <EditableRrhhTab trabajadorId={t.id} config={RRHH_TAB_CONFIG.contratos} items={full?.contratos} canWrite={canWrite} />}
          {tab === 'liquidaciones' && <EditableRrhhTab trabajadorId={t.id} config={RRHH_TAB_CONFIG.liquidaciones} items={full?.liquidaciones} canWrite={canWrite} />}
          {tab === 'anticipos' && <EditableRrhhTab trabajadorId={t.id} config={RRHH_TAB_CONFIG.anticipos} items={full?.anticipos} canWrite={canWrite} />}
          {tab === 'vacaciones' && <EditableRrhhTab trabajadorId={t.id} config={RRHH_TAB_CONFIG.vacaciones} items={full?.vacaciones} canWrite={canWrite} />}
          {tab === 'licencias' && <EditableRrhhTab trabajadorId={t.id} config={RRHH_TAB_CONFIG.licencias} items={full?.licencias} canWrite={canWrite} />}
          {tab === 'epps' && <EditableRrhhTab trabajadorId={t.id} config={RRHH_TAB_CONFIG.epps} items={full?.epps} canWrite={canWrite} />}
        </div>
      </section>
    </main>
  )
}

// ── TrabajadorFormModal ─────────────────────────────────────────────────
function TrabajadorFormModal({ trabajador, onClose }) {
  const isEdit = !!trabajador?.id
  const [form, setForm] = useState({
    empresa: trabajador?.empresa || 'plastimar',
    apellidoPaterno: trabajador?.apellidoPaterno || '',
    apellidoMaterno: trabajador?.apellidoMaterno || '',
    nombres: trabajador?.nombres || '',
    rut: trabajador?.rut || '',
    fechaNacimiento: trabajador?.fechaNacimiento || '',
    estadoCivil: trabajador?.estadoCivil || '',
    cargasFamiliares: trabajador?.cargasFamiliares || '',
    direccion: trabajador?.direccion || '',
    comuna: trabajador?.comuna || '',
    nacionalidad: trabajador?.nacionalidad || '',
    afp: trabajador?.afp || '',
    salud: trabajador?.salud || '',
    telefono: trabajador?.telefono || '',
    contactoEmergencia: trabajador?.contactoEmergencia || '',
    numeroEmergencia: trabajador?.numeroEmergencia || '',
    email: trabajador?.email || '',
    banco: trabajador?.banco || '',
    tipoCuenta: trabajador?.tipoCuenta || '',
    numeroCuenta: trabajador?.numeroCuenta || '',
    cargo: trabajador?.cargo || '',
    fechaIngreso: trabajador?.fechaIngreso || '',
    fechaTermino: trabajador?.fechaTermino ? trabajador.fechaTermino.slice(0, 10) : '',
    tipoContrato: trabajador?.tipoContrato || '',
    sueldoLiquido: trabajador?.sueldoLiquido || '',
    observacion: trabajador?.observacion || '',
  })
  const create = useCreateTrabajador()
  const update = useUpdateTrabajador()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const handleSave = () => {
    if (!form.nombres.trim() || !form.apellidoPaterno.trim() || !form.rut.trim()) {
      return alert('Nombres, apellido paterno y RUT son requeridos')
    }
    if (isEdit) update.mutate({ id: trabajador.id, ...form }, { onSuccess: onClose })
    else create.mutate(form, { onSuccess: onClose })
  }
  const pending = create.isPending || update.isPending
  const inp = { width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'oklch(0 0 0 / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(640px, 100%)', maxHeight: '90vh', overflowY: 'auto',
        background: '#fff', borderRadius: 12, padding: '18px 20px',
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{isEdit ? 'Editar trabajador' : 'Nuevo trabajador'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>Empresa *</div>
            <select value={form.empresa} onChange={e => set('empresa', e.target.value)} style={inp}>
              <option value="plastimar">Plastimar</option>
              <option value="allegro">Allegro</option>
            </select>
          </div>
          {[
            ['Nombres *', 'nombres'], ['Apellido paterno *', 'apellidoPaterno'], ['Apellido materno', 'apellidoMaterno'],
            ['RUT *', 'rut'], ['Fecha nacimiento', 'fechaNacimiento'], ['Estado civil', 'estadoCivil'],
            ['Cargas familiares', 'cargasFamiliares'], ['Nacionalidad', 'nacionalidad'],
            ['Email', 'email'], ['Teléfono', 'telefono'],
            ['Dirección', 'direccion'], ['Comuna', 'comuna'],
            ['Contacto emergencia', 'contactoEmergencia'], ['N° emergencia', 'numeroEmergencia'],
            ['AFP', 'afp'], ['Salud', 'salud'],
            ['Banco', 'banco'], ['Tipo cuenta', 'tipoCuenta'], ['N° cuenta', 'numeroCuenta'],
            ['Cargo', 'cargo'], ['Fecha ingreso', 'fechaIngreso'], ['Fecha término', 'fechaTermino'],
            ['Tipo contrato', 'tipoContrato'], ['Sueldo líquido', 'sueldoLiquido'],
          ].map(([label, key]) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{label}</div>
              <input type={key === 'fechaTermino' ? 'date' : 'text'} value={form[key]} onChange={e => set(key, e.target.value)} style={inp} />
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>Observación</div>
          <textarea value={form.observacion} onChange={e => set('observacion', e.target.value)} rows={2} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ padding: '7px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: 'var(--text-2)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={pending} style={{ padding: '7px 14px', background: 'var(--green-600)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{pending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────
function OperativoList({ title, items = [], emptyText, renderMeta, onTrabajadorClick }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{title}</div>
        <Badge tone={items.length ? 'amber' : 'green'}>{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: '14px 10px', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-3)', fontSize: 12, textAlign: 'center' }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.slice(0, 5).map(item => {
            const trabajador = item.trabajador || item
            return (
              <button
                key={`${title}-${item.id || trabajador.id}`}
                type="button"
                onClick={() => trabajador?.id && onTrabajadorClick?.(trabajador)}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: '#fff',
                  padding: '8px 10px',
                  cursor: trabajador?.id ? 'pointer' : 'default',
                  textAlign: 'left',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trabajador?.nombre || fullName(trabajador) || '-'}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trabajador?.cargo || 'Sin cargo'} - {trabajador?.empresa || '-'}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>{renderMeta?.(item)}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RrhhOperativoPanel({ data, onCargoClick, onTrabajadorClick }) {
  const alertas = data?.alertas || {}
  const incompletos = [
    ...(data?.sinSueldo || []).map(item => ({ ...item, motivo: 'Sin sueldo' })),
    ...(data?.sinCargo || []).map(item => ({ ...item, motivo: 'Sin cargo' })),
    ...(data?.sinFechaIngreso || []).map(item => ({ ...item, motivo: 'Sin ingreso' })),
  ]
  const datosIncompletos = (alertas.sinSueldo || 0) + (alertas.sinCargo || 0) + (alertas.sinFechaIngreso || 0)
  const eventos = [
    { label: 'Contratos vencen', value: alertas.contratosPorVencer || 0, tone: alertas.contratosPorVencer ? 'amber' : 'neutral', icon: 'fileText' },
    { label: 'Licencias activas', value: alertas.licenciasActivas || 0, tone: alertas.licenciasActivas ? 'amber' : 'neutral', icon: 'calendar' },
    { label: 'Vacaciones', value: alertas.vacacionesProgramadas || 0, tone: alertas.vacacionesProgramadas ? 'blue' : 'neutral', icon: 'clock' },
    { label: 'Datos incompletos', value: datosIncompletos, tone: datosIncompletos ? 'red' : 'neutral', icon: 'alertTriangle' },
  ]

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Operativo RRHH</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{(data?.totalActivos || 0).toLocaleString('es-CL')} activos - ventana {data?.dias || 30} dias</div>
        </div>
        {data?.rrhhSchemaDisponible === false && <Badge tone="amber">Schema pendiente</Badge>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
        {eventos.map(item => (
          <div key={item.label} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: item.tone === 'red' ? 'var(--red)' : item.tone === 'amber' ? 'var(--amber)' : 'var(--green-600)' }}><Icon name={item.icon} size={15} /></span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{item.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Dotacion por cargo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(data?.dotacionPorCargo || []).slice(0, 7).map(item => (
              <button
                key={item.cargo}
                type="button"
                onClick={() => item.cargo !== 'Sin cargo' && onCargoClick?.(item.cargo)}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: '7px 9px', cursor: item.cargo !== 'Sin cargo' ? 'pointer' : 'default', textAlign: 'left' }}
              >
                <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.cargo}</span>
                <Badge tone="gray">{item.total}</Badge>
              </button>
            ))}
          </div>
        </div>
        <OperativoList title="Contratos por vencer" items={data?.contratosPorVencer || []} emptyText="Sin vencimientos" renderMeta={item => fmtDate(item.termino)} onTrabajadorClick={onTrabajadorClick} />
        <OperativoList title="Ausencias" items={[...(data?.licenciasActivas || []), ...(data?.vacacionesProgramadas || [])]} emptyText="Sin ausencias" renderMeta={item => fmtDate(item.termino || item.fechaInicio)} onTrabajadorClick={onTrabajadorClick} />
        <OperativoList title="Datos incompletos" items={incompletos} emptyText="Datos base OK" renderMeta={item => item.motivo} onTrabajadorClick={onTrabajadorClick} />
      </div>
    </div>
  )
}

export default function RrhhPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWriteRrhh = can(user, 'rrhh', 'write')
  const canDeleteRrhh = can(user, 'rrhh', 'delete')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [cargo, setCargo] = useState('')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    clearTimeout(ref.current)
    ref.current = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(ref.current)
  }, [search])

  const params = { estado: 'true' }
  if (debounced) params.search = debounced
  if (empresa) params.empresa = empresa
  if (cargo) params.cargo = cargo

  const { data: result = { items: [], total: 0 }, isLoading } = useTrabajadores(params)
  const { data: cargosResult = [] } = useRrhhCargos(empresa ? { empresa } : {})
  const { data: resumen } = useResumenRRHH(empresa)
  const operativoParams = { dias: 30 }
  if (empresa) operativoParams.empresa = empresa
  if (cargo) operativoParams.cargo = cargo
  const { data: operativo = { alertas: {}, dotacionPorCargo: [], totalActivos: 0 } } = useRrhhOperativo(operativoParams)
  const trabajadores = result.items ?? []
  const total = result.total ?? 0
  const cargoSource = Array.isArray(cargosResult) ? cargosResult : (cargosResult.items ?? [])
  const cargos = [...new Set(cargoSource.map(c => typeof c === 'string' ? c : (c.cargo || c.nombre || c.name)).filter(Boolean))]
  const selectOperativoTrabajador = trabajador => {
    if (!trabajador?.id) return
    navigate(`/rrhh/${trabajador.id}`)
  }

  const cols = [
    {
      key: 'nombres', label: 'Trabajador', wrap: true,
      render: (_, row) => (
        <div style={{ maxWidth: 240 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{fullName(row)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{row.rut}</div>
        </div>
      ),
    },
    { key: 'empresa', label: 'Empresa', render: v => <Badge tone={v === 'plastimar' ? 'green' : 'amber'}>{v}</Badge> },
    { key: 'cargo', label: 'Cargo', render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'tipoContrato', label: 'Contrato', render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '—'}</span> },
    { key: 'fechaIngreso', label: 'Ingreso', render: v => <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace" }}>{v || '—'}</span> },
    { key: 'telefono', label: 'Teléfono', render: v => <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace" }}>{v || '—'}</span> },
    { key: 'sueldoLiquido', label: 'Líquido', render: v => <span style={{ fontSize: 12 }}>{v ? `$${v}` : '—'}</span> },
  ]

  const plastimarCount = resumen?.porEmpresa?.find(e => e.empresa === 'plastimar')?.count || 0
  const allegroCount = resumen?.porEmpresa?.find(e => e.empresa === 'allegro')?.count || 0

  return (
    <main className="page page-wide">
      <PageHeader
        title="RRHH — Trabajadores"
        subtitle={`${total.toLocaleString('es-CL')} trabajadores ${empresa ? `en ${empresa}` : 'activos'}`}
        breadcrumb={['Inicio', 'RRHH', 'Trabajadores']}
        actions={canWriteRrhh ? <Btn variant="primary" icon="plus" size="sm" onClick={() => setCreating(true)}>Nuevo</Btn> : null}
      />

      <div className="kpi-strip">
        <KpiCard label="Total activos" value={resumen?.activos?.toLocaleString('es-CL') ?? '—'} icon="users" sublabel="Plantilla vigente" />
        <KpiCard label="Plastimar" value={plastimarCount} icon="warehouse" sublabel="Empresa principal" />
        <KpiCard label="Allegro" value={allegroCount} icon="warehouse" tone="warning" sublabel="Filial" />
        <KpiCard label="Mostrando" value={trabajadores.length} icon="filter" sublabel={debounced ? `Filtro: ${debounced}` : 'Sin filtro'} />
      </div>

      <RrhhOperativoPanel
        data={operativo}
        onCargoClick={setCargo}
        onTrabajadorClick={selectOperativoTrabajador}
      />

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{total.toLocaleString('es-CL')} trabajadores</span>
            <select value={empresa} onChange={e => { setEmpresa(e.target.value); setCargo('') }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}>
              <option value="">Todas las empresas</option>
              <option value="plastimar">Plastimar</option>
              <option value="allegro">Allegro</option>
            </select>
            <select value={cargo} onChange={e => setCargo(e.target.value)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, maxWidth: 180 }}>
              <option value="">Todos los cargos</option>
              {cargos.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <SearchBar placeholder="Nombre, RUT…" value={search} onChange={setSearch} style={{ width: 'min(280px, 100%)' }} />
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={trabajadores} emptyMessage="Sin trabajadores" onRowClick={row => navigate(`/rrhh/${row.id}`)} ariaLabel="Trabajadores" getRowKey={row => row.id} />
        }
        {total > (result.limit ?? 100) && (
          <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
            Mostrando {result.limit} de {total.toLocaleString('es-CL')}. Usa el buscador para filtrar.
          </div>
        )}
      </div>

      {creating && canWriteRrhh && <TrabajadorFormModal onClose={() => setCreating(false)} />}
      {editing && canWriteRrhh && <TrabajadorFormModal trabajador={editing} onClose={() => setEditing(null)} />}
    </main>
  )
}

export function TrabajadorDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWriteRrhh = can(user, 'rrhh', 'write')
  const canDeleteRrhh = can(user, 'rrhh', 'delete')
  const [editing, setEditing] = useState(null)
  const trabajadorId = Number(id)

  return (
    <>
      <ViewTrabajadorPage
        trabajador={{ id: trabajadorId }}
        canWrite={canWriteRrhh}
        canDelete={canDeleteRrhh}
        onClose={() => navigate('/rrhh')}
        onEdit={setEditing}
      />
      {editing && canWriteRrhh && <TrabajadorFormModal trabajador={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
