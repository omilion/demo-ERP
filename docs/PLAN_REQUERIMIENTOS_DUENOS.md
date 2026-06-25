# Plan de implementación — Requerimientos dueños (reunión 20-may)

> **Para el agente constructor.** Implementar SOLO los cambios de este documento. Cada uno fue verificado contra el código real (rutas y campos incluidos abajo). **Regla de oro: no romper nada existente.** Después de cada bloque, ejecutar las pruebas indicadas.
>
> **Alcance acordado:** Punto 5 (CRM: conversión lead→cliente, bandeja de pendientes, métricas, fix drag&drop), Punto 6 (confirmar estado "Reservado"), Punto 7 (RRHH: subcontratos, certificados de antecedentes, registro de vacunas).

---

## ⚠️ Reglas generales (obligatorias)

1. **No tocar** módulos fuera de los listados (ventas, taller, caja, licitaciones, etc. quedan intactos).
2. **Antes de cada migración**, confirmar que es idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Aplicar primero en la base local de test (`DATABASE_URL` a `localhost:55432/plastimar_test`), NO al VPS.
3. **No hacer deploy.** Solo dejar el código + migraciones listas en working tree.
4. **Reutilizar patrones existentes** (no inventar estilos nuevos): para RRHH usar `registerSubResource` + `RRHH_TAB_CONFIG`; para CRM respetar `@dnd-kit` ya instalado.
5. Tras terminar, correr `npm run build` (frontend) y los tests del backend afectados (`vitest run crm rrhh productos`) — todo debe quedar verde.
6. Si algo no se puede verificar en el código, marcar `// POR CONFIRMAR` y reportarlo, NO inventar.

---

## ✅ PUNTO 6 — Estado "Reservado" de producto → YA ESTÁ (solo verificar)

**Verificado:** el estado "Reserva" YA existe completo:
- Backend: `backend/src/routes/productos/helpers.js` → `computeEstadoOperacional` devuelve `'Reserva'`.
- Frontend: `frontend/src/pages/bodega/BodegaFormPage.jsx` → `ESTADO_INVENTARIO_OPTIONS` incluye `'Reserva'` en el selector "Estado inventario".

**Acción del constructor:** NINGUNA implementación. Solo **probar** que al editar un producto se puede seleccionar "Reserva", guardar, y que el estado operacional se muestra como "Reserva". Si funciona, marcar el punto como cerrado. Si el label que quieren los dueños es "Reservado" (no "Reserva"), cambiar SOLO el texto del label en las opciones, sin tocar la lógica.

---

## 🟦 PUNTO 5 — CRM: dale valor útil al pipeline

Estado actual (verificado): `backend/src/routes/crm/index.js` (GET/PATCH/ejecutivas) y `frontend/src/pages/crm/CrmPage.jsx` (kanban con `@dnd-kit`). Estados: `0=Pendiente, 1=En Gestión, 2=En Espera, 3=Cerrado`.

### 5.0 — 🔒 Visibilidad por vendedor (SEGURIDAD — hacer PRIMERO, base de todo lo demás)

**Problema verificado:** hoy el endpoint `GET /api/crm` NO filtra por usuario. Cualquier rol con `ventas:read` ve TODOS los registros de TODAS las ejecutivas. Un vendedor ve la cartera de sus colegas. El filtro `ejecutiva` actual es opcional (lo elige el usuario), NO una restricción de servidor. Además `CrmRegistro` solo tiene `ejecutiva` (texto) y `usuario` (texto), SIN vínculo al usuario real.

**Regla de negocio a implementar:**
- **Vendedor** → ve SOLO sus registros (los asignados a él).
- **Admin** → ve el consolidado completo (todos) + los suyos.

**Schema + migración:**
- Agregar a `CrmRegistro` el campo `vendedorId Int? @map("vendedor_id")` con relación opcional a `User` (`onDelete: SetNull`) e índice. Migración idempotente, SOLO a base local de test.
- Back-relation en `User` si aplica.

**Backend (`crm/index.js`):**
- En `GET /` y en `GET /metricas` y `GET /pendientes-hoy`: aplicar filtro de servidor según rol:
  ```js
  // Admin ve todo; el resto solo lo suyo.
  if (request.user.role !== 'admin') where.vendedorId = request.user.id
  ```
  Esto es una RESTRICCIÓN DE SERVIDOR (no del query del front), no se puede saltar desde el cliente.
