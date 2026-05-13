# Fase 2: API + Conexión Frontend — Plan de Implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el frontend React al backend Fastify reemplazando todos los mocks `src/data/*.js` con TanStack Query hooks que consumen endpoints CRUD reales, módulo a módulo.

**Architecture:** Backend Fastify 5 con rutas CRUD por módulo (pattern `routes/<modulo>/index|list|get|create|update|delete.js`), cada endpoint con JWT auth + RBAC + validación Zod. Frontend usa hooks TanStack Query en `src/api/*.js`; las páginas reemplazan imports de `src/data/*.js` por esos hooks.

**Tech Stack:** Fastify 5, Prisma 7, PostgreSQL (multi-schema), Zod 4, TanStack Query v5, React 19, Vitest (backend integration tests con inject + real DB)

**Commits:** Sin Co-Authored-By de Claude. Solo autor `sreich69`.

---

## Chunk 1: Schema + Migración + Seed + RBAC

### Task 1: Agregar campos faltantes al schema Prisma

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Agregar campos a Producto, Cliente, Orden, Odt y nuevo model PrecioHistorial**

Editar `backend/prisma/schema.prisma`. Reemplazar los modelos así:

```prisma
model Producto {
  id            Int     @id @default(autoincrement())
  codigoInterno String  @unique @map("codigo_interno")
  codigoBarra   String? @map("codigo_barra")
  nombre        String
  categoria     String?
  proveedor     String?
  bodega        String  @default("Inventario")
  categoriaId   Int?    @map("categoria_id")
  proveedorId   Int?    @map("proveedor_id")
  precioLista   Float   @default(0) @map("precio_lista")
  precioMarco   Float   @default(0) @map("precio_marco")
  stock         Int     @default(0)
  stockCritico  Int     @default(0) @map("stock_critico")
  ubicacion     String?
  visibleWeb    Boolean @default(false) @map("visible_web")
  activo        Boolean @default(true)

  @@map("productos")
  @@schema("catalogo")
}

model Cliente {
  id                 Int     @id @default(autoincrement())
  rut                String  @unique
  nombre             String
  email              String?
  telefono           String?
  ciudad             String?
  tipo               String?
  razonSocial        String? @map("razon_social")
  limiteCredito      Float?  @map("limite_credito")
  diasInactivoAlerta Int?    @map("dias_inactivo_alerta")
  segmento           String? @default("C")
  activo             Boolean @default(true)

  @@map("clientes")
  @@schema("clientes")
}

model Orden {
  id                 Int         @id @default(autoincrement())
  tipo               String
  estado             String      @default("Activa")
  estadoPago         String      @default("No pagada") @map("estado_pago")
  estadoEntrega      String      @default("Pendiente entrega") @map("estado_entrega")
  clienteId          Int?        @map("cliente_id")
  userId             Int         @map("user_id")
  sucursalId         Int?        @map("sucursal_id")
  descuentoPct       Float       @default(0) @map("descuento_pct")
  abono              Float       @default(0)
  facturado          Float?
  guias              Int?
  licitacion         String?
  observaciones      String?
  creadorNombre      String?     @map("creador_nombre")
  requiereAprobacion Boolean     @default(false) @map("requiere_aprobacion")
  createdAt          DateTime    @default(now()) @map("created_at")
  items              OrdenItem[]

  @@map("ordenes")
  @@schema("ventas")
}

model Odt {
  id            Int       @id @default(autoincrement())
  tipo          String?
  clienteNombre String?   @map("cliente_nombre")
  descripcion   String?
  plazo         DateTime?
  ordenId       Int?      @map("orden_id")
  estado        String    @default("Pendiente")
  prioridad     String    @default("normal")
  vendedorId    Int?      @map("vendedor_id")
  operarioId    Int?      @map("operario_id")
  createdAt     DateTime  @default(now()) @map("created_at")
  items         OdtItem[]

  @@map("odts")
  @@schema("taller")
}
```

Agregar el nuevo model al final del bloque `// ── CATALOGO`:

```prisma
model PrecioHistorial {
  id             Int      @id @default(autoincrement())
  productoId     Int      @map("producto_id")
  precioAnterior Float    @map("precio_anterior")
  precioNuevo    Float    @map("precio_nuevo")
  pct            Float
  usuarioNombre  String   @map("usuario_nombre")
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("precio_historial")
  @@schema("catalogo")
}
```

- [ ] **Step 2: Verificar que el schema es válido**

```bash
cd backend && npx prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid`

### Task 2: Correr migración

**Files:**
- Create: `backend/prisma/migrations/20260513XXXXXX_add_fase2_campos/migration.sql` (generado automático)

- [ ] **Step 1: Crear y aplicar migración**

```bash
cd backend && npx prisma migrate dev --name add_fase2_campos
```
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 2: Regenerar Prisma Client**

```bash
cd backend && npx prisma generate
```
Expected: `Generated Prisma Client`

- [ ] **Step 3: Verificar que el backend arranca sin errores**

```bash
cd backend && node --input-type=module <<< "import { buildApp } from './src/app.js'; const a = buildApp({logger:false}); await a.ready(); console.log('OK'); await a.close()"
```
Expected: `OK`

### Task 3: Actualizar RBAC — añadir ventas:read a cajero

**Files:**
- Modify: `backend/src/middleware/rbac.js`

- [ ] **Step 1: Agregar `ventas: ['read']` a cajero en PERMISSIONS**

En `rbac.js` línea del `cajero`:
```js
cajero: {
  caja:     ['read', 'write'],
  cobranza: ['read', 'write'],
  clientes: ['read'],
  ventas:   ['read'],
},
```

- [ ] **Step 2: Verificar test RBAC existente**

```bash
cd backend && npm test -- rbac
```
Expected: todos los tests pasan

### Task 4: Actualizar seed con datos reales de los mocks

**Files:**
- Modify: `backend/prisma/seed.js`

- [ ] **Step 1: Reemplazar seed.js con datos completos**

