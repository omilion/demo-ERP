// Normaliza region/comuna existentes en clientes.clientes y
// clientes.cliente_sucursales contra el catalogo oficial de 16 regiones,
// para que calcen con el desplegable nuevo del frontend. Setea pais='Chile'
// donde este null (default ya cubre nuevos registros).
//
// Uso:
//   node scripts/normalize-clientes-geo.mjs           -> dry-run
//   node scripts/normalize-clientes-geo.mjs --apply   -> escribe

import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('Falta DATABASE_URL'); process.exit(1); }

const REGIONES = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana de Santiago', "Libertador General Bernardo O'Higgins",
  'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos',
  'Aysén del General Carlos Ibáñez del Campo', 'Magallanes y de la Antártica Chilena',
];

const REGION_ALIASES = {
  'rm': 'Metropolitana de Santiago',
  'region metropolitana': 'Metropolitana de Santiago',
  'region metropolitana de santiago': 'Metropolitana de Santiago',
  'metropolitana': 'Metropolitana de Santiago',
  'santiago': 'Metropolitana de Santiago',
  'ohiggins': "Libertador General Bernardo O'Higgins",
  'o higgins': "Libertador General Bernardo O'Higgins",
  'libertador bernardo ohiggins': "Libertador General Bernardo O'Higgins",
  'bio bio': 'Biobío',
  'biobio': 'Biobío',
  'araucania': 'La Araucanía',
  'valparaiso': 'Valparaíso',
  'aysen': 'Aysén del General Carlos Ibáñez del Campo',
  'magallanes': 'Magallanes y de la Antártica Chilena',
  'nuble': 'Ñuble',
  // numeros romanos legacy (mapeo best-effort a la region moderna equivalente)
  'i': 'Tarapacá', 'ii': 'Antofagasta', 'iii': 'Atacama', 'iv': 'Coquimbo',
  'v': 'Valparaíso', 'vi': "Libertador General Bernardo O'Higgins", 'vii': 'Maule',
  'viii': 'Biobío', 'ix': 'La Araucanía', 'x': 'Los Lagos', 'xi': 'Aysén del General Carlos Ibáñez del Campo',
  'xii': 'Magallanes y de la Antártica Chilena', 'xiv': 'Los Ríos', 'xv': 'Arica y Parinacota',
  // ordinales en palabras
  'primera': 'Tarapacá', 'segunda': 'Antofagasta', 'tercera': 'Atacama', 'cuarta': 'Coquimbo',
  'quinta': 'Valparaíso', 'sexta': "Libertador General Bernardo O'Higgins", 'septima': 'Maule',
  'séptima': 'Maule', 'octava': 'Biobío', 'novena': 'La Araucanía', 'decima': 'Los Lagos',
  'décima': 'Los Lagos', 'undecima': 'Aysén del General Carlos Ibáñez del Campo',
  'decimoprimera': 'Aysén del General Carlos Ibáñez del Campo',
  'duodecima': 'Magallanes y de la Antártica Chilena', 'decimosegunda': 'Magallanes y de la Antártica Chilena',
  'decimocuarta': 'Los Ríos', 'decimoquinta': 'Arica y Parinacota', 'decimosexta': 'Ñuble',
  // variantes sueltas
  'rios': 'Los Ríos', 'de los rios': 'Los Ríos', 'los rios': 'Los Ríos',
  'arica parinacota': 'Arica y Parinacota', 'arica y parinacota': 'Arica y Parinacota',
  'met': 'Metropolitana de Santiago',
};

