function cleanText(value) {
  return value == null ? '' : String(value).trim()
}

function auditUsuario(user) {
  return cleanText(user?.nombre) || cleanText(user?.email) || cleanText(user?.username) || 'Sistema'
}

export function isCodigoMk(codigoInterno) {
  return cleanText(codigoInterno).toUpperCase().startsWith('MK')
}

export async function ensureProductoMkNotification(prisma, producto, user) {
  if (!producto?.id || !isCodigoMk(producto.codigoInterno)) return null

  const marker = `[producto-mk:${producto.id}]`
  const existing = await prisma.bitacoraTaller.findFirst({
    where: { texto: { contains: marker } },
    select: { id: true },
  })
  if (existing) return null

  const label = [producto.codigoInterno, producto.nombre].map(cleanText).filter(Boolean).join(' - ')
  return prisma.bitacoraTaller.create({
    data: {
      usuario: 'Aviso MK',
      usuarioReporta: auditUsuario(user),
      fecha: new Date(),
      texto: `${marker} Producto MK pendiente de revision en taller: ${label || `producto #${producto.id}`}`,
    },
  })
}
