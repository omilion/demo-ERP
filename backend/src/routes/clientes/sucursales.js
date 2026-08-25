import { z } from 'zod'

const SucursalSchema = z.object({
  nombre: z.string().min(1),
  direccion: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  comuna: z.string().optional().nullable(),
  ciudad: z.string().optional().nullable(),
  pais: z.string().optional().nullable(),
  contacto: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  telefono: z.string().optional().nullable(),
  isPrincipal: z.boolean().optional(),
  activo: z.boolean().optional(),
})

const UpdateSucursalSchema = SucursalSchema.partial()
  .refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacio' })

async function ensureCliente(fastify, clienteId, reply) {
  const cliente = await fastify.prisma.cliente.findFirst({
    where: { id: clienteId, activo: true },
    select: { id: true },
  })
  if (!cliente) {
    reply.code(404).send({ error: 'Cliente no encontrado' })
    return null
  }
  return cliente
}

async function unsetOtherPrincipal(prisma, clienteId, exceptId = null) {
  await prisma.clienteSucursal.updateMany({
    where: {
      clienteId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { isPrincipal: false },
  })
}

export default async function clienteSucursalesRoutes(fastify) {
  fastify.get('/:id/sucursales', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const clienteId = Number.parseInt(request.params.id, 10)
    if (!clienteId) return reply.code(400).send({ error: 'ID invalido' })
    if (!await ensureCliente(fastify, clienteId, reply)) return
    return fastify.prisma.clienteSucursal.findMany({
      where: { clienteId, activo: true },
      orderBy: [{ isPrincipal: 'desc' }, { nombre: 'asc' }],
    })
  })

  fastify.post('/:id/sucursales', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'write')],
  }, async (request, reply) => {
    const clienteId = Number.parseInt(request.params.id, 10)
    if (!clienteId) return reply.code(400).send({ error: 'ID invalido' })
    if (!await ensureCliente(fastify, clienteId, reply)) return
    const parsed = SucursalSchema.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const hasSucursal = await fastify.prisma.clienteSucursal.count({ where: { clienteId, activo: true } })
    const data = { ...parsed.data, clienteId, isPrincipal: parsed.data.isPrincipal ?? hasSucursal === 0 }
    if (data.isPrincipal) await unsetOtherPrincipal(fastify.prisma, clienteId)
    try {
      const sucursal = await fastify.prisma.clienteSucursal.create({ data })
      return reply.code(201).send(sucursal)
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'Ya existe una sucursal con ese nombre para el cliente' })
      throw e
    }
  })

  fastify.put('/:id/sucursales/:sucursalId', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'write')],
  }, async (request, reply) => {
    const clienteId = Number.parseInt(request.params.id, 10)
    const sucursalId = Number.parseInt(request.params.sucursalId, 10)
    if (!clienteId || !sucursalId) return reply.code(400).send({ error: 'ID invalido' })
    if (!await ensureCliente(fastify, clienteId, reply)) return
    const parsed = UpdateSucursalSchema.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    if (parsed.data.isPrincipal) await unsetOtherPrincipal(fastify.prisma, clienteId, sucursalId)
    try {
      const result = await fastify.prisma.clienteSucursal.updateMany({
        where: { id: sucursalId, clienteId },
        data: parsed.data,
      })
      if (result.count === 0) return reply.code(404).send({ error: 'Sucursal no encontrada' })
      return fastify.prisma.clienteSucursal.findFirst({ where: { id: sucursalId, clienteId } })
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'Ya existe una sucursal con ese nombre para el cliente' })
      throw e
    }
  })
}
