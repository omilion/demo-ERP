import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const CONFIRM_FLAG = '--confirm'
const DEFAULT_SAMPLE_LIMIT = 20
const MAX_SAMPLE_LIMIT = 200

export const TARGETS = {
  'ventas.orden_items': {
    label: 'ventas.orden_items',
    idColumn: 'id',
    parentColumn: 'orden_id',
    parentLabel: 'ordenId',
  },
  'taller.odt_items': {
    label: 'taller.odt_items',
    idColumn: 'id',
    parentColumn: 'odt_id',
    parentLabel: 'odtId',
  },
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isInteger(n) ? n : null
}

function toPlain(value) {
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toPlain)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]))
  }
  return value
}

export function normalizeCodigoInterno(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim().toUpperCase()
}

export function buildProductCodeIndex(products) {
  const byCode = new Map()

  for (const raw of products) {
    const product = toPlain(raw)
    const code = normalizeCodigoInterno(product.codigo_interno ?? product.codigoInterno)
    const id = toNumber(product.id)
    if (!code || id === null) continue

    if (!byCode.has(code)) byCode.set(code, [])
    byCode.get(code).push({
      id,
      codigoInterno: product.codigo_interno ?? product.codigoInterno,
      nombre: product.nombre ?? null,
    })
  }

  return byCode
}

function rowTable(row) {
  return row.table_name ?? row.tableName ?? row.table ?? row.sourceTable
}

function rowCodigo(row) {
  return row.codigo_interno ?? row.codigoInterno
}

function makeReverseSql(change) {
  return `UPDATE ${change.table} SET producto_id = ${change.before.productoId} WHERE id = ${change.id} AND producto_id = ${change.after.productoId};`
}

export function classifyProductOrphan(row, productCodeIndex) {
  const plain = toPlain(row)
  const table = rowTable(plain)
  const target = TARGETS[table]
  const id = toNumber(plain.id)
  const beforeProductoId = toNumber(plain.producto_id ?? plain.productoId)
  const codigoInterno = rowCodigo(plain) ?? null
  const codigoNormalizado = normalizeCodigoInterno(codigoInterno)
  const parentId = target ? toNumber(plain[target.parentColumn] ?? plain[target.parentLabel]) : null

  const result = {
    table,
    id,
    parentColumn: target?.parentColumn ?? null,
    parentId,
    codigoInterno,
    codigoNormalizado,
    before: {
      productoId: beforeProductoId,
      nombre: plain.nombre ?? null,
      cantidad: plain.cantidad ?? null,
    },
    after: null,
    action: 'skip',
    reason: null,
    reversible: false,
  }

  if (!target) {
    result.reason = 'unsupported_table'
    return result
  }

  if (id === null || id <= 0) {
    result.reason = 'invalid_row_id'
    return result
  }

  if (beforeProductoId === null || beforeProductoId < 0) {
    result.reason = 'invalid_current_producto_id'
    return result
  }

  if (!codigoNormalizado) {
    result.reason = 'missing_codigo_interno'
    return result
  }

  const products = productCodeIndex.get(codigoNormalizado) ?? []
  if (products.length === 0) {
    result.reason = 'no_catalog_match'
    return result
  }

  if (products.length > 1) {
    result.reason = 'ambiguous_catalog_match'
    result.matches = products
    return result
  }

  const product = products[0]
  if (product.id === beforeProductoId) {
    result.reason = 'already_points_to_catalog_match'
    return result
  }

  result.action = 'update_producto_id'
  result.reason = 'safe_codigo_interno_match'
  result.after = {
    productoId: product.id,
    codigoInterno: product.codigoInterno,
    nombre: product.nombre,
  }
  result.reversible = true
  result.reverseSql = makeReverseSql(result)
  return result
}

export function classifyProductOrphans(rows, products) {
  const productCodeIndex = buildProductCodeIndex(products)
  const results = rows.map((row) => classifyProductOrphan(row, productCodeIndex))
  const changes = results.filter((result) => result.action === 'update_producto_id')
  const skipped = results.filter((result) => result.action !== 'update_producto_id')

  return {
    changes,
    skipped,
    summary: summarizeClassification(results),
  }
}

export function summarizeClassification(results) {
  const summary = {
    totalRows: results.length,
    changeCount: 0,
    skippedCount: 0,
    byTable: {},
    byReason: {},
  }

  for (const result of results) {
    const table = result.table ?? 'unknown'
    if (!summary.byTable[table]) summary.byTable[table] = { changeCount: 0, skippedCount: 0 }

    if (result.action === 'update_producto_id') {
      summary.changeCount++
      summary.byTable[table].changeCount++
    } else {
      summary.skippedCount++
      summary.byTable[table].skippedCount++
    }

    summary.byReason[result.reason] = (summary.byReason[result.reason] ?? 0) + 1
  }

  return summary
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    confirm: false,
    json: false,
    writeReport: false,
    allowProduction: false,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    auditDir: null,
    help: false,
  }

  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg === CONFIRM_FLAG) options.confirm = true
    else if (arg === '--json') options.json = true
    else if (arg === '--write-report') options.writeReport = true
    else if (arg === '--allow-production') options.allowProduction = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg.startsWith('--samples=')) {
      const raw = Number(arg.slice('--samples='.length))
      if (Number.isInteger(raw) && raw >= 0) {
        options.sampleLimit = Math.min(raw, MAX_SAMPLE_LIMIT)
      }
    } else if (arg.startsWith('--audit-dir=')) {
      const dir = arg.slice('--audit-dir='.length).trim()
      if (dir) options.auditDir = dir
    }
  }

  return options
}

