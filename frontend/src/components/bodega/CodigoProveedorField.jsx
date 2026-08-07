import { useState } from 'react'
import { useResolverCodigoProveedor, useAutocompleteProductos, useUpsertProductoProveedor } from '../../api/productos'

const inputStyle = { width: '100%', padding: '6px 7px', borderRadius: 5, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 12, boxSizing: 'border-box' }
const fmt = value => '$' + Math.round(Number(value) || 0).toLocaleString('es-CL')

// Cruce de codigos: el codigo que trae la factura del proveedor casi nunca
// coincide con nuestro codigoInterno. Al salir del campo se intenta resolver
// contra (1) un mapeo ya guardado para ese proveedor, (2) coincidencia
// directa de codigoInterno y, si no hay match, se ofrecen candidatos por
// nombre (autocomplete existente) para mapear en el momento sin duplicar
// el producto. Si tampoco hay candidato, sigue el flujo normal de "producto
// nuevo" (ya soportado aguas abajo con el nombre que se tipee).
export default function CodigoProveedorField({ value, onChange, onResolved, proveedorId, nombre }) {
  const [tipeado, setTipeado] = useState(value)
  const [estado, setEstado] = useState('idle') // idle | checking | mapeo | sku | candidatos | sin-match
  const [candidatos, setCandidatos] = useState([])
  const resolver = useResolverCodigoProveedor()
  const autocomplete = useAutocompleteProductos()
  const guardarMapeo = useUpsertProductoProveedor()

  const aplicarMatch = (producto, matchType) => {
    onChange(producto.codigoInterno)
    onResolved?.({ codigoInterno: producto.codigoInterno, nombre: producto.nombre, unidadMedida: producto.unidadMedida, precio: producto.precioLista, productoId: producto.id })
    setEstado(matchType)
    setCandidatos([])
  }

  const resolverCodigo = async () => {
    const codigo = tipeado.trim()
    onChange(tipeado)
    if (!codigo || !proveedorId) { setEstado('idle'); return }
    setEstado('checking')
    try {
      const result = await resolver.mutateAsync({ proveedorId, codigo })
      if (result.match) { aplicarMatch(result.match, result.matchType); return }
      // Sin mapeo ni SKU directo: busca por nombre (lo tipeado, o el nombre
      // que el usuario ya haya puesto en la fila) para no duplicar productos.
      const termino = (nombre || codigo).trim()
      if (termino.length >= 2) {
        const items = await autocomplete.mutateAsync(termino)
        if (items?.length) { setCandidatos(items); setEstado('candidatos'); return }
      }
      setEstado('sin-match')
    } catch {
      setEstado('idle')
    }
  }

  const elegirCandidato = producto => {
    aplicarMatch(producto, 'sku')
    // Se sabe recien ahora que este codigo del proveedor corresponde a este
    // producto: se guarda el mapeo para que la proxima compra resuelva directo.
    guardarMapeo.mutate({ productoId: producto.id, proveedorId, costo: producto.precioLista || 0, cantidad: 0, codigoProveedor: tipeado.trim() })
  }

  return (
    <div>
      <input
        value={tipeado}
        onChange={event => { setTipeado(event.target.value); setEstado('idle') }}
        onBlur={resolverCodigo}
        placeholder="Código del proveedor o SKU"
        style={inputStyle}
      />
      {estado === 'checking' && <div style={{ marginTop: 3, fontSize: 10, color: 'var(--text-3)' }}>Buscando...</div>}
      {estado === 'mapeo' && <div style={{ marginTop: 3, fontSize: 10, color: 'var(--green-700)' }}>✓ Mapeado — código real {value}</div>}
      {estado === 'sku' && <div style={{ marginTop: 3, fontSize: 10, color: 'var(--blue)' }}>✓ Coincide con SKU {value}</div>}
      {estado === 'sin-match' && <div style={{ marginTop: 3, fontSize: 10, color: 'var(--amber)' }}>Sin coincidencia — se creará como producto nuevo</div>}
      {estado === 'candidatos' && (
        <div style={{ marginTop: 4, border: '1px solid var(--border)', borderRadius: 6, maxHeight: 130, overflowY: 'auto', background: '#fff' }}>
          <div style={{ padding: '4px 6px', fontSize: 10, color: 'var(--text-3)' }}>¿Es alguno de estos?</div>
          {candidatos.map(producto => (
            <button
              key={producto.id}
              type="button"
              onClick={() => elegirCandidato(producto)}
              style={{ display: 'block', width: '100%', padding: '6px 7px', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 11 }}
            >
              <div style={{ fontWeight: 600 }}>{producto.nombre}</div>
              <div style={{ color: 'var(--text-3)' }}>{producto.codigoInterno} · {fmt(producto.precioLista)}</div>
            </button>
          ))}
          <button type="button" onClick={() => setEstado('sin-match')} style={{ display: 'block', width: '100%', padding: '6px 7px', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)' }}>
            Ninguno — es producto nuevo
          </button>
        </div>
      )}
    </div>
  )
}
