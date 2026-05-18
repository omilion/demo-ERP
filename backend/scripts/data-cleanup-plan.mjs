import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TASKS = new Set(['all', 'product-orphans', 'rut-duplicates', 'stock-dates'])
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

export function classifyStock(row) {
  const stock = Number(row.stock)
  if (!Number.isFinite(stock) || stock >= 0) return 'ok'
  return 'manual_inventory_adjustment_required'
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

export async function buildPlan(prisma, options) {
  const plan = {
    generatedAt: new Date().toISOString(),
    task: options.task,
    limit: options.limit,
    productOrphans: [],
    rutDuplicates: [],
    stockAndDates: { stock: [], dates: [] },
  }

  if (options.task === 'all' || options.task === 'product-orphans') {
    plan.productOrphans = await getProductOrphans(prisma, options.limit)
  }
  if (options.task === 'all' || options.task === 'rut-duplicates') {
    plan.rutDuplicates = await getRutDuplicates(prisma, options.limit)
  }
  if (options.task === 'all' || options.task === 'stock-dates') {
    plan.stockAndDates = await getStockAndDateFindings(prisma, options.limit)
  }
  return plan
}

export function summarizePlan(plan) {
  const productAuto = plan.productOrphans.filter(row => row.action === 'auto_fix_exact_code_match').length
  const productManual = plan.productOrphans.length - productAuto
  const rutManual = plan.rutDuplicates.length
  const stockManual = plan.stockAndDates.stock.length
  const dateSentinels = plan.stockAndDates.dates.filter(row => row.action === 'candidate_null_sentinel_date').length
  const dateManual = plan.stockAndDates.dates.length - dateSentinels

  return {
    productOrphans: {
      total: plan.productOrphans.length,
      autoFixExactCodeMatch: productAuto,
      manual: productManual,
    },
    rutDuplicates: {
      groups: rutManual,
      placeholders: plan.rutDuplicates.filter(row => row.action === 'manual_placeholder_group').length,
      realDuplicates: plan.rutDuplicates.filter(row => row.action === 'manual_duplicate_real_rut').length,
    },
    stockAndDates: {
      negativeStockRows: stockManual,
      nullableSentinelDates: dateSentinels,
      manualDateRows: dateManual,
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
  lines.push(`Negative stock rows: ${summary.stockAndDates.negativeStockRows}`)
  lines.push(`Date anomalies: nullable-sentinel=${summary.stockAndDates.nullableSentinelDates} manual=${summary.stockAndDates.manualDateRows}`)

  const productSamples = plan.productOrphans.slice(0, 10)
  if (productSamples.length) {
    lines.push('')
    lines.push('Product orphan samples:')
    for (const row of productSamples) {
      lines.push(`- ${row.source_table}#${row.id} old=${row.old_producto_id} code=${row.codigo_interno || '-'} action=${row.action} match=${row.matched_producto_id || '-'}`)
    }
  }

  const rutSamples = plan.rutDuplicates.slice(0, 10)
  if (rutSamples.length) {
    lines.push('')
    lines.push('RUT duplicate group samples:')
    for (const row of rutSamples) {
      lines.push(`- ${row.source_table} rut=${row.normalized_value || '<empty>'} rows=${row.rows} action=${row.action}`)
    }
  }

  lines.push('')
  lines.push(`Apply support is limited to exact product-orphan fixes and requires --task=product-orphans --apply --confirm=${PRODUCT_CONFIRM}.`)
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