```js
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

  for (const role of ROLES) {
    await prisma.user.upsert({
      where: { email: `${role}@plastimar.cl` },
      update: {},
      create: {
        email: `${role}@plastimar.cl`,
        passwordHash,
        role,
        nombre: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
      },
    })
  }

  for (const [i, nombre] of [['1', 'Caja 1'], ['2', 'Caja 2']]) {
    await prisma.caja.upsert({
      where: { id: Number(i) },
      update: {},
      create: { nombre, sucursalId: 1 },
    })
  }

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@plastimar.cl' } })

  for (const p of PRODUCTOS_SEED) {
    await prisma.producto.upsert({
      where: { codigoInterno: p.codigoInterno },
      update: p,
      create: p,
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

  for (const o of ORDENES_SEED) {
    const clienteId = clienteMap[o.clienteRut]
    const existing = await prisma.orden.findFirst({ where: { clienteId, creadorNombre: o.creadorNombre, facturado: o.facturado } })
    if (!existing && firstProducto) {
      await prisma.orden.create({
        data: {
          tipo: o.tipo,
          estado: o.estado,
          estadoPago: o.estadoPago,
          estadoEntrega: o.estadoEntrega,
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
  const clienteSNS = await prisma.cliente.findUnique({ where: { rut: '14429825-765' } })
  const ODTS_SEED = [
    { tipo: 'Espumas', clienteNombre: 'Hospital Carlos Van Buren', descripcion: 'Confección espumas alta densidad 15cm, 46 unidades', estado: 'Prioritaria', plazo: new Date('2026-04-28') },
    { tipo: 'Confecciones', clienteNombre: 'Clínica Santa María', descripcion: 'Forros impermeables colchones hospitalarios x24', estado: 'Pendiente', plazo: new Date('2026-04-30') },
    { tipo: 'Madera', clienteNombre: 'Hotel Enjoy Viña del Mar', descripcion: 'Bases cama matrimonial tono nogal x8', estado: 'Prioritaria', plazo: new Date('2026-04-27') },
    { tipo: 'Espumas', clienteNombre: 'Municipalidad Viña del Mar', descripcion: 'Espumas tapizado sillas oficina x120', estado: 'En proceso', plazo: new Date('2026-04-25') },
    { tipo: 'Confecciones', clienteNombre: 'Dir. Salud Reg. Metropolitana', descripcion: 'Espumas anti-escaras hospitales x180', estado: 'Prioritaria', plazo: new Date('2026-04-26') },
  ]
  const odtCount = await prisma.odt.count()
  if (odtCount === 0) {
    await prisma.odt.createMany({ data: ODTS_SEED })
  }

  console.log('Seed OK')
}

main().catch(console.error).finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Ejecutar seed**

```bash
cd backend && npm run db:seed
```
Expected: `Seed OK`

- [ ] **Step 3: Commit**

```bash
cd backend && git add prisma/schema.prisma prisma/seed.js src/middleware/rbac.js && git commit -m "feat: schema fase2 - campos faltantes, PrecioHistorial, seed datos reales"
```

---

## Chunk 2: Módulo Productos — Backend + Frontend

### Task 5: Crear rutas backend /api/productos

**Files:**
- Create: `backend/src/routes/productos/index.js`
- Create: `backend/src/routes/productos/list.js`
- Create: `backend/src/routes/productos/get.js`
- Create: `backend/src/routes/productos/create.js`
- Create: `backend/src/routes/productos/update.js`
- Create: `backend/src/routes/productos/delete.js`
- Create: `backend/src/routes/productos/historial.js`

- [ ] **Step 1: Escribir test failing para GET /api/productos**

Crear `backend/test/productos.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/productos', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
  })

  afterAll(() => app.close())

  it('returns list with estado computed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]).toHaveProperty('estado')
    expect(['Normal', 'Crítico', 'Sin stock']).toContain(body[0].estado)
  })

  it('rejects unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/productos' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects forbidden role', async () => {
    const cajaToken = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${cajaToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/productos', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app, 'bodeguero')
  })

  afterAll(() => app.close())

  it('creates producto and returns it with estado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno: 'TEST-001',
        nombre: 'Producto Test Plan',
        bodega: 'Inventario',
        stock: 5,
        stockCritico: 10,
        precioLista: 9900,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.codigoInterno).toBe('TEST-001')
    expect(body.estado).toBe('Crítico')
  })
})

describe('GET /api/productos/:id', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
  })

  afterAll(() => app.close())

  it('returns producto by id', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
    })
    const productos = JSON.parse(listRes.body)
    const id = productos[0].id
    const res = await app.inject({
      method: 'GET',
      url: `/api/productos/${id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).id).toBe(id)
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/productos/999999',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/productos/:id/historial-precios', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
  })

  afterAll(() => app.close())

  it('returns historial array', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
    })
    const productos = JSON.parse(listRes.body)
    const id = productos[0].id
    const res = await app.inject({
      method: 'GET',
      url: `/api/productos/${id}/historial-precios`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(JSON.parse(res.body))).toBe(true)
  })
})
```

- [ ] **Step 2: Correr test — debe fallar (rutas no existen)**

```bash
cd backend && npm test -- productos
```
Expected: FAIL con `Route not found` o similar

- [ ] **Step 3: Crear helper de estado**

Crear `backend/src/routes/productos/helpers.js`:

```js
export function computeEstado(p) {
  if (p.stock === 0) return 'Sin stock'
  if (p.stock < p.stockCritico) return 'Crítico'
  return 'Normal'
}
```

- [ ] **Step 4: Crear list.js**

```js
import { z } from 'zod'
import { computeEstado } from './helpers.js'

export default async function listProductos(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const { bodega, search } = request.query
    const where = { activo: true }
    if (bodega) where.bodega = bodega
    if (search) where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { codigoInterno: { contains: search, mode: 'insensitive' } },
    ]
    const productos = await fastify.prisma.producto.findMany({
      where,
      orderBy: { codigoInterno: 'asc' },
    })
    return productos.map(p => ({ ...p, estado: computeEstado(p) }))
  })
}
```

- [ ] **Step 5: Crear get.js**

```js
import { computeEstado } from './helpers.js'

export default async function getProducto(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const p = await fastify.prisma.producto.findUnique({ where: { id } })
    if (!p) return reply.code(404).send({ error: 'Producto no encontrado' })
    return { ...p, estado: computeEstado(p) }
  })
}
```

- [ ] **Step 6: Crear create.js**

```js
import { z } from 'zod'
import { computeEstado } from './helpers.js'

const Schema = z.object({
  codigoInterno: z.string().min(1),
  nombre: z.string().min(1),
  categoria: z.string().optional(),
  proveedor: z.string().optional(),
  bodega: z.enum(['Inventario', 'Taller']).default('Inventario'),
  stock: z.number().int().min(0).default(0),
  stockCritico: z.number().int().min(0).default(0),
  precioLista: z.number().min(0).default(0),
  precioMarco: z.number().min(0).default(0),
  ubicacion: z.string().optional(),
})

export default async function createProducto(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const p = await fastify.prisma.producto.create({ data: parsed.data })
    return reply.code(201).send({ ...p, estado: computeEstado(p) })
  })
}
```

- [ ] **Step 7: Crear update.js**

```js
import { z } from 'zod'
import { computeEstado } from './helpers.js'

const Schema = z.object({
  nombre: z.string().min(1).optional(),
  categoria: z.string().optional(),
  proveedor: z.string().optional(),
  bodega: z.enum(['Inventario', 'Taller']).optional(),
  stock: z.number().int().min(0).optional(),
  stockCritico: z.number().int().min(0).optional(),
  precioLista: z.number().min(0).optional(),
  precioMarco: z.number().min(0).optional(),
  ubicacion: z.string().optional(),
  activo: z.boolean().optional(),
})

export default async function updateProducto(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const existing = await fastify.prisma.producto.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Producto no encontrado' })
    const p = await fastify.prisma.producto.update({ where: { id }, data: parsed.data })
    return { ...p, estado: computeEstado(p) }
  })
}
```

- [ ] **Step 8: Crear delete.js**

```js
export default async function deleteProducto(fastify) {
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const existing = await fastify.prisma.producto.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Producto no encontrado' })
    await fastify.prisma.producto.update({ where: { id }, data: { activo: false } })
    return reply.code(204).send()
  })
}
```

- [ ] **Step 9: Crear historial.js**

```js
import { z } from 'zod'

const AddSchema = z.object({
  precioAnterior: z.number().min(0),
  precioNuevo: z.number().min(0),
  usuarioNombre: z.string().min(1),
})

export default async function historialProducto(fastify) {
  fastify.get('/:id/historial-precios', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const productoId = Number(request.params.id)
    return fastify.prisma.precioHistorial.findMany({
      where: { productoId },
      orderBy: { createdAt: 'desc' },
    })
  })

  fastify.post('/:id/historial-precios', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const productoId = Number(request.params.id)
    const parsed = AddSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const { precioAnterior, precioNuevo, usuarioNombre } = parsed.data
    const pct = Number((precioAnterior === 0 ? 100 : ((precioNuevo - precioAnterior) / precioAnterior) * 100).toFixed(1))
    const entry = await fastify.prisma.precioHistorial.create({
      data: { productoId, precioAnterior, precioNuevo, pct, usuarioNombre },
    })
    return reply.code(201).send(entry)
  })
}
```

- [ ] **Step 10: Crear index.js**

```js
import listRoute from './list.js'
import createRoute from './create.js'
import getRoute from './get.js'
import updateRoute from './update.js'
import deleteRoute from './delete.js'
import historialRoute from './historial.js'

export default async function productosRoutes(fastify) {
  fastify.register(listRoute)
  fastify.register(createRoute)
  fastify.register(getRoute)
  fastify.register(updateRoute)
  fastify.register(deleteRoute)
  fastify.register(historialRoute)
}
```

### Task 6: Registrar productos routes en app.js + correr tests

**Files:**
- Modify: `backend/src/app.js`

- [ ] **Step 1: Agregar import y register en app.js**

```js
import productosRoutes from './routes/productos/index.js'
// ... después de authRoutes:
app.register(productosRoutes, { prefix: '/api/productos' })
```

- [ ] **Step 2: Correr tests — deben pasar**

```bash
cd backend && npm test -- productos
```
Expected: todos los tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/productos/ backend/src/app.js backend/test/productos.test.js && git commit -m "feat: api /api/productos CRUD + historial-precios"
```

### Task 7: Crear hook frontend src/api/productos.js

**Files:**
- Create: `frontend/src/api/productos.js`

- [ ] **Step 1: Crear el archivo de hooks**

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useProductos = (params = {}) =>
  useQuery({
    queryKey: ['productos', params],
    queryFn: () => api.get('/productos', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useProducto = (id) =>
  useQuery({
    queryKey: ['productos', id],
    queryFn: () => api.get(`/productos/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateProducto = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/productos', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  })
}

export const useUpdateProducto = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/productos/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  })
}