const COMUNAS_POR_REGION = {
  'Arica y Parinacota': ['Arica', 'Camarones', 'Putre', 'General Lagos'],
  'Tarapacá': ['Iquique', 'Alto Hospicio', 'Pozo Almonte', 'Camiña', 'Colchane', 'Huara', 'Pica'],
  'Antofagasta': ['Antofagasta', 'Mejillones', 'Sierra Gorda', 'Taltal', 'Calama', 'Ollagüe', 'San Pedro de Atacama', 'Tocopilla', 'María Elena'],
  'Atacama': ['Copiapó', 'Caldera', 'Tierra Amarilla', 'Chañaral', 'Diego de Almagro', 'Vallenar', 'Alto del Carmen', 'Freirina', 'Huasco'],
  'Coquimbo': ['La Serena', 'Coquimbo', 'Andacollo', 'La Higuera', 'Paihuano', 'Vicuña', 'Illapel', 'Canela', 'Los Vilos', 'Salamanca', 'Ovalle', 'Combarbalá', 'Monte Patria', 'Punitaqui', 'Río Hurtado'],
  'Valparaíso': ['Valparaíso', 'Casablanca', 'Concón', 'Juan Fernández', 'Puchuncaví', 'Quintero', 'Viña del Mar', 'Isla de Pascua', 'Los Andes', 'Calle Larga', 'Rinconada', 'San Esteban', 'La Ligua', 'Cabildo', 'Papudo', 'Petorca', 'Zapallar', 'Quillota', 'La Calera', 'Hijuelas', 'La Cruz', 'Nogales', 'San Antonio', 'Algarrobo', 'Cartagena', 'El Quisco', 'El Tabo', 'Santo Domingo', 'San Felipe', 'Catemu', 'Llaillay', 'Panquehue', 'Putaendo', 'Santa María', 'Quilpué', 'Limache', 'Olmué', 'Villa Alemana'],
  'Metropolitana de Santiago': ['Santiago', 'Cerrillos', 'Cerro Navia', 'Conchalí', 'El Bosque', 'Estación Central', 'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja', 'La Pintana', 'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú', 'Ñuñoa', 'Pedro Aguirre Cerda', 'Peñalolén', 'Providencia', 'Pudahuel', 'Quilicura', 'Quinta Normal', 'Recoleta', 'Renca', 'San Joaquín', 'San Miguel', 'San Ramón', 'Vitacura', 'Puente Alto', 'Pirque', 'San José de Maipo', 'Colina', 'Lampa', 'Tiltil', 'San Bernardo', 'Buin', 'Calera de Tango', 'Paine', 'Melipilla', 'Alhué', 'Curacaví', 'María Pinto', 'San Pedro', 'Talagante', 'El Monte', 'Isla de Maipo', 'Padre Hurtado', 'Peñaflor'],
  "Libertador General Bernardo O'Higgins": ['Rancagua', 'Codegua', 'Coinco', 'Coltauco', 'Doñihue', 'Graneros', 'Las Cabras', 'Machalí', 'Malloa', 'Mostazal', 'Olivar', 'Peumo', 'Pichidegua', 'Quinta de Tilcoco', 'Rengo', 'Requínoa', 'San Vicente', 'Pichilemu', 'La Estrella', 'Litueche', 'Marchihue', 'Navidad', 'Paredones', 'San Fernando', 'Chépica', 'Chimbarongo', 'Lolol', 'Nancagua', 'Palmilla', 'Peralillo', 'Placilla', 'Pumanque', 'Santa Cruz'],
  'Maule': ['Talca', 'Constitución', 'Curepto', 'Empedrado', 'Maule', 'Pelarco', 'Pencahue', 'Río Claro', 'San Clemente', 'San Rafael', 'Cauquenes', 'Chanco', 'Pelluhue', 'Curicó', 'Hualañé', 'Licantén', 'Molina', 'Rauco', 'Romeral', 'Sagrada Familia', 'Teno', 'Vichuquén', 'Linares', 'Colbún', 'Longaví', 'Parral', 'Retiro', 'San Javier', 'Villa Alegre', 'Yerbas Buenas'],
  'Ñuble': ['Chillán', 'Chillán Viejo', 'Bulnes', 'Cobquecura', 'Coelemu', 'Coihueco', 'El Carmen', 'Ninhue', 'Ñiquén', 'Pemuco', 'Pinto', 'Portezuelo', 'Quillón', 'Quirihue', 'Ránquil', 'San Carlos', 'San Fabián', 'San Ignacio', 'San Nicolás', 'Treguaco', 'Yungay'],
  'Biobío': ['Concepción', 'Coronel', 'Chiguayante', 'Florida', 'Hualqui', 'Lota', 'Penco', 'San Pedro de la Paz', 'Santa Juana', 'Talcahuano', 'Tomé', 'Hualpén', 'Lebu', 'Arauco', 'Cañete', 'Contulmo', 'Curanilahue', 'Los Álamos', 'Tirúa', 'Los Ángeles', 'Antuco', 'Cabrero', 'Laja', 'Mulchén', 'Nacimiento', 'Negrete', 'Quilaco', 'Quilleco', 'San Rosendo', 'Santa Bárbara', 'Tucapel', 'Yumbel', 'Alto Biobío'],
  'La Araucanía': ['Temuco', 'Carahue', 'Cunco', 'Curarrehue', 'Freire', 'Galvarino', 'Gorbea', 'Lautaro', 'Loncoche', 'Melipeuco', 'Nueva Imperial', 'Padre las Casas', 'Perquenco', 'Pitrufquén', 'Pucón', 'Saavedra', 'Teodoro Schmidt', 'Toltén', 'Vilcún', 'Villarrica', 'Cholchol', 'Angol', 'Collipulli', 'Curacautín', 'Ercilla', 'Lonquimay', 'Los Sauces', 'Lumaco', 'Purén', 'Renaico', 'Traiguén', 'Victoria'],
  'Los Ríos': ['Valdivia', 'Corral', 'Lanco', 'Los Lagos', 'Máfil', 'Mariquina', 'Paillaco', 'Panguipulli', 'La Unión', 'Futrono', 'Lago Ranco', 'Río Bueno'],
  'Los Lagos': ['Puerto Montt', 'Calbuco', 'Cochamó', 'Fresia', 'Frutillar', 'Los Muermos', 'Llanquihue', 'Maullín', 'Puerto Varas', 'Castro', 'Ancud', 'Chonchi', 'Curaco de Vélez', 'Dalcahue', 'Puqueldón', 'Queilén', 'Quellón', 'Quemchi', 'Quinchao', 'Osorno', 'Puerto Octay', 'Purranque', 'Puyehue', 'Río Negro', 'San Juan de la Costa', 'San Pablo', 'Chaitén', 'Futaleufú', 'Hualaihué', 'Palena'],
  'Aysén del General Carlos Ibáñez del Campo': ['Coyhaique', 'Lago Verde', 'Aysén', 'Cisnes', 'Guaitecas', 'Cochrane', "O'Higgins", 'Tortel', 'Chile Chico', 'Río Ibáñez'],
  'Magallanes y de la Antártica Chilena': ['Punta Arenas', 'Laguna Blanca', 'Río Verde', 'San Gregorio', 'Cabo de Hornos', 'Antártica', 'Porvenir', 'Primavera', 'Timaukel', 'Natales', 'Torres del Paine'],
};

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

