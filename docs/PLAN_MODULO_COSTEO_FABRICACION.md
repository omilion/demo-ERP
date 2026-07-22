# Plan de implementación — Módulo de Costeo de Fabricación

**Para:** Gema (agente constructor)
**Objetivo:** reemplazar el Excel `NUEVOS CALCULOS_PRECIOS_MK` con un módulo del ERP.
**Alcance de permisos:** **solo admin** por ahora (ver §3).
**Modo de trabajo:** ejecutar las 6 fases completas, en orden, sin detenerse. Al terminar, dejar el informe de §9 para revisión.

---

## 1. Contexto — leer antes de escribir código

Plastimar vende productos que **fabrica Allegro** (empresa relacionada). Los códigos `MK-*` (2.848 productos activos) son de Allegro; los otros ~31.700 se compran a proveedores.

Allegro calcula en un Excel el costo de fabricación (materiales + mano de obra) y le vende a Plastimar con un margen. **Lo que hoy guardamos en `producto.precio_lista` es el precio de transferencia** (costo Allegro + margen), no el costo de fabricar. Eso está **correcto** desde los libros de Plastimar; el costo de fabricación nunca existió en el ERP.

Modelo real del Excel (verificado leyendo sus fórmulas):

```
costo fabricación = Σ materiales (espuma, tela, accesorios)
                  + Σ mano de obra (horas × tarifa por proceso)
        ↓ × (1 + ajuste global)        ajuste hoy = 3%
costo ajustado
        ↓ × (1 + margen de transferencia)
costo Plastimar  →  es el actual producto.precio_lista
```

Tarifas del Excel: **$4.200/hora** confección y enfundado, **$3.800/hora** corte de espuma.

> ⚠️ **El margen de transferencia NO es fijo.** Verificado sobre 6.097 filas `MK-*`: 35% en el 59%, y además 15%, 25%, 20%, 45% y 55%. **Nunca hardcodear 35%.** Es un valor por producto.

### Qué YA existe (reutilizar, no duplicar)

| Ya existe | Dónde | Estado |
|---|---|---|
| Catálogo de materias primas con `precio`, `proveedorId`, `stock`, `unidadMedida` y movimientos trazables | modelo `BodegaTaller` (schema `taller`) | **vacío (0 filas)** |
| Telas con precio, ancho, gramaje | modelo `Tela` | **vacío (0 filas)** |
| Talleres | modelo `Taller` | 4: madera, confecciones, espumas, externo |
| Consumo de materiales por ODT | `TallerMaterial`, `TallerHistorialMaterial` | en uso |
| Auditoría automática de POST/PUT/PATCH/DELETE | `plugins/audit.js` → `AuditLog` | activo |
| Motor de **precios de venta** (costo + % del proveedor) | `routes/productos/pricing.js` | activo |

**Prohibido crear un catálogo de materias primas nuevo.** Se extiende `BodegaTaller`.

### Qué falta (esto es lo que se construye)

1. Vínculo materia prima → taller (`BodegaTaller.tallerId`).
2. Tarifas de mano de obra por proceso y taller.
3. **Receta (BOM)** por producto: qué materiales, cuánto, y cuántas horas de cada proceso.
4. Motor de costeo + **congelado (snapshot)** del costo.
5. Historial de precios de materias primas.
6. UI de administración.

### Límite de responsabilidad (importante)

Este módulo calcula **el COSTO**. Los **precios de venta** los sigue calculando `pricing.js` a partir de `precio_lista`. **No duplicar la lógica de precios de venta aquí.** La salida de este módulo es `producto.precio_lista`.

---

## 2. Decisiones ya tomadas (no reabrir)

1. **Solo admin.** Ver §3.
2. **Costos congelados por snapshot.** Los precios de materias primas cambian; si el costo se recalcula siempre en vivo, los costos históricos mutan solos y no se puede explicar por qué un producto valía distinto hace tres meses. Cada cálculo que se aplica queda inmutable con los precios usados.
3. **Se extiende `BodegaTaller`**, no se crea otro catálogo.
4. **BOM genérico** (N líneas de material + N líneas de proceso), no columnas fijas de espuma/tela: el taller de madera usa otros insumos (OSB, pino, MDF, melamina).
5. **El margen de transferencia se guarda por producto.**

---

## 3. Permisos

