// Saneamiento de descripciones legacy con HTML crudo.
// El sistema viejo guardaba descripciones con etiquetas HTML (<span style=...>,
// <br>, <font>, &nbsp;, etc.) que hoy se muestran como texto plano -> se ven crudas.
// Este script limpia descripcion, descripcion_web y descripcion_licitacion a texto
// plano legible.
//
// USO:
//   node scripts/clean-descripciones-html.mjs           -> DRY RUN (no toca nada, muestra ejemplos)
//   node scripts/clean-descripciones-html.mjs --apply   -> APLICA los cambios (hacer backup antes)
//
// El texto se conserva; solo se quitan las etiquetas y se decodifican entidades.

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

// Decodifica las entidades HTML mas comunes en estos datos.
const ENTIDADES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í',
  '&oacute;': 'ó', '&uacute;': 'ú', '&ntilde;': 'ñ', '&Aacute;': 'Á', '&Eacute;': 'É',
  '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú', '&Ntilde;': 'Ñ', '&uuml;': 'ü',
  '&ordf;': 'ª', '&ordm;': 'º', '&deg;': '°', '&hellip;': '…', '&mdash;': '—', '&ndash;': '–',
}

function limpiar(texto) {
  if (!texto) return texto
  let t = texto
  // <br> y bloques (apertura y cierre) -> salto de linea (preserva estructura de parrafos)
  t = t.replace(/<\s*br\s*\/?\s*>/gi, '\n')
  t = t.replace(/<\/?\s*(p|div|li|ul|ol|h[1-6]|table|tr|section)[^>]*>/gi, '\n')
  // Etiquetas inline (span, font, b, i, u, a, strong, em...) -> se quitan SIN espacio
  // para no partir palabras (ej. "cinturó<font>n" debe quedar "cinturón").
  t = t.replace(/<[^>]+>/g, '')
  // Decodificar entidades
  for (const [ent, ch] of Object.entries(ENTIDADES)) {
    t = t.split(ent).join(ch)
  }
  // Entidades numericas &#NNN;
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
  // Normalizar espacios/saltos: colapsar espacios multiples, max 2 saltos seguidos, trim
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/[ \t]*\n[ \t]*/g, '\n').trim()
  return t
}

const tieneHtml = t => t && /<[a-zA-Z/][^>]*>|&[a-zA-Z#][a-zA-Z0-9]+;/.test(t)

async function main() {
  console.log(APPLY ? '=== MODO APLICAR (modifica la base) ===' : '=== DRY RUN (no modifica nada) ===\n')

  const productos = await prisma.producto.findMany({
    select: { id: true, nombre: true, descripcion: true, descripcionWeb: true, descripcionLicitacion: true },
  })

  let afectados = 0
  const ejemplos = []

  for (const p of productos) {
    const nueva = {
      descripcion: tieneHtml(p.descripcion) ? limpiar(p.descripcion) : undefined,
      descripcionWeb: tieneHtml(p.descripcionWeb) ? limpiar(p.descripcionWeb) : undefined,
      descripcionLicitacion: tieneHtml(p.descripcionLicitacion) ? limpiar(p.descripcionLicitacion) : undefined,
    }
    const cambios = Object.fromEntries(Object.entries(nueva).filter(([, v]) => v !== undefined))
    if (Object.keys(cambios).length === 0) continue

    afectados++
    if (ejemplos.length < 8 && cambios.descripcion) {
      ejemplos.push({ nombre: p.nombre, antes: p.descripcion, despues: cambios.descripcion })
    }

    if (APPLY) {
      await prisma.producto.update({ where: { id: p.id }, data: cambios })
    }
  }

  console.log('\n--- EJEMPLOS (antes -> despues) ---')
  for (const e of ejemplos) {
    console.log('\n#', (e.nombre || '').slice(0, 40))
    console.log('  ANTES  :', JSON.stringify(e.antes.slice(0, 120)))
    console.log('  DESPUES:', JSON.stringify(e.despues.slice(0, 120)))
  }

  console.log(`\n--- RESUMEN ---`)
  console.log('Productos con descripciones a limpiar:', afectados, 'de', productos.length)
  console.log(APPLY ? '✓ CAMBIOS APLICADOS.' : 'DRY RUN: nada se modificó. Corré con --apply para aplicar (hacé backup antes).')
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
