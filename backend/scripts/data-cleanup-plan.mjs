import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TASKS = new Set(['all', 'product-orphans', 'rut-duplicates', 'product-codes', 'stock-dates', 'orders-prices'])
const PRODUCT_CONFIRM = 'UPDATE_EXACT_PRODUCT_ORPHANS'

export function normalizeCode(value) {
  if (value == null) return ''
  return String(value).trim().replace(/\s+/g, ' ').toUpperCase()
}

export function normalizeRut(value) {
  if (value == null) return ''
  return String(value).trim().toUpperCase().replace(/[^0-9K]/g, '')
}

export function isPlaceholderRut(normalizedRutValue) {
  const value = normalizeRut(normalizedRutValue)
  if (!value) return true
  if (/^0+$/.test(value)) return true
  if (value === '000000000' || value === '111111111' || value === '123456789') return true
  return false
}

export function classifyRutGroup(group) {
  const normalized = normalizeRut(group.normalized_value)
  if (isPlaceholderRut(normalized)) return 'manual_placeholder_group'
  return Number(group.rows || group.count || 0) > 1 ? 'manual_duplicate_real_rut' : 'ok'
}

export function classifyProductOrphan(row) {
  const matchCount = Number(row.match_count || 0)
  const matchedId = Number(row.matched_producto_id || 0)
  const code = normalizeCode(row.codigo_interno)
  if (!code) return 'manual_missing_code'
  if (matchCount === 1 && matchedId > 0) return 'auto_fix_exact_code_match'
  if (matchCount > 1) return 'manual_ambiguous_code_match'
  return 'manual_no_catalog_match'
}

export function classifyProductCodeGroup(row) {
  const code = normalizeCode(row.normalized_code ?? row.codigo_interno)
  const rows = Number(row.rows || row.count || 0)
  const activeRows = Number(row.active_rows || 0)
  if (!code) return 'manual_missing_product_code'
  if (rows > 1 && activeRows > 1) return 'manual_duplicate_active_product_code'
  if (rows > 1) return 'manual_duplicate_legacy_product_code'
  return 'ok'
}

export function classifyStock(row) {
  const stock = Number(row.stock)
  if (!Number.isFinite(stock) || stock >= 0) return 'ok'
  return 'manual_inventory_adjustment_required'
}

export function classifyOrderClientIssue(row) {
  const orderRut = normalizeRut(row.orden_rut_norm ?? row.rut_cliente)
  const currentRut = normalizeRut(row.cliente_rut_norm ?? row.cliente_rut)
  const targetMatches = Number(row.target_matches || 0)
  const targetClienteId = Number(row.target_cliente_id || 0)
  const clienteId = Number(row.cliente_id || 0)

  if (!orderRut) return 'manual_missing_order_rut'
  if (orderRut === currentRut) return 'ok'
  if (targetMatches === 1 && targetClienteId > 0 && targetClienteId !== clienteId) {
    return 'candidate_reassign_order_cliente_by_unique_rut'
  }
  if (targetMatches > 1) return 'manual_ambiguous_order_cliente_rut'
  return 'manual_no_order_cliente_rut_target'
}

export function classifyNegativePrice(row) {
  const price = Number(row.precio_unitario ?? row.price)
  if (!Number.isFinite(price) || price >= 0) return 'ok'
  return 'manual_negative_price_review'
}

export function classifyDateAnomaly(row) {
  const raw = row.value instanceof Date ? row.value.toISOString() : String(row.value || '')
  if (/^0001-/.test(raw) || /^1970-01-01/.test(raw)) {
    return row.nullable === true ? 'candidate_null_sentinel_date' : 'manual_non_nullable_sentinel_date'
  }
  return 'manual_anomalous_date_review'
}

function q(sql) {
  return sql.replace(/\s+/g, ' ').trim()
}

function readLocalEnv() {
  try {
    const env = readFileSync(resolve(__dirname, '../.env'), 'utf8')
    for (const line of env.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m && process.env[m[1].trim()] === undefined) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    }
  } catch {}
}

