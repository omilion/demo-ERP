// Reclasifica a tipo "Marketplace" las ventas que hoy estan como Venta sala o
// Venta Web pero que en realidad se vendieron por Falabella, Paris o Mercado
// Libre, y recupera la comision que quedo escrita en las observaciones.
//
// Por que importa: los campos de comision estan vacios en las 16.371 ordenes, de
// modo que el margen de estas ventas esta sobrestimado en los reportes.
//
// Dos niveles de confianza, porque buscar el nombre del canal a secas produce
// falsos positivos reales: hay licitaciones municipales cuya observacion dice
// "LAMINAS DE FALABELLA" o "OT 1830 Falabella-Bio person", que son descripciones
// de material y no ventas de marketplace.
//
//   ALTA   la observacion trae la liquidacion del portal:
//          "Falabella pago $5.044 por esta venta. Resumen: Venta total $8.850,
//           se le resta $2.390 por cofinanciamiento logistico y $1.416 comision
//           por venta."
//          Es inequivoco y ademas permite recuperar los montos reales.
//
//   MEDIA  el cliente se llama como el canal ("PARIS", "MERCADO LIBRE",
//          "felix olavarria VENTA FALABELLA)"). Es solido pero sin montos.
//
// Nunca se tocan Licitacion ni Convenio Marco: una venta de marketplace no llega
// por esas vias, asi que una coincidencia ahi es siempre una mencion.
//
// Uso:
//   node scripts/reclasificar-marketplace.mjs                    (simulacion)
//   node scripts/reclasificar-marketplace.mjs --apply            (solo ALTA)
//   node scripts/reclasificar-marketplace.mjs --apply --incluir-media
//   node scripts/reclasificar-marketplace.mjs --db=<url>
import pg from 'pg'
import 'dotenv/config'

const APPLY = process.argv.includes('--apply')
const INCLUIR_MEDIA = process.argv.includes('--incluir-media')
const dbArg = process.argv.find(a => a.startsWith('--db='))
const URL = dbArg ? dbArg.slice(5) : process.env.DATABASE_URL

if (!URL) {
  console.error('Falta la base: define DATABASE_URL o pasa --db=<url>')
  process.exit(1)
}

// Los tipos que si pueden ser una venta de marketplace mal clasificada.
const TIPOS_RECLASIFICABLES = ['Venta sala', 'Venta Sala', 'Venta Web', 'Venta web', 'Normal']

const CANAL_POR_MARCA = [
  { canal: 'Falabella', re: /falabella/i },
  { canal: 'Mercado Libre', re: /mercado ?libre/i },
  // Con limite de palabra: 'VALAPARISO' -typo de Valparaiso- contiene 'paris'.
  { canal: 'París', re: /(?:^|[^a-záéíóúñ])paris(?:[^a-záéíóúñ]|$)/i },
]

function detectarCanal(texto) {
  return CANAL_POR_MARCA.find(({ re }) => re.test(String(texto || '')))?.canal ?? null
}

// Distingue "el canal es donde se vendio" de "el canal es parte de la
// descripcion del producto". Sin esto, Mercado Libre queda sistematicamente
// fuera: no emite la liquidacion con el formato de Falabella y Paris, asi que
// sus ventas solo se reconocen por frases como "BOLETA VENTA MERCADO LIBRE" o
// "PEDIDO PAGADO MERCADO LIBRE".
const VENTA_EN_CANAL = [
  /(?:venta|vendid\w*|compra|pedido|boleta|pagad\w*|cancelad\w*|pack)[^.\n]{0,40}(falabella|mercado ?libre|paris)/i,
  /(falabella|mercado ?libre|paris)[^.\n]{0,25}(?:pag\w*|plataforma|marketplace)/i,
  /(?:via|en la plataforma|en plataforma|por)\s*(falabella|mercado ?libre|paris)/i,
  // La liquidacion del portal anotada a mano: 'COMISION FALABELLA $74.000',
  // 'LIQUIDACION FALABELLA N 85276787', 'DESCUENTO DE MERCADOLIBRE'.
  /(?:comisi\S*|liquidaci\S*|descuento|precio|cargo)[^.\n]{0,30}(falabella|mercado ?libre|paris)/i,
  /(falabella|mercado ?libre|paris)[^.\n]{0,30}(?:comisi\S*|liquidaci\S*|voucher)/i,
  // La observacion es solo el nombre del canal: el vendedor anoto el origen.
  /^\s*(falabella|mercado ?libre|paris)\s*[.,]?\s*$/im,
]

function pareceVentaEnCanal(observaciones) {
  const txt = String(observaciones || '').replace(/<br\s*\/?>/gi, '\n')
  for (const re of VENTA_EN_CANAL) {
    const m = txt.match(re)
    if (m) return detectarCanal(m[1])
  }
  return null
}

// El texto viene con mojibake ("comisin", "logestico", "est? venta"), asi que se
// buscan los montos por su contexto inmediato y no por la palabra completa.
function montoChileno(s) {
  const n = Number(String(s).replace(/\./g, '').replace(/,/g, '.'))
  return Number.isFinite(n) ? n : null
}

function parsearLiquidacion(observaciones) {
  const txt = String(observaciones || '').replace(/<br\s*\/?>/gi, '\n')
  const frag = txt.match(/(falabella|paris|mercado ?libre)\s+pag\S*\s*\$\s*([\d.,]+)[^\n]{0,220}/i)
  if (!frag) return null

  const bloque = frag[0]
  const neto = montoChileno(frag[2])
  const total = montoChileno(bloque.match(/venta\s+total\s*\$\s*([\d.,]+)/i)?.[1] ?? '')

  // "$1.416 comision por venta" — la palabra llega corrupta de varias formas.
  const comision = montoChileno(bloque.match(/\$\s*([\d.,]+)\s*comis\S*/i)?.[1] ?? '')
  // "$2.390 por cofinanciamiento logistico" o "$9.560 por despacho"
  const logistica = montoChileno(bloque.match(/\$\s*([\d.,]+)\s*(?:por\s+)?(?:cofinanciamiento|despacho)/i)?.[1] ?? '')

  return { canal: detectarCanal(frag[1]), neto, total, comision, logistica, bloque }
}

