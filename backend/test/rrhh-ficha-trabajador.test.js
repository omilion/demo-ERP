// La ficha del trabajador se llenaba desde un modal que no ofrecia todos los
// campos que el backend si acepta: sueldo base y valor de la hora extra no
// tenian donde escribirse, y la cuenta de login vinculada volvia como un id
// suelto, sin nombre, asi que la ficha mostraba "#12".
//
// Tambien se cubre el filtro por estado: dar de baja a alguien lo sacaba del
// listado sin dejar forma de volver a encontrarlo.
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

describeDb('ficha de trabajador: campos completos y estado', () => {
  let app
  let token
  const marca = `FICHA-${Date.now()}`
  const creados = []

  const auth = () => ({ authorization: `Bearer ${token}` })

  const crear = payload => app.inject({
    method: 'POST', url: '/api/rrhh/trabajadores', headers: auth(),
    payload: { empresa: 'plastimar', ...payload },
  })

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = app.jwt.sign({
      id: 8801, role: 'rrhh', nombre: `${marca} RRHH`, permisosExtra: null,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
  })

  afterAll(async () => {
    await app.prisma.trabajador.deleteMany({ where: { id: { in: creados } } }).catch(() => {})
    await app.close()
  })

  it('guarda sueldo base y valor hora extra al crear, y los devuelve', async () => {
    const res = await crear({
      nombres: 'Ana', apellidoPaterno: `${marca}-Base`, rut: `${marca}-1`,
      sueldoBase: 650000, valorHoraExtra: 4200,
    })
    expect(res.statusCode).toBe(201)
    const creado = JSON.parse(res.body)
    creados.push(creado.id)
    expect(creado.sueldoBase).toBe(650000)
    expect(creado.valorHoraExtra).toBe(4200)
  })

  it('la ficha trae la cuenta de login con nombre, no solo el id', async () => {
    const usuario = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true, nombre: true } })
    const res = await crear({ nombres: 'Luis', apellidoPaterno: `${marca}-Cuenta`, rut: `${marca}-2` })
    const creado = JSON.parse(res.body)
    creados.push(creado.id)

    await app.inject({
      method: 'PUT', url: `/api/rrhh/trabajadores/${creado.id}`, headers: auth(),
      payload: { usuarioId: usuario.id },
    })

    const ficha = await app.inject({
      method: 'GET', url: `/api/rrhh/trabajadores/${creado.id}`, headers: auth(),
    })
    expect(ficha.statusCode).toBe(200)
    const cuerpo = JSON.parse(ficha.body)
    expect(cuerpo.usuario?.id).toBe(usuario.id)
    expect(cuerpo.usuario?.nombre).toBe(usuario.nombre)
    // Las horas extras tienen endpoint desde siempre pero no venian en la ficha,
    // asi que su pestaña no tenia de donde leer.
    expect(Array.isArray(cuerpo.horasExtras)).toBe(true)
  })

  // Editar manda solo lo que cambio: el resto de la ficha no se puede perder
  // por no haberlo incluido en el formulario.
  it('editar un campo no borra el sueldo base cargado antes', async () => {
    const res = await crear({
      nombres: 'Rosa', apellidoPaterno: `${marca}-Parcial`, rut: `${marca}-3`, sueldoBase: 800000,
    })
    const creado = JSON.parse(res.body)
    creados.push(creado.id)

    const editado = await app.inject({
      method: 'PUT', url: `/api/rrhh/trabajadores/${creado.id}`, headers: auth(),
      payload: { cargo: 'Cortadora' },
    })
    expect(editado.statusCode).toBe(200)
    const cuerpo = JSON.parse(editado.body)
    expect(cuerpo.cargo).toBe('Cortadora')
    expect(cuerpo.sueldoBase).toBe(800000)
  })

  it('permite listar a los dados de baja, no solo a los activos', async () => {
    const res = await crear({ nombres: 'Pedro', apellidoPaterno: `${marca}-Baja`, rut: `${marca}-4` })
    const creado = JSON.parse(res.body)
    creados.push(creado.id)

    await app.inject({
      method: 'PUT', url: `/api/rrhh/trabajadores/${creado.id}`, headers: auth(),
      payload: { estado: false },
    })

    const listar = async query => {
      const res = await app.inject({ method: 'GET', url: `/api/rrhh/trabajadores?${query}`, headers: auth() })
      expect(res.statusCode).toBe(200)
      return JSON.parse(res.body).items.filter(t => t.apellidoPaterno === `${marca}-Baja`)
    }

    expect(await listar('estado=true')).toHaveLength(0)
    expect(await listar('estado=false')).toHaveLength(1)
    expect(await listar('page=1')).toHaveLength(1)
  })
})
