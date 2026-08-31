import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const ROLES = ['admin', 'vendedor', 'bodeguero', 'cajero', 'taller', 'rrhh', 'solo_lectura']

const PRODUCTOS_SEED = [
  { codigoInterno: 'ESP-001', nombre: 'Espuma Alta Densidad 15cm 2x1', categoria: 'Espumas', bodega: 'Inventario', stock: 12, stockCritico: 50, precioLista: 48990, precioMarco: 0 },
  { codigoInterno: 'ESP-002', nombre: 'Espuma Alta Densidad 10cm 2x1', categoria: 'Espumas', bodega: 'Inventario', stock: 5, stockCritico: 40, precioLista: 36500, precioMarco: 0 },
  { codigoInterno: 'ESP-003', nombre: 'Espuma Baja Densidad 20cm 2x1', categoria: 'Espumas', bodega: 'Inventario', stock: 88, stockCritico: 30, precioLista: 29900, precioMarco: 0 },
  { codigoInterno: 'VIS-001', nombre: 'Viscoelástico 8cm 2x1', categoria: 'Viscoelástico', bodega: 'Inventario', stock: 24, stockCritico: 20, precioLista: 89900, precioMarco: 0 },
  { codigoInterno: 'VIS-002', nombre: 'Viscoelástico 5cm 1.5x2', categoria: 'Viscoelástico', bodega: 'Inventario', stock: 3, stockCritico: 15, precioLista: 67500, precioMarco: 0 },
  { codigoInterno: 'TEL-001', nombre: 'Tela Microfibra Azul 1.5m', categoria: 'Telas', bodega: 'Taller', stock: 145, stockCritico: 50, precioLista: 5990, precioMarco: 0 },
  { codigoInterno: 'TEL-002', nombre: 'Tela Algodón Blanco 1.5m', categoria: 'Telas', bodega: 'Taller', stock: 8, stockCritico: 100, precioLista: 4500, precioMarco: 0 },
  { codigoInterno: 'MAD-001', nombre: 'Madera MDF 18mm 2.44x1.22', categoria: 'Maderas', bodega: 'Taller', stock: 32, stockCritico: 20, precioLista: 28900, precioMarco: 0 },
  { codigoInterno: 'MAD-002', nombre: 'Madera Pino Cepillado 2x4', categoria: 'Maderas', bodega: 'Taller', stock: 6, stockCritico: 30, precioLista: 12300, precioMarco: 0 },
  { codigoInterno: 'COL-001', nombre: 'Colchón Spring 2 plazas', categoria: 'Colchones', bodega: 'Inventario', stock: 42, stockCritico: 10, precioLista: 189900, precioMarco: 0 },
  { codigoInterno: 'COL-002', nombre: 'Colchón Ortopédico 1.5 plazas', categoria: 'Colchones', bodega: 'Inventario', stock: 18, stockCritico: 8, precioLista: 149900, precioMarco: 0 },
  { codigoInterno: 'FIB-001', nombre: 'Fibra Dacron 250gr/m2 1.5m', categoria: 'Fibras', bodega: 'Taller', stock: 2, stockCritico: 20, precioLista: 8900, precioMarco: 0 },
  { codigoInterno: 'FIB-002', nombre: 'Fibra Siliconada 200gr/m2', categoria: 'Fibras', bodega: 'Taller', stock: 0, stockCritico: 15, precioLista: 7600, precioMarco: 0 },
  { codigoInterno: 'ACC-001', nombre: 'Cierre Nylon 60cm Negro', categoria: 'Accesorios', bodega: 'Taller', stock: 340, stockCritico: 100, precioLista: 890, precioMarco: 0 },
  { codigoInterno: 'ACC-002', nombre: 'Hilo Poliéster 5000m Negro', categoria: 'Accesorios', bodega: 'Taller', stock: 12, stockCritico: 10, precioLista: 12500, precioMarco: 0 },
  { codigoInterno: 'ESP-004', nombre: 'Espuma HR35 12cm 1.5x2', categoria: 'Espumas', bodega: 'Inventario', stock: 0, stockCritico: 25, precioLista: 42300, precioMarco: 0 },
  { codigoInterno: 'LAT-001', nombre: 'Látex Natural 7cm 2x1.5', categoria: 'Látex', bodega: 'Inventario', stock: 7, stockCritico: 10, precioLista: 124900, precioMarco: 0 },
  { codigoInterno: 'PLT-001', nombre: 'Plataforma Base Cama 2 plazas', categoria: 'Bases', bodega: 'Inventario', stock: 15, stockCritico: 5, precioLista: 89000, precioMarco: 0 },
  { codigoInterno: 'ESP-005', nombre: 'Espuma Decorativa 5cm Rollo', categoria: 'Espumas', bodega: 'Inventario', stock: 55, stockCritico: 30, precioLista: 18500, precioMarco: 0 },
  { codigoInterno: 'IMP-001', nombre: 'Impermeable Microfibra 2x1', categoria: 'Protectores', bodega: 'Inventario', stock: 29, stockCritico: 20, precioLista: 24900, precioMarco: 0 },
]

