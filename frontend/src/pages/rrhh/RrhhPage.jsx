import { useState, useEffect, useRef } from 'react'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Icon } from '../../components/shared'
import {
  useTrabajadores, useTrabajador, useCreateTrabajador, useUpdateTrabajador, useDeleteTrabajador,
  useResumenRRHH,
  contratos, liquidaciones, anticipos, licencias, vacaciones, epps, hojasVida,
} from '../../api/rrhh'

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
function TabDatos({ t }) {
  const Row = ({ l, v }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{l}</span>
      <span style={{ fontSize: 12, textAlign: 'right' }}>{v || '—'}</span>
    </div>
  )
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
      <Row l="RUT" v={t.rut} />
      <Row l="Nacimiento" v={t.fechaNacimiento} />
      <Row l="Estado civil" v={t.estadoCivil} />
      <Row l="Cargas familiares" v={t.cargasFamiliares} />
      <Row l="Nacionalidad" v={t.nacionalidad} />

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Contacto</div>
      <Row l="Email" v={t.email} />
      <Row l="Teléfono" v={t.telefono} />
      <Row l="Dirección" v={t.direccion} />
      <Row l="Comuna" v={t.comuna} />
      <Row l="Emergencia" v={t.contactoEmergencia ? `${t.contactoEmergencia} — ${t.numeroEmergencia || ''}` : null} />

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Previsión</div>
      <Row l="AFP" v={t.afp} />
      <Row l="Salud" v={t.salud} />

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Pago</div>
      <Row l="Banco" v={t.banco} />
      <Row l="Tipo cuenta" v={t.tipoCuenta} />
      <Row l="N° cuenta" v={t.numeroCuenta} />
      <Row l="Sueldo líquido" v={t.sueldoLiquido} />

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginTop: 14, marginBottom: 8 }}>Contrato</div>
      <Row l="Fecha ingreso" v={t.fechaIngreso} />
      <Row l="Fecha término" v={fmtDate(t.fechaTermino)} />
      <Row l="Tipo contrato" v={t.tipoContrato} />
      <Row l="Cargo" v={t.cargo} />
      {t.observacion && <Row l="Observación" v={t.observacion} />}
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
function ViewTrabajadorPanel({ trabajador, onClose, onEdit }) {
  const [tab, setTab] = useState('datos')
  const { data: full, isLoading } = useTrabajador(trabajador.id)
  const t = full || trabajador
  const del = useDeleteTrabajador()

  const handleDelete = () => {
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
            <button onClick={() => onEdit(t)} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }}>Editar</button>
            <button onClick={handleDelete} disabled={del.isPending} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 6, border: '1px solid var(--red, #fca5a5)', background: '#fff', cursor: 'pointer', color: 'var(--red, #991b1b)' }}>Baja</button>
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
export default function RrhhPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [empresa, setEmpresa] = useState('')
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

  const { data: result = { items: [], total: 0 }, isLoading } = useTrabajadores(params)
  const { data: resumen } = useResumenRRHH(empresa)
  const trabajadores = result.items ?? []
  const total = result.total ?? 0

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
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: 'clamp(12px, 2vw, 24px)' }}>
      <PageHeader
        title="RRHH — Trabajadores"
        subtitle={`${total.toLocaleString('es-CL')} trabajadores ${empresa ? `en ${empresa}` : 'activos'}`}
        breadcrumb={['Inicio', 'RRHH', 'Trabajadores']}
        actions={<Btn variant="primary" icon="plus" size="sm" onClick={() => setCreating(true)}>Nuevo</Btn>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total activos" value={resumen?.activos?.toLocaleString('es-CL') ?? '—'} icon="users" sublabel="Plantilla vigente" />
        <KpiCard label="Plastimar" value={plastimarCount} icon="warehouse" sublabel="Empresa principal" />
        <KpiCard label="Allegro" value={allegroCount} icon="warehouse" tone="warning" sublabel="Filial" />
        <KpiCard label="Mostrando" value={trabajadores.length} icon="filter" sublabel={debounced ? `Filtro: ${debounced}` : 'Sin filtro'} />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{total.toLocaleString('es-CL')} trabajadores</span>
            <select value={empresa} onChange={e => setEmpresa(e.target.value)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}>
              <option value="">Todas las empresas</option>
              <option value="plastimar">Plastimar</option>
              <option value="allegro">Allegro</option>
            </select>
          </div>
          <SearchBar placeholder="Nombre, RUT…" value={search} onChange={setSearch} style={{ width: 'min(280px, 100%)' }} />
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={trabajadores} emptyMessage="Sin trabajadores" onRowClick={row => setSelected(row)} />
        }
        {total > (result.limit ?? 100) && (
          <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
            Mostrando {result.limit} de {total.toLocaleString('es-CL')}. Usa el buscador para filtrar.
          </div>
        )}
      </div>

      {selected && <ViewTrabajadorPanel trabajador={selected} onClose={() => setSelected(null)} onEdit={t => { setSelected(null); setEditing(t) }} />}
      {creating && <TrabajadorFormModal onClose={() => setCreating(false)} />}
      {editing && <TrabajadorFormModal trabajador={editing} onClose={() => setEditing(null)} />}
    </main>
  )
}
