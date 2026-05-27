import { describe, expect, it, vi } from 'vitest'
import updateCliente from '../src/routes/clientes/update.js'
import bitacoraRoutes from '../src/routes/odts/bitacora.js'
import updateOdt from '../src/routes/odts/update.js'
import { requiresVentaLifecycleDelete } from '../src/routes/ventas/update.js'

function buildRouteRecorder() {
  const routes = {}
  const fastify = {
    authenticate: 'auth',
    rbac: vi.fn((module, permission) => `${module}:${permission}`),
    get: (path, opts, handler) => {
      routes[`GET ${path}`] = { opts, handler }
    },
    put: (path, opts, handler) => {
      routes[`PUT ${path}`] = { opts, handler }
    },
    post: (path, opts, handler) => {
      routes[`POST ${path}`] = { opts, handler }
    },
    delete: (path, opts, handler) => {
      routes[`DELETE ${path}`] = { opts, handler }
    },
  }
  return { fastify, routes }
}

describe('lifecycle route permissions', () => {
  it('gates cliente baja and reactivacion with clientes delete', async () => {
    const { fastify, routes } = buildRouteRecorder()
    await updateCliente(fastify)

    expect(routes['PUT /:id'].opts.preHandler).toEqual(['auth', 'clientes:write'])
    expect(routes['DELETE /:id'].opts.preHandler).toEqual(['auth', 'clientes:delete'])
    expect(routes['POST /:id/reactivar'].opts.preHandler).toEqual(['auth', 'clientes:delete'])
    expect(fastify.rbac).toHaveBeenCalledWith('clientes', 'delete')
  })

  it('gates ODT anular/delete with taller delete while keeping cierre as write', async () => {
    const { fastify, routes } = buildRouteRecorder()
    await updateOdt(fastify)

    expect(routes['PUT /:id'].opts.preHandler).toEqual(['auth', 'taller:write'])
    expect(routes['POST /:id/cerrar'].opts.preHandler).toEqual(['auth', 'taller:write'])
    expect(routes['POST /:id/anular'].opts.preHandler).toEqual(['auth', 'taller:delete'])
    expect(routes['DELETE /:id'].opts.preHandler).toEqual(['auth', 'taller:delete'])
  })

  it('gates ODT bitacora deletion with taller delete while keeping read/write for view and append', async () => {
    const { fastify, routes } = buildRouteRecorder()
    await bitacoraRoutes(fastify)

    expect(routes['GET /:id/bitacora'].opts.preHandler).toEqual(['auth', 'taller:read'])
    expect(routes['POST /:id/bitacora'].opts.preHandler).toEqual(['auth', 'taller:write'])
    expect(routes['DELETE /:id/bitacora/:entryId'].opts.preHandler).toEqual(['auth', 'taller:delete'])
  })
})

describe('venta lifecycle permission helpers', () => {
  it('detects annul and reactivate state transitions hidden behind generic update', () => {
    expect(requiresVentaLifecycleDelete({ estado: 'Activa' }, { estado: 'Nula' })).toBe(true)
    expect(requiresVentaLifecycleDelete({ estado: 'Activa' }, { estado: 'Anulada' })).toBe(true)
    expect(requiresVentaLifecycleDelete({ estado: 'Nula' }, { estado: 'Activa' })).toBe(true)
    expect(requiresVentaLifecycleDelete({ estado: 'Activa' }, { estadoPago: 'Pagada' })).toBe(false)
    expect(requiresVentaLifecycleDelete({ estado: 'Activa' }, { estado: 'Activa' })).toBe(false)
  })
})