function toPlain(value) {
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toPlain)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item)]))
  }
  return value
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    task: 'all',
    limit: 200,
    json: false,
    apply: false,
    confirm: '',
    out: '',
  }

  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg === '--apply') options.apply = true
    else if (arg.startsWith('--task=')) options.task = arg.slice('--task='.length)
    else if (arg.startsWith('--limit=')) {
      const raw = Number(arg.slice('--limit='.length))
      if (Number.isInteger(raw) && raw > 0) options.limit = Math.min(raw, 5000)
    } else if (arg.startsWith('--confirm=')) {
      options.confirm = arg.slice('--confirm='.length)
    } else if (arg.startsWith('--out=')) {
      options.out = arg.slice('--out='.length)
    }
  }

  if (!TASKS.has(options.task)) throw new Error(`Unsupported task: ${options.task}`)
  return options
}

const productCodesCte = `
  WITH product_codes AS (
    SELECT
      upper(trim(codigo_interno)) AS normalized_code,
      count(*)::int AS match_count,
      min(id)::int AS matched_producto_id,
      min(codigo_interno) AS matched_codigo_interno,
      min(nombre) AS matched_nombre
    FROM catalogo.productos
    WHERE codigo_interno IS NOT NULL AND trim(codigo_interno) <> ''
    GROUP BY upper(trim(codigo_interno))
  )
`

async function getProductOrphans(prisma, limit) {
  const sql = q(`
    ${productCodesCte}
    SELECT *
    FROM (
      SELECT
        'ventas.orden_items' AS source_table,
        oi.id,
        oi.orden_id AS parent_id,
        oi.producto_id AS old_producto_id,
        oi.codigo_interno,
        oi.nombre,
        oi.descripcion,
        oi.cantidad,
        pc.match_count,
        pc.matched_producto_id,
        pc.matched_codigo_interno,
        pc.matched_nombre
      FROM ventas.orden_items oi
      LEFT JOIN product_codes pc ON pc.normalized_code = upper(trim(oi.codigo_interno))
      WHERE oi.producto_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = oi.producto_id)
      UNION ALL
      SELECT
        'taller.odt_items' AS source_table,
        oi.id,
        oi.odt_id AS parent_id,
        oi.producto_id AS old_producto_id,
        oi.codigo_interno,
        oi.nombre,
        NULL::text AS descripcion,
        oi.cantidad,
        pc.match_count,
        pc.matched_producto_id,
        pc.matched_codigo_interno,
        pc.matched_nombre
      FROM taller.odt_items oi
      LEFT JOIN product_codes pc ON pc.normalized_code = upper(trim(oi.codigo_interno))
      WHERE oi.producto_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = oi.producto_id)
    ) orphaned
    ORDER BY source_table, id
    LIMIT ${Number(limit)}
  `)
  const rows = (await prisma.$queryRawUnsafe(sql)).map(toPlain)
  return rows.map(row => ({ ...row, action: classifyProductOrphan(row) }))
}

async function getRutDuplicates(prisma, limit) {
  const sql = q(`
    WITH normalized AS (
      SELECT 'clientes.clientes' AS source_table, id, rut, nombre, razon_social,
             regexp_replace(upper(trim(rut)), '[^0-9K]', '', 'g') AS normalized_value
      FROM clientes.clientes
      UNION ALL
      SELECT 'catalogo.proveedores' AS source_table, id, rut, nombre, razon_social,
             regexp_replace(upper(trim(rut)), '[^0-9K]', '', 'g') AS normalized_value
      FROM catalogo.proveedores
    ),
    groups AS (
      SELECT source_table, normalized_value, count(*)::int AS rows
      FROM normalized
      GROUP BY source_table, normalized_value
      HAVING count(*) > 1
    )
    SELECT g.source_table, g.normalized_value, g.rows,
           json_agg(json_build_object(
             'id', n.id,
             'rut', n.rut,
             'nombre', n.nombre,
             'razon_social', n.razon_social
           ) ORDER BY n.id) AS records
    FROM groups g
    JOIN normalized n ON n.source_table = g.source_table AND n.normalized_value = g.normalized_value
    GROUP BY g.source_table, g.normalized_value, g.rows
    ORDER BY g.source_table, g.rows DESC, g.normalized_value
    LIMIT ${Number(limit)}
  `)
  const rows = (await prisma.$queryRawUnsafe(sql)).map(toPlain)
  return rows.map(row => ({ ...row, action: classifyRutGroup(row) }))
}

