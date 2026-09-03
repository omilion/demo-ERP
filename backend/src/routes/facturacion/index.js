import path from 'node:path'
import { createFacturacionDb } from '../../facturacion/db.js'
import { createFacturacionEngine } from '../../facturacion/engine.js'
import { assertDteLineLimits, TIPOS_DTE, computeTotales, computeTotalesExportacion, IND_TRASLADO, TIPO_DESPACHO, isBoleta } from '../../facturacion/documento.js'
import { normalizeRut, isValidRut } from '../../facturacion/xmlUtil.js'
import { parseCaf } from '../../facturacion/caf.js'
import { renderDteHtml, renderDteRecibidoHtml } from '../../facturacion/printDte.js'
import { renderDtePdf, renderDteRecibidoPdf } from '../../facturacion/printDtePdf.js'
import { syncGmailReceptor } from '../../facturacion/receptorDte.js'
import { sendDteEmail, buildReenvioHtml } from '../../facturacion/mailer.js'
import { assertNotaDteInput, evaluarDocumentoParaNota } from '../../facturacion/notas.js'
import { getTrazabilidadOrden, listTrazabilidadExcepciones } from './trazabilidad.js'

const ESTADOS = ['borrador', 'emitido', 'enviado', 'aceptado', 'rechazado', 'error']