export const useDeleteProducto = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/productos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  })
}

export const useHistorialPrecios = (productoId) =>
  useQuery({
    queryKey: ['historial-precios', productoId],
    queryFn: () => api.get(`/productos/${productoId}/historial-precios`).then(r => r.data),
    enabled: !!productoId,
  })

export const useAddPrecio = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, data }) =>
      api.post(`/productos/${productoId}/historial-precios`, data).then(r => r.data),
    onSuccess: (_, { productoId }) =>
      qc.invalidateQueries({ queryKey: ['historial-precios', productoId] }),
  })
}
```

### Task 8: Actualizar BodegaPage y BodegaFormPage

**Files:**
- Modify: `frontend/src/pages/bodega/BodegaPage.jsx`
- Modify: `frontend/src/pages/bodega/BodegaFormPage.jsx`

- [ ] **Step 1: Actualizar BodegaPage**

Reemplazar el import de datos mock:
```js
// Eliminar:
import { PRODUCTOS } from '../../data/productos'
import { getHistorial } from '../../data/precioHistorial'

// Agregar:
import { useProductos, useHistorialPrecios } from '../../api/productos'
```

Dentro del componente, reemplazar datos mock con hook:
```js
const { data: productos = [], isLoading } = useProductos()
```

Actualizar referencias de campos (find/replace en el archivo):
- `p.cod` → `p.codigoInterno`
- `p.cat` → `p.categoria`
- `p.minimo` → `p.stockCritico`
- `p.precio` → `p.precioLista`
- `row.cod` → `row.codigoInterno`
- `row.minimo` → `row.stockCritico`
- `PRODUCTOS.` → `productos.`
- `getHistorial(row.cod)` → eliminar (historial se carga en FormPage)

Para el `KpiCard` de "Valor Inventario", calcular dinámico:
```js
const valorInventario = productos.reduce((sum, p) => sum + p.precioLista * p.stock, 0)
// En KpiCard: value={`$${(valorInventario/1_000_000).toFixed(1)}M`}
```

Agregar loading state antes del return:
```js
if (isLoading) return <main style={{ padding: 24 }}><p>Cargando...</p></main>
```

- [ ] **Step 2: Actualizar BodegaFormPage**

Reemplazar imports:
```js
// Eliminar:
import { PRODUCTOS } from '../../data/productos'
import { addCambio, getHistorial } from '../../data/precioHistorial'

// Agregar:
import { useProducto, useUpdateProducto, useCreateProducto, useHistorialPrecios, useAddPrecio } from '../../api/productos'
```

Reemplazar lógica mock con hooks:
```js
const { cod } = useParams()
const isEdit = !!cod
const { data: found } = useProducto(isEdit ? cod : null)  // nota: buscar por codigoInterno

// Para crear/actualizar:
const createProducto = useCreateProducto()
const updateProducto = useUpdateProducto()
const { data: historial = [] } = useHistorialPrecios(found?.id)
const addPrecio = useAddPrecio()
```

Nota: `useProducto` actualmente busca por `id` (Int). Para BodegaFormPage que usa `cod` (codigoInterno), agregar endpoint `GET /api/productos/by-code/:codigo` en el backend, o cambiar la navegación en BodegaPage para usar el `id` en lugar del `cod`. **Usar el `id`**: en BodegaPage cambiar `navigate('/bodega/' + row.codigoInterno + '/editar')` por `navigate('/bodega/' + row.id + '/editar')`.

En BodegaFormPage, `useParams()` devuelve `{ id }` (el parámetro de ruta). Actualizar router y componente:
- `router.jsx`: cambiar path `/bodega/:cod/editar` a `/bodega/:id/editar`
- BodegaFormPage: usar `useProducto(id)` donde `id` viene de params

Para el historial, reemplazar la función `PrecioHistorial` local para leer del hook en vez de localStorage:
```js
// Historial ahora viene del hook useHistorialPrecios(found?.id)
// Pasar como prop o leer en el componente con el id del producto
```

Al guardar, si el precio cambió, llamar `addPrecio.mutate`:
```js
const handleSave = () => {
  if (!validate({ nombre: { required: true } })) return
  const payload = {
    nombre: data.nombre,
    categoria: data.cat,
    bodega: data.bodega,
    stock: Number(data.stock),
    stockCritico: Number(data.minimo),
    precioLista: Number(data.precio),
  }
  if (isEdit && found && Number(data.precio) !== found.precioLista) {
    addPrecio.mutate({
      productoId: found.id,
      data: { precioAnterior: found.precioLista, precioNuevo: Number(data.precio), usuarioNombre: user?.email || 'sistema' },
    })
  }
  if (isEdit) {
    updateProducto.mutate({ id: found.id, data: payload }, { onSuccess: () => navigate('/bodega') })
  } else {
    createProducto.mutate({ ...payload, codigoInterno: data.cod }, { onSuccess: () => navigate('/bodega') })
  }
}
```

- [ ] **Step 3: Actualizar ruta en router.jsx**

En `frontend/src/router.jsx`, cambiar el path del form de bodega:
```js
// Antes:
{ path: '/bodega/:cod/editar', element: <BodegaFormPage /> }
// Después:
{ path: '/bodega/:id/editar', element: <BodegaFormPage /> }
```

- [ ] **Step 4: Verificar que la UI compila**

```bash
cd frontend && npm run build
```
Expected: sin errores de compilación

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/productos.js frontend/src/pages/bodega/ frontend/src/router.jsx && git commit -m "feat: bodega conectado a /api/productos con TanStack Query"
```

---

## Chunk 3: Módulo Clientes — Backend + Frontend

### Task 9: Crear rutas backend /api/clientes

**Files:**
- Create: `backend/src/routes/clientes/index.js`
- Create: `backend/src/routes/clientes/list.js`
- Create: `backend/src/routes/clientes/get.js`
- Create: `backend/src/routes/clientes/create.js`
- Create: `backend/src/routes/clientes/update.js`
- Create: `backend/src/routes/clientes/helpers.js`
- Create: `backend/test/clientes.test.js`

- [ ] **Step 1: Escribir test failing**

