import { z } from 'zod'
import { resolveOrdenForWrite } from '../relation-guards.js'
import { ODT_ESTADOS, applyOdtStateSideEffects, buildOdtUpdateBitacoraEntries, validateOperario } from './operations.js'

const Schema = z.object({
  tipo: z.enum(['Espumas', 'Confecciones', 'Madera', 'Externo']).optional(),
  clienteNombre: z.string().optional(),
  descripcion: z.string().optional(),
  plazo: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  fechaInicio: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()).nullable().optional(),
  fechaTermino: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()).nullable().optional(),
  estado: z.enum(ODT_ESTADOS).optional(),
  prioridad: z.string().optional(),
  operarioId: z.number().int().nullable().optional(),
  ordenId: z.union([z.number().int(), z.string()]).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacio' })

export default async function updateOdt(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    try {
      const data = { ...parsed.data }
      const current = await fastify.prisma.odt.findUnique({
        where: { id },
        select: { id: true, estado: true, operarioId: true, fechaInicio: true, fechaTermino: true },
      })
      if (!current) return reply.code(404).send({ error: 'ODT no encontrada' })
      if (data.ordenId !== undefined) {
        const resolved = await resolveOrdenForWrite(fastify.prisma, { ordenId: data.ordenId })
        if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
        data.ordenId = resolved.orden.id
      }
      const operario = await validateOperario(fastify.prisma, data.operarioId)
      if (operario?.error) return reply.code(400).send({ error: operario.error })
      if (data.plazo) data.plazo = new Date(data.plazo)
      if (data.fechaInicio) data.fechaInicio = new Date(data.fechaInicio)
      if (data.fechaTermino) data.fechaTermino = new Date(data.fechaTermino)
      const updateData = applyOdtStateSideEffects(data, current)
      const bitacoraEntries = buildOdtUpdateBitacoraEntries({
        current,
        data: updateData,
        operario,
        user: request.user,
      })
      return await fastify.prisma.$transaction(async (tx) => {
        const o = await tx.odt.update({ where: { id }, data: updateData })
        if (bitacoraEntries.length) await tx.bitacoraTaller.createMany({ data: bitacoraEntries })
        return o
      })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'ODT no encontrada' })
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    try {
      await fastify.prisma.odt.delete({ where: { id } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'ODT no encontrada' })
      throw e
    }
  })
}
