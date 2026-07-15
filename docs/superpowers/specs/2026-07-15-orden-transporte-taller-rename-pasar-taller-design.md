# Orden de Transporte + Rename visible ODT + Rediseño Pasar a Taller — Diseño

Fecha: 2026-07-15
Estado: aprobado, pendiente de implementación (vía Codex)

## Contexto

El dueño del negocio corrigió terminología crítica: "ODT" en su vocabulario real
significa **Orden de Transporte** (courier + fecha + n° de seguimiento), no lo que el
sistema nuevo llama `Odt` en el modelo de datos. Investigación del legacy PHP
(`D:\downloads\backup-plastimar.cl-4-27-2026\public_html\sisgestion`) confirmó tres
conceptos legacy distintos:

1. **`odts`** (tabla legacy simple: `n_interno, odt, fecha, transporte, user, fecham`) —
   la Orden de Transporte real. **Nunca se portó** al sistema nuevo.
2. **`guias_despachos`** (`n_interno, n_guia, fecha_guia, origen`) — ya portado
   correctamente como `GuiaDespacho`.
3. **`taller` + `productos_taller`** (header OT + items con 3 flags de taller
   Confecciones/Espumas/Externo cada uno con su propio estado/obs) — esto es lo que el
   sistema nuevo porteó y **nombró `Odt`/`OdtItem`/`OdtItemTaller`** — un error de
   nombre que choca con el significado real de "ODT" para el negocio.

Vista legacy de referencia para "Pasar a Taller"
(`sisgestion/pasar_taller/index.php`): layout 2 columnas — izquierda `col-md-5`
"PRODUCTOS PARA ENVIAR A TALLER" (productos transitorios pendientes, checkbox por
taller + obs por producto, botón enviar por producto), derecha `col-md-7` "OT TALLER
N°X" (resumen fecha ingreso/inicio/término + estado + prioridad + obs general, tabla de
productos ya en el taller con su estado por taller). Formulario aparte para
prioridad+obs general de la OT completa.

## Alcance: 3 piezas independientes, un solo plan de implementación

Decisión explícita del dueño: **no** renombrar el modelo/tabla `Odt` en la base de
datos (migración de alto riesgo, ~25 archivos backend/frontend, cero beneficio real ya
que nadie fuera del código ve ese nombre). Solo se corrige el texto visible en pantalla.

### Pieza 1 — Orden de Transporte (nueva)

**Backend:**
- Nuevo modelo Prisma `OrdenTransporte` (schema `ventas`, junto a `Orden`):
  `id Int @id @default(autoincrement())`, `ordenId Int` (FK a `Orden`, `onDelete:
  Cascade`), `numero String`, `fecha DateTime`, `transportista String`, `usuario
  String?`, `createdAt DateTime @default(now())`. Índice en `ordenId`.
- Migración Prisma nueva (`add_orden_transporte`).
- Rutas nuevas en `backend/src/routes/ventas/` (archivo nuevo
  `orden-transporte.js`, registrado en `index.js`):
  - `GET /api/ventas/:id/ordenes-transporte` — lista por `ordenId`, `readAuth`
    (`ventas`, `read`).
  - `POST /api/ventas/:id/ordenes-transporte` — body `{ numero, fecha, transportista }`,
    todos requeridos (zod), `writeAuth` (`ventas`, `write`). `usuario` se toma de
    `request.user.nombre`.
  - `DELETE /api/ventas/ordenes-transporte/:id` — `writeAuth`.
  - Incluir `ordenesTransporte` en el `Promise.all` de `GET /ventas/:id`
    (`backend/src/routes/ventas/get.js`), igual patrón que `guias`.

**Frontend:**
- `frontend/src/api/ventas.js`: `useOrdenesTransporte(ordenId)`,
  `useCrearOrdenTransporte()`, `useDeleteOrdenTransporte()` (mismo patrón TanStack
  Query que el resto del archivo).
- Nuevo componente `OrdenTransporteModal` en `ViewVentaPanel.jsx` (mismo patrón visual
  que `EmitirDteModal`/`NotaDteModal` en `components/facturacion/DteModals.jsx`):
  input texto número, `<input type="date">` fecha, `<select>` transportista con las
  opciones legacy exactas (`Pullman cargo, Starken, Correos de chile, Chilexpress,
  Bluexpress, Varmontt, Transporte JT, Transporte Espinoza, Don Carlos, Otro`), lista de
  las ya creadas con botón borrar (`confirmDialog`).
