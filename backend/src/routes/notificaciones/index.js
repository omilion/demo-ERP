// Centro de notificaciones — calculadas al vuelo (sin tabla). Cada vez que el
// usuario abre la campana, se revisan las condiciones en vivo y se devuelve una
// lista unificada. Solo lectura, ordenada por severidad/fecha.

const DIA_MS = 24 * 60 * 60 * 1000

function diasHasta(fecha) {
  if (!fecha) return null
  return Math.round((new Date(fecha).getTime() - Date.now()) / DIA_MS)
}

export default async function notificacionesRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const prisma = fastify.prisma
    const ahora = new Date()
    const en7dias = new Date(Date.now() + 7 * DIA_MS)
    const items = []

    // Helpers de permiso: solo incluir lo que el usuario puede ver.
    const { can } = await import('../../middleware/rbac.js')
    const puede = (mod, perm = 'read') => can(request.user?.role, mod, perm, request.user?.permisosExtra)

    // 1. Plazos de licitación: por vencer (<=7 días) o vencidos, aún activas.
    if (puede('licitaciones')) {
      const lics = await prisma.cotizacionLicitacion.findMany({
        where: {
          fechaPlazo: { not: null, lte: en7dias },
          estado: { in: ['Pendiente', 'En proceso'] },
        },
        select: { id: true, idLicitacion: true, referencia: true, fechaPlazo: true },
        orderBy: { fechaPlazo: 'asc' },
        take: 50,
      })
      for (const l of lics) {
        const dias = diasHasta(l.fechaPlazo)
        const vencida = dias < 0
        items.push({
          tipo: 'licitacion',
          severidad: vencida ? 'alta' : dias <= 2 ? 'alta' : 'media',
          titulo: vencida ? `Licitación vencida: ${l.idLicitacion || '#' + l.id}` : `Licitación por vencer: ${l.idLicitacion || '#' + l.id}`,
          detalle: vencida ? `Venció hace ${Math.abs(dias)} día(s)` : `Vence en ${dias} día(s)`,
          fecha: l.fechaPlazo,
          link: `/licitaciones/${l.id}`,
        })
      }
    }

    // 2. Facturas de proveedores vencidas y pendientes.
    if (puede('proveedores')) {
      const facturas = await prisma.pagoProveedor.findMany({
        where: {
          eliminado: false,
          estado: 'Pendiente',
          fechaVencimiento: { not: null, lt: ahora },
        },
        select: { id: true, nDoc: true, total: true, fechaVencimiento: true },
        orderBy: { fechaVencimiento: 'asc' },
        take: 50,
      })
      for (const f of facturas) {
        const dias = Math.abs(diasHasta(f.fechaVencimiento))
        items.push({
          tipo: 'factura_proveedor',
          severidad: dias > 30 ? 'alta' : 'media',
          titulo: `Factura proveedor vencida: ${f.nDoc || '#' + f.id}`,
          detalle: `Vencida hace ${dias} día(s) · $${Math.round(f.total || 0).toLocaleString('es-CL')}`,
          fecha: f.fechaVencimiento,
          link: `/pagos-proveedores/${f.id}`,
        })
      }
    }

    // 3. ODT atrasadas (plazo o compromiso de entrega ya pasado, no terminadas).
    if (puede('taller')) {
      const odts = await prisma.odt.findMany({
        where: {
          eliminado: false,
          estado: { notIn: ['Terminada', 'Entregada', 'Anulada'] },
          OR: [
            { plazo: { not: null, lt: ahora } },
            { fechaEntregaCompromiso: { not: null, lt: ahora } },
          ],
        },
        select: { id: true, nInterno: true, plazo: true, fechaEntregaCompromiso: true, clienteNombre: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      for (const o of odts) {
        const ref = o.fechaEntregaCompromiso || o.plazo
        const dias = Math.abs(diasHasta(ref))
        items.push({
          tipo: 'odt_atrasada',
          severidad: dias > 7 ? 'alta' : 'media',
          titulo: `ODT atrasada: #${o.nInterno || o.id}`,
          detalle: `${o.clienteNombre || 'Sin cliente'} · atrasada ${dias} día(s)`,
          fecha: ref,
          link: `/taller/${o.id}`,
        })
      }
    }

    // 4. Despachos/entregas pendientes con plazo vencido.
    if (puede('ventas')) {
      const ordenes = await prisma.orden.findMany({
        where: {
          eliminada: false,
          estadoEntrega: { notIn: ['Entregada', 'Entregado'] },
          fechaPlazo: { not: null, lt: ahora },
        },
        select: { id: true, nInterno: true, fechaPlazo: true, estadoEntrega: true, regionDespacho: true, ciudadDespacho: true },
        orderBy: { fechaPlazo: 'asc' },
        take: 50,
      })
      for (const o of ordenes) {
        const dias = Math.abs(diasHasta(o.fechaPlazo))
        const destino = [o.ciudadDespacho, o.regionDespacho].filter(Boolean).join(', ')
        items.push({
          tipo: 'entrega_pendiente',
          severidad: dias > 7 ? 'alta' : 'media',
          titulo: `Entrega atrasada: venta #${o.nInterno || o.id}`,
          detalle: `${o.estadoEntrega}${destino ? ' · ' + destino : ''} · ${dias} día(s)`,
          fecha: o.fechaPlazo,
          link: `/ventas/${o.id}`,
        })
      }
    }

    // Orden final: severidad alta primero, luego por fecha más antigua/urgente.
    const sevRank = { alta: 0, media: 1, baja: 2 }
    items.sort((a, b) => (sevRank[a.severidad] - sevRank[b.severidad]) || (new Date(a.fecha) - new Date(b.fecha)))

    return { total: items.length, items: items.slice(0, 100) }
  })
}