const regionByNorm = new Map();
for (const r of REGIONES) regionByNorm.set(norm(r), r);
for (const [alias, canon] of Object.entries(REGION_ALIASES)) regionByNorm.set(alias, canon);

const comunaByNorm = new Map(); // norm(comuna) -> { comuna, region } (global, para match sin region conocida)
const comunasPorRegionNorm = new Map(); // region canonica -> Map(norm(comuna) -> comuna)
for (const [region, comunas] of Object.entries(COMUNAS_POR_REGION)) {
  const map = new Map();
  for (const c of comunas) {
    map.set(norm(c), c);
    if (!comunaByNorm.has(norm(c))) comunaByNorm.set(norm(c), { comuna: c, region });
  }
  comunasPorRegionNorm.set(region, map);
}

function matchRegion(raw) {
  const key = norm(raw);
  if (!key) return null;
  if (regionByNorm.has(key)) return regionByNorm.get(key);
  // "VI Region" / "Region de la Araucania" -> quita la palabra region/región y reintenta
  const stripped = key.replace(/\bregi[oó]n\b/g, '').replace(/\bde\s+la\b/g, '').trim().replace(/\s+/g, ' ');
  if (stripped && regionByNorm.has(stripped)) return regionByNorm.get(stripped);
  // Valor es en realidad una comuna conocida (dato en la columna equivocada) -> infiere region
  const asComuna = comunaByNorm.get(key);
  if (asComuna) return asComuna.region;
  return null;
}

function matchComuna(raw, regionCanonica) {
  const key = norm(raw);
  if (!key) return null;
  if (regionCanonica && comunasPorRegionNorm.get(regionCanonica)?.has(key)) {
    return comunasPorRegionNorm.get(regionCanonica).get(key);
  }
  const global = comunaByNorm.get(key);
  return global ? global.comuna : null;
}

async function processTable(pgc, schema, table) {
  const rows = (await pgc.query(`SELECT id, region, comuna, pais FROM ${schema}.${table}`)).rows;
  let regionFixed = 0, regionUnmatched = new Set(), comunaFixed = 0, comunaUnmatched = new Set(), paisSet = 0;
  const updates = [];
  for (const row of rows) {
    const newRegion = matchRegion(row.region);
    if (row.region && !newRegion) regionUnmatched.add(row.region);
    const regionForComunaMatch = newRegion || null;
    const newComuna = matchComuna(row.comuna, regionForComunaMatch);
    if (row.comuna && !newComuna) comunaUnmatched.add(row.comuna);
    const newPais = row.pais || 'Chile';

    const changed = (newRegion && newRegion !== row.region) || (newComuna && newComuna !== row.comuna) || (newPais !== row.pais);
    if (!changed) continue;
    if (newRegion && newRegion !== row.region) regionFixed++;
    if (newComuna && newComuna !== row.comuna) comunaFixed++;
    if (newPais !== row.pais) paisSet++;
    updates.push({ id: row.id, region: newRegion || row.region, comuna: newComuna || row.comuna, pais: newPais });
  }

  console.log(`\n=== ${schema}.${table} (${rows.length} filas) ===`);
  console.log(`region normalizada: ${regionFixed} | comuna normalizada: ${comunaFixed} | pais seteado: ${paisSet}`);
  console.log(`region sin match (${regionUnmatched.size} valores distintos):`, [...regionUnmatched].slice(0, 20));
  console.log(`comuna sin match (${comunaUnmatched.size} valores distintos):`, [...comunaUnmatched].slice(0, 20));

  if (APPLY && updates.length) {
    for (let i = 0; i < updates.length; i += 500) {
      const chunk = updates.slice(i, i + 500);
      await Promise.all(chunk.map(u =>
        pgc.query(`UPDATE ${schema}.${table} SET region = $1, comuna = $2, pais = $3 WHERE id = $4`, [u.region, u.comuna, u.pais, u.id])
      ));
    }
    console.log(`Aplicado: ${updates.length} filas actualizadas.`);
  }
  return updates.length;
}

async function main() {
  console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  const pgc = new pg.Client({ connectionString: DB_URL });
  await pgc.connect();
  await processTable(pgc, 'clientes', 'clientes');
  await processTable(pgc, 'clientes', 'cliente_sucursales');
  await pgc.end();
}

main().catch(e => { console.error(e); process.exit(1); });
