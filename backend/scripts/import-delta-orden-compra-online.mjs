// Importa las filas de orden_compra (sisventa, tienda online) que existen
// LIVE en el legacy (plastimar.cl cPanel) pero no en v2 (ventas.orden_compra_online)
// porque sisventa siguio operando despues del ultimo dump usado para migrar.
// Solo CREA lo que falta (n_compra no existente); nunca actualiza filas existentes.
//
// Uso:
//   node scripts/import-delta-orden-compra-online.mjs           -> dry-run
//   node scripts/import-delta-orden-compra-online.mjs --apply   -> escribe
//
// Despues de aplicar, correr sync-crm-orden-compra-online.mjs --apply para
// generar las oportunidades CRM correspondientes (pipeline ya establecido).

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
  connectTimeout: 10000,
};
if (!LEGACY.host || !LEGACY.user || !LEGACY.password) {
  console.error('Faltan LEGACY_DB_HOST / LEGACY_DB_USER / LEGACY_DB_PASSWORD');
  process.exit(1);
}

const text = v => (v == null ? null : String(v).trim() || null);
const safeDate = v => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

async function main() {
  const legacy = await mysql.createConnection(LEGACY);
  const pgc = new pg.Client({ connectionString: DB_URL });
  await pgc.connect();

  const existing = await pgc.query(`SELECT n_compra FROM ventas.orden_compra_online`);
  const existingSet = new Set(existing.rows.map(r => r.n_compra));

  const [liveOrders] = await legacy.query(`SELECT * FROM orden_compra`);
  const missing = liveOrders.filter(o => !existingSet.has(String(o.n_compra)));
  missing.sort((a, b) => a.id - b.id);

  console.log(`Live: ${liveOrders.length} | En v2: ${existingSet.size} | Faltantes: ${missing.length}`);
  if (!missing.length) { await legacy.end(); await pgc.end(); return; }

  const nCompras = missing.map(o => String(o.n_compra));
  let liveItems = [];
  for (let i = 0; i < nCompras.length; i += 500) {
    const batch = nCompras.slice(i, i + 500).map(n => pgc.escapeLiteral ? n : n);
    const placeholders = batch.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
    const [rows] = await legacy.query(`SELECT * FROM productos_comprados WHERE n_compra IN (${placeholders})`);
    liveItems.push(...rows);
  }
  const itemsByCompra = new Map();
  for (const it of liveItems) {
    const key = String(it.n_compra);
    if (!itemsByCompra.has(key)) itemsByCompra.set(key, []);
    itemsByCompra.get(key).push(it);
  }

  console.log(`\nMuestra de ${Math.min(5, missing.length)} ordenes a crear:`);
  for (const o of missing.slice(0, 5)) {
    console.log(`  n_compra=${o.n_compra} estado="${o.estado_compra}" codigo_vendedor=${o.codigo_vendedor} total=${o.total} items=${(itemsByCompra.get(String(o.n_compra)) || []).length}`);
  }

  if (!APPLY) {
    console.log('\nDRY-RUN: nada escrito. Corre con --apply para crear.');
    await legacy.end();
    await pgc.end();
    return;
  }

  let created = 0, itemsCreated = 0, skipped = 0;
  for (const o of missing) {
    try {
      const insOc = await pgc.query(
        `INSERT INTO ventas.orden_compra_online
           (n_compra, fecha_hora, fecha_cotizacion, email_comprador, total, estado_compra,
            tipo_documento, codigo_vendedor, sucursal_id, obs_cliente, canal, texto_pie,
            tipo_cotizacion, costo_envio, cargo_servicio, historial_cargo, n_impresiones, crm_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (n_compra) DO NOTHING
         RETURNING id`,
        [
          String(o.n_compra), safeDate(o.fecha_hora) || new Date(), safeDate(o.fecha_cotizacion),
          text(o.email_comprador), parseFloat(o.total) || 0, text(o.estado_compra),
          text(o.tipo_documento), text(o.codigo_vendedor), o.sucursal || null,
          text(o.obs_cliente), text(o.canal), text(o.texto_pie), text(o.tipo_cotizacion),
          parseFloat(o.costo_envio) || 0, text(o.cargo_servicio), text(o.historial_cargo),
          parseInt(o.n_impresiones) || 0, parseInt(o.crm) || null, safeDate(o.fecha_hora) || new Date(),
        ]
      );
      if (!insOc.rows.length) { skipped++; continue; }
      const ocId = insOc.rows[0].id;
      created++;

      for (const it of itemsByCompra.get(String(o.n_compra)) || []) {
        await pgc.query(
          `INSERT INTO ventas.orden_compra_online_items
             (orden_compra_id, codigo_interno, nombre, descripcion, cantidad, precio)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [ocId, text(it.codigo_interno), text(it.nombre), text(it.descripcion), parseInt(it.cant) || 0, parseFloat(it.precio) || 0]
        );
        itemsCreated++;
      }
    } catch (e) {
      console.error(`Fallo n_compra=${o.n_compra}: ${e.message}`);
    }
  }

  console.log(`\nOrdenes creadas: ${created} (omitidas por conflicto: ${skipped}), items creados: ${itemsCreated}`);
  console.log('Ahora correr: node scripts/sync-crm-orden-compra-online.mjs --apply --confirm=SYNC_CRM_OC_ONLINE');
  await legacy.end();
  await pgc.end();
}

main().catch(e => { console.error(e); process.exit(1); });
