import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const RUT_SQL_NORMALIZED = (column) => `regexp_replace(upper(trim(COALESCE(${column}, ''))), '[^0-9K]', '', 'g')`

export const CLEANUP_CRITERIA = {
  normalized: 'Uppercase RUT with every character except digits and K removed.',
  placeholders: 'NULL, blank, values that normalize to blank, and values that normalize to only zeroes such as 000000000.',
  invalid: 'Non-placeholder values that do not pass Chilean RUT shape and check digit validation.',
  realDuplicate: 'Valid normalized RUT present in more than one row of the same table.',
  safeFormatOnly: 'Valid normalized RUT present once in the table, where only punctuation/case format differs from canonical form.',
  apply: '--apply only updates safeFormatOnly rows and rechecks that no normalized collision exists before each UPDATE.',
}

export const ENTITY_CONFIGS = {
  clientes: {
    entity: 'clientes',
    table: 'clientes.clientes',
    idColumn: 'id',
    rutColumn: 'rut',
    nameFields: ['razonSocial', 'nombre'],
    selectSql: `
      WITH base AS (
        SELECT
          c.id,
          c.rut,
          c.nombre,
          c.razon_social AS "razonSocial",
          c.activo,
          ${RUT_SQL_NORMALIZED('c.rut')} AS normalized_rut
        FROM clientes.clientes c
      ),
      ventas_id AS (
        SELECT o.cliente_id AS id, count(*)::int AS row_count
        FROM ventas.ordenes o
        WHERE o.cliente_id IS NOT NULL
        GROUP BY o.cliente_id
      ),
      ventas_rut AS (
        SELECT normalized_rut, count(*)::int AS row_count
        FROM (
          SELECT ${RUT_SQL_NORMALIZED('o.rut_cliente')} AS normalized_rut
          FROM ventas.ordenes o
        ) x
        WHERE normalized_rut <> '' AND normalized_rut !~ '^0+$'
        GROUP BY normalized_rut
      ),
      cobranza_rut AS (
        SELECT normalized_rut, count(*)::int AS row_count
        FROM (
          SELECT ${RUT_SQL_NORMALIZED('ch.rut')} AS normalized_rut
          FROM ventas.cobranza_historico ch
        ) x
        WHERE normalized_rut <> '' AND normalized_rut !~ '^0+$'
        GROUP BY normalized_rut
      ),
      odt_id AS (
        SELECT o.cliente_id AS id, count(*)::int AS row_count
        FROM taller.odts t
        JOIN ventas.ordenes o ON o.id = t.orden_id
        WHERE o.cliente_id IS NOT NULL
        GROUP BY o.cliente_id
      ),
      odt_rut AS (
        SELECT normalized_rut, count(*)::int AS row_count
        FROM (
          SELECT ${RUT_SQL_NORMALIZED('o.rut_cliente')} AS normalized_rut
          FROM taller.odts t
          JOIN ventas.ordenes o ON o.id = t.orden_id
        ) x
        WHERE normalized_rut <> '' AND normalized_rut !~ '^0+$'
        GROUP BY normalized_rut
      )
      SELECT
        b.id,
        b.rut,
        b.nombre,
        b."razonSocial",
        b.activo,
        COALESCE(v_id.row_count, 0)::int AS "ventasByIdCount",
        COALESCE(v_rut.row_count, 0)::int AS "ventasByRutCount",
        COALESCE(cob.row_count, 0)::int AS "cobranzaByRutCount",
        COALESCE(odt_id.row_count, 0)::int AS "odtByClienteIdCount",
        COALESCE(odt_rut.row_count, 0)::int AS "odtByRutCount"
      FROM base b
      LEFT JOIN ventas_id v_id ON v_id.id = b.id
      LEFT JOIN ventas_rut v_rut ON v_rut.normalized_rut = b.normalized_rut
      LEFT JOIN cobranza_rut cob ON cob.normalized_rut = b.normalized_rut
      LEFT JOIN odt_id ON odt_id.id = b.id
      LEFT JOIN odt_rut ON odt_rut.normalized_rut = b.normalized_rut
      ORDER BY b.id
    `,
  },
  proveedores: {
    entity: 'proveedores',
    table: 'catalogo.proveedores',
    idColumn: 'id',
    rutColumn: 'rut',
    nameFields: ['razonSocial', 'nombre'],
    selectSql: `
      WITH pagos_id AS (
        SELECT pp.proveedor_id AS id, count(*)::int AS row_count
        FROM catalogo.pagos_proveedores pp
        WHERE pp.proveedor_id IS NOT NULL
        GROUP BY pp.proveedor_id
      ),
      pagos_codigo AS (
        SELECT pp.codigo_proveedor, count(*)::int AS row_count
        FROM catalogo.pagos_proveedores pp
        WHERE pp.codigo_proveedor IS NOT NULL
        GROUP BY pp.codigo_proveedor
      ),
      productos_proveedor AS (
        SELECT pr.proveedor_id AS id, count(*)::int AS row_count
        FROM catalogo.productos pr
        WHERE pr.proveedor_id IS NOT NULL
        GROUP BY pr.proveedor_id
      )
      SELECT
        p.id,
        p.rut,
        p.nombre,
        p.razon_social AS "razonSocial",
        p.codigo_proveedor AS "codigoProveedor",
        p.activo,
        COALESCE(pagos_id.row_count, 0)::int AS "pagosProveedorByIdCount",
        COALESCE(pagos_codigo.row_count, 0)::int AS "pagosProveedorByCodigoCount",
        COALESCE(productos.row_count, 0)::int AS "productosProveedorCount"
      FROM catalogo.proveedores p
      LEFT JOIN pagos_id ON pagos_id.id = p.id
      LEFT JOIN pagos_codigo ON pagos_codigo.codigo_proveedor = p.codigo_proveedor
      LEFT JOIN productos_proveedor productos ON productos.id = p.id
      ORDER BY p.id
    `,
  },
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

export function normalizeRut(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^0-9K]/g, '')
}

