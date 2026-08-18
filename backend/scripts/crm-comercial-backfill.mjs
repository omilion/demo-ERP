// Clasificación conservadora del CRM histórico. Sin --apply solo muestra la propuesta.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const apply = process.argv.includes('--apply')

async function preview() {
  return prisma.$queryRawUnsafe(`
    SELECT propuesta, COUNT(*)::int AS total
    FROM (
      SELECT CASE
        WHEN estado = '3' THEN 'CERRADO / SIN_CLASIFICAR'
        WHEN estado IN ('1', '2') THEN 'SEGUIMIENTO'
        WHEN NULLIF(BTRIM(n_cotizacion), '') IS NOT NULL THEN 'COTIZACION_ENVIADA'
        ELSE 'PENDIENTE_CLASIFICACION'
      END AS propuesta
      FROM ventas.crm_registros
      WHERE etapa_comercial IS NULL
    ) x
    GROUP BY propuesta
    ORDER BY propuesta
  `)
}

async function run() {
  const before = await preview()
  console.table(before)
  if (!apply) {
    console.log('DRY-RUN: no se modificaron registros. Usa --apply después de aprobar el reporte.')
    return
  }
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE ventas.crm_registros
    SET
      etapa_comercial = CASE
        WHEN estado = '3' THEN 'CERRADO'
        WHEN estado IN ('1', '2') THEN 'SEGUIMIENTO'
        WHEN NULLIF(BTRIM(n_cotizacion), '') IS NOT NULL THEN 'COTIZACION_ENVIADA'
        ELSE 'PENDIENTE_CLASIFICACION'
      END,
      subestado_espera = CASE WHEN estado = '2' THEN 'LEGACY_EN_ESPERA' ELSE subestado_espera END,
      resultado_cierre = CASE WHEN estado = '3' THEN 'SIN_CLASIFICAR' ELSE resultado_cierre END,
      estado_cambiado_at = COALESCE(estado_cambiado_at, updated_at, created_at),
      ultima_gestion_at = COALESCE(ultima_gestion_at, fecha_cotizacion, fecha, created_at)
    WHERE etapa_comercial IS NULL
  `)
  console.log(`APPLY: ${updated} registros clasificados. Los cierres históricos quedaron SIN_CLASIFICAR.`)
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
