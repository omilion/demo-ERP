/**
 * Crea registros CRM para las cotizaciones/ordenes de orden_compra_online
 * que aun no tienen oportunidad (ordenCompraOnlineId NULL en crm_registros).
 *
 * Reglas de negocio confirmadas con el usuario (2026-08-19):
 * - estado_compra='Cotizada' con total=0 (carrito vacio, nunca cotizo nada
 *   real): se EXCLUYE, no genera CRM. Es el 58% de las 'Cotizada' (19.593
 *   de 33.775) - ruido de checkout, no oportunidades reales.
 * - 'Cotizada' con total>0 -> etapaComercial=COTIZACION_ENVIADA
 * - 'Pendiente' -> PENDIENTE_CLASIFICACION
 * - 'Aceptada' / 'Recepcionada' -> CERRADO, resultadoCierre=GANADO (venta
 *   ya concretada, no queda "en curso")
 * - 'Nula' / 'No aceptada' -> CERRADO, resultadoCierre=PERDIDO,
 *   motivoPerdida=OTRO (legacy no distingue motivo real)
 * - Duplicados de carrito real (mismo email+total>0 en <30min, reintento de
 *   checkout): se queda solo la mas reciente del grupo.
 *
 * Plantilla de campos tomada de los 8.327 crm_registros ya sincronizados
 * (origenDato='OC_ONLINE_LEGACY', canalVenta='WEB', estado='0' para las
 * etapas iniciales).
 *
 * Dry-run:  node scripts/sync-crm-orden-compra-online.mjs
 * Aplicar:  node scripts/sync-crm-orden-compra-online.mjs --apply --confirm=SYNC_CRM_OC_ONLINE
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const APPLY = process.argv.includes('--apply')
const CONFIRM = process.argv.find(a => a.startsWith('--confirm='))?.slice(10)
if (APPLY && CONFIRM !== 'SYNC_CRM_OC_ONLINE') throw new Error('Falta --confirm=SYNC_CRM_OC_ONLINE')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const ESTADO_CODE = { PENDIENTE_CLASIFICACION: '0', COTIZACION_ENVIADA: '0', SEGUIMIENTO: '1', VENTA_APROBADA: '2', CERRADO: '3' }

function classify(row) {
  const estado = row.estadoCompra
  if (estado === 'Cotizada') {
    if (!row.total || row.total <= 0) return null // carrito vacio, excluir
    return { etapaComercial: 'COTIZACION_ENVIADA' }
  }
  if (estado === 'Pendiente') return { etapaComercial: 'PENDIENTE_CLASIFICACION' }
  if (estado === 'Aceptada' || estado === 'Recepcionada') {
    return { etapaComercial: 'CERRADO', resultadoCierre: 'GANADO', cerradoAt: row.fechaHora }
  }
  if (estado === 'Nula' || estado === 'No aceptada') {
    return { etapaComercial: 'CERRADO', resultadoCierre: 'PERDIDO', motivoPerdida: 'OTRO', cerradoAt: row.fechaHora }
  }
  return null // estado_compra desconocido/null: no clasificable, se omite
}

try {
  const pending = await prisma.ordenCompraOnline.findMany({
    where: { oportunidadCrm: { is: null } },
    select: { id: true, nCompra: true, fechaHora: true, emailComprador: true, total: true, estadoCompra: true },
    orderBy: { fechaHora: 'asc' },
  })
  console.log(`orden_compra_online sin CRM: ${pending.length}`)

  // Dedupe: mismo email + mismo total>0, filas separadas por <30min -> solo la mas reciente sobrevive.
  const byGroup = new Map()
  for (const row of pending) {
    if (row.estadoCompra !== 'Cotizada' || !row.total) { byGroup.set(`solo-${row.id}`, row); continue }
    const key = `${(row.emailComprador || '').toLowerCase()}|${row.total}`
    const existing = byGroup.get(key)
    if (!existing) { byGroup.set(key, row); continue }
    const gapMs = new Date(row.fechaHora) - new Date(existing.fechaHora)
    if (Math.abs(gapMs) < 30 * 60 * 1000) {
      // se queda la mas reciente de las dos
      byGroup.set(key, row.fechaHora > existing.fechaHora ? row : existing)
    } else {
      byGroup.set(`${key}|${row.id}`, row)
    }
  }
  const deduped = [...byGroup.values()]
  console.log(`Tras dedupe de carrito (mismo email+total, <30min): ${deduped.length}`)

  const emails = [...new Set(deduped.map(r => (r.emailComprador || '').trim().toLowerCase()).filter(Boolean))]
  const clientesByEmail = new Map()
  for (let i = 0; i < emails.length; i += 500) {
    const batch = emails.slice(i, i + 500)
    const found = await prisma.cliente.findMany({ where: { email: { in: batch, mode: 'insensitive' } }, select: { id: true, email: true, rut: true, nombre: true, razonSocial: true } })
    for (const c of found) clientesByEmail.set((c.email || '').toLowerCase(), c)
  }

  const toCreate = []
  let excluidosCarritoVacio = 0
  let excluidosEstadoDesconocido = 0
  for (const row of deduped) {
    const clasif = classify(row)
    if (!clasif) {
      if (row.estadoCompra === 'Cotizada') excluidosCarritoVacio++
      else excluidosEstadoDesconocido++
      continue
    }
    const cli = clientesByEmail.get((row.emailComprador || '').trim().toLowerCase())
    toCreate.push({
      ncotizacion: row.nCompra,
      fecha: row.fechaHora,
      estado: ESTADO_CODE[clasif.etapaComercial],
      etapaComercial: clasif.etapaComercial,
      resultadoCierre: clasif.resultadoCierre || null,
      motivoPerdida: clasif.motivoPerdida || null,
      cerradoAt: clasif.cerradoAt || null,
      canalVenta: 'WEB',
      origenDato: 'OC_ONLINE_LEGACY',
      email: row.emailComprador || null,
      rut: cli?.rut || null,
      nombre: cli?.nombre || null,
      rsocial: cli?.razonSocial || null,
      clienteId: cli?.id || null,
      ordenCompraOnlineId: row.id,
    })
  }

  console.log(`\nA crear en CRM: ${toCreate.length}`)
  console.log(`Excluidos por carrito vacio (Cotizada, total=0): ${excluidosCarritoVacio}`)
  console.log(`Excluidos por estado_compra no clasificable: ${excluidosEstadoDesconocido}`)
  const porEtapa = {}
  for (const t of toCreate) porEtapa[t.etapaComercial] = (porEtapa[t.etapaComercial] || 0) + 1
  console.log('por etapa:', porEtapa)
  console.log('con cliente resuelto por email:', toCreate.filter(t => t.clienteId).length, '/', toCreate.length)
  console.log('muestra:', toCreate.slice(0, 5))

  if (!APPLY) {
    console.log('\nDRY-RUN: nada se modifico. Para aplicar: --apply --confirm=SYNC_CRM_OC_ONLINE')
    process.exit(0)
  }

  let created = 0
  for (let i = 0; i < toCreate.length; i += 300) {
    await prisma.crmRegistro.createMany({ data: toCreate.slice(i, i + 300) })
    created += Math.min(300, toCreate.length - i)
    process.stdout.write(`\r  ${created}/${toCreate.length}`)
  }
  console.log(`\nAplicado: ${created} registros CRM creados.`)
} finally {
  await prisma.$disconnect()
}
