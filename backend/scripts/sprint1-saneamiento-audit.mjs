import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 200

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

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    limit: DEFAULT_LIMIT,
    out: '',
    includeSql: false,
  }

  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg === '--include-sql') options.includeSql = true
    else if (arg.startsWith('--limit=')) {
      const raw = Number(arg.slice('--limit='.length))
      if (Number.isInteger(raw) && raw > 0) options.limit = Math.min(raw, MAX_LIMIT)
    } else if (arg.startsWith('--out=')) {
      options.out = arg.slice('--out='.length)
    }
  }

  return options
}

async function createPrisma() {
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import('@prisma/client'),
    import('@prisma/adapter-pg'),
  ])
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

async function queryOne(prisma, sql) {
  const rows = await prisma.$queryRawUnsafe(sql)
  return toPlain(rows[0] ?? {})
}

async function queryRows(prisma, sql) {
  const rows = await prisma.$queryRawUnsafe(sql)
  return rows.map(toPlain)
}

const productOrphansSql = q(`
  WITH product_codes AS (
    SELECT
      upper(trim(codigo_interno)) AS normalized_code,
      count(*)::int AS match_count,
      min(id)::int AS matched_producto_id
    FROM catalogo.productos
    WHERE codigo_interno IS NOT NULL AND trim(codigo_interno) <> ''
    GROUP BY upper(trim(codigo_interno))
  ),
  orphaned AS (
    SELECT
      'ventas.orden_items' AS source_table,
      i.id,
      i.producto_id,
      i.codigo_interno,
      upper(trim(coalesce(i.codigo_interno, ''))) AS normalized_code,
      pc.match_count,
      pc.matched_producto_id
    FROM ventas.orden_items i
    LEFT JOIN product_codes pc ON pc.normalized_code = upper(trim(coalesce(i.codigo_interno, '')))
    WHERE i.producto_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = i.producto_id)
    UNION ALL
    SELECT
      'taller.odt_items' AS source_table,
      i.id,
      i.producto_id,
      i.codigo_interno,
      upper(trim(coalesce(i.codigo_interno, ''))) AS normalized_code,
      pc.match_count,
      pc.matched_producto_id
    FROM taller.odt_items i
    LEFT JOIN product_codes pc ON pc.normalized_code = upper(trim(coalesce(i.codigo_interno, '')))
    WHERE i.producto_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = i.producto_id)
  )
  SELECT
    source_table,
    count(*)::int AS total,
    count(*) FILTER (WHERE normalized_code = '')::int AS missing_code,
    count(*) FILTER (WHERE normalized_code <> '' AND match_count = 1)::int AS exact_code_match,
    count(*) FILTER (WHERE normalized_code <> '' AND match_count > 1)::int AS ambiguous_code_match,
    count(*) FILTER (WHERE normalized_code <> '' AND match_count IS NULL)::int AS no_catalog_match
  FROM orphaned
  GROUP BY source_table
  ORDER BY source_table
`)

const productOrphanSampleSql = (limit) => q(`
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
  ),
  orphaned AS (
    SELECT
      'ventas.orden_items' AS source_table,
      i.id,
      i.orden_id AS parent_id,
      i.producto_id,
      i.codigo_interno,
      i.nombre,
      i.cantidad,
      upper(trim(coalesce(i.codigo_interno, ''))) AS normalized_code,
      pc.match_count,
      pc.matched_producto_id,
      pc.matched_codigo_interno,
      pc.matched_nombre
    FROM ventas.orden_items i
    LEFT JOIN product_codes pc ON pc.normalized_code = upper(trim(coalesce(i.codigo_interno, '')))
    WHERE i.producto_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = i.producto_id)
    UNION ALL
    SELECT
      'taller.odt_items' AS source_table,
      i.id,
      i.odt_id AS parent_id,
      i.producto_id,
      i.codigo_interno,
      i.nombre,
      i.cantidad,
      upper(trim(coalesce(i.codigo_interno, ''))) AS normalized_code,
      pc.match_count,
      pc.matched_producto_id,
      pc.matched_codigo_interno,
      pc.matched_nombre
    FROM taller.odt_items i
    LEFT JOIN product_codes pc ON pc.normalized_code = upper(trim(coalesce(i.codigo_interno, '')))
    WHERE i.producto_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM catalogo.productos p WHERE p.id = i.producto_id)
  )
  SELECT *
  FROM orphaned
  ORDER BY source_table, id
  LIMIT ${Number(limit)}
`)

