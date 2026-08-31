import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import { PageHeader, Btn, Table, Badge } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { toast } from '../../store/notif'
import { useState } from 'react'

const roles = ['admin', 'coordinador_comercial', 'vendedor', 'bodeguero', 'taller', 'rrhh', 'cajero']
const blank = { codigo: '', nombre: '', descripcion: '', estadoDestino: 'ANULADA', severidad: 'alta', horasEscalamiento: 24, rolResponsable: 'coordinador_comercial', rolEscalamiento: 'admin', activo: true }

export default function ExcepcionesPage() {
  const qc = useQueryClient(); const [form, setForm] = useState(blank)
  const { data: reglas = [] } = useQuery({ queryKey: ['excepciones', 'reglas'], queryFn: () => api.get('/excepciones/reglas').then(r => r.data) })
  const { data: alertas = [] } = useQuery({ queryKey: ['excepciones', 'alertas'], queryFn: () => api.get('/excepciones/alertas').then(r => r.data) })
  const create = useMutation({ mutationFn: d => api.post('/excepciones/reglas', d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['excepciones'] }); setForm(blank); toast.success('Regla creada') }, onError: e => toast.error(e.response?.data?.error || 'No se pudo crear') })
  const resolve = useMutation({ mutationFn: id => api.post(`/excepciones/alertas/${id}/resolver`, { evidencia: 'Resuelta desde catálogo de excepciones' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['excepciones', 'alertas'] }) })
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
  return <main className="page page-wide"><PageHeader title="Excepciones y alertas" subtitle="Reglas, responsables, escalamiento y evidencia" breadcrumb={['Inicio', 'Administración', 'Excepciones']} />
    <section style={card}><h3 style={title}>Nueva regla</h3><div style={grid}>
      <FormField label="Código"><Input value={form.codigo} onChange={v => set('codigo', v)} placeholder="VENTA_ANULADA" /></FormField><FormField label="Nombre"><Input value={form.nombre} onChange={v => set('nombre', v)} /></FormField>
      <FormField label="Estado destino"><Select value={form.estadoDestino} onChange={v => set('estadoDestino', v)} options={['ANULADA','PREPARACION','PATIO','DIDACTICO','REPARTO','ENTREGADA','CERRADA'].map(v => ({ value: v, label: v }))} /></FormField>
      <FormField label="Severidad"><Select value={form.severidad} onChange={v => set('severidad', v)} options={['baja','media','alta','critica'].map(v => ({ value: v, label: v }))} /></FormField>
      <FormField label="Escala en horas"><Input type="number" value={form.horasEscalamiento} onChange={v => set('horasEscalamiento', Number(v))} /></FormField>
      <FormField label="Responsable"><Select value={form.rolResponsable} onChange={v => set('rolResponsable', v)} options={roles.map(v => ({ value: v, label: v }))} /></FormField>
      <FormField label="Escalar a"><Select value={form.rolEscalamiento} onChange={v => set('rolEscalamiento', v)} options={roles.map(v => ({ value: v, label: v }))} /></FormField>
    </div><FormField label="Descripción"><Textarea value={form.descripcion} onChange={v => set('descripcion', v)} /></FormField><Btn onClick={() => create.mutate(form)} disabled={create.isPending || !form.codigo || !form.nombre}>Crear regla</Btn></section>
    <section style={card}><h3 style={title}>Catálogo activo</h3><Table rows={reglas} getRowKey={r => r.id} columns={[{ key:'codigo',label:'Código' },{key:'nombre',label:'Regla'},{key:'estadoDestino',label:'Transición'},{key:'rolResponsable',label:'Responsable'},{key:'horasEscalamiento',label:'Escala' ,render:v=>`${v} h`},{key:'activo',label:'Activa',render:v=><Badge tone={v?'green':'gray'}>{v?'Sí':'No'}</Badge>}]} emptyMessage="Sin reglas" /></section>
    <section style={card}><h3 style={title}>Alertas abiertas y escaladas</h3><Table rows={alertas.filter(a => a.estado !== 'RESUELTA')} getRowKey={a => a.id} columns={[{key:'regla',label:'Regla',render:v=>v?.nombre},{key:'orden',label:'Venta',render:v=>v?.nInterno||v?.id||'-'},{key:'estado',label:'Estado',render:v=><Badge tone={v==='ESCALADA'?'red':'amber'}>{v}</Badge>},{key:'venceAt',label:'Vence',render:v=>new Date(v).toLocaleString('es-CL')},{key:'_r',label:'',render:(_,r)=><Btn size="xs" onClick={()=>resolve.mutate(r.id)}>Resolver</Btn>}]} emptyMessage="Sin alertas pendientes" /></section>
  </main>
}
const card={background:'#fff',border:'1px solid var(--border)',borderRadius:12,padding:16,marginBottom:16}; const title={fontSize:15,margin:'0 0 14px'}; const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10}