- Al asignar el dueño: el admin puede setear `vendedorId` (asignar el lead a un vendedor) vía el PATCH; un vendedor que cree/edite se autoasigna. (Patrón idéntico al de ventas: admin asigna, vendedor se autoasigna.)
- **Registros legacy sin `vendedorId`:** quedan en `null`. Decisión: que SOLO el admin los vea (los `null` no matchean `vendedorId = userId`). Marcar en el código un comentario claro: "registros sin dueño = solo admin, pendiente de asignar". NO inventar un mapeo por nombre de ejecutiva (frágil).

**Frontend (`CrmPage.jsx`):**
- El admin ve un selector para asignar el lead a un vendedor (lista de usuarios vendedores).
- El vendedor no ve ese selector (su lead ya es suyo).
- El filtro "por ejecutiva" del admin se mantiene como filtro visual adicional.

**Prueba obligatoria:** loguear como vendedor → solo ve sus registros (verificar que NO puede ver los de otro ni quitando filtros). Loguear como admin → ve todos. Confirmar que el filtro es de servidor (probar manipulando el query no debe exponer otros).

### 5.1 — Conversión automática lead → cliente al cerrar

**Qué:** cuando un lead del CRM pasa a estado `3` (Cerrado), ofrecer crear el cliente en la base general si no existe (por RUT).

**Backend** (`crm/index.js`):
- Nuevo endpoint `POST /api/crm/:id/convertir-cliente` (preHandler: `rbac('clientes', 'write')`):
  1. Lee el `CrmRegistro` (rut, nombre/rsocial, email, telefono).
  2. Si no tiene RUT válido → 400 con mensaje claro ("El lead no tiene RUT, no se puede crear cliente").
  3. Busca `Cliente` por `rut`. Si ya existe → devolver `{ clienteId, creado: false }` (no duplicar — respeta el RUT canónico del Punto 2).
  4. Si no existe → crear `Cliente` con los datos del lead (rut, nombre = rsocial||nombre, email, telefono, activo: true). Devolver `{ clienteId, creado: true }`.
- **NO** crear cliente automáticamente en el PATCH de estado (evita efectos colaterales sorpresa). La conversión es una acción explícita.

**Frontend** (`CrmPage.jsx`):
- Cuando una card está en estado Cerrado (o al moverla a Cerrado), mostrar en el modal de detalle un botón **"Convertir a Cliente"**.
- Al hacer clic: llamar al endpoint. Si `creado: true` → toast "Cliente creado" + ofrecer ir a `/clientes/:id/editar` o `/ventas/nueva?clienteId=...`. Si `creado: false` → "El cliente ya existe" + link al cliente.
- Invalidar queries de clientes tras crear.

**Cuidado:** no romper el flujo de PATCH actual. La conversión es additiva.

### 5.2 — Bandeja de pendientes diarios (del vendedor logueado)

**Qué:** un panel que muestre al usuario logueado sus gestiones agendadas para HOY y vencidas (campo `fechaProximo` ya existe).

**Backend** (`crm/index.js`):
- Nuevo endpoint `GET /api/crm/pendientes-hoy` (preHandler: `rbac('ventas', 'read')`):
  - Devuelve los `CrmRegistro` con `fechaProximo <= fin de hoy` y estado != `3` (no cerrados), ordenados por `fechaProximo` asc.
  - Filtrar por la ejecutiva del usuario logueado si su nombre coincide con `ejecutiva` (si no hay match claro, devolver todos los pendientes — NO inventar un mapeo usuario↔ejecutiva que no existe; marcar `// POR CONFIRMAR` cómo se vincula el user con la ejecutiva).
  - Separar en `{ hoy: [...], vencidas: [...] }`.

**Frontend** (`CrmPage.jsx` o componente nuevo):
- Una sección/banda arriba del kanban: "Mis pendientes de hoy (N)" con la lista (nombre lead, acción, fecha). Click en un item abre la card.
- Las vencidas en rojo, las de hoy en ámbar.

### 5.3 — Métricas de conversión

**Qué:** KPIs de pipeline: tasa de cierre, distribución por estado, performance por ejecutiva.

**Backend** (`crm/index.js`):
- Nuevo endpoint `GET /api/crm/metricas` (preHandler: `rbac('ventas', 'read')`, acepta `fechaDesde`/`fechaHasta`):
  - `porEstado`: conteo por cada estado (0-3).
  - `tasaCierre`: cerrados / total * 100.
  - `porEjecutiva`: por cada ejecutiva → total, cerrados, tasa de cierre.
  - (Si es viable con los datos) `tiempoPromedioEnPipeline`: promedio de días entre `createdAt` y hoy para los no cerrados. Si no hay fecha de cierre confiable, omitir y marcar `// POR CONFIRMAR`.
