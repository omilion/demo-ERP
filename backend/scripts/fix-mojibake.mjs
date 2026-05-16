// Repara mojibake (UTF-8 doble-encodeado) en tablas con texto.
// Patrón: bytes UTF-8 interpretados como Latin-1 y re-encodeados como UTF-8.
// Ejemplo: "DidÃ¡cticos" → "Didácticos"
//
// Estrategia: convert_from(convert_to(col, 'WIN1252'), 'UTF8') sólo si col contiene 'Ã'
// Esto invierte el doble-encoding. WHERE clause evita romper datos ya correctos.
//
// Uso: node backend/scripts/fix-mojibake.mjs [--dry] [--table=catalogo.productos]
//
// IMPORTANTE: hacer pg_dump antes. Es irreversible una vez aplicado.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const isDry = process.argv.includes('--dry')
const tableArg = process.argv.find(a => a.startsWith('--table='))?.split('=')[1]

// Schema.tabla → columnas texto a reparar
const TARGETS = [
  { table: 'catalogo.productos', cols: ['nombre', 'descripcion', 'categoria', 'proveedor', 'ubicacion', 'descripcion_web'] },
  { table: 'catalogo.categorias', cols: ['nombre'] },
  { table: 'catalogo.subcategorias', cols: ['nombre'] },
  { table: 'clientes.clientes', cols: ['razon_social', 'nombre', 'direccion', 'comuna', 'region', 'giro'] },
  { table: 'catalogo.proveedores', cols: ['nombre', 'razon_social', 'direccion', 'giro', 'region', 'comuna'] },
  { table: 'ventas.ordenes', cols: ['observaciones', 'creador_nombre', 'licitacion'] },
  { table: 'ventas.orden_items', cols: ['nombre', 'descripcion'] },
  { table: 'ventas.cotizacion_licitacion', cols: ['referencia', 'obs', 'usuario'] },
  { table: 'ventas.cotizacion_licitacion_items', cols: ['nombre', 'descripcion'] },
  { table: 'bodega.despachos', cols: ['direccion', 'contacto', 'region', 'comuna', 'transporte'] },
  { table: 'bodega.guias_despachos', cols: ['origen'] },
  { table: 'taller.odts', cols: ['obs_general', 'cliente_nombre', 'descripcion'] },
  { table: 'taller.bodega_taller', cols: ['nombre'] },
  { table: 'taller.bitacora_taller', cols: ['texto', 'usuario', 'usuario_reporta'] },
  { table: 'caja.movimientos_caja', cols: ['referencia', 'usuario', 'medio_pago'] },
  { table: 'ventas.cobranza_historico', cols: ['cliente', 'ejecutiva', 'banco', 'observacion'] },
]

const targets = tableArg ? TARGETS.filter(t => t.table === tableArg) : TARGETS
if (!targets.length) {
  console.error(`No target encontrado: ${tableArg}`)
  process.exit(1)
}

let totalAffected = 0

for (const { table, cols } of targets) {
  console.log(`\n── ${table} ──`)
  for (const col of cols) {
    try {
      const checkSql = `SELECT count(*)::int AS n FROM ${table} WHERE "${col}" ~ 'Ã[¡©­³ºñ¨]|Ã'`
      const [{ n }] = await prisma.$queryRawUnsafe(checkSql)
      if (!n) { console.log(`  ${col}: clean`); continue }

      console.log(`  ${col}: ${n} filas con mojibake${isDry ? ' (DRY)' : ''}`)
      totalAffected += n

      if (!isDry) {
        // DO loop con savepoint por fila: filas con UTF-8 no convertibles a LATIN1 se saltan
        const doSql = `
DO $$
DECLARE r record; new_val text; ok int := 0; skip int := 0;
BEGIN
  FOR r IN SELECT ctid AS rid, "${col}" AS val FROM ${table} WHERE "${col}" ~ 'Ã' LOOP
    BEGIN
      new_val := convert_from(convert_to(r.val, 'WIN1252'), 'UTF8');
      UPDATE ${table} SET "${col}" = new_val WHERE ctid = r.rid;
      ok := ok + 1;
    EXCEPTION WHEN OTHERS THEN
      skip := skip + 1;
    END;
  END LOOP;
  RAISE NOTICE '${col}: ok=% skip=%', ok, skip;
END $$;`
        await prisma.$executeRawUnsafe(doSql)
        console.log(`    ✓ aplicado (ver NOTICE para skip)`)
      }
    } catch (e) {
      console.log(`  ${col}: ERROR ${e.message}`)
    }
  }
}

console.log(`\nTotal filas afectadas: ${totalAffected}${isDry ? ' (dry-run, sin cambios)' : ''}`)
await prisma.$disconnect()
