import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 1000
const DEFAULT_FUTURE_YEARS = 10
const APPLY_CONFIRMATION = 'APPLY_DATE_NULLS'

const DEFAULT_SCHEMAS = [
  'auth',
  'bodega',
  'caja',
  'catalogo',
  'clientes',
  'rrhh',
  'taller',
  'ventas',
]

export const STOCK_TARGETS = [
  {
    id: 'catalogo.productos',
    table: 'catalogo.productos',
    codeColumn: 'codigo_interno',
    nameColumn: 'nombre',
    stockColumn: 'stock',
    evidenceSql: (alias) => `
      SELECT json_build_object(
        'origen', 'bodega.movimientos',
        'id', m.id,
        'tipo', m.tipo,
        'cantidad', m.cantidad,
        'motivo', m.motivo,
        'fecha', m.created_at,
        'user_id', m.user_id
      )
      FROM bodega.movimientos m
      WHERE m.producto_id = ${alias}.id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    `,
  },
  {
    id: 'taller.telas',
    table: 'taller.telas',
    codeColumn: 'codigo',
    nameColumn: 'nombre',
    stockColumn: 'stock',
    evidenceSql: (alias) => `
      SELECT json_build_object(
        'origen', 'taller.tela_movimientos',
        'id', m.id,
        'tipo', m.tipo,
        'cantidad', m.cantidad,
        'factura', m.factura,
        'fecha', m.fecha,
        'usuario', m.usuario
      )
      FROM taller.tela_movimientos m
      WHERE m.tela_id = ${alias}.id
      ORDER BY m.fecha DESC, m.id DESC
      LIMIT 1
    `,
  },
  {
    id: 'taller.bodega_taller',
    table: 'taller.bodega_taller',
    codeColumn: 'codigo_interno',
    nameColumn: 'nombre',
    stockColumn: 'stock',
    evidenceSql: (alias) => `
      SELECT json_build_object(
        'origen', 'taller.taller_historial_materiales',
        'id', h.id,
        'odt_id', h.odt_id,
        'ingreso', h.ingreso,
        'egreso', h.egreso,
        'fecha', h.fecha,
        'usuario', h.usuario
      )
      FROM taller.taller_historial_materiales h
      WHERE h.codigo_interno IS NOT NULL
        AND upper(trim(h.codigo_interno)) = upper(trim(${alias}.codigo_interno))
      ORDER BY h.fecha DESC, h.id DESC
      LIMIT 1
    `,
  },
]

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
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, toPlain(val)]))
  }
  return value
}

const q = (sql) => sql.replace(/\s+/g, ' ').trim()

