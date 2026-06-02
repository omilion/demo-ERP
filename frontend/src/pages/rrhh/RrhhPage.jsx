import { useState, useEffect, useRef } from 'react'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Icon } from '../../components/shared'
import {
  useTrabajadores, useTrabajador, useCreateTrabajador, useUpdateTrabajador, useDeleteTrabajador,
  useRrhhCargos, useRrhhOperativo, useResumenRRHH,
} from '../../api/rrhh'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const fmtPeso = n => '$' + (Number(n) || 0).toLocaleString('es-CL')
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-CL') : '—'
const fullName = t => `${t.nombres} ${t.apellidoPaterno} ${t.apellidoMaterno || ''}`.trim()

// ── TabBtn ────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children, badge }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 8px', fontSize: 12, fontWeight: active ? 700 : 500,
      color: active ? 'var(--green-700)' : 'var(--text-3)',
      background: 'none', border: 'none', borderBottom: active ? '2px solid var(--green-600)' : '2px solid transparent',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
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

// ── ListTab genérica ────────────────────────────────────────────────────
function ListTab({ items, columns, emptyText }) {
  if (!items || items.length === 0) return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{emptyText}</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(it => (
        <div key={it.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
          {columns.map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
              <span style={{ color: 'var(--text-3)' }}>{l}</span>
              <span style={{ textAlign: 'right' }}>{typeof v === 'function' ? v(it) : it[v] || '—'}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── ViewTrabajadorPanel ───────────────────────────────────────────────
function ViewTrabajadorPanel({ trabajador, onClose, onEdit, canWrite, canDelete }) {
  const [tab, setTab] = useState('datos')
  const { data: full, isLoading } = useTrabajador(trabajador.id)
  const t = full || trabajador
  const del = useDeleteTrabajador()

  const handleDelete = () => {
    if (!canDelete) return
    if (!confirm(`¿Dar de baja a ${fullName(t)}? (estado=false)`)) return
    del.mutate(t.id, { onSuccess: onClose })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end', background: 'oklch(0 0 0 / 0.4)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(460px, 100vw)', height: '100%', background: '#fff',
        boxShadow: '-8px 0 32px oklch(0 0 0 / 0.12)', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(t)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace", marginTop: 2 }}>{t.rut}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {canWrite && <button onClick={() => onEdit(t)} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }}>Editar</button>}
            {canDelete && <button onClick={handleDelete} disabled={del.isPending} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 6, border: '1px solid var(--red, #fca5a5)', background: '#fff', cursor: 'pointer', color: 'var(--red, #991b1b)' }}>Baja</button>}
            <button onClick={onClose} style={{ color: 'var(--text-3)', padding: 4, background: 'none', border: 'none' }}><Icon name="x" size={18} /></button>
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
          <TabBtn active={tab === 'datos'} onClick={() => setTab('datos')}>Datos</TabBtn>
          <TabBtn active={tab === 'contratos'} onClick={() => setTab('contratos')} badge={full?.contratos?.length}>Contratos</TabBtn>
          <TabBtn active={tab === 'liquidaciones'} onClick={() => setTab('liquidaciones')} badge={full?.liquidaciones?.length}>Liq.</TabBtn>
          <TabBtn active={tab === 'anticipos'} onClick={() => setTab('anticipos')} badge={full?.anticipos?.length}>Ant.</TabBtn>
          <TabBtn active={tab === 'vacaciones'} onClick={() => setTab('vacaciones')} badge={full?.vacaciones?.length}>Vac.</TabBtn>
          <TabBtn active={tab === 'licencias'} onClick={() => setTab('licencias')} badge={full?.licencias?.length}>Lic.</TabBtn>
          <TabBtn active={tab === 'epps'} onClick={() => setTab('epps')} badge={full?.epps?.length}>EPP</TabBtn>
        </div>

        <div style={{ flex: 1, padding: '14px 18px', overflowY: 'auto' }}>
          {isLoading && !full && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>}
          {tab === 'datos' && <TabDatos t={t} />}
          {tab === 'contratos' && <ListTab items={full?.contratos} emptyText="Sin contratos" columns={[
            ['Contrato', 'contrato'], ['Plazo', 'plazo'],
            ['Inicio', it => fmtDate(it.inicio)], ['Término', it => fmtDate(it.termino)],
            ['Estado', it => it.estado ? <Badge tone="green">Vigente</Badge> : <Badge tone="gray">Cerrado</Badge>],
          ]} />}
          {tab === 'liquidaciones' && <ListTab items={full?.liquidaciones} emptyText="Sin liquidaciones" columns={[
            ['Periodo', it => `${it.anio}-${it.mes}`],
            ['Sueldo base', it => fmtPeso(it.sueldoBase)],
            ['Imponible', it => fmtPeso(it.totalImponible)],
            ['Líquido', it => fmtPeso(it.liquidoPagar)],
            ['Horas extra', it => `${it.horasExtras || 0} hrs`],
          ]} />}
          {tab === 'anticipos' && <ListTab items={full?.anticipos} emptyText="Sin anticipos" columns={[
            ['Periodo', it => `${it.anio}-${it.mes}`],
            ['Fecha', it => fmtDate(it.fecha)],
            ['Banco', 'banco'],
            ['Monto', it => fmtPeso(it.monto)],
          ]} />}
          {tab === 'vacaciones' && <ListTab items={full?.vacaciones} emptyText="Sin vacaciones" columns={[
            ['Periodo', 'periodo'],
            ['Inicio', it => fmtDate(it.fechaInicio)],
            ['Término', it => fmtDate(it.fechaTermino)],
            ['Días', 'dias'],
            ['Saldo', 'saldo'],
          ]} />}
          {tab === 'licencias' && <ListTab items={full?.licencias} emptyText="Sin licencias" columns={[
            ['Tipo', 'tipo'],
            ['Inicio', it => fmtDate(it.inicio)],
            ['Término', it => fmtDate(it.termino)],
            ['Días', 'dias'],
            ['Reposo', 'reposo'],
          ]} />}
          {tab === 'epps' && <ListTab items={full?.epps} emptyText="Sin EPP entregados" columns={[
            ['EPP', 'epp'], ['Marca', 'marca'], ['Cantidad', 'cantidad'],
            ['Entrega', it => fmtDate(it.fechaEntrega)], ['Observación', 'observacion'],
          ]} />}
        </div>
      </div>
    </div>
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
  const { user } = useAuthStore()
  const canWriteRrhh = can(user, 'rrhh', 'write')
  const canDeleteRrhh = can(user, 'rrhh', 'delete')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [cargo, setCargo] = useState('')
  const [selected, setSelected] = useState(null)
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
    setSelected({
      id: trabajador.id,
      nombres: trabajador.nombre || trabajador.nombres || '',
      apellidoPaterno: trabajador.apellidoPaterno || '',
      apellidoMaterno: trabajador.apellidoMaterno || '',
      rut: trabajador.rut || '',
      empresa: trabajador.empresa || '',
      cargo: trabajador.cargo || '',
    })
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
          : <Table columns={cols} rows={trabajadores} emptyMessage="Sin trabajadores" onRowClick={row => setSelected(row)} ariaLabel="Trabajadores" getRowKey={row => row.id} />
        }
        {total > (result.limit ?? 100) && (
          <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
            Mostrando {result.limit} de {total.toLocaleString('es-CL')}. Usa el buscador para filtrar.
          </div>
        )}
      </div>

      {selected && <ViewTrabajadorPanel trabajador={selected} canWrite={canWriteRrhh} canDelete={canDeleteRrhh} onClose={() => setSelected(null)} onEdit={t => { setSelected(null); setEditing(t) }} />}
      {creating && canWriteRrhh && <TrabajadorFormModal onClose={() => setCreating(false)} />}
      {editing && canWriteRrhh && <TrabajadorFormModal trabajador={editing} onClose={() => setEditing(null)} />}
    </main>
  )
}
