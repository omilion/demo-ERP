import { toast } from '../../store/notif'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormDivider, useForm } from '../../components/forms/index'
import { ClienteCampos, CLIENTE_RULES, clienteToForm, clienteFormToPayload } from '../../components/forms/clienteFields'
import { SucursalesCliente, sucursalToPayload } from '../../components/forms/SucursalesCliente'
import { useCliente, useCreateCliente, useUpdateCliente, useCreateClienteSucursal } from '../../api/clientes'

export default function ClientesFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const { data: found, isLoading } = useCliente(isEdit ? Number(id) : null, isEdit ? { includeInactivos: 'true' } : {})

  const { data, set, errors, validate } = useForm(clienteToForm(null))

  useEffect(() => {
    if (!found) return
    const form = clienteToForm(found)
    for (const [campo, valor] of Object.entries(form)) set(campo, valor)
  }, [found, set])

  // Sucursales agregadas antes de que el cliente exista: se crean despues de él.
  const [sucursalesNuevas, setSucursalesNuevas] = useState([])

  const createMutation = useCreateCliente()
  const updateMutation = useUpdateCliente()
  const createSucursal = useCreateClienteSucursal()

  const saving = createMutation.isPending || updateMutation.isPending || createSucursal.isPending

  const handleSave = () => {
    if (!validate(CLIENTE_RULES)) return

    const payload = clienteFormToPayload(data)
    const onError = (err) => toast.error(err?.response?.data?.error || 'Error al guardar')

    if (isEdit) {
      updateMutation.mutate({ id: Number(id), data: payload }, { onSuccess: () => navigate('/clientes'), onError })
      return
    }

    createMutation.mutate(payload, {
      onSuccess: async (creado) => {
        // El cliente ya quedó guardado: si alguna sucursal falla, se avisa pero
        // no se pierde el cliente ni se bloquea la navegación.
        const fallidas = []
        for (const sucursal of sucursalesNuevas) {
          try {
            await createSucursal.mutateAsync({ clienteId: creado.id, data: sucursalToPayload(sucursal) })
          } catch {
            fallidas.push(sucursal.nombre)
          }
        }
        if (fallidas.length) toast.error(`Cliente creado, pero no se pudieron agregar: ${fallidas.join(', ')}`)
        navigate('/clientes')
      },
      onError,
    })
  }

  if (isEdit && isLoading) return <main style={{ padding: 24 }}><p>Cargando...</p></main>

  return (
    <FormPage
      title={isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}
      subtitle={isEdit ? `Editando cliente #${id}` : 'Registrar nuevo cliente en el sistema'}
      breadcrumb={['Inicio', 'Clientes', isEdit ? 'Editar Cliente' : 'Nuevo Cliente']}
      onSave={handleSave}
      saving={saving}
    >
      <ClienteCampos data={data} set={set} errors={errors} />

      {isEdit && found?.activo === false && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 14, color: 'var(--text-2)', fontSize: 13, background: 'var(--bg)' }}>
          Cliente inactivo: puedes corregir sus datos generales, pero las sucursales se administran despues de reactivarlo.
        </div>
      )}
      {!isEdit && <SucursalesCliente cliente={null} borradores={sucursalesNuevas} onBorradoresChange={setSucursalesNuevas} />}
      {isEdit && found && found.activo !== false && <SucursalesCliente cliente={found} />}
      {isEdit && found && <HistorialCliente cliente={found} navigate={navigate} />}
    </FormPage>
  )
}

function HistorialCliente({ cliente, navigate }) {
  const ventas = cliente.ventas || []
  const odts = cliente.odts || []
  const fmt = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-CL') : '—'

  if (ventas.length === 0 && odts.length === 0) return null

  return (
    <>
      <FormDivider label={`Historial · ${ventas.length} ventas · ${odts.length} OT`} />
      {ventas.length > 0 && (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 12, maxHeight: 280, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Fecha', 'N° / Tipo', 'Estado', 'Pago', 'Entrega', 'Total'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventas.map(v => (
                <tr key={v.id} onClick={() => navigate(`/ventas/${v.id}/editar`)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: '8px 14px', fontFamily: "'DM Mono', monospace" }}>{fmtDate(v.createdAt)}</td>
                  <td style={{ padding: '8px 14px' }}>#{v.id} · {v.tipo || '—'}</td>
                  <td style={{ padding: '8px 14px' }}>{v.estado}</td>
                  <td style={{ padding: '8px 14px' }}>{v.estadoPago}</td>
                  <td style={{ padding: '8px 14px' }}>{v.estadoEntrega || '—'}</td>
                  <td style={{ padding: '8px 14px', fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{fmt(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {odts.length > 0 && (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Fecha', 'OT', 'Taller', 'Estado'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {odts.map(o => (
                <tr key={o.id} onClick={() => navigate(`/odts/${o.id}`)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: '8px 14px', fontFamily: "'DM Mono', monospace" }}>{fmtDate(o.createdAt)}</td>
                  <td style={{ padding: '8px 14px', fontWeight: 600 }}>#{o.id}</td>
                  <td style={{ padding: '8px 14px' }}>{o.taller || '—'}</td>
                  <td style={{ padding: '8px 14px' }}>{o.estado || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