function ident(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`)
  }
  return `"${value}"`
}

function qualifiedTable(schema, table) {
  return `${ident(schema)}.${ident(table)}`
}

function parsePositiveInt(raw, fallback, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) return fallback
  return Math.min(value, max)
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    apply: false,
    confirm: '',
    includeStock: true,
    includeDates: true,
    limit: DEFAULT_LIMIT,
    futureYears: DEFAULT_FUTURE_YEARS,
    schemas: [...DEFAULT_SCHEMAS],
  }

  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg === '--apply') options.apply = true
    else if (arg === '--only-stock') options.includeDates = false
    else if (arg === '--only-dates') options.includeStock = false
    else if (arg.startsWith('--confirm=')) options.confirm = arg.slice('--confirm='.length)
    else if (arg.startsWith('--limit=')) options.limit = parsePositiveInt(arg.slice('--limit='.length), DEFAULT_LIMIT, MAX_LIMIT)
    else if (arg.startsWith('--future-years=')) options.futureYears = parsePositiveInt(arg.slice('--future-years='.length), DEFAULT_FUTURE_YEARS, 100)
    else if (arg.startsWith('--schemas=')) {
      const schemas = arg.slice('--schemas='.length).split(',').map((item) => item.trim()).filter(Boolean)
      if (schemas.length) options.schemas = schemas
    }
  }

  return options
}

export function applyEnabled(options) {
  return options.apply === true && options.confirm === APPLY_CONFIRMATION
}

export function classifyStockRow(row, targetId = row?.target) {
  return {
    target: targetId,
    id: Number(row.id),
    codigo: row.codigo ?? null,
    nombre: row.nombre ?? null,
    stock: Number(row.stock),
    ultimaEvidencia: toPlain(row.ultima_evidencia ?? row.ultimaEvidencia ?? null),
    recomendacionManual: row.ultima_evidencia || row.ultimaEvidencia
      ? 'Revisar ultimo movimiento contra stock actual; corregir con ajuste inventariado y respaldo.'
      : 'Sin evidencia de movimiento inferida; revisar kardex/factura/ODT antes de ajustar stock.',
  }
}

export function classifyDateValue(value, now = new Date(), futureYears = DEFAULT_FUTURE_YEARS) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return {
      kind: 'invalid',
      severity: 'manual',
      isSentinel: false,
      recommendedAction: 'manual_review',
    }
  }

  const year = date.getUTCFullYear()
  const futureLimit = new Date(now)
  futureLimit.setUTCFullYear(futureLimit.getUTCFullYear() + futureYears)

  if (year <= 1) {
    return {
      kind: 'sentinel_0001',
      severity: 'sentinel',
      isSentinel: true,
      recommendedAction: 'null_if_nullable_and_confirmed',
    }
  }

  if (year === 1970) {
    return {
      kind: 'sentinel_1970',
      severity: 'sentinel',
      isSentinel: true,
      recommendedAction: 'null_if_nullable_and_confirmed',
    }
  }

  if (date < new Date(Date.UTC(2000, 0, 1))) {
    return {
      kind: 'pre_2000',
      severity: 'manual',
      isSentinel: false,
      recommendedAction: 'manual_review',
    }
  }

  if (date > futureLimit) {
    return {
      kind: 'future_extreme',
      severity: 'manual',
      isSentinel: false,
      recommendedAction: 'manual_review',
    }
  }

  return {
    kind: 'normal',
    severity: 'ok',
    isSentinel: false,
    recommendedAction: 'none',
  }
}

export function classifyDateRow(row, options = {}) {
  const classification = classifyDateValue(row.value, options.now ?? new Date(), options.futureYears ?? DEFAULT_FUTURE_YEARS)
  const nullable = row.is_nullable === 'YES' || row.isNullable === true || row.nullable === true
  const canNull = classification.isSentinel && nullable
  const recommendation = canNull
    ? 'Proponer NULL solo con --apply --confirm=APPLY_DATE_NULLS; verificar impacto funcional antes de aplicar.'
    : classification.isSentinel
      ? 'Centinela obvio en columna NOT NULL; requiere decision manual o migracion con valor valido.'
      : 'Revision manual; no proponer cambio automatico.'

  return {
    table: row.table_name ? `${row.table_schema}.${row.table_name}` : row.table,
    column: row.column_name ?? row.column,
    id: Number(row.id),
    value: toPlain(row.value),
    kind: classification.kind,
    nullable,
    canNull,
    recommendation,
  }
}

function stockSql(target, limit) {
  const [schema, table] = target.table.split('.')
  const alias = 'x'
  return q(`
    SELECT
      ${alias}.id,
      ${alias}.${ident(target.codeColumn)} AS codigo,
      ${alias}.${ident(target.nameColumn)} AS nombre,
      ${alias}.${ident(target.stockColumn)}::numeric AS stock,
      (${target.evidenceSql(alias)}) AS ultima_evidencia
    FROM ${qualifiedTable(schema, table)} ${alias}
    WHERE ${alias}.${ident(target.stockColumn)} < 0
    ORDER BY ${alias}.${ident(target.stockColumn)} ASC, ${alias}.id ASC
    LIMIT ${limit}
  `)
}

export async function collectStockFindings(prisma, options = {}) {
  const limit = options.limit ?? DEFAULT_LIMIT
  const findings = []
  const errors = []

  for (const target of STOCK_TARGETS) {
    try {
      const rows = await prisma.$queryRawUnsafe(stockSql(target, limit))
      findings.push(...rows.map((row) => classifyStockRow(row, target.id)))
    } catch (error) {
      errors.push({ target: target.id, error: error.message })
    }
  }

  return { findings, errors }
}

export async function collectDateColumns(prisma, schemas = DEFAULT_SCHEMAS) {
  const quotedSchemas = schemas.map((schema) => `'${schema.replaceAll("'", "''")}'`).join(', ')
  return prisma.$queryRawUnsafe(q(`
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      c.is_nullable
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema IN (${quotedSchemas})
      AND c.data_type IN ('date', 'timestamp without time zone', 'timestamp with time zone')
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns idc
        WHERE idc.table_schema = c.table_schema
          AND idc.table_name = c.table_name
          AND idc.column_name = 'id'
      )
    ORDER BY c.table_schema, c.table_name, c.column_name
  `))
}

