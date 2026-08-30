// Centro de notificaciones — calculadas al vuelo (sin tabla). Cada vez que el
// usuario abre la campana, se revisan las condiciones en vivo y se devuelve una
// lista unificada. Solo lectura, ordenada por severidad/fecha.

import { semaforoForCrm } from '../../domain/crm/service.js'

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
      // Quien gestiona el taller ve toda la carga; el operario ve lo suyo.
      // Sin esta distincion una cortadora recibia las OT atrasadas de espuma y
      // madera, que no son su trabajo, y el aviso se volvia ruido.
      const gestionaTaller = puede('taller.gestion', 'write')

      // Trabajo nuevo asignado. Antes no existia aviso de ENTRADA: el taller solo
      // se enteraba de una OT cuando ya estaba atrasada, y mientras tanto la
      // coordinacion ocurria por WhatsApp -es lo que reportaron las tres fichas
      // de taller-.
      if (request.user?.id) {
        const asignados = await prisma.odtItemTaller.findMany({
          where: {
            operarioResponsableId: request.user.id,
            estado: 'pendiente',
            odtItem: { eliminado: false, odt: { eliminado: false, estado: { notIn: ['Terminada', 'Entregada', 'Anulada'] } } },
          },
          select: {
            id: true,
            taller: { select: { nombre: true } },
            odtItem: {
              select: { nombre: true, cantidad: true, odt: { select: { id: true, clienteNombre: true, plazo: true, fechaEntregaCompromiso: true } } },
            },
          },
          orderBy: { id: 'desc' },
          take: 50,
        })
        for (const item of asignados) {
          const odt = item.odtItem?.odt
          const compromiso = odt?.fechaEntregaCompromiso || odt?.plazo
          const dias = compromiso ? diasHasta(compromiso) : null
          items.push({
            tipo: 'taller_trabajo_asignado',
            severidad: dias !== null && dias <= 2 ? 'alta' : 'media',
            titulo: `Trabajo asignado: ${item.odtItem?.nombre || 'sin nombre'}`,
            detalle: [
              item.taller?.nombre,
              item.odtItem?.cantidad ? `${item.odtItem.cantidad} u.` : null,
              odt?.clienteNombre,
              dias !== null ? (dias < 0 ? `atrasado ${Math.abs(dias)} día(s)` : `entrega en ${dias} día(s)`) : null,
            ].filter(Boolean).join(' · '),
            fecha: compromiso || ahora,
            link: odt?.id ? `/taller/${odt.id}` : '/taller',
          })
        }
      }

      // Atrasos. Para quien gestiona, toda la carga; para el operario, solo lo suyo.
      const odts = await prisma.odt.findMany({
        where: {
          eliminado: false,
          estado: { notIn: ['Terminada', 'Entregada', 'Anulada'] },
          OR: [
            { plazo: { not: null, lt: ahora } },
            { fechaEntregaCompromiso: { not: null, lt: ahora } },
          ],
          ...(gestionaTaller ? {} : {
            items: { some: { eliminado: false, talleres: { some: { operarioResponsableId: request.user?.id ?? -1 } } } },
          }),
        },
        select: { id: true, plazo: true, fechaEntregaCompromiso: true, clienteNombre: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      for (const o of odts) {
        const ref = o.fechaEntregaCompromiso || o.plazo
        const dias = Math.abs(diasHasta(ref))
        items.push({
          tipo: 'odt_atrasada',
          severidad: dias > 7 ? 'alta' : 'media',
          titulo: `ODT atrasada: #${o.id}`,
          detalle: `${o.clienteNombre || 'Sin cliente'} · atrasada ${dias} día(s)`,
          fecha: ref,
          link: `/taller/${o.id}`,
        })
      }
    }

    // Stock bajo el critico. El dato existia -stockCritico y un job que manda
    // correo- pero no llegaba a la campana, asi que el encargado de inventario
    // se enteraba por mail o no se enteraba.
    //
    // Se mide el DISPONIBLE, no el fisico: lo reservado y lo danado no se puede
    // vender, y contarlos como stock hace que el aviso llegue tarde.
    // Con 'write', no con 'read': el taller tiene bodega:read para consultar
    // stock, y no es su trabajo reponer. Un aviso que no es tuyo es ruido.
    if (puede('bodega', 'write')) {
      const criticos = await prisma.$queryRaw`
        SELECT id, nombre, codigo_interno,
               (stock - stock_reservado - stock_danado) AS disponible,
               stock_critico
          FROM catalogo.productos
         WHERE activo = true
           AND stock_critico > 0
           AND (stock - stock_reservado - stock_danado) <= stock_critico
         ORDER BY (stock - stock_reservado - stock_danado) ASC
         LIMIT 50
      `
      for (const p of criticos) {
        const disponible = Number(p.disponible)
        items.push({
          tipo: 'stock_critico',
          severidad: disponible <= 0 ? 'alta' : 'media',
          titulo: disponible <= 0
            ? `Sin stock disponible: ${p.nombre || p.codigo_interno}`
            : `Stock bajo el crítico: ${p.nombre || p.codigo_interno}`,
          detalle: `${p.codigo_interno || 'sin código'} · disponible ${disponible} · crítico ${p.stock_critico}`,
          fecha: ahora,
          link: `/productos?id=${p.id}`,
        })
      }
    }

    // Entregado y sin facturar. El listado de ventas ya tenia el filtro, pero
    // habia que ir a buscarlo: nadie avisaba que una venta salio y no se emitio
    // el documento. Es plata entregada sin cobrar.
    if (puede('facturacion.emitir', 'write')) {
      // En dos pasos: Orden guarda los documentos por FK pero no declara la
      // relacion, asi que no se puede filtrar con un `none` anidado.
      const facturadas = await prisma.factDocumento.findMany({
        where: {
          ordenId: { not: null },
          tipoDte: { in: [33, 39] },
          estado: { notIn: ['borrador', 'rechazado', 'error', 'anulado'] },
        },
        select: { ordenId: true },
      }).catch(() => [])
      const yaFacturadas = [...new Set(facturadas.map(d => d.ordenId).filter(Boolean))]
      const entregadas = await prisma.orden.findMany({
        where: {
          eliminada: false,
          estadoEntrega: { in: ['Entregada', 'Entregado'] },
          ...(yaFacturadas.length ? { id: { notIn: yaFacturadas } } : {}),
        },
        select: { id: true, nInterno: true, createdAt: true, rutCliente: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }).catch(() => [])
      for (const o of entregadas) {
        const dias = Math.abs(diasHasta(o.createdAt))
        items.push({
          tipo: 'venta_sin_facturar',
          severidad: dias > 15 ? 'alta' : 'media',
          titulo: `Entregada sin facturar: venta #${o.nInterno || o.id}`,
          detalle: `${o.rutCliente || 'sin RUT'} · ${dias} día(s) desde la venta`,
          fecha: o.createdAt,
          link: `/ventas/${o.id}`,
        })
      }
    }

    // 4. Producción terminada: visible tanto para bodega como despacho.
    // Una ODT sólo entra cuando todos sus talleres activos dejaron cada item listo.
    if (puede('bodega') || puede('despacho')) {
      const candidatas = await prisma.odt.findMany({
        where: { eliminado: false, estado: { notIn: ['Terminada', 'Entregada', 'Anulada'] } },
        select: {
          id: true, clienteNombre: true, fechaEntregaCompromiso: true, plazo: true, createdAt: true,
          items: { where: { eliminado: false }, select: { talleres: { select: { estado: true, fechaListo: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      for (const odt of candidatas) {
        const estaciones = odt.items.flatMap(item => item.talleres).filter(item => item.estado !== 'cancelado')
        if (!estaciones.length || !estaciones.every(item => item.estado === 'listo')) continue
        items.push({
          tipo: 'odt_lista_despacho',
          severidad: 'media',
          titulo: `ODT lista para bodega y despacho: #${odt.id}`,
          detalle: odt.clienteNombre || 'Producción terminada; coordinar preparación y ruta.',
          fecha: odt.fechaEntregaCompromiso || odt.plazo || odt.createdAt,
          link: `/despachos?odtId=${odt.id}`,
        })
      }
    }

    // 5. Despachos/entregas pendientes con plazo vencido.
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

    // Taller rechazo un item: le vuelve a la vendedora con el motivo.
    //
    // El rechazo por item ya existe y exige motivo, pero solo quedaba en la
    // bitacora del taller: nadie avisaba a quien hizo la venta. El caso tipico
    // que describio Plastimar es un producto descontinuado ingresado por error;
    // son pocos, pero si nadie se entera la OT queda detenida sin dueno.
    //
    // Se resuelve en dos pasos porque Odt guarda `ordenId` pero no declara la
    // relacion con Orden. Y no sirve `Odt.vendedorId`: esta vacio en las 5.772
    // OT, mientras que ordenId esta en todas.
    if (puede('ventas')) {
      const rechazados = await prisma.odtItemTaller.findMany({
        where: {
          estado: 'rechazado',
          odtItem: { eliminado: false, odt: { eliminado: false, estado: { notIn: ['Anulada', 'Entregada'] } } },
        },
        select: {
          id: true,
          obs: true,
          fechaInicio: true,
          taller: { select: { nombre: true } },
          odtItem: { select: { nombre: true, odt: { select: { id: true, ordenId: true } } } },
        },
        orderBy: { id: 'desc' },
        take: 100,
      })
      const ordenIds = [...new Set(rechazados.map(item => item.odtItem?.odt?.ordenId).filter(Boolean))]
      const ordenes = ordenIds.length
        ? await prisma.orden.findMany({
            where: { id: { in: ordenIds } },
            select: { id: true, nInterno: true, userId: true },
          })
        : []
      const ordenById = new Map(ordenes.map(orden => [orden.id, orden]))
      // Cada vendedor ve solo lo suyo: si le llega a todo el equipo se vuelve
      // ruido y nadie lo atiende. Admin y coordinacion comercial ven todo.
      const veTodo = request.user?.role === 'admin' || request.user?.role === 'coordinador_comercial'
      for (const item of rechazados) {
        const orden = ordenById.get(item.odtItem?.odt?.ordenId)
        if (!veTodo && orden?.userId !== request.user?.id) continue
        const odtId = item.odtItem?.odt?.id
        const venta = orden?.nInterno || orden?.id
        items.push({
          tipo: 'taller_item_rechazado',
          severidad: 'alta',
          titulo: `Taller rechazo un producto${venta ? ` de la venta #${venta}` : ''}`,
          detalle: [item.odtItem?.nombre, item.taller?.nombre, item.obs]
            .filter(Boolean).join(' · ') || 'Sin motivo registrado',
          fecha: item.fechaInicio || ahora,
          link: odtId ? `/taller?odtId=${odtId}` : '/taller',
        })
      }
    }

    // Orden final: severidad alta primero, luego por fecha más antigua/urgente.
    // CRM sin gestión: respeta cartera del vendedor y usa el mismo semáforo del pipeline.
    if (puede('ventas')) {
      const crmWhere = { etapaComercial: { not: 'CERRADO' } }
      if (request.user?.role !== 'admin') crmWhere.vendedorId = request.user?.id ?? -1
      const leads = await prisma.crmRegistro.findMany({ where: crmWhere, orderBy: { ultimaGestionAt: 'asc' }, take: 100 })
      for (const lead of leads) {
        const { semaforo, diasSinGestion } = semaforoForCrm(lead, ahora)
        // semaforo null = la oportunidad no se puntúa (histórica, cerrada o sin
        // responsable asignado). No corresponde alertar sobre ella.
        if (!semaforo || semaforo === 'NORMAL') continue
        items.push({
          tipo: 'crm_sin_gestion',
          severidad: semaforo === 'AMARILLO' ? 'media' : 'alta',
          titulo: `${semaforo === 'ROJO' ? 'Gestión CRM atrasada' : 'Alerta CRM'}: ${lead.nombre || lead.rsocial || `#${lead.id}`}`,
          detalle: `${diasSinGestion} día(s) hábiles sin gestión · ${lead.etapaComercial || 'Etapa legacy'}`,
          fecha: lead.ultimaGestionAt || lead.fechaCotizacion || lead.fecha || lead.createdAt,
          link: '/crm',
        })
      }
    }

    const sevRank = { alta: 0, media: 1, baja: 2 }
    items.sort((a, b) => (sevRank[a.severidad] - sevRank[b.severidad]) || (new Date(a.fecha) - new Date(b.fecha)))

    return { total: items.length, items: items.slice(0, 100) }
  })
}
