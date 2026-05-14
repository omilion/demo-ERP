// Migrate residual legacy data from MySQL dump (2014) into PG.
// Streams the SQL dump line-by-line so 600MB stays out of memory.

import fs from 'fs';
import readline from 'readline';
import pg from 'pg';

const DUMP = process.env.DUMP_PATH || 'D:/downloads/plastim2_plastimar2014.sql';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:1q2w3e4rlala@localhost:5432/plastimar_dev';

const PHASE = process.env.PHASE || '1';
const PHASES = {
  '1': ['gastos', 'descuentos_porc', 'descuentos_porc_marco', 'descuentos_ventas',
        'talleres', 'firmas_email', 'bloqueo_pagina', 'perfil_sistema',
        'relacion_productos', 'categorias', 'subcategorias'],
  '2': ['usuarios_sistema', 'accesos', 'accesos_ventas', 'bodega_taller',
        'categorias_bodega_taller', 'subcategorias_bodega_taller'],
  '3': ['telas', 'historico_telas'],
  '4': ['cotizacion_licitacion', 'productos_cotizados_licitacion'],
  '5': ['orden_compra', 'productos_comprados'],
  '6': ['productos_comprados_local'],
  '7': ['productos_taller'],
  '8': ['pagos_proveedores', 'detalle_facturas_bodega'],
  '0': ['orden_compra_sistema'],
  '0b': ['odts'],
};
const TARGETS = new Set(PHASES[PHASE]);
if (TARGETS.size === 0) { console.error('Unknown PHASE'); process.exit(1); }
console.log(`PHASE=${PHASE}  tables=[${[...TARGETS].join(',')}]`);

// ── SQL VALUE PARSER ──────────────────────────────────────────────────
// Given the substring after "VALUES ", yield each tuple as array of JS values.
function* parseTuples(values) {
  let i = 0, n = values.length;
  while (i < n) {
    while (i < n && (values[i] === ' ' || values[i] === ',' || values[i] === '\n' || values[i] === '\r')) i++;
    if (i >= n || values[i] === ';') return;
    if (values[i] !== '(') throw new Error(`Expected ( at ${i}, got ${values[i]}`);
    i++;
    const tuple = [];
    while (true) {
      while (i < n && values[i] === ' ') i++;
      const ch = values[i];
      if (ch === "'") {
        // string
        i++;
        let s = '';
        while (i < n) {
          const c = values[i];
          if (c === '\\') {
            const next = values[i+1];
            if (next === 'n') s += '\n';
            else if (next === 't') s += '\t';
            else if (next === 'r') s += '\r';
            else if (next === '0') s += '\0';
            else s += next;
            i += 2;
          } else if (c === "'") {
            if (values[i+1] === "'") { s += "'"; i += 2; }
            else { i++; break; }
          } else { s += c; i++; }
        }
        tuple.push(s);
      } else if (ch === 'N' && values.substr(i, 4) === 'NULL') {
        tuple.push(null); i += 4;
      } else if ((ch >= '0' && ch <= '9') || ch === '-' || ch === '.') {
        let j = i;
        while (j < n && /[\d\.\-eE+]/.test(values[j])) j++;
        const numStr = values.substring(i, j);
        const num = numStr.includes('.') || numStr.includes('e') ? parseFloat(numStr) : parseInt(numStr, 10);
        tuple.push(num);
        i = j;
      } else if (ch === ')') {
        break;
      } else {
        throw new Error(`Unexpected char "${ch}" at ${i}, context: ${values.substr(i, 30)}`);
      }
      while (i < n && values[i] === ' ') i++;
      if (values[i] === ',') { i++; continue; }
      if (values[i] === ')') break;
      throw new Error(`Expected , or ) at ${i}, got "${values[i]}"`);
    }
    if (values[i] !== ')') throw new Error(`Expected ) at ${i}`);
    i++;
    yield tuple;
  }
}

function parseInsert(stmt) {
  // Match: INSERT INTO `tbl` (`col1`,...) VALUES (...),(...);  or no col list
  const m = stmt.match(/^INSERT INTO `([^`]+)`\s*(?:\(([^)]*)\)\s*)?VALUES\s*([\s\S]*?);\s*$/);
  if (!m) return null;
  const table = m[1];
  const cols = m[2] ? m[2].split(',').map(c => c.trim().replace(/`/g, '')) : null;
  const values = m[3];
  return { table, cols, values };
}

