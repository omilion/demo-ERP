import { useState } from 'react'
import { Btn, Badge, PageHeader, Table } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { useTalleres, useEnviarTaller } from '../../api/pasarTaller'
import { useOdt } from '../../api/odts'

export default function PasarTallerPage() {
  const [odtId, setOdtId] = useState('')
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState({ codigoInterno: '', nombre: '', descripcion: '', cantidad: 1, precio: 0, prioridad: 'normal', tallerId: '', obs: '' })

  const { data: talleres = [] } = useTalleres()
  const enviarMut = useEnviarTaller()
  const odtIdNum = odtId && /^\d+$/.test(odtId) ? parseInt(odtId, 10) : null
  const { data: odtPreview, isError: odtError } = useOdt(odtIdNum)

  const addItem = () => {
    if (!draft.nombre && !draft.codigoInterno) return alert('Falta nombre o código')
    setItems([...items, { ...draft, _key: Date.now() }])
    setDraft({ codigoInterno: '', nombre: '', descripcion: '', cantidad: 1, precio: 0, prioridad: 'normal', tallerId: '', obs: '' })
  }
  const removeItem = (key) => setItems(items.filter(i => i._key !== key))

  const enviar = () => {
    if (!odtId) return alert('Falta ODT')
    if (items.length === 0) return alert('Lista vacía')
    enviarMut.mutate({ odtId: parseInt(odtId, 10), items }, {
      onSuccess: () => {
        alert('Items enviados a taller')
        setItems([])
        setOdtId('')
      },
    })
  }

  const cols = [
    { key: 'codigoInterno', label: 'Código' },
    { key: 'nombre', label: 'Nombre', wrap: true },
    { key: 'cantidad', label: 'Cant.', align: 'right' },
    { key: 'prioridad', label: 'Prioridad' },
    { key: 'tallerId', label: 'Taller', render: v => {
      const t = talleres.find(t => t.id === parseInt(v, 10))
      return t?.nombre || '—'
    } },
    { key: 'obs', label: 'Obs', wrap: true },
    { key: '_acc', label: '', render: (_, r) => (
      <button onClick={() => removeItem(r._key)} style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer', fontSize: 12 }}>Quitar</button>
    ) },
  ]

  const tallerOptions = [{ value: '', label: 'Sin asignar' }, ...talleres.map(t => ({ value: String(t.id), label: t.nombre }))]

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Pasar a Taller"
        subtitle="Enviar productos a un taller (espumas, confecciones, madera…)"
        breadcrumb={['Inicio', 'Taller', 'Pasar']}
        actions={<Btn variant="primary" size="sm" onClick={enviar} disabled={enviarMut.isPending || !odtId || items.length === 0}>{enviarMut.isPending ? 'Enviando…' : `Enviar ${items.length} ítem(s)`}</Btn>}
      />

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
        <FormField label="ODT destino" required>
          <Input type="number" value={odtId} onChange={setOdtId} placeholder="ID ODT" />
        </FormField>
        {odtIdNum && odtPreview && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--green-50, #f0fdf4)', border: '1px solid var(--green-100, #bbf7d0)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                ODT #{odtPreview.id} · {odtPreview.clienteNombre || 'Sin cliente'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {odtPreview.tipo || '—'} · {odtPreview.descripcion?.slice(0, 80) || 'Sin descripción'}
              </div>
            </div>
            <Badge tone={odtPreview.estado === 'Terminada' ? 'green' : odtPreview.estado === 'Prioritaria' ? 'red' : 'blue'}>{odtPreview.estado}</Badge>
          </div>
        )}
        {odtIdNum && odtError && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--red-bg, #fef2f2)', border: '1px solid var(--red, #fca5a5)', borderRadius: 8, fontSize: 12, color: 'var(--red, #991b1b)' }}>
            ODT #{odtIdNum} no encontrada
          </div>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Agregar ítem</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <FormField label="Código interno"><Input value={draft.codigoInterno} onChange={v => setDraft(d => ({ ...d, codigoInterno: v }))} /></FormField>
          <FormField label="Nombre"><Input value={draft.nombre} onChange={v => setDraft(d => ({ ...d, nombre: v }))} /></FormField>
          <FormField label="Cantidad"><Input type="number" value={draft.cantidad} onChange={v => setDraft(d => ({ ...d, cantidad: v }))} /></FormField>
          <FormField label="Precio"><Input type="number" value={draft.precio} onChange={v => setDraft(d => ({ ...d, precio: v }))} /></FormField>
          <FormField label="Taller"><Select value={String(draft.tallerId)} onChange={v => setDraft(d => ({ ...d, tallerId: v }))} options={tallerOptions} /></FormField>
          <FormField label="Prioridad"><Select value={draft.prioridad} onChange={v => setDraft(d => ({ ...d, prioridad: v }))} options={['normal', 'alta', 'emergencia']} /></FormField>
          <FormField label="Descripción"><Input value={draft.descripcion} onChange={v => setDraft(d => ({ ...d, descripcion: v }))} /></FormField>
          <FormField label="Obs"><Textarea value={draft.obs} onChange={v => setDraft(d => ({ ...d, obs: v }))} rows={1} /></FormField>
        </div>
        <div style={{ marginTop: 12 }}>
          <Btn variant="secondary" size="sm" onClick={addItem}>+ Agregar al lote</Btn>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>Lote a enviar ({items.length})</div>
        <Table columns={cols} rows={items} emptyMessage="Aún no hay ítems en el lote" />
      </div>
    </main>
  )
}
