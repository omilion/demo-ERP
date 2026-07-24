import path from 'node:path'
import { createFacturacionDb } from '../../facturacion/db.js'
import { createFacturacionEngine } from '../../facturacion/engine.js'
import { TIPOS_DTE, computeTotales, computeTotalesExportacion, IND_TRASLADO, TIPO_DESPACHO } from '../../facturacion/documento.js'
import { normalizeRut, isValidRut } from '../../facturacion/xmlUtil.js'
import { parseCaf } from '../../facturacion/caf.js'
import { renderDteHtml, renderDteRecibidoHtml } from '../../facturacion/printDte.js'
import { syncGmailReceptor } from '../../facturacion/receptorDte.js'

const ESTADOS = ['borrador', 'emitido', 'enviado', 'aceptado', 'rechazado', 'error']

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
    comisiones: Array.isArray(body.comisiones) ? body.comisiones : [],
    referencias: Array.isArray(body.referencias) ? body.referencias : [],
    extra: tipoDte === 52
      ? { ...extra, indTraslado: Number(extra.indTraslado), tipoDespacho: Number(extra.tipoDespacho) }
      : extra,
    totales: tipoDte === 43 && body.totales && typeof body.totales === 'object' ? body.totales : {}
  }
}

export default async function facturacionRoutes(fastify) {
  const db = createFacturacionDb(fastify.prisma)
  const engine = createFacturacionEngine({ db, dataDir: path.join(process.cwd(), 'data', 'facturacion') })

  // Modulo de negocio: usa el rbac normal, igual que ventas/caja/despacho. El
  // candado allowExtra:false queda reservado para el modulo 'admin', si no el
  // permiso no se puede delegar a ningun usuario.
  const readAuth = { preHandler: [fastify.authenticate, fastify.rbac('facturacion', 'read')] }
  const writeAuth = { preHandler: [fastify.authenticate, fastify.rbac('facturacion', 'write')] }

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
        rut: body.rut ? normalizeRut(body.rut) : current.rut,
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
    const cafs = await fastify.prisma.factCaf.findMany({ orderBy: [{ tipoDte: 'asc' }, { folioDesde: 'asc' }] })
    return {
      cafs: cafs.map((caf) => ({
        ...caf,
        xml: undefined,
        tipoNombre: TIPOS_DTE[caf.tipoDte] || `DTE ${caf.tipoDte}`,
        disponibles: Math.max(0, caf.folioHasta - caf.siguienteFolio + 1)
      }))
    }
  })

  fastify.post('/cafs', writeAuth, async (request, reply) => {
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

  fastify.delete('/cafs/:id', writeAuth, async (request, reply) => {
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

  fastify.post('/documentos', writeAuth, async (request, reply) => {
    try {
      const input = validateDocumentoInput(request.body)
      input.totales = input.tipoDte === 43 ? input.totales : (input.tipoDte >= 110 && input.tipoDte <= 112 ? computeTotalesExportacion(input.items) : computeTotales(input.items, input.tipoDte))
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

  fastify.put('/documentos/:id', writeAuth, async (request, reply) => {
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

  fastify.delete('/documentos/:id', writeAuth, async (request, reply) => {
    const doc = await db.documentos.get(request.params.id)
    if (!doc) return reply.code(404).send({ error: 'Documento no encontrado.' })
    if (!['borrador', 'error'].includes(doc.estado)) {
      return reply.code(409).send({ error: 'No se puede borrar un documento emitido.' })
    }
    await fastify.prisma.factDocumento.delete({ where: { id: Number(request.params.id) } })
    return reply.code(204).send()
  })

  fastify.post('/documentos/:id/emitir', writeAuth, async (request, reply) => {
    try {
      return await engine.emitir(request.params.id)
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post('/documentos/:id/enviar', writeAuth, async (request, reply) => {
    try {
      const { trackId, documentos } = await engine.enviar([request.params.id])
      return { trackId, documentos }
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post('/enviar-lote', writeAuth, async (request, reply) => {
    try {
      const ids = Array.isArray(request.body?.ids) ? request.body.ids : []
      if (!ids.length) return reply.code(400).send({ error: 'Indica los ids de documentos a enviar.' })
      const { trackId, documentos } = await engine.enviar(ids)
      return { trackId, documentos }
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

  // --- Documentos recibidos por Gmail (sólo archivo/visualización) ---

  fastify.get('/recibidos', readAuth, async () => {
    const documentos = await fastify.prisma.factDocumentoRecibido.findMany({ orderBy: [{ recibidoEn: 'desc' }, { createdAt: 'desc' }] })
    return { documentos }
  })

  fastify.get('/recibidos/:id', readAuth, async (request, reply) => {
    const documento = await fastify.prisma.factDocumentoRecibido.findUnique({ where: { id: Number(request.params.id) } })
    if (!documento) return reply.code(404).send({ error: 'Documento recibido no encontrado.' })
    if (documento.estado === 'pendiente') await fastify.prisma.factDocumentoRecibido.update({ where: { id: documento.id }, data: { estado: 'visto', vistoEn: new Date() } })
    return documento
  })

  fastify.get('/recibidos/:id/xml', readAuth, async (request, reply) => {
    const documento = await fastify.prisma.factDocumentoRecibido.findUnique({ where: { id: Number(request.params.id) } })
    if (!documento) return reply.code(404).send({ error: 'Documento recibido no encontrado.' })
    reply.header('Content-Type', 'application/xml; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${documento.archivoNombre || `DTE-recibido-${documento.id}.xml`}"`)
    return reply.send(documento.xml)
  })

  fastify.get('/recibidos/:id/html', readAuth, async (request, reply) => {
    try {
      const documento = await fastify.prisma.factDocumentoRecibido.findUnique({ where: { id: Number(request.params.id) } })
      if (!documento) return reply.code(404).send({ error: 'Documento recibido no encontrado.' })
      const html = await renderDteRecibidoHtml(documento)
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(html)
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