```js
// backend/test/clientes.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/clientes', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns list with saldo computed', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/clientes',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    if (body.length > 0) expect(body[0]).toHaveProperty('saldo')
  })

  it('cajero can read clientes', async () => {
    // cajero tiene clientes:['read'] en rbac.js (necesita ver clientes para cobranza)
    const t = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'GET', url: '/api/clientes',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('rrhh cannot read clientes', async () => {
    // rrhh solo tiene rrhh:['read','write'], sin acceso a clientes
    const t = await loginAs(app, 'rrhh')
    const res = await app.inject({
      method: 'GET', url: '/api/clientes',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/clientes', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'vendedor') })
  afterAll(() => app.close())

  it('creates cliente', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: { rut: 'TEST-RUT-99', nombre: 'Cliente Test', tipo: 'Empresa', ciudad: 'Testlandia' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.rut).toBe('TEST-RUT-99')
    // cleanup
    await app.prisma.cliente.delete({ where: { rut: 'TEST-RUT-99' } }).catch(() => {})
  })
})
```

- [ ] **Step 2: Run — debe fallar**

```bash
cd backend && npm test -- clientes
```

- [ ] **Step 3: Helper para calcular saldo**

El `saldo` de un cliente es la suma de `(total_orden - abono)` para ordenes cuyo `estadoPago !== 'Pagada'`. El `total` de una orden se calcula desde sus items: `SUM(items: cantidad × precioUnitario) × (1 - descuentoPct/100)`.

Crear `backend/src/routes/clientes/helpers.js`:

```js
export async function computeSaldo(prisma, clienteId) {
  const ordenes = await prisma.orden.findMany({
    where: { clienteId, estadoPago: { not: 'Pagada' } },
    include: { items: true },
  })
  return ordenes.reduce((sum, o) => {
    const total = o.items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0) * (1 - o.descuentoPct / 100)
    return sum + (total - o.abono)
  }, 0)
}
```

- [ ] **Step 4: Crear list.js**

```js
import { computeSaldo } from './helpers.js'

export default async function listClientes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const { search, tipo } = request.query
    const where = { activo: true }
    if (tipo) where.tipo = tipo
    if (search) where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { rut: { contains: search } },
      { ciudad: { contains: search, mode: 'insensitive' } },
    ]
    const clientes = await fastify.prisma.cliente.findMany({ where, orderBy: { nombre: 'asc' } })
    const withSaldo = await Promise.all(
      clientes.map(async c => ({
        ...c,
        saldo: await computeSaldo(fastify.prisma, c.id),
      }))
    )
    return withSaldo
  })
}
```

- [ ] **Step 5: Crear get.js**

```js
import { computeSaldo } from './helpers.js'

export default async function getCliente(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const c = await fastify.prisma.cliente.findUnique({ where: { id } })
    if (!c) return reply.code(404).send({ error: 'Cliente no encontrado' })
    const saldo = await computeSaldo(fastify.prisma, id)
    return { ...c, saldo }
  })
}
```

- [ ] **Step 6: Crear create.js**

```js
import { z } from 'zod'

const Schema = z.object({
  rut: z.string().min(1),
  nombre: z.string().min(1),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  ciudad: z.string().optional(),
  tipo: z.enum(['Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']).optional(),
  razonSocial: z.string().optional(),
  limiteCredito: z.number().min(0).optional(),
})

export default async function createCliente(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const c = await fastify.prisma.cliente.create({ data: parsed.data })
    return reply.code(201).send({ ...c, saldo: 0 })
  })
}
```

- [ ] **Step 7: Crear update.js**

```js
import { z } from 'zod'
import { computeSaldo } from './helpers.js'

const Schema = z.object({
  nombre: z.string().min(1).optional(),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  ciudad: z.string().optional(),
  tipo: z.enum(['Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']).optional(),
  limiteCredito: z.number().min(0).optional(),
  activo: z.boolean().optional(),
})

export default async function updateCliente(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'write')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const existing = await fastify.prisma.cliente.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Cliente no encontrado' })
    const c = await fastify.prisma.cliente.update({ where: { id }, data: parsed.data })
    const saldo = await computeSaldo(fastify.prisma, id)
    return { ...c, saldo }
  })
}
```

- [ ] **Step 8: Crear index.js**

```js
import listRoute from './list.js'
import createRoute from './create.js'
import getRoute from './get.js'
import updateRoute from './update.js'

export default async function clientesRoutes(fastify) {
  fastify.register(listRoute)
  fastify.register(createRoute)
  fastify.register(getRoute)
  fastify.register(updateRoute)
}
```

- [ ] **Step 9: Registrar en app.js**

```js
import clientesRoutes from './routes/clientes/index.js'
// después de productosRoutes:
app.register(clientesRoutes, { prefix: '/api/clientes' })
```

- [ ] **Step 10: Correr tests**

```bash
cd backend && npm test -- clientes
```
Expected: todos PASS

### Task 10: Frontend clientes — hook + páginas

**Files:**
- Create: `frontend/src/api/clientes.js`
- Modify: `frontend/src/pages/clientes/ClientesPage.jsx`
- Modify: `frontend/src/pages/clientes/ClientesFormPage.jsx`

