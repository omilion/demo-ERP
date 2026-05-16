// Repara mojibake (UTF-8 doble-encodeado) en tablas con texto.
// Patrón: bytes UTF-8 interpretados como Latin-1 y re-encodeados como UTF-8.
// Ejemplo: "DidÃ¡cticos" → "Didácticos"
//
// Estrategia: convert_from(convert_to(col, 'LATIN1'), 'UTF8') sólo si col contiene 'Ã'
// Esto invierte el doble-encoding. WHERE clause evita romper datos ya correctos.
//
// Uso: node backend/scripts/fix-mojibake.mjs [--dry] [--table=catalogo.productos]
//
// IMPORTANTE: hacer pg_dump antes. Es irreversible una vez aplicado.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const isDry = process.argv.includes('--dry')
const tableArg = process.argv.find(a => a.startsWith('--table='))?.split('=')[1]

// Schema.tabla → columnas texto a reparar
const TARGETS = [
  { table: 'catalogo.productos', cols: ['nombre', 'descripcion', 'categoria', 'proveedor', 'ubicacion', 'descripcion_web'] },
  { table: 'catalogo.categorias', cols: ['nombre'] },
  { table: 'catalogo.subcategorias', cols: ['nombre'] },
  { table: 'clientes.clientes', cols: ['razon_social', 'nombre', 'direccion', 'comuna', 'region', 'giro', 'observaciones'] },
  { table: 'clientes.proveedores', cols: ['razon_social', 'direccion', 'observaciones', 'giro'] },
  { table: 'ventas.ordenes', cols: ['observaciones', 'creador_nombre', 'licitacion'] },
  { table: 'ventas.orden_items', cols: ['nombre', 'descripcion'] },
  { table: 'ventas.cotizacion_licitacion', cols: ['referencia', 'obs', 'usuario'] },
  { table: 'ventas.cotizacion_licitacion_items', cols: ['nombre', 'descripcion'] },
  { table: 'ventas.despachos', cols: ['direccion', 'contacto', 'region', 'comuna', 'transporte'] },
  { table: 'ventas.guias_despacho', cols: ['origen'] },
  { table: 'taller.odt', cols: ['observaciones'] },
  { table: 'taller.bodega_taller', cols: ['nombre', 'descripcion'] },
  { table: 'taller.bitacora_taller', cols: ['descripcion', 'usuario'] },
  { table: 'caja.movimientos_caja', cols: ['referencia', 'usuario', 'medio_pago'] },
  { table: 'caja.cobranza_historico', cols: ['cliente', 'ejecutiva', 'banco', 'obs'] },
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
        const updSql = `UPDATE ${table} SET "${col}" = convert_from(convert_to("${col}", 'LATIN1'), 'UTF8') WHERE "${col}" ~ 'Ã'`
        const r = await prisma.$executeRawUnsafe(updSql)
        console.log(`    ✓ actualizadas ${r}`)
      }
    } catch (e) {
      console.log(`  ${col}: ERROR ${e.message}`)
    }
  }
}

console.log(`\nTotal filas afectadas: ${totalAffected}${isDry ? ' (dry-run, sin cambios)' : ''}`)
await prisma.$disconnect()