- Módulo nuevo: **`costeo`**.
- Rutas: `fastify.rbac('costeo', 'read'|'write')` — **sin** `allowExtra: false` (ese candado es solo del módulo `admin`; usarlo haría el permiso indelegable).
- **No agregar `costeo` a ningún rol** en `middleware/rbac.js` ni en `utils/permissions.js`. Admin entra por su bypass `'*'`.
- **Sí agregarlo** a la lista `MODULOS` de `frontend/src/pages/usuarios/UsuariosPage.jsx` como `['costeo', 'Costeo de fabricación']`, para poder delegarlo a futuro sin tocar código.
- El menú y las rutas del frontend se protegen con `can(user, 'costeo', ...)`.

Justificación: el costo de fabricación expone **cuánto gana Allegro** por producto. Es información sensible entre dos empresas.

---

## 4. Modelo de datos

Todo en el schema **`taller`**, salvo lo indicado. Migraciones **idempotentes** (`IF NOT EXISTS`), una por fase.

### 4.1 Extender `BodegaTaller`

```prisma
tallerId  Int?  @map("taller_id")
taller    Taller? @relation(fields: [tallerId], references: [id], onDelete: SetNull)
@@index([tallerId])
```

### 4.2 Historial de precios de materia prima

```prisma
model BodegaTallerPrecioHistorial {
  id              Int      @id @default(autoincrement())
  bodegaTallerId  Int      @map("bodega_taller_id")
  precioAnterior  Float    @map("precio_anterior")
  precioNuevo     Float    @map("precio_nuevo")
  motivo          String?
  userId          Int?     @map("user_id")
  userNombre      String?  @map("user_nombre")
  createdAt       DateTime @default(now()) @map("created_at")
  item            BodegaTaller @relation(fields: [bodegaTallerId], references: [id], onDelete: Cascade)

  @@index([bodegaTallerId])
  @@map("bodega_taller_precio_historial")
  @@schema("taller")
}
```
Se escribe automáticamente cada vez que cambia `BodegaTaller.precio`.

### 4.3 Tarifas de mano de obra

```prisma
model TarifaProceso {
  id            Int      @id @default(autoincrement())
  tallerId      Int      @map("taller_id")
  proceso       String   // "corte", "confeccion", "enfundado", ...
  valorHora     Float    @map("valor_hora")
  vigenteDesde  DateTime @default(now()) @map("vigente_desde")
  activo        Boolean  @default(true)
  createdAt     DateTime @default(now()) @map("created_at")
  taller        Taller   @relation(fields: [tallerId], references: [id], onDelete: Cascade)

  @@unique([tallerId, proceso, vigenteDesde])
  @@index([tallerId, activo])
  @@map("tarifas_proceso")
  @@schema("taller")
}
```
La tarifa vigente es la de `vigenteDesde` más reciente con `activo = true`. Al cambiar una tarifa **no se edita la fila**: se crea una nueva vigencia (así el histórico queda intacto).

### 4.4 Receta (BOM)

```prisma
model ProductoReceta {
  id                  Int      @id @default(autoincrement())
  productoId          Int      @unique @map("producto_id")
  tallerId            Int?     @map("taller_id")
  margenTransferencia Float    @default(35) @map("margen_transferencia") // % por producto
  ajusteGlobalPct     Float    @default(0) @map("ajuste_global_pct")
  accesoriosMonto     Float    @default(0) @map("accesorios_monto")
  notas               String?
  activo              Boolean  @default(true)
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")
  producto            Producto @relation(fields: [productoId], references: [id], onDelete: Cascade)
  taller              Taller?  @relation(fields: [tallerId], references: [id], onDelete: SetNull)
  materiales          RecetaMaterial[]
  procesos            RecetaProceso[]

  @@map("producto_recetas")
  @@schema("taller")
}

model RecetaMaterial {
  id             Int     @id @default(autoincrement())
  recetaId       Int     @map("receta_id")
  bodegaTallerId Int?    @map("bodega_taller_id")
  telaId         Int?    @map("tela_id")
  cantidad       Float
  unidad         String?
  notas          String?
  receta         ProductoReceta @relation(fields: [recetaId], references: [id], onDelete: Cascade)
  material       BodegaTaller?  @relation(fields: [bodegaTallerId], references: [id], onDelete: Restrict)
  tela           Tela?          @relation(fields: [telaId], references: [id], onDelete: Restrict)

  @@index([recetaId])
  @@map("receta_materiales")
  @@schema("taller")
}

model RecetaProceso {
  id       Int    @id @default(autoincrement())
  recetaId Int    @map("receta_id")
  tallerId Int    @map("taller_id")
  proceso  String
  horas    Float
  receta   ProductoReceta @relation(fields: [recetaId], references: [id], onDelete: Cascade)
  taller   Taller         @relation(fields: [tallerId], references: [id], onDelete: Restrict)

  @@index([recetaId])
  @@map("receta_procesos")
  @@schema("taller")
}
```