const CLIENTES_SEED = [
  { rut: '14429825-765', nombre: 'SERVICIO NAC. DE SALUD', ciudad: 'Valparaíso', email: 'compras@sns.cl', telefono: '+56 32 223 4500', limiteCredito: 10000000, tipo: 'Institucional' },
  { rut: '28265013994', nombre: 'INST. HUMANIDADES LUIS CAMPINO', ciudad: 'Santiago', email: 'admin@campino.cl', telefono: '+56 2 2345 6789', limiteCredito: 2000000, tipo: 'Institucional' },
  { rut: '76123456-7', nombre: 'CONSTRUCTORA SANTA ELENA LTDA.', ciudad: 'Viña del Mar', email: 'compras@santaelena.cl', telefono: '+56 32 287 6543', limiteCredito: 5000000, tipo: 'Empresa' },
  { rut: '79812345-2', nombre: 'MUNICIPALIDAD DE VIÑA DEL MAR', ciudad: 'Viña del Mar', email: 'adquisiciones@munivina.cl', telefono: '+56 32 233 4567', limiteCredito: 20000000, tipo: 'Municipal' },
  { rut: '88234567-K', nombre: 'HOTEL ENJOY VIÑA DEL MAR', ciudad: 'Viña del Mar', email: 'compras@enjoy.cl', telefono: '+56 32 298 7654', limiteCredito: 3000000, tipo: 'Empresa' },
  { rut: '76543210-1', nombre: 'CLÍNICA SANTA MARÍA S.A.', ciudad: 'Santiago', email: 'adqui@santamaria.cl', telefono: '+56 2 2913 0000', limiteCredito: 8000000, tipo: 'Empresa' },
  { rut: '14987654-3', nombre: 'DISTRIBUIDORA LOS ANDES', ciudad: 'Rancagua', email: 'ventas@losandes.cl', telefono: '+56 72 223 1234', limiteCredito: 1000000, tipo: 'Distribuidor' },
  { rut: '96123456-5', nombre: 'COLEGIO INGLÉS VALPARAÍSO', ciudad: 'Valparaíso', email: 'finanzas@colegioingles.cl', telefono: '+56 32 222 1234', limiteCredito: 2000000, tipo: 'Institucional' },
  { rut: '76321098-4', nombre: 'DIR. SALUD REG. METROPOLITANA', ciudad: 'Santiago', email: 'dsalud@gob.cl', telefono: '+56 2 2345 9876', limiteCredito: 15000000, tipo: 'Gobierno' },
  { rut: '65432109-8', nombre: 'EMPRESA PORTUARIA VALPARAÍSO', ciudad: 'Valparaíso', email: 'compras@epv.cl', telefono: '+56 32 244 8800', limiteCredito: 3000000, tipo: 'Empresa' },
  { rut: '11123456-7', nombre: 'FERRETERÍA EL PERNO LTDA.', ciudad: 'Quilpué', email: 'info@elperno.cl', telefono: '+56 32 295 1122', limiteCredito: 500000, tipo: 'Empresa' },
  { rut: '22234567-8', nombre: 'COMERCIAL MUEBLES Y MÁS', ciudad: 'Santiago', email: 'contacto@muebles.cl', telefono: '+56 2 2234 5678', limiteCredito: 800000, tipo: 'Empresa' },
]

