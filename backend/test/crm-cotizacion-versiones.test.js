// CU-06: versionar la propuesta original y sus cambios, y registrar la
// aceptacion del cliente.
//
// Editar una cotizacion hace deleteMany + create sobre los items, de modo que
// sin versionado la propuesta anterior se destruye: no queda rastro de que se
// le ofrecio al cliente ni de que fue lo que acepto.
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

describeDb('CRM: versionado de la cotizacion y aceptacion del cliente', () => {
  let app
  let token
  let clienteId
  let productoId
  let leadId
  const marca = `CRMV-${Date.now()}`
  const auth = () => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()

    const vendedor = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true, nombre: true } })
    token = app.jwt.sign({
      id: vendedor.id, role: 'admin', nombre: vendedor.nombre || 'Test', permisosExtra: null,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })

    const cliente = await app.prisma.cliente.create({ data: { rut: `${marca}-9`, nombre: `${marca} Cliente`, activo: true } })
    clienteId = cliente.id
    const producto = await app.prisma.producto.create({ data: { codigoInterno: `${marca}-P`, nombre: `${marca} Producto`, activo: true } })
    productoId = producto.id

    const res = await app.inject({
      method: 'POST', url: '/api/crm/cotizaciones', headers: auth(),
      payload: {
        clienteId,
        tipo: 'Licitación',
        licitacion: `${marca}-LIC`,
        licitacionFecha: new Date().toISOString(),
        emailContactoDespacho: 'contacto@ejemplo.cl',
        vendedorId: vendedor.id,
        items: [{ productoId, cantidad: 10, precioUnitario: 1000 }],
      },
    })
    leadId = res.json().lead.id
  })

  afterAll(async () => {
    if (leadId) {
      await app.prisma.crmCotizacion.deleteMany({ where: { crmId: leadId } }).catch(() => {})
      await app.prisma.crmAsignacionHistorial.deleteMany({ where: { crmId: leadId } }).catch(() => {})
      await app.prisma.crmRegistro.delete({ where: { id: leadId } }).catch(() => {})
    }
    await app.prisma.producto.delete({ where: { id: productoId } }).catch(() => {})
    await app.prisma.cliente.delete({ where: { id: clienteId } }).catch(() => {})
    await app.close()
  })

  const editar = (items, motivoCambio) => app.inject({
    method: 'PUT', url: `/api/crm/${leadId}/cotizacion`, headers: auth(),
    payload: { items, ...(motivoCambio ? { motivoCambio } : {}) },
  })

  const versiones = () => app.inject({ method: 'GET', url: `/api/crm/${leadId}/cotizacion/versiones`, headers: auth() })

  it('la propuesta original queda archivada al editarla', async () => {
    const antes = await versiones()
    expect(antes.statusCode).toBe(200)
    // Todavia no hay ediciones: la vigente es la version 1 y no hay historial.
    expect(antes.json().versiones).toHaveLength(0)
    expect(antes.json().vigente.version).toBe(1)
    expect(antes.json().vigente.total).toBe(10 * 1000)

    const edicion = await editar([{ productoId, cantidad: 4, precioUnitario: 1200 }], 'El cliente bajo la cantidad')
    expect(edicion.statusCode).toBe(200)

    const despues = await versiones()
    const cuerpo = despues.json()
    // La propuesta original sigue disponible con sus cifras originales.
    expect(cuerpo.versiones).toHaveLength(1)
    expect(cuerpo.versiones[0].version).toBe(1)
    expect(cuerpo.versiones[0].total).toBe(10 * 1000)
    expect(cuerpo.versiones[0].snapshot.items[0].cantidad).toBe(10)
    expect(cuerpo.versiones[0].motivo).toBe('El cliente bajo la cantidad')
    // Y la vigente es la nueva.
    expect(cuerpo.vigente.version).toBe(2)
    expect(cuerpo.vigente.total).toBe(4 * 1200)
  })

  it('registra quien acepto, por que via y contra que version', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/crm/${leadId}/cotizacion/aceptacion`, headers: auth(),
      payload: { medio: 'OC', por: 'Paulina Chinchon', referencia: 'OC-4471' },
    })
    expect(res.statusCode).toBe(200)

    const cuerpo = (await versiones()).json()
    expect(cuerpo.aceptacion.medio).toBe('OC')
    expect(cuerpo.aceptacion.por).toBe('Paulina Chinchon')
    expect(cuerpo.aceptacion.referencia).toBe('OC-4471')
    expect(cuerpo.aceptacion.version).toBe(2)
    // Se acepto la version vigente: no hay desfase.
    expect(cuerpo.aceptacion.desactualizada).toBe(false)
  })

  // Lo valioso de fijar la version aceptada: si despues se edita, el sistema
  // avisa que lo que el cliente acepto ya no es lo que esta vigente.
  it('avisa cuando la cotizacion se edita despues de aceptada', async () => {
    await editar([{ productoId, cantidad: 4, precioUnitario: 1500 }], 'Ajuste de precio posterior')
    const cuerpo = (await versiones()).json()
    expect(cuerpo.vigente.version).toBe(3)
    expect(cuerpo.aceptacion.version).toBe(2)
    expect(cuerpo.aceptacion.desactualizada).toBe(true)
  })

  it('exige el respaldo documental cuando la via lo tiene', async () => {
    const sinOc = await app.inject({
      method: 'POST', url: `/api/crm/${leadId}/cotizacion/aceptacion`, headers: auth(),
      payload: { medio: 'OC', por: 'Paulina Chinchon' },
    })
    expect(sinOc.statusCode).toBe(400)
    expect(sinOc.json().error).toMatch(/orden de compra/i)

    // Una aceptacion verbal no tiene documento que exigir.
    const verbal = await app.inject({
      method: 'POST', url: `/api/crm/${leadId}/cotizacion/aceptacion`, headers: auth(),
      payload: { medio: 'VERBAL', por: 'Paulina Chinchon' },
    })
    expect(verbal.statusCode).toBe(200)
  })

  it('rechaza un medio de aceptacion fuera del catalogo', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/crm/${leadId}/cotizacion/aceptacion`, headers: auth(),
      payload: { medio: 'WHATSAPP', por: 'Alguien' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/medio de aceptacion/i)
  })

  it('exige saber quien acepto', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/crm/${leadId}/cotizacion/aceptacion`, headers: auth(),
      payload: { medio: 'VERBAL' },
    })
    expect(res.statusCode).toBe(400)
  })
})
