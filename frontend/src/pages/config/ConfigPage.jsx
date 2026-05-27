import { useState } from 'react'
import { PageHeader, Btn, Tabs, Table, Badge } from '../../components/shared'
import { FormField, Input, Textarea, Select } from '../../components/forms'
import {
  useEmpresas, useCreateEmpresa, useUpdateEmpresaById, useDeleteEmpresa,
  useFirmas, useCreateFirma, useDeleteFirma,
  useBloqueos, useUpdateBloqueo,
} from '../../api/config'
import { useCargosTransporte, useCreateCargoTransporte, useUpdateCargoTransporte, useDeleteCargoTransporte } from '../../api/cargoTransporte'
import { useGastos, useCreateGasto, useUpdateGasto, useDeleteGasto } from '../../api/gastos'
import {
  useCategoriasBodegaTaller, useCreateCategoriaBT, useUpdateCategoriaBT, useDeleteCategoriaBT,
  useCreateSubcategoriaBT, useUpdateSubcategoriaBT, useDeleteSubcategoriaBT,
} from '../../api/categoriasBodegaTaller'
import {
  useCategorias, useCreateCategoria, useUpdateCategoria, useDeleteCategoria,
  useCreateSubcategoria, useUpdateSubcategoria, useDeleteSubcategoria,
} from '../../api/categorias'
import { gastosExportUrl } from '../../api/gastos'
import api from '../../api/client'
import { downloadFromBackend } from '../../utils/csv'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const TABS = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'firmas', label: 'Firmas Email' },
  { id: 'bloqueos', label: 'Bloqueos' },
  { id: 'transporte', label: 'Cargo transporte' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'cat-bodega', label: 'Cat. Bodega' },
  { id: 'cat-bt', label: 'Cat. Bodega Taller' },
  { id: 'banners', label: 'Banners Web' },
  { id: 'usuarios-web', label: 'Usuarios Web' },
]

export default function ConfigPage() {
  const [tab, setTab] = useState('empresa')
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Configuración"
        subtitle="Empresa, firmas y bloqueos del sistema"
        breadcrumb={['Inicio', 'Config']}
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ marginTop: 16 }}>
        {tab === 'empresa' && <EmpresaSection />}
        {tab === 'firmas' && <FirmasSection />}
        {tab === 'bloqueos' && <BloqueosSection />}
        {tab === 'transporte' && <CargoTransporteSection />}
        {tab === 'gastos' && <GastosSection />}
        {tab === 'cat-bodega' && <CategoriasBodegaSection />}
        {tab === 'cat-bt' && <CategoriasBTSection />}
        {tab === 'banners' && <BannersSection />}
        {tab === 'usuarios-web' && <UsuariosWebSection />}
      </div>
    </main>
  )
}

