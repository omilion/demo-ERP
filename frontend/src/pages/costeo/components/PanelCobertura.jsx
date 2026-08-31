import { useState } from 'react'
import { Btn } from '../../../components/shared'
import { useCoberturaRecetas, useRecalcularMasivo } from '../../../api/costeo'
import { toast } from '../../../store/notif'

// Estado de la carga de recetas.
//
// Las recetas entran por un script que lee el Excel de MK: es una operación de
// una vez cada varios meses y su valor está en el informe de simulación, que no
// cabe en un botón. Pero el resultado sí tiene que verse acá, para saber qué
// quedó cubierto y poder completar el resto con el editor de esta misma página.
export default function PanelCobertura({ onVerProducto }) {
  const { data, isLoading } = useCoberturaRecetas()
  const recalcular = useRecalcularMasivo()
  const [verPendientes, setVerPendientes] = useState(false)

  if (isLoading || !data) return null

  const { productosMk, conReceta, sinReceta, porcentaje, tarifasActivas, pendientes = [] } = data
  // El motor necesita las tres: corte, confección y enfundado. Con menos, la
  // mano de obra se calcula en cero y el costo queda corto sin avisar.
  const faltanTarifas = tarifasActivas < 3

  const recalcularTodo = async () => {
    try {
      const r = await recalcular.mutateAsync({})
      toast.success(`Recalculadas ${r?.actualizadas ?? r?.total ?? ''} recetas`.trim())
    } catch (error) {
      toast.error(error.response?.data?.error || 'No se pudo recalcular')
    }
  }

  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 18, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 750, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--text-1)' }}>
            Cobertura de recetas
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>
            <strong style={{ fontSize: 22, color: porcentaje >= 85 ? 'var(--green-800)' : 'var(--text-1)' }}>
              {porcentaje}%
            </strong>
            <span style={{ marginLeft: 8 }}>
              {conReceta.toLocaleString('es-CL')} de {productosMk.toLocaleString('es-CL')} productos MK
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {sinReceta > 0 && (
            <Btn variant="secondary" size="sm" onClick={() => setVerPendientes(open => !open)}>
              {verPendientes ? 'Ocultar' : `Ver ${sinReceta.toLocaleString('es-CL')} sin receta`}
            </Btn>
          )}
          <Btn variant="secondary" size="sm" onClick={recalcularTodo} disabled={recalcular.isPending || faltanTarifas}>
            {recalcular.isPending ? 'Recalculando…' : 'Recalcular con las tarifas vigentes'}
          </Btn>
        </div>
      </div>

      {/* Sin tarifas el costo sale corto y en silencio: es lo primero a resolver. */}
      {faltanTarifas && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fca5a5', fontSize: 13 }}>
          <strong>Faltan tarifas de mano de obra.</strong> El motor necesita corte, confección y enfundado;
          hay {tarifasActivas} activa{tarifasActivas === 1 ? '' : 's'}. Sin ellas la mano de obra se calcula
          en cero y el costo de fabricación queda corto sin avisar. Se cargan en la pestaña Tarifas.
        </div>
      )}

      {verPendientes && pendientes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
            Productos MK sin receta. Se listan los primeros {pendientes.length}; los inactivos van al final.
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {pendientes.map(producto => (
                  <tr key={producto.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', fontFamily: "'DM Mono', monospace", width: 130 }}>
                      {producto.codigoInterno}
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-2)' }}>{producto.nombre}</td>
                    <td style={{ padding: '7px 10px', width: 90, color: producto.activo ? 'var(--text-3)' : 'var(--red)' }}>
                      {producto.activo ? '' : 'inactivo'}
                    </td>
                    <td style={{ padding: '7px 10px', width: 80, textAlign: 'right' }}>
                      {onVerProducto && (
                        <button
                          type="button"
                          onClick={() => onVerProducto(producto)}
                          style={{ border: 0, background: 'none', color: 'var(--green-800)', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                        >
                          Crear
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