function dateAnomalySql(column, options) {
  const tableName = qualifiedTable(column.table_schema, column.table_name)
  const columnName = ident(column.column_name)
  return q(`
    SELECT
      '${column.table_schema.replaceAll("'", "''")}' AS table_schema,
      '${column.table_name.replaceAll("'", "''")}' AS table_name,
      '${column.column_name.replaceAll("'", "''")}' AS column_name,
      '${column.is_nullable.replaceAll("'", "''")}' AS is_nullable,
      id,
      ${columnName} AS value
    FROM ${tableName}
    WHERE ${columnName} IS NOT NULL
      AND (
        EXTRACT(YEAR FROM ${columnName}) <= 1
        OR EXTRACT(YEAR FROM ${columnName}) = 1970
        OR ${columnName} < TIMESTAMP '2000-01-01'
        OR ${columnName} > now() + INTERVAL '${Number(options.futureYears)} years'
      )
    ORDER BY ${columnName} ASC, id ASC
    LIMIT ${Number(options.limit)}
  `)
}

export async function collectDateFindings(prisma, options = {}) {
  const settings = {
    limit: options.limit ?? DEFAULT_LIMIT,
    futureYears: options.futureYears ?? DEFAULT_FUTURE_YEARS,
    schemas: options.schemas ?? DEFAULT_SCHEMAS,
  }
  const columns = await collectDateColumns(prisma, settings.schemas)
  const findings = []
  const errors = []

  for (const column of columns) {
    try {
      const rows = await prisma.$queryRawUnsafe(dateAnomalySql(column, settings))
      findings.push(...rows.map((row) => classifyDateRow(row, settings)))
    } catch (error) {
      errors.push({
        target: `${column.table_schema}.${column.table_name}.${column.column_name}`,
        error: error.message,
      })
    }
  }

  return { findings, errors, columnsScanned: columns.length }
}

export async function applyDateNulls(prisma, findings, options = {}) {
  if (!applyEnabled(options)) {
    return { applied: 0, skipped: findings.filter((finding) => finding.canNull).length }
  }

  const execute = async (client) => {
    const applied = []
    for (const finding of findings.filter((item) => item.canNull)) {
      const [schema, table] = finding.table.split('.')
      const sql = q(`
        UPDATE ${qualifiedTable(schema, table)}
        SET ${ident(finding.column)} = NULL
        WHERE id = $1
          AND ${ident(finding.column)} IS NOT NULL
      `)
      await client.$executeRawUnsafe(sql, finding.id)
      applied.push({ table: finding.table, column: finding.column, id: finding.id })
    }
    return applied
  }

  const applied = typeof prisma.$transaction === 'function'
    ? await prisma.$transaction((tx) => execute(tx))
    : await execute(prisma)

  return { applied: applied.length, rows: applied }
}