- `OperacionesDisponibles`: nuevo botón "Orden de Transporte (n°)" (ícono `truck`,
  color distinto al de Guías Despachos para no confundir visualmente — usar
  `var(--blue)`), abre el modal. Conteo = `ordenesTransporte.length`.

### Pieza 2 — Rename solo visible (sin tocar modelo/tabla)

Barrido de texto en frontend únicamente. Buscar todas las ocurrencias de "ODT" como
palabra suelta en JSX/strings visibles al usuario (labels, botones, breadcrumbs,
títulos de página, badges) en `frontend/src/pages/taller/**` y cualquier otro lugar que
renderice el texto "ODT" sin calificar. Reemplazar por "Orden de Taller" o "OT Taller"
según contexto (título largo → "Orden de Taller"; badge/conteo corto → "OT"). **No
tocar**: nombres de archivo, nombres de componente, nombres de variable, imports,
rutas de API, nombres de columnas/tablas — todo eso queda `Odt`/`odt` internamente, es
invisible para el usuario.

### Pieza 3 — Rediseño "Pasar a Taller" (página nueva, 2 columnas)

**Backend — nuevos endpoints reutilizando el service existente
(`backend/src/routes/pasar-taller/service.js`, ya tiene `ensureOdt`, `upsertOdtItem`,
`isProductoTransitorio`, `resolveTallerIdsFromItem`):**
- `GET /api/ventas/:id/taller-pendientes` — devuelve los items de la venta donde
  `producto.estadoInventario === 'Transitorio'` (case-insensitive, mismo criterio que
  `isProductoTransitorio`) y `item.nEntregados < item.cantidad`, más el estado actual
  del `Odt`/`OdtItem` de esta venta si ya existe (para saber cuáles ya se enviaron a
  qué taller y no re-mostrarlos como "pendientes" salvo que se quiera reenviar).
- `POST /api/ventas/:id/taller-pendientes/:itemId/enviar` — body `{ tallerIds:
  number[], obs: string }` — usa `ensureOdt` (crea la OT si no existe, con
  `prioridad:'normal'` inicial) + `upsertOdtItem` para ESE item específico con los
  talleres marcados y su observación propia. `autoNotifyTaller` (el heurístico
  automático) **no se toca** — sigue corriendo solo, sin intervención del usuario, cada
  vez que se crea/edita una venta (`create.js`/`update.js` ya lo invocan
  automáticamente); es independiente de esta pantalla manual, no un fallback de ella.
- `PUT /api/ventas/:id/taller-obs-prioridad` — body `{ prioridad: 'normal'|'alta'|
  'urgente', obsGeneral: string }` — actualiza (o crea vía `ensureOdt`) el header de la
  OT de esta venta.

**Frontend — página nueva `frontend/src/pages/taller/PasarTallerVentaPage.jsx`, ruta
`/taller/notificar?ordenId=X`:**
- Layout 2 columnas (`display:grid; gridTemplateColumns: '5fr 7fr'`, igual proporción
  que legacy `col-md-5`/`col-md-7`).
- Izquierda "Productos para enviar a taller": tabla con checkboxes Confecciones/
  Espumas/Externo por fila + textarea obs + botón enviar por fila (llama al endpoint
  `enviar` de esa fila específica, no un submit global).
- Derecha "OT Taller N°{nInterno}": card resumen (fecha ingreso, estado, prioridad,
  obs general) + formulario prioridad (Select normal/alta/urgente, igual a
  `TallerFormPage.jsx`) + obs general (Textarea) + botón "Notificar Obs./Prioridad" +
  tabla de `OdtItem` ya enviados con su estado por taller (reutiliza el cruce
  `productoId → estado` que ya construí en `ViewVentaPanel.jsx`, extraído a un helper
  compartido si aplica).
- En `ViewVentaPanel.jsx`, el botón "Notificar a Taller" cambia de
  `navigate('/taller/nueva?ordenId=X')` a `navigate('/taller/notificar?ordenId=X')`.

## Fuera de alcance

- Rename de modelo/tabla en base de datos (decisión explícita, ver arriba).
- Cambios al flujo automático `autoNotifyTaller` en sí (se mantiene como está,
  disponible para quien lo use vía la API existente).
- Edición/anulación de una Orden de Transporte ya creada (legacy tampoco lo tenía,
  solo crear/borrar).

## Testing

Backend: tests nuevos siguiendo el patrón ya usado en `test/ventas.test.js` para las
rutas de `OrdenTransporte` y los 2 endpoints nuevos de `taller-pendientes`, con DB real
(no mocks). Frontend: sin infraestructura de tests de componentes (convención ya
establecida en este proyecto) — verificación manual documentada en el plan.
