import { useState } from 'react'
import { Btn, PageHeader, Table } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { useTalleres, useEnviarTaller } from '../../api/pasarTaller'

export default function PasarTallerPage() {
  const [odtId, setOdtId] = useState('')
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState({ codigoInterno: '', nombre: '', descripcion: '', cantidad: 1, precio: 0, prioridad: 'normal', tallerId: '', obs: '' })

  const { data: talleres = [] } = useTalleres()
  const enviarMut = useEnviarTaller()

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
