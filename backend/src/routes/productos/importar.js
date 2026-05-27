// Importador masivo de productos. El cliente parsea CSV/Excel y envia JSON.

const MAX_IMPORT_ROWS = 1000
const VALID_BODEGAS = ['Inventario', 'Taller']

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function keyOf(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function read(row, keys) {
  const wanted = new Set(keys.map(keyOf))
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(keyOf(key))) return value
  }
  return undefined
}

function readCodigo(row) {
  return String(read(row, ['codigoInterno', 'codigo interno', 'cod interno', 'codigo', 'cod']) ?? '').trim()
}

function parseNumber(value, field, rowIndex, errors, options = {}) {
  if (!hasValue(value)) return undefined
  const raw = String(value).trim()
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.')
  const n = Number(normalized)
  if (!Number.isFinite(n)) {
    errors.push({ fila: rowIndex, error: `${field} invalido` })
    return undefined
  }
  if (options.min != null && n < options.min) errors.push({ fila: rowIndex, error: `${field} no puede ser menor que ${options.min}` })
  if (options.max != null && n > options.max) errors.push({ fila: rowIndex, error: `${field} no puede ser mayor que ${options.max}` })
  return n
}

function parseIntNumber(value, field, rowIndex, errors, options = {}) {
  const n = parseNumber(value, field, rowIndex, errors, options)
  return n === undefined ? undefined : Math.trunc(n)
}

function parseBool(value, field, rowIndex, errors) {
  if (!hasValue(value)) return undefined
  const raw = String(value).trim().toLowerCase()
  if (['1', 'true', 'si', 's', 'yes', 'y'].includes(raw)) return true
  if (['0', 'false', 'no', 'n'].includes(raw)) return false
  errors.push({ fila: rowIndex, error: `${field} debe ser si/no, true/false o 1/0` })
  return undefined
}

function precioHistorialData(productoId, precioAnterior, precioNuevo, usuarioNombre) {
  const pct = precioAnterior === 0 && precioNuevo === 0
    ? 0
    : Number((precioAnterior === 0 ? 100 : ((precioNuevo - precioAnterior) / precioAnterior) * 100).toFixed(1))
  return { productoId, precioAnterior, precioNuevo, pct, usuarioNombre }
}

function readRows(request) {
  const rows = Array.isArray(request.body?.rows) ? request.body.rows : null
  if (!rows) return { error: 'rows requerido' }
  if (rows.length > MAX_IMPORT_ROWS) return { error: `maximo ${MAX_IMPORT_ROWS} filas por importacion` }
  return { rows }
}

function validateUniqueCodes(rows, errors) {
  const seen = new Set()
  for (let i = 0; i < rows.length; i++) {
    const codigo = readCodigo(rows[i])
    if (!codigo) {
      errors.push({ fila: i + 2, error: 'sin codigo' })
      continue
    }
    const key = codigo.toLowerCase()
    if (seen.has(key)) errors.push({ fila: i + 2, codigo, error: 'codigo duplicado en archivo' })
    seen.add(key)
  }
}

function buildPrecioRow(row, rowIndex, errors) {
  const data = {}
  const precioLista = parseNumber(read(row, ['precioLista', 'precio costo', 'precioCosto', 'precio1']), 'precioLista', rowIndex, errors, { min: 0 })
  const precioMarco = parseNumber(read(row, ['precioMarco', 'precio marco', 'precio licitacion', 'precio convenio marco neto']), 'precioMarco', rowIndex, errors, { min: 0 })
  const precioWeb = parseNumber(read(row, ['precioWeb', 'precio web']), 'precioWeb', rowIndex, errors, { min: 0 })
  const precioOferta = parseNumber(read(row, ['precioOferta', 'precio oferta']), 'precioOferta', rowIndex, errors, { min: 0 })
  const porcDesc = parseNumber(read(row, ['porcDesc', 'descuento', 'porc descuento']), 'porcDesc', rowIndex, errors, { min: 0, max: 100 })
  if (precioLista !== undefined) data.precioLista = precioLista
  if (precioMarco !== undefined) data.precioMarco = precioMarco
  if (precioWeb !== undefined) data.precioWeb = precioWeb
  else if (precioOferta !== undefined) data.precioWeb = precioOferta
  if (porcDesc !== undefined) data.porcDesc = porcDesc
  if (!Object.keys(data).length) errors.push({ fila: rowIndex, error: 'sin precios validos' })
  return data
}

function buildStockRow(row, rowIndex, errors) {
  const data = {}
  const stock = parseIntNumber(read(row, ['stock']), 'stock', rowIndex, errors, { min: 0 })
  const stockCritico = parseIntNumber(read(row, ['stockCritico', 'stock critico', 'stock minimo', 'minimo']), 'stockCritico', rowIndex, errors, { min: 0 })
  if (stock !== undefined) data.stock = stock
  if (stockCritico !== undefined) data.stockCritico = stockCritico
  if (!Object.keys(data).length) errors.push({ fila: rowIndex, error: 'sin stock valido' })
  return data
}