const negativePriceSql = q(`
  SELECT
    count(*)::int AS total,
    min(precio_unitario)::float8 AS min_precio,
    max(precio_unitario)::float8 AS max_precio,
    count(DISTINCT orden_id)::int AS ordenes_afectadas
  FROM ventas.orden_items
  WHERE precio_unitario < 0
`)

const negativePriceSampleSql = (limit) => q(`
  SELECT id, orden_id, producto_id, codigo_interno, nombre, cantidad, precio_unitario
  FROM ventas.orden_items
  WHERE precio_unitario < 0
  ORDER BY precio_unitario ASC, id
  LIMIT ${Number(limit)}
`)

const clienteRutMismatchSql = q(`
  WITH client_keys AS (
    SELECT
      id,
      rut,
      regexp_replace(upper(trim(rut)), '[^0-9K]', '', 'g') AS rut_norm
    FROM clientes.clientes
  ),
  unique_client_by_rut AS (
    SELECT rut_norm, count(*)::int AS matches, min(id)::int AS target_cliente_id
    FROM client_keys
    WHERE rut_norm <> ''
    GROUP BY rut_norm
  ),
  mismatches AS (
    SELECT
      o.id,
      o.n_interno,
      o.cliente_id,
      c.rut AS cliente_rut,
      o.rut_cliente,
      regexp_replace(upper(trim(coalesce(o.rut_cliente, ''))), '[^0-9K]', '', 'g') AS orden_rut_norm,
      c.rut_norm AS cliente_rut_norm,
      u.matches AS target_matches,
      u.target_cliente_id
    FROM ventas.ordenes o
    JOIN client_keys c ON c.id = o.cliente_id
    LEFT JOIN unique_client_by_rut u ON u.rut_norm = regexp_replace(upper(trim(coalesce(o.rut_cliente, ''))), '[^0-9K]', '', 'g')
    WHERE o.rut_cliente IS NOT NULL
      AND trim(o.rut_cliente) <> ''
      AND regexp_replace(upper(trim(coalesce(o.rut_cliente, ''))), '[^0-9K]', '', 'g') <> ''
      AND c.rut_norm <> ''
      AND regexp_replace(upper(trim(coalesce(o.rut_cliente, ''))), '[^0-9K]', '', 'g') <> c.rut_norm
  )
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE target_matches = 1 AND target_cliente_id <> cliente_id)::int AS safe_exact_rut_candidate,
    count(*) FILTER (WHERE target_matches > 1)::int AS ambiguous_rut_target,
    count(*) FILTER (WHERE target_matches IS NULL)::int AS no_rut_target,
    count(DISTINCT cliente_id)::int AS current_clientes_afectados,
    count(DISTINCT target_cliente_id) FILTER (WHERE target_matches = 1)::int AS target_clientes_afectados
  FROM mismatches
`)

const clienteRutMismatchSampleSql = (limit) => q(`
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
    WHERE rut_norm <> ''
    GROUP BY rut_norm
  )
  SELECT
    o.id,
    o.n_interno,
    o.cliente_id,
    c.nombre AS cliente_actual,
    c.rut AS rut_actual,
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

const guiasFechasSql = q(`
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE fecha_guia < TIMESTAMP '2000-01-01')::int AS pre_2000,
    count(*) FILTER (WHERE fecha_guia::date = DATE '1970-01-01')::int AS epoch_1970,
    count(*) FILTER (WHERE fecha_guia > now() + INTERVAL '1 year')::int AS future_gt_1y,
    count(*) FILTER (WHERE fecha_guia::date = DATE '1970-01-01' AND orden_id IS NOT NULL)::int AS epoch_with_orden_id,
    count(*) FILTER (
      WHERE fecha_guia::date = DATE '1970-01-01'
        AND orden_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM ventas.ordenes o
          WHERE o.id = bodega.guias_despachos.orden_id
            AND o.created_at >= TIMESTAMP '2000-01-01'
            AND o.created_at <= now() + INTERVAL '1 year'
        )
    )::int AS epoch_can_derive_from_orden_created_at,
    count(*) FILTER (
      WHERE fecha_guia::date = DATE '1970-01-01'
        AND created_at >= TIMESTAMP '2000-01-01'
        AND created_at <= now() + INTERVAL '1 year'
    )::int AS epoch_can_derive_from_guia_created_at
  FROM bodega.guias_despachos