const c = new pg.Client({ connectionString: URL })
await c.connect()

console.log(APPLY ? '=== RECLASIFICANDO ===' : '=== SIMULACION (nada se escribe) ===')
console.log('Base:', URL.replace(/:[^:@]*@/, ':***@'))
console.log('Nivel:', APPLY && INCLUIR_MEDIA ? 'ALTA + MEDIA' : 'solo ALTA')

const { rows } = await c.query(
  `select o.id, o.tipo, o.observaciones, cl.nombre as cliente
     from ventas.ordenes o
     left join clientes.clientes cl on cl.id = o.cliente_id
    where o.tipo = any ($1)
      and (o.observaciones ilike any ($2) or cl.nombre ilike any ($2))
    order by o.id`,
  [TIPOS_RECLASIFICABLES, ['%falabella%', '%mercado libre%', '%mercadolibre%', '%paris%']],
)

const alta = []
const media = []
const sinParsear = []

for (const r of rows) {
  const liq = parsearLiquidacion(r.observaciones)
  if (liq && liq.canal && liq.total !== null) {
    alta.push({ ...r, ...liq })
    continue
  }
  const canalPorCliente = detectarCanal(r.cliente)
  if (canalPorCliente) { media.push({ ...r, canal: canalPorCliente, senal: 'cliente' }); continue }
  const canalPorFrase = pareceVentaEnCanal(r.observaciones)
  if (canalPorFrase) { media.push({ ...r, canal: canalPorFrase, senal: 'frase de venta' }); continue }
  sinParsear.push(r)
}

// La liquidacion tiene que cuadrar: total - comision - logistica = neto. Si no
// cuadra, el parseo entendio mal y esa fila no se toca.
const cuadran = alta.filter(a => {
  if (a.neto === null || a.total === null) return false
  const desc = (a.comision ?? 0) + (a.logistica ?? 0)
  return Math.abs(a.total - desc - a.neto) <= 1
})
const noCuadran = alta.filter(a => !cuadran.includes(a))

console.log('\n=== clasificacion ===')
console.table([
  { nivel: 'ALTA  (liquidacion del portal, aritmetica verificada)', ordenes: cuadran.length },
  { nivel: 'ALTA  pero la aritmetica no cuadra -> se omite', ordenes: noCuadran.length },
  { nivel: 'MEDIA (cliente o frase de venta, sin montos)', ordenes: media.length },
  { nivel: 'DESCARTADAS (solo mencion del nombre)', ordenes: sinParsear.length },
])

const porCanal = {}
for (const a of cuadran) {
  porCanal[a.canal] ??= { canal: a.canal, ordenes: 0, comision: 0, logistica: 0, ventaTotal: 0 }
  porCanal[a.canal].ordenes += 1
  porCanal[a.canal].comision += a.comision ?? 0
  porCanal[a.canal].logistica += a.logistica ?? 0
  porCanal[a.canal].ventaTotal += a.total ?? 0
}
console.log('\n=== montos recuperados (nivel ALTA) ===')
console.table(Object.values(porCanal).map(x => ({
  ...x,
  comision: Math.round(x.comision).toLocaleString('es-CL'),
  logistica: Math.round(x.logistica).toLocaleString('es-CL'),
  ventaTotal: Math.round(x.ventaTotal).toLocaleString('es-CL'),
})))

if (sinParsear.length) {
  console.log('\n=== descartadas: revisar a mano si alguna era venta real ===')
  for (const r of sinParsear.slice(0, 40)) {
    const obs = String(r.observaciones || '').replace(/\s+/g, ' ').slice(0, 90)
    console.log(`   #${String(r.id).padEnd(7)} ${String(r.tipo).padEnd(11)} ${String(r.cliente || '').slice(0, 28).padEnd(30)} ${obs}`)
  }
  if (sinParsear.length > 40) console.log(`   ... y ${sinParsear.length - 8} mas`)
}

if (APPLY) {
  const aEscribir = INCLUIR_MEDIA ? [...cuadran, ...media] : cuadran
  let n = 0
  for (const r of aEscribir) {
    // El cofinanciamiento logistico NO se suma a la comision: son conceptos
    // distintos y el modelo solo tiene un campo. Se graba la comision por venta,
    // que es lo que el campo declara; la logistica queda anotada aqui para que
    // Plastimar decida si necesita campo propio.
    await c.query(
      `update ventas.ordenes
          set tipo = 'Marketplace',
              marketplace_canal = $2,
              marketplace_comision_monto = coalesce($3, marketplace_comision_monto),
              observaciones = coalesce(observaciones, '') || $4
        where id = $1`,
      [r.id, r.canal, r.comision ?? null,
       `\n[reclasificado a Marketplace/${r.canal} el ${new Date().toISOString().slice(0, 10)}` +
       (r.logistica ? ` · cofinanciamiento logistico $${Math.round(r.logistica)}` : '') + ']'],
    )
    n += 1
  }
  console.log(`\n-> ${n} ordenes actualizadas`)
} else {
  console.log('\nSimulacion. Para aplicar solo ALTA:  --apply')
  console.log('Para incluir tambien MEDIA:          --apply --incluir-media')
}

console.log('\nLa referencia externa (N de orden del portal) no esta en la base:')
console.log('hay que pedirsela a Plastimar o sacarla de los comprobantes.')

await c.end()