- [ ] **Step 1: Crear src/api/clientes.js**

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useClientes = (params = {}) =>
  useQuery({
    queryKey: ['clientes', params],
    queryFn: () => api.get('/clientes', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useCliente = (id) =>
  useQuery({
    queryKey: ['clientes', id],
    queryFn: () => api.get(`/clientes/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateCliente = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/clientes', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  })
}

export const useUpdateCliente = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/clientes/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  })
}
```

- [ ] **Step 2: Actualizar ClientesPage**

Reemplazar import mock:
```js
// Eliminar: import { CLIENTES_DATA } from '../../data/clientes'
import { useClientes } from '../../api/clientes'
```

Dentro del componente:
```js
const { data: clientes = [], isLoading } = useClientes()
if (isLoading) return <main style={{ padding: 24 }}><p>Cargando...</p></main>
```

Actualizar referencias:
- `CLIENTES_DATA` → `clientes`
- `c.tel` → `c.telefono`
- `c.credito` → `c.limiteCredito`
- En el `ClientesPage`, `setSelected(row)` ya funciona porque `row` viene de los datos de la API
- Actualizar el `subtitle`: `${shown.length} de ${clientes.length} clientes`
- KPIs: `clientes.filter(...)` en lugar de `CLIENTES_DATA.filter(...)`
- KPI de "Deuda total": `clientes.reduce((s,c) => s + (c.saldo||0), 0)` formateado

- [ ] **Step 3: Actualizar ClientesFormPage**

```js
// Eliminar: import { CLIENTES_DATA } from '../../data/clientes'
import { useCliente, useCreateCliente, useUpdateCliente } from '../../api/clientes'
// useForm viene del forms module existente:
import { FormField, FormDivider, Input, Select, useForm, useSave } from '../../components/forms/index'
```

```js
const { id } = useParams()
const isEdit = !!id
const { data: found } = useCliente(isEdit ? Number(id) : null)
const navigate = useNavigate()
const createCliente = useCreateCliente()
const updateCliente = useUpdateCliente()

const { data, set, errors, validate } = useForm(found ? {
  rut: found.rut, nombre: found.nombre, tipo: found.tipo || 'Empresa',
  ciudad: found.ciudad || '', email: found.email || '',
  tel: found.telefono || '', credito: String(found.limiteCredito || 0),
} : { rut: '', nombre: '', tipo: 'Empresa', ciudad: '', email: '', tel: '', credito: '' })

const handleSave = () => {
  if (!validate({ nombre: { required: true }, rut: { required: true } })) return
  const payload = {
    nombre: data.nombre, rut: data.rut, tipo: data.tipo,
    ciudad: data.ciudad, email: data.email || undefined,
    telefono: data.tel, limiteCredito: Number(data.credito) || 0,
  }
  if (isEdit) {
    updateCliente.mutate({ id: Number(id), data: payload }, { onSuccess: () => navigate('/clientes') })
  } else {
    createCliente.mutate(payload, { onSuccess: () => navigate('/clientes') })
  }
}
```

- [ ] **Step 4: Build check**

```bash
cd frontend && npm run build
```
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/clientes/ backend/test/clientes.test.js frontend/src/api/clientes.js frontend/src/pages/clientes/ && git commit -m "feat: clientes conectado a /api/clientes con saldo calculado"
```

---

## Chunk 4: Módulo Ventas — Backend + Frontend

### Task 11: Crear rutas backend /api/ventas

**Files:**
- Create: `backend/src/routes/ventas/index.js`
- Create: `backend/src/routes/ventas/list.js`
- Create: `backend/src/routes/ventas/get.js`
- Create: `backend/src/routes/ventas/create.js`
- Create: `backend/src/routes/ventas/update.js`
- Create: `backend/test/ventas.test.js`

- [ ] **Step 1: Escribir test failing**

```js
// backend/test/ventas.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/ventas', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns list with total computed', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/ventas',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('total')
      expect(body[0]).toHaveProperty('cliente')
    }
  })

  it('cajero can read ventas', async () => {
    const t = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'GET', url: '/api/ventas',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /api/ventas', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'vendedor') })
  afterAll(() => app.close())

  it('creates venta and returns total', async () => {
    const firstCliente = await app.prisma.cliente.findFirst()
    const res = await app.inject({
      method: 'POST', url: '/api/ventas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        tipo: 'Normal',
        clienteId: firstCliente?.id,
        items: [{ productoId: 1, cantidad: 2, precioUnitario: 10000 }],
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.total).toBe(20000)
    // cleanup
    if (body.id) await app.prisma.orden.delete({ where: { id: body.id } }).catch(() => {})
  })
})
```

- [ ] **Step 2: Run — debe fallar**

```bash
cd backend && npm test -- ventas
```

- [ ] **Step 3: Crear helper computeTotal**

Crear `backend/src/routes/ventas/helpers.js`:

```js
export function computeTotal(items, descuentoPct = 0) {
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)
  return subtotal * (1 - descuentoPct / 100)
}
```

- [ ] **Step 4: Crear list.js**

```js
import { computeTotal } from './helpers.js'

export default async function listVentas(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const { estadoPago, estadoEntrega, tipo } = request.query
    const where = {}
    if (estadoPago) where.estadoPago = estadoPago
    if (estadoEntrega) where.estadoEntrega = estadoEntrega
    if (tipo) where.tipo = tipo
    const ordenes = await fastify.prisma.orden.findMany({
      where,
      include: { items: true, cliente: { select: { id: true, nombre: true, rut: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return ordenes.map(o => ({
      ...o,
      total: computeTotal(o.items, o.descuentoPct),
      items: o.items,
    }))
  })
}
```

- [ ] **Step 5: Crear get.js**

```js
import { computeTotal } from './helpers.js'

export default async function getVenta(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const o = await fastify.prisma.orden.findUnique({
      where: { id },
      include: { items: true, cliente: { select: { id: true, nombre: true, rut: true } } },
    })
    if (!o) return reply.code(404).send({ error: 'Venta no encontrada' })
    return { ...o, total: computeTotal(o.items, o.descuentoPct) }
  })
}
```

- [ ] **Step 6: Crear create.js**

```js
import { z } from 'zod'
import { computeTotal } from './helpers.js'

const ItemSchema = z.object({
  productoId: z.number().int(),
  cantidad: z.number().int().min(1),
  precioUnitario: z.number().min(0),
})

const Schema = z.object({
  tipo: z.enum(['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']).default('Normal'),
  clienteId: z.number().int().optional(),
  descuentoPct: z.number().min(0).max(100).default(0),
  abono: z.number().min(0).default(0),
  facturado: z.number().min(0).optional(),
  guias: z.number().int().optional(),
  licitacion: z.string().optional(),
  observaciones: z.string().optional(),
  creadorNombre: z.string().optional(),
  items: z.array(ItemSchema).min(1),
})

export default async function createVenta(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const { items, ...rest } = parsed.data
    const orden = await fastify.prisma.orden.create({
      data: {
        ...rest,
        userId: request.user.id,
        creadorNombre: rest.creadorNombre || request.user.nombre,
        items: { create: items },
      },
      include: { items: true, cliente: { select: { id: true, nombre: true, rut: true } } },
    })
    return reply.code(201).send({ ...orden, total: computeTotal(orden.items, orden.descuentoPct) })
  })
}
```

- [ ] **Step 7: Crear update.js**

```js
import { z } from 'zod'
import { computeTotal } from './helpers.js'

const Schema = z.object({
  tipo: z.enum(['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']).optional(),
  estado: z.string().optional(),
  estadoPago: z.string().optional(),
  estadoEntrega: z.string().optional(),
  abono: z.number().min(0).optional(),
  facturado: z.number().min(0).optional(),
  guias: z.number().int().optional(),
  licitacion: z.string().optional(),
  observaciones: z.string().optional(),
  descuentoPct: z.number().min(0).max(100).optional(),
})

export default async function updateVenta(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const existing = await fastify.prisma.orden.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Venta no encontrada' })
    const orden = await fastify.prisma.orden.update({
      where: { id },
      data: parsed.data,
      include: { items: true, cliente: { select: { id: true, nombre: true, rut: true } } },
    })
    return { ...orden, total: computeTotal(orden.items, orden.descuentoPct) }
  })
}
```

- [ ] **Step 8: Crear index.js**

```js
import listRoute from './list.js'
import createRoute from './create.js'
import getRoute from './get.js'
import updateRoute from './update.js'

export default async function ventasRoutes(fastify) {
  fastify.register(listRoute)
  fastify.register(createRoute)
  fastify.register(getRoute)
  fastify.register(updateRoute)
}
```

- [ ] **Step 9: Registrar en app.js**

```js
import ventasRoutes from './routes/ventas/index.js'
app.register(ventasRoutes, { prefix: '/api/ventas' })
```

- [ ] **Step 10: Correr tests**

```bash
cd backend && npm test -- ventas
```
Expected: todos PASS

### Task 12: Frontend ventas — hook + páginas

**Files:**
- Create: `frontend/src/api/ventas.js`
- Modify: `frontend/src/pages/ventas/VentasPage.jsx`
- Modify: `frontend/src/pages/ventas/VentasFormPage.jsx`
- Modify: `frontend/src/components/forms/ViewVentaPanel.jsx`

- [ ] **Step 1: Crear src/api/ventas.js**

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useVentas = (params = {}) =>
  useQuery({
    queryKey: ['ventas', params],
    queryFn: () => api.get('/ventas', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useVenta = (id) =>
  useQuery({
    queryKey: ['ventas', id],
    queryFn: () => api.get(`/ventas/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/ventas', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas'] }),
  })
}