Reglas:
- `RecetaMaterial` debe tener **exactamente uno** de `bodegaTallerId` / `telaId`. Validar en el backend (400 si vienen ambos o ninguno).
- `onDelete: Restrict` en material/tela/taller: no se puede borrar una materia prima usada en una receta.

> **Relaciones inversas (si no, `prisma generate` falla).** Agregar en los modelos existentes:
> - `Producto`: `receta ProductoReceta?` y `costeoSnapshots CosteoSnapshot[]`
> - `Taller`: `materiales BodegaTaller[]`, `tarifas TarifaProceso[]`, `recetas ProductoReceta[]`, `recetaProcesos RecetaProceso[]`
> - `BodegaTaller`: `recetaLineas RecetaMaterial[]` y `precioHistorial BodegaTallerPrecioHistorial[]`
> - `Tela`: `recetaLineas RecetaMaterial[]`

### 4.5 Snapshot de costeo (el registro)

```prisma
model CosteoSnapshot {
  id                  Int      @id @default(autoincrement())
  productoId          Int      @map("producto_id")
  costoMateriales     Float    @map("costo_materiales")
  costoManoObra       Float    @map("costo_mano_obra")
  costoAccesorios     Float    @map("costo_accesorios")
  costoFabricacion    Float    @map("costo_fabricacion")
  ajusteGlobalPct     Float    @map("ajuste_global_pct")
  costoAjustado       Float    @map("costo_ajustado")
  margenTransferencia Float    @map("margen_transferencia")
  costoTransferencia  Float    @map("costo_transferencia")
  precioListaAnterior Float?   @map("precio_lista_anterior")
  aplicado            Boolean  @default(false)
  detalle             Json     // líneas con precio unitario y tarifa usados
  userId              Int?     @map("user_id")
  userNombre          String?  @map("user_nombre")
  createdAt           DateTime @default(now()) @map("created_at")
  producto            Producto @relation(fields: [productoId], references: [id], onDelete: Cascade)

  @@index([productoId, createdAt])
  @@map("costeo_snapshots")
  @@schema("taller")
}
```

**Inmutable**: no se expone update ni delete. `detalle` guarda cada línea con el precio/tarifa exactos usados, para poder reconstruir el cálculo aunque después cambien los precios.

---

## 5. Motor de cálculo

Archivo nuevo: **`backend/src/routes/costeo/engine.js`**.

Exportar una **función pura** (sin Prisma, sin I/O) para poder testearla sin base de datos:

```js
export function calcularCosteo({ materiales, procesos, accesoriosMonto, ajusteGlobalPct, margenTransferencia })
```

- `materiales`: `[{ cantidad, precioUnitario, nombre, unidad }]`
- `procesos`: `[{ horas, valorHora, proceso }]`

Fórmula (espeja el Excel):

```
costoMateriales   = Σ (cantidad × precioUnitario)
costoManoObra     = Σ (horas × valorHora)
costoFabricacion  = costoMateriales + costoManoObra + accesoriosMonto
costoAjustado     = costoFabricacion × (1 + ajusteGlobalPct/100)
costoTransferencia= costoAjustado    × (1 + margenTransferencia/100)
```

Reglas:
- Redondear **solo al final** de cada uno de los 3 escalones (`costoFabricacion`, `costoAjustado`, `costoTransferencia`) con `Math.round`. No redondear línea por línea.
- Entradas nulas/negativas → tratar como 0, nunca `NaN`.
- Devolver también `detalle` con las líneas y los valores usados.

La capa de servicio (`service.js`) resuelve desde la BD el precio vigente de cada material (`BodegaTaller.precio` o `Tela.precio`) y la tarifa vigente de cada proceso, y se los pasa al motor.

