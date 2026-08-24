// Dry-run (default) o APPLY: canonicaliza vendedores dispersos en
// ventas.ordenes.creador_nombre / ventas.crm_registros.ejecutiva hacia
// cuentas reales en auth.users, usando usuarios_sistema (legacy) como fuente
// de nombre/codigo_vendedor cuando existe, y auto-normalizacion (case/trim/
// sufijo numerico) cuando no.
//
// Uso:
//   node scripts/vendedor-canonicalize.mjs                -> solo reporte
//   node scripts/vendedor-canonicalize.mjs --apply         -> escribe (prod real)
//
// DUMP1/DUMP3 son los dumps legacy usados para poblar usuarios_sistema
// (13-05 y 08-11 respectivamente; dump3 gana en conflicto de id_usuario).

import pg from 'pg';
import bcrypt from 'bcrypt';
import fs from 'fs';
import readline from 'readline';

const DB_URL = process.env.DATABASE_URL;
const DUMP1 = process.env.DUMP1_PATH || 'D:/downloads/plastim2_plastimar2014 (1).sql';
const DUMP3 = process.env.DUMP3_PATH || 'D:/downloads/plastim2_plastimar2014 (3).sql';
const APPLY = process.argv.includes('--apply');

if (!DB_URL) { console.error('Falta DATABASE_URL'); process.exit(1); }

// ── mini parser de dump MySQL (igual a migrate-legacy-extra.mjs) ──────
function* parseTuples(values) {
  let i = 0, n = values.length;
  while (i < n) {
    while (i < n && (values[i] === ' ' || values[i] === ',' || values[i] === '\n' || values[i] === '\r')) i++;
    if (i >= n || values[i] === ';') return;
    if (values[i] !== '(') throw new Error(`Expected ( at ${i}`);
    i++;
    const tuple = [];
    while (true) {
      while (i < n && values[i] === ' ') i++;
      const ch = values[i];
      if (ch === "'") {
        i++;
        let s = '';
        while (i < n) {
          const c = values[i];
          if (c === '\\') {
            const next = values[i + 1];
            if (next === 'n') s += '\n'; else if (next === 't') s += '\t';
            else if (next === 'r') s += '\r'; else if (next === '0') s += '\0';
            else s += next;
            i += 2;
          } else if (c === "'") {
            if (values[i + 1] === "'") { s += "'"; i += 2; } else { i++; break; }
          } else { s += c; i++; }
        }
        tuple.push(s);
      } else if (ch === 'N' && values.substr(i, 4) === 'NULL') {
        tuple.push(null); i += 4;
      } else if ((ch >= '0' && ch <= '9') || ch === '-' || ch === '.') {
        let j = i;
        while (j < n && /[\d.\-eE+]/.test(values[j])) j++;
        const numStr = values.substring(i, j);
        tuple.push(numStr.includes('.') ? parseFloat(numStr) : parseInt(numStr, 10));
        i = j;
      } else if (ch === ')') break;
      else throw new Error(`Unexpected char "${ch}" at ${i}`);
      while (i < n && values[i] === ' ') i++;
      if (values[i] === ',') { i++; continue; }
      if (values[i] === ')') break;
      throw new Error(`Expected , or ) at ${i}`);
    }
    if (values[i] !== ')') throw new Error(`Expected ) at ${i}`);
    i++;
    yield tuple;
  }
}

function parseInsert(stmt) {
  const m = stmt.match(/^INSERT INTO `([^`]+)`\s*(?:\(([^)]*)\)\s*)?VALUES\s*([\s\S]*?);\s*$/);
  if (!m) return null;
  return { table: m[1], cols: m[2] ? m[2].split(',').map(c => c.trim().replace(/`/g, '')) : null, values: m[3] };
}

async function loadUsuariosSistema(dumpPath) {
  const rows = [];
  let cols = null;
  const stream = fs.createReadStream(dumpPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let buf = '', inStmt = false;
  for await (const line of rl) {
    if (!inStmt) {
      if (line.startsWith('INSERT INTO `usuarios_sistema`')) { buf = line; inStmt = true; }
    } else {
      buf += '\n' + line;
    }
    if (inStmt && line.endsWith(';')) {
      const parsed = parseInsert(buf);
      if (parsed) {
        if (!cols && parsed.cols) cols = parsed.cols;
        for (const t of parseTuples(parsed.values)) rows.push(t);
      }
      break; // usuarios_sistema es un solo INSERT en estos dumps
    }
  }
  rl.close();
  stream.destroy();
  return { cols, rows };
}

function rowAsObj(cols, row) {
  const o = {};
  cols.forEach((c, i) => { o[c] = row[i]; });
  return o;
}

// ── normalizacion ──────────────────────────────────────────────────
function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function baseKey(raw) {
  // lowercase, trim, sin acentos, sin sufijo numerico final (asume re-creacion == misma persona)
  let s = stripAccents(String(raw || '').trim().toLowerCase());
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/(\d+)$/, ''); // quita sufijo numerico final: soledad2 -> soledad
  return s.trim();
}