`)

const guiasDuplicadasSql = q(`
  SELECT
    count(*)::int AS duplicate_groups,
    coalesce(sum(rows - 1), 0)::int AS duplicate_extra_rows,
    coalesce(max(rows), 0)::int AS max_rows_in_group
  FROM (
    SELECT n_guia, count(*)::int AS rows
    FROM bodega.guias_despachos
    WHERE n_guia IS NOT NULL AND trim(n_guia) <> ''
    GROUP BY n_guia
    HAVING count(*) > 1
  ) dup
`)

const guiasSampleSql = (limit) => q(`
  SELECT g.id, g.orden_id, g.n_interno, g.n_guia, g.fecha_guia, g.created_at, o.created_at AS orden_created_at
  FROM bodega.guias_despachos g
  LEFT JOIN ventas.ordenes o ON o.id = g.orden_id
  WHERE g.fecha_guia < TIMESTAMP '2000-01-01'
     OR g.fecha_guia > now() + INTERVAL '1 year'
  ORDER BY g.fecha_guia, g.id
  LIMIT ${Number(limit)}
`)

const bitacoraSql = q(`
  WITH extracted AS (
    SELECT
      b.id,
      b.odt_id,
      b.fecha,
      substring(b.texto from '([0-9]{4,6})')::int AS possible_n_interno
    FROM taller.bitacora_taller b
    WHERE b.odt_id IS NULL
  ),
  candidates AS (
    SELECT e.id, count(o.id)::int AS odt_matches
    FROM extracted e
    JOIN ventas.ordenes ord ON ord.n_interno = e.possible_n_interno
    JOIN taller.odts o ON o.orden_id = ord.id
    WHERE e.possible_n_interno IS NOT NULL
    GROUP BY e.id
  )
  SELECT
    (SELECT count(*)::int FROM taller.bitacora_taller) AS total,
    (SELECT count(*)::int FROM taller.bitacora_taller WHERE odt_id IS NULL) AS sin_odt_id,
    (SELECT count(*)::int FROM taller.bitacora_taller WHERE fecha IS NULL) AS sin_fecha,
    (SELECT count(*)::int FROM extracted WHERE possible_n_interno IS NOT NULL) AS texto_con_numero_4_6,
    (SELECT count(*)::int FROM candidates WHERE odt_matches = 1) AS weak_unique_odt_candidate,
    (SELECT count(*)::int FROM candidates WHERE odt_matches > 1) AS weak_ambiguous_odt_candidate
`)

const bitacoraSampleSql = (limit) => q(`
  SELECT id, odt_id, fecha, usuario, usuario_reporta, left(texto, 220) AS texto_preview
  FROM taller.bitacora_taller
  WHERE odt_id IS NULL
  ORDER BY id
  LIMIT ${Number(limit)}
