// Version standalone para correr EN el VPS (sin depender de los dumps
// locales de 600MB+). usuarios_sistema viene hardcodeado, ya fusionado de
// plastim2_plastimar2014 (1).sql [13-05, 52 cuentas] + (3).sql [08-11, 36
// cuentas, gana en conflicto de id_usuario].
//
// Uso:
//   DATABASE_URL=postgresql://plastimar:PASS@localhost:5432/plastimar_erp node vendedor-canonicalize-vps.mjs
//   ... --apply   para escribir

import pg from 'pg';
import bcrypt from 'bcrypt';

const DB_URL = process.env.DATABASE_URL;
const APPLY = process.argv.includes('--apply');
if (!DB_URL) { console.error('Falta DATABASE_URL'); process.exit(1); }

// [id_usuario, nombre_usuario, login_usuario, codigo_vendedor, rut]
const USUARIOS_SISTEMA = [
  [12, 'Laura Navarro', 'laura', '1006', null],
  [236, 'Tanya Peña Munizaga', 'tanyap', '1203', '17317438-1'],
  [79, 'Mercedes', 'Mercedes', '1064', '44444444-4'],
  [28, 'Zalma', 'zalmataller', '1020', '8.433.714-5'],
  [31, 'Judith', 'Judith', '1023', null],
  [103, 'DIEGO', 'diego', '1085', '16888432-k'],
  [73, 'Anny Torrealba', 'Anny', '1058', '26305866-6'],
  [110, 'Cinthia Palacios', 'Cinthia', '1092', '14601844-0'],
  [154, 'Jonathan Carvajal', 'JONATHANC', '1128', '19.355.772-4'],
  [228, 'ALAIN MOURAS', 'ALAINM', '1195', '18266240-2'],
  [201, 'David Salgado Informatico', 'davidsalgado', '1168', '12676235-6'],
  [150, 'Carolin Diaz', 'Carolin Diaz', '1124', '13020611-5'],
  [184, 'MYRLA TOYO', 'MYRLATORO', '1153', null],
  [255, 'CARLOS ESPINOZA', 'CESPINOZA', '1222', '7451383-2'],
  [164, 'MARISOL', 'MARISOL1', '1138', '66666666-6'],
  [167, 'Sebastian Mella', 'SEBAM', '1141', null],
  [190, 'zalma lobos', 'zalma2', '1159', null],
  [230, 'JENIFER BREIDENBACH', 'jeniferb', '1197', '26110295-1'],
  [229, 'NICOLAS CASTRO', 'NICOLASC', '1196', '19773924-K'],
  [209, 'DANIELA REYES', 'DANIELAR', '1176', '17.983.411-1'],
  [218, 'Humberto Muñoz', 'HUMBERTOM', '1185', '17.804.353-6'],
  [214, 'Benjamin Cañete', 'BENJAMINC', '1181', '21930717-9'],
  [215, 'DYAN ALONSO', 'DYAN', '1182', '18782222-K'],
  [216, 'JORGE IGNACIO GONZALEZ', 'JORGE IGNACIO GONZALEZ', '1183', '20.657.054-7'],
  [219, 'MATIAS FARFAN', 'MATIASF', '1186', '17340326-7'],
  [220, 'Constanza Cabrera', 'constanzac', '1187', '19099138-5'],
  [221, 'MATIAS SILVA', 'MATIAS', '1188', '22222222-2'],
  [222, 'CONSTANZA CABRERA', 'CONSTANZA', '1189', null],
  [223, 'MICHELLE GARCIA', 'MICHELLE', '1190', '11111111-1'],
  [225, 'CATALINA PASTEN', 'CATALINAP', '1192', '19910313-k'],
  [231, 'NATALIA SANDOVAL', 'NATALIAS', '1198', '21205786-k'],
  [232, 'PAULINA CHINCHON', 'PAULINAC', '1199', '17160697-7'],
  [233, 'PAOLA KRUG', 'PAOLA KRUG', '1200', '12012635-0'],
  [234, 'ALEJANDRO NEGRETE', 'ALEJANDRON', '1201', '16.909.267-2'],
  [235, 'CRISTIAN CORTES', 'CRISTIAN CORTES', '1202', '17793281-7'],
  [237, 'Jose Ignacio Molina Figueroa', 'ignaciom', '1204', '19219242-0'],
  [238, 'Aida del Carmen Sayes Castillo', 'carmens', '1205', '10084732-9'],
  [239, 'Diego Muñoz Lara', 'diegoml', '1206', '17568083-7'],
  [240, 'Elizabeth Soledad Hurtado Parrao', 'elizabethsh', '1207', '20280170-6'],
  [241, 'Nicolas Perez Mendoza', 'nicolasp', '1208', '19.153.930-3'],
  [242, 'Diego Avila', 'diegoav', '1209', '17140707-9'],
  [243, 'Alan Morales', 'alanm', '1210', '19775014-6'],
  [244, 'Ana Milena Cruz', 'Anacruz', '1211', '25173364-3'],
  [245, 'Katherine Polanco Puente', 'katherinep', '1212', '16331371-5'],
  [246, 'Carolina Valencia Pinochet', 'carolinav', '1213', '16574474-8'],
  [247, 'Danae Gutierrez', 'danae', '1214', '21530226-1'],
  [248, 'Invitado', 'Invitado', '1215', '55555555-5'],
  [249, 'CATALINA OCARANZA AVILA', 'CATITA', '1216', '16.302.435-7'],
  [250, 'Christopher Jensen', 'christopher', '1217', '15762183-1'],
  [251, 'Dyan Cortes', 'dyanbodega', '1218', '18.782.222-K'],
  [252, 'Felipe Chavez', 'felipec', '1219', '15551812-K'],
  [254, 'Mario Demartini', 'mademartini', '1221', '21378639-3'],
  [256, 'Jonathan Martinez', 'jonathanm', '1223', '17080473-2'],
  [257, 'Christopher Espinoza', 'cespinoza', '1224', '17908843-6'],
  [258, 'Marcela Lacourt', 'mlacourt', '1225', '12865867-k'],
];