function formatRutDisplay(value) {
  const normalized = normalizeRut(value)
  const [body, verifier] = normalized.split('-')
  if (!body || !verifier) return normalized
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${verifier}`
}

function sendError(reply, error) {
  return reply.code(422).send({ error: (error && error.message) || 'Error de facturación.' })
}

function validateDocumentoInput(body) {
  const tipoDte = Number(body.tipoDte)
  if (!TIPOS_DTE[tipoDte]) {
    const err = new Error(`Tipo de DTE inválido. Soportados: ${Object.keys(TIPOS_DTE).join(', ')}.`)
    err.statusCode = 400
    throw err
  }
  const items = Array.isArray(body.items) ? body.items : []
  const detalles = Array.isArray(body.detalles) ? body.detalles : []
  const comisiones = Array.isArray(body.comisiones) ? body.comisiones : []
  assertDteLineLimits({ tipoDte, items, detalles, comisiones })
  if (tipoDte === 43) {
    if (!detalles.length) {
      const err = new Error('La liquidación requiere al menos un detalle.')
      err.statusCode = 400
      throw err
    }
    if (!body.totales || body.totales.total === undefined) {
      const err = new Error('La liquidación requiere totales explícitos.')
      err.statusCode = 400
      throw err
    }
    for (const detalle of detalles) {
      if (!detalle.nombre || !detalle.tpoDocLiq || detalle.monto === undefined) {
        const err = new Error('Cada detalle de liquidación requiere TpoDocLiq, nombre y monto.')
        err.statusCode = 400
        throw err
      }
    }
  }
  if (tipoDte !== 43 && !items.length) {
    const err = new Error('El documento requiere al menos un ítem.')
    err.statusCode = 400
    throw err
  }
  for (const item of items) {
    if (!item.nombre || String(item.nombre).trim() === '') {
      const err = new Error('Todos los ítems deben tener nombre.')
      err.statusCode = 400
      throw err
    }
  }
  const extra = body.extra && typeof body.extra === 'object' ? body.extra : {}
  // Guia de despacho: el SII exige IndTraslado y TipoDespacho. Se validan aca
  // para rechazar antes de que emitir() consuma un folio del CAF (irrecuperable).
  if (tipoDte === 52) {
    if (!IND_TRASLADO[Number(extra.indTraslado)]) {
      const err = new Error(`La guía de despacho requiere un motivo de traslado (IndTraslado) válido: ${Object.keys(IND_TRASLADO).join(', ')}.`)
      err.statusCode = 400
      throw err
    }
    if (!TIPO_DESPACHO[Number(extra.tipoDespacho)]) {
      const err = new Error(`La guía de despacho requiere un tipo de despacho (TipoDespacho) válido: ${Object.keys(TIPO_DESPACHO).join(', ')}.`)
      err.statusCode = 400
      throw err
    }
  }
  return {
    clienteId: body.clienteId || null,
    ordenId: body.ordenId || null,
    guiaDespachoId: body.guiaDespachoId || null,
    tipoDte,
    fechaEmision: body.fechaEmision || null,
    receptor: body.receptor && typeof body.receptor === 'object' ? body.receptor : {},
    items: items.map((item) => ({
      nombre: String(item.nombre).trim(),
      descripcion: item.descripcion ? String(item.descripcion).trim() : null,
      cantidad: Number(item.cantidad) || 1,
      unidad: item.unidad ? String(item.unidad).trim() : null,
      precio: Number(item.precio) || 0,
      descuentoMonto: Number(item.descuentoMonto) || 0,
      exento: Boolean(item.exento)
    })),
    detalles: detalles.map((detalle) => ({
      tpoDocLiq: String(detalle.tpoDocLiq),
      codigo: detalle.codigo ? String(detalle.codigo) : null,
      tipoCodigo: detalle.tipoCodigo ? String(detalle.tipoCodigo) : null,
      exento: Boolean(detalle.exento),
      nombre: String(detalle.nombre || '').trim(),
      descripcion: detalle.descripcion ? String(detalle.descripcion).trim() : null,
      cantidad: detalle.cantidad === undefined ? undefined : Number(detalle.cantidad),
      unidad: detalle.unidad ? String(detalle.unidad).trim() : null,
      precio: detalle.precio === undefined ? undefined : Number(detalle.precio),
      monto: detalle.monto === undefined ? undefined : Number(detalle.monto)
    })),
    comisiones,
    referencias: Array.isArray(body.referencias) ? body.referencias : [],
    extra: tipoDte === 52
      ? { ...extra, indTraslado: Number(extra.indTraslado), tipoDespacho: Number(extra.tipoDespacho) }
      : extra,
    totales: tipoDte === 43 && body.totales && typeof body.totales === 'object' ? body.totales : {}
  }
}

export async function enviarLotePorTipo({ ids, db, engine }) {
  const uniqueIds = [...new Set(ids.map(Number).filter(Number.isInteger))]
  const documentos = await Promise.all(uniqueIds.map(id => db.documentos.get(id)))
  const encontrados = documentos.filter(Boolean)
  const grupos = [
    encontrados.filter(doc => isBoleta(doc.tipoDte)),
    encontrados.filter(doc => !isBoleta(doc.tipoDte)),
  ].filter(grupo => grupo.length)
  const resultados = uniqueIds
    .filter(id => !encontrados.some(doc => doc.id === id))
    .map(id => ({ id, ok: false, error: 'Documento no encontrado.' }))
  const envios = []

  for (const grupo of grupos) {
    try {
      const envio = await engine.enviar(grupo.map(doc => doc.id))
      envios.push({ trackId: envio.trackId, ids: grupo.map(doc => doc.id) })
      const actualizados = new Map((envio.documentos || []).map(doc => [doc.id, doc]))
      for (const doc of grupo) {
        resultados.push({
          id: doc.id,
          folio: doc.folio,
          tipoDte: doc.tipoDte,
          ok: true,
          trackId: envio.trackId,
          estado: actualizados.get(doc.id)?.estado || 'enviado',
        })
      }
    } catch (error) {
      for (const doc of grupo) {
        resultados.push({ id: doc.id, folio: doc.folio, tipoDte: doc.tipoDte, ok: false, error: error?.message || 'Error de envio al SII.' })
      }
    }
  }

  const ordered = uniqueIds.map(id => resultados.find(result => result.id === id))
  return {
    resultados: ordered,
    envios,
    exitosos: ordered.filter(result => result?.ok).length,
    fallidos: ordered.filter(result => !result?.ok).length,
  }
}

export default async function facturacionRoutes(fastify) {
  const db = createFacturacionDb(fastify.prisma)
  const engine = createFacturacionEngine({ db, dataDir: path.join(process.cwd(), 'data', 'facturacion') })

  // Red de seguridad del envio automatico: POST /documentos/:id/emitir intenta
  // enviar al SII apenas emite, pero si ese intento falla (SII caido, timeout,
  // ECONNRESET) el documento queda 'emitido' sin trackId y antes se quedaba
  // asi para siempre hasta que alguien lo notara y apretara "Enviar" a mano.
  // Este barrido reintenta esos documentos solo, cada 3 minutos, mientras el
  // proceso este vivo.
  let reintentando = false
  const reintentarPendientes = async () => {
    if (reintentando) return
    reintentando = true
    try {
      const pendientes = await db.documentos.list({ estado: 'emitido' })
      if (!pendientes.length) return
      const { resultados } = await enviarLotePorTipo({ ids: pendientes.map(d => d.id), db, engine })
      for (const r of resultados) {
        if (r.ok) fastify.log.info({ docId: r.id, folio: r.folio, trackId: r.trackId }, 'Reintento automatico de envio SII exitoso')
        else fastify.log.warn({ docId: r.id, folio: r.folio, err: r.error }, 'Reintento automatico de envio SII fallo, se reintenta en el proximo barrido')
      }
    } catch (err) {
      fastify.log.warn({ err }, 'Barrido de reintento de envios SII fallo')
    } finally {
      reintentando = false
    }
  }
  const reintentoInterval = setInterval(reintentarPendientes, 3 * 60 * 1000)
  reintentoInterval.unref()
  fastify.addHook('onClose', (_instance, done) => { clearInterval(reintentoInterval); done() })

  // Modulo de negocio: usa el rbac normal, igual que ventas/caja/despacho. El
  // candado allowExtra:false queda reservado para el modulo 'admin', si no el
  // permiso no se puede delegar a ningun usuario.
  const readAuth = { preHandler: [fastify.authenticate, fastify.rbac('facturacion', 'read')] }
  const writeAuth = { preHandler: [fastify.authenticate, fastify.rbac('facturacion', 'write')] }
  const folioAdminAuth = { preHandler: [fastify.authenticate, fastify.rbac('admin', 'write', { allowExtra: false })] }

  // Dentro de facturacion conviven trabajos distintos: emitir el documento del
  // dia es la operacion de la encargada; administrar folios y CAF es de otra
  // persona. Con un solo permiso de modulo habia que darle ambos.
  const emitirAuth = { preHandler: [fastify.authenticate, fastify.rbac('facturacion.emitir', 'write')] }
  const foliosAuth = { preHandler: [fastify.authenticate, fastify.rbac('facturacion.folios', 'write')] }
  const anularAuth = { preHandler: [fastify.authenticate, fastify.rbac('facturacion.anular', 'delete')] }

  // --- Empresa (emisor) ---

  fastify.get('/empresa', readAuth, async () => {
    const empresa = await engine.getEmpresa()
    const { certPass, ...publica } = empresa
    return { empresa: publica, certificado: await engine.certInfo() }
  })

  fastify.put('/empresa', writeAuth, async (request, reply) => {
    try {
      const body = request.body || {}
      if (body.rut && !isValidRut(body.rut)) {
        return reply.code(400).send({ error: 'RUT de empresa inválido.' })
      }
      if (body.rutEnvia && !isValidRut(body.rutEnvia)) {
        return reply.code(400).send({ error: 'RUT del firmante inválido.' })
      }
      const current = await db.getEmpresa()
      const saved = await db.saveEmpresa({
        ...current,
        ...body,
        rut: body.rut ? formatRutDisplay(body.rut) : current.rut,
        rutEnvia: body.rutEnvia ? normalizeRut(body.rutEnvia) : current.rutEnvia,
        certPass: body.certPass ? body.certPass : current.certPass
      })
      const { certPass, ...publica } = saved
      return { empresa: publica }
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post('/empresa/certificado', writeAuth, async (request, reply) => {
    try {
      const data = await request.file()
      if (!data) return reply.code(400).send({ error: 'Adjunta el archivo .p12/.pfx del certificado.' })
      const buffer = await data.toBuffer()
      const password = data.fields?.password?.value
      const info = await engine.saveCert(buffer, password)
      return { certificado: info }
    } catch (error) { return sendError(reply, error) }
  })

  // --- CAF / folios ---

  fastify.get('/cafs', readAuth, async () => {
    const [cafs, ajustes, empresa] = await Promise.all([
      fastify.prisma.factCaf.findMany({ orderBy: [{ tipoDte: 'asc' }, { folioDesde: 'asc' }] }),
      fastify.prisma.factFolioAjuste.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      fastify.prisma.factEmpresa.findUnique({ where: { id: 1 } }),
    ])
    return {
      cafs: cafs.map((caf) => {
        const vigenteResolucion = !empresa?.fchResol
          || Boolean(caf.fechaAutorizacion && caf.fechaAutorizacion >= empresa.fchResol)
        return {
          ...caf,
          xml: undefined,
          tipoNombre: TIPOS_DTE[caf.tipoDte] || `DTE ${caf.tipoDte}`,
          disponibles: vigenteResolucion ? Math.max(0, caf.folioHasta - caf.siguienteFolio + 1) : 0,
          vigenteResolucion,
          bloqueo: vigenteResolucion ? null : `CAF anterior a la resolucion vigente (${empresa.fchResol}).`,
          ajustes: ajustes.filter(ajuste => ajuste.cafId === caf.id),
        }
      })
    }
  })

  fastify.post('/cafs/:id/ajustar-folio', folioAdminAuth, async (request, reply) => {
    const cafId = Number(request.params.id)
    const siguienteFolio = Number(request.body?.siguienteFolio)
    const motivo = String(request.body?.motivo || '').trim()
    const confirmacion = String(request.body?.confirmacion || '').trim()
    if (!Number.isInteger(cafId) || cafId <= 0) return reply.code(400).send({ error: 'CAF invalido.' })
    if (!Number.isInteger(siguienteFolio) || siguienteFolio <= 0) return reply.code(400).send({ error: 'Siguiente folio invalido.' })
    if (motivo.length < 10) return reply.code(400).send({ error: 'Indica un motivo de al menos 10 caracteres.' })
    if (confirmacion !== 'AJUSTAR FOLIO') return reply.code(400).send({ error: 'Confirmacion invalida.' })

    const result = await fastify.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`facturacion-caf:${cafId}`})::bigint)`
      const caf = await tx.factCaf.findUnique({ where: { id: cafId } })
      if (!caf) return { status: 404, error: 'CAF no encontrado.' }
      if (siguienteFolio < caf.folioDesde || siguienteFolio > caf.folioHasta + 1) {
        return { status: 409, error: `El folio debe quedar entre ${caf.folioDesde} y ${caf.folioHasta + 1}.` }
      }
      const used = await tx.factDocumento.aggregate({
        where: {
          tipoDte: caf.tipoDte,
          // Un mismo tipo DTE puede tener varios CAF con rangos distintos.
          // Un folio alto de otro CAF no debe impedir ajustar este rango.
          folio: { gte: caf.folioDesde, lte: caf.folioHasta },
          OR: [{ ambiente: caf.ambiente }, { ambiente: null }],
        },
        _max: { folio: true },
      })
      const maxUsado = Number(used._max.folio || 0)
      if (siguienteFolio <= maxUsado) {
        return { status: 409, error: `No se puede reutilizar un folio ya consumido. El ultimo folio local es ${maxUsado}; usa ${maxUsado + 1} o superior.` }
      }
      if (siguienteFolio === caf.siguienteFolio) return { status: 409, error: 'El CAF ya tiene ese siguiente folio.' }
      const ajuste = await tx.factFolioAjuste.create({
        data: {
          cafId,
          tipoDte: caf.tipoDte,
          folioAnterior: caf.siguienteFolio,
          folioNuevo: siguienteFolio,
          motivo,
          usuarioId: Number(request.user?.id) || null,
          usuarioNombre: request.user?.nombre || request.user?.email || `Usuario ${request.user?.id || ''}`.trim(),
        },
      })
      const actualizado = await tx.factCaf.update({ where: { id: cafId }, data: { siguienteFolio } })
      return { ajuste, caf: { ...actualizado, xml: undefined }, maxUsado }
    })
    if (result?.error) return reply.code(result.status || 400).send({ error: result.error })
    return result
  })

  fastify.post('/cafs/:id/reanudar-certificacion', folioAdminAuth, async (request, reply) => {
    const cafId = Number(request.params.id)
    const motivo = String(request.body?.motivo || '').trim()
    const confirmacion = String(request.body?.confirmacion || '').trim()
    if (!Number.isInteger(cafId) || cafId <= 0) return reply.code(400).send({ error: 'CAF invalido.' })
    if (motivo.length < 10) return reply.code(400).send({ error: 'Indica un motivo de al menos 10 caracteres.' })
    if (confirmacion !== 'REANUDAR CAF CERTIFICACION') return reply.code(400).send({ error: 'Confirmacion invalida.' })

    const result = await fastify.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`facturacion-caf:${cafId}`})::bigint)`
      const [caf, empresa] = await Promise.all([
        tx.factCaf.findUnique({ where: { id: cafId } }),
        tx.factEmpresa.findUnique({ where: { id: 1 } }),
      ])
      if (!caf) return { status: 404, error: 'CAF no encontrado.' }
      if (caf.ambiente !== 'certificacion' || empresa?.ambiente !== 'certificacion') {
        return { status: 409, error: 'Solo se pueden reanudar folios cuando el CAF y la empresa estan en certificacion.' }
      }
      if (empresa?.fchResol && (!caf.fechaAutorizacion || caf.fechaAutorizacion < empresa.fchResol)) {
        return { status: 409, error: `El CAF es anterior a la resolucion vigente (${empresa.fchResol}) y el SII rechaza sus DTE. Debes cargar un CAF nuevo de certificacion.` }
      }
      const [used, ajustesPrevios] = await Promise.all([
        tx.factDocumento.aggregate({
          where: {
            tipoDte: caf.tipoDte,
            folio: { gte: caf.folioDesde, lte: caf.folioHasta },
            OR: [{ ambiente: 'certificacion' }, { ambiente: null }],
          },
          _max: { folio: true },
        }),
        tx.factFolioAjuste.findMany({
          where: { cafId },
          select: { folioAnterior: true, folioNuevo: true },
        }),
      ])
      const foliosAuditados = ajustesPrevios
        .flatMap(ajuste => [ajuste.folioAnterior, ajuste.folioNuevo])
        .filter(folio => folio >= caf.folioDesde && folio <= caf.folioHasta + 1)
      const siguienteFolio = Math.max(
        caf.siguienteFolio,
        caf.folioDesde,
        Number(used._max.folio || 0) + 1,
        ...foliosAuditados,
      )
      if (siguienteFolio > caf.folioHasta) {
        return { status: 409, error: `El CAF de certificacion esta agotado hasta el folio ${caf.folioHasta}. Debes cargar un nuevo CAF del SII.` }
      }
      if (siguienteFolio === caf.siguienteFolio) {
        return { status: 409, error: `El CAF ya esta listo para continuar en el folio ${siguienteFolio}.` }
      }
      const ajuste = await tx.factFolioAjuste.create({
        data: {
          cafId,
          tipoDte: caf.tipoDte,
          folioAnterior: caf.siguienteFolio,
          folioNuevo: siguienteFolio,
          motivo: `[REANUDACION CERTIFICACION] ${motivo}`,
          usuarioId: Number(request.user?.id) || null,
          usuarioNombre: request.user?.nombre || request.user?.email || `Usuario ${request.user?.id || ''}`.trim(),
        },
      })
      const actualizado = await tx.factCaf.update({
        where: { id: cafId },
        data: { siguienteFolio },
      })
      return {
        ajuste,
        caf: { ...actualizado, xml: undefined },
        disponibles: actualizado.folioHasta - actualizado.siguienteFolio + 1,
      }
    })
    if (result?.error) return reply.code(result.status || 400).send({ error: result.error })
    return result
  })

  fastify.post('/cafs', foliosAuth, async (request, reply) => {
    try {
      const data = await request.file()
      let xml
      if (data) {
        xml = (await data.toBuffer()).toString('latin1')
      } else {
        xml = String(request.body?.xml || '')
      }
      if (!xml.trim()) return reply.code(400).send({ error: 'Adjunta el archivo CAF (XML) descargado del SII.' })
      const parsed = parseCaf(xml)
      const empresa = await engine.getEmpresa()
      if (empresa.rut && parsed.rutEmisor && normalizeRut(parsed.rutEmisor) !== normalizeRut(empresa.rut)) {
        return reply.code(400).send({ error: `El CAF pertenece a ${parsed.rutEmisor}, no a la empresa configurada (${empresa.rut}).` })
      }
      if (empresa.fchResol && (!parsed.fechaAutorizacion || parsed.fechaAutorizacion < empresa.fchResol)) {
        return reply.code(409).send({ error: `El CAF es anterior a la resolucion vigente (${empresa.fchResol}). Solicita y carga un CAF nuevo del SII.` })
      }
      const ambiente = (data?.fields?.ambiente?.value ?? request.body?.ambiente) === 'produccion' ? 'produccion' : 'certificacion'
      const record = await fastify.prisma.factCaf.create({
        data: {
          tipoDte: parsed.tipoDte,
          folioDesde: parsed.folioDesde,
          folioHasta: parsed.folioHasta,
          siguienteFolio: parsed.folioDesde,
          fechaAutorizacion: parsed.fechaAutorizacion,
          ambiente,
          xml
        }
      })
      return reply.code(201).send({ caf: { ...record, xml: undefined, tipoNombre: TIPOS_DTE[record.tipoDte] } })
    } catch (error) { return sendError(reply, error) }
  })

  fastify.delete('/cafs/:id', foliosAuth, async (request, reply) => {
    try {
      await fastify.prisma.factCaf.delete({ where: { id: Number(request.params.id) } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'CAF no encontrado.' })
      throw e
    }
  })

  // --- Documentos ---

  fastify.get('/documentos', readAuth, async (request, reply) => {
    const { estado, tipoDte, clienteId, ordenId } = request.query
    if (estado && !ESTADOS.includes(String(estado))) {
      return reply.code(400).send({ error: `Estado inválido. Válidos: ${ESTADOS.join(', ')}.` })
    }
    const documentos = await db.documentos.list({
      estado: estado ? String(estado) : undefined,
      tipoDte: tipoDte ? Number(tipoDte) : undefined,
      clienteId: clienteId ? Number(clienteId) : undefined,
      ordenId: ordenId ? Number(ordenId) : undefined
    })
    return { documentos: documentos.map((doc) => ({ ...doc, tipoNombre: TIPOS_DTE[doc.tipoDte] || `DTE ${doc.tipoDte}` })) }
  })

  fastify.get('/documentos-referenciables', readAuth, async (request, reply) => {
    const tipoNota = Number(request.query?.tipoNota)
    if (![56, 61].includes(tipoNota)) return reply.code(400).send({ error: 'Indica tipoNota 56 o 61.' })
    const search = String(request.query?.search || '').trim().toLowerCase()
    const compactSearch = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^0-9a-z]/g, '')
    const todos = await db.documentos.list()
    const candidatos = todos
      .map(documento => ({ documento, evaluacion: evaluarDocumentoParaNota({ documento, tipoNota, notas: todos }) }))
      .filter(({ evaluacion }) => evaluacion.elegible)
      .filter(({ documento }) => {
        if (!compactSearch) return true
        const tipoNombre = TIPOS_DTE[documento.tipoDte] || ''
        const receptor = documento.receptor || {}
        const terms = [
          documento.id, `DTE ${documento.id}`, documento.folio, `folio ${documento.folio}`,
          documento.ordenId, documento.ordenId ? `venta ${documento.ordenId}` : '', `T${documento.tipoDte}F${documento.folio}`,
          tipoNombre, receptor.rut, receptor.razonSocial,
        ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^0-9a-z]/g, '')
        return terms.includes(compactSearch)
      })
      .slice(0, 50)
      .map(({ documento, evaluacion }) => ({
        ...documento,
        tipoNombre: TIPOS_DTE[documento.tipoDte] || `DTE ${documento.tipoDte}`,
        ...evaluacion,
      }))
    return { documentos: candidatos, total: candidatos.length }
  })

  fastify.get('/trazabilidad/excepciones', readAuth, async (request) => {
    return listTrazabilidadExcepciones(fastify.prisma, { limit: request.query.limit })
  })

  fastify.get('/trazabilidad/orden/:ordenId', readAuth, async (request, reply) => {
    const ordenId = Number(request.params.ordenId)
    if (!Number.isInteger(ordenId) || ordenId <= 0) return reply.code(400).send({ error: 'ordenId inválido' })
    const result = await getTrazabilidadOrden(fastify.prisma, ordenId)
    if (!result) return reply.code(404).send({ error: 'Venta no encontrada' })
    return result
  })

  fastify.post('/documentos', emitirAuth, async (request, reply) => {
    try {
      const input = validateDocumentoInput(request.body)
      // Foto del usuario autenticado: nunca se acepta desde el payload.
      input.usuarioNombre = request.user?.nombre || null
      input.totales = input.tipoDte === 43 ? input.totales : (input.tipoDte >= 110 && input.tipoDte <= 112 ? computeTotalesExportacion(input.items) : computeTotales(input.items, input.tipoDte))
      await assertNotaDteInput({ doc: input, db })
      const created = await db.documentos.create(input)
      return reply.code(201).send(created)
    } catch (error) {
      if (error.statusCode) return reply.code(error.statusCode).send({ error: error.message })
      return sendError(reply, error)
    }
  })

  fastify.get('/documentos/:id', readAuth, async (request, reply) => {
    const doc = await db.documentos.get(request.params.id)
    if (!doc) return reply.code(404).send({ error: 'Documento no encontrado.' })
    return { ...doc, tipoNombre: TIPOS_DTE[doc.tipoDte] }
  })

  fastify.put('/documentos/:id', emitirAuth, async (request, reply) => {
    try {
      const current = await db.documentos.get(request.params.id)
      if (!current) return reply.code(404).send({ error: 'Documento no encontrado.' })
      if (!['borrador', 'error'].includes(current.estado)) {
        return reply.code(409).send({ error: 'Sólo se pueden editar borradores. Los documentos emitidos son inmutables (usa una nota de crédito).' })
      }
      const input = validateDocumentoInput({ ...current, ...request.body })
      input.totales = input.tipoDte === 43 ? input.totales : (input.tipoDte >= 110 && input.tipoDte <= 112 ? computeTotalesExportacion(input.items) : computeTotales(input.items, input.tipoDte))
      input.estado = 'borrador'
      input.estadoDetalle = null
      return db.documentos.update(request.params.id, input)
    } catch (error) {
      if (error.statusCode) return reply.code(error.statusCode).send({ error: error.message })
      return sendError(reply, error)
    }
  })

  fastify.delete('/documentos/:id', anularAuth, async (request, reply) => {
    const doc = await db.documentos.get(request.params.id)
    if (!doc) return reply.code(404).send({ error: 'Documento no encontrado.' })
    if (!['borrador', 'error'].includes(doc.estado)) {
      return reply.code(409).send({ error: 'No se puede borrar un documento emitido.' })
    }
    await fastify.prisma.factDocumento.delete({ where: { id: Number(request.params.id) } })
    return reply.code(204).send()
  })

  fastify.post('/documentos/:id/emitir', emitirAuth, async (request, reply) => {
    try {
      const emitido = await engine.emitir(request.params.id)
      // Envio automatico al SII apenas se emite: el usuario ya no tiene que
      // acordarse de apretar "Enviar al SII" aparte. Si el envio falla (SII
      // caido, rechazo de schema, etc.) NO se revierte la emision — el folio
      // ya se consumio y es irrecuperable — el documento simplemente queda
      // en 'emitido' y sigue disponible para reintentar por el boton manual
      // o el proximo intento automatico (ver POST /enviar-lote).
      try {
        const enviado = await engine.enviar([emitido.id])
        return enviado.documentos[0]
      } catch (envioError) {
        fastify.log.warn({ err: envioError, docId: emitido.id }, 'Auto-envio al SII fallo tras emitir; el documento queda emitido para reintentar')
        return emitido
      }
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post('/documentos/:id/enviar', emitirAuth, async (request, reply) => {
    try {
      const { trackId, documentos } = await engine.enviar([request.params.id])
      return { trackId, documentos }
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post('/enviar-lote', emitirAuth, async (request, reply) => {
    try {
      const ids = Array.isArray(request.body?.ids) ? request.body.ids : []
      if (!ids.length) return reply.code(400).send({ error: 'Indica los ids de documentos a enviar.' })
      return await enviarLotePorTipo({ ids, db, engine })
    } catch (error) { return sendError(reply, error) }
  })

  fastify.get('/documentos/:id/estado', readAuth, async (request, reply) => {
    try {
      return await engine.consultarEstado(request.params.id)
    } catch (error) { return sendError(reply, error) }
  })

  fastify.get('/documentos/:id/xml', readAuth, async (request, reply) => {
    try {
      const { filename, buffer } = await engine.descargarXml(request.params.id)
      reply.header('Content-Type', 'application/xml; charset=ISO-8859-1')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(buffer)
    } catch (error) { return sendError(reply, error) }
  })

  fastify.get('/documentos/:id/html', readAuth, async (request, reply) => {
    try {
      const doc = await db.documentos.get(request.params.id)
      if (!doc) return reply.code(404).send({ error: 'Documento no encontrado.' })
      if (!doc.xml) return reply.code(409).send({ error: 'El documento no está emitido: no tiene timbre aún.' })
      const tedMatch = doc.xml.match(/<TED version="1.0">[\s\S]*?<\/TED>/)
      if (!tedMatch) return reply.code(500).send({ error: 'No se encontró el TED en el XML.' })
      const empresa = await engine.getEmpresa()
      const html = await renderDteHtml({ empresa, receptor: doc.receptor, doc, totales: doc.totales, tedXml: tedMatch[0] })
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(html)
    } catch (error) { return sendError(reply, error) }
  })

  fastify.get('/documentos/:id/pdf', readAuth, async (request, reply) => {
    try {
      const doc = await db.documentos.get(request.params.id)
      if (!doc) return reply.code(404).send({ error: 'Documento no encontrado.' })
      if (!doc.xml) return reply.code(409).send({ error: 'El documento no está emitido: no tiene timbre aún.' })
      const tedMatch = doc.xml.match(/<TED version="1.0">[\s\S]*?<\/TED>/)
      if (!tedMatch) return reply.code(500).send({ error: 'No se encontró el TED en el XML.' })
      const empresa = await engine.getEmpresa()
      const pdf = await renderDtePdf({ empresa, receptor: doc.receptor, doc, totales: doc.totales, tedXml: tedMatch[0] })
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="DTE_T${doc.tipoDte}_F${doc.folio}.pdf"`)
      return reply.send(pdf)
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post('/documentos/:id/reenviar', writeAuth, async (request, reply) => {
    try {
      const doc = await db.documentos.get(request.params.id)
      if (!doc) return reply.code(404).send({ error: 'Documento no encontrado.' })
      if (!doc.xml) return reply.code(409).send({ error: 'El documento no está emitido: no tiene timbre aún.' })
      const to = request.body?.to ? String(request.body.to).trim() : doc.receptor?.email
      if (!to) return reply.code(422).send({ error: 'El documento no tiene un correo de destinatario. Indica uno en "to".' })
      const tedMatch = doc.xml.match(/<TED version="1.0">[\s\S]*?<\/TED>/)
      if (!tedMatch) return reply.code(500).send({ error: 'No se encontró el TED en el XML.' })
      const empresa = await engine.getEmpresa()
      const tipoNombre = TIPOS_DTE[doc.tipoDte] || `DTE ${doc.tipoDte}`
      const [pdf, xml] = await Promise.all([
        renderDtePdf({ empresa, receptor: doc.receptor, doc, totales: doc.totales, tedXml: tedMatch[0] }),
        engine.descargarXml(request.params.id),
      ])
      const baseName = `DTE_T${doc.tipoDte}_F${doc.folio}`
      const result = await sendDteEmail({
        to,
        subject: `${tipoNombre} N° ${doc.folio} — ${empresa?.razonSocial || 'Plastimar'}`,
        html: buildReenvioHtml({ empresa, doc, tipoNombre }),
        attachments: [
          { filename: `${baseName}.pdf`, content: pdf, contentType: 'application/pdf' },
          { filename: `${baseName}.xml`, content: xml.buffer, contentType: 'application/xml' },
        ],
      })
      if (!result.sent) return reply.code(503).send({ error: `No se pudo reenviar: ${result.reason}.` })
      return { sent: true, to: result.recipients }
    } catch (error) { return sendError(reply, error) }
  })

  // --- Documentos recibidos por Gmail (sólo archivo/visualización) ---

  const dteRecibidoReadAuth = {
    preHandler: [
      fastify.authenticate,
      (request, reply, done) => {
        const allowed = can(request.user?.role, 'facturacion', 'read', request.user?.permisosExtra)
          || can(request.user?.role, 'caja.pagos_proveedores', 'read', request.user?.permisosExtra)
          || can(request.user?.role, 'proveedores', 'read', request.user?.permisosExtra)
        if (!allowed) {
          reply.code(403).send({ error: 'No tienes permiso para ver DTEs recibidos' })
          return
        }
        done()
      },
    ],
  }

  fastify.get('/recibidos', dteRecibidoReadAuth, async () => {
    const documentos = await fastify.prisma.factDocumentoRecibido.findMany({ orderBy: [{ recibidoEn: 'desc' }, { createdAt: 'desc' }] })
    return { documentos }
  })

  fastify.get('/recibidos/:id', dteRecibidoReadAuth, async (request, reply) => {
    const documento = await fastify.prisma.factDocumentoRecibido.findUnique({ where: { id: Number(request.params.id) } })
    if (!documento) return reply.code(404).send({ error: 'Documento recibido no encontrado.' })
    if (documento.estado === 'pendiente') await fastify.prisma.factDocumentoRecibido.update({ where: { id: documento.id }, data: { estado: 'visto', vistoEn: new Date() } })
    return documento
  })

  fastify.get('/recibidos/:id/xml', dteRecibidoReadAuth, async (request, reply) => {
    const documento = await fastify.prisma.factDocumentoRecibido.findUnique({ where: { id: Number(request.params.id) } })
    if (!documento) return reply.code(404).send({ error: 'Documento recibido no encontrado.' })
    reply.header('Content-Type', 'application/xml; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${documento.archivoNombre || `DTE-recibido-${documento.id}.xml`}"`)
    return reply.send(documento.xml)
  })

  fastify.get('/recibidos/:id/html', dteRecibidoReadAuth, async (request, reply) => {
    try {
      const documento = await fastify.prisma.factDocumentoRecibido.findUnique({ where: { id: Number(request.params.id) } })
      if (!documento) return reply.code(404).send({ error: 'Documento recibido no encontrado.' })
      const html = await renderDteRecibidoHtml(documento)
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(html)
    } catch (error) { return sendError(reply, error) }
  })

  fastify.get('/recibidos/:id/pdf', dteRecibidoReadAuth, async (request, reply) => {
    try {
      const documento = await fastify.prisma.factDocumentoRecibido.findUnique({ where: { id: Number(request.params.id) } })
      if (!documento) return reply.code(404).send({ error: 'Documento recibido no encontrado.' })
      const pdf = await renderDteRecibidoPdf(documento)
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="${(documento.archivoNombre || `DTE-recibido-${documento.id}`).replace(/\.xml$/i, '')}.pdf"`)
      return reply.send(pdf)
    } catch (error) { return sendError(reply, error) }
  })

  // No hay cron: la sincronización se ejecuta explícitamente y Gmail tiene
  // scope readonly. Los duplicados se descartan por mensaje+adjunto.
  fastify.post('/recibidos/sincronizar', writeAuth, async (request, reply) => {
    try {
      return await syncGmailReceptor({ prisma: fastify.prisma, maxResults: request.body?.maxResults })
    } catch (error) { return sendError(reply, error) }
  })
}
