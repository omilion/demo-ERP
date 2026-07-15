# Orden de Transporte + Rename visible "ODT" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la Orden de Transporte real (concepto legacy nunca portado: n°,
fecha, transportista, ligada a la venta) y eliminar toda confusión visible entre "ODT"
(que el negocio usa para Orden de Transporte) y el módulo de taller/producción actual
(que el código llama `Odt` mal nombrado, pero eso no se toca — ver Global Constraints).

**Architecture:** Pieza 1 es CRUD nuevo end-to-end (modelo Prisma + rutas Fastify +
hooks TanStack Query + modal en `ViewVentaPanel.jsx`), sigue el mismo patrón ya usado
para `useAnularVenta`/`useActivarVenta` (mutations simples, sin lógica de negocio
compleja). Pieza 2 es un barrido de texto visible, sin tocar código/esquema.

**Tech Stack:** Fastify + Prisma 7 (backend), Vite + React + TanStack Query (frontend),
Postgres.

## Global Constraints

- **No renombrar el modelo/tabla `Odt`/`OdtItem`/`OdtItemTaller` en Prisma ni en el
  código backend.** Decisión explícita del dueño del negocio: la migración de datos es
  alto riesgo, cero beneficio real (nadie fuera del código ve ese nombre). Solo se
  corrige el TEXTO que renderiza el frontend al usuario.
- **La Pieza 3 del spec original (rediseño "Pasar a Taller") ya está resuelta** — el
  backend (`backend/src/routes/pasar-taller/`) y el frontend
  (`frontend/src/pages/pasar-taller/PasarTallerPage.jsx`, ruta `/pasar-taller`) ya
  existían completos. El único bug (botón "Notificar a Taller" en `ViewVentaPanel.jsx`
  apuntaba a `/taller/nueva` en vez de `/pasar-taller?ordenId=X`) ya se corrigió y
  desplegó (commit `a33374e`, en `main`). **No generar tareas para esto.**
- Cero cambios de UX/lógica en el módulo Taller existente (`TallerFormPage.jsx`,
  `TallerPage.jsx`, `PasarTallerPage.jsx`) más allá del rename de texto de la Pieza 2 —
  no tocar su funcionalidad.
- Backend: seguir el patrón de mutations/rutas ya usado en
  `backend/src/routes/ventas/cargos.js` (`anular`/`activar`: rutas simples,
  `writeAuth`/`readAuth` con `fastify.rbac('ventas', 'write'|'read')`).
- Sin tests de componentes React nuevos — el proyecto no tiene esa convención (ya
  confirmado en specs previos). Verificación de backend: tests reales contra Postgres
  (`DATABASE_URL=...plastimar_test npx vitest run`), no mocks.
- Cada tarea termina con `npm run build` + `npm run lint` (frontend) y
  `npx vitest run` (backend si aplica) limpios antes de commit.

---

## Pieza 1: Orden de Transporte

### Task 1: Modelo Prisma + migración

**Files:**
- Modify: `backend/prisma/schema.prisma` — agregar modelo nuevo, junto al modelo
  `Orden` existente (buscar `model Orden {` para ubicarlo, el nuevo modelo va después
  del bloque de `Orden` y antes del siguiente `model`).
- Create: migración nueva vía `prisma migrate dev` (Prisma genera el archivo).

**Interfaces:**
- Produces: modelo `OrdenTransporte` con campos `id, ordenId, numero, fecha,
  transportista, usuario, createdAt` — usado por Task 2 (rutas backend).

- [ ] **Step 1: Agregar el modelo al schema**

Agregar este bloque en `backend/prisma/schema.prisma`, en el schema `ventas` (mismo
`@@schema` que usa `model Orden`):

```prisma
model OrdenTransporte {
  id            Int      @id @default(autoincrement())
  ordenId       Int      @map("orden_id")
  numero        String
  fecha         DateTime
  transportista String
  usuario       String?
  createdAt     DateTime @default(now()) @map("created_at")
  orden         Orden    @relation(fields: [ordenId], references: [id], onDelete: Cascade)

  @@index([ordenId])
  @@map("ordenes_transporte")
  @@schema("ventas")
}
```