`)

async function buildReport(prisma, options) {
  const [
    productOrphans,
    productOrphanSamples,
    negativePrices,
    negativePriceSamples,
    clienteRutMismatch,
    clienteRutMismatchSamples,
    guiasFechas,
    guiasDuplicadas,
    guiasSamples,
    bitacora,
    bitacoraSamples,
  ] = await Promise.all([
    queryRows(prisma, productOrphansSql),
    queryRows(prisma, productOrphanSampleSql(options.limit)),
    queryOne(prisma, negativePriceSql),
    queryRows(prisma, negativePriceSampleSql(options.limit)),
    queryOne(prisma, clienteRutMismatchSql),
    queryRows(prisma, clienteRutMismatchSampleSql(options.limit)),
    queryOne(prisma, guiasFechasSql),
    queryOne(prisma, guiasDuplicadasSql),
    queryRows(prisma, guiasSampleSql(options.limit)),
    queryOne(prisma, bitacoraSql),
    queryRows(prisma, bitacoraSampleSql(options.limit)),
  ])

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run-read-only',
    limit: options.limit,
    checks: {
      productOrphans,
      negativePrices,
      clienteRutMismatch,
      guiasFechas,
      guiasDuplicadas,
      bitacora,
    },
    samples: {
      productOrphans: productOrphanSamples,
      negativePrices: negativePriceSamples,
      clienteRutMismatch: clienteRutMismatchSamples,
      guiasFechas: guiasSamples,
      bitacora: bitacoraSamples,
    },
    recommendations: [
      'Fix producto_id huerfano only where normalized codigo_interno has one catalog match.',
      'Do not auto-fix negative prices without business confirmation: they may be returns or legacy corrections.',
      'Do not set guia fecha_guia to NULL until schema allows it; current production column is NOT NULL.',
      'Treat bitacora odt_id backfill as unsafe until a reliable legacy key is available.',
      'Reassign ordenes.cliente_id by rut only for single-target normalized RUT candidates, with an audit table and rollback SQL.',
    ],
  }

  if (options.includeSql) {
    report.sql = {
      productOrphansSql,
      negativePriceSql,
      clienteRutMismatchSql,
      guiasFechasSql,
      guiasDuplicadasSql,
      bitacoraSql,
    }
  }

  return report
}

function sumProductOrphans(rows, column) {
  return rows.reduce((sum, row) => sum + Number(row[column] || 0), 0)
}

function formatText(report) {
  const { checks } = report
  const productTotal = sumProductOrphans(checks.productOrphans, 'total')
  const productSafe = sumProductOrphans(checks.productOrphans, 'exact_code_match')
  const productManual = productTotal - productSafe
  const lines = []

  lines.push('')
  lines.push('=== Sprint 1 saneamiento audit (DRY RUN / read-only) ===')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push('')
  lines.push(`Producto huerfanos: total=${productTotal} exact_code_match=${productSafe} manual=${productManual}`)
  for (const row of checks.productOrphans) {
    lines.push(`- ${row.source_table}: total=${row.total} exact=${row.exact_code_match} no_match=${row.no_catalog_match} ambiguous=${row.ambiguous_code_match} missing_code=${row.missing_code}`)
  }
  lines.push(`Precios negativos en ventas.orden_items: total=${checks.negativePrices.total} ordenes=${checks.negativePrices.ordenes_afectadas} min=${checks.negativePrices.min_precio}`)
  lines.push(`Ordenes con RUT distinto al cliente_id: total=${checks.clienteRutMismatch.total} safe_rut_candidate=${checks.clienteRutMismatch.safe_exact_rut_candidate} ambiguous=${checks.clienteRutMismatch.ambiguous_rut_target} no_target=${checks.clienteRutMismatch.no_rut_target}`)
  lines.push(`Guias fecha anomala: pre_2000=${checks.guiasFechas.pre_2000} epoch_1970=${checks.guiasFechas.epoch_1970} future=${checks.guiasFechas.future_gt_1y}`)
  lines.push(`Guias duplicadas por n_guia: groups=${checks.guiasDuplicadas.duplicate_groups} extra_rows=${checks.guiasDuplicadas.duplicate_extra_rows} max_group=${checks.guiasDuplicadas.max_rows_in_group}`)
  lines.push(`Bitacora taller: total=${checks.bitacora.total} sin_odt_id=${checks.bitacora.sin_odt_id} sin_fecha=${checks.bitacora.sin_fecha} weak_unique_candidates=${checks.bitacora.weak_unique_odt_candidate}`)
  lines.push('')
  lines.push('No writes were executed. This script has no --apply mode.')
  lines.push('')

  return lines.join('\n')
}

async function main() {
  const options = parseArgs()
  readLocalEnv()

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required. Set it in the environment or backend/.env.')
    process.exit(2)
  }

  const prisma = await createPrisma()
  try {
    const report = await buildReport(prisma, options)
    if (options.out) writeFileSync(resolve(options.out), `${JSON.stringify(report, null, 2)}\n`)
    if (options.json) console.log(JSON.stringify(report, null, 2))
    else {
      console.log(formatText(report))
      if (options.out) console.log(`Wrote report: ${resolve(options.out)}`)
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