- Usar SQL agregado o `groupBy`, solo lectura.

**Frontend:**
- Una fila de KPIs nueva (reusar el componente `KpiCard` que ya está en la página) o una pestaña "Métricas": tasa de cierre, embudo por estado, tabla por ejecutiva.

### 5.4 — Fix del bug de drag&drop que "congela" las tarjetas

**Diagnóstico (verificado):** en `CrmPage.jsx`, `handleDragEnd` (≈línea 434) hace `patch.mutate(...)` **sin actualización optimista**. La card no se mueve visualmente hasta que el servidor responde y la query se refetchea; si eso tarda o falla silenciosamente, la card parece congelada o salta.

**Fix:**
- Implementar **actualización optimista**: al soltar, actualizar el estado del item en la cache de React Query inmediatamente (`queryClient.setQueryData`), luego disparar el `patch`. En `onError`, revertir al estado anterior y mostrar el alert.
- Asegurar que `handleDragEnd` no deje `activeId`/`overId` colgados (ya los limpia, verificar que se limpien también en caso de error).
- **Probar manualmente:** arrastrar varias cards rápido entre columnas; no deben congelarse ni duplicarse ni revertirse sin razón.

---

## 🟥 PUNTO 7 — RRHH: subcontratos, certificados de antecedentes, vacunas

Estado actual (verificado): `backend/src/routes/rrhh/index.js` usa `registerSubResource(f, path, model, picker)` para contratos, liquidaciones, anticipos, licencias, vacaciones, epps, hojas-vida, horas-extras, reglamentos. El frontend (`RrhhPage.jsx`) usa `RRHH_TAB_CONFIG` para las pestañas. **Hay que agregar 3 subrecursos nuevos siguiendo EXACTAMENTE ese patrón.**

### 7.1 — Schema (Prisma) + migración

Agregar 3 modelos nuevos al schema `rrhh`, espejando la estructura de los existentes (ej. `HojaVida`/`Reglamento`, que tienen `trabajadorId`, documento/imagen, fechas, estado). Cada uno con relación a `Trabajador` (`onDelete: Cascade`) y su back-relation en el modelo `Trabajador`.

```prisma
model Subcontrato {
  id           Int        @id @default(autoincrement())
  trabajadorId Int        @map("trabajador_id")
  empresa      String?    // empresa subcontratista
  contrato     String?    // identificador/nombre del subcontrato
  inicio       DateTime?  @db.Date
  termino      DateTime?  @db.Date
  documento    String?
  imagen       String?    // PDF/imagen escaneada
  estado       Boolean    @default(true)
  createdAt    DateTime?  @default(now()) @map("created_at")
  updatedAt    DateTime?  @updatedAt @map("updated_at")
  trabajador   Trabajador @relation(fields: [trabajadorId], references: [id], onDelete: Cascade)
  @@index([trabajadorId])
  @@map("subcontratos")
  @@schema("rrhh")
}

model CertificadoAntecedentes {
  id           Int        @id @default(autoincrement())
  trabajadorId Int        @map("trabajador_id")
  fechaEmision DateTime?  @map("fecha_emision") @db.Date
  fechaVencimiento DateTime? @map("fecha_vencimiento") @db.Date
  documento    String?
  imagen       String?
  observacion  String?
  estado       Boolean    @default(true)
  createdAt    DateTime?  @default(now()) @map("created_at")
  updatedAt    DateTime?  @updatedAt @map("updated_at")
  trabajador   Trabajador @relation(fields: [trabajadorId], references: [id], onDelete: Cascade)
  @@index([trabajadorId])
  @@map("certificados_antecedentes")
  @@schema("rrhh")
}

model Vacuna {
  id           Int        @id @default(autoincrement())
  trabajadorId Int        @map("trabajador_id")
  tipo         String?    // ej: Influenza, COVID, Tétanos
  dosis        String?    // ej: "1a dosis", "refuerzo"
  fecha        DateTime?  @db.Date
  documento    String?
  imagen       String?
  observacion  String?
  estado       Boolean    @default(true)
  createdAt    DateTime?  @default(now()) @map("created_at")
  updatedAt    DateTime?  @updatedAt @map("updated_at")
  trabajador   Trabajador @relation(fields: [trabajadorId], references: [id], onDelete: Cascade)
  @@index([trabajadorId])
  @@map("vacunas")
  @@schema("rrhh")
}
```
- Agregar en el modelo `Trabajador` las 3 back-relations: `subcontratos Subcontrato[]`, `certificadosAntecedentes CertificadoAntecedentes[]`, `vacunas Vacuna[]`.
- Crear migración SQL idempotente (`CREATE TABLE IF NOT EXISTS ... ` + índices + FK con el patrón `DO $$ ... pg_constraint ...`). Aplicarla SOLO a la base local de test, NO al VPS.

