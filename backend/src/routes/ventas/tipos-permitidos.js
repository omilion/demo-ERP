import { grafiasDeTipoVenta, normalizeTipoVenta } from './estados-normalize.js'

const ROLES_TRANSVERSALES = new Set(['admin', 'coordinador_comercial'])

// null = sin restriccion. Esto conserva el acceso de todas las cuentas que ya
// existian antes de incorporar esta matriz. Solo una lista configurada limita
// los tipos disponibles para ese ejecutivo.
export function tiposVentaPermitidos(user) {
  if (ROLES_TRANSVERSALES.has(user?.role)) return null
  if (!Array.isArray(user?.tiposVentaPermitidos)) return null
  return [...new Set(user.tiposVentaPermitidos.map(tipo => normalizeTipoVenta(tipo)).filter(Boolean))]
}

export function puedeGestionarTipoVenta(user, tipo) {
  const permitidos = tiposVentaPermitidos(user)
  if (permitidos === null) return true
  const canonico = normalizeTipoVenta(tipo)
  return Boolean(canonico && permitidos.includes(canonico))
}

export function assertTipoVentaPermitido(reply, user, tipo) {
  if (puedeGestionarTipoVenta(user, tipo)) return true
  reply.code(403).send({ error: 'No tiene permiso para gestionar este tipo de venta' })
  return false
}

export function whereTiposVentaPermitidos(user) {
  const permitidos = tiposVentaPermitidos(user)
  if (permitidos === null) return null
  const grafias = [...new Set(permitidos.flatMap(grafiasDeTipoVenta))]
  return { tipo: { in: grafias.length ? grafias : ['__sin_tipo_autorizado__'] } }
}