const EXCLUDE_KEYS = new Set(['admin', 'vendedor', 'test vendedor', 'invitado', 'soporte', '']);

async function main() {
  console.log(`Modo: ${APPLY ? 'APPLY (escribe prod)' : 'DRY-RUN (solo reporte)'}`);

  console.log('Parseando usuarios_sistema de dumps legacy...');
  const d1 = await loadUsuariosSistema(DUMP1);
  const d3 = await loadUsuariosSistema(DUMP3);
  const usMap = new Map(); // id_usuario -> obj
  for (const t of d1.rows) { const o = rowAsObj(d1.cols, t); usMap.set(o.id_usuario, o); }
  for (const t of d3.rows) { const o = rowAsObj(d3.cols, t); usMap.set(o.id_usuario, o); } // dump3 gana
  console.log(`usuarios_sistema fusionado: ${usMap.size} cuentas legacy (dump1=${d1.rows.length}, dump3=${d3.rows.length})`);

  // Indice canonico desde usuarios_sistema: cada cuenta aporta 1 canonical
  // (por codigo_vendedor), indexada por baseKey(login) y baseKey(nombre).
  const canonicalByKey = new Map(); // baseKey -> canonical record
  const collisions = [];
  const setCanon = (key, canon) => {
    if (!key || EXCLUDE_KEYS.has(key)) return;
    const existing = canonicalByKey.get(key);
    if (existing && existing.codigoVendedor !== canon.codigoVendedor) {
      collisions.push({ key, a: existing, b: canon });
      return; // conserva el primero, no pisa silenciosamente
    }
    if (!existing) canonicalByKey.set(key, canon);
  };
  for (const o of usMap.values()) {
    const canon = {
      codigoVendedor: o.codigo_vendedor || null,
      nombre: (o.nombre_usuario || o.login_usuario || '').trim(),
      rut: (o.rut || '').trim() || null,
      logins: new Set([o.login_usuario]),
      source: 'usuarios_sistema',
    };
    setCanon(baseKey(o.login_usuario), canon);
    setCanon(baseKey(o.nombre_usuario), canon);
  }
  if (collisions.length) {
    console.log(`\n!!! ${collisions.length} colisiones de key (2 personas distintas, mismo normalizado) !!!`);
    collisions.forEach(c => console.log(`  key="${c.key}": conservado "${c.a.nombre}"(${c.a.codigoVendedor}) vs descartado "${c.b.nombre}"(${c.b.codigoVendedor})`));
  }

  const pgClient = new pg.Client({ connectionString: DB_URL });
  await pgClient.connect();

  const ordRes = await pgClient.query(`SELECT creador_nombre, count(*)::int n FROM ventas.ordenes GROUP BY 1`);
  const crmRes = await pgClient.query(`SELECT ejecutiva, count(*)::int n FROM ventas.crm_registros WHERE ejecutiva IS NOT NULL GROUP BY 1`);

  // Agrupa raws (ordenes + crm) por baseKey
  const groups = new Map(); // baseKey -> { canon, raws:[{raw,n,src}], totalOrdenes }
  const flagged = []; // strings raras que no calzan (ej "PAULINAC / Anny")

  const ingest = (raw, n, src) => {
    if (raw == null) return;
    const rawStr = String(raw).trim();
    if (!rawStr) { groups.set('', { canon: null, raws: [{ raw: rawStr, n, src }], totalOrdenes: n }); return; }
    if (rawStr.includes('/')) { flagged.push({ raw: rawStr, n, src }); return; }
    const key = baseKey(rawStr);
    if (EXCLUDE_KEYS.has(key)) {
      const g = groups.get(key) || { canon: null, raws: [], totalOrdenes: 0, excluded: true };
      g.raws.push({ raw: rawStr, n, src }); g.totalOrdenes += n;
      groups.set(key, g);
      return;
    }
    let g = groups.get(key);
    if (!g) {
      g = { canon: canonicalByKey.get(key) || null, raws: [], totalOrdenes: 0 };
      groups.set(key, g);
    }
    g.raws.push({ raw: rawStr, n, src });
    g.totalOrdenes += n;
  };

  for (const r of ordRes.rows) ingest(r.creador_nombre, r.n, 'ordenes');
  for (const r of crmRes.rows) ingest(r.ejecutiva, r.n, 'crm_registros');

  // Para grupos sin canonical de usuarios_sistema: fabricar canonical desde
  // el raw "mas bonito" (con mayuscula inicial, o el mas largo si empata).
  for (const [key, g] of groups) {
    if (g.excluded || key === '') continue;
    if (!g.canon) {
      const best = [...g.raws].sort((a, b) => {
        const aProper = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(a.raw) ? 1 : 0;
        const bProper = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(b.raw) ? 1 : 0;
        if (aProper !== bProper) return bProper - aProper;
        return b.raw.length - a.raw.length;
      })[0];
      g.canon = { codigoVendedor: null, nombre: best.raw, rut: null, source: 'auto-normalizado' };
    }
  }

  // ── Reporte ──────────────────────────────────────────────────────
  const realGroups = [...groups.entries()].filter(([k, g]) => k !== '' && !g.excluded);
  realGroups.sort((a, b) => b[1].totalOrdenes - a[1].totalOrdenes);

  console.log(`\n=== ${realGroups.length} vendedores canonicos detectados ===\n`);
  for (const [key, g] of realGroups) {
    const variants = g.raws.map(r => `"${r.raw}"(${r.n})`).join(', ');
    console.log(`[${key}] -> "${g.canon.nombre}" cod=${g.canon.codigoVendedor || '-'} fuente=${g.canon.source} total_ordenes=${g.totalOrdenes}`);
    console.log(`    variantes: ${variants}`);
  }

  console.log(`\n=== Excluidos (genericos/test/vacio) ===`);
  for (const [key, g] of groups) {
    if (key !== '' && !g.excluded) continue;
    const variants = g.raws.map(r => `"${r.raw}"(${r.n})`).join(', ');
    console.log(`${key === '' ? '(vacio)' : key}: ${variants}`);
  }

  console.log(`\n=== Flagged (formato raro, requiere revision manual) ===`);
  flagged.forEach(f => console.log(`"${f.raw}" (${f.n}) src=${f.src}`));

  console.log(`\nTotal vendedores a crear/mapear: ${realGroups.length}`);

  if (!APPLY) {
    console.log('\nDRY-RUN: nada escrito. Corre con --apply para ejecutar.');
    await pgClient.end();
    return;
  }

  // ── APPLY ────────────────────────────────────────────────────────
  console.log('\nAplicando...');
  const placeholderHash = await bcrypt.hash(`legacy-import-${Date.now()}`, 10);
  let created = 0, reused = 0, ordersUpdated = 0, crmUpdated = 0;

  for (const [key, g] of realGroups) {
    const emailSlug = key.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || `vendedor-${created + 1}`;
    const email = `legacy.${emailSlug}@plastimar.cl`;

    // Reusa si ya existe por codigo_vendedor o email exacto
    let userId = null;
    if (g.canon.codigoVendedor) {
      const existing = await pgClient.query(`SELECT id FROM auth.users WHERE codigo_vendedor = $1`, [g.canon.codigoVendedor]);
      if (existing.rows.length) userId = existing.rows[0].id;
    }
    if (!userId) {
      const existing = await pgClient.query(`SELECT id FROM auth.users WHERE email = $1`, [email]);
      if (existing.rows.length) userId = existing.rows[0].id;
    }

    if (userId) {
      reused++;
    } else {
      const ins = await pgClient.query(
        `INSERT INTO auth.users (email, password_hash, role, nombre, rut, codigo_vendedor, permiso_descuentos, activo, created_at)
         VALUES ($1,$2,'vendedor',$3,$4,$5,false,false,NOW()) RETURNING id`,
        [email, placeholderHash, g.canon.nombre, g.canon.rut, g.canon.codigoVendedor]
      );
      userId = ins.rows[0].id;
      created++;
    }

    const rawList = g.raws.filter(r => r.src === 'ordenes').map(r => r.raw);
    if (rawList.length) {
      const r = await pgClient.query(
        `UPDATE ventas.ordenes SET user_id = $1 WHERE creador_nombre = ANY($2::text[])`,
        [userId, rawList]
      );
      ordersUpdated += r.rowCount;
    }
    const rawCrmList = g.raws.filter(r => r.src === 'crm_registros').map(r => r.raw);
    if (rawCrmList.length) {
      const r = await pgClient.query(
        `UPDATE ventas.crm_registros SET vendedor_id = $1 WHERE ejecutiva = ANY($2::text[]) AND vendedor_id IS NULL`,
        [userId, rawCrmList]
      );
      crmUpdated += r.rowCount;
    }
  }

  console.log(`\nusuarios creados: ${created}, reusados: ${reused}`);
  console.log(`ordenes.user_id actualizadas: ${ordersUpdated}`);
  console.log(`crm_registros.vendedor_id actualizadas: ${crmUpdated}`);
  await pgClient.end();
}

main().catch(e => { console.error(e); process.exit(1); });
