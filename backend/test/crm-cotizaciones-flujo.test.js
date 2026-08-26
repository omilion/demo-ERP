// Verifica el flujo que arranca en "Nueva oportunidad" del CRM: al guardar una
// licitacion o una cotizacion simple, la ficha tiene que quedar como cotizacion
// del CRM y aparecer en el pipeline, SIN crear todavia una venta en Matriz.
// La venta se crea recien al aprobar la oportunidad.
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
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

describeDb('CRM: nueva oportunidad crea cotizacion y entra al pipeline', () => {
  let app
  let token
  let vendedorSinDescuentoToken
  let clienteId
  let productoId
  let vendedorId
  const marca = `CRMQ-${Date.now()}`
  const creados = []
  const auth = () => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()

    const vendedor = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true, role: true, nombre: true } })
    vendedorId = vendedor.id
    token = app.jwt.sign({
      id: vendedor.id, role: 'admin', nombre: vendedor.nombre || 'Test', permisosExtra: null,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    vendedorSinDescuentoToken = app.jwt.sign({
      id: vendedor.id, role: 'vendedor', nombre: vendedor.nombre || 'Test', permisosExtra: null,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })

    const cliente = await app.prisma.cliente.create({
      data: { rut: `${marca}-9`, nombre: `${marca} Cliente`, activo: true },
    })
    clienteId = cliente.id

    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marca}-P`, nombre: `${marca} Producto`, activo: true },
    })
    productoId = producto.id
  })

  afterAll(async () => {
    for (const id of creados) {
      await app.prisma.crmCotizacion.deleteMany({ where: { crmId: id } }).catch(() => {})
      await app.prisma.crmAsignacionHistorial.deleteMany({ where: { crmId: id } }).catch(() => {})
      await app.prisma.crmRegistro.delete({ where: { id } }).catch(() => {})
    }
    await app.prisma.producto.delete({ where: { id: productoId } }).catch(() => {})
    await app.prisma.cliente.delete({ where: { id: clienteId } }).catch(() => {})
    await app.close()
  })

  const fichaBase = () => ({
    clienteId,
    items: [{ productoId, cantidad: 2, precioUnitario: 15000 }],
    emailContactoDespacho: 'contacto@ejemplo.cl',
    observaciones: `${marca} observacion`,
    vendedorId,
  })

  async function ordenesDelCliente() {
    return app.prisma.orden.count({ where: { clienteId } })
  }

  it('licitacion: queda como cotizacion CRM en el pipeline y no crea venta', async () => {
    expect(await ordenesDelCliente()).toBe(0)

    const res = await app.inject({
      method: 'POST',
      url: '/api/crm/cotizaciones',
      headers: auth(),
      payload: {
        ...fichaBase(),
        tipo: 'Licitación',
        licitacion: `${marca}-LIC`,
        licitacionFecha: new Date().toISOString(),
      },
    })

    expect(res.statusCode).toBe(201)
    const { lead, cotizacion } = res.json()
    creados.push(lead.id)

    // Entra al pipeline por el canal correcto y con la etapa inicial.
    expect(lead.canalVenta).toBe('LICITACION')
    expect(lead.tipoVenta).toBe('LICITACION')
    expect(lead.etapaComercial).toBe('COTIZACION_ENVIADA')
    expect(lead.clienteId).toBe(clienteId)
    expect(lead.ncotizacion).toBe(`CRM-${lead.id}`)
    expect(lead.ordenId ?? null).toBeNull()

    // La cotizacion existe con sus items y sus datos de licitacion.
    expect(cotizacion.tipo).toBe('Licitación')
    expect(cotizacion.licitacion).toBe(`${marca}-LIC`)
    expect(cotizacion.items).toHaveLength(1)
    expect(cotizacion.items[0].cantidad).toBe(2)
    expect(cotizacion.items[0].precioUnitario).toBe(15000)

    // Lo esencial: todavia NO hay venta en Matriz.
    expect(await ordenesDelCliente()).toBe(0)
  })

  it('crea y edita la cotizacion dentro de una oportunidad CRM existente', async () => {
    const lead = await app.prisma.crmRegistro.create({
      data: {
        nombre: `${marca} oportunidad existente`,
        rut: `${marca}-9`,
        clienteId,
        vendedorId,
        ejecutiva: 'Vendedor de prueba',
        canalVenta: 'LICITACION',
        tipoVenta: 'LICITACION',
        etapaComercial: 'PENDIENTE_CLASIFICACION',
      },
    })
    creados.push(lead.id)

    const crear = await app.inject({
      method: 'POST',
      url: '/api/crm/cotizaciones',
      headers: auth(),
      payload: {
        ...fichaBase(),
        crmId: lead.id,
        tipo: 'Licitación',
        licitacion: `${marca}-EXISTENTE`,
        licitacionFecha: new Date().toISOString(),
      },
    })
    expect(crear.statusCode, crear.body).toBe(201)
    const creada = crear.json()
    expect(creada.lead.id).toBe(lead.id)
    expect(creada.cotizacion.crmId).toBe(lead.id)
    expect(await app.prisma.crmRegistro.count({ where: { id: lead.id } })).toBe(1)

    const editar = await app.inject({
      method: 'PUT',
      url: `/api/crm/${lead.id}/cotizacion`,
      headers: auth(),
      payload: {
        items: [{ productoId, cantidad: 3, precioUnitario: 17000, descripcion: 'Precio revisado' }],
        licitacionReferencia: 'Referencia actualizada',
      },
    })
    expect(editar.statusCode, editar.body).toBe(200)
    expect(editar.json()).toMatchObject({ crmId: lead.id, licitacionReferencia: 'Referencia actualizada' })
    expect(editar.json().items).toMatchObject([{ productoId, cantidad: 3, precioUnitario: 17000, descripcion: 'Precio revisado' }])
    expect(await ordenesDelCliente()).toBe(0)
  })

  it('cotizacion simple: mismo flujo por el canal de prospeccion', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/crm/cotizaciones',
      headers: auth(),
      payload: { ...fichaBase(), tipo: 'Venta Web', crmQuoteMode: 'PROSPECCION_DIRECTA' },
    })

    expect(res.statusCode).toBe(201)
    const { lead, cotizacion } = res.json()
    creados.push(lead.id)

    expect(lead.canalVenta).toBe('PROSPECCION_DIRECTA')
    expect(lead.tipoVenta).toBe('COTIZACION_SIMPLE')
    expect(lead.etapaComercial).toBe('COTIZACION_ENVIADA')
    expect(lead.origenDato).toBe('CRM_COTIZACION_SIMPLE')
    expect(cotizacion.tipo).toBe('Venta Directa')
    expect(cotizacion.items).toHaveLength(1)

    expect(await ordenesDelCliente()).toBe(0)
  })

  it('las dos aparecen al listar el CRM', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crm?search=' + encodeURIComponent(marca), headers: auth() })
    expect(res.statusCode).toBe(200)
    const ids = res.json().items.map(i => i.id)
    for (const id of creados) expect(ids).toContain(id)
  })

  // El tablero mostraba monto solo para lo importado de la web: una cotizacion
  // nacida en el CRM aparecia en cero aunque tuviera sus items guardados.
  it('el tablero y el detalle muestran el monto de la cotizacion propia', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crm?search=' + encodeURIComponent(marca), headers: auth() })
    const filas = res.json().items.filter(i => creados.includes(i.id))
    expect(filas.length).toBeGreaterThan(0)
    for (const fila of filas) {
      expect(fila.ordenCompraOnline ?? null).toBeNull()   // no viene de la web
      const totalEsperado = fila.id === creados[1] ? 3 * 17000 : 2 * 15000
      expect(fila.montoCotizado).toBe(totalEsperado)      // y aun asi tiene monto
    }

    const detalle = await app.inject({ method: 'GET', url: `/api/crm/${creados[0]}`, headers: auth() })
    expect(detalle.statusCode).toBe(200)
    expect(detalle.json().montoCotizado).toBe(2 * 15000)
  })

  it('la licitacion exige ID y fecha antes de guardarse', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/crm/cotizaciones',
      headers: auth(),
      payload: { ...fichaBase(), tipo: 'Licitación' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/[Ll]icitacion requiere ID y fecha/)
  })

  it('rechaza descuentos enviados por un vendedor sin permiso', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/crm/cotizaciones',
      headers: { authorization: `Bearer ${vendedorSinDescuentoToken}` },
      payload: { ...fichaBase(), tipo: 'Venta Web', crmQuoteMode: 'PROSPECCION_DIRECTA', descuentoPct: 10 },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/permiso para aplicar descuentos/)
  })

  it('un tipo que no es del CRM se rechaza', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/crm/cotizaciones',
      headers: auth(),
      payload: { ...fichaBase(), tipo: 'Venta sala' },
    })
    expect(res.statusCode).toBe(400)
  })
})