También agregar la relación inversa en `model Orden { ... }` (buscar el bloque de
relaciones existentes como `guiasDespacho GuiaDespacho[]` dentro de `model Orden` y
agregar una línea al lado):

```prisma
  ordenesTransporte OrdenTransporte[]
```

- [ ] **Step 2: Generar y aplicar la migración**

Run (usa la connection string de desarrollo local, `plastimar_dev` o la que tenga
configurada `backend/.env`):
```bash
cd backend && npx prisma migrate dev --name add_orden_transporte
```
Expected: crea `backend/prisma/migrations/<timestamp>_add_orden_transporte/migration.sql`
con `CREATE TABLE "ventas"."ordenes_transporte" (...)`, aplica sin error.

- [ ] **Step 3: Regenerar el cliente Prisma**

Run: `cd backend && npx prisma generate`
Expected: `✔ Generated Prisma Client`, sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(ventas): modelo OrdenTransporte (orden de transporte real, courier+fecha+numero)"
```

---

### Task 2: Rutas backend

**Files:**
- Create: `backend/src/routes/ventas/orden-transporte.js`
- Modify: `backend/src/routes/ventas/index.js:1-14` (registrar la ruta nueva)
- Modify: `backend/src/routes/ventas/get.js` (incluir `ordenesTransporte` en la
  respuesta de `GET /ventas/:id`)
- Test: `backend/test/orden-transporte.test.js`

**Interfaces:**
- Consumes: modelo `OrdenTransporte` (Task 1).
- Produces: `GET /api/ventas/:id/ordenes-transporte`,
  `POST /api/ventas/:id/ordenes-transporte`,
  `DELETE /api/ventas/ordenes-transporte/:id` — usados por Task 3 (hooks frontend).

- [ ] **Step 1: Escribir el archivo de rutas**

Crear `backend/src/routes/ventas/orden-transporte.js`:

```javascript
import { z } from 'zod'

const CreateSchema = z.object({
  numero: z.string().min(1),
  fecha: z.string().min(1),
  transportista: z.string().min(1),
})