export function summarize(result) {
  const dateKinds = {}
  for (const finding of result.dates.findings) {
    dateKinds[finding.kind] = (dateKinds[finding.kind] || 0) + 1
  }

  return {
    stockNegativo: result.stock.findings.length,
    fechasAnomalas: result.dates.findings.length,
    fechasPorTipo: dateKinds,
    stockErrors: result.stock.errors.length,
    dateErrors: result.dates.errors.length,
    dateColumnsScanned: result.dates.columnsScanned,
    dateNullsApplied: result.applyResult?.applied ?? 0,
  }
}

export function formatTextReport(result, options = {}) {
  const summary = summarize(result)
  const lines = []
  const mode = applyEnabled(options) ? 'apply fechas centinela nullable confirmado' : 'dry-run sin cambios'
  lines.push('')
  lines.push(`=== Plastimar ERP stock negativo y fechas anomalas (${mode}) ===`)
  lines.push('')
  lines.push(`Modo: ${mode}`)
  lines.push(`Stock negativo: ${summary.stockNegativo}`)
  lines.push(`Fechas anomalas: ${summary.fechasAnomalas} | columnas escaneadas=${summary.dateColumnsScanned}`)
  lines.push(`Tipos fecha: ${Object.entries(summary.fechasPorTipo).map(([key, count]) => `${key}=${count}`).join(' ') || 'none'}`)

  if (result.stock.findings.length) {
    lines.push('')
    lines.push('Plan de revision - stock negativo:')
    for (const item of result.stock.findings) {
      lines.push(`- ${item.target} id=${item.id} codigo=${item.codigo ?? '(sin codigo)'} nombre=${item.nombre ?? '(sin nombre)'} stock=${item.stock}`)
      lines.push(`  ultima_evidencia=${JSON.stringify(item.ultimaEvidencia)}`)
      lines.push(`  recomendacion=${item.recomendacionManual}`)
    }
  }

  if (result.dates.findings.length) {
    lines.push('')
    lines.push('Plan de revision - fechas anomalas:')
    for (const item of result.dates.findings) {
      lines.push(`- ${item.table}.${item.column} id=${item.id} value=${item.value} tipo=${item.kind} nullable=${item.nullable}`)
      lines.push(`  recomendacion=${item.recommendation}`)
    }
  }

  const errors = [...result.stock.errors, ...result.dates.errors]
  if (errors.length) {
    lines.push('')
    lines.push('Errores de ejecucion:')
    for (const error of errors) lines.push(`- ${error.target}: ${error.error}`)
  }

  if (!applyEnabled(options)) {
    lines.push('')
    lines.push('Seguridad: este reporte no modifica stock ni fechas. Para NULL en centinelas nullable use --apply --confirm=APPLY_DATE_NULLS.')
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

async function main() {
  const options = parseArgs()
  readLocalEnv()

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required. Set it in the environment or backend/.env.')
    process.exit(2)
  }

  if (options.apply && !applyEnabled(options)) {
    console.error(`--apply requires --confirm=${APPLY_CONFIRMATION}. No changes were made.`)
    process.exit(2)
  }

  const prisma = await createPrisma()
  try {
    const result = {
      stock: options.includeStock ? await collectStockFindings(prisma, options) : { findings: [], errors: [] },
      dates: options.includeDates ? await collectDateFindings(prisma, options) : { findings: [], errors: [], columnsScanned: 0 },
      applyResult: null,
    }
    result.applyResult = await applyDateNulls(prisma, result.dates.findings, options)

    if (options.json) {
      console.log(JSON.stringify({ summary: summarize(result), result }, null, 2))
    } else {
      console.log(formatTextReport(result, options))
    }

    process.exitCode = result.stock.errors.length || result.dates.errors.length ? 2 : 0
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
