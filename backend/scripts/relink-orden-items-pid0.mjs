// Reconecta items de venta que quedaron con producto_id = 0 pero cuyo
// codigo_interno si existe en el catalogo.
//
// Contexto: el sistema anterior no vinculaba la linea de venta a un producto
// (guardaba codigo y nombre como texto), asi que al migrar quedaron 6.071 items
// en 4.266 ordenes sin producto. Una parte identifica productos reales por su
// codigo y se puede reconectar sin ambiguedad; el resto no debe tocarse.
//
// NO se reconectan:
//   - lineas de ajuste de total (error_mas, error_resta): nunca fueron producto
//   - lineas de despacho/descuento (envio, flete, despacho, ajuste, dcto): su
//     tratamiento es una definicion de negocio pendiente de Plastimar
//   - codigos que resuelven a mas de un producto: ambiguos, requieren criterio
//   - codigos ausentes del catalogo: requieren crear el producto
//
// Uso:
//   node scripts/relink-orden-items-pid0.mjs            (ensayo, no escribe)
//   node scripts/relink-orden-items-pid0.mjs --aplicar  (escribe, con respaldo)
import pg from 'pg'
import { readFileSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')
const TABLA_RESPALDO = 'staging_fix.relink_pid0_20260909'

// Pseudo-codigos que no son productos aunque tengan ficha en el catalogo.
const EXCLUIDOS = `(
  lower(trim(i.codigo_interno)) IN ('error_mas','error_resta','ajuste','despacho')
  OR lower(trim(i.codigo_interno)) LIKE 'envio%'
  OR lower(trim(i.codigo_interno)) LIKE 'extdespacho%'
  OR lower(trim(i.codigo_interno)) LIKE 'extdcto%'
  OR lower(trim(i.codigo_interno)) LIKE 'flete%'
)`

// Candidatos: item con producto_id = 0, codigo no excluido, y exactamente un
// producto del catalogo con ese codigo normalizado.
const CANDIDATOS = `
  WITH cat AS (
    SELECT upper(trim(codigo_interno)) cod, min(id) producto_id, count(*) coincidencias
      FROM catalogo.productos
     WHERE codigo_interno IS NOT NULL AND trim(codigo_interno) <> ''
     GROUP BY 1
  )
  SELECT i.id item_id, i.orden_id, i.codigo_interno, c.producto_id nuevo_producto_id
    FROM ventas.orden_items i
    JOIN cat c ON c.cod = upper(trim(i.codigo_interno))
   WHERE i.producto_id = 0
     AND i.codigo_interno IS NOT NULL AND trim(i.codigo_interno) <> ''
     AND c.coincidencias = 1
     AND NOT ${EXCLUIDOS}
`

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const url = env.split('\n').find(l => l.trim().startsWith('DATABASE_URL='))
  .split('=').slice(1).join('=').split('#')[0].trim().replace('55491', '55492')

const c = new pg.Client({ connectionString: url })
await c.connect()

const tabla = (titulo, filas) => { console.log('\n### ' + titulo); console.table(filas) }

const antes = await c.query(`SELECT count(*) items, count(DISTINCT orden_id) ordenes
                               FROM ventas.orden_items WHERE producto_id = 0`)
tabla('Estado inicial', antes.rows)

const cand = await c.query(`SELECT count(*) items, count(DISTINCT orden_id) ordenes,
                                   count(DISTINCT codigo_interno) codigos
                              FROM (${CANDIDATOS}) t`)
tabla('Candidatos a reconectar', cand.rows)

const excl = await c.query(`
  SELECT CASE
           WHEN ${EXCLUIDOS} THEN 'excluido: linea de ajuste o despacho'
           WHEN i.codigo_interno IS NULL OR trim(i.codigo_interno) = '' THEN 'excluido: sin codigo'
           WHEN NOT EXISTS (SELECT 1 FROM catalogo.productos p
                             WHERE upper(trim(p.codigo_interno)) = upper(trim(i.codigo_interno)))
             THEN 'excluido: codigo no existe en catalogo'
           ELSE 'excluido: codigo ambiguo (varios productos)'
         END motivo,
         count(*) items, count(DISTINCT i.orden_id) ordenes
    FROM ventas.orden_items i
   WHERE i.producto_id = 0
     AND i.id NOT IN (SELECT item_id FROM (${CANDIDATOS}) t)
   GROUP BY 1 ORDER BY 2 DESC`)
tabla('Lo que NO se toca', excl.rows)

const muestra = await c.query(`SELECT * FROM (${CANDIDATOS}) t ORDER BY random() LIMIT 8`)
tabla('Muestra de cambios', muestra.rows)

if (!APLICAR) {
  console.log('\nENSAYO. No se escribio nada. Repetir con --aplicar para ejecutar.')
  await c.end()
  process.exit(0)
}

console.log('\n>>> Aplicando dentro de una transaccion...')
try {
  await c.query('BEGIN')
  await c.query(`CREATE TABLE IF NOT EXISTS ${TABLA_RESPALDO} (
    item_id integer PRIMARY KEY,
    orden_id integer NOT NULL,
    codigo_interno text,
    producto_id_anterior integer NOT NULL,
    producto_id_nuevo integer NOT NULL,
    aplicado_en timestamptz NOT NULL DEFAULT now()
  )`)
  const resp = await c.query(`INSERT INTO ${TABLA_RESPALDO}
      (item_id, orden_id, codigo_interno, producto_id_anterior, producto_id_nuevo)
    SELECT item_id, orden_id, codigo_interno, 0, nuevo_producto_id FROM (${CANDIDATOS}) t
    ON CONFLICT (item_id) DO NOTHING`)
  console.log('Respaldo guardado en ' + TABLA_RESPALDO + ': ' + resp.rowCount + ' filas')

  const upd = await c.query(`UPDATE ventas.orden_items i
      SET producto_id = t.nuevo_producto_id
     FROM (${CANDIDATOS}) t
    WHERE i.id = t.item_id AND i.producto_id = 0`)
  console.log('Items reconectados: ' + upd.rowCount)

  await c.query('COMMIT')
  console.log('COMMIT ok')
} catch (e) {
  await c.query('ROLLBACK')
  console.error('ROLLBACK por error:', e.message)
  await c.end()
  process.exit(1)
}

const despues = await c.query(`SELECT count(*) items, count(DISTINCT orden_id) ordenes
                                 FROM ventas.orden_items WHERE producto_id = 0`)
tabla('Estado final', despues.rows)

const huerf = await c.query(`SELECT count(*) items_apuntando_a_producto_inexistente
   FROM ventas.orden_items i LEFT JOIN catalogo.productos p ON p.id = i.producto_id
  WHERE i.producto_id > 0 AND p.id IS NULL`)
tabla('Verificacion de integridad', huerf.rows)

await c.end()
console.log('\nListo. Para revertir: UPDATE ventas.orden_items SET producto_id = 0 FROM ' +
            TABLA_RESPALDO + ' r WHERE ventas.orden_items.id = r.item_id;')
