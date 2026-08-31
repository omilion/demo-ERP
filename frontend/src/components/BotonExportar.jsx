import { useEffect, useRef, useState } from 'react'
import { Btn } from './shared'
import { downloadFromBackend } from '../utils/csv'
import { toast } from '../store/notif'

// Botón único de exportación para todo el ERP: un desplegable con Excel y CSV.
//
// Antes cada pantalla bajaba sólo CSV y con su propio código. En Excel el CSV
// llega como texto: un código con ceros a la izquierda los pierde, la fecha
// cambia según la configuración regional y los montos no se pueden sumar sin
// convertirlos. El XLSX lleva el tipo en cada celda.
//
// Se mantiene el CSV porque es lo que consumen las importaciones y otras
// herramientas; la elección es del usuario, no una migración.
const OPCIONES = [
  { formato: 'xlsx', etiqueta: 'Excel (.xlsx)', detalle: 'Con columnas y filtros' },
  { formato: 'csv', etiqueta: 'CSV (.csv)', detalle: 'Texto separado por ;' },
]

// Dos formas de usarlo:
//
//   url + nombre        cuando la exportación es directa
//   onExportar(formato) cuando la pantalla ya tiene un handler con lógica
//                       propia —parámetros calculados, varias pestañas, manejo
//                       de error—. Convertir esos a url/params obligaría a
//                       reescribir esa lógica, que es donde se rompen cosas.
export default function BotonExportar({
  url,
  nombre,
  params = {},
  onExportar,
  label = 'Exportar',
  size = 'sm',
  variant = 'secondary',
  disabled = false,
}) {
  const [abierto, setAbierto] = useState(false)
  const [bajando, setBajando] = useState(null)
  const ref = useRef(null)

  // Cerrar al hacer clic fuera o con Escape: un menú que queda abierto tapando
  // la tabla es más molesto que útil.
  useEffect(() => {
    if (!abierto) return undefined
    const fueraDelMenu = evento => { if (ref.current && !ref.current.contains(evento.target)) setAbierto(false) }
    const conEscape = evento => { if (evento.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fueraDelMenu)
    document.addEventListener('keydown', conEscape)
    return () => {
      document.removeEventListener('mousedown', fueraDelMenu)
      document.removeEventListener('keydown', conEscape)
    }
  }, [abierto])

  const descargar = async formato => {
    setAbierto(false)
    setBajando(formato)
    try {
      if (onExportar) await onExportar(formato)
      // El parámetro se llama `archivo`: en algunas vistas `formato` ya elige
      // QUÉ se exporta, que es otra decisión.
      else await downloadFromBackend(url, `${nombre}.${formato}`, { ...params, archivo: formato })
    } catch (error) {
      toast.error(error.response?.data?.error || 'No se pudo exportar')
    } finally {
      setBajando(null)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <Btn
        variant={variant}
        size={size}
        disabled={disabled || Boolean(bajando)}
        onClick={() => setAbierto(open => !open)}
      >
        {bajando ? 'Exportando…' : `${label} ▾`}
      </Btn>
      {abierto && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 40,
            minWidth: 210, background: 'var(--card, #fff)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.12)', overflow: 'hidden',
          }}
        >
          {OPCIONES.map(opcion => (
            <button
              key={opcion.formato}
              type="button"
              role="menuitem"
              onClick={() => descargar(opcion.formato)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{opcion.etiqueta}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{opcion.detalle}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