async function getProductCodeFindings(prisma, limit) {
  const duplicateSql = q(`
    SELECT
      upper(trim(codigo_interno)) AS normalized_code,
      count(*)::int AS rows,
      count(*) FILTER (WHERE activo = true)::int AS active_rows,
      json_agg(json_build_object(
        'id', id,
        'codigo_interno', codigo_interno,
        'nombre', nombre,
        'activo', activo
      ) ORDER BY activo DESC, id) AS records
    FROM catalogo.productos
    WHERE codigo_interno IS NOT NULL AND trim(codigo_interno) <> ''
    GROUP BY upper(trim(codigo_interno))
    HAVING count(*) > 1
    ORDER BY active_rows DESC, rows DESC, normalized_code
    LIMIT ${Number(limit)}
  `)

  const missingSql = q(`
    SELECT
      id,
      codigo_interno,
      nombre,
      activo,
      stock::double precision AS stock,
      precio_lista::double precision AS precio_lista
    FROM catalogo.productos
    WHERE activo = true AND (codigo_interno IS NULL OR trim(codigo_interno) = '')
    ORDER BY id
    LIMIT ${Number(limit)}
  `)

  const [duplicates, missing] = await Promise.all([
    prisma.$queryRawUnsafe(duplicateSql),
    prisma.$queryRawUnsafe(missingSql),
  ])

  return {
    duplicates: duplicates.map(toPlain).map(row => ({ ...row, action: classifyProductCodeGroup(row) })),
    missing: missing.map(toPlain).map(row => ({ ...row, action: classifyProductCodeGroup(row) })),
  }
}

async function getStockAndDateFindings(prisma, limit) {
  const stockSql = q(`
    SELECT *
    FROM (
      SELECT 'catalogo.productos' AS source_table, id, codigo_interno AS code, nombre, stock::double precision AS stock
      FROM catalogo.productos
      WHERE stock < 0
      UNION ALL
      SELECT 'taller.bodega_taller' AS source_table, id, codigo_interno AS code, nombre, stock::double precision AS stock
      FROM taller.bodega_taller
      WHERE stock < 0
      UNION ALL
      SELECT 'taller.telas' AS source_table, id, codigo AS code, nombre, stock::double precision AS stock
      FROM taller.telas
      WHERE stock < 0
    ) negatives
    ORDER BY source_table, stock ASC, id
    LIMIT ${Number(limit)}
  `)

  const dateSql = q(`
    SELECT *
    FROM (
      SELECT 'catalogo.pagos_proveedores' AS source_table, 'fecha_pago' AS column_name, id, fecha_pago AS value, true AS nullable
      FROM catalogo.pagos_proveedores
      WHERE fecha_pago IS NOT NULL AND (fecha_pago < TIMESTAMP '2000-01-01' OR fecha_pago > now() + INTERVAL '1 year')
      UNION ALL
      SELECT 'catalogo.pagos_proveedores' AS source_table, 'fecha_doc' AS column_name, id, fecha_doc AS value, true AS nullable
      FROM catalogo.pagos_proveedores
      WHERE fecha_doc IS NOT NULL AND (fecha_doc < TIMESTAMP '2000-01-01' OR fecha_doc > now() + INTERVAL '1 year')
      UNION ALL
      SELECT 'ventas.ordenes' AS source_table, 'created_at' AS column_name, id, created_at AS value, false AS nullable
      FROM ventas.ordenes
      WHERE created_at < TIMESTAMP '2000-01-01' OR created_at > now() + INTERVAL '1 year'
      UNION ALL
      SELECT 'bodega.guias_despachos' AS source_table, 'fecha_guia' AS column_name, id, fecha_guia AS value, false AS nullable
      FROM bodega.guias_despachos
      WHERE fecha_guia < TIMESTAMP '2000-01-01' OR fecha_guia > now() + INTERVAL '1 year'
    ) anomalies
    ORDER BY value ASC, source_table, id
    LIMIT ${Number(limit)}
  `)

  const [stockRows, dateRows] = await Promise.all([
    prisma.$queryRawUnsafe(stockSql),
    prisma.$queryRawUnsafe(dateSql),
  ])

  return {
    stock: stockRows.map(toPlain).map(row => ({ ...row, action: classifyStock(row) })),
    dates: dateRows.map(toPlain).map(row => ({ ...row, action: classifyDateAnomaly(row) })),
  }
}