export function validateOptions(options, env = process.env) {
  if (options.apply && !options.confirm) {
    return `--apply requires ${CONFIRM_FLAG}. Dry-run is the default.`
  }

  if (options.apply && isProductionLike(env.DATABASE_URL) && !options.allowProduction) {
    return 'Refusing to apply against a production-like DATABASE_URL without --allow-production.'
  }

  return null
}

export function isProductionLike(databaseUrl = '') {
  return /(^|[^a-z])prod(uction)?([^a-z]|$)/i.test(String(databaseUrl))
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

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function resolveAuditDir(options) {
  const dir = options.auditDir ?? resolve(__dirname, `audit/producto-orphans-${timestamp()}`)
  return resolve(process.cwd(), dir)
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows) {
  const headers = [
    'table',
    'id',
    'parent_column',
    'parent_id',
    'codigo_interno',
    'codigo_normalizado',
    'before_producto_id',
    'after_producto_id',
    'after_codigo_interno',
    'after_nombre',
    'action',
    'reason',
    'reverse_sql',
  ]
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push([
      row.table,
      row.id,
      row.parentColumn,
      row.parentId,
      row.codigoInterno,
      row.codigoNormalizado,
      row.before?.productoId,
      row.after?.productoId,
      row.after?.codigoInterno,
      row.after?.nombre,
      row.action,
      row.reason,
      row.reverseSql,
    ].map(csvEscape).join(','))
  }
  return `${lines.join('\n')}\n`
}

function writeAuditFiles(auditDir, label, payload) {
  mkdirSync(auditDir, { recursive: true })
  const base = resolve(auditDir, `producto-orphans-${label}`)
  const rows = [...payload.changes, ...payload.skipped]
  writeFileSync(`${base}.json`, `${JSON.stringify(payload, null, 2)}\n`)
  writeFileSync(`${base}.csv`, toCsv(rows))
  return {
    json: `${base}.json`,
    csv: `${base}.csv`,
  }
}

function formatTextReport(report, options) {
  const lines = []
  lines.push('')
  lines.push(`=== Producto orphan cleanup (${options.apply ? 'APPLY' : 'DRY RUN'}) ===`)
  lines.push('')
  lines.push(`Rows inspected: ${report.summary.totalRows}`)
  lines.push(`Safe updates: ${report.summary.changeCount}`)
  lines.push(`Skipped: ${report.summary.skippedCount}`)

  const tableLines = Object.entries(report.summary.byTable)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([table, counts]) => `${table}: update=${counts.changeCount} skip=${counts.skippedCount}`)
  if (tableLines.length > 0) {
    lines.push('')
    lines.push('By table:')
    for (const line of tableLines) lines.push(`- ${line}`)
  }

  const reasonLines = Object.entries(report.summary.byReason)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, count]) => `${reason}=${count}`)
  if (reasonLines.length > 0) {
    lines.push('')
    lines.push(`Reasons: ${reasonLines.join(' ')}`)
  }

  if (report.changes.length > 0) {
    lines.push('')
    lines.push('Safe update sample:')
    for (const change of report.changes.slice(0, options.sampleLimit)) {
      lines.push(`- ${change.table} id=${change.id} producto_id ${change.before.productoId} -> ${change.after.productoId} codigo=${JSON.stringify(change.codigoInterno)}`)
    }
  }

  if (!options.apply) {
    lines.push('')
    lines.push(`Dry-run only. Re-run with --apply ${CONFIRM_FLAG} to write safe updates and audit CSV/JSON.`)
  }

  if (report.auditFiles) {
    lines.push('')
    lines.push(`Audit JSON: ${report.auditFiles.json}`)
    lines.push(`Audit CSV: ${report.auditFiles.csv}`)
  }

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

async function fetchProducts(prisma) {
  return prisma.$queryRaw`
    SELECT id, codigo_interno, nombre
    FROM catalogo.productos
    WHERE codigo_interno IS NOT NULL
      AND trim(codigo_interno) <> ''
    ORDER BY id
  `
}