export const useUpdateVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/ventas/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas'] }),
  })
}
```

- [ ] **Step 2: Actualizar VentasPage**

Reemplazar import mock:
```js
// Eliminar: import { VENTAS_DATA } from '../../data/ventas'
import { useVentas } from '../../api/ventas'
```

Dentro del componente:
```js
const { data: ventas = [], isLoading } = useVentas()
if (isLoading) return <main style={{ padding: 24 }}><p>Cargando...</p></main>
```

Actualizar referencias (los datos de la API usan nombres del schema DB):
- `VENTAS_DATA` → `ventas`
- `v.pago` → `v.estadoPago`
- `v.entrega` → `v.estadoEntrega`
- `v.creador` → `v.creadorNombre`
- En los filtros de tabs:
  - `v.pago === 'No pagada'` → `v.estadoPago === 'No pagada'`
  - `v.entrega === 'Pendiente entrega'` → `v.estadoEntrega === 'Pendiente entrega'`
  - `v.entrega === 'Entregada'` → `v.estadoEntrega === 'Entregada'`
- `v.fecha` → `new Date(v.createdAt).toLocaleDateString('es-CL')` 
- `v.cliente` → `v.cliente?.nombre` (el API retorna cliente como objeto)
- En la búsqueda: `v.rut.includes(search)` → `(v.cliente?.rut || '').includes(search)`

En las columnas de la tabla, actualizar `cols`:
- `key: 'cliente'` con `render: (v, row) => <span>{row.cliente?.nombre}</span>`
- `key: 'pago'` → `key: 'estadoPago'`
- `key: 'entrega'` → `key: 'estadoEntrega'`
- `key: 'creador'` → `key: 'creadorNombre'`
- `key: 'fecha'` → `render: (v, row) => new Date(row.createdAt).toLocaleDateString('es-CL')`

Los KPIs (140, 45, etc.) reemplazar con valores calculados de los datos:
```js
const noPagedas = ventas.filter(v => v.estadoPago === 'No pagada').length
const pendEntrega = ventas.filter(v => v.estadoEntrega === 'Pendiente entrega').length
const totalMes = ventas.reduce((s, v) => s + (v.total || 0), 0)
const licitaciones = ventas.filter(v => v.tipo === 'Licitación').length
```

- [ ] **Step 3: Actualizar ViewVentaPanel**

Actualizar campos a los nombres de la API:
- `venta.creador` → `venta.creadorNombre`
- `venta.pago` → `venta.estadoPago`
- `venta.entrega` → `venta.estadoEntrega`
- `venta.cliente` → `venta.cliente?.nombre`
- `venta.rut` → `venta.cliente?.rut`
- `venta.fecha` → `new Date(venta.createdAt).toLocaleDateString('es-CL')`

- [ ] **Step 4: Actualizar VentasFormPage**

```js
// Eliminar: import { VENTAS_DATA } from '../../data/ventas'
import { useVenta, useCreateVenta, useUpdateVenta } from '../../api/ventas'
import { useClientes } from '../../api/clientes'
```

```js
const { id } = useParams()
const isEdit = !!id
const { data: found } = useVenta(isEdit ? Number(id) : null)
const { data: clientesList = [] } = useClientes()
const createVenta = useCreateVenta()
const updateVenta = useUpdateVenta()
```

Reemplazar `CLIENTES_LIST` hardcodeado con los clientes del API:
```js
const clientesOptions = clientesList.map(c => ({ value: c.id, label: c.nombre }))
```

El select de clientes usa `clienteId` (Int) en vez de nombre de cliente string.

El `handleSave`:
```js
const handleSave = () => {
  if (!validate({ clienteId: { required: true } })) return
  const payload = {
    tipo: data.tipo,
    clienteId: Number(data.clienteId),
    estadoPago: data.pago,
    estadoEntrega: data.entrega,
    abono: Number(data.abono) || 0,
    licitacion: data.licitacion || undefined,
    observaciones: data.observaciones || undefined,
    // FASE 2: item placeholder — selección real de productos va en Fase 3
    items: isEdit ? undefined : [{ productoId: 1, cantidad: 1, precioUnitario: Number(data.total) || 0 }],
  }
  if (isEdit) {
    updateVenta.mutate({ id: Number(id), data: payload }, { onSuccess: () => navigate('/ventas') })
  } else {
    createVenta.mutate(payload, { onSuccess: () => navigate('/ventas') })
  }
}
```

- [ ] **Step 5: Build check + commit**

```bash
cd frontend && npm run build
git add backend/src/routes/ventas/ backend/test/ventas.test.js frontend/src/api/ventas.js frontend/src/pages/ventas/ frontend/src/components/forms/ViewVentaPanel.jsx && git commit -m "feat: ventas conectado a /api/ventas con total calculado"
```

---

## Chunk 5: Módulo Taller/ODTs — Backend + Frontend

### Task 13: Crear rutas backend /api/odts

**Files:**
- Create: `backend/src/routes/odts/index.js`
- Create: `backend/src/routes/odts/list.js`
- Create: `backend/src/routes/odts/get.js`
- Create: `backend/src/routes/odts/create.js`
- Create: `backend/src/routes/odts/update.js`
- Create: `backend/test/odts.test.js`

- [ ] **Step 1: Escribir test failing**

```js
// backend/test/odts.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/odts', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'taller') })
  afterAll(() => app.close())

  it('returns list of odts', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/odts',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(JSON.parse(res.body))).toBe(true)
  })

  it('cajero cannot read odts', async () => {
    const t = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'GET', url: '/api/odts',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/odts', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'taller') })
  afterAll(() => app.close())

  it('creates odt', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/odts',
      headers: { authorization: `Bearer ${token}` },
      payload: { tipo: 'Espumas', clienteNombre: 'Test Cliente', descripcion: 'Prueba', estado: 'Pendiente' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.tipo).toBe('Espumas')
    if (body.id) await app.prisma.odt.delete({ where: { id: body.id } }).catch(() => {})
  })
})
```

- [ ] **Step 2: Run — debe fallar**

```bash
cd backend && npm test -- odts
```

- [ ] **Step 3: Crear list.js**

```js
export default async function listOdts(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const { tipo, estado } = request.query
    const where = {}
    if (tipo) where.tipo = tipo
    if (estado) where.estado = estado
    return fastify.prisma.odt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
  })
}
```

- [ ] **Step 4: Crear get.js**

```js
export default async function getOdt(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const o = await fastify.prisma.odt.findUnique({ where: { id }, include: { items: true } })
    if (!o) return reply.code(404).send({ error: 'ODT no encontrada' })
    return o
  })
}
```

- [ ] **Step 5: Crear create.js**

```js
import { z } from 'zod'

const Schema = z.object({
  tipo: z.enum(['Espumas', 'Confecciones', 'Madera']).optional(),
  clienteNombre: z.string().optional(),
  descripcion: z.string().optional(),
  plazo: z.string().datetime({ offset: true }).optional(),
  estado: z.enum(['Pendiente', 'En proceso', 'Prioritaria', 'Terminada']).default('Pendiente'),
  prioridad: z.string().default('normal'),
  vendedorId: z.number().int().optional(),
  operarioId: z.number().int().optional(),
  ordenId: z.number().int().optional(),
})

export default async function createOdt(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const data = { ...parsed.data }
    if (data.plazo) data.plazo = new Date(data.plazo)
    const o = await fastify.prisma.odt.create({ data })
    return reply.code(201).send(o)
  })
}
```

- [ ] **Step 6: Crear update.js**

```js
import { z } from 'zod'

const Schema = z.object({
  tipo: z.enum(['Espumas', 'Confecciones', 'Madera']).optional(),
  clienteNombre: z.string().optional(),
  descripcion: z.string().optional(),
  plazo: z.string().datetime({ offset: true }).optional(),
  estado: z.enum(['Pendiente', 'En proceso', 'Prioritaria', 'Terminada']).optional(),
  prioridad: z.string().optional(),
  vendedorId: z.number().int().optional(),
  operarioId: z.number().int().optional(),
})

export default async function updateOdt(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const existing = await fastify.prisma.odt.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'ODT no encontrada' })
    const data = { ...parsed.data }
    if (data.plazo) data.plazo = new Date(data.plazo)
    return fastify.prisma.odt.update({ where: { id }, data })
  })
}
```

- [ ] **Step 7: Crear index.js**

```js
import listRoute from './list.js'
import createRoute from './create.js'
import getRoute from './get.js'
import updateRoute from './update.js'