function CargoTransporteSection() {
  const { data = [], isLoading } = useCargosTransporte()
  const createMut = useCreateCargoTransporte()
  const updateMut = useUpdateCargoTransporte()
  const deleteMut = useDeleteCargoTransporte()
  const [nuevo, setNuevo] = useState({ nombre: '', valor: 0 })
  const [edits, setEdits] = useState({})

  if (isLoading) return <div>Cargando…</div>

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Nuevo cargo</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 16 }}>
        <FormField label="Nombre"><Input value={nuevo.nombre} onChange={v => setNuevo(s => ({ ...s, nombre: v }))} /></FormField>
        <FormField label="Valor / %"><Input type="number" value={nuevo.valor} onChange={v => setNuevo(s => ({ ...s, valor: v }))} /></FormField>
        <Btn variant="primary" onClick={() => {
          if (!nuevo.nombre) return
          createMut.mutate(nuevo, { onSuccess: () => setNuevo({ nombre: '', valor: 0 }) })
        }}>+ Agregar</Btn>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--bg-muted)' }}>
          <th style={{ padding: 10, textAlign: 'left' }}>Nombre</th>
          <th style={{ padding: 10, textAlign: 'right' }}>Valor</th>
          <th style={{ padding: 10 }}>Activo</th>
          <th style={{ padding: 10 }}></th>
        </tr></thead>
        <tbody>
          {data.map(c => {
            const d = edits[c.id] || c
            const dirty = d.nombre !== c.nombre || parseFloat(d.valor) !== c.valor || d.activo !== c.activo
            return (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 10 }}><Input value={d.nombre} onChange={v => setEdits(s => ({ ...s, [c.id]: { ...d, nombre: v } }))} /></td>
                <td style={{ padding: 10, width: 140 }}><Input type="number" value={d.valor} onChange={v => setEdits(s => ({ ...s, [c.id]: { ...d, valor: v } }))} /></td>
                <td style={{ padding: 10, textAlign: 'center' }}>
                  <input type="checkbox" checked={d.activo} onChange={e => setEdits(s => ({ ...s, [c.id]: { ...d, activo: e.target.checked } }))} />
                </td>
                <td style={{ padding: 10, textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {dirty && <Btn size="sm" variant="primary" onClick={() => updateMut.mutate({ id: c.id, data: { nombre: d.nombre, valor: d.valor, activo: d.activo } })}>Guardar</Btn>}
                  <button onClick={() => { if (confirm('¿Eliminar?')) deleteMut.mutate(c.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer' }}>Borrar</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GastosSection() {
  const { data = [], isLoading } = useGastos()
  const createMut = useCreateGasto()
  const updateMut = useUpdateGasto()
  const deleteMut = useDeleteGasto()
  const [nuevo, setNuevo] = useState('')
  const [edits, setEdits] = useState({})

  if (isLoading) return <div>Cargando…</div>

  const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ')
  const duplicateName = (nombre, id = null) => {
    const key = normalize(nombre).toLocaleLowerCase('es-CL')
    return data.some(g => g.id !== id && normalize(g.nombre).toLocaleLowerCase('es-CL') === key)
  }
  const errorMessage = err => err?.response?.data?.error || 'No se pudo completar la operacion'
  const submitCreate = () => {
    const nombre = normalize(nuevo)
    if (nombre.length < 2) return alert('El nombre debe tener al menos 2 caracteres.')
    if (duplicateName(nombre)) return alert('Este nombre de gasto ya existe.')
    createMut.mutate({ nombre }, {
      onSuccess: () => setNuevo(''),
      onError: err => alert(errorMessage(err)),
    })
  }
  const submitUpdate = (g, d) => {
    const nombre = normalize(d.nombre)
    if (nombre.length < 2) return alert('El nombre debe tener al menos 2 caracteres.')
    if (duplicateName(nombre, g.id)) return alert('Este nombre de gasto ya existe.')
    updateMut.mutate({ id: g.id, data: { nombre, activo: d.activo } }, {
      onSuccess: () => setEdits(s => {
        const next = { ...s }
        delete next[g.id]
        return next
      }),
      onError: err => alert(errorMessage(err)),
    })
  }
  const submitDelete = (g) => {
    if (!confirm('Eliminar gasto? Si ya fue usado en caja quedara inactivo para no romper el historial.')) return
    deleteMut.mutate(g.id, { onError: err => alert(errorMessage(err)) })
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>Nuevo nombre de gasto</div>
        <Btn size="sm" variant="secondary" icon="download" onClick={() => downloadFromBackend(gastosExportUrl(), `gastos_${new Date().toISOString().slice(0, 10)}.csv`)}>
          Exportar CSV
        </Btn>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginBottom: 16 }}>
        <FormField label="Nombre"><Input value={nuevo} onChange={setNuevo} /></FormField>
        <Btn variant="primary" icon="plus" onClick={submitCreate} disabled={createMut.isPending}>Agregar</Btn>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--bg-muted)' }}>
          <th style={{ padding: 10, textAlign: 'left' }}>Nombre</th>
          <th style={{ padding: 10 }}>Activo</th>
          <th style={{ padding: 10 }}></th>
        </tr></thead>
        <tbody>
          {data.map(g => {
            const d = edits[g.id] || g
            const dirty = d.nombre !== g.nombre || d.activo !== g.activo
            return (
              <tr key={g.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 10 }}><Input value={d.nombre} onChange={v => setEdits(s => ({ ...s, [g.id]: { ...d, nombre: v } }))} /></td>
                <td style={{ padding: 10, textAlign: 'center' }}>
                  <input type="checkbox" checked={d.activo} onChange={e => setEdits(s => ({ ...s, [g.id]: { ...d, activo: e.target.checked } }))} />
                </td>
                <td style={{ padding: 10, textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {dirty && <Btn size="sm" variant="primary" icon="check" onClick={() => submitUpdate(g, d)} disabled={updateMut.isPending}>Guardar</Btn>}
                  <button onClick={() => submitDelete(g)} disabled={deleteMut.isPending} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: deleteMut.isPending ? 'not-allowed' : 'pointer', opacity: deleteMut.isPending ? 0.5 : 1 }}>Borrar</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const EMPRESA_EMPTY = {
  nombre: '',
  rut: '',
  razonSocial: '',
  giro: '',
  email: '',
  telefono: '',
  direccion: '',
  region: '',
  comuna: '',
  codigoEmpresa: '',
  logoUrl: '',
  textoPie: '',
}

function rutValido(value) {
  const rut = String(value || '').replace(/\./g, '').replace(/-/g, '').trim().toUpperCase()
  if (!/^\d{1,8}[0-9K]$/.test(rut)) return false
  const body = rut.slice(0, -1)
  const dv = rut.slice(-1)
  if (/^0+$/.test(body)) return false
  let sum = 0
  let factor = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const expected = 11 - (sum % 11)
  const expectedDv = expected === 11 ? '0' : expected === 10 ? 'K' : String(expected)
  return expectedDv === dv
}

function empresaPayload(form) {
  return {
    nombre: form.nombre || '',
    rut: form.rut || '',
    razonSocial: form.razonSocial || '',
    giro: form.giro || '',
    email: form.email || '',
    telefono: form.telefono || '',
    direccion: form.direccion || '',
    region: form.region || '',
    comuna: form.comuna || '',
    codigoEmpresa: form.codigoEmpresa || undefined,
    logoUrl: form.logoUrl || '',
    textoPie: form.textoPie || '',
  }
}

function EmpresaSection() {
  const { data: empresas = [], isLoading } = useEmpresas()
  const createMut = useCreateEmpresa()
  const updateMut = useUpdateEmpresaById()
  const deleteMut = useDeleteEmpresa()
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({})

  if (isLoading) return <div>Cargando...</div>

  const selected = !creating && (empresas.find(e => e.id === selectedId) || empresas[0] || null)
  const form = { ...EMPRESA_EMPTY, ...(selected || {}), ...draft }
  const set = (k, v) => setDraft(f => ({ ...f, [k]: v }))
  const saving = createMut.isPending || updateMut.isPending

  const selectEmpresa = empresa => {
    setSelectedId(empresa.id)
    setCreating(false)
    setDraft({})
  }

  const startCreate = () => {
    setCreating(true)
    setSelectedId(null)
    setDraft({})
  }

  const validate = () => {
    if (!form.nombre || form.nombre.trim().length < 4) return 'El nombre debe tener al menos 4 caracteres.'
    if (!rutValido(form.rut)) return 'RUT invalido.'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Email invalido.'
    return null
  }

  const save = () => {
    const error = validate()
    if (error) return alert(error)
    const payload = empresaPayload(form)
    if (creating || !selected) {
      return createMut.mutate(payload, {
        onSuccess: empresa => {
          setCreating(false)
          setSelectedId(empresa.id)
          setDraft({})
        },
        onError: err => alert(err?.response?.data?.error || 'No se pudo crear'),
      })
    }
    return updateMut.mutate({ id: selected.id, data: payload }, {
      onSuccess: empresa => {
        setSelectedId(empresa.id)
        setDraft({})
      },
      onError: err => alert(err?.response?.data?.error || 'No se pudo guardar'),
    })
  }

  const remove = () => {
    if (!selected) return
    if (!confirm(`Eliminar ${selected.nombre} del sistema?`)) return
    deleteMut.mutate(selected.id, {
      onSuccess: () => {
        setSelectedId(null)
        setCreating(false)
        setDraft({})
      },
      onError: err => alert(err?.response?.data?.error || 'No se pudo eliminar'),
    })
  }

  const columns = [
    { key: 'codigoEmpresa', label: 'Cod Plastimar', render: v => v || '-' },
    { key: 'nombre', label: 'Nombre', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: 'rut', label: 'RUT' },
    { key: 'razonSocial', label: 'Razon Social', wrap: true },
    { key: 'giro', label: 'Giro', wrap: true },
    { key: 'email', label: 'E-Mail' },
    { key: 'telefono', label: 'Telefonos' },
    { key: 'direccion', label: 'Direccion', wrap: true },
    { key: 'region', label: 'Region' },
    { key: 'comuna', label: 'Comuna' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(360px, 0.65fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Razones sociales Plastimar</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{empresas.length} registros</div>
          </div>
          <Btn variant="primary" icon="plus" size="sm" onClick={startCreate}>Crear nuevo</Btn>
        </div>
        <Table columns={columns} rows={empresas} onRowClick={selectEmpresa} emptyMessage="No hay datos para mostrar" />
      </div>

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{creating || !selected ? 'Crear razon social' : `Modificar ${selected.nombre}`}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{creating || !selected ? 'Nuevo perfil de empresa' : `ID ${selected.id}`}</div>
          </div>
          {selected && !creating && <Badge tone="blue">Cod {selected.codigoEmpresa || '-'}</Badge>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FormField label="Nombre" required><Input value={form.nombre || ''} onChange={v => set('nombre', v)} /></FormField>
          <FormField label="Cod Plastimar"><Input type="number" value={form.codigoEmpresa || ''} onChange={v => set('codigoEmpresa', v)} /></FormField>
          <FormField label="RUT" required><Input value={form.rut || ''} onChange={v => set('rut', v)} placeholder="11.111.111-1" /></FormField>
          <FormField label="Razon Social"><Input value={form.razonSocial || ''} onChange={v => set('razonSocial', v)} /></FormField>
          <FormField label="Giro"><Input value={form.giro || ''} onChange={v => set('giro', v)} /></FormField>
          <FormField label="E-Mail"><Input value={form.email || ''} onChange={v => set('email', v)} /></FormField>
          <FormField label="Fono"><Input value={form.telefono || ''} onChange={v => set('telefono', v)} /></FormField>
          <FormField label="Direccion"><Input value={form.direccion || ''} onChange={v => set('direccion', v)} /></FormField>
          <FormField label="Region"><Input value={form.region || ''} onChange={v => set('region', v)} /></FormField>
          <FormField label="Comuna"><Input value={form.comuna || ''} onChange={v => set('comuna', v)} /></FormField>
          <FormField label="Logo URL"><Input value={form.logoUrl || ''} onChange={v => set('logoUrl', v)} /></FormField>
        </div>
        <div style={{ marginTop: 10 }}>
          <FormField label="Texto pie"><Textarea value={form.textoPie || ''} onChange={v => set('textoPie', v)} rows={3} /></FormField>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <div>
            {selected && !creating && (
              <Btn variant="danger" size="sm" onClick={remove} disabled={deleteMut.isPending}>Eliminar</Btn>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="sm" onClick={() => { setCreating(false); setDraft({}) }}>Cancelar</Btn>
            <Btn variant="primary" size="sm" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

function FirmasSection() {
  const { data, isLoading } = useFirmas()
  const createMut = useCreateFirma()
  const deleteMut = useDeleteFirma()
  const [nueva, setNueva] = useState({ alias: '', email: '', firma: '', fotoUrl: '' })

  if (isLoading) return <div>Cargando…</div>

  const columns = [
    { key: 'alias', label: 'Alias' },
    { key: 'email', label: 'Email' },
    { key: 'firma', label: 'Firma' },
    {
      key: 'acciones',
      label: '',
      render: (row) => (
        <button
          onClick={() => deleteMut.mutate(row.id)}
          style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer' }}
        >Eliminar</button>
      ),
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Nueva firma</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <FormField label="Alias"><Input value={nueva.alias} onChange={v => setNueva(s => ({ ...s, alias: v }))} /></FormField>
          <FormField label="Email"><Input value={nueva.email} onChange={v => setNueva(s => ({ ...s, email: v }))} /></FormField>
          <FormField label="Firma"><Input value={nueva.firma} onChange={v => setNueva(s => ({ ...s, firma: v }))} /></FormField>
          <FormField label="Foto URL"><Input value={nueva.fotoUrl} onChange={v => setNueva(s => ({ ...s, fotoUrl: v }))} /></FormField>
          <Btn
            variant="primary"
            onClick={() => {
              if (!nueva.alias || !nueva.email || !nueva.firma) return
              createMut.mutate(nueva, { onSuccess: () => setNueva({ alias: '', email: '', firma: '', fotoUrl: '' }) })
            }}
          >+ Agregar</Btn>
        </div>
      </div>
      <Table columns={columns} rows={data ?? []} emptyMessage="Sin firmas configuradas" />
    </div>
  )
}

const MODULOS = ['ventas', 'bodega', 'taller', 'caja', 'clientes', 'cobranza', 'licitaciones', 'ordenes-compra', 'pagos-proveedores', 'telas', 'bodega-taller', 'crm', 'proveedores', 'descuentos']
const ESTADOS = [
  { value: 'ACTIVA', label: 'Activa' },
  { value: 'BLOQUEADA', label: 'Bloqueada' },
  { value: 'MANTENIMIENTO', label: 'Mantenimiento' },
]

function BloqueosSection() {
  const { data, isLoading } = useBloqueos()
  const updateMut = useUpdateBloqueo()
  const [draft, setDraft] = useState({})

  if (isLoading) return <div>Cargando…</div>

  const byModulo = Object.fromEntries((data ?? []).map(b => [b.modulo, b]))

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-muted)' }}>
            <th style={{ padding: 10, textAlign: 'left' }}>Módulo</th>
            <th style={{ padding: 10, textAlign: 'left' }}>Estado</th>
            <th style={{ padding: 10, textAlign: 'left' }}>Texto</th>
            <th style={{ padding: 10 }}></th>
          </tr>
        </thead>
        <tbody>
          {MODULOS.map(m => {
            const current = byModulo[m] || { modulo: m, estado: 'ACTIVA', texto: '' }
            const d = draft[m] || current
            const dirty = d.estado !== current.estado || (d.texto || '') !== (current.texto || '')
            return (
              <tr key={m} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 10, fontWeight: 600 }}>{m}</td>
                <td style={{ padding: 10, width: 180 }}>
                  <Select
                    value={d.estado}
                    onChange={v => setDraft(s => ({ ...s, [m]: { ...d, estado: v } }))}
                    options={ESTADOS}
                  />
                </td>
                <td style={{ padding: 10 }}>
                  <Input
                    value={d.texto || ''}
                    onChange={v => setDraft(s => ({ ...s, [m]: { ...d, texto: v } }))}
                    placeholder="Mensaje opcional"
                  />
                </td>
                <td style={{ padding: 10, textAlign: 'right' }}>
                  {dirty && (
                    <Btn
                      size="sm"
                      variant="primary"
                      onClick={() => updateMut.mutate({ modulo: m, estado: d.estado, texto: d.texto || null })}
                    >Guardar</Btn>
                  )}
                  {!dirty && current.estado !== 'ACTIVA' && <Badge tone="amber">{current.estado}</Badge>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CategoriasBodegaSection() {
  const { data: categorias = [], isLoading } = useCategorias()
  const createCat = useCreateCategoria()
  const updateCat = useUpdateCategoria()
  const deleteCat = useDeleteCategoria()
  const createSub = useCreateSubcategoria()
  const updateSub = useUpdateSubcategoria()
  const deleteSub = useDeleteSubcategoria()
  const [nuevaCat, setNuevaCat] = useState('')
  const [subNombres, setSubNombres] = useState({})

  if (isLoading) return <div>Cargando...</div>

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Categorias Bodega</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginBottom: 16 }}>
        <FormField label="Nueva categoria"><Input value={nuevaCat} onChange={setNuevaCat} /></FormField>
        <Btn variant="primary" onClick={() => { if (nuevaCat.trim()) createCat.mutate({ nombre: nuevaCat.trim() }, { onSuccess: () => setNuevaCat('') }) }}>+ Agregar</Btn>
      </div>
      {categorias.map(c => (
        <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Input value={c.nombre} onChange={v => updateCat.mutate({ id: c.id, data: { nombre: v } })} />
            <Input type="number" value={c.porcDesc ?? 0} onChange={v => updateCat.mutate({ id: c.id, data: { porcDesc: v } })} />
            <Select value={c.mostrar === false ? 'false' : 'true'} onChange={v => updateCat.mutate({ id: c.id, data: { mostrar: v === 'true' } })} options={[{ value: 'true', label: 'Mostrar' }, { value: 'false', label: 'Ocultar' }]} />
            <button onClick={() => { if (confirm('Eliminar categoria?')) deleteCat.mutate(c.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer' }}>Borrar</button>
          </div>
          <div style={{ marginLeft: 20 }}>
            {(c.subcategorias || []).map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '18px minmax(160px, 1fr) minmax(180px, 0.8fr) auto', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>-&gt;</span>
                <Input value={s.nombre} onChange={v => updateSub.mutate({ id: s.id, data: { nombre: v } })} />
                <Select
                  value={String(s.categoriaId ?? c.id)}
                  onChange={v => updateSub.mutate({ id: s.id, data: { categoriaId: Number(v) } })}
                  options={categorias.map(cat => ({ value: String(cat.id), label: cat.nombre }))}
                />
                <button onClick={() => { if (confirm('Eliminar subcategoria?')) deleteSub.mutate(s.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer', fontSize: 12 }}>Borrar</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Input placeholder="Nueva subcategoria" value={subNombres[c.id] || ''} onChange={v => setSubNombres(s => ({ ...s, [c.id]: v }))} />
              <Btn size="sm" onClick={() => {
                const n = (subNombres[c.id] || '').trim()
                if (n) createSub.mutate({ categoriaId: c.id, data: { nombre: n } }, { onSuccess: () => setSubNombres(s => ({ ...s, [c.id]: '' })) })
              }}>+ Sub</Btn>
            </div>
          </div>
        </div>
      ))}
      {!categorias.length && <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-3)' }}>No hay datos para mostrar</div>}
    </div>
  )
}

function CategoriasBTSection() {
  const { data: categorias = [], isLoading } = useCategoriasBodegaTaller()
  const createCat = useCreateCategoriaBT()
  const updateCat = useUpdateCategoriaBT()
  const deleteCat = useDeleteCategoriaBT()
  const createSub = useCreateSubcategoriaBT()
  const updateSub = useUpdateSubcategoriaBT()
  const deleteSub = useDeleteSubcategoriaBT()
  const [nuevaCat, setNuevaCat] = useState('')
  const [subNombres, setSubNombres] = useState({})

  if (isLoading) return <div>Cargando…</div>

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Categorías Bodega Taller</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginBottom: 16 }}>
        <FormField label="Nueva categoría"><Input value={nuevaCat} onChange={setNuevaCat} /></FormField>
        <Btn variant="primary" onClick={() => { if (nuevaCat) createCat.mutate({ nombre: nuevaCat }, { onSuccess: () => setNuevaCat('') }) }}>+ Agregar</Btn>
      </div>
      {categorias.map(c => (
        <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Input value={c.nombre} onChange={v => updateCat.mutate({ id: c.id, data: { nombre: v } })} />
            <button onClick={() => { if (confirm('¿Eliminar categoría?')) deleteCat.mutate(c.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer' }}>Borrar</button>
          </div>
          <div style={{ marginLeft: 20 }}>
            {(c.subcategorias || []).map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '18px minmax(160px, 1fr) minmax(180px, 0.8fr) auto', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>↳</span>
                <Input value={s.nombre} onChange={v => updateSub.mutate({ id: s.id, data: { nombre: v } })} />
                <Select
                  value={String(s.categoriaId ?? c.id)}
                  onChange={v => updateSub.mutate({ id: s.id, data: { categoriaId: Number(v) } })}
                  options={categorias.map(cat => ({ value: String(cat.id), label: cat.nombre }))}
                />
                <button onClick={() => { if (confirm('¿Eliminar subcategoría?')) deleteSub.mutate(s.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer', fontSize: 12 }}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Input placeholder="Nueva subcategoría" value={subNombres[c.id] || ''} onChange={v => setSubNombres(s => ({ ...s, [c.id]: v }))} />
              <Btn size="sm" onClick={() => {
                const n = subNombres[c.id]
                if (n) createSub.mutate({ categoriaId: c.id, data: { nombre: n } }, { onSuccess: () => setSubNombres(s => ({ ...s, [c.id]: '' })) })
              }}>+ Sub</Btn>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function BannersSection() {
  const qc = useQueryClient()
  const { data: banners = [], isLoading } = useQuery({
    queryKey: ['banners'],
    queryFn: () => api.get('/banners').then(r => r.data),
  })
  const createMut = useMutation({
    mutationFn: (d) => api.post('/banners', d).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banners'] }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/banners/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banners'] }),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/banners/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banners'] }),
  })
  const [nuevo, setNuevo] = useState({ titulo: '', subtitulo: '', imagenUrl: '', link: '', orden: 0 })

  if (isLoading) return <div>Cargando…</div>

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Banners web</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: 8, alignItems: 'end', marginBottom: 16 }}>
        <FormField label="Título"><Input value={nuevo.titulo} onChange={v => setNuevo(s => ({ ...s, titulo: v }))} /></FormField>
        <FormField label="Subtítulo"><Input value={nuevo.subtitulo} onChange={v => setNuevo(s => ({ ...s, subtitulo: v }))} /></FormField>
        <FormField label="Imagen URL"><Input value={nuevo.imagenUrl} onChange={v => setNuevo(s => ({ ...s, imagenUrl: v }))} /></FormField>
        <FormField label="Link"><Input value={nuevo.link} onChange={v => setNuevo(s => ({ ...s, link: v }))} /></FormField>
        <FormField label="Orden"><Input type="number" value={nuevo.orden} onChange={v => setNuevo(s => ({ ...s, orden: v }))} /></FormField>
        <Btn variant="primary" onClick={() => {
          if (!nuevo.titulo) return
          createMut.mutate(nuevo, { onSuccess: () => setNuevo({ titulo: '', subtitulo: '', imagenUrl: '', link: '', orden: 0 }) })
        }}>+ Agregar</Btn>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--bg-muted)' }}>
          <th style={{ padding: 10, textAlign: 'left' }}>Título</th>
          <th style={{ padding: 10 }}>Imagen</th>
          <th style={{ padding: 10 }}>Link</th>
          <th style={{ padding: 10 }}>Orden</th>
          <th style={{ padding: 10 }}>Activo</th>
          <th style={{ padding: 10 }}></th>
        </tr></thead>
        <tbody>
          {banners.map(b => (
            <tr key={b.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: 10 }}>{b.titulo}<br /><span style={{ fontSize: 11, color: 'var(--text-3)' }}>{b.subtitulo}</span></td>
              <td style={{ padding: 10 }}>{b.imagenUrl ? <img src={b.imagenUrl} alt="" style={{ height: 32 }} /> : '—'}</td>
              <td style={{ padding: 10, fontSize: 11 }}>{b.link || '—'}</td>
              <td style={{ padding: 10, textAlign: 'center' }}>{b.orden}</td>
              <td style={{ padding: 10, textAlign: 'center' }}>
                <input type="checkbox" checked={b.activo} onChange={e => updateMut.mutate({ id: b.id, data: { activo: e.target.checked } })} />
              </td>
              <td style={{ padding: 10, textAlign: 'right' }}>
                <button onClick={() => { if (confirm('¿Eliminar?')) deleteMut.mutate(b.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer' }}>Borrar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UsuariosWebSection() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['usuarios-web'],
    queryFn: () => api.get('/usuarios-web').then(r => r.data),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/usuarios-web/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios-web'] }),
  })

  if (isLoading) return <div>Cargando…</div>

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Usuarios web tienda ({users.length})</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--bg-muted)' }}>
          <th style={{ padding: 10, textAlign: 'left' }}>Email</th>
          <th style={{ padding: 10, textAlign: 'left' }}>Nombre</th>
          <th style={{ padding: 10 }}>RUT</th>
          <th style={{ padding: 10 }}>Teléfono</th>
          <th style={{ padding: 10 }}>Activo</th>
        </tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: 10 }}>{u.email}</td>
              <td style={{ padding: 10 }}>{u.nombre}</td>
              <td style={{ padding: 10 }}>{u.rut || '—'}</td>
              <td style={{ padding: 10 }}>{u.telefono || '—'}</td>
              <td style={{ padding: 10, textAlign: 'center' }}>
                <input type="checkbox" checked={u.activo} onChange={e => updateMut.mutate({ id: u.id, data: { activo: e.target.checked } })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
