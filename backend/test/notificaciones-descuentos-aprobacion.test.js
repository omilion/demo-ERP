// Una solicitud de descuento pendiente es una venta detenida esperando una
// firma. El modulo de Descuentos tiene su propia bandeja, pero quien aprueba no
// vive en esa pantalla: las solicitudes quedaban ahi sin que nadie se enterara.
// El centro de notificaciones consultaba ocho cosas y ninguna era esta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function hasUsableDatabaseUrl() {
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    return Boolean(url.hostname && url.username && url.password)
  } catch {
    return false
  }
}

const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describeDb('notificacion: descuentos esperando aprobacion', () => {
  let app
  const marca = `DCTO-NOTIF-${Date.now()}`
  const creado = { userIds: [] }
  let tokenAdmin
  let tokenAprobador
  let tokenVendedor

  const tokenPara = (user, extras = {}) => app.jwt.sign({
    id: user.id, role: user.role, nombre: user.nombre, permisosExtra: null,
    permisoAprobarDescuentos: extras.permisoAprobarDescuentos ?? user.permisoAprobarDescuentos ?? false,
    authVersion: user.authVersion ?? 0,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access', ...extras,
  })

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()

    const adminUser = await app.prisma.user.create({
      data: {
        email: `${marca}-admin@plastimar.test`.toLowerCase(),
        nombre: `${marca} admin`,
        passwordHash: 'dummy-hash',
        role: 'admin',
        activo: true,
        authVersion: 0,
      },
    })
    creado.userIds.push(adminUser.id)

    const aprobadorUser = await app.prisma.user.create({
      data: {
        email: `${marca}-aprobador@plastimar.test`.toLowerCase(),
        nombre: `${marca} aprobador`,
        passwordHash: 'dummy-hash',
        role: 'vendedor',
        activo: true,
        authVersion: 0,
        permisoAprobarDescuentos: true,
      },
    })
    creado.userIds.push(aprobadorUser.id)

    const vendedorUser = await app.prisma.user.create({
      data: {
        email: `${marca}-vendedor@plastimar.test`.toLowerCase(),
        nombre: `${marca} vendedor`,
        passwordHash: 'dummy-hash',
        role: 'vendedor',
        activo: true,
        authVersion: 0,
        permisoAprobarDescuentos: false,
      },
    })
    creado.userIds.push(vendedorUser.id)

    tokenAdmin = tokenPara(adminUser)
    tokenAprobador = tokenPara(aprobadorUser, { permisoAprobarDescuentos: true })
    tokenVendedor = tokenPara(vendedorUser, { permisoAprobarDescuentos: false })

    const regla = await app.prisma.descuentoRegla.create({
      data: {
        codigo: `${marca}-REGLA`,
        nombre: `${marca} con aprobacion`,
        tipoDescuento: 'porcentaje',
        porcentajeMax: 15,
        requiereAprobacion: true,
        activo: true,
      },
    })
    creado.reglaId = regla.id

    const pendiente = await app.prisma.descuentoSolicitud.create({
      data: {
        reglaId: regla.id,
        estado: 'PENDIENTE',
        origenTipo: 'venta',
        solicitanteId: vendedorUser.id,
        solicitanteNombre: `${marca} Vendedora`,
        descuentoPctSolicitado: 15,
        descuentoMontoSolicitado: 15000,
        subtotalBase: 100000,
        // Antigua a proposito: verifica el conteo de dias y la severidad.
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    })
    creado.pendienteId = pendiente.id

    const resuelta = await app.prisma.descuentoSolicitud.create({
      data: {
        reglaId: regla.id,
        estado: 'AUTORIZADA',
        origenTipo: 'venta',
        solicitanteNombre: `${marca} Ya resuelta`,
        descuentoPctSolicitado: 10,
        descuentoMontoSolicitado: 10000,
      },
    })
    creado.resueltaId = resuelta.id
  })

  afterAll(async () => {
    await app.prisma.descuentoSolicitud.deleteMany({ where: { reglaId: creado.reglaId } }).catch(() => {})
    await app.prisma.descuentoRegla.deleteMany({ where: { id: creado.reglaId } }).catch(() => {})
    if (creado.userIds?.length) {
      await app.prisma.user.deleteMany({ where: { id: { in: creado.userIds } } }).catch(() => {})
    }
    await app.close()
  })

  const notificaciones = token => app.inject({
    method: 'GET', url: '/api/notificaciones?limite=1000', headers: { authorization: `Bearer ${token}` },
  }).then(res => {
    expect(res.statusCode).toBe(200)
    const cuerpo = res.json()
    return Array.isArray(cuerpo) ? cuerpo : (cuerpo.items || [])
  })

  const miasDe = async token => (await notificaciones(token))
    .filter(n => n.tipo === 'descuento_aprobacion' && String(n.titulo || '').includes(marca))

  it('le avisa al admin, con el porcentaje, el monto y quien la pidio', async () => {
    const mias = await miasDe(tokenAdmin)
    expect(mias).toHaveLength(1)
    expect(mias[0].detalle).toContain('15%')
    expect(mias[0].detalle).toContain('$15.000')
    expect(mias[0].detalle).toContain('Vendedora')
    expect(mias[0].link).toBe('/descuentos')
  })

  it('marca la espera en dias y la trata como alta', async () => {
    const [mia] = await miasDe(tokenAdmin)
    expect(mia.detalle).toContain('3 día(s) esperando')
    expect(mia.severidad).toBe('alta')
  })

  it('tambien le llega a quien tiene el permiso de aprobar sin ser admin', async () => {
    const mias = await miasDe(tokenAprobador)
    expect(mias).toHaveLength(1)
  })

  // Lo que hace util el aviso es que llegue a quien puede resolverlo. A una
  // vendedora sin permiso solo le agrega ruido: no tiene boton que apretar.
  it('no le llega a quien no puede aprobar', async () => {
    const mias = await miasDe(tokenVendedor)
    expect(mias).toHaveLength(0)
  })

  it('no avisa de las ya resueltas', async () => {
    const mias = await miasDe(tokenAdmin)
    expect(mias.some(n => String(n.detalle || '').includes('Ya resuelta'))).toBe(false)
  })
})