export default async function odtsRoutes(fastify) {
  fastify.register(listRoute)
  fastify.register(createRoute)
  fastify.register(getRoute)
  fastify.register(updateRoute)
}
```

- [ ] **Step 8: Registrar en app.js**

```js
import odtsRoutes from './routes/odts/index.js'
app.register(odtsRoutes, { prefix: '/api/odts' })
```

- [ ] **Step 9: Correr tests**

```bash
cd backend && npm test -- odts
```
Expected: todos PASS

### Task 14: Frontend ODTs — hook + páginas

**Files:**
- Create: `frontend/src/api/odts.js`
- Modify: `frontend/src/pages/taller/TallerPage.jsx`
- Modify: `frontend/src/pages/taller/TallerFormPage.jsx`

- [ ] **Step 1: Crear src/api/odts.js**

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useOdts = (params = {}) =>
  useQuery({
    queryKey: ['odts', params],
    queryFn: () => api.get('/odts', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useOdt = (id) =>
  useQuery({
    queryKey: ['odts', id],
    queryFn: () => api.get(`/odts/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateOdt = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/odts', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['odts'] }),
  })
}

export const useUpdateOdt = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/odts/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['odts'] }),
  })
}
```

- [ ] **Step 2: Actualizar TallerPage**

```js
// Eliminar: import { ODTS } from '../../data/odts'
import { useOdts } from '../../api/odts'
```

```js
const { data: odts = [], isLoading } = useOdts()
if (isLoading) return <main style={{ padding: 24 }}><p>Cargando...</p></main>
```

Actualizar referencias de campos:
- `odt.cliente` → `odt.clienteNombre`
- `odt.creada` → `new Date(odt.createdAt).toLocaleDateString('es-CL')`
- `odt.plazo` → `odt.plazo ? new Date(odt.plazo).toLocaleDateString('es-CL') : '—'`
- En los tabs de tipo: `ODTS.filter(o => o.tipo === 'Espumas').length` → `odts.filter(o => o.tipo === 'Espumas').length`
- KPIs: reemplazar con `odts.filter(...)` dinámico
- El `OdtCard` usa `odt.cliente` — cambiarlo a `odt.clienteNombre`
- El `OdtModal` usa `odt.cliente`, `odt.creada` — actualizarlos igual

- [ ] **Step 3: Actualizar TallerFormPage**

```js
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm, useSave } from '../../components/forms/index'
import { useOdt, useCreateOdt, useUpdateOdt } from '../../api/odts'

export default function TallerFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const { data: found } = useOdt(isEdit ? Number(id) : null)
  const createOdt = useCreateOdt()
  const updateOdt = useUpdateOdt()

  const { data, set, errors, validate } = useForm(found ? {
    tipo: found.tipo || 'Espumas',
    clienteNombre: found.clienteNombre || '',
    descripcion: found.descripcion || '',
    estado: found.estado || 'Pendiente',
    plazo: found.plazo ? new Date(found.plazo).toISOString().slice(0, 10) : '',
  } : {
    tipo: 'Espumas', clienteNombre: '', descripcion: '', estado: 'Pendiente', plazo: '',
  })

  const handleSave = () => {
    if (!validate({ descripcion: { required: true } })) return
    const payload = {
      tipo: data.tipo,
      clienteNombre: data.clienteNombre,
      descripcion: data.descripcion,
      estado: data.estado,
      plazo: data.plazo ? new Date(data.plazo).toISOString() : undefined,
    }
    if (isEdit) {
      updateOdt.mutate({ id: Number(id), data: payload }, { onSuccess: () => navigate('/taller') })
    } else {
      createOdt.mutate(payload, { onSuccess: () => navigate('/taller') })
    }
  }

  return (
    <FormPage
      title={isEdit ? 'Editar ODT' : 'Nueva ODT'}
      subtitle={isEdit ? `Editando ODT #${id}` : 'Crear orden de trabajo'}
      breadcrumb={['Inicio', 'Taller', isEdit ? 'Editar ODT' : 'Nueva ODT']}
      onSave={handleSave}
      saving={createOdt.isPending || updateOdt.isPending}
    >
      <FormDivider label="Trabajo" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Tipo de Trabajo">
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Espumas', 'Confecciones', 'Madera']} />
        </FormField>
        <FormField label="Estado">
          <Select value={data.estado} onChange={v => set('estado', v)} options={['Pendiente', 'En proceso', 'Prioritaria', 'Terminada']} />
        </FormField>
      </div>
      <FormField label="Cliente">
        <Input value={data.clienteNombre} onChange={v => set('clienteNombre', v)} placeholder="Nombre del cliente" />
      </FormField>
      <FormField label="Descripción" required error={errors.descripcion}>
        <Textarea value={data.descripcion} onChange={v => set('descripcion', v)} placeholder="Detalle del trabajo" rows={3} error={errors.descripcion} />
      </FormField>
      <FormField label="Plazo de entrega">
        <Input type="date" value={data.plazo} onChange={v => set('plazo', v)} />
      </FormField>
    </FormPage>
  )
}
```

- [ ] **Step 4: Build check + commit**

```bash
cd frontend && npm run build
git add backend/src/routes/odts/ backend/test/odts.test.js frontend/src/api/odts.js frontend/src/pages/taller/ && git commit -m "feat: taller conectado a /api/odts"
```

---

## Chunk 6: Módulo Caja — Backend + Frontend

### Task 15: Crear rutas backend /api/caja

**Files:**
- Create: `backend/src/routes/caja/index.js`
- Create: `backend/src/routes/caja/turno.js`
- Create: `backend/src/routes/caja/movimientos.js`
- Create: `backend/test/caja.test.js`

- [ ] **Step 1: Escribir test failing**

```js
// backend/test/caja.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/caja/turno', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('returns null or active turno', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/caja/turno',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body === null || body.estado === 'abierto').toBe(true)
  })

  it('rrhh cannot access caja', async () => {
    const t = await loginAs(app, 'rrhh')
    const res = await app.inject({
      method: 'GET', url: '/api/caja/turno',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/caja/turno (abrir)', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('opens a turno', async () => {
    // Ensure no open turno exists first
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })

    const res = await app.inject({
      method: 'POST', url: '/api/caja/turno',
      headers: { authorization: `Bearer ${token}` },
      payload: { cajaId: 1 },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.estado).toBe('abierto')
    // cleanup
    await app.prisma.turno.update({ where: { id: body.id }, data: { estado: 'cerrado' } }).catch(() => {})
  })
})
```

- [ ] **Step 2: Run — debe fallar**

```bash
cd backend && npm test -- caja
```

- [ ] **Step 3: Crear turno.js**

```js
import { z } from 'zod'

const AbrirSchema = z.object({
  cajaId: z.number().int().default(1),
})

export default async function turnoRoutes(fastify) {
  // GET activo
  fastify.get('/turno', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request, reply) => {
    const turno = await fastify.prisma.turno.findFirst({
      where: { estado: 'abierto' },
      include: { movimientos: { orderBy: { createdAt: 'desc' } }, caja: true },
      orderBy: { apertura: 'desc' },
    })
    return turno ?? null
  })

  // POST abrir
  fastify.post('/turno', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const parsed = AbrirSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const open = await fastify.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (open) return reply.code(409).send({ error: 'Ya hay un turno abierto' })
    const turno = await fastify.prisma.turno.create({
      data: { cajaId: parsed.data.cajaId, userId: request.user.id, estado: 'abierto' },
      include: { movimientos: true, caja: true },
    })
    return reply.code(201).send(turno)
  })

  // POST cerrar
  fastify.post('/turno/:id/cerrar', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const turno = await fastify.prisma.turno.findUnique({ where: { id } })
    if (!turno) return reply.code(404).send({ error: 'Turno no encontrado' })
    if (turno.estado !== 'abierto') return reply.code(400).send({ error: 'El turno ya está cerrado' })
    return fastify.prisma.turno.update({
      where: { id },
      data: { estado: 'cerrado', cierre: new Date() },
      include: { movimientos: true, caja: true },
    })
  })
}
```

- [ ] **Step 4: Crear movimientos.js**

```js
import { z } from 'zod'

