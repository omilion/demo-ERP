import { isConvenioMarcoTipo } from './convenio-marco.js'

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function getVentaDescuentoCatalogKind(tipo) {
  if (isConvenioMarcoTipo(tipo)) return 'marco'

  const text = normalizeText(tipo)
  if (text === 'normal' || text === 'venta sala' || text === 'venta web' || text === 'venta directa') {
    return 'normal'
  }

  return null
}

export async function validateVentaDescuentoCatalogForWrite(prisma, { tipo, descuentoPct } = {}) {
  const valor = Number(descuentoPct || 0)
  if (valor <= 0) return { applies: false }

  const kind = getVentaDescuentoCatalogKind(tipo)
  if (!kind) return { applies: false }

  if (kind === 'normal' && !Number.isInteger(valor)) {
    return {
      applies: true,
      statusCode: 400,
      error: 'Descuento normal debe ser entero',
    }
  }

  const model = kind === 'marco' ? 'descuentoPorcMarco' : 'descuentoPorc'
  const descuento = await prisma[model].findFirst({
    where: { valor, activo: true },
    select: { id: true },
  })
  if (!descuento) {
    return {
      applies: true,
      statusCode: 400,
      error: kind === 'marco'
        ? 'Descuento Convenio Marco no esta autorizado en catalogo'
        : 'Descuento normal no esta autorizado en catalogo',
    }
  }

  return { applies: true }
}