export default async function ordenTransporteRoutes(fastify) {
  const readAuth = { preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')] }
  const writeAuth = { preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')] }

  fastify.get('/:id/ordenes-transporte', readAuth, async (request, reply) => {
    const ordenId = parseInt(request.params.id, 10)
    if (isNaN(ordenId)) return reply.code(400).send({ error: 'ID invalido' })
    const items = await fastify.prisma.ordenTransporte.findMany({
      where: { ordenId },
      orderBy: { createdAt: 'desc' },
    })
    return { items }
  })

  fastify.post('/:id/ordenes-transporte', writeAuth, async (request, reply) => {
    const ordenId = parseInt(request.params.id, 10)
    if (isNaN(ordenId)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = CreateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const orden = await fastify.prisma.orden.findUnique({ where: { id: ordenId }, select: { id: true } })
    if (!orden) return reply.code(404).send({ error: 'Venta no encontrada' })
    const created = await fastify.prisma.ordenTransporte.create({
      data: {
        ordenId,
        numero: parsed.data.numero,
        fecha: new Date(parsed.data.fecha),
        transportista: parsed.data.transportista,
        usuario: request.user?.nombre || null,
      },
    })
    return reply.code(201).send(created)
  })

  fastify.delete('/ordenes-transporte/:id', writeAuth, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    try {
      await fastify.prisma.ordenTransporte.delete({ where: { id } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
      throw e
    }
  })
}
```

- [ ] **Step 2: Registrar la ruta**

En `backend/src/routes/ventas/index.js`, agregar el import junto a los demás (después
de la línea `import cargosRoute from './cargos.js'`):
```javascript
import ordenTransporteRoute from './orden-transporte.js'
```
Y agregar el registro junto a los demás (después de `fastify.register(cargosRoute)`):
```javascript
  fastify.register(ordenTransporteRoute)
```

- [ ] **Step 3: Incluir en GET /ventas/:id**

En `backend/src/routes/ventas/get.js`, el `Promise.all` (línea ~23) ya trae `odts,
pagos, multas, despachos, guias, cobranza, cotizaciones` en paralelo. Agregar una
entrada más a ese array y al `Promise.all`:

```javascript
      fastify.prisma.ordenTransporte.findMany({ where: { ordenId: id }, orderBy: { createdAt: 'desc' } }),
```

Y en la desestructuración del resultado (`const [odts, pagos, multas, despachos, guias, cobranza, cotizaciones] = await Promise.all([...])`), agregar `ordenesTransporte` a la lista de nombres en el mismo orden, y agregarlo también al objeto de retorno final (`return { ...withCliente, ...financialState, items, odts, pagos, multas, despachos, guias, cobranza, cotizaciones }` pasa a incluir `ordenesTransporte`).

- [ ] **Step 4: Escribir tests (RED primero)**

Crear `backend/test/orden-transporte.test.js` — seguir el patrón de setup ya usado en
`backend/test/ventas.test.js` (mismo `buildApp`, mismo helper de login). Revisar el
inicio de `ventas.test.js` para copiar el patrón exacto de `beforeAll`/`loginAs`/cleanup
usado en ese archivo (no reinventar un patrón nuevo). Casos a cubrir:

```javascript
it('crea, lista y borra una orden de transporte', async () => {
  const marker = `TEST-OT-${Date.now()}`
  const producto = await createInventariado(marker, 5)
  const created = { ordenIds: [], productoIds: [producto.id] }
  try {
    const { res: ventaRes } = await createVentaSala({ producto, cantidad: 1 })
    expect(ventaRes.statusCode).toBe(201)
    const venta = JSON.parse(ventaRes.body)
    created.ordenIds.push(venta.id)

    const token = await loginAs(app, 'admin')

    const crear = await app.inject({
      method: 'POST',
      url: `/api/ventas/${venta.id}/ordenes-transporte`,
      headers: { authorization: `Bearer ${token}` },
      payload: { numero: 'OT-1234', fecha: '2026-07-15', transportista: 'Starken' },
    })
    expect(crear.statusCode).toBe(201)
    const ot = JSON.parse(crear.body)
    expect(ot.numero).toBe('OT-1234')
    expect(ot.transportista).toBe('Starken')

    const listar = await app.inject({
      method: 'GET',
      url: `/api/ventas/${venta.id}/ordenes-transporte`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(listar.statusCode).toBe(200)
    expect(JSON.parse(listar.body).items).toHaveLength(1)

    const detalleVenta = await app.inject({
      method: 'GET',
      url: `/api/ventas/${venta.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(JSON.parse(detalleVenta.body).ordenesTransporte).toHaveLength(1)

    const borrar = await app.inject({
      method: 'DELETE',
      url: `/api/ventas/ordenes-transporte/${ot.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(borrar.statusCode).toBe(204)
  } finally {
    await cleanup(created)
  }
})

it('rechaza crear orden de transporte sin numero/fecha/transportista', async () => {
  const marker = `TEST-OT-VALID-${Date.now()}`
  const producto = await createInventariado(marker, 5)
  const created = { ordenIds: [], productoIds: [producto.id] }
  try {
    const { res: ventaRes } = await createVentaSala({ producto, cantidad: 1 })
    const venta = JSON.parse(ventaRes.body)
    created.ordenIds.push(venta.id)
    const token = await loginAs(app, 'admin')

    const res = await app.inject({
      method: 'POST',
      url: `/api/ventas/${venta.id}/ordenes-transporte`,
      headers: { authorization: `Bearer ${token}` },
      payload: { numero: '', fecha: '2026-07-15', transportista: 'Starken' },
    })
    expect(res.statusCode).toBe(400)
  } finally {
    await cleanup(created)
  }
})
```

Ojo: si `createVentaSala`/`createInventariado`/`loginAs`/`cleanup` no están exportados
de `ventas.test.js`, definirlos localmente en el archivo nuevo copiando la
implementación exacta de `ventas.test.js` (no importar entre archivos de test, no es el
patrón usado en este proyecto — cada archivo de test es autocontenido).

- [ ] **Step 5: Correr los tests, deben fallar (RED)**

Run: `cd backend && DATABASE_URL="postgresql://postgres:1q2w3e4rlala@localhost:5432/plastimar_test" npx vitest run test/orden-transporte.test.js`
Expected: FAIL — la ruta no existe todavía si se escribió el test antes del Step 1-3, o
PASS si ya se implementó. Si ya se implementó (orden natural de este plan), correr
igual para confirmar GREEN antes de continuar — no hay necesidad de forzar un RED
artificial revirtiendo código ya escrito.

- [ ] **Step 6: Confirmar GREEN y correr la suite completa**

Run: `cd backend && DATABASE_URL="postgresql://postgres:1q2w3e4rlala@localhost:5432/plastimar_test" npx vitest run`
Expected: todos los tests pasan (línea base actual + los nuevos), sin regresión.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/ventas/orden-transporte.js backend/src/routes/ventas/index.js backend/src/routes/ventas/get.js backend/test/orden-transporte.test.js
git commit -m "feat(ventas): rutas GET/POST/DELETE ordenes-transporte + incluir en GET /ventas/:id"
```

---

### Task 3: Frontend — hooks + modal + botón

**Files:**
- Modify: `frontend/src/api/ventas.js` — agregar 3 hooks nuevos, mismo patrón que
  `useAnularVenta`/`useActivarVenta` (final del archivo).
- Modify: `frontend/src/components/forms/ViewVentaPanel.jsx` — nuevo componente
  `OrdenTransporteModal`, nuevo botón en `OperacionesDisponibles`.

**Interfaces:**
- Consumes: `GET/POST/DELETE .../ordenes-transporte` (Task 2).
- Produces: componente `OrdenTransporteModal({ venta, onClose })`, usado solo dentro de
  `ViewVentaPanel.jsx`.

- [ ] **Step 1: Agregar los hooks**

En `frontend/src/api/ventas.js`, agregar al final del archivo (mismo patrón que
`useAnularVenta`):

```javascript
export const useOrdenesTransporte = (ordenId) => useQuery({
  queryKey: ['ventas', ordenId, 'ordenes-transporte'],
  queryFn: () => api.get(`/ventas/${ordenId}/ordenes-transporte`).then(r => r.data),
  enabled: !!ordenId,
})

export const useCrearOrdenTransporte = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ordenId, data }) => api.post(`/ventas/${ordenId}/ordenes-transporte`, data).then(r => r.data),
    onSuccess: (_, { ordenId }) => {
      qc.invalidateQueries({ queryKey: ['ventas', ordenId, 'ordenes-transporte'] })
      qc.invalidateQueries({ queryKey: ['ventas', ordenId] })
    },
  })
}

export const useDeleteOrdenTransporte = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) => api.delete(`/ventas/ordenes-transporte/${id}`),
    onSuccess: (_, { ordenId }) => {
      qc.invalidateQueries({ queryKey: ['ventas', ordenId, 'ordenes-transporte'] })
      qc.invalidateQueries({ queryKey: ['ventas', ordenId] })
    },
  })
}
```

- [ ] **Step 2: Agregar el import en ViewVentaPanel.jsx**

Cambiar la línea de import de `api/ventas` (ya consolidada en una sola línea por un
cambio anterior — buscar `from '../../api/ventas'`) para agregar los 3 hooks nuevos al
final de la lista desestructurada:

```javascript
import { useVenta, useDeleteVenta, useForzarTaller, useUpdateVenta, useAnularVenta, useActivarVenta, useUpdateItemEntregados, useOrdenesTransporte, useCrearOrdenTransporte, useDeleteOrdenTransporte } from '../../api/ventas'
```

- [ ] **Step 3: Agregar el componente `OrdenTransporteModal`**

Insertar este componente en `ViewVentaPanel.jsx`, justo después del cierre de la
función `OperacionesDisponibles` (buscar `function OperacionesDisponibles(` y el `}`
que cierra esa función):

```jsx
// ── Modal: Orden de Transporte ───────────────────────────────────────────────
const TRANSPORTISTAS = [
  'Pullman cargo', 'Starken', 'Correos de chile', 'Chilexpress', 'Bluexpress',
  'Varmontt', 'Transporte JT', 'Transporte Espinoza', 'Don Carlos', 'Otro',
]

function OrdenTransporteModal({ venta, onClose }) {
  const { data, isLoading } = useOrdenesTransporte(venta.id)
  const crear = useCrearOrdenTransporte()
  const eliminar = useDeleteOrdenTransporte()
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState('')
  const [transportista, setTransportista] = useState('')

  const items = data?.items || []

  const handleCrear = () => {
    if (!numero.trim() || !fecha || !transportista) {
      toast.warning('Completa número, fecha y transportista')
      return
    }
    crear.mutate({ ordenId: venta.id, data: { numero: numero.trim(), fecha, transportista } }, {
      onSuccess: () => { setNumero(''); setFecha(''); setTransportista(''); toast.success('Orden de transporte creada.') },
      onError: err => toast.error(err?.response?.data?.error || 'No se pudo crear la orden de transporte.'),
    })
  }

  const handleEliminar = async (item) => {
    if (!await confirmDialog({ title: 'Eliminar orden de transporte', detail: `¿Eliminar la orden de transporte ${item.numero}?`, tone: 'danger' })) return
    eliminar.mutate({ id: item.id, ordenId: venta.id }, {
      onSuccess: () => toast.success('Eliminada.'),
      onError: err => toast.error(err?.response?.data?.error || 'No se pudo eliminar.'),
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'oklch(0 0 0 / .38)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 22, width: 420, maxWidth: '90%', boxShadow: '0 16px 48px oklch(0 0 0 / .2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Orden de Transporte — Venta #{venta.id}</div>
          <button onClick={onClose} style={{ color: 'var(--text-3)', padding: 4 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Número / seguimiento" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }} />
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }} />
          <select value={transportista} onChange={e => setTransportista(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}>
            <option value="">Selecciona transportista</option>
            {TRANSPORTISTAS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={handleCrear} disabled={crear.isPending} style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: 'var(--green-900)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            {crear.isPending ? 'Guardando...' : 'Agregar'}
          </button>
        </div>

        {isLoading ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Cargando...</div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Sin órdenes de transporte registradas.</div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {items.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.numero} — {item.transportista}</div>
                  <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{new Date(item.fecha).toLocaleDateString('es-CL')}</div>
                </div>
                <button onClick={() => handleEliminar(item)} style={{ color: 'var(--red)', fontSize: 11, fontWeight: 600 }}>Eliminar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Agregar el botón y el estado del modal en `OperacionesDisponibles`**

Dentro de `function OperacionesDisponibles({ v, odtsCount, guiasCount, canEmitirDte, onEmitirDte, canDelete })`, agregar el hook de conteo y el estado del modal al principio del cuerpo de la función (junto a los `const anularVenta = useAnularVenta()` etc.):

```javascript
  const { data: ordenesTransporteData } = useOrdenesTransporte(v.id)
  const [showOrdenTransporte, setShowOrdenTransporte] = useState(false)
```

Agregar el botón nuevo, justo después del botón de "Guías Despachos" (buscar el bloque
`<button onClick={() => navigate(\`/despachos?ordenId=${v.id}\`)}`):

```jsx
      <button onClick={() => setShowOrdenTransporte(true)} style={opBtnStyle('var(--blue)')}>
        <Icon name="truck" size={14} /> Orden de Transporte ({(ordenesTransporteData?.items || []).length})
      </button>
```

Y al final del `return (...)` de `OperacionesDisponibles`, antes del cierre del `<div>`
raíz del componente, agregar el render condicional del modal:

```jsx
      {showOrdenTransporte && <OrdenTransporteModal venta={v} onClose={() => setShowOrdenTransporte(false)} />}
```

- [ ] **Step 5: Verificar build y lint**

Run: `cd frontend && npm run build`
Expected: `✓ built` sin errores.

Run: `cd frontend && npm run lint`
Expected: 0 errores nuevos en `ViewVentaPanel.jsx`/`api/ventas.js` (pueden existir
errores preexistentes en OTROS archivos del proyecto — no son responsabilidad de esta
tarea, ignorarlos).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/ventas.js frontend/src/components/forms/ViewVentaPanel.jsx
git commit -m "feat(ventas): modal Orden de Transporte (numero+fecha+transportista) en vista de venta"
```

---

## Pieza 2: Rename visible "ODT" → "OT" / "Orden de Taller"

### Task 4: Barrido de texto visible

**Files:** solo frontend, lista completa abajo (confirmada por grep real el
2026-07-15, re-correr el mismo grep al terminar para verificar que no queda nada).

**Interfaces:** ninguna — cambio de texto puro, no cambia ningún contrato de datos ni
firma de función.

**Regla de reemplazo (aplicar consistentemente en TODOS los archivos de la lista):**
- Texto visible al usuario (labels de UI, títulos, subtítulos, placeholders, contenido
  de `Badge`, texto de botones, breadcrumbs, mensajes de confirmación/toast) que diga
  "ODT"/"ODTs" a secas → cambiar a **"OT"/"OTs"** si es un badge/columna corta (poco
  espacio), o **"Orden de Taller"/"Órdenes de Taller"** si es un título/label largo con
  espacio.
- **NO tocar:** nombres de archivo (`FormOdt.jsx`, `TallerFormPage.jsx`, etc.), nombres
  de componente (`function FormOdt`), nombres de variable/prop/función (`odt`, `odts`,
  `odtId`, `useOdt`, `ODT_TONE` como identificador — solo su VALOR de texto si el
  string dentro tiene "ODT"), rutas de API (`/api/odts`, `/taller/...`), nombres de
  columna de base de datos, cualquier cosa dentro de `backend/`.

**Lista exacta encontrada (grep `ODT` en `frontend/src`, 2026-07-15) — revisar cada una
y aplicar la regla de arriba solo al texto visible, dejar el resto intacto:**

- `frontend/src/components/AiChat.jsx:24` — string de sugerencia de chat IA:
  `'¿Cuántas ODT pendientes hay y cuántas atrasadas?'` → `'¿Cuántas OT de taller
  pendientes hay y cuántas atrasadas?'`
- `frontend/src/components/TopBar.jsx:47` — `{ label: 'ODTs', route: '/taller', ... }`
  → cambiar solo `label: 'Órdenes de Taller'` (dejar `route: '/taller'` intacto).
- `frontend/src/pages/dashboard/DashboardPage.jsx:575` — `label="ODTs Activas"` →
  `label="OT Activas"`.
- `frontend/src/pages/dashboard/DashboardPage.jsx:668` — `title="Talleres - ODTs
  Activas"` → `title="Talleres - OT Activas"`.
- `frontend/src/pages/dashboard/DashboardPage.jsx:687` — `label="Nueva ODT"` →
  `label="Nueva OT"`.
- `frontend/src/components/forms/ViewVentaPanel.jsx:248` — string `'Gatillar Taller /
  ODT'` → revisar contexto primero (puede ser texto muerto de la rama drawer sin uso,
  confirmar antes de tocar; si es texto vivo, cambiar a `'Gatillar Taller / OT'`).
- `frontend/src/components/forms/ViewVentaPanel.jsx:286` — `ODT #{odt.id}` (rama
  drawer, `TabTaller`) → `OT #{odt.id}`.
- `frontend/src/components/forms/ViewVentaPanel.jsx:730` — toast `'Orden de Trabajo
  (ODT) procesada correctamente.'` → `'Orden de Trabajo procesada correctamente.'`
  (sacar el "(ODT)" entero, ya dice "Orden de Trabajo" explícito antes).
- `frontend/src/components/forms/FormOdt.jsx:14` — título `Editar ODT #{initial?.id}` →
  `Editar OT #{initial?.id}` (el archivo/componente se sigue llamando `FormOdt`, no
  tocar eso).
- `frontend/src/pages/clientes/ClientesFormPage.jsx:249` — label
  `` `Historial · ${ventas.length} ventas · ${odts.length} ODT` `` → cambiar el sufijo
  a `OT`.
- `frontend/src/pages/clientes/ClientesFormPage.jsx:280` — header de columna `'ODT'` →
  `'OT'`.
- `frontend/src/pages/matriz-ventas/MatrizVentasPage.jsx:108` — placeholder `"Buscar
  por cliente, ODT, guía, OC..."` → `"Buscar por cliente, OT, guía, OC..."`.
- `frontend/src/pages/matriz-ventas/MatrizVentasPage.jsx:305` — `label: 'ODTs'` →
  `label: 'OT'`.
- `frontend/src/components/forms/FormCliente.jsx:289` — `ODT #{odt.id}` → `OT #{odt.id}`.
- `frontend/src/pages/bitacora-taller/BitacoraTallerPage.jsx:97` — `label: 'ODT'` →
  `label: 'OT'`.
- `frontend/src/pages/bitacora-taller/BitacoraTallerPage.jsx:100` — `'Sin ODT'` →
  `'Sin OT'`.
- `frontend/src/pages/bitacora-taller/BitacoraTallerPage.jsx:226` — `label="ODT ID"` →
  `label="OT ID"`.
- `frontend/src/pages/licitaciones/LicitacionDetallePage.jsx:638` — `'ODTs:'` →
  `'OT:'`.
- `frontend/src/pages/licitaciones/LicitacionDetallePage.jsx:645` — `` `ODTs
  (${data.odts.length})` `` → `` `OT (${data.odts.length})` ``.
- `frontend/src/pages/historial-materiales/HistorialMaterialesPage.jsx:99` — `label:
  'ODT'` → `label: 'OT'`.
- `frontend/src/pages/historial-materiales/HistorialMaterialesPage.jsx:159` —
  `label="ODT"` → `label="OT"`.
- `frontend/src/pages/despachos/DespachosPage.jsx:228` — `` `Abrir ODT #${value}` `` →
  `` `Abrir OT #${value}` ``.
- `frontend/src/pages/despachos/DespachosPage.jsx:253` — `label: 'ODTs'` →
  `label: 'OT'`.
- `frontend/src/pages/despachos/DespachosPage.jsx:269` — texto de botón `ODT` → `OT`
  (dejar `navigate(\`/odt?ordenId=...\`)` intacto, esa ruta ya existe).
- `frontend/src/pages/despachos/DespachosPage.jsx:318,349` — `label: 'ODT'` (x2) →
  `label: 'OT'`.
- `frontend/src/pages/despachos/DespachosPage.jsx:415` — `label="ODT"` → `label="OT"`.
- `frontend/src/pages/despachos/DespachosPage.jsx:904,943` — `label="ODT ID"` (x2) →
  `label="OT ID"`.
- `frontend/src/pages/taller/TallerOperarioPage.jsx:71` — `subtitle="Gestión rápida de
  tareas de taller y ODTs"` → `"...tareas de taller y OT"`.
- `frontend/src/pages/pasar-taller/PasarTallerPage.jsx:255` — texto de botón `Ver ODT`
  → `Ver OT`.
- `frontend/src/pages/admin/IntegridadPage.jsx:10,14,17` — labels de auditoría interna
  (`'ODT items huérfanos'`, `'ODT texto corrupto'`, `'ODTs sin cliente'`) → `'OT items
  huérfanos'`, `'OT texto corrupto'`, `'OT sin cliente'` (los `key:`/`cols:` con
  `odt_id` etc. NO se tocan, son nombres de columna reales).
- `frontend/src/pages/admin/IntegridadPage.jsx:112` — texto de confirmación `'Rellenar
  cliente_nombre desde orden.cliente_id en todas las ODTs huérfanas?'` → `'...en todas
  las OT huérfanas?'`.
- `frontend/src/pages/admin/IntegridadPage.jsx:157` — texto de botón `'ODT'` → `'OT'`.
- `frontend/src/pages/admin/SaneamientoLegacyPage.jsx:19,22,100,127` — mismos labels de
  auditoría interna, mismo criterio que `IntegridadPage.jsx`.
- `frontend/src/pages/reportes-gerenciales/ReportesGerencialesPage.jsx:427` —
  `title="ODTs pendientes"` → `title="OT pendientes"`.
- `frontend/src/pages/reportes-gerenciales/ReportesGerencialesPage.jsx:431` — `label:
  'ODT'` → `label: 'OT'`.
- `frontend/src/pages/reportes-gerenciales/ReportesGerencialesPage.jsx:439,440` —
  `emptyMessage`/`ariaLabel` `"Sin ODTs pendientes"`/`"ODTs pendientes"` → `"Sin OT
  pendientes"`/`"OT pendientes"`.

**No tocar (confirmado no son texto visible al usuario, son identificadores/datos):**
- `frontend/src/data/odts.js:1` — nombre de constante exportada `ODTS`, no texto de UI.
- `frontend/src/components/forms/ViewVentaPanel.jsx:55` /
  `frontend/src/components/forms/FormCliente.jsx:147` — `const ODT_TONE = {...}` es un
  nombre de variable, no texto visible (sus *keys* como `Prioritaria`/`Pendiente` sí
  son visibles vía `Badge`, pero esos no dicen "ODT").
- `frontend/src/pages/taller/TallerFormPage.jsx:30` — `const ESTADOS_ODT = [...]` es un
  nombre de variable.

- [ ] **Step 1: Aplicar todos los cambios de la lista**

Editar cada archivo listado arriba, cambiando solo el texto visible según la regla
(badge/columna corta → "OT", título/label largo → "Orden de Taller"/"Órdenes de
Taller"). No usar reemplazo automático global de "ODT"→"OT" en los archivos — cada
ocurrencia ya está clasificada arriba, aplicar una por una.

- [ ] **Step 2: Verificar que no queda texto visible sin corregir**

Run: `cd frontend && grep -rn "ODT" src --include=*.jsx --include=*.js | grep -v "data/odts.js\|ODT_TONE\|ESTADOS_ODT"`

Expected: cualquier línea que quede en el output debe ser código (identificador,
variable, ruta `/odt`) — no texto entre comillas visible al usuario. Si aparece algo
nuevo que sí sea texto visible, corregirlo también antes de continuar.

- [ ] **Step 3: Verificar build y lint**

Run: `cd frontend && npm run build`
Expected: `✓ built` sin errores.

Run: `cd frontend && npm run lint`
Expected: 0 errores nuevos (mismo criterio que tareas anteriores).

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "fix(taller): renombra texto visible ODT -> OT (Orden de Transporte != Orden de Taller)"
```

---

## Verificación final del plan completo

- [ ] Backend: `cd backend && DATABASE_URL="postgresql://postgres:1q2w3e4rlala@localhost:5432/plastimar_test" npx vitest run` — todos los tests pasan, incluye los nuevos de `orden-transporte.test.js`.
- [ ] Frontend: `cd frontend && npm run build && npm run lint` — limpio.
- [ ] Manual (documentar en el reporte final, no hay infra de test de componentes):
  abrir una venta, click "Orden de Transporte", crear una con número/fecha/transportista,
  confirmar que aparece en la lista y que el contador del botón se actualiza; borrarla y
  confirmar que desaparece. Recorrer 3-4 pantallas de la lista de rename (Dashboard,
  Despachos, un Cliente con historial) y confirmar que ya no dicen "ODT" a secas.
