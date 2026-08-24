// Importa las ordenes de orden_compra_sistema (sisgestion, Matriz de Venta)
// que existen LIVE en el legacy (plastimar.cl cPanel) pero no en v2 aun,
// porque sisgestion siguio operando despues del ultimo dump (11-ago).
// Solo CREA lo que falta (n_interno no existente en ventas.ordenes);
// nunca actualiza ordenes existentes (para eso: sync-legacy-venta-web.mjs).
//
// Uso:
//   node scripts/import-delta-orden-compra-sistema.mjs           -> dry-run
//   node scripts/import-delta-orden-compra-sistema.mjs --apply   -> escribe

import mysql from 'mysql2/promise';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('Falta DATABASE_URL'); process.exit(1); }

const LEGACY = {
  host: process.env.LEGACY_DB_HOST,
  user: process.env.LEGACY_DB_USER,
  password: process.env.LEGACY_DB_PASSWORD,
  database: process.env.LEGACY_DB_NAME || 'plastim2_plastimar2014',
  connectTimeout: 8000,
};
if (!LEGACY.host || !LEGACY.user || !LEGACY.password) {
  console.error('Faltan LEGACY_DB_HOST / LEGACY_DB_USER / LEGACY_DB_PASSWORD');
  process.exit(1);
}
const CONSUMIDOR_FINAL_RUT = '666666666';

const text = v => (v == null ? null : String(v).trim() || null);
const normRut = v => (v == null ? '' : String(v).toUpperCase().replace(/[.\-\s]/g, ''));
function parseCalendarDate(value) {
  if (value instanceof Date) return value;
  const raw = text(value);
  if (!raw) return null;
  let m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return null;
}

async function main() {
  const legacy = await mysql.createConnection(LEGACY);
  const pgc = new pg.Client({ connectionString: DB_URL });
  await pgc.connect();

  const existing = await pgc.query(`SELECT n_interno FROM ventas.ordenes WHERE n_interno IS NOT NULL`);
  const existingSet = new Set(existing.rows.map(r => r.n_interno));

  const [liveOrders] = await legacy.query(`SELECT * FROM orden_compra_sistema WHERE n_interno IS NOT NULL AND n_interno > 0`);
  const missing = liveOrders.filter(o => !existingSet.has(o.n_interno));
  missing.sort((a, b) => a.n_interno - b.n_interno);

  console.log(`Live: ${liveOrders.length} | En v2: ${existingSet.size} | Faltantes: ${missing.length}`);
  if (!missing.length) { await legacy.end(); await pgc.end(); return; }

  const ninternos = missing.map(o => o.n_interno);
  const [liveItems] = await legacy.query(`SELECT * FROM productos_comprados_local WHERE n_interno IN (${ninternos.join(',')})`);
  const itemsByInterno = new Map();
  for (const it of liveItems) {
    if (!itemsByInterno.has(it.n_interno)) itemsByInterno.set(it.n_interno, []);
    itemsByInterno.get(it.n_interno).push(it);
  }

  const clientes = await pgc.query(`SELECT id, rut FROM clientes.clientes WHERE rut IS NOT NULL`);
  const clienteByRut = new Map(clientes.rows.map(c => [normRut(c.rut), c.id]));
  const consumidorFinalId = clienteByRut.get(CONSUMIDOR_FINAL_RUT) || null;

  const productos = await pgc.query(`SELECT id, codigo_interno FROM catalogo.productos WHERE codigo_interno IS NOT NULL`);
  const productoByCodigo = new Map(productos.rows.map(p => [p.codigo_interno, p.id]));

  console.log(`\nMuestra de ${Math.min(5, missing.length)} ordenes a crear:`);
  for (const o of missing.slice(0, 5)) {
    console.log(`  n_interno=${o.n_interno} tipo="${o.tipo}" usuario="${o.usuario}" rut=${o.rut_cliente} items=${(itemsByInterno.get(o.n_interno) || []).length}`);
  }

  let sinCliente = 0, sinItems = 0;
  for (const o of missing) {
    const rut = normRut(o.rut_cliente);
    if (!clienteByRut.get(rut) && !consumidorFinalId) sinCliente++;
    if (!(itemsByInterno.get(o.n_interno) || []).length) sinItems++;
  }
  console.log(`\nSin cliente resoluble (ni consumidor final): ${sinCliente}`);
  console.log(`Sin items: ${sinItems}`);

  if (!APPLY) {
    console.log('\nDRY-RUN: nada escrito. Corre con --apply para crear.');
    await legacy.end();
    await pgc.end();
    return;
  }

  let created = 0, itemsCreated = 0;
  for (const o of missing) {
    const rut = normRut(o.rut_cliente);
    const clienteId = clienteByRut.get(rut) || consumidorFinalId;
    const fecham = parseCalendarDate(o.fecham) || o.fecha_hora || new Date();

    const insOrden = await pgc.query(
      `INSERT INTO ventas.ordenes
         (n_interno, tipo, estado, estado_pago, estado_entrega, fecha_estado_entrega,
          cliente_id, rut_cliente, email_cliente, user_id, sucursal_id, licitacion,
          observaciones, creador_nombre, user_mod, fecham, eliminada, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12,$13,$14,$15,$16,NOW())
       RETURNING id`,
      [
        o.n_interno, text(o.tipo) || 'Venta Web', text(o.estado) || 'Activa',
        text(o.estado_pago) || 'No pagada', text(o.estado_entrega) || 'Pendiente entrega',
        parseCalendarDate(o.fecha_estado_entrega), clienteId, text(o.rut_cliente), text(o.email),
        o.sucursal || null, text(o.orden_compra), text(o.obs), text(o.usuario),
        text(o.user), fecham, !!Number(o.eliminada),
      ]
    );
    const ordenId = insOrden.rows[0].id;
    created++;

    for (const it of itemsByInterno.get(o.n_interno) || []) {
      const productoId = productoByCodigo.get(text(it.codigo_interno)) || 0;
      await pgc.query(
        `INSERT INTO ventas.orden_items
           (orden_id, producto_id, codigo_interno, nombre, descripcion, cantidad,
            n_entregados, precio_unitario, precio_con_iva, cargo_transporte, eliminado, user_mod, fecham)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          ordenId, productoId, text(it.codigo_interno), text(it.nombre), text(it.descripcion),
          parseInt(it.cant) || 0, parseInt(it.n_entregados) || 0, parseFloat(it.precio) || 0,
          parseFloat(it.precio_coniva) || null, parseFloat(it.cargo_transporte) || 0,
          !!Number(it.eliminado), text(it.user), it.fecham || null,
        ]
      );
      itemsCreated++;
    }
  }

  console.log(`\nOrdenes creadas: ${created}, items creados: ${itemsCreated}`);
  console.log('userId quedo en 1 (Admin) temporal — correr vendedor-canonicalize-vps.mjs --apply despues para reasignar.');
  await legacy.end();
  await pgc.end();
}

main().catch(e => { console.error(e); process.exit(1); });