function buildWebRow(row, rowIndex, errors) {
  const visibleWeb = parseBool(read(row, ['visibleWeb', 'mostrarWeb', 'mostrar web', 'mostrar_en_web', 'web']), 'visibleWeb', rowIndex, errors)
  if (visibleWeb === undefined) errors.push({ fila: rowIndex, error: 'sin visibleWeb valido' })
  return { visibleWeb }
}

function buildNuevoRow(row, rowIndex, errors) {
  const codigo = readCodigo(row)
  const nombre = String(read(row, ['nombre', 'producto', 'nombre producto']) || '').trim()
  const bodega = String(read(row, ['bodega']) || 'Inventario').trim() || 'Inventario'
  if (!codigo || !nombre) errors.push({ fila: rowIndex, codigo, error: 'codigo y nombre requeridos' })
  if (!VALID_BODEGAS.includes(bodega)) errors.push({ fila: rowIndex, codigo, error: 'bodega debe ser Inventario o Taller' })
  return {
    codigoInterno: codigo,
    nombre,
    unidadMedida: read(row, ['unidadMedida', 'unidad medida', 'unidad']) || null,
    categoria: read(row, ['categoria', 'categoria nombre']) || null,
    proveedor: read(row, ['proveedor']) || null,
    precioLista: parseNumber(read(row, ['precioLista', 'precio costo', 'precioCosto', 'precio1']), 'precioLista', rowIndex, errors, { min: 0 }) ?? 0,
    precioMarco: parseNumber(read(row, ['precioMarco', 'precio marco', 'precio licitacion']), 'precioMarco', rowIndex, errors, { min: 0 }) ?? 0,
    precioWeb: parseNumber(read(row, ['precioWeb', 'precio web']), 'precioWeb', rowIndex, errors, { min: 0 }) ?? null,
    porcDesc: parseNumber(read(row, ['porcDesc', 'descuento']), 'porcDesc', rowIndex, errors, { min: 0, max: 100 }) ?? 0,
    stock: parseIntNumber(read(row, ['stock']), 'stock', rowIndex, errors, { min: 0 }) ?? 0,
    stockCritico: parseIntNumber(read(row, ['stockCritico', 'stock critico', 'stock minimo', 'minimo']), 'stockCritico', rowIndex, errors, { min: 0 }) ?? 0,
    bodega,
    codigoBarra: read(row, ['codigoBarra', 'codigo barra', 'cod barra']) || null,
    descripcion: read(row, ['descripcion', 'detalle']) || null,
    idMarco: read(row, ['idMarco', 'id marco']) || null,
    visibleWeb: parseBool(read(row, ['visibleWeb', 'mostrarWeb', 'mostrar web', 'web']), 'visibleWeb', rowIndex, errors) ?? false,
    activo: true,
  }
}

async function findProductos(prisma, codes) {
  const productos = await prisma.producto.findMany({
    where: { codigoInterno: { in: codes } },
  })
  return new Map(productos.map(p => [p.codigoInterno.toLowerCase(), p]))
}

async function resolveCategoriasNuevo(prisma, rows, errors) {
  const names = [...new Set(rows.map(r => r.categoria).filter(Boolean).map(v => String(v).trim()))]
  if (!names.length) return
  const categorias = await prisma.categoria.findMany({
    where: { activo: true },
    select: { id: true, nombre: true },
  })
  const byName = new Map(categorias.map(c => [keyOf(c.nombre), c]))
  for (const row of rows) {
    if (!row.categoria) continue
    const categoria = byName.get(keyOf(row.categoria))
    if (!categoria) {
      errors.push({ codigo: row.codigoInterno, error: `categoria no existe o inactiva: ${row.categoria}` })
      continue
    }
    row.categoriaId = categoria.id
    row.categoria = categoria.nombre
  }
}

function preflightResponse(tipo, rows, errores, countName, countValue) {
  return {
    tipo,
    total: rows.length,
    aplicable: errores.length === 0,
    [countName]: countValue,
    errores,
    preview: rows.slice(0, 10),
  }
}