function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function baseKey(raw) {
  let s = stripAccents(String(raw || '').trim().toLowerCase()).replace(/\s+/g, ' ');
  s = s.replace(/(\d+)$/, '');
  return s.trim();
}

const EXCLUDE_KEYS = new Set(['admin', 'vendedor', 'test vendedor', 'invitado', 'soporte', '']);

async function main() {
  console.log(`Modo: ${APPLY ? 'APPLY (escribe prod)' : 'DRY-RUN (solo reporte)'}`);

  const canonicalByKey = new Map();
  const collisions = [];
  const setCanon = (key, canon) => {
    if (!key || EXCLUDE_KEYS.has(key)) return;
    const existing = canonicalByKey.get(key);
    if (existing && existing.codigoVendedor !== canon.codigoVendedor) {
      collisions.push({ key, a: existing, b: canon });
      return;
    }
    if (!existing) canonicalByKey.set(key, canon);
  };
  for (const [, nombre, login, codigo, rut] of USUARIOS_SISTEMA) {
    const canon = { codigoVendedor: codigo, nombre, rut, source: 'usuarios_sistema' };
    setCanon(baseKey(login), canon);
    setCanon(baseKey(nombre), canon);
  }
  if (collisions.length) {
    console.log(`\n!!! ${collisions.length} colisiones de key !!!`);
    collisions.forEach(c => console.log(`  key="${c.key}": conservado "${c.a.nombre}"(${c.a.codigoVendedor}) vs descartado "${c.b.nombre}"(${c.b.codigoVendedor})`));
  }

  const pgClient = new pg.Client({ connectionString: DB_URL });
  await pgClient.connect();

  const ordRes = await pgClient.query(`SELECT creador_nombre, count(*)::int n FROM ventas.ordenes GROUP BY 1`);
  const crmRes = await pgClient.query(`SELECT ejecutiva, count(*)::int n FROM ventas.crm_registros WHERE ejecutiva IS NOT NULL GROUP BY 1`);

  const groups = new Map();
  const flagged = [];
  const ingest = (raw, n, src) => {
    if (raw == null) return;
    const rawStr = String(raw).trim();
    if (!rawStr) { const g = groups.get('') || { canon: null, raws: [], totalOrdenes: 0, excluded: true }; g.raws.push({ raw: rawStr, n, src }); g.totalOrdenes += n; groups.set('', g); return; }
    if (rawStr.includes('/')) { flagged.push({ raw: rawStr, n, src }); return; }
    const key = baseKey(rawStr);
    if (EXCLUDE_KEYS.has(key)) {
      const g = groups.get(key) || { canon: null, raws: [], totalOrdenes: 0, excluded: true };
      g.raws.push({ raw: rawStr, n, src }); g.totalOrdenes += n;
      groups.set(key, g);
      return;
    }
    let g = groups.get(key);
    if (!g) { g = { canon: canonicalByKey.get(key) || null, raws: [], totalOrdenes: 0 }; groups.set(key, g); }
    g.raws.push({ raw: rawStr, n, src });
    g.totalOrdenes += n;
  };
  for (const r of ordRes.rows) ingest(r.creador_nombre, r.n, 'ordenes');
  for (const r of crmRes.rows) ingest(r.ejecutiva, r.n, 'crm_registros');

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

  const realGroups = [...groups.entries()].filter(([k, g]) => k !== '' && !g.excluded);
  realGroups.sort((a, b) => b[1].totalOrdenes - a[1].totalOrdenes);

  console.log(`\n=== ${realGroups.length} vendedores canonicos detectados ===\n`);
  for (const [key, g] of realGroups) {
    const variants = g.raws.map(r => `"${r.raw}"(${r.n})`).join(', ');
    console.log(`[${key}] -> "${g.canon.nombre}" cod=${g.canon.codigoVendedor || '-'} fuente=${g.canon.source} total=${g.totalOrdenes}`);
    console.log(`    variantes: ${variants}`);
  }

  console.log(`\n=== Excluidos (genericos/test/vacio) ===`);
  for (const [key, g] of groups) {
    if (key !== '' && !g.excluded) continue;
    const variants = g.raws.map(r => `"${r.raw}"(${r.n})`).join(', ');
    console.log(`${key === '' ? '(vacio)' : key}: ${variants}`);
  }

  console.log(`\n=== Flagged (formato raro) ===`);
  flagged.forEach(f => console.log(`"${f.raw}" (${f.n}) src=${f.src}`));

  console.log(`\nTotal vendedores a crear/mapear: ${realGroups.length}`);

  if (!APPLY) {
    console.log('\nDRY-RUN: nada escrito.');
    await pgClient.end();
    return;
  }

  console.log('\nAplicando...');
  const placeholderHash = await bcrypt.hash(`legacy-import-${Date.now()}`, 10);
  let created = 0, reused = 0, ordersUpdated = 0, crmUpdated = 0;

  for (const [key, g] of realGroups) {
    const emailSlug = key.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || `vendedor-${created + 1}`;
    const email = `legacy.${emailSlug}@plastimar.cl`;

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
      const r = await pgClient.query(`UPDATE ventas.ordenes SET user_id = $1 WHERE creador_nombre = ANY($2::text[])`, [userId, rawList]);
      ordersUpdated += r.rowCount;
    }
    const rawCrmList = g.raws.filter(r => r.src === 'crm_registros').map(r => r.raw);
    if (rawCrmList.length) {
      const r = await pgClient.query(`UPDATE ventas.crm_registros SET vendedor_id = $1 WHERE ejecutiva = ANY($2::text[]) AND vendedor_id IS NULL`, [userId, rawCrmList]);
      crmUpdated += r.rowCount;
    }
  }

  console.log(`\nusuarios creados: ${created}, reusados: ${reused}`);
  console.log(`ordenes.user_id actualizadas: ${ordersUpdated}`);
  console.log(`crm_registros.vendedor_id actualizadas: ${crmUpdated}`);
  await pgClient.end();
}

main().catch(e => { console.error(e); process.exit(1); });
