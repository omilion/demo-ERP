import { useState, useEffect } from 'react'
import { PageHeader, Btn, Tabs, Table, Badge } from '../../components/shared'
import { FormField, Input, Textarea, Select } from '../../components/forms'
import {
  useEmpresa, useUpdateEmpresa,
  useFirmas, useCreateFirma, useUpdateFirma, useDeleteFirma,
  useBloqueos, useUpdateBloqueo,
} from '../../api/config'
import { useCargosTransporte, useCreateCargoTransporte, useUpdateCargoTransporte, useDeleteCargoTransporte } from '../../api/cargoTransporte'
import { useGastos, useCreateGasto, useUpdateGasto, useDeleteGasto } from '../../api/gastos'

const TABS = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'firmas', label: 'Firmas Email' },
  { id: 'bloqueos', label: 'Bloqueos' },
  { id: 'transporte', label: 'Cargo transporte' },
  { id: 'gastos', label: 'Gastos' },
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

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Nuevo nombre de gasto</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginBottom: 16 }}>
        <FormField label="Nombre"><Input value={nuevo} onChange={setNuevo} /></FormField>
        <Btn variant="primary" onClick={() => {
          if (!nuevo) return
          createMut.mutate({ nombre: nuevo }, { onSuccess: () => setNuevo('') })
        }}>+ Agregar</Btn>
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
                  {dirty && <Btn size="sm" variant="primary" onClick={() => updateMut.mutate({ id: g.id, data: { nombre: d.nombre, activo: d.activo } })}>Guardar</Btn>}
                  <button onClick={() => { if (confirm('¿Eliminar?')) deleteMut.mutate(g.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer' }}>Borrar</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EmpresaSection() {
  const { data, isLoading } = useEmpresa()
  const updateMut = useUpdateEmpresa()
  const [form, setForm] = useState({})

  useEffect(() => { if (data) setForm(data) }, [data])

  if (isLoading) return <div>Cargando…</div>

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FormField label="Nombre" required>
          <Input value={form.nombre || ''} onChange={v => set('nombre', v)} />
        </FormField>
        <FormField label="RUT" required>
          <Input value={form.rut || ''} onChange={v => set('rut', v)} />
        </FormField>
        <FormField label="Razón Social">
          <Input value={form.razonSocial || ''} onChange={v => set('razonSocial', v)} />
        </FormField>
        <FormField label="Giro">
          <Input value={form.giro || ''} onChange={v => set('giro', v)} />
        </FormField>
        <FormField label="Email">
          <Input value={form.email || ''} onChange={v => set('email', v)} />
        </FormField>
        <FormField label="Teléfono">
          <Input value={form.telefono || ''} onChange={v => set('telefono', v)} />
        </FormField>
        <FormField label="Dirección">
          <Input value={form.direccion || ''} onChange={v => set('direccion', v)} />
        </FormField>
        <FormField label="Comuna">
          <Input value={form.comuna || ''} onChange={v => set('comuna', v)} />
        </FormField>
        <FormField label="Región">
          <Input value={form.region || ''} onChange={v => set('region', v)} />
        </FormField>
        <FormField label="Logo URL">
          <Input value={form.logoUrl || ''} onChange={v => set('logoUrl', v)} />
        </FormField>
      </div>
      <div style={{ marginTop: 16 }}>
        <FormField label="Texto pie">
          <Textarea value={form.textoPie || ''} onChange={v => set('textoPie', v)} rows={3} />
        </FormField>
      </div>
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Btn variant="primary" onClick={() => updateMut.mutate(form)} disabled={updateMut.isPending}>
          {updateMut.isPending ? 'Guardando…' : 'Guardar'}
        </Btn>
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
