import { z } from 'zod'

const Schema = z.object({
  tipo: z.enum(['Espumas', 'Confecciones', 'Madera', 'Externo']).optional(),
  clienteNombre: z.string().optional(),
  descripcion: z.string().optional(),
  plazo: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  fechaInicio: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()).nullable().optional(),
  fechaTermino: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()).nullable().optional(),
  estado: z.enum(['Pendiente', 'En proceso', 'Prioritaria', 'Terminada']).optional(),
  prioridad: z.string().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacío' })

export default async function updateOdt(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    try {
      const data = { ...parsed.data }
      if (data.plazo) data.plazo = new Date(data.plazo)
      if (data.fechaInicio) data.fechaInicio = new Date(data.fechaInicio)
      if (data.fechaTermino) data.fechaTermino = new Date(data.fechaTermino)
      const o = await fastify.prisma.odt.update({ where: { id }, data })
      return o
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'ODT no encontrada' })
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      await fastify.prisma.odt.delete({ where: { id } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'ODT no encontrada' })
      throw e
    }
  })
}