async function main() {
  const passwordHash = await bcrypt.hash('dev1234', 12)

  await prisma.sucursal.upsert({
    where: { id: 1 },
    update: { nombre: 'Casa Matriz', activo: true },
    create: { id: 1, nombre: 'Casa Matriz', activo: true },
  })

  for (const role of ROLES) {
    // La cuenta técnica admin se usa para revisar la copia completa de
    // producción: no debe ocultar ventas/OTs de otra sucursal.
    const sucursalId = role === 'admin' ? null : 1
    await prisma.user.upsert({
      where: { email: `${role}@plastimar.cl` },
      // A production clone can already contain these technical accounts with
      // production-only credentials. Keep the test login contract deterministic.
      update: { passwordHash, role, sucursalId, activo: true },
      create: {
        email: `${role}@plastimar.cl`,
        passwordHash,
        role,
        nombre: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
        sucursalId,
      },
    })
  }

  for (const [i, nombre] of [['1', 'Caja 1'], ['2', 'Caja 2']]) {
    await prisma.caja.upsert({
      where: { id: Number(i) },
      update: { sucursalId: 1, activa: true },
      create: { nombre, sucursalId: 1 },
    })
  }

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@plastimar.cl' } })

  await prisma.taller.upsert({
    where: { nombre: 'Taller de Corte' },
    update: { activo: true },
    create: { nombre: 'Taller de Corte', activo: true },
  })

  for (const p of PRODUCTOS_SEED) {
    const producto = { estadoInventario: 'Inventariado', ...p }
    await prisma.producto.upsert({
      where: { codigoInterno: producto.codigoInterno },
      update: producto,
      create: producto,
    })
  }

  for (const c of CLIENTES_SEED) {
    await prisma.cliente.upsert({
      where: { rut: c.rut },
      update: c,
      create: c,
    })
  }

  // Seed precio historial for ESP-001
  const esp001 = await prisma.producto.findUnique({ where: { codigoInterno: 'ESP-001' } })
  if (esp001) {
    const existing = await prisma.precioHistorial.count({ where: { productoId: esp001.id } })
    if (existing === 0) {
      await prisma.precioHistorial.createMany({
        data: [
          { productoId: esp001.id, precioAnterior: 42500, precioNuevo: 48990, pct: 15.3, usuarioNombre: 'admin@plastimar.cl', createdAt: new Date('2026-04-15T10:30:00Z') },
          { productoId: esp001.id, precioAnterior: 39900, precioNuevo: 42500, pct: 6.5, usuarioNombre: 'admin@plastimar.cl', createdAt: new Date('2026-02-01T09:00:00Z') },
        ],
      })
    }
  }

  // Seed ordenes with representative data
  const clientes = await prisma.cliente.findMany({ select: { id: true, rut: true } })
  const clienteMap = Object.fromEntries(clientes.map(c => [c.rut, c.id]))
  const firstProducto = await prisma.producto.findFirst()

  const ORDENES_SEED = [
    { clienteRut: '14429825-765', tipo: 'Licitación', estado: 'Activa', estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega', abono: 0, facturado: 4979039, guias: 11695, licitacion: '61602954-LE15-1', creadorNombre: 'Amy', total: 4979039 },
    { clienteRut: '28265013994', tipo: 'Normal', estado: 'Activa', estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega', abono: 0, facturado: 768990, guias: null, licitacion: null, creadorNombre: 'Cinthia', total: 768990 },
    { clienteRut: '76123456-7', tipo: 'Normal', estado: 'Activa', estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega', abono: 500000, facturado: 1230500, guias: 11680, licitacion: null, creadorNombre: 'Marcelo', total: 1230500 },
    { clienteRut: '79812345-2', tipo: 'Licitación', estado: 'Activa', estadoPago: 'Pagada', estadoEntrega: 'Entregada', abono: 3456780, facturado: 3456780, guias: 11660, licitacion: '60312001-LE02-3', creadorNombre: 'Amy', total: 3456780 },
    { clienteRut: '88234567-K', tipo: 'Normal', estado: 'Activa', estadoPago: 'Pagada', estadoEntrega: 'Entregada', abono: 890000, facturado: 890000, guias: 11642, licitacion: null, creadorNombre: 'Diego', total: 890000 },
    { clienteRut: '76543210-1', tipo: 'Convenio Marco', estado: 'Activa', estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega', abono: 0, facturado: 2100000, guias: null, licitacion: 'CM-2026-003', creadorNombre: 'Cinthia', total: 2100000 },
    { clienteRut: '14987654-3', tipo: 'Normal', estado: 'Activa', estadoPago: 'No pagada', estadoEntrega: 'Entregada', abono: 200000, facturado: 456780, guias: 11610, licitacion: null, creadorNombre: 'Marcelo', total: 456780 },
  ]

  for (const [index, o] of ORDENES_SEED.entries()) {
    const nInterno = 15001 + index
    const clienteId = clienteMap[o.clienteRut]
    const existing = await prisma.orden.findFirst({ where: { clienteId, creadorNombre: o.creadorNombre, facturado: o.facturado } })
    const nInternoOcupado = await prisma.orden.findFirst({ where: { nInterno }, select: { id: true } })
    if (existing) {
      await prisma.orden.update({
        where: { id: existing.id },
        data: {
          sucursalId: existing.sucursalId ?? 1,
          nInterno: existing.nInterno ?? (nInternoOcupado ? undefined : nInterno),
        },
      })
    } else if (!nInternoOcupado && firstProducto) {
      await prisma.orden.create({
        data: {
          nInterno,
          tipo: o.tipo,
          estado: o.estado,
          estadoPago: o.estadoPago,
          estadoEntrega: o.estadoEntrega,
          sucursalId: 1,
          clienteId,
          userId: adminUser.id,
          abono: o.abono,
          facturado: o.facturado,
          guias: o.guias,
          licitacion: o.licitacion,
          creadorNombre: o.creadorNombre,
          items: {
            create: [{ productoId: firstProducto.id, cantidad: 1, precioUnitario: o.total }],
          },
        },
      })
    }
  }

  // Seed ODTs
  const ODTS_SEED = [
    { tipo: 'Espumas', clienteNombre: 'Hospital Carlos Van Buren', descripcion: 'Confección espumas alta densidad 15cm, 46 unidades', estado: 'Prioritaria', plazo: new Date('2026-04-28') },
    { tipo: 'Confecciones', clienteNombre: 'Clínica Santa María', descripcion: 'Forros impermeables colchones hospitalarios x24', estado: 'Pendiente', plazo: new Date('2026-04-30') },
    { tipo: 'Madera', clienteNombre: 'Hotel Enjoy Viña del Mar', descripcion: 'Bases cama matrimonial tono nogal x8', estado: 'Prioritaria', plazo: new Date('2026-04-27') },
    { tipo: 'Espumas', clienteNombre: 'Municipalidad Viña del Mar', descripcion: 'Espumas tapizado sillas oficina x120', estado: 'En proceso', plazo: new Date('2026-04-25') },
    { tipo: 'Confecciones', clienteNombre: 'Dir. Salud Reg. Metropolitana', descripcion: 'Espumas anti-escaras hospitales x180', estado: 'Prioritaria', plazo: new Date('2026-04-26') },
  ]
  const odtCount = await prisma.odt.count()
  if (odtCount === 0) {
    const ordenesForOdt = await prisma.orden.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      take: ODTS_SEED.length,
    })
    await prisma.odt.createMany({
      data: ODTS_SEED.map((odt, index) => ({
        ...odt,
        ordenId: ordenesForOdt[index % ordenesForOdt.length]?.id,
      })),
    })
  }

  console.log('Seed OK')
}

main().catch(console.error).finally(() => prisma.$disconnect())
