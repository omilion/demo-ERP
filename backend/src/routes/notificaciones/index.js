// Centro de notificaciones — calculadas al vuelo (sin tabla). Cada vez que el
// usuario abre la campana, se revisan las condiciones en vivo y se devuelve una
// lista unificada. Solo lectura, ordenada por severidad/fecha.

import { semaforoForCrm } from '../../domain/crm/service.js'
import { canApproveDescuento } from '../ventas/descuentos-permissions.js'
import { discountRulesEnabled } from '../descuentos/rules-status.js'

const DIA_MS = 24 * 60 * 60 * 1000

function diasHasta(fecha) {
  if (!fecha) return null
  return Math.round((new Date(fecha).getTime() - Date.now()) / DIA_MS)
}

function diasDesde(fecha) {
  if (!fecha) return null
  return Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / DIA_MS))
}

export default async function notificacionesRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const prisma = fastify.prisma
    // La campana no debe intentar renderizar miles de avisos históricos. El
    // límite queda explícito para que los paneles especializados y las pruebas
    // puedan consultar un conjunto mayor sin depender de un corte oculto.
    const requestedLimit = Number.parseInt(request.query?.limite, 10)
    const limite = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 5000))
      : 100
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
         LIMIT ${limite}
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

      // El aviso anterior llega cuando la venta ya salio: sirve para reclamar, no
      // para preparar. Este avisa mientras bodega la esta armando, que es cuando
      // facturacion todavia alcanza a emitir sin frenar el despacho. La emision
      // sigue siendo manual; lo unico que cambia es cuando se entera.
      const enPreparacion = await prisma.despacho.findMany({
        where: {
          eliminado: false,
          ordenId: yaFacturadas.length ? { not: null, notIn: yaFacturadas } : { not: null },
          fechaEntrega: null,
        },
        select: { id: true, ordenId: true, parcial: true, fechaInterno: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }).catch(() => [])
      const ordenesPrep = enPreparacion.length
        ? await prisma.orden.findMany({
          where: { id: { in: enPreparacion.map(d => d.ordenId) }, eliminada: false },
          select: { id: true, nInterno: true, rutCliente: true },
        }).catch(() => [])
        : []
      const prepPorId = Object.fromEntries(ordenesPrep.map(o => [o.id, o]))
      for (const d of enPreparacion) {
        const o = prepPorId[d.ordenId]
        if (!o) continue
        items.push({
          tipo: 'venta_en_preparacion_sin_documento',
          severidad: 'media',
          titulo: `En preparación y sin documento: venta #${o.nInterno || o.id}`,
          detalle: `Bodega la está preparando${d.parcial ? ' (parcial)' : ''}${o.rutCliente ? ' · ' + o.rutCliente : ''}`,
          fecha: d.fechaInterno || d.createdAt,
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
        // Comparacion insensible a mayusculas: el legado dejo 5.173 estaciones en
        // "Listo" y el resto escribe "listo". Con igualdad exacta, una OT terminada
        // hace meses nunca aparecia como lista y bodega no se enteraba nunca.
        const esListo = valor => String(valor || '').trim().toLowerCase() === 'listo'
        const estaciones = odt.items.flatMap(item => item.talleres)
          .filter(item => String(item.estado || '').trim().toLowerCase() !== 'cancelado')
        if (!estaciones.length) continue

        const listas = estaciones.filter(item => esListo(item.estado)).length
        if (!listas) continue

        // El taller no termina todo de una vez. Cuando deja parte lista, bodega ya
        // puede ir preparando esa parte en vez de esperar la OT completa; por eso el
        // aviso sale igual, distinguiendo si queda trabajo pendiente.
        const completa = listas === estaciones.length
        items.push({
          tipo: completa ? 'odt_lista_despacho' : 'odt_parcial_picking',
          severidad: 'media',
          titulo: completa
            ? `Lista para picking: OT #${odt.id}`
            : `Picking parcial disponible: OT #${odt.id}`,
          detalle: completa
            ? (odt.clienteNombre || 'Producción terminada; coordinar preparación y ruta.')
            : `${listas} de ${estaciones.length} productos listos${odt.clienteNombre ? ' · ' + odt.clienteNombre : ''}`,
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

    // Descuentos esperando aprobacion.
    //
    // El modulo de Descuentos tiene su propia bandeja, pero quien aprueba no
    // vive en esa pantalla: las solicitudes quedaban ahi sin que nadie se
    // enterara, y con ellas la venta detenida. Le llega solo a quien puede
    // resolverlas -mismo guard que protege el boton de aprobar-, para no
    // avisarle a alguien de algo que no puede destrabar.
    if (discountRulesEnabled() && canApproveDescuento(request.user)) {
      const solicitudes = await prisma.descuentoSolicitud.findMany({
        // El motor de reglas escribe 'PENDIENTE' en mayusculas mientras el
        // schema declara 'pendiente' como default: se comparan sin distinguir
        // caja para que ninguna solicitud quede invisible por eso.
        where: { estado: { equals: 'PENDIENTE', mode: 'insensitive' } },
        select: {
          id: true,
          createdAt: true,
          solicitanteNombre: true,
          origenTipo: true,
          descuentoPctSolicitado: true,
          descuentoMontoSolicitado: true,
          regla: { select: { codigo: true, nombre: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      })
      for (const solicitud of solicitudes) {
        const dias = diasDesde(solicitud.createdAt)
        const pct = solicitud.descuentoPctSolicitado
        const monto = solicitud.descuentoMontoSolicitado
        items.push({
          tipo: 'descuento_aprobacion',
          // Es plata detenida esperando una firma: pasado el primer dia sube.
          severidad: dias >= 1 ? 'alta' : 'media',
          titulo: `Descuento por aprobar: ${solicitud.regla?.nombre || solicitud.regla?.codigo || '#' + solicitud.id}`,
          detalle: [
            pct != null ? `${Number(pct).toLocaleString('es-CL')}%` : null,
            monto != null ? `$${Math.round(monto).toLocaleString('es-CL')}` : null,
            solicitud.origenTipo,
            solicitud.solicitanteNombre ? `solicita ${solicitud.solicitanteNombre}` : null,
            dias === 0 ? 'ingresada hoy' : `${dias} día(s) esperando`,
          ].filter(Boolean).join(' · '),
          fecha: solicitud.createdAt,
          link: '/descuentos',
        })
      }
    }

    const sevRank = { alta: 0, media: 1, baja: 2 }
    const esAvisoProduccion = item => ['odt_lista_despacho', 'odt_parcial_picking'].includes(item.tipo)
    items.sort((a, b) => {
      const prioridad = sevRank[a.severidad] - sevRank[b.severidad]
      if (prioridad) return prioridad
      // La campana tiene tope: un aviso nuevo de preparación no puede quedar
      // oculto detrás de cientos de OTs históricas. Entre avisos de producción,
      // el más reciente es el que Bodega debe tomar primero.
      if (esAvisoProduccion(a) && esAvisoProduccion(b)) return new Date(b.fecha) - new Date(a.fecha)
      return new Date(a.fecha) - new Date(b.fecha)
    })

    return {
      total: items.length,
      visibles: Math.min(items.length, limite),
      truncadas: items.length > limite,
      items: items.slice(0, limite),
    }
  })
}
