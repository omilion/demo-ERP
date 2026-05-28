import pg from 'pg'

const { Client } = pg

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const client = new Client({ connectionString })

try {
  await client.connect()
  await client.query('BEGIN')

  const blankResult = await client.query(`
    UPDATE "clientes"."clientes"
    SET "email" = NULL
    WHERE "email" IS NOT NULL AND btrim("email") = ''
    RETURNING "id"
  `)

  const duplicateResult = await client.query(`
    WITH ranked AS (
      SELECT
        "id",
        "email",
        lower(btrim("email")) AS normalized_email,
        row_number() OVER (
          PARTITION BY lower(btrim("email"))
          ORDER BY "activo" DESC, "id" ASC
        ) AS email_rank
      FROM "clientes"."clientes"
      WHERE "email" IS NOT NULL AND btrim("email") <> ''
    ),
    updated AS (
      UPDATE "clientes"."clientes" c
      SET "email" = NULL
      FROM ranked r
      WHERE c."id" = r."id" AND r.email_rank > 1
      RETURNING c."id", r."email" AS previous_email, r.normalized_email
    ),
    audit AS (
      INSERT INTO "auth"."audit_log" (
        "method",
        "path",
        "entity",
        "entity_id",
        "payload",
        "created_at"
      )
      SELECT
        'MIGRATION',
        'prisma:20260526102000_cliente_email_unique_guard',
        'Cliente',
        "id"::text,
        jsonb_build_object(
          'field', 'email',
          'previousEmail', previous_email,
          'normalizedEmail', normalized_email,
          'reason', 'deduplicate_before_unique_email_index'
        ),
        now()
      FROM updated
      RETURNING 1
    )
    SELECT
      (SELECT count(*)::int FROM updated) AS updated_count,
      (SELECT count(*)::int FROM audit) AS audit_count
  `)

  await client.query('COMMIT')

  const duplicateSummary = duplicateResult.rows[0] ?? { updated_count: 0, audit_count: 0 }
  console.log(
    `Cliente email dedupe OK: ${blankResult.rowCount} blank emails cleared, ` +
    `${duplicateSummary.updated_count} duplicate emails cleared, ` +
    `${duplicateSummary.audit_count} audit entries created`,
  )
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(error)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