### 7.2 — Backend (rutas)

En `rrhh/index.js`:
- Agregar 3 pickers siguiendo el patrón de `pickContrato`/`pickHojaVida`:
  - `pickSubcontrato(b)` → empresa, contrato, inicio, termino, documento, imagen, estado.
  - `pickCertificadoAntecedentes(b)` → fechaEmision, fechaVencimiento, documento, imagen, observacion, estado.
  - `pickVacuna(b)` → tipo, dosis, fecha, documento, imagen, observacion, estado.
  - (Usar los helpers `toDate`/`toBool` ya existentes en el archivo.)
- Registrar los 3 subrecursos (1 línea c/u, junto a los existentes):
  ```js
  registerSubResource(f, 'subcontratos', 'subcontrato', pickSubcontrato)
  registerSubResource(f, 'certificados-antecedentes', 'certificadoAntecedentes', pickCertificadoAntecedentes)
  registerSubResource(f, 'vacunas', 'vacuna', pickVacuna)
  ```
  Esto da automáticamente GET/POST/PUT/DELETE por trabajador. NO escribir endpoints a mano.

### 7.3 — Frontend (ficha del trabajador)

En `frontend/src/pages/rrhh/RrhhPage.jsx`:
- Agregar al `RRHH_TAB_CONFIG` 3 pestañas nuevas (espejando `contratos`/`vacaciones`), con su `label`, `resource` (los hooks de API), `documentField: 'imagen'`, y los campos del formulario de cada una.
- Agregar los hooks correspondientes en `frontend/src/api/rrhh.js` (o donde estén `contratos`, `liquidaciones`, etc.) siguiendo el mismo patrón: `useSubcontratos(trabajadorId)`, `useVacunas(...)`, etc., apuntando a las rutas nuevas.
- Reutilizar el componente de upload de documento que ya usan las otras pestañas (`useUploadRrhhDocumento`).

---

## 🧪 Pruebas obligatorias antes de dar por terminado

Ejecutar y dejar evidencia de:

1. **Migración:** aplicar en base local de test → `npx prisma migrate deploy` + `npx prisma migrate diff` (sin drift) + `npx prisma generate`.
2. **Backend arranca:** smoke import de `src/app.js` sin errores.
3. **Tests backend:** `vitest run crm rrhh productos` → 100% verde. Si no hay tests para los endpoints nuevos, agregar al menos un test básico por cada endpoint nuevo (crear/listar).
4. **Frontend compila:** `npm run build` sin errores.
5. **Pruebas manuales (reportar resultado):**
   - CRM: convertir un lead cerrado a cliente (caso nuevo y caso ya existente). Ver la bandeja de pendientes de hoy. Ver las métricas. Arrastrar cards rápido sin que se congelen.
   - RRHH: en una ficha de trabajador, crear/listar un subcontrato, un certificado de antecedentes y una vacuna (con y sin documento adjunto).
   - Productos: setear un producto en "Reserva" y verificar que se guarda y muestra.
6. **No-regresión:** confirmar que ventas, taller, caja, licitaciones siguen funcionando (no se tocaron, pero verificar que el build y los tests generales no se rompieron).

---

## 📋 Resumen de archivos a tocar

| Área | Archivos |
|---|---|
| CRM schema | `backend/prisma/schema.prisma` (campo `vendedorId` en CrmRegistro) + migración |
| CRM backend | `backend/src/routes/crm/index.js` (filtro por rol + asignación) |
| CRM frontend | `frontend/src/pages/crm/CrmPage.jsx`, `frontend/src/api/crm.js` |
| RRHH schema | `backend/prisma/schema.prisma` + nueva migración en `backend/prisma/migrations/` |
| RRHH backend | `backend/src/routes/rrhh/index.js` |
| RRHH frontend | `frontend/src/pages/rrhh/RrhhPage.jsx`, `frontend/src/api/rrhh.js` |
| Productos | Solo verificar (estado "Reserva" ya existe); a lo sumo ajustar label |

**Lo que NO se toca:** ventas, taller, despachos, caja, licitaciones, bodega (más allá del label de estado), asistente IA, notificaciones, comisiones.
