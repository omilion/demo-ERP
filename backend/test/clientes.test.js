import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

// Genera un RUT chileno con digito verificador valido para pruebas que pasan
// por el endpoint HTTP (que ahora exige checksum real, ver PR feedback #2).
function validRut(bodyNumber) {
  const body = String(bodyNumber)
  let sum = 0
  let factor = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const res = 11 - (sum % 11)
  const dv = res === 11 ? '0' : res === 10 ? 'K' : String(res)
  return `${body}-${dv}`
}

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

async function tokenFor(app, payload = {}) {
  let userId = payload.id
  let authVersion = payload.authVersion ?? 0
  if (!userId) {
    const user = await app.prisma.user.findFirst({
      where: { activo: true, role: payload.role ?? 'rrhh' },
      select: { id: true, authVersion: true },
    })
    if (user) {
      userId = user.id
      authVersion = user.authVersion
    }
  }

  return app.jwt.sign({
    id: userId ?? 9999,
    role: payload.role ?? 'rrhh',
    nombre: payload.nombre ?? 'QA scoped',
    permisosExtra: payload.permisosExtra ?? null,
    authVersion,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

describe('GET /api/clientes', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns paginated list with saldo computed', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/clientes',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
    expect(Array.isArray(body.items)).toBe(true)
    if (body.items.length > 0) expect(body.items[0]).toHaveProperty('saldo')
  })

  it('cajero can read clientes', async () => {
    const t = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'GET', url: '/api/clientes',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('rrhh cannot read clientes', async () => {
    const t = await loginAs(app, 'rrhh')
    const res = await app.inject({
      method: 'GET', url: '/api/clientes',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('filters and searches by email like legacy', async () => {
    const marker = `cliente-email-${Date.now()}`
    const rut = `TEST-EMAIL-${Date.now()}`
    const email = `${marker}@example.cl`
    const cliente = await app.prisma.cliente.create({
      data: { rut, nombre: 'Cliente Email Legacy', email, activo: true },
    })
    try {
      const filtered = await app.inject({
        method: 'GET', url: `/api/clientes?email=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(filtered.statusCode).toBe(200)
      expect(JSON.parse(filtered.body).items.map(c => c.id)).toContain(cliente.id)

      const searched = await app.inject({
        method: 'GET', url: `/api/clientes?search=${encodeURIComponent(email)}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(searched.statusCode).toBe(200)
      expect(JSON.parse(searched.body).items.map(c => c.id)).toContain(cliente.id)
    } finally {
      await app.prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {})
    }
  })
})

describe('POST /api/clientes', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'vendedor') })
  afterAll(() => app.close())

  it('creates cliente', async () => {
    const rut = validRut(10000000 + (Date.now() % 89999999))
    const res = await app.inject({
      method: 'POST', url: '/api/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: { rut, nombre: 'Cliente Test', tipo: 'Empresa', ciudad: 'Testlandia' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.rut).toBe(rut)
    // cleanup
    await app.prisma.cliente.delete({ where: { rut } }).catch(() => {})
  })

  it('rejects rut with invalid checksum for cliente chileno (feedback #2)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: { rut: '16888432-K2', nombre: 'Cliente Rut Invalido' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/RUT/)
  })

  it('accepts non-chilean identifier without checksum when pais no es Chile (feedback #2)', async () => {
    const rut = `CUIT-${Date.now()}`
    const res = await app.inject({
      method: 'POST', url: '/api/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: { rut, nombre: 'Cliente Extranjero', pais: 'Argentina' },
    })
    expect(res.statusCode).toBe(201)
    await app.prisma.cliente.delete({ where: { rut } }).catch(() => {})
  })

  it('rejects telefono compuesto por texto (feedback #2)', async () => {
    const rut = validRut(10000000 + (Date.now() % 89999999))
    const res = await app.inject({
      method: 'POST', url: '/api/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: { rut, nombre: 'Cliente Telefono Invalido', telefono: 'no tiene telefono' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/[Tt]el[eé]fono/)
  })

  it('returns 409 for duplicate rut or email', async () => {
    const marker = Date.now()
    const rut = validRut(10000000 + (marker % 89999999))
    const rut2 = validRut(10000000 + ((marker + 1) % 89999999))
    const email = `cliente-duplicado-${marker}@example.cl`
    const cliente = await app.prisma.cliente.create({
      data: { rut, nombre: 'Cliente Duplicado Base', email },
    })
    try {
      const dupRut = await app.inject({
        method: 'POST', url: '/api/clientes',
        headers: { authorization: `Bearer ${token}` },
        payload: { rut, nombre: 'Otro Cliente Rut' },
      })
      expect(dupRut.statusCode).toBe(409)
      expect(JSON.parse(dupRut.body).error).toMatch(/RUT/)

      const dupEmail = await app.inject({
        method: 'POST', url: '/api/clientes',
        headers: { authorization: `Bearer ${token}` },
        payload: { rut: rut2, nombre: 'Otro Cliente Email', email: email.toUpperCase() },
      })
      expect(dupEmail.statusCode).toBe(409)
      expect(JSON.parse(dupEmail.body).error).toMatch(/email/)
    } finally {
      await app.prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {})
    }
  })
})

describe('GET /api/clientes/:id', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns cliente with saldo', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/clientes', headers: { authorization: `Bearer ${token}` } })
    const { items: clientes } = JSON.parse(listRes.body)
    if (clientes.length === 0) return
    const id = clientes[0].id
    const res = await app.inject({ method: 'GET', url: `/api/clientes/${id}`, headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveProperty('saldo')
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/clientes/999999', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for non-integer id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/clientes/abc', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(400)
  })

  it('loads inactive cliente only when requested explicitly', async () => {
    const marker = `TEST-CLIENTE-INACTIVE-GET-${Date.now()}`
    const cliente = await app.prisma.cliente.create({
      data: { rut: marker, nombre: marker, activo: false },
    })
    try {
      const hidden = await app.inject({
        method: 'GET', url: `/api/clientes/${cliente.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(hidden.statusCode).toBe(404)

      const visible = await app.inject({
        method: 'GET', url: `/api/clientes/${cliente.id}?includeInactivos=true`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(visible.statusCode).toBe(200)
      expect(JSON.parse(visible.body)).toMatchObject({ id: cliente.id, activo: false })
    } finally {
      await app.prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {})
    }
  })

  it('does not expose ventas or ODT history without module permissions', async () => {
    const marker = `TEST-CLIENTE-RBAC-HIST-${Date.now()}`
    const created = { clienteId: null, ordenId: null, productoId: null, odtId: null }
    try {
      const user = await app.prisma.user.findFirst()
      const cliente = await app.prisma.cliente.create({
        data: { rut: marker, nombre: marker, activo: true },
      })
      created.clienteId = cliente.id
      const producto = await app.prisma.producto.create({
        data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
      })
      created.productoId = producto.id
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          items: { create: [{ productoId: producto.id, cantidad: 1, precioUnitario: 1000 }] },
        },
      })
      created.ordenId = orden.id
      const odt = await app.prisma.odt.create({
        data: { ordenId: orden.id, clienteNombre: marker, estado: 'Pendiente' },
      })
      created.odtId = odt.id

      const scoped = await tokenFor(app, { permisosExtra: { clientes: ['read'] } })
      const res = await app.inject({
        method: 'GET', url: `/api/clientes/${cliente.id}`,
        headers: { authorization: `Bearer ${scoped}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.ventas).toEqual([])
      expect(body.odts).toEqual([])
    } finally {
      if (created.odtId) await app.prisma.odt.delete({ where: { id: created.odtId } }).catch(() => {})
      if (created.ordenId) {
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productoId) await app.prisma.producto.delete({ where: { id: created.productoId } }).catch(() => {})
      if (created.clienteId) await app.prisma.cliente.delete({ where: { id: created.clienteId } }).catch(() => {})
    }
  })

  it('includes cargos in cliente saldo and venta history totals', async () => {
    const marker = `TEST-CLIENTE-SALDO-CARGOS-${Date.now()}`
    const created = { clienteId: null, ordenId: null, productoId: null }
    try {
      const user = await app.prisma.user.findFirst()
      const cliente = await app.prisma.cliente.create({
        data: { rut: marker, nombre: marker, activo: true },
      })
      created.clienteId = cliente.id
      const producto = await app.prisma.producto.create({
        data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
      })
      created.productoId = producto.id
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          estadoPago: 'No pagada',
          abono: 100,
          items: { create: [{ productoId: producto.id, cantidad: 1, precioUnitario: 1000 }] },
          cargos: { create: [{ nombre: 'Transporte', valor: 250 }] },
        },
      })
      created.ordenId = orden.id

      const res = await app.inject({
        method: 'GET', url: `/api/clientes/${cliente.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.saldo).toBe(1150)
      expect(body.ventas.find(v => v.id === orden.id)?.total).toBe(1250)
    } finally {
      if (created.ordenId) {
        await app.prisma.ordenCargo.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productoId) await app.prisma.producto.delete({ where: { id: created.productoId } }).catch(() => {})
      if (created.clienteId) await app.prisma.cliente.delete({ where: { id: created.clienteId } }).catch(() => {})
    }
  })

  it('exports cliente saldo with rounded discount amount', async () => {
    const marker = `TEST-CLIENTE-EXPORT-DCTO-${Date.now()}`
    const created = { clienteId: null, ordenId: null, productoId: null }
    try {
      const user = await app.prisma.user.findFirst()
      const cliente = await app.prisma.cliente.create({
        data: { rut: marker, nombre: marker, activo: true },
      })
      created.clienteId = cliente.id
      const producto = await app.prisma.producto.create({
        data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
      })
      created.productoId = producto.id
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          estadoPago: 'No pagada',
          descuentoPct: 10,
          items: { create: [{ productoId: producto.id, cantidad: 1, precioUnitario: 333 }] },
          cargos: { create: [{ nombre: 'Transporte', valor: 100 }] },
        },
      })
      created.ordenId = orden.id

      const detail = await app.inject({
        method: 'GET',
        url: `/api/clientes/${cliente.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(detail.statusCode).toBe(200)
      expect(JSON.parse(detail.body).saldo).toBe(390)

      const list = await app.inject({
        method: 'GET',
        url: `/api/clientes?search=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(list.statusCode).toBe(200)
      expect(JSON.parse(list.body).items.find(item => item.id === cliente.id)?.saldo).toBe(390)

      const res = await app.inject({
        method: 'GET',
        url: `/api/reportes/export/clientes?search=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const line = res.body.split(/\r?\n/).find(row => row.includes(marker))
      expect(line).toBeTruthy()
      expect(line).toContain(';390;')
      expect(line).not.toContain('389.7')
    } finally {
      if (created.ordenId) {
        await app.prisma.ordenCargo.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productoId) await app.prisma.producto.delete({ where: { id: created.productoId } }).catch(() => {})
      if (created.clienteId) await app.prisma.cliente.delete({ where: { id: created.clienteId } }).catch(() => {})
    }
  })
})

describe('PUT /api/clientes/:id', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/clientes/999999',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: 'Test' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for empty body', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/clientes', headers: { authorization: `Bearer ${token}` } })
    const { items: clientes } = JSON.parse(listRes.body)
    if (clientes.length === 0) return
    const id = clientes[0].id
    const res = await app.inject({
      method: 'PUT', url: `/api/clientes/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('prevents vendedor from deactivating cliente through generic update', async () => {
    const vendedorToken = await loginAs(app, 'vendedor')
    const marker = `TEST-CLIENTE-RBAC-${Date.now()}`
    const cliente = await app.prisma.cliente.create({
      data: { rut: marker, nombre: marker, activo: true },
    })
    try {
      const res = await app.inject({
        method: 'PUT', url: `/api/clientes/${cliente.id}`,
        headers: { authorization: `Bearer ${vendedorToken}` },
        payload: { activo: false },
      })
      expect(res.statusCode).toBe(403)
      const unchanged = await app.prisma.cliente.findUnique({ where: { id: cliente.id } })
      expect(unchanged.activo).toBe(true)
    } finally {
      await app.prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {})
    }
  })

  it('updates inactive cliente profile fields without reactivating it', async () => {
    const marker = `TEST-CLIENTE-INACTIVE-PUT-${Date.now()}`
    const cliente = await app.prisma.cliente.create({
      data: { rut: marker, nombre: marker, activo: false },
    })
    try {
      const res = await app.inject({
        method: 'PUT', url: `/api/clientes/${cliente.id}`,
        headers: { authorization: `Bearer ${token}` },
        // "ciudad" se retiro de la ficha de cliente: la ubicacion vive en
        // region/comuna. Se comprueba con otro campo de perfil, que es lo que
        // este caso verifica en realidad: editar un inactivo sin reactivarlo.
        payload: { nombre: `${marker}-EDITADO`, direccion: 'Av. Siempre Viva 742' },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toMatchObject({
        id: cliente.id,
        nombre: `${marker}-EDITADO`,
        direccion: 'Av. Siempre Viva 742',
        activo: false,
      })
    } finally {
      await app.prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {})
    }
  })

  it('updates rut and blocks duplicate rut/email on update', async () => {
    const marker = `TEST-CLIENTE-RUT-PUT-${Date.now()}`
    const base = Date.now()
    const rut1 = validRut(10000000 + (base % 89999999))
    const rut2 = validRut(10000000 + ((base + 1) % 89999999))
    const rutEdit = validRut(10000000 + ((base + 2) % 89999999))
    const first = await app.prisma.cliente.create({
      data: { rut: rut1, nombre: `${marker} 1`, email: `${marker}-1@example.cl` },
    })
    const second = await app.prisma.cliente.create({
      data: { rut: rut2, nombre: `${marker} 2`, email: `${marker}-2@example.cl` },
    })
    try {
      const updateRut = await app.inject({
        method: 'PUT', url: `/api/clientes/${first.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { rut: rutEdit, nombre: `${marker} Editado` },
      })
      expect(updateRut.statusCode).toBe(200)
      expect(JSON.parse(updateRut.body)).toMatchObject({ rut: rutEdit })

      const dupRut = await app.inject({
        method: 'PUT', url: `/api/clientes/${first.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { rut: second.rut },
      })
      expect(dupRut.statusCode).toBe(409)
      expect(JSON.parse(dupRut.body).error).toMatch(/RUT/)

      const dupEmail = await app.inject({
        method: 'PUT', url: `/api/clientes/${first.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: second.email.toUpperCase() },
      })
      expect(dupEmail.statusCode).toBe(409)
      expect(JSON.parse(dupEmail.body).error).toMatch(/email/)
    } finally {
      await app.prisma.cliente.deleteMany({ where: { id: { in: [first.id, second.id] } } }).catch(() => {})
    }
  })

  it('prevents vendedor from reactivating cliente through generic update', async () => {
    const vendedorToken = await loginAs(app, 'vendedor')
    const marker = `TEST-CLIENTE-RBAC-REACT-${Date.now()}`
    const cliente = await app.prisma.cliente.create({
      data: { rut: marker, nombre: marker, activo: false },
    })
    try {
      const res = await app.inject({
        method: 'PUT', url: `/api/clientes/${cliente.id}`,
        headers: { authorization: `Bearer ${vendedorToken}` },
        payload: { activo: true },
      })
      expect(res.statusCode).toBe(403)
      const unchanged = await app.prisma.cliente.findUnique({ where: { id: cliente.id } })
      expect(unchanged.activo).toBe(false)
    } finally {
      await app.prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {})
    }
  })
})

describe('cliente lifecycle', () => {
  let app, token
  const rut = 'TEST-LIFE-CLIENTE-1'

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(async () => {
    await app.prisma.cliente.deleteMany({ where: { rut } }).catch(() => {})
    await app.close()
  })

  it('soft deactivates, hides from default list, lists as inactive and reactivates', async () => {
    await app.prisma.cliente.deleteMany({ where: { rut } }).catch(() => {})
    const cliente = await app.prisma.cliente.create({
      data: { rut, nombre: 'Cliente Lifecycle', tipo: 'Empresa', activo: true },
    })

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/clientes/${cliente.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { razon: 'Sin actividad comercial', usuario: 'QA Backend' },
    })
    expect(del.statusCode).toBe(200)
    expect(JSON.parse(del.body)).toMatchObject({ id: cliente.id, activo: false })

    await expect(app.prisma.cliente.findUnique({ where: { id: cliente.id } }))
      .resolves.toMatchObject({ activo: false })

    const hidden = await app.inject({
      method: 'GET',
      url: `/api/clientes?search=${rut}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(JSON.parse(hidden.body).items).toHaveLength(0)

    const inactive = await app.inject({
      method: 'GET',
      url: `/api/clientes?estado=inactivo&search=${rut}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(JSON.parse(inactive.body).items).toMatchObject([{ id: cliente.id, activo: false }])

    const reactivar = await app.inject({
      method: 'POST',
      url: `/api/clientes/${cliente.id}/reactivar`,
      headers: { authorization: `Bearer ${token}` },
      payload: { razon: 'Cliente retoma compras' },
    })
    expect(reactivar.statusCode).toBe(200)
    expect(JSON.parse(reactivar.body)).toMatchObject({ id: cliente.id, activo: true })
    await expect(app.prisma.cliente.findUnique({ where: { id: cliente.id } }))
      .resolves.toMatchObject({ activo: true })
  })
})