export function isPlaceholderNormalizedRut(normalized) {
  return normalized === '' || /^0+$/.test(normalized)
}

export function rutCheckDigit(body) {
  let factor = 2
  let sum = 0
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const value = 11 - (sum % 11)
  if (value === 11) return '0'
  if (value === 10) return 'K'
  return String(value)
}

export function isValidNormalizedRut(normalized) {
  if (!/^\d{1,8}[0-9K]$/.test(normalized)) return false
  const body = normalized.slice(0, -1)
  const dv = normalized.slice(-1)
  if (/^0+$/.test(body)) return false
  return rutCheckDigit(body) === dv
}

export function formatNormalizedRut(normalized) {
  if (!/^\d{1,8}[0-9K]$/.test(normalized)) return null
  const body = normalized.slice(0, -1)
  const dv = normalized.slice(-1)
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formattedBody}-${dv}`
}

export function classifyRutValue(value) {
  const raw = value == null ? null : String(value)
  const normalizedRut = normalizeRut(raw)
  if (raw == null || raw.trim() === '' || normalizedRut === '') {
    return {
      raw,
      normalizedRut,
      canonicalRut: null,
      isPlaceholder: true,
      isValid: false,
      classification: 'placeholder_empty',
      action: 'manual_placeholder',
      applyEligible: false,
    }
  }
  if (/^0+$/.test(normalizedRut)) {
    return {
      raw,
      normalizedRut,
      canonicalRut: null,
      isPlaceholder: true,
      isValid: false,
      classification: 'placeholder_zero',
      action: 'manual_placeholder',
      applyEligible: false,
    }
  }
  const canonicalRut = formatNormalizedRut(normalizedRut)
  const isValid = isValidNormalizedRut(normalizedRut)
  return {
    raw,
    normalizedRut,
    canonicalRut,
    isPlaceholder: false,
    isValid,
    classification: isValid ? 'valid' : 'invalid',
    action: isValid ? 'none' : 'manual_validate_rut',
    applyEligible: false,
  }
}

function displayName(record, fields = []) {
  for (const field of fields) {
    const value = record[field]
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function compareIds(a, b) {
  return Number(a.id) - Number(b.id)
}

function groupRecords(records, config) {
  const validByRut = new Map()
  const placeholders = new Map()
  const invalid = new Map()

  for (const record of records) {
    const rutInfo = classifyRutValue(record.rut)
    const enriched = {
      ...toPlain(record),
      name: displayName(record, config.nameFields),
      rutInfo,
    }

    if (rutInfo.isPlaceholder) {
      const key = rutInfo.classification
      if (!placeholders.has(key)) placeholders.set(key, [])
      placeholders.get(key).push(enriched)
    } else if (!rutInfo.isValid) {
      const key = rutInfo.normalizedRut || 'invalid'
      if (!invalid.has(key)) invalid.set(key, [])
      invalid.get(key).push(enriched)
    } else {
      const key = rutInfo.normalizedRut
      if (!validByRut.has(key)) validByRut.set(key, [])
      validByRut.get(key).push(enriched)
    }
  }

  return { validByRut, placeholders, invalid }
}

function recordForPlan(record, overrides = {}) {
  const { rutInfo, ...plainRecord } = record
  return {
    ...plainRecord,
    normalizedRut: rutInfo.normalizedRut,
    canonicalRut: rutInfo.canonicalRut,
    rawRut: rutInfo.raw,
    ...overrides,
  }
}

function makeGroup({ entity, sequence, classification, action, records, normalizedRut = '', canonicalRut = null, applyEligible = false }) {
  const sortedRecords = [...records].sort(compareIds)
  const groupId = `${entity}-${String(sequence).padStart(4, '0')}`
  return {
    groupId,
    entity,
    classification,
    action,
    normalizedRut,
    canonicalRut,
    recordCount: sortedRecords.length,
    ids: sortedRecords.map((record) => record.id),
    names: sortedRecords.map((record) => record.name).filter(Boolean),
    applyEligible,
    records: sortedRecords.map((record) => recordForPlan(record, { applyEligible })),
  }
}

export function buildRutCleanupPlan(entity, records, config = ENTITY_CONFIGS[entity]) {
  if (!config) throw new Error(`Unknown RUT cleanup entity: ${entity}`)
  const { validByRut, placeholders, invalid } = groupRecords(records, config)
  const groups = []
  let sequence = 1

  for (const [classification, group] of [...placeholders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    groups.push(makeGroup({
      entity,
      sequence: sequence++,
      classification,
      action: 'manual_placeholder',
      records: group,
    }))
  }

  for (const [normalizedRut, group] of [...invalid.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    groups.push(makeGroup({
      entity,
      sequence: sequence++,
      classification: 'invalid',
      action: 'manual_validate_rut',
      records: group,
      normalizedRut,
      canonicalRut: formatNormalizedRut(normalizedRut),
    }))
  }

  for (const [normalizedRut, group] of [...validByRut.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const canonicalRut = formatNormalizedRut(normalizedRut)
    if (group.length > 1) {
      groups.push(makeGroup({
        entity,
        sequence: sequence++,
        classification: 'real_duplicate',
        action: 'manual_review_duplicate',
        records: group,
        normalizedRut,
        canonicalRut,
      }))
      continue
    }

    const [record] = group
    if (record.rutInfo.raw !== canonicalRut) {
      groups.push(makeGroup({
        entity,
        sequence: sequence++,
        classification: 'safe_format_only',
        action: 'safe_format_update',
        records: group,
        normalizedRut,
        canonicalRut,
        applyEligible: true,
      }))
    }
  }

  const summary = summarizeGroups(groups, records.length)
  return { entity, criteria: CLEANUP_CRITERIA, summary, groups }
}

export function summarizeGroups(groups, totalRows = 0) {
  const byClassification = {}
  const byAction = {}
  let affectedRows = 0
  let applyEligibleRows = 0
  for (const group of groups) {
    byClassification[group.classification] = (byClassification[group.classification] || 0) + group.recordCount
    byAction[group.action] = (byAction[group.action] || 0) + group.recordCount
    affectedRows += group.recordCount
    if (group.applyEligible) applyEligibleRows += group.recordCount
  }
  return {
    totalRows,
    groups: groups.length,
    affectedRows,
    applyEligibleRows,
    byClassification,
    byAction,
  }
}

function csvCell(value) {
  if (value == null) return ''
  const text = Array.isArray(value) ? value.join('|') : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function planToCsv(plans) {
  const headers = [
    'entity',
    'group_id',
    'classification',
    'action',
    'normalized_rut',
    'canonical_rut',
    'record_count',
    'id',
    'raw_rut',
    'name',
    'ventas_by_id_count',
    'ventas_by_rut_count',
    'cobranza_by_rut_count',
    'odt_by_cliente_id_count',
    'odt_by_rut_count',
    'pagos_proveedor_by_id_count',
    'pagos_proveedor_by_codigo_count',
    'productos_proveedor_count',
    'apply_eligible',
  ]
  const lines = [headers.join(',')]
  for (const plan of plans) {
    for (const group of plan.groups) {
      for (const record of group.records) {
        lines.push([
          group.entity,
          group.groupId,
          group.classification,
          group.action,
          group.normalizedRut,
          group.canonicalRut,
          group.recordCount,
          record.id,
          record.rawRut,
          record.name,
          record.ventasByIdCount,
          record.ventasByRutCount,
          record.cobranzaByRutCount,
          record.odtByClienteIdCount,
          record.odtByRutCount,
          record.pagosProveedorByIdCount,
          record.pagosProveedorByCodigoCount,
          record.productosProveedorCount,
          record.applyEligible,
        ].map(csvCell).join(','))
      }
    }
  }
  return `${lines.join('\n')}\n`
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    entity: 'all',
    json: false,
    csv: false,
    out: null,
    apply: false,
    help: false,
  }

  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg === '--csv') options.csv = true
    else if (arg === '--apply') options.apply = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length)
    else if (arg.startsWith('--entity=')) {
      const value = arg.slice('--entity='.length)
      if (['all', ...Object.keys(ENTITY_CONFIGS)].includes(value)) options.entity = value
    }
  }

  return options
}

function selectedConfigs(entity) {
  if (entity === 'all') return Object.values(ENTITY_CONFIGS)
  return [ENTITY_CONFIGS[entity]]
}

async function createPrisma() {
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import('@prisma/client'),
    import('@prisma/adapter-pg'),
  ])
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

async function loadEntityRecords(prisma, config) {
  const rows = await prisma.$queryRawUnsafe(config.selectSql)
  return rows.map(toPlain)
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlInt(value) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`Unsafe integer value: ${value}`)
  return String(parsed)
}

async function applySafeFormatUpdates(prisma, config, plan) {
  const results = []
  for (const group of plan.groups.filter((item) => item.applyEligible && item.action === 'safe_format_update')) {
    const [record] = group.records
    const normalized = sqlLiteral(group.normalizedRut)
    const canonical = sqlLiteral(group.canonicalRut)
    const id = sqlInt(record.id)
    const sql = `
      UPDATE ${config.table} target
      SET ${config.rutColumn} = ${canonical}
      WHERE target.${config.idColumn} = ${id}
        AND target.${config.rutColumn} IS DISTINCT FROM ${canonical}
        AND ${RUT_SQL_NORMALIZED(`target.${config.rutColumn}`)} = ${normalized}
        AND NOT EXISTS (
          SELECT 1
          FROM ${config.table} other
          WHERE other.${config.idColumn} <> target.${config.idColumn}
            AND ${RUT_SQL_NORMALIZED(`other.${config.rutColumn}`)} = ${normalized}
        )
    `
    const updated = await prisma.$executeRawUnsafe(sql)
    results.push({
      entity: config.entity,
      groupId: group.groupId,
      id: record.id,
      from: record.rawRut,
      to: group.canonicalRut,
      updated: Number(updated),
    })
  }
  return results
}

function combineSummary(plans) {
  const summary = {
    entities: plans.length,
    totalRows: 0,
    groups: 0,
    affectedRows: 0,
    applyEligibleRows: 0,
    byClassification: {},
    byAction: {},
  }
  for (const plan of plans) {
    summary.totalRows += plan.summary.totalRows
    summary.groups += plan.summary.groups
    summary.affectedRows += plan.summary.affectedRows
    summary.applyEligibleRows += plan.summary.applyEligibleRows
    for (const [key, value] of Object.entries(plan.summary.byClassification)) {
      summary.byClassification[key] = (summary.byClassification[key] || 0) + value
    }
    for (const [key, value] of Object.entries(plan.summary.byAction)) {
      summary.byAction[key] = (summary.byAction[key] || 0) + value
    }
  }
  return summary
}

export function formatTextReport(report) {
  const lines = []
  lines.push('')
  lines.push(`=== Plastimar ERP RUT duplicate cleanup (${report.mode}) ===`)
  lines.push('')
  lines.push(`Entities: ${report.summary.entities}`)
  lines.push(`Rows scanned: ${report.summary.totalRows}`)
  lines.push(`Problem groups: ${report.summary.groups}`)
  lines.push(`Affected rows: ${report.summary.affectedRows}`)
  lines.push(`Apply-eligible format-only rows: ${report.summary.applyEligibleRows}`)
  lines.push(`Classifications: ${JSON.stringify(report.summary.byClassification)}`)
  lines.push('')
  lines.push('Criteria:')
  for (const [key, value] of Object.entries(CLEANUP_CRITERIA)) {
    lines.push(`- ${key}: ${value}`)
  }

  for (const plan of report.entities) {
    lines.push('')
    lines.push(`[${plan.entity}] groups=${plan.summary.groups} affected_rows=${plan.summary.affectedRows}`)
    for (const group of plan.groups) {
      lines.push(`- ${group.groupId} ${group.classification} ${group.action} rows=${group.recordCount} rut=${group.normalizedRut || '(none)'}`)
      const sample = group.records.slice(0, 5).map((record) => `${record.id}:${record.rawRut || ''}:${record.name || ''}`).join(' | ')
      if (sample) lines.push(`  sample ${sample}`)
    }
  }

  if (report.applyResults?.length) {
    lines.push('')
    lines.push(`Applied updates: ${report.applyResults.reduce((sum, item) => sum + item.updated, 0)}`)
    for (const result of report.applyResults) {
      lines.push(`- ${result.entity} id=${result.id} ${result.from} -> ${result.to} updated=${result.updated}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