// concepto no está en el modelo MovimientoCaja — usar tipo+medioPago para identificar el movimiento
const Schema = z.object({
  tipo: z.enum(['Ingreso', 'Egreso']),
  monto: z.number(),
  medioPago: z.enum(['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Cheque']),
})

export default async function movimientosRoutes(fastify) {
  fastify.post('/turno/:id/movimientos', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const turnoId = Number(request.params.id)
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const turno = await fastify.prisma.turno.findUnique({ where: { id: turnoId } })
    if (!turno) return reply.code(404).send({ error: 'Turno no encontrado' })
    if (turno.estado !== 'abierto') return reply.code(400).send({ error: 'Turno cerrado' })
    const mov = await fastify.prisma.movimientoCaja.create({
      data: {
        turnoId,
        tipo: parsed.data.tipo,
        monto: parsed.data.tipo === 'Egreso' ? -Math.abs(parsed.data.monto) : Math.abs(parsed.data.monto),
        medioPago: parsed.data.medioPago,
      },
    })
    return reply.code(201).send(mov)
  })
}
```

- [ ] **Step 5: Crear index.js**

```js
import turnoRoutes from './turno.js'
import movimientosRoutes from './movimientos.js'

export default async function cajaRoutes(fastify) {
  fastify.register(turnoRoutes)
  fastify.register(movimientosRoutes)
}
```

- [ ] **Step 6: Registrar en app.js**

```js
import cajaRoutes from './routes/caja/index.js'
app.register(cajaRoutes, { prefix: '/api/caja' })
```

- [ ] **Step 7: Correr todos los tests**

```bash
cd backend && npm test
```
Expected: todos los tests de todos los módulos pasan

### Task 16: Frontend caja — hook + página

**Files:**
- Create: `frontend/src/api/caja.js`
- Modify: `frontend/src/pages/caja/CajaPage.jsx`
- Modify: `frontend/src/pages/caja/CajaFormPage.jsx`

- [ ] **Step 1: Crear src/api/caja.js**

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useTurnoActivo = () =>
  useQuery({
    queryKey: ['caja', 'turno-activo'],
    queryFn: () => api.get('/caja/turno').then(r => r.data),
    staleTime: 10_000,
  })

export const useAbrirTurno = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/caja/turno', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useCerrarTurno = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/caja/turno/${id}/cerrar`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useCreateMovimiento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ turnoId, data }) =>
      api.post(`/caja/turno/${turnoId}/movimientos`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}
```

- [ ] **Step 2: Actualizar CajaPage**

Reemplazar mock inline con hook:
```js
// Eliminar: const MOVIMIENTOS = [...]
import { useTurnoActivo, useAbrirTurno, useCerrarTurno } from '../../api/caja'
```

```js
const { data: turno, isLoading } = useTurnoActivo()
const abrirTurno = useAbrirTurno()
const cerrarTurno = useCerrarTurno()

const movimientos = turno?.movimientos ?? []
const ingresos = movimientos.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + m.monto, 0)
const egresos = Math.abs(movimientos.filter(m => m.tipo === 'Egreso').reduce((a, m) => a + m.monto, 0))
const saldo = ingresos - egresos
```

Actualizar referencias en columnas de tabla:
- `m.hora` → `new Date(m.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })`
- `m.forma` → `m.medioPago`
- Eliminar la columna `concepto` de la tabla (no existe en DB). Reemplazar con `key: 'tipo'` label `'Tipo'` que ya existe.

Agregar botón "Abrir Turno" cuando no hay turno activo:
```jsx
{!turno && !isLoading && (
  <Btn variant="primary" onClick={() => abrirTurno.mutate({ cajaId: 1 })}>
    Abrir Turno
  </Btn>
)}
{turno && (
  <Btn variant="secondary" onClick={() => cerrarTurno.mutate(turno.id)}>
    Cerrar Turno
  </Btn>
)}
```

- [ ] **Step 3: Actualizar CajaFormPage (agregar movimiento)**

```js
import { useNavigate } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, useForm } from '../../components/forms/index'
import { useTurnoActivo, useCreateMovimiento } from '../../api/caja'

export default function CajaFormPage() {
  const navigate = useNavigate()
  const { data: turno } = useTurnoActivo()
  const createMovimiento = useCreateMovimiento()

  const { data, set, errors, validate } = useForm({
    tipo: 'Ingreso', monto: '', medioPago: 'Efectivo',
  })

  const handleSave = () => {
    if (!validate({ monto: { required: true } })) return
    if (!turno) return alert('No hay turno abierto')
    createMovimiento.mutate(
      { turnoId: turno.id, data: { tipo: data.tipo, monto: Number(data.monto), medioPago: data.medioPago } },
      { onSuccess: () => navigate('/caja') }
    )
  }

  return (
    <FormPage
      title="Nuevo Movimiento"
      subtitle="Registrar ingreso o egreso"
      breadcrumb={['Inicio', 'Caja', 'Nuevo Movimiento']}
      onSave={handleSave}
      saving={createMovimiento.isPending}
    >
      <FormDivider label="Movimiento" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Tipo">
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Ingreso', 'Egreso']} />
        </FormField>
        <FormField label="Forma de Pago">
          <Select value={data.medioPago} onChange={v => set('medioPago', v)} options={['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Cheque']} />
        </FormField>
      </div>
      <FormField label="Monto" required error={errors.monto}>
        <Input value={data.monto} onChange={v => set('monto', v)} type="number" prefix="$" placeholder="0" error={errors.monto} />
      </FormField>
    </FormPage>
  )
}
```

- [ ] **Step 4: Build check final**

```bash
cd frontend && npm run build
```
Expected: sin errores

- [ ] **Step 5: Correr todos los tests backend**

```bash
cd backend && npm test
```
Expected: todos los suites pasan

- [ ] **Step 6: Commit final**

```bash
git add backend/src/routes/caja/ backend/test/caja.test.js frontend/src/api/caja.js frontend/src/pages/caja/ && git commit -m "feat: caja conectado a /api/caja - turno, movimientos"
```

- [ ] **Step 7: Push a main**

```bash
git push origin main
```
Expected: CI/CD se dispara, deploy a VPS exitoso.

---

## Notas para el implementador

**Campo `concepto` en MovimientoCaja:** No existe en el schema. La columna fue eliminada del plan — la tabla muestra `tipo` y `medioPago` como identificadores del movimiento. Si en el futuro se necesita concepto libre, agregar migración `concepto String?` al model.

**Router frontend:** Los paths `/bodega/:cod/editar` deben cambiarse a `/bodega/:id/editar` en `frontend/src/router.jsx` al implementar el Task 8.

**Errores de compilación esperados:** Al cambiar BodegaPage de mock a hook, referencias como `PRODUCTOS.length` en JSX causarán errores si no se actualiza a `productos.length`. Revisar todos los usos en cada página antes del build check.

**Tests requieren DB con seed:** Correr `npm run db:seed` antes de ejecutar tests si la DB está vacía.

**Orden de implementación:** Chunk 1 → Chunk 2 → Chunk 3 → Chunk 4 → Chunk 5 → Chunk 6. Cada chunk deja el módulo 100% conectado antes de avanzar.