---

## 6. Endpoints

Base **`/api/costeo`**, registrar en `app.js` siguiendo el patrón de los demás módulos.
`readAuth = [fastify.authenticate, fastify.rbac('costeo','read')]`, `writeAuth` con `'write'`.

### Materias primas (extiende lo existente)
- `GET /api/bodega-taller?tallerId=` — agregar el filtro por taller al endpoint existente. **No crear uno nuevo.**
- Al cambiar `precio` en `PUT /api/bodega-taller/:id`, escribir `BodegaTallerPrecioHistorial` en la misma transacción.
- `GET /api/costeo/materiales/:id/historial-precios` — historial.

### Tarifas
- `GET /api/costeo/tarifas?tallerId=` — vigentes (o `?historico=1` para todas).
- `POST /api/costeo/tarifas` — crea nueva vigencia.
- `DELETE /api/costeo/tarifas/:id` — desactiva (`activo=false`), no borra.

### Recetas
- `GET /api/costeo/recetas?tallerId=&conReceta=` — listado paginado de productos con estado de receta.
- `GET /api/costeo/recetas/:productoId` — receta + último snapshot.
- `PUT /api/costeo/recetas/:productoId` — crea/actualiza cabecera + líneas (reemplazo completo, en transacción).
- `DELETE /api/costeo/recetas/:productoId` — desactiva.

### Costeo
- `POST /api/costeo/recetas/:productoId/calcular` — **simulación**, no persiste. Devuelve el desglose completo. Es la vista previa.
- `POST /api/costeo/recetas/:productoId/aplicar` — en **una transacción**: crea `CosteoSnapshot` (`aplicado=true`, guardando `precioListaAnterior`) y actualiza `producto.precioLista = costoTransferencia`.
- `GET /api/costeo/snapshots?productoId=` — historial.
- `POST /api/costeo/recalcular-masivo` — body `{ tallerId?, productoIds?, aplicar: boolean }`. Con `aplicar:false` devuelve el informe de qué cambiaría (obligatorio antes de aplicar). Máximo 500 productos por llamada.

Errores de validación → `400` con `{ error: 'mensaje claro en español' }`.

---

## 7. Frontend

Página nueva `frontend/src/pages/costeo/` con pestañas (patrón `Tabs` de `components/shared`):

1. **Materias primas** — tabla con filtro por taller, alta/edición inline, columna precio con acceso al historial. Reutilizar la página `BodegaTallerPage` existente si es viable; si no, extraer el listado a un componente compartido. **No duplicar el CRUD.**
2. **Tarifas** — por taller y proceso, con valor hora e histórico de vigencias.
3. **Recetas** — listado de productos con badge de estado (con/sin receta, costeado/desactualizado) y editor de receta.

**Editor de receta** (lo central):
- Selector de taller.
- Líneas de material: selector con autocomplete (materias primas + telas), cantidad, unidad. El precio unitario se muestra **solo lectura**, traído del catálogo.
- Líneas de proceso: proceso, horas; el valor hora se muestra solo lectura desde la tarifa vigente.
- Monto de accesorios, ajuste global %, margen de transferencia %.
- **Panel de resultado en vivo** (llama a `/calcular`): materiales, mano de obra, accesorios, costo fabricación, costo ajustado, **costo transferencia**, y comparación contra el `precio_lista` actual con la diferencia en $ y %.
- Botón **"Aplicar a precio costo"** con confirmación que muestre el antes/después. Usar `confirmDialog` de `store/notif` (no `window.confirm`).

**Ficha de producto** (`BodegaFormPage`): si el producto tiene receta, mostrar un panel **solo lectura** con el desglose del costo y un link a la receta. Respeta lo ya definido: el costo no se edita a mano.

Menú: entrada "Costeo de fabricación" visible solo con `can(user,'costeo','read')`.

Verificar que los iconos usados existan en `components/shared/index.jsx` (`alertCircle` e `inbox` **no** existen).

---

## 8. Importación desde el Excel

Script **`backend/scripts/import-costeo-excel.mjs`**. Requiere `xlsx@0.18.5` como devDependency (`exceljs` **no** lee `.xls` binario).

Modo **dry-run por defecto**, `--apply` para escribir. Siempre imprimir resumen y ejemplos antes/después.

