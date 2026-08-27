/**
 * Normaliza las grafias heredadas del legacy en ventas.ordenes.
 *
 * Contexto: el legacy MySQL escribe "Entregado" y "Venta sala"; el ERP escribe
 * "Entregada" y "Venta Sala". Ambos vocabularios conviven en la misma columna.
 * La API ya tolera los dos y persiste la forma canonica, asi que este script
 * NO es urgente: sirve para que los reportes que agrupan por estado o tipo
 * dejen de contar la misma categoria dos veces.
 *
 * Orden correcto: primero se despliega el fix de la API y de los importadores,
 * despues se corre esto. Al reves, cualquier sync posterior repone los valores.
 *
 * Los estados Webpay NO se tocan: describen momentos reales del flujo de pago
 * en linea y su forma canonica es una decision de negocio pendiente.
 *
 * Dry-run (por defecto, no escribe nada):
 *   node scripts/normalizar-estados-ventas.mjs
 *
 * Aplicar:
 *   node scripts/normalizar-estados-ventas.mjs --apply --confirm=NORMALIZAR_ESTADOS
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { normalizeEstadoEntrega, normalizeTipoVenta } from '../src/routes/ventas/estados-normalize.js'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const CONFIRM = (args.find(a => a.startsWith('--confirm=')) || '').split('=')[1]
const CONFIRM_TOKEN = 'NORMALIZAR_ESTADOS'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('Falta DATABASE_URL')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

// Cada columna se evalua con la misma funcion que usa la API, de modo que el
// script no puede divergir de lo que la validacion considera canonico.
const COLUMNAS = [
  { campo: 'estadoEntrega', etiqueta: 'estado_entrega', normalize: normalizeEstadoEntrega },
  { campo: 'tipo', etiqueta: 'tipo', normalize: normalizeTipoVenta },
]

async function main() {
  if (APPLY && CONFIRM !== CONFIRM_TOKEN) {
    console.error(`Para aplicar hay que pasar --confirm=${CONFIRM_TOKEN}`)
    process.exit(1)
  }

  console.log(APPLY ? '== APLICANDO ==' : '== DRY-RUN (no escribe nada) ==')

  const ordenes = await prisma.orden.findMany({
    select: { id: true, tipo: true, estadoEntrega: true },
  })
  console.log(`Ordenes revisadas: ${ordenes.length.toLocaleString('es-CL')}`)

  for (const { campo, etiqueta, normalize } of COLUMNAS) {
    // Se agrupan los cambios por par (valor actual -> valor canonico) para
    // poder revisarlos en el dry-run antes de escribir nada.
    const porTransicion = new Map()
    const sinReconocer = new Map()

    for (const orden of ordenes) {
      const actual = orden[campo]
      if (actual == null || actual === '') continue
      const canonico = normalize(actual)
      if (canonico == null) {
        sinReconocer.set(actual, (sinReconocer.get(actual) || 0) + 1)
        continue
      }
      if (canonico === actual) continue
      const clave = `${actual} -> ${canonico}`
      if (!porTransicion.has(clave)) porTransicion.set(clave, { canonico, actual, ids: [] })
      porTransicion.get(clave).ids.push(orden.id)
    }

    console.log(`\n[${etiqueta}]`)
    if (porTransicion.size === 0) console.log('  sin cambios pendientes')

    for (const [clave, { actual, canonico, ids }] of porTransicion) {
      console.log(`  ${clave}: ${ids.length.toLocaleString('es-CL')} ordenes`)
      if (!APPLY) continue
      // updateMany sobre el valor exacto: evita pisar filas que hayan cambiado
      // entre la lectura y la escritura.
      const res = await prisma.orden.updateMany({
        where: { id: { in: ids }, [campo]: actual },
        data: { [campo]: canonico },
      })
      console.log(`    actualizadas: ${res.count.toLocaleString('es-CL')}`)
    }

    for (const [valor, total] of sinReconocer) {
      // No se adivina: se reporta para que alguien decida.
      console.log(`  SIN MAPEO "${valor}": ${total} ordenes (se dejan intactas)`)
    }
  }

  if (!APPLY) {
    console.log(`\nDry-run terminado. Para aplicar: --apply --confirm=${CONFIRM_TOKEN}`)
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
