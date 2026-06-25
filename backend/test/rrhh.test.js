import { describe, it, expect, vi } from 'vitest'
import rrhhRoutes from '../src/routes/rrhh/index.js'

async function buildRrhhHandlers(prisma) {
  const handlers = {}
  const fastify = {
    authenticate: async () => {},
    rbac: () => async () => {},
    prisma,
    register: async (plugin) => {
      await plugin({
        authenticate: async () => {},
        rbac: () => async () => {},
        prisma,
        get: (path, _opts, handler) => { handlers[`GET ${path}`] = handler },
        post: (path, _opts, handler) => { handlers[`POST ${path}`] = handler },
        put: (path, _opts, handler) => { handlers[`PUT ${path}`] = handler },
        delete: (path, _opts, handler) => { handlers[`DELETE ${path}`] = handler },
      })
    },
  }
  await rrhhRoutes(fastify)
  return handlers
}

function replyStub() {
  return {
    statusCode: 200,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    code(statusCode) {
      this.statusCode = statusCode
      return this
    },
    send(body) {
      this.body = body
      return body
    },
  }
}

describe('RRHH subresources routes', () => {
  it('registers and handles subcontratos, certificados-antecedentes, and vacunas', async () => {
    const prisma = {
      subcontrato: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
      certificadoAntecedentes: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 2 }),
      },
      vacuna: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 3 }),
      },
    }

    const handlers = await buildRrhhHandlers(prisma)
    const reply = replyStub()

    // Test GET /trabajadores/:id/subcontratos
    const resGetSubcontratos = await handlers['GET /trabajadores/:id/subcontratos']({
      params: { id: '10' }
    }, reply)
    expect(prisma.subcontrato.findMany).toHaveBeenCalledWith({
      where: { trabajadorId: 10 },
      orderBy: { createdAt: 'desc' },
      take: 500
    })
    expect(resGetSubcontratos).toEqual([])

    // Test POST /trabajadores/:id/subcontratos
    const resPostSubcontratos = await handlers['POST /trabajadores/:id/subcontratos']({
      params: { id: '10' },
      body: { empresa: 'Allegro', contrato: 'Limpieza', inicio: '2026-06-01' }
    }, reply)
    expect(prisma.subcontrato.create).toHaveBeenCalledWith({
      data: {
        empresa: 'Allegro',
        contrato: 'Limpieza',
        inicio: new Date('2026-06-01'),
        termino: null,
        documento: null,
        imagen: null,
        estado: true,
        trabajadorId: 10
      }
    })
    expect(reply.statusCode).toBe(201)
    expect(resPostSubcontratos).toEqual({ id: 1 })

    // Test GET /trabajadores/:id/certificados-antecedentes
    const resGetCertificados = await handlers['GET /trabajadores/:id/certificados-antecedentes']({
      params: { id: '10' }
    }, reply)
    expect(prisma.certificadoAntecedentes.findMany).toHaveBeenCalledWith({
      where: { trabajadorId: 10 },
      orderBy: { createdAt: 'desc' },
      take: 500
    })
    expect(resGetCertificados).toEqual([])

    // Test GET /trabajadores/:id/vacunas
    const resGetVacunas = await handlers['GET /trabajadores/:id/vacunas']({
      params: { id: '10' }
    }, reply)
    expect(prisma.vacuna.findMany).toHaveBeenCalledWith({
      where: { trabajadorId: 10 },
      orderBy: { createdAt: 'desc' },
      take: 500
    })
    expect(resGetVacunas).toEqual([])
  })
})