function usage() {
  return `
Usage:
  node scripts/rut-duplicates-cleanup.mjs [--entity=all|clientes|proveedores] [--json|--csv] [--out=path] [--apply]

Default mode is dry-run text report. --apply only formats unique valid RUTs that cannot collide after normalization.
`
}

function writeOutput(outPath, content) {
  if (!outPath) {
    process.stdout.write(content)
    return
  }
  mkdirSync(dirname(resolve(outPath)), { recursive: true })
  writeFileSync(outPath, content)
  console.log(`Wrote ${outPath}`)
}

async function main() {
  const options = parseArgs()
  if (options.help) {
    process.stdout.write(usage())
    return
  }
  if (options.json && options.csv) {
    throw new Error('Use only one output format: --json or --csv.')
  }

  readLocalEnv()
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Set it in the environment or backend/.env.')
  }

  const prisma = await createPrisma()
  try {
    const plans = []
    const applyResults = []
    for (const config of selectedConfigs(options.entity)) {
      const records = await loadEntityRecords(prisma, config)
      const plan = buildRutCleanupPlan(config.entity, records, config)
      plans.push(plan)
      if (options.apply) {
        applyResults.push(...await applySafeFormatUpdates(prisma, config, plan))
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: options.apply ? 'apply-format-only' : 'dry-run',
      criteria: CLEANUP_CRITERIA,
      summary: combineSummary(plans),
      entities: plans,
      applyResults,
    }

    if (options.csv) writeOutput(options.out, planToCsv(plans))
    else if (options.json) writeOutput(options.out, `${JSON.stringify(report, null, 2)}\n`)
    else writeOutput(options.out, formatTextReport(report))
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