async function getOrderPriceFindings(prisma, limit) {
  const clientMismatchSql = q(`
    WITH client_keys AS (
      SELECT
        id,
        nombre,
        rut,
        regexp_replace(upper(trim(rut)), '[^0-9K]', '', 'g') AS rut_norm
      FROM clientes.clientes
    ),
    unique_client_by_rut AS (
      SELECT rut_norm, count(*)::int AS matches, min(id)::int AS target_cliente_id
      FROM client_keys
      WHERE rut_norm <> '' AND rut_norm !~ '^0+$'
      GROUP BY rut_norm
    )
    SELECT
      o.id,
      o.n_interno,
      o.cliente_id,
      c.nombre AS cliente_actual,
      c.rut AS cliente_rut,
      c.rut_norm AS cliente_rut_norm,
      o.rut_cliente,
      regexp_replace(upper(trim(coalesce(o.rut_cliente, ''))), '[^0-9K]', '', 'g') AS orden_rut_norm,
      u.matches AS target_matches,
      u.target_cliente_id,
      target.nombre AS target_cliente,
      target.rut AS target_rut
    FROM ventas.ordenes o
    JOIN client_keys c ON c.id = o.cliente_id
    LEFT JOIN unique_client_by_rut u ON u.rut_norm = regexp_replace(upper(trim(coalesce(o.rut_cliente, ''))), '[^0-9K]', '', 'g')
    LEFT JOIN client_keys target ON target.id = u.target_cliente_id
    WHERE o.rut_cliente IS NOT NULL
      AND trim(o.rut_cliente) <> ''
      AND regexp_replace(upper(trim(coalesce(o.rut_cliente, ''))), '[^0-9K]', '', 'g') <> ''
      AND c.rut_norm <> ''
      AND regexp_replace(upper(trim(coalesce(o.rut_cliente, ''))), '[^0-9K]', '', 'g') <> c.rut_norm
    ORDER BY o.id
    LIMIT ${Number(limit)}
  `)

  const negativePricesSql = q(`
    SELECT
      id,
      orden_id,
      producto_id,
      codigo_interno,
      nombre,
      cantidad::double precision AS cantidad,
      precio_unitario::double precision AS precio_unitario
    FROM ventas.orden_items
    WHERE precio_unitario < 0
    ORDER BY precio_unitario ASC, id
    LIMIT ${Number(limit)}
  `)

  const [clientMismatches, negativePrices] = await Promise.all([
    prisma.$queryRawUnsafe(clientMismatchSql),
    prisma.$queryRawUnsafe(negativePricesSql),
  ])

  return {
    clientMismatches: clientMismatches.map(toPlain).map(row => ({ ...row, action: classifyOrderClientIssue(row) })),
    negativePrices: negativePrices.map(toPlain).map(row => ({ ...row, action: classifyNegativePrice(row) })),
  }
}

export async function buildPlan(prisma, options) {
  const plan = {
    generatedAt: new Date().toISOString(),
    task: options.task,
    limit: options.limit,
    productOrphans: [],
    rutDuplicates: [],
    productCodes: { duplicates: [], missing: [] },
    stockAndDates: { stock: [], dates: [] },
    orderIssues: { clientMismatches: [], negativePrices: [] },
  }

  if (options.task === 'all' || options.task === 'product-orphans') {
    plan.productOrphans = await getProductOrphans(prisma, options.limit)
  }
  if (options.task === 'all' || options.task === 'rut-duplicates') {
    plan.rutDuplicates = await getRutDuplicates(prisma, options.limit)
  }
  if (options.task === 'all' || options.task === 'product-codes') {
    plan.productCodes = await getProductCodeFindings(prisma, options.limit)
  }
  if (options.task === 'all' || options.task === 'stock-dates') {
    plan.stockAndDates = await getStockAndDateFindings(prisma, options.limit)
  }
  if (options.task === 'all' || options.task === 'orders-prices') {
    plan.orderIssues = await getOrderPriceFindings(prisma, options.limit)
  }
  return plan
}

