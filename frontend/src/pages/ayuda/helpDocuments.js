import { can, getUserRole } from '../../utils/permissions'

export const HELP_DOCUMENTS = [
  { id: 'DOC-00', title: 'Guía general de Marcha Blanca', description: 'Mapa documental, reglas de operación y protocolo ante diferencias.', href: '/ayuda/00_MAPA_DOCUMENTACION_Y_GUIA_INICIO/index.html', audience: 'all', tone: '#047857' },
  { id: 'DOC-01', title: 'Dossier para Gerencia', description: 'Flujo transversal, riesgos, supervisión e indicadores de control.', href: '/ayuda/01_DOSSIER_GERENCIA/index.html', roles: ['admin', 'solo_lectura'], tone: '#0f766e' },
  { id: 'DOC-02', title: 'Ventas y Licitaciones', description: 'Venta Sala, Convenio Marco, CRM, plazos, descuentos y seguimiento.', href: '/ayuda/roles/02_ROL_VENTAS_Y_LICITACIONES/index.html', roles: ['admin', 'vendedor', 'coordinador_comercial'], tone: '#0369a1' },
  { id: 'DOC-03', title: 'Bodega y Logística', description: 'Stock, ingresos, movimientos, telas, picking y packing.', href: '/ayuda/roles/03_ROL_BODEGA/index.html', roles: ['admin', 'bodeguero'], tone: '#475569' },
  { id: 'DOC-04', title: 'Despacho y Reparto', description: 'Programación, tracking, guía DTE 52, parciales e incidencias.', href: '/ayuda/roles/04_ROL_DESPACHO/index.html', roles: ['admin', 'bodeguero'], tone: '#7c3aed' },
  { id: 'DOC-05', title: 'Taller y Producción', description: 'ODT, asignación, avances, materiales, calidad y reproceso.', href: '/ayuda/roles/05_ROL_TALLER/index.html', roles: ['admin', 'taller'], tone: '#b45309' },
  { id: 'DOC-05B', title: 'Ficha rápida del Operario', description: 'Inicio, pausa, avance parcial, finalización y reporte seguro.', href: '/ayuda/roles/05_ROL_TALLER/FICHA_RAPIDA_OPERARIO.html', roles: ['admin', 'taller', 'taller_operario'], tone: '#a16207' },
  { id: 'DOC-06', title: 'Caja y Cobranza', description: 'Turnos, pagos, arqueo, diferencias y cartera pendiente.', href: '/ayuda/roles/06_ROL_CAJA_Y_COBRANZA/index.html', roles: ['admin', 'cajero'], tone: '#be123c' },
  { id: 'DOC-07', title: 'Facturación DTE', description: 'Borrador, emisión, Track ID, consulta SII y notas de crédito.', href: '/ayuda/roles/07_ROL_FACTURACION_DTE/index.html', module: 'facturacion', tone: '#1d4ed8' },
  { id: 'DOC-08', title: 'Administración', description: 'Usuarios, roles, permisos extra, contraseñas y bajas.', href: '/ayuda/roles/08_ROL_ADMINISTRACION/index.html', roles: ['admin'], tone: '#4338ca' },
  { id: 'DOC-09', title: 'Reportar una observación', description: 'Cómo reportar una Falla, Falta o Mejora con evidencia útil.', href: '/ayuda/widget/09_GUIA_FEEDBACK_Y_REPORTE_FALLAS/index.html', audience: 'all', tone: '#b91c1c' },
]

export function helpDocumentsForUser(user) {
  const role = getUserRole(user)
  if (role === 'admin') return HELP_DOCUMENTS
  return HELP_DOCUMENTS.filter(document => {
    if (document.audience === 'all') return true
    if (document.roles?.includes(role)) return true
    if (document.module && can(user, document.module, 'read')) return true
    return false
  })
}