async function fetchOrphanRows(prisma) {
  const ordenItems = await prisma.$queryRaw`
    SELECT
      'ventas.orden_items' AS table_name,
      i.id,
      i.orden_id,
      i.producto_id,
      i.codigo_interno,
      i.nombre,
      i.descripcion,
      i.cantidad
    FROM ventas.orden_items i
    WHERE i.producto_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM catalogo.productos p WHERE p.id = i.producto_id
      )
    ORDER BY i.id
  `

  const odtItems = await prisma.$queryRaw`
    SELECT
      'taller.odt_items' AS table_name,
      i.id,
      i.odt_id,
      i.producto_id,
      i.codigo_interno,
      i.nombre,
      i.obs,
      i.cantidad
    FROM taller.odt_items i
    WHERE i.producto_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM catalogo.productos p WHERE p.id = i.producto_id
      )
    ORDER BY i.id
  `

  return [...ordenItems, ...odtItems]
}

async function applyChange(tx, change) {
  if (change.table === 'ventas.orden_items') {
    return tx.$executeRaw`
      UPDATE ventas.orden_items i
      SET producto_id = ${change.after.productoId}
      WHERE i.id = ${change.id}
        AND i.producto_id = ${change.before.productoId}
        AND upper(regexp_replace(coalesce(i.codigo_interno, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = ${change.codigoNormalizado}
        AND NOT EXISTS (SELECT 1 FROM catalogo.productos old_p WHERE old_p.id = i.producto_id)
        AND EXISTS (
          SELECT 1
          FROM catalogo.productos new_p
          WHERE new_p.id = ${change.after.productoId}
            AND upper(regexp_replace(coalesce(new_p.codigo_interno, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = ${change.codigoNormalizado}
        )
    `
  }

  if (change.table === 'taller.odt_items') {
    return tx.$executeRaw`
      UPDATE taller.odt_items i
      SET producto_id = ${change.after.productoId}
      WHERE i.id = ${change.id}
        AND i.producto_id = ${change.before.productoId}
        AND upper(regexp_replace(coalesce(i.codigo_interno, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = ${change.codigoNormalizado}
        AND NOT EXISTS (SELECT 1 FROM catalogo.productos old_p WHERE old_p.id = i.producto_id)
        AND EXISTS (
          SELECT 1
          FROM catalogo.productos new_p
          WHERE new_p.id = ${change.after.productoId}
            AND upper(regexp_replace(coalesce(new_p.codigo_interno, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = ${change.codigoNormalizado}
        )
    `
  }

  throw new Error(`Unsupported table for apply: ${change.table}`)
}

async function applyChanges(prisma, changes) {
  const applied = []
  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      const updated = Number(await applyChange(tx, change))
      if (updated !== 1) {
        throw new Error(`Refusing partial apply: ${change.table} id=${change.id} no longer matches the audited plan.`)
      }
      applied.push({
        ...change,
        applied: true,
        updated,
      })
    }
  })
  return applied
}

function helpText() {
  return `
Usage:
  node scripts/cleanup-producto-orphans.mjs [--json] [--samples=N]
  node scripts/cleanup-producto-orphans.mjs --write-report [--audit-dir=DIR]
  node scripts/cleanup-producto-orphans.mjs --apply --confirm [--audit-dir=DIR]

Safety:
  - Dry-run by default.
  - Only updates ventas.orden_items.producto_id and taller.odt_items.producto_id.
  - Only updates rows whose current producto_id is orphaned.
  - Only matches by exact normalized codigo_interno after trimming surrounding whitespace and uppercasing.
  - Duplicate normalized product codes and missing/no-match codes are skipped.
  - --apply requires --confirm and writes CSV/JSON audit files with reverse SQL.
`.trim()
}

async function main() {
  const options = parseArgs()
  if (options.help) {
    console.log(helpText())
    return
  }

  readLocalEnv()
  const validationError = validateOptions(options)
  if (validationError) {
    console.error(validationError)
    process.exit(2)
    return
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required. Set it in the environment or backend/.env.')
    process.exit(2)
    return
  }

  const prisma = await createPrisma()
  try {
    const [rows, products] = await Promise.all([
      fetchOrphanRows(prisma),
      fetchProducts(prisma),
    ])

    const classified = classifyProductOrphans(rows, products)
    const report = {
      generatedAt: new Date().toISOString(),
      mode: options.apply ? 'apply' : 'dry-run',
      matcher: 'codigo_interno exact match after surrounding whitespace trim and uppercase',
      summary: classified.summary,
      changes: classified.changes,
      skipped: classified.skipped,
    }

    let auditDir = null
    if (options.apply || options.writeReport) {
      auditDir = resolveAuditDir(options)
      report.auditFiles = writeAuditFiles(auditDir, 'plan', report)
    }

    if (options.apply) {
      const applied = await applyChanges(prisma, classified.changes)
      const appliedReport = {
        ...report,
        planAuditFiles: report.auditFiles,
        auditFiles: null,
        appliedAt: new Date().toISOString(),
        changes: applied,
        summary: {
          ...report.summary,
          appliedCount: applied.length,
        },
      }
      appliedReport.auditFiles = writeAuditFiles(auditDir, 'applied', appliedReport)
      if (options.json) console.log(JSON.stringify(appliedReport, null, 2))
      else console.log(formatTextReport(appliedReport, options))
      return
    }

    if (options.json) console.log(JSON.stringify(report, null, 2))
    else console.log(formatTextReport(report, options))
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