Origen: `NUEVOS CALCULOS_PRECIOS_MK_14-07-2026.xls`, hoja `MK`, encabezados en la **fila 10**, datos desde la **fila 11**.

Mapeo de columnas:

| Col | Contenido | Destino |
|---|---|---|
| C | código | match con `producto.codigo_interno` (96% calza) |
| H | nombre producto | referencia |
| O, P, Q | densidad, cubicaje y valor lámina espuma | material espuma |
| V | valor total set espuma | validación |
| X, Y, AA | metros, valor metro, tipo de tela | línea de tela |
| AB | horas corte espuma | proceso "corte" |
| AD | horas confección | proceso "confeccion" |
| AF | horas enfundado | proceso "enfundado" |
| AI | accesorios monto | `accesoriosMonto` |
| AK | costo fabricación (calculado en Excel) | **validación** contra nuestro motor |
| AN | costo ajustado | validación / `precio_lista` |

El **margen de transferencia por producto** se extrae del **porcentaje literal de la fórmula de la columna AN** de esa fila (`=+AL11*20%+AL11` → 20). Si no se puede extraer, dejar 35 y **reportarlo en la lista de excepciones**.

Sub-fases:
1. `--materias-primas`: cargar `BodegaTaller` desde las filas 1-9 de `MK` (OSB, pino, MDF, melamina, tornillos, algodón $3.070, picado $3.330, NAPA $2.193, plumavit $4.905...) y las hojas `Espuma` y `Aglomerado`. Asignar `tallerId` según corresponda (espumas / madera).
2. `--tarifas`: crear tarifas $4.200 (confección, enfundado) y $3.800 (corte espuma).
3. `--recetas`: crear las recetas de los productos `MK-*`.

**Validación obligatoria:** tras importar, comparar el costo calculado por nuestro motor contra la columna AK del Excel. Reportar cuántos calzan (tolerancia ±2 pesos) y listar los 20 mayores desvíos. **Si calza menos del 90%, detenerse y reportar** — significa que el mapeo está mal.

> El script **nunca** debe modificar `producto.precio_lista` directamente. Los precios solo cambian por el endpoint `/aplicar`, que deja snapshot.

---

## 9. Pruebas (obligatorias)

Patrón existente (`backend/test/categorias-bodega-taller.test.js`): `buildApp` + `app.inject`, token con `app.jwt.sign({ id, role, scope:'erp', aud:'plastimar:erp', tokenType:'access' })`. Cada suite limpia sus propios datos con un `marker` único.

### 9.1 `test/costeo-engine.test.js` — sin base de datos
1. Caso del Excel MK-46B: materiales + HH + accesorios → verificar `costoFabricacion`, `costoAjustado` y `costoTransferencia`.
2. Margen 35% y margen 15% sobre el mismo costo dan resultados distintos y correctos.
3. Receta vacía → todo 0, sin `NaN`.
4. Cantidades o precios nulos/negativos → 0, sin `NaN`.
5. Redondeo: se redondea solo en los 3 escalones, no por línea.
6. `ajusteGlobalPct = 0` → `costoAjustado === costoFabricacion`.

### 9.2 `test/costeo-routes.test.js` — con base de datos
7. `PUT /recetas/:id` crea receta con materiales y procesos; `GET` la devuelve completa.
8. `PUT` reemplaza líneas (no duplica) al guardar dos veces.
9. Línea con `bodegaTallerId` **y** `telaId` → 400. Sin ninguno → 400.
10. `POST /calcular` **no** persiste: `precio_lista` y la cantidad de snapshots quedan igual.
11. `POST /aplicar` crea snapshot con `aplicado=true`, guarda `precioListaAnterior` y actualiza `precio_lista`.
12. **Inmutabilidad**: cambiar el precio de una materia prima **después** de aplicar no altera el snapshot ya guardado.
13. Usar la tarifa vigente más reciente; una tarifa nueva no cambia snapshots anteriores.
14. No se puede eliminar una materia prima usada en una receta (`Restrict`).
15. Cambiar `BodegaTaller.precio` escribe una fila en el historial de precios.
16. `POST /recalcular-masivo` con `aplicar:false` no modifica nada y devuelve el informe.

