const ROUTE_MODULES = [
  ['/ventas', 'ventas'], ['/licitaciones', 'ventas'], ['/matriz-ventas', 'ventas'],
  ['/bodega', 'bodega'], ['/stock', 'bodega'], ['/telas', 'bodega'],
  ['/taller', 'taller'], ['/odt', 'taller'], ['/bitacora-taller', 'taller'],
  ['/despachos', 'despachos'], ['/caja', 'caja'], ['/cobranza', 'cobranza'],
  ['/clientes', 'clientes'], ['/proveedores', 'proveedores'], ['/crm', 'ventas'],
  ['/facturacion', 'facturacion'], ['/rrhh', 'rrhh'], ['/usuarios', 'usuarios'],
  ['/reportes', 'reportes'], ['/costeo', 'costeo'], ['/ayuda', 'ayuda'],
]

function inferEntity(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  const id = [...parts].reverse().find(part => /^\d+$/.test(part))
  if (!id) return undefined
  const index = parts.indexOf(id)
  return { type: parts[Math.max(0, index - 1)] || 'registro', id }
}

export function captureAiContext(location) {
  const route = location?.pathname || window.location.pathname
  const title = document.querySelector('h1, [data-page-title]')?.textContent?.trim() || document.title || 'ERP Plastimar'
  const module = ROUTE_MODULES.find(([prefix]) => route.startsWith(prefix))?.[1] || 'general'
  return {
    route: `${route}${location?.search || ''}`.slice(0, 240),
    title: title.slice(0, 160),
    module,
    entity: inferEntity(route),
  }
}

export function suggestedAiQuestions(context) {
  const base = ['Explícame esta pantalla', '¿Qué debería revisar aquí?', 'Abrir el manual relacionado']
  if (context?.entity) base.unshift('Resume este registro y su siguiente paso')
  return base.slice(0, 3)
}