export function summarizePlan(plan) {
  const productOrphans = plan.productOrphans ?? []
  const rutDuplicates = plan.rutDuplicates ?? []
  const productCodeDuplicatesRows = plan.productCodes?.duplicates ?? []
  const productCodeMissingRows = plan.productCodes?.missing ?? []
  const stockRows = plan.stockAndDates?.stock ?? []
  const dateRows = plan.stockAndDates?.dates ?? []
  const clientMismatchRows = plan.orderIssues?.clientMismatches ?? []
  const negativePriceRows = plan.orderIssues?.negativePrices ?? []

  const productAuto = productOrphans.filter(row => row.action === 'auto_fix_exact_code_match').length
  const productManual = productOrphans.length - productAuto
  const rutManual = rutDuplicates.length
  const productCodeDuplicates = productCodeDuplicatesRows.length
  const productCodeMissing = productCodeMissingRows.length
  const productCodeActiveDuplicates = productCodeDuplicatesRows.filter(row => row.action === 'manual_duplicate_active_product_code').length
  const stockManual = stockRows.length
  const dateSentinels = dateRows.filter(row => row.action === 'candidate_null_sentinel_date').length
  const dateManual = dateRows.length - dateSentinels
  const orderClientCandidates = clientMismatchRows.filter(row => row.action === 'candidate_reassign_order_cliente_by_unique_rut').length
  const orderClientManual = clientMismatchRows.length - orderClientCandidates
  const negativePrices = negativePriceRows.length

  return {
    productOrphans: {
      total: productOrphans.length,
      autoFixExactCodeMatch: productAuto,
      manual: productManual,
    },
    rutDuplicates: {
      groups: rutManual,
      placeholders: rutDuplicates.filter(row => row.action === 'manual_placeholder_group').length,
      realDuplicates: rutDuplicates.filter(row => row.action === 'manual_duplicate_real_rut').length,
    },
    productCodes: {
      duplicateGroups: productCodeDuplicates,
      activeDuplicateGroups: productCodeActiveDuplicates,
      activeMissingCodeRows: productCodeMissing,
    },
    stockAndDates: {
      negativeStockRows: stockManual,
      nullableSentinelDates: dateSentinels,
      manualDateRows: dateManual,
    },
    orderIssues: {
      clientMismatchRows: clientMismatchRows.length,
      uniqueRutCandidates: orderClientCandidates,
      manualClientRows: orderClientManual,
      negativePriceRows: negativePrices,
    },
  }
}

async function applyProductOrphanFixes(prisma, plan, confirm) {
  if (confirm !== PRODUCT_CONFIRM) {
    throw new Error(`Refusing apply. Use --confirm=${PRODUCT_CONFIRM}`)
  }

  const candidates = plan.productOrphans.filter(row => row.action === 'auto_fix_exact_code_match')
  const applied = []
  await prisma.$transaction(async (tx) => {
    for (const row of candidates) {
      if (row.source_table === 'ventas.orden_items') {
        await tx.$executeRawUnsafe(
          'UPDATE ventas.orden_items SET producto_id = $1 WHERE id = $2 AND producto_id = $3',
          row.matched_producto_id,
          row.id,
          row.old_producto_id
        )
      } else if (row.source_table === 'taller.odt_items') {
        await tx.$executeRawUnsafe(
          'UPDATE taller.odt_items SET producto_id = $1 WHERE id = $2 AND producto_id = $3',
          row.matched_producto_id,
          row.id,
          row.old_producto_id
        )
      }
      applied.push({
        source_table: row.source_table,
        id: row.id,
        old_producto_id: row.old_producto_id,
        new_producto_id: row.matched_producto_id,
        codigo_interno: row.codigo_interno,
      })
    }
  })
  return applied
}

