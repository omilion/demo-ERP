import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import rrhhRoutes from '../src/routes/rrhh/index.js'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

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

describe('Trabajador <-> cuenta de login (usuarioId)', () => {
  let app, tokenRrhh, tallerUser

  async function loginAs(email) {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email, password: 'dev1234' },
    })
    return JSON.parse(res.body).accessToken
  }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    tokenRrhh = await loginAs('rrhh@plastimar.cl')
    tallerUser = await app.prisma.user.findUnique({ where: { email: 'taller@plastimar.cl' } })
  })
  afterAll(() => app.close())

  it('vincula una cuenta, la marca como no disponible para otro trabajador, y respeta el limite de 1 a 1', async () => {
    const marker = Date.now()
    const crear = (rut) => app.inject({
      method: 'POST', url: '/api/rrhh/trabajadores',
      headers: { authorization: `Bearer ${tokenRrhh}` },
      payload: { empresa: 'plastimar', nombres: 'Test', apellidoPaterno: `Trabajador-${marker}`, rut },
    })

    const t1Res = await crear(`T1-${marker}`)
    expect(t1Res.statusCode).toBe(201)
    const t1 = JSON.parse(t1Res.body)
    const t2Res = await crear(`T2-${marker}`)
    const t2 = JSON.parse(t2Res.body)

    try {
      const linkRes = await app.inject({
        method: 'PUT', url: `/api/rrhh/trabajadores/${t1.id}`,
        headers: { authorization: `Bearer ${tokenRrhh}` },
        payload: { usuarioId: tallerUser.id },
      })
      expect(linkRes.statusCode).toBe(200)
      expect(JSON.parse(linkRes.body).usuarioId).toBe(tallerUser.id)

      const cuentasRes = await app.inject({
        method: 'GET', url: '/api/rrhh/trabajadores/cuentas-disponibles',
        headers: { authorization: `Bearer ${tokenRrhh}` },
      })
      const cuentas = JSON.parse(cuentasRes.body).items
      expect(cuentas.find(u => u.id === tallerUser.id).linked).toBe(true)

      const conflictoRes = await app.inject({
        method: 'PUT', url: `/api/rrhh/trabajadores/${t2.id}`,
        headers: { authorization: `Bearer ${tokenRrhh}` },
        payload: { usuarioId: tallerUser.id },
      })
      expect(conflictoRes.statusCode).toBe(409)

      const tokenTaller = await loginAs('taller@plastimar.cl')
      const operariosRes = await app.inject({
        method: 'GET', url: '/api/odts/meta/operarios',
        headers: { authorization: `Bearer ${tokenTaller}` },
      })
      const operario = JSON.parse(operariosRes.body).items.find(o => o.id === t1.id)
      expect(operario.usuarioId).toBe(tallerUser.id)
    } finally {
      await app.prisma.trabajador.deleteMany({ where: { id: { in: [t1.id, t2.id] } } })
    }
  })

  it('GET /odts/taller-items?mine=true solo trae lo asignado al usuario logueado', async () => {
    const orden = await app.prisma.orden.create({
      data: {
        tipo: 'Test', estado: 'Activa', estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega',
        clienteId: (await app.prisma.cliente.findFirst({ select: { id: true } })).id,
        userId: (await app.prisma.user.findFirst({ select: { id: true } })).id,
        nInterno: 972000000 + Math.floor(Math.random() * 100000),
      },
    })
    const producto = await app.prisma.producto.findFirst({ select: { id: true } })
    const marker = `TEST-MINE-${Date.now()}`
    const taller = await app.prisma.taller.create({ data: { nombre: marker } })
    const odt = await app.prisma.odt.create({ data: { ordenId: orden.id, tipo: 'Test', estado: 'Pendiente', eliminado: false } })
    const itemMio = await app.prisma.odtItem.create({ data: { odtId: odt.id, productoId: producto.id, cantidad: 1, estado: 'pendiente', eliminado: false } })
    const itemAjeno = await app.prisma.odtItem.create({ data: { odtId: odt.id, productoId: producto.id, cantidad: 1, estado: 'pendiente', eliminado: false } })
    await app.prisma.odtItemTaller.create({ data: { odtItemId: itemMio.id, tallerId: taller.id, estado: 'pendiente', operarioResponsableId: tallerUser.id } })
    await app.prisma.odtItemTaller.create({ data: { odtItemId: itemAjeno.id, tallerId: taller.id, estado: 'pendiente' } })

    try {
      const tokenTaller = await loginAs('taller@plastimar.cl')
      const sinFiltro = await app.inject({ method: 'GET', url: `/api/odts/taller-items?tallerKind=${marker}`, headers: { authorization: `Bearer ${tokenTaller}` } })
      expect(JSON.parse(sinFiltro.body).items).toHaveLength(2)

      const conFiltro = await app.inject({ method: 'GET', url: `/api/odts/taller-items?tallerKind=${marker}&mine=true`, headers: { authorization: `Bearer ${tokenTaller}` } })
      const items = JSON.parse(conFiltro.body).items
      expect(items).toHaveLength(1)
      expect(items[0].odtItemId).toBe(itemMio.id)
    } finally {
      await app.prisma.odtItemTaller.deleteMany({ where: { odtItemId: { in: [itemMio.id, itemAjeno.id] } } })
      await app.prisma.odtItem.deleteMany({ where: { id: { in: [itemMio.id, itemAjeno.id] } } })
      await app.prisma.odt.delete({ where: { id: odt.id } })
      await app.prisma.taller.delete({ where: { id: taller.id } })
      await app.prisma.orden.delete({ where: { id: orden.id } })
    }
  })

  it('da de baja la cuenta vinculada al registrar un término de contrato ya cumplido', async () => {
    const marker = Date.now()
    const cuenta = await app.prisma.user.create({
      data: { email: `baja-${marker}@plastimar.cl`, passwordHash: 'x', role: 'taller', nombre: 'Cuenta baja prueba', activo: true },
    })
    const trabajador = await app.prisma.trabajador.create({
      data: { empresa: 'plastimar', nombres: 'Baja', apellidoPaterno: 'Automatica', apellidoMaterno: '', rut: `BAJA-${marker}`, usuarioId: cuenta.id },
    })
    try {
      const res = await app.inject({
        method: 'PUT', url: `/api/rrhh/trabajadores/${trabajador.id}`,
        headers: { authorization: `Bearer ${tokenRrhh}` },
        payload: { fechaTermino: '2020-01-01' },
      })
      expect(res.statusCode).toBe(200)
      expect((await app.prisma.trabajador.findUnique({ where: { id: trabajador.id } })).estado).toBe(false)
      expect((await app.prisma.user.findUnique({ where: { id: cuenta.id } })).activo).toBe(false)
    } finally {
      await app.prisma.trabajador.deleteMany({ where: { id: trabajador.id } })
      await app.prisma.user.deleteMany({ where: { id: cuenta.id } })
    }
  })
})