// ── STREAM DUMP ─────────────────────────────────────────────────────
async function loadTables(targetSet) {
  const data = Object.fromEntries([...targetSet].map(t => [t, { cols: null, rows: [] }]));
  const stream = fs.createReadStream(DUMP, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let buf = '';
  let inStmt = false;
  let curTable = null;
  let count = 0;

  for await (const line of rl) {
    if (!inStmt) {
      const m = line.match(/^INSERT INTO `([^`]+)`/);
      if (m && targetSet.has(m[1])) {
        curTable = m[1];
        buf = line;
        inStmt = true;
      }
    } else {
      buf += '\n' + line;
    }
    if (inStmt && line.endsWith(';')) {
      try {
        const parsed = parseInsert(buf);
        if (parsed) {
          if (!data[parsed.table].cols && parsed.cols) data[parsed.table].cols = parsed.cols;
          for (const t of parseTuples(parsed.values)) {
            data[parsed.table].rows.push(t);
          }
        }
      } catch (e) {
        console.error(`Parse fail in ${curTable}: ${e.message}`);
      }
      buf = '';
      inStmt = false;
      curTable = null;
      count++;
      if (count % 100 === 0) process.stdout.write(`\r${count} inserts processed`);
    }
  }
  process.stdout.write(`\rdone. ${count} INSERT statements scanned.\n`);
  return data;
}

// ── HELPERS ─────────────────────────────────────────────────────────
function rowAsObj(cols, row) {
  const o = {};
  cols.forEach((c, i) => { o[c] = row[i]; });
  return o;
}

function dt(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return v;
  if (v.startsWith('0000-00-00')) return null;
  if (v === '') return null;
  return v;
}

async function exec(client, sql, params = []) {
  return client.query(sql, params);
}

async function bulkInsert(client, schema, table, cols, rows, opts = {}) {
  if (rows.length === 0) return 0;
  const onConflict = opts.onConflict || '';
  let total = 0;
  const CHUNK = 500;
  for (let s = 0; s < rows.length; s += CHUNK) {
    const slice = rows.slice(s, s + CHUNK);
    const params = [];
    const tuples = slice.map((r) => {
      const placeholders = r.map(() => { params.push(arguments); return `$${params.length}`; });
      return `(${placeholders.join(',')})`;
    });
    // Re-do with proper push
    params.length = 0;
    const tuples2 = slice.map(r => {
      const ph = r.map(v => { params.push(v); return `$${params.length}`; });
      return `(${ph.join(',')})`;
    });
    const sql = `INSERT INTO "${schema}"."${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES ${tuples2.join(',')} ${onConflict}`;
    const r = await client.query(sql, params);
    total += r.rowCount;
  }
  return total;
}

// ── ORCHESTRATOR ────────────────────────────────────────────────────
async function main() {
  console.log('Streaming dump…');
  const data = await loadTables(TARGETS);
  for (const [t, d] of Object.entries(data)) {
    console.log(`  ${t}: ${d.rows.length} rows`);
  }

  const pgClient = new pg.Client({ connectionString: DB_URL });
  await pgClient.connect();
  console.log('PG connected.');

  // 1. gastos (catalog)
  if (data.gastos?.rows.length) {
    const rows = data.gastos.rows.map(r => {
      const o = rowAsObj(data.gastos.cols, r);
      return [o.id, o.nombre, true];
    });
    const n = await bulkInsert(pgClient, 'caja', 'gastos', ['id', 'nombre', 'activo'], rows, { onConflict: 'ON CONFLICT (id) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('caja.gastos','id'), GREATEST((SELECT MAX(id) FROM caja.gastos), 1))`);
    console.log(`gastos: ${n} inserted`);
  }

  // 2. descuentos_porc, descuentos_porc_marco
  for (const [src, dst] of [['descuentos_porc', 'descuentos_porc'], ['descuentos_porc_marco', 'descuentos_porc_marco']]) {
    const d = data[src];
    if (!d || !d.rows.length) continue;
    const rows = d.rows.map(r => {
      const o = rowAsObj(d.cols, r);
      return [o.id, o.valor, true];
    });
    const n = await bulkInsert(pgClient, 'ventas', dst, ['id', 'valor', 'activo'], rows, { onConflict: 'ON CONFLICT (id) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('ventas.${dst}','id'), GREATEST((SELECT MAX(id) FROM ventas.${dst}), 1))`);
    console.log(`${dst}: ${n} inserted`);
  }

  // 3. descuentos_ventas (n_interno → orden_id needs mapping; skip if no ordenes mapping; fall back to keep n_interno field?)
  // Note: ventas.descuentos_ventas schema requires orden_id. We backfill via n_interno = ordenes.n_interno
  if (data.descuentos_ventas?.rows.length) {
    const map = new Map();
    const r = await exec(pgClient, `SELECT id, n_interno FROM ventas.ordenes WHERE n_interno IS NOT NULL`);
    for (const row of r.rows) map.set(row.n_interno, row.id);
    const rows = [];
    let missing = 0;
    for (const t of data.descuentos_ventas.rows) {
      const o = rowAsObj(data.descuentos_ventas.cols, t);
      const oid = map.get(o.n_interno);
      if (!oid) { missing++; continue; }
      rows.push([o.id, oid, o.porc]);
    }
    if (rows.length) {
      const n = await bulkInsert(pgClient, 'ventas', 'descuentos_ventas', ['id', 'orden_id', 'porcentaje'], rows, { onConflict: 'ON CONFLICT (id) DO NOTHING' });
      await exec(pgClient, `SELECT setval(pg_get_serial_sequence('ventas.descuentos_ventas','id'), GREATEST((SELECT MAX(id) FROM ventas.descuentos_ventas), 1))`);
      console.log(`descuentos_ventas: ${n} inserted (skipped ${missing} w/o orden)`);
    }
  }

  // 4. talleres (catalog)
  if (data.talleres?.rows.length) {
    const rows = data.talleres.rows.map(r => {
      const o = rowAsObj(data.talleres.cols, r);
      return [o.id, o.nombre, true];
    });
    const n = await bulkInsert(pgClient, 'taller', 'talleres', ['id', 'nombre', 'activo'], rows, { onConflict: 'ON CONFLICT (id) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('taller.talleres','id'), GREATEST((SELECT MAX(id) FROM taller.talleres), 1))`);
    console.log(`talleres: ${n} inserted`);
  }

  // 5. firmas_email (config)
  if (data.firmas_email?.rows.length) {
    const rows = data.firmas_email.rows.map(r => {
      const o = rowAsObj(data.firmas_email.cols, r);
      return [o.id, o.alias || o.web || 'sin alias', o.email || '', o.firma || '', o.foto || null, true];
    });
    const n = await bulkInsert(pgClient, 'config', 'firmas_email', ['id', 'alias', 'email', 'firma', 'foto_url', 'activo'], rows, { onConflict: 'ON CONFLICT (id) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('config.firmas_email','id'), GREATEST((SELECT MAX(id) FROM config.firmas_email), 1))`);
    console.log(`firmas_email: ${n} inserted`);
  }

  // 6. bloqueo_pagina (config)
  if (data.bloqueo_pagina?.rows.length) {
    const rows = data.bloqueo_pagina.rows.map(r => {
      const o = rowAsObj(data.bloqueo_pagina.cols, r);
      return [o.id, `web-${o.id}`, o.estado || 'DESBLOQUEADA', o.texto || null];
    });
    const n = await bulkInsert(pgClient, 'config', 'bloqueo_pagina', ['id', 'modulo', 'estado', 'texto'], rows, { onConflict: 'ON CONFLICT (modulo) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('config.bloqueo_pagina','id'), GREATEST((SELECT MAX(id) FROM config.bloqueo_pagina), 1))`);
    console.log(`bloqueo_pagina: ${n} inserted`);
  }

  // 7. perfil_sistema → config.empresa
  if (data.perfil_sistema?.rows.length) {
    const o = rowAsObj(data.perfil_sistema.cols, data.perfil_sistema.rows[0]);
    await exec(pgClient, `DELETE FROM config.empresa`);
    await exec(pgClient,
      `INSERT INTO config.empresa (nombre, rut, razon_social, giro, email, telefono, direccion, region, comuna, codigo_empresa, logo_url, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())`,
      [o.nombre, o.rut, o.razon_social, o.giro, o.email, o.fono1, o.direccion, o.region, o.comuna, o.codigo_empresa, o.foto || null]);
    console.log(`empresa: 1 inserted (${o.nombre} – ${o.rut})`);
  }

  // 8. relacion_productos (codigo_padre → producto_id, codigo_hijos → relacionado_id)
  // Need productos by id_legacy. Legacy `codigo_padre/hijos` refer to producto.id in legacy DB. Resolve via codigo_interno mapping if possible.
  // In v2, productos.id = legacy_id (assuming previous migration kept ids). Try direct.
  if (data.relacion_productos?.rows.length) {
    const validIds = new Set();
    const r = await exec(pgClient, `SELECT id FROM catalogo.productos`);
    for (const row of r.rows) validIds.add(row.id);
    const rows = [];
    let missing = 0;
    for (const t of data.relacion_productos.rows) {
      const o = rowAsObj(data.relacion_productos.cols, t);
      if (!validIds.has(o.codigo_padre) || !validIds.has(o.codigo_hijos)) { missing++; continue; }
      rows.push([o.codigo_padre, o.codigo_hijos, 'relacionado']);
    }
    if (rows.length) {
      const n = await bulkInsert(pgClient, 'catalogo', 'relacion_productos', ['producto_id', 'relacionado_id', 'tipo'], rows, { onConflict: 'ON CONFLICT (producto_id, relacionado_id) DO NOTHING' });
      console.log(`relacion_productos: ${n} inserted (skipped ${missing} w/o producto)`);
    } else {
      console.log(`relacion_productos: 0 inserted (${missing} w/o producto)`);
    }
  }

  // 9. categorias
  if (data.categorias?.rows.length) {
    const rows = data.categorias.rows.map(r => {
      const o = rowAsObj(data.categorias.cols, r);
      return [o.id, o.nombre, parseFloat(o.porc_desc) || 0, (o.mostrar === 'si' || o.mostrar === '1' || o.mostrar === 1), true];
    });
    const n = await bulkInsert(pgClient, 'catalogo', 'categorias', ['id', 'nombre', 'porc_desc', 'mostrar', 'activo'], rows, { onConflict: 'ON CONFLICT (id) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('catalogo.categorias','id'), GREATEST((SELECT MAX(id) FROM catalogo.categorias), 1))`);
    console.log(`categorias: ${n} inserted`);
  }

  // 10. subcategorias
  if (data.subcategorias?.rows.length) {
    const catIds = new Set();
    const r = await exec(pgClient, `SELECT id FROM catalogo.categorias`);
    for (const row of r.rows) catIds.add(row.id);
    const rows = [];
    let missing = 0;
    for (const t of data.subcategorias.rows) {
      const o = rowAsObj(data.subcategorias.cols, t);
      if (!catIds.has(o.relacion)) { missing++; continue; }
      rows.push([o.id, o.nombre, o.relacion, true]);
    }
    if (rows.length) {
      const n = await bulkInsert(pgClient, 'catalogo', 'subcategorias', ['id', 'nombre', 'categoria_id', 'activo'], rows, { onConflict: 'ON CONFLICT (id) DO NOTHING' });
      await exec(pgClient, `SELECT setval(pg_get_serial_sequence('catalogo.subcategorias','id'), GREATEST((SELECT MAX(id) FROM catalogo.subcategorias), 1))`);
      console.log(`subcategorias: ${n} inserted (skipped ${missing} w/o categoria)`);
    }
  }

  // 11. Seed talleres catalog (legacy `talleres` is empty; values inferred from `productos_taller` columns)
  if (PHASE === '1') {
    const r = await exec(pgClient, `SELECT COUNT(*)::int n FROM taller.talleres`);
    if (r.rows[0].n === 0) {
      await exec(pgClient, `INSERT INTO taller.talleres (id, nombre, activo) VALUES (1,'confecciones',true),(2,'espumas',true),(3,'externo',true)`);
      await exec(pgClient, `SELECT setval(pg_get_serial_sequence('taller.talleres','id'), 3)`);
      console.log(`talleres: 3 inserted (seeded confecciones/espumas/externo)`);
    }
  }

  // 12. usuarios_sistema → backfill users.codigo_vendedor / rut / permiso_descuentos
  if (data.usuarios_sistema && data.usuarios_sistema.rows.length) {
    let updated = 0;
    for (const r of data.usuarios_sistema.rows) {
      const o = rowAsObj(data.usuarios_sistema.cols, r);
      const login = (o.login_usuario || '').toLowerCase();
      const r2 = await exec(pgClient,
        `UPDATE auth.users SET
           codigo_vendedor = COALESCE(NULLIF($1,''), codigo_vendedor),
           rut = COALESCE(NULLIF($2,''), rut),
           permiso_descuentos = $3
         WHERE LOWER(email) = $4 OR LOWER(nombre) = $5`,
        [o.codigo_vendedor || null, o.rut || null, o.permiso_descuentos === 'si' || o.permiso_descuentos === '1', login, (o.nombre_usuario || '').toLowerCase()]);
      updated += r2.rowCount;
    }
    console.log(`users updated: ${updated}/${data.usuarios_sistema.rows.length}`);
  }

  // 13. bodega_taller catalog (taller materiales)
  if (data.bodega_taller && data.bodega_taller.rows.length) {
    const rows = data.bodega_taller.rows.map(r => {
      const o = rowAsObj(data.bodega_taller.cols, r);
      return [o.id, o.codigo_interno || `BT-${o.id}`, o.codigo_barra || null, o.nombre || '', o.unidad_medida || null,
        o.categoria || null, o.subcategoria || null, parseFloat(o.stock_critico) || 0, parseFloat(o.stock) || 0,
        o.proveedor || null, o.sucursal || null, parseFloat(o.precio1) || 0, true];
    });
    const n = await bulkInsert(pgClient, 'taller', 'bodega_taller',
      ['id', 'codigo_interno', 'codigo_barra', 'nombre', 'unidad_medida', 'categoria_id', 'subcategoria_id',
       'stock_critico', 'stock', 'proveedor_id', 'sucursal_id', 'precio', 'activo'],
      rows, { onConflict: 'ON CONFLICT (codigo_interno) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('taller.bodega_taller','id'), GREATEST((SELECT MAX(id) FROM taller.bodega_taller), 1))`);
    console.log(`bodega_taller: ${n} inserted`);
  }

  // 14. accesos / accesos_ventas → auth.accesos
  for (const src of ['accesos', 'accesos_ventas']) {
    if (!data[src] || !data[src].rows.length) continue;
    const userMap = new Map();
    const u = await exec(pgClient, `SELECT id, LOWER(email) email, LOWER(nombre) nombre FROM auth.users`);
    for (const row of u.rows) { userMap.set(row.email, row.id); userMap.set(row.nombre, row.id); }
    const origen = src === 'accesos_ventas' ? 'ventas' : 'erp';
    const rows = data[src].rows.map(r => {
      const o = rowAsObj(data[src].cols, r);
      const key = (o.usuario || '').toLowerCase();
      return [userMap.get(key) || null, o.usuario || '', origen, o.estado || 'login', null, null, dt(o.fecha)];
    });
    const n = await bulkInsert(pgClient, 'auth', 'accesos',
      ['user_id', 'usuario', 'origen', 'estado', 'ip', 'user_agent', 'fecha'], rows);
    console.log(`accesos (${src}): ${n} inserted`);
  }

  // 15. telas (catalog) + historico_telas (movimientos)
  if (data.telas && data.telas.rows.length) {
    const rows = data.telas.rows.map(r => {
      const o = rowAsObj(data.telas.cols, r);
      return [o.id, o.codigo || `TELA-${o.id}`, o.tipo || null, o.nombre || null, o.ubicacion || null, 0, true, dt(o.fecha) || new Date()];
    });
    const n = await bulkInsert(pgClient, 'taller', 'telas',
      ['id', 'codigo', 'tipo', 'nombre', 'ubicacion', 'stock', 'activo', 'created_at'], rows,
      { onConflict: 'ON CONFLICT (codigo) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('taller.telas','id'), GREATEST((SELECT MAX(id) FROM taller.telas), 1))`);
    console.log(`telas: ${n} inserted`);
  }
  if (data.historico_telas && data.historico_telas.rows.length) {
    const telaMap = new Map();
    const t = await exec(pgClient, `SELECT id, codigo FROM taller.telas`);
    for (const row of t.rows) telaMap.set(row.codigo, row.id);
    const rows = [];
    let missing = 0;
    for (const r of data.historico_telas.rows) {
      const o = rowAsObj(data.historico_telas.cols, r);
      const telaId = telaMap.get(o.codigo);
      if (!telaId) { missing++; continue; }
      const ingreso = parseFloat(o.ingreso) || 0;
      const egreso = parseFloat(o.egreso) || 0;
      const tipo = ingreso > 0 ? 'ingreso' : 'egreso';
      const cantidad = ingreso > 0 ? ingreso : egreso;
      rows.push([telaId, tipo, cantidad, o.factura || null, o.cortador || null, o.ubicacion || null, o.usuario || null, dt(o.fecha) || new Date()]);
    }
    if (rows.length) {
      const n = await bulkInsert(pgClient, 'taller', 'tela_movimientos',
        ['tela_id', 'tipo', 'cantidad', 'factura', 'cortador', 'ubicacion', 'usuario', 'fecha'], rows);
      console.log(`tela_movimientos: ${n} inserted (skipped ${missing} w/o tela)`);
      // Recompute stock per tela
      await exec(pgClient, `UPDATE taller.telas t SET stock = COALESCE((SELECT SUM(CASE WHEN tipo='ingreso' THEN cantidad ELSE -cantidad END) FROM taller.tela_movimientos WHERE tela_id = t.id), 0)`);
    }
  }

  // 16. cotizacion_licitacion + items
  if (data.cotizacion_licitacion && data.cotizacion_licitacion.rows.length) {
    const rows = data.cotizacion_licitacion.rows.map(r => {
      const o = rowAsObj(data.cotizacion_licitacion.cols, r);
      return [o.id, o.id_licitacion || `LIC-${o.id}`, dt(o.fecha), dt(o.fecha_creacion) || new Date(),
        o.usuario || null, o.estado || 'Pendiente', o.rut_cliente || null, o.obs || null,
        dt(o.plazo), o.orden_compra || null, o.sucursal || null, o.referencia || null];
    });
    const n = await bulkInsert(pgClient, 'ventas', 'cotizacion_licitacion',
      ['id', 'id_licitacion', 'fecha', 'fecha_creacion', 'usuario', 'estado', 'rut_cliente', 'obs',
       'plazo', 'orden_compra', 'sucursal_id', 'referencia'], rows,
      { onConflict: 'ON CONFLICT (id) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('ventas.cotizacion_licitacion','id'), GREATEST((SELECT MAX(id) FROM ventas.cotizacion_licitacion), 1))`);
    console.log(`cotizacion_licitacion: ${n} inserted`);
  }
  if (data.productos_cotizados_licitacion && data.productos_cotizados_licitacion.rows.length) {
    const cotMap = new Map();
    const c = await exec(pgClient, `SELECT id, id_licitacion FROM ventas.cotizacion_licitacion`);
    for (const row of c.rows) cotMap.set(row.id_licitacion, row.id);
    const rows = [];
    let missing = 0;
    for (const r of data.productos_cotizados_licitacion.rows) {
      const o = rowAsObj(data.productos_cotizados_licitacion.cols, r);
      const cid = cotMap.get(o.id_licitacion);
      if (!cid) { missing++; continue; }
      rows.push([cid, o.codigo_interno || null, o.nombre || null, o.descripcion || null,
        parseInt(o.cant) || 0, parseInt(o.cant_adjudicados) || 0, parseFloat(o.precio) || 0]);
    }
    if (rows.length) {
      const n = await bulkInsert(pgClient, 'ventas', 'cotizacion_licitacion_items',
        ['cotizacion_id', 'codigo_interno', 'nombre', 'descripcion', 'cantidad', 'cant_adjudicados', 'precio'], rows);
      console.log(`cotizacion_licitacion_items: ${n} inserted (skipped ${missing} w/o cotizacion)`);
    }
  }

  // 17. orden_compra → orden_compra_online + productos_comprados → items
  if (data.orden_compra && data.orden_compra.rows.length) {
    const rows = data.orden_compra.rows.map(r => {
      const o = rowAsObj(data.orden_compra.cols, r);
      return [o.id, String(o.n_compra), dt(o.fecha_hora) || new Date(), dt(o.fecha_cotizacion),
        o.email_comprador || null, parseFloat(o.total) || 0, o.estado_compra || null,
        o.tipo_documento || null, o.codigo_vendedor || null, o.sucursal || null,
        o.obs_cliente || null, o.canal || null, o.texto_pie || null, o.tipo_cotizacion || null,
        parseFloat(o.costo_envio) || 0, o.cargo_servicio || null, o.historial_cargo || null,
        parseInt(o.n_impresiones) || 0, parseInt(o.crm) || null, dt(o.fecha_hora) || new Date()];
    });
    const n = await bulkInsert(pgClient, 'ventas', 'orden_compra_online',
      ['id', 'n_compra', 'fecha_hora', 'fecha_cotizacion', 'email_comprador', 'total',
       'estado_compra', 'tipo_documento', 'codigo_vendedor', 'sucursal_id', 'obs_cliente',
       'canal', 'texto_pie', 'tipo_cotizacion', 'costo_envio', 'cargo_servicio',
       'historial_cargo', 'n_impresiones', 'crm_id', 'created_at'], rows,
      { onConflict: 'ON CONFLICT (n_compra) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('ventas.orden_compra_online','id'), GREATEST((SELECT MAX(id) FROM ventas.orden_compra_online), 1))`);
    console.log(`orden_compra_online: ${n} inserted`);
  }
  if (data.productos_comprados && data.productos_comprados.rows.length) {
    const ocMap = new Map();
    const c = await exec(pgClient, `SELECT id, n_compra FROM ventas.orden_compra_online`);
    for (const row of c.rows) ocMap.set(row.n_compra, row.id);
    const rows = [];
    let missing = 0;
    for (const r of data.productos_comprados.rows) {
      const o = rowAsObj(data.productos_comprados.cols, r);
      const ocId = ocMap.get(String(o.n_compra));
      if (!ocId) { missing++; continue; }
      rows.push([ocId, o.codigo_interno || null, o.nombre || null, o.descripcion || null,
        parseInt(o.cant) || 0, parseFloat(o.precio) || 0]);
    }
    if (rows.length) {
      const n = await bulkInsert(pgClient, 'ventas', 'orden_compra_online_items',
        ['orden_compra_id', 'codigo_interno', 'nombre', 'descripcion', 'cantidad', 'precio'], rows);
      console.log(`orden_compra_online_items: ${n} inserted (skipped ${missing} w/o orden)`);
    }
  }

  // 18. productos_comprados_local → orden_items (vincular por n_interno)
  if (data.productos_comprados_local && data.productos_comprados_local.rows.length) {
    const ordMap = new Map();
    const o2 = await exec(pgClient, `SELECT id, n_interno FROM ventas.ordenes WHERE n_interno IS NOT NULL`);
    for (const row of o2.rows) ordMap.set(row.n_interno, row.id);
    const prodMap = new Map();
    const p = await exec(pgClient, `SELECT id, codigo_interno FROM catalogo.productos WHERE codigo_interno IS NOT NULL`);
    for (const row of p.rows) prodMap.set(row.codigo_interno, row.id);
    const rows = [];
    let missingOrd = 0, missingProd = 0;
    for (const r of data.productos_comprados_local.rows) {
      const o = rowAsObj(data.productos_comprados_local.cols, r);
      const oid = ordMap.get(o.n_interno);
      if (!oid) { missingOrd++; continue; }
      const pid = prodMap.get(o.codigo_interno) || null;
      if (!pid) missingProd++;
      rows.push([oid, pid || 0, o.codigo_interno || null, o.nombre || null, o.descripcion || null,
        parseInt(o.cant) || 0, parseInt(o.n_entregados) || 0, parseFloat(o.precio) || 0,
        parseFloat(o.precio_coniva) || null, parseFloat(o.cargo_transporte) || 0,
        o.eliminado === 1 || o.eliminado === '1', o.user || null, dt(o.fecham)]);
    }
    if (rows.length) {
      const n = await bulkInsert(pgClient, 'ventas', 'orden_items',
        ['orden_id', 'producto_id', 'codigo_interno', 'nombre', 'descripcion',
         'cantidad', 'n_entregados', 'precio_unitario', 'precio_con_iva',
         'cargo_transporte', 'eliminado', 'user_mod', 'fecham'], rows);
      console.log(`orden_items: ${n} inserted (skipped ${missingOrd} w/o orden, ${missingProd} w/o producto)`);
    }
  }

  // 19. productos_taller → odt_items + odt_item_talleres (3 talleres concurrentes)
  if (data.productos_taller && data.productos_taller.rows.length) {
    const odtMap = new Map();
    const o3 = await exec(pgClient, `SELECT id, "ordenId" AS orden_id FROM (SELECT id, orden_id AS "ordenId" FROM taller.odts) x WHERE x."ordenId" IS NOT NULL`);
    for (const row of o3.rows) odtMap.set(row.orden_id, row.id);
    // Note: legacy has odt.n_interno linking to orden's n_interno. v2 odts.orden_id is FK to ordenes.id.
    // Need re-map: legacy productos_taller.n_interno = orden.n_interno → orden.id → odts.orden_id → odts.id
    const ordToOdt = new Map();
    const odts = await exec(pgClient, `SELECT o.id AS odt_id, ord.n_interno FROM taller.odts o JOIN ventas.ordenes ord ON ord.id = o.orden_id WHERE ord.n_interno IS NOT NULL`);
    for (const row of odts.rows) ordToOdt.set(row.n_interno, row.odt_id);
    const prodMap = new Map();
    const p = await exec(pgClient, `SELECT id, codigo_interno FROM catalogo.productos WHERE codigo_interno IS NOT NULL`);
    for (const row of p.rows) prodMap.set(row.codigo_interno, row.id);
    const tallerMap = new Map([['confecciones', 1], ['espumas', 2], ['externo', 3]]);

    const itemRows = [];
    const tallerRows = [];
    let missing = 0;
    for (const r of data.productos_taller.rows) {
      const o = rowAsObj(data.productos_taller.cols, r);
      const odtId = ordToOdt.get(o.n_interno);
      if (!odtId) { missing++; continue; }
      const pid = prodMap.get(o.codigo_interno) || 0;
      itemRows.push({
        odt_id: odtId, producto_id: pid, codigo_interno: o.codigo_interno || null,
        nombre: o.nombre || null, obs: o.obs || null,
        estado: o.estado || 'pendiente', cantidad: parseInt(o.cant) || 0,
        fecha_listo: dt(o.fecha_listo), usuario: o.user || null,
        eliminado: o.eliminado === 1,
        _talleres: [
          { taller: o.taller_confecciones, estado: o.estado_confecciones, obs: o.obs_confecciones, fechaInicio: dt(o.fecha_confe_inicio), fechaListo: dt(o.fecha_listo), usuario: o.usuario_confe, usuarioListo: o.usuario_listo_confe },
          { taller: o.taller_espumas, estado: o.estado_espumas, obs: o.obs_espumas, fechaInicio: null, fechaListo: dt(o.fecha_listo_espuma), usuario: null, usuarioListo: null },
          { taller: o.taller_externo, estado: o.estado_externo, obs: o.obs_externo, fechaInicio: null, fechaListo: null, usuario: null, usuarioListo: null },
        ]
      });
    }
    // Insert items first
    const chunkSize = 500;
    let insertedItems = 0;
    for (let s = 0; s < itemRows.length; s += chunkSize) {
      const slice = itemRows.slice(s, s + chunkSize);
      const params = [];
      const tuples = slice.map(i => {
        const vals = [i.odt_id, i.producto_id, i.codigo_interno, i.nombre, i.obs, i.estado, i.cantidad, i.fecha_listo, i.usuario, i.eliminado];
        const ph = vals.map(v => { params.push(v); return `$${params.length}`; });
        return `(${ph.join(',')})`;
      });
      const sql = `INSERT INTO taller.odt_items (odt_id, producto_id, codigo_interno, nombre, obs, estado, cantidad, fecha_listo, usuario, eliminado) VALUES ${tuples.join(',')} RETURNING id`;
      const res = await pgClient.query(sql, params);
      slice.forEach((it, idx) => { it._id = res.rows[idx].id; });
      insertedItems += res.rowCount;
    }
    console.log(`odt_items: ${insertedItems} inserted (skipped ${missing} w/o ODT)`);

    // Now odt_item_talleres
    for (const it of itemRows) {
      for (const t of it._talleres) {
        if (!t.taller) continue;
        const tid = tallerMap.get(String(t.taller).toLowerCase());
        if (!tid) continue;
        tallerRows.push([it._id, tid, t.estado || 'pendiente', t.obs || null, t.fechaInicio, t.fechaListo, t.usuario, t.usuarioListo]);
      }
    }
    if (tallerRows.length) {
      const n = await bulkInsert(pgClient, 'taller', 'odt_item_talleres',
        ['odt_item_id', 'taller_id', 'estado', 'obs', 'fecha_inicio', 'fecha_listo', 'usuario', 'usuario_listo'],
        tallerRows, { onConflict: 'ON CONFLICT (odt_item_id, taller_id) DO NOTHING' });
      console.log(`odt_item_talleres: ${n} inserted`);
    }
  }

  // 20. pagos_proveedores
  if (data.pagos_proveedores && data.pagos_proveedores.rows.length) {
    const provMap = new Map();
    const p = await exec(pgClient, `SELECT id, codigo_proveedor FROM catalogo.proveedores WHERE codigo_proveedor IS NOT NULL`);
    for (const row of p.rows) provMap.set(row.codigo_proveedor, row.id);
    const rows = data.pagos_proveedores.rows.map(r => {
      const o = rowAsObj(data.pagos_proveedores.cols, r);
      return [o.id, provMap.get(o.codigo_proveedor) || null, o.codigo_proveedor || null, o.sucursal || null,
        o.documento || null, String(o.n_doc || ''), dt(o.fecha_doc), dt(o.fecha_pago),
        dt(o.fecha_vencimiento), o.estado || 'Pendiente', parseFloat(o.total) || 0,
        o.usuario || null, o.bodega || null, (o.nc && o.nc !== 0), String(o.nc || ''),
        parseFloat(o.nc_monto) || null, o.obs || null, dt(o.fecha_creacion) || new Date()];
    });
    const n = await bulkInsert(pgClient, 'catalogo', 'pagos_proveedores',
      ['id', 'proveedor_id', 'codigo_proveedor', 'sucursal_id', 'documento', 'n_doc',
       'fecha_doc', 'fecha_pago', 'fecha_vencimiento', 'estado', 'total', 'usuario',
       'bodega', 'nc', 'nc_numero', 'nc_monto', 'obs', 'created_at'], rows,
      { onConflict: 'ON CONFLICT (id) DO NOTHING' });
    await exec(pgClient, `SELECT setval(pg_get_serial_sequence('catalogo.pagos_proveedores','id'), GREATEST((SELECT MAX(id) FROM catalogo.pagos_proveedores), 1))`);
    console.log(`pagos_proveedores: ${n} inserted`);
  }
  if (data.detalle_facturas_bodega && data.detalle_facturas_bodega.rows.length) {
    const rows = data.detalle_facturas_bodega.rows.map(r => {
      const o = rowAsObj(data.detalle_facturas_bodega.cols, r);
      return [o.id_pago, o.codigo_interno || '', parseFloat(o.cant) || 0, parseFloat(o.precio) || 0];
    });
    const n = await bulkInsert(pgClient, 'catalogo', 'detalle_facturas_proveedor',
      ['pago_id', 'codigo_interno', 'cantidad', 'precio'], rows);
    console.log(`detalle_facturas_proveedor: ${n} inserted`);
  }

  // 0b. Backfill taller.odts.orden_id via legacy odts.n_interno → ventas.ordenes.n_interno
  if (data.odts && data.odts.rows.length) {
    const ordMap = new Map();
    const ord = await exec(pgClient, `SELECT id, n_interno FROM ventas.ordenes WHERE n_interno IS NOT NULL`);
    for (const row of ord.rows) ordMap.set(row.n_interno, row.id);
    const odtIds = new Set();
    const o2 = await exec(pgClient, `SELECT id FROM taller.odts`);
    for (const row of o2.rows) odtIds.add(row.id);
    let updated = 0, missingOrd = 0, missingOdt = 0;
    for (const r of data.odts.rows) {
      const o = rowAsObj(data.odts.cols, r);
      if (!odtIds.has(o.id)) { missingOdt++; continue; }
      const oid = ordMap.get(o.n_interno);
      if (!oid) { missingOrd++; continue; }
      const r2 = await exec(pgClient, `UPDATE taller.odts SET orden_id = $1 WHERE id = $2 AND orden_id IS NULL`, [oid, o.id]);
      updated += r2.rowCount;
    }
    console.log(`odts backfilled: ${updated} (no v2 odt: ${missingOdt}, no orden: ${missingOrd})`);
  }

  // 0. Backfill ventas.ordenes legacy columns from orden_compra_sistema (n_interno, fecham, etc.)
  if (data.orden_compra_sistema && data.orden_compra_sistema.rows.length) {
    const existing = await exec(pgClient, `SELECT id FROM ventas.ordenes`);
    const idSet = new Set(existing.rows.map(r => r.id));
    let updated = 0, skipped = 0;
    for (const r of data.orden_compra_sistema.rows) {
      const o = rowAsObj(data.orden_compra_sistema.cols, r);
      if (!idSet.has(o.id)) { skipped++; continue; }
      const r2 = await exec(pgClient,
        `UPDATE ventas.ordenes SET
           n_interno = COALESCE($1, n_interno),
           rut_cliente = COALESCE($2, rut_cliente),
           email_cliente = COALESCE($3, email_cliente),
           eliminada = COALESCE($4, eliminada),
           fecham = COALESCE($5, fecham),
           user_mod = COALESCE($6, user_mod),
           n_impresiones = COALESCE($7, n_impresiones),
           fecha_estado_entrega = COALESCE($8, fecha_estado_entrega)
         WHERE id = $9`,
        [o.n_interno || null, o.rut_cliente || null, o.email_cliente || null,
         (o.eliminada === 1 || o.eliminada === '1'), dt(o.fecham), o.user_mod || null,
         parseInt(o.n_impresiones) || 0, dt(o.fecha_estado_entrega), o.id]);
      updated += r2.rowCount;
    }
    console.log(`ordenes backfilled: ${updated} (skipped ${skipped} not in v2)`);
  }

  await pgClient.end();
  console.log('done.');
}

main().catch(e => { console.error(e); process.exit(1); });