### 9.3 Permisos
17. Sin token → 401.
18. Rol `vendedor` sin permiso extra → 403 en read y en write.
19. Rol `admin` → 200 (bypass).
20. Rol `vendedor` **con** `permisosExtra: { costeo: ['read'] }` → 200 en read y **403 en write** (comprueba que no se usó `allowExtra:false`).

### 9.4 Regresión
21. `npm run test:ci` completo en verde. **No romper ninguna suite existente.**
22. `npm run build` del frontend sin errores.

---

## 10. Registro y trazabilidad

1. **Automático**: el plugin `audit.js` ya registra POST/PUT/PATCH/DELETE en `AuditLog`. Verificar que las rutas nuevas queden registradas con `entity` legible (`costeo_receta`, `costeo_tarifa`).
2. **De dominio**: `CosteoSnapshot` es el registro inmutable de cada costo aplicado — quién, cuándo, con qué precios y qué valor tenía antes.
3. **De precios**: `BodegaTallerPrecioHistorial` registra cada cambio de precio de materia prima.
4. Todo cambio de `precio_lista` hecho por este módulo **debe** tener su snapshot. No actualizar `precio_lista` por fuera de `/aplicar`.

---

## 11. Fases de ejecución

Cada fase termina con: migración aplicada, tests de la fase en verde y `npm run test:ci` sin regresiones.

| # | Fase | Entregable |
|---|---|---|
| 1 | Base de datos | Migraciones idempotentes de §4 + `prisma generate`. Sin cambios de comportamiento. |
| 2 | Motor + tests | `engine.js` + `costeo-engine.test.js` (casos 1-6) en verde. |
| 3 | API | Endpoints de §6 + `costeo-routes.test.js` (casos 7-20) en verde. |
| 4 | Frontend | Pestañas, editor de receta y panel en la ficha de producto. Build en verde. |
| 5 | Importador | `import-costeo-excel.mjs` con dry-run y validación contra la columna AK. **No ejecutar `--apply` contra producción.** |
| 6 | Cierre | Informe de §12. |

---

## 12. Informe final (dejar en `docs/INFORME_COSTEO_<fecha>.md`)

1. Qué se construyó, archivo por archivo.
2. Resultado de los tests: cuántos pasan, cuántos fallan y **por qué** (sin ocultar fallos).
3. Resultado del dry-run del importador: productos que calzan, % de coincidencia contra la columna AK del Excel, y los 20 mayores desvíos.
4. Decisiones que tomaste y no estaban en este plan, con su justificación.
5. Lo que quedó pendiente o no funcionó.

---

## 13. Reglas de trabajo (leer, ya nos costó caro antes)

1. **Verificar contra el código real antes de construir.** Ya se construyó un módulo `OrdenTransporte` completo (modelo + rutas + tests + UI) que hubo que revertir entero porque duplicaba `Despacho`. Antes de crear cualquier modelo, revisar si ya existe.
2. **No duplicar el catálogo de materias primas** — `BodegaTaller` existe.
3. **No hardcodear 35%.** El margen varía por producto.
4. **No tocar datos de producción.** El importador corre en dry-run; `--apply` lo decide el usuario.
5. **Migraciones idempotentes** (`IF NOT EXISTS`). Toda tabla nace por migración, nunca a mano.
6. **No usar `allowExtra: false`** en las rutas de `costeo`.
7. **No usar `window.alert/confirm/prompt`** en el frontend: usar `toast` y `confirmDialog` de `store/notif`.
8. **Reportar los fallos como son.** Si un test falla, decirlo con su salida. No marcar como completo algo que no verificaste ejecutándolo.
9. Si algo de este plan choca con el código real, **detenerse y reportarlo** en vez de improvisar una solución que después haya que revertir.

---

## Anexo — datos verificados

- Productos activos: **34.561** (2.848 con código `MK-*`, 31.713 comprados).
- Códigos del Excel que calzan con `codigo_interno`: **2.637 de 2.741 (96%)**.
- Estado actual vs Excel: 738 calzan, 1.658 el ERP quedó bajo, 240 sobre.
- `BodegaTaller`: **0 filas**. `Tela`: **0 filas**. Talleres: 4.
- `producto.tiempo_teorico` y `producto.taller_id`: **0 productos** poblados.
- Materias primas del print del usuario: algodón (Kg) **$3.070**, picado **$3.330**, NAPA **$2.193**, plumavit (x kg) **$4.905**.