export function formatTextReport(plan) {
  const summary = summarizePlan(plan)
  const lines = []
  lines.push('')
  lines.push('=== Plastimar ERP cleanup plan (dry-run by default) ===')
  lines.push(`Task: ${plan.task} | Limit per section: ${plan.limit}`)
  lines.push(`Product orphans: ${summary.productOrphans.total} rows | exact-auto=${summary.productOrphans.autoFixExactCodeMatch} manual=${summary.productOrphans.manual}`)
  lines.push(`RUT duplicate groups: ${summary.rutDuplicates.groups} | placeholders=${summary.rutDuplicates.placeholders} real=${summary.rutDuplicates.realDuplicates}`)
  lines.push(`Product code issues: duplicate-groups=${summary.productCodes.duplicateGroups} active-duplicate-groups=${summary.productCodes.activeDuplicateGroups} active-missing-code=${summary.productCodes.activeMissingCodeRows}`)
  lines.push(`Negative stock rows: ${summary.stockAndDates.negativeStockRows}`)
  lines.push(`Date anomalies: nullable-sentinel=${summary.stockAndDates.nullableSentinelDates} manual=${summary.stockAndDates.manualDateRows}`)
  lines.push(`Order/client issues: mismatches=${summary.orderIssues.clientMismatchRows} unique-rut-candidates=${summary.orderIssues.uniqueRutCandidates} manual=${summary.orderIssues.manualClientRows}`)
  lines.push(`Negative price rows: ${summary.orderIssues.negativePriceRows}`)

  const productSamples = (plan.productOrphans ?? []).slice(0, 10)
  if (productSamples.length) {
    lines.push('')
    lines.push('Product orphan samples:')
    for (const row of productSamples) {
      lines.push(`- ${row.source_table}#${row.id} old=${row.old_producto_id} code=${row.codigo_interno || '-'} action=${row.action} match=${row.matched_producto_id || '-'}`)
    }
  }

  const rutSamples = (plan.rutDuplicates ?? []).slice(0, 10)
  if (rutSamples.length) {
    lines.push('')
    lines.push('RUT duplicate group samples:')
    for (const row of rutSamples) {
      lines.push(`- ${row.source_table} rut=${row.normalized_value || '<empty>'} rows=${row.rows} action=${row.action}`)
    }
  }

  const productCodeSamples = (plan.productCodes?.duplicates ?? []).slice(0, 10)
  if (productCodeSamples.length) {
    lines.push('')
    lines.push('Product code duplicate samples:')
    for (const row of productCodeSamples) {
      lines.push(`- code=${row.normalized_code || '<empty>'} rows=${row.rows} active=${row.active_rows} action=${row.action}`)
    }
  }

  const orderSamples = (plan.orderIssues?.clientMismatches ?? []).slice(0, 10)
  if (orderSamples.length) {
    lines.push('')
    lines.push('Order/client mismatch samples:')
    for (const row of orderSamples) {
      lines.push(`- orden#${row.id} n_interno=${row.n_interno || '-'} cliente_id=${row.cliente_id} rut_orden=${row.rut_cliente || '-'} action=${row.action} target=${row.target_cliente_id || '-'}`)
    }
  }

  lines.push('')
  lines.push(`Apply support is limited to exact product-orphan fixes and requires --task=product-orphans --apply --confirm=${PRODUCT_CONFIRM}.`)
  lines.push('Order/client, duplicate product-code, negative price, negative stock and date findings are read-only review plans unless handled by their dedicated guarded scripts.')
  lines.push('')
  return lines.join('\n')
}

async function createPrisma() {
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import('@prisma/client'),
    import('@prisma/adapter-pg'),
  ])
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

async function main() {
  const options = parseArgs()
  readLocalEnv()
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required. Set it in the environment or backend/.env.')
    process.exit(2)
  }
  if (options.apply && options.task !== 'product-orphans') {
    console.error('Apply is only supported for --task=product-orphans.')
    process.exit(2)
  }

  const prisma = await createPrisma()
  try {
    const plan = await buildPlan(prisma, options)
    let applied = []
    if (options.apply) {
      applied = await applyProductOrphanFixes(prisma, plan, options.confirm)
    }
    const payload = { summary: summarizePlan(plan), plan, applied }
    if (options.out) writeFileSync(resolve(options.out), JSON.stringify(payload, null, 2))
    if (options.json) console.log(JSON.stringify(payload, null, 2))
    else {
      console.log(formatTextReport(plan))
      if (options.apply) console.log(`Applied exact product orphan fixes: ${applied.length}`)
      if (options.out) console.log(`Wrote plan: ${resolve(options.out)}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(2)
  })
}
