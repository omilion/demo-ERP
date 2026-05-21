import Fastify from 'fastify'
import { describe, it, expect, vi } from 'vitest'
import auditPlugin, { auditContextFromPath, sanitizePath } from '../src/plugins/audit.js'

async function buildAuditTestApp(executeRaw) {
  const app = Fastify({ logger: false })
  app.decorate('prisma', { $executeRaw: executeRaw })
  app.register(auditPlugin)

  app.addHook('preHandler', async (request) => {
    request.user = {
      id: 7,
      email: 'admin@plastimar.cl',
      nombre: 'Admin Plastimar',
      role: 'admin',
    }
  })

  app.post('/api/ventas/:id/anular', async () => ({ ok: true }))
  app.delete('/api/usuarios/:id/permisos', async (_, reply) => reply.code(204).send())
  app.post('/api/auth/login', async () => ({ accessToken: 'token' }))

  await app.ready()
  return app
}

function auditValues(executeRaw) {
  const call = executeRaw.mock.calls[0]
  return {
    userId: call[1],
    userEmail: call[2],
    userNombre: call[3],
    role: call[4],
    method: call[5],
    path: call[6],
    status: call[7],
    entity: call[8],
    entityId: call[9],
    payload: call[10] ? JSON.parse(call[10]) : null,
    ip: call[11],
    userAgent: call[12],
  }
}

describe('audit helpers', () => {
  it('redacts sensitive query params when storing paths', () => {
    expect(sanitizePath('/api/ventas/1?token=abc&q=orden&password=secret&api_key=dev')).toBe(
      '/api/ventas/1?token=***&q=orden&password=***&api_key=***'
    )
  })

  it('derives entity, first nested id and sensitive action from paths', () => {
    expect(auditContextFromPath('/api/usuarios/12/permisos', 'PUT')).toEqual({
      entity: 'usuarios',
      entityId: '12',
      action: 'usuarios.permisos.update',
      sensitive: true,
    })
  })
})

describe('audit plugin', () => {
  it('audits sensitive mutations with redacted payload, route metadata and actor context', async () => {
    const executeRaw = vi.fn().mockResolvedValue({ count: 1 })
    const app = await buildAuditTestApp(executeRaw)

    const res = await app.inject({
      method: 'POST',
      url: '/api/ventas/123/anular?token=abc&q=orden',
      headers: {
        'x-real-ip': '10.0.0.7',
        'user-agent': 'vitest-agent',
      },
      payload: {
        motivo: 'duplicada',
        password: 'super-secret',
        authorization: 'Bearer private',
        items: [{ nombre: 'Tela', refreshToken: 'refresh-secret' }],
      },
    })

    expect(res.statusCode).toBe(200)
    expect(executeRaw).toHaveBeenCalledTimes(1)
    expect(auditValues(executeRaw)).toMatchObject({
      userId: 7,
      userEmail: 'admin@plastimar.cl',
      userNombre: 'Admin Plastimar',
      role: 'admin',
      method: 'POST',
      path: '/api/ventas/123/anular?token=***&q=orden',
      status: 200,
      entity: 'ventas',
      entityId: '123',
      ip: '10.0.0.7',
      userAgent: 'vitest-agent',
      payload: {
        motivo: 'duplicada',
        password: '***',
        authorization: '***',
        items: [{ nombre: 'Tela', refreshToken: '***' }],
        _audit: {
          action: 'ventas.anular.create',
          sensitive: true,
          route: '/api/ventas/:id/anular',
          params: { id: '123' },
        },
      },
    })

    await app.close()
  })

  it('skips auth login audit entries', async () => {
    const executeRaw = vi.fn().mockResolvedValue({ count: 1 })
    const app = await buildAuditTestApp(executeRaw)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@plastimar.cl', password: 'dev1234' },
    })

    expect(res.statusCode).toBe(200)
    expect(executeRaw).not.toHaveBeenCalled()

    await app.close()
  })

  it('does not fail the request if audit persistence fails', async () => {
    const executeRaw = vi.fn().mockRejectedValue(new Error('database unavailable'))
    const app = await buildAuditTestApp(executeRaw)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/usuarios/44/permisos',
    })

    expect(res.statusCode).toBe(204)
    expect(executeRaw).toHaveBeenCalledTimes(1)

    await app.close()
  })
})