export default async function importarRoute(fastify) {
  fastify.post('/importar/precios', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const input = readRows(request)
    if (input.error) return reply.code(400).send({ error: input.error })
    const { rows } = input
    const errors = []
    validateUniqueCodes(rows, errors)
    const parsedRows = rows.map((row, index) => ({ codigo: readCodigo(row), data: buildPrecioRow(row, index + 2, errors) }))
    const productosByCode = await findProductos(fastify.prisma, parsedRows.map(r => r.codigo).filter(Boolean))
    for (const row of parsedRows) {
      if (row.codigo && !productosByCode.has(row.codigo.toLowerCase())) errors.push({ codigo: row.codigo, error: 'no encontrado' })
    }

    if (request.body?.dryRun) return preflightResponse('precios', rows, errors, 'actualizables', errors.length ? 0 : parsedRows.length)
    if (!request.body?.confirm) return reply.code(400).send({ error: 'confirmacion requerida', errores: errors })
    if (errors.length) return reply.code(400).send({ error: 'archivo con errores', errores: errors })

    const usuarioNombre = request.user?.email || request.user?.name || request.user?.role || 'sistema'
    await fastify.prisma.$transaction(async (tx) => {
      for (const row of parsedRows) {
        const product = productosByCode.get(row.codigo.toLowerCase())
        await tx.producto.update({ where: { id: product.id }, data: row.data })
        if (row.data.precioLista !== undefined && Number(row.data.precioLista) !== Number(product.precioLista)) {
          await tx.precioHistorial.create({
            data: precioHistorialData(product.id, Number(product.precioLista), Number(row.data.precioLista), usuarioNombre),
          })
        }
      }
    })
    return { actualizados: parsedRows.length, total: rows.length, errores: [] }
  })

  fastify.post('/importar/stock', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const input = readRows(request)
    if (input.error) return reply.code(400).send({ error: input.error })
    const { rows } = input
    const errors = []
    validateUniqueCodes(rows, errors)
    const parsedRows = rows.map((row, index) => ({ codigo: readCodigo(row), data: buildStockRow(row, index + 2, errors) }))
    const productosByCode = await findProductos(fastify.prisma, parsedRows.map(r => r.codigo).filter(Boolean))
    for (const row of parsedRows) {
      if (row.codigo && !productosByCode.has(row.codigo.toLowerCase())) errors.push({ codigo: row.codigo, error: 'no encontrado' })
    }

    if (request.body?.dryRun) return preflightResponse('stock', rows, errors, 'actualizables', errors.length ? 0 : parsedRows.length)
    if (!request.body?.confirm) return reply.code(400).send({ error: 'confirmacion requerida', errores: errors })
    if (!String(request.body?.motivo || '').trim()) return reply.code(400).send({ error: 'motivo requerido para importacion de stock' })
    if (errors.length) return reply.code(400).send({ error: 'archivo con errores', errores: errors })

    const userId = request.user?.id || 1
    const motivo = String(request.body.motivo).trim()
    await fastify.prisma.$transaction(async (tx) => {
      for (const row of parsedRows) {
        const product = productosByCode.get(row.codigo.toLowerCase())
        const data = { ...row.data }
        const stockChanged = data.stock !== undefined && Number(data.stock) !== Number(product.stock)
        const delta = stockChanged ? Number(data.stock) - Number(product.stock) : 0
        await tx.producto.update({ where: { id: product.id }, data })
        if (stockChanged) {
          await tx.movimientoBodega.create({
            data: {
              productoId: product.id,
              tipo: 'ajuste',
              cantidad: delta,
              motivo,
              userId,
              origenTipo: 'importacion_stock',
            },
          })
        }
      }
    })
    return { actualizados: parsedRows.length, total: rows.length, errores: [] }
  })

  fastify.post('/importar/web', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const input = readRows(request)
    if (input.error) return reply.code(400).send({ error: input.error })
    const { rows } = input
    const errors = []
    validateUniqueCodes(rows, errors)
    const parsedRows = rows.map((row, index) => ({ codigo: readCodigo(row), data: buildWebRow(row, index + 2, errors) }))
    const productosByCode = await findProductos(fastify.prisma, parsedRows.map(r => r.codigo).filter(Boolean))
    for (const row of parsedRows) {
      if (row.codigo && !productosByCode.has(row.codigo.toLowerCase())) errors.push({ codigo: row.codigo, error: 'no encontrado' })
    }

    if (request.body?.dryRun) return preflightResponse('web', rows, errors, 'actualizables', errors.length ? 0 : parsedRows.length)
    if (!request.body?.confirm) return reply.code(400).send({ error: 'confirmacion requerida', errores: errors })
    if (errors.length) return reply.code(400).send({ error: 'archivo con errores', errores: errors })

    await fastify.prisma.$transaction(parsedRows.map(row => {
      const product = productosByCode.get(row.codigo.toLowerCase())
      return fastify.prisma.producto.update({ where: { id: product.id }, data: row.data })
    }))
    return { actualizados: parsedRows.length, total: rows.length, errores: [] }
  })

  fastify.post('/importar/nuevo', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const input = readRows(request)
    if (input.error) return reply.code(400).send({ error: input.error })
    const { rows } = input
    const errors = []
    validateUniqueCodes(rows, errors)
    const parsedRows = rows.map((row, index) => buildNuevoRow(row, index + 2, errors))
    await resolveCategoriasNuevo(fastify.prisma, parsedRows, errors)
    const existingByCode = await findProductos(fastify.prisma, parsedRows.map(r => r.codigoInterno).filter(Boolean))
    const createRows = parsedRows.filter(row => row.codigoInterno && !existingByCode.has(row.codigoInterno.toLowerCase()))
    const ignorados = parsedRows.length - createRows.length

    if (request.body?.dryRun) return preflightResponse('nuevo', rows, errors, 'creables', errors.length ? 0 : createRows.length)
    if (!request.body?.confirm) return reply.code(400).send({ error: 'confirmacion requerida', errores: errors })
    if (errors.length) return reply.code(400).send({ error: 'archivo con errores', errores: errors })

    await fastify.prisma.$transaction(createRows.map(row => fastify.prisma.producto.create({ data: row })))
    return { creados: createRows.length, ignorados, total: rows.length, errores: [] }
  })
}
