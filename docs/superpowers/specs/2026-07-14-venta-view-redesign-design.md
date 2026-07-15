# Vista de Venta (sala/web/convenio marco) — Rediseño de layout y acciones — Diseño

Fecha: 2026-07-14
Estado: aprobado, pendiente de implementación
Sub-proyecto A de 2 (B = vista de licitación, con sus acciones propias — multas, ficha
técnica, ver cotización — se diseña después, reutilizando los patrones de este documento)

## Contexto

El ERP legacy PHP (`D:\downloads\backup-plastimar.cl-4-27-2026\public_html\sisgestion`)
tenía una pantalla de "ver venta" (`venta_directa/venta.php`, `convenio_marco/venta.php`)
con un layout y un set de acciones que el usuario extraña — el rebuild React actual
(`frontend/src/components/forms/ViewVentaPanel.jsx`, usado vía
`frontend/src/pages/ventas/VentaDetallePage.jsx` con `variant="page"`) lo simplificó a
tabs (Detalle/Taller/Pagos/Documentos) y perdió acciones que existían en el original:
notificar a taller como acción explícita, anular venta, nota de venta impresa, agregar
producto por código de barra/interno directo en la pantalla, y el total mostrado grande y
prominente arriba.

Investigación del original confirmó exactamente cómo era (ver hallazgos abajo). La buena
noticia: **casi todo lo que falta ya existe en el backend actual**, disperso o sin usar
desde el frontend — este proyecto es mayormente conectar/reorganizar, no construir de
cero.

## Hallazgos del legacy (verificados leyendo el código real)

**Layout:** 2 columnas Bootstrap, `col-md-3` (izquierda, angosta) + `col-md-9` (derecha,
ancha).

**Columna izquierda:** panel "ATENDIDO POR" (Ejecutivo + Fecha), panel "INGRESA
PRODUCTO..." (solo si `estado_pago='No pagada'` y `estado='Activa'`: input código de
barra + input código interno + cantidad, autofocus, validación AJAX en vivo de
existencia/stock), panel "OPERACIONES DISPONIBLES" (botones grandes en bloque: ODTs (n°),
Guías Despachos (n°), Nota Venta, Notificar a taller, Emitir documento de pago [solo si no
pagada+activa], ANULAR TODA LA VENTA), y lista "Documentos Emitidos".

**Columna derecha:** datos del cliente (editables inline), tabla de productos, cascada de
totales (neto, IVA, total, abono, NC, ND, saldo), Ref. Orden de Compra + Observaciones, y
un total flotante `position:absolute; top:0; right:0; width:400px; height:50px;
background:#939; color:#fff; font-size:36px` con "TOTAL $ X".

## Backend: cero cambios necesarios

Verificado que todo lo necesario ya existe:
- `POST /api/ventas/:id/anular` (`backend/src/routes/ventas/cargos.js:129`) — anulación
  soft ya implementada (revierte stock, marca `eliminada`), con hook frontend
  `useAnularVenta` ya en `api/ventas.js` (usado hoy solo en `MatrizVentasPage.jsx` y
  `VentasFormPage.jsx`, no en `ViewVentaPanel`).
- `POST /api/ventas/:id/forzar-taller` → función `autoNotifyTaller` — esto YA ES
  "notificar a taller" (mismo concepto que el legacy `pasar_taller/index`), con hook
  `useForzarTaller` ya usado en `ViewVentaPanel` bajo el label "Gatillar Taller / ODT"
  (solo falta relabeleo).
- `GET /api/productos?codigoBarra=X` (match exacto) y `?codigoInterno=X` (contains) —
  `backend/src/routes/productos/list.js:136-137` — listos para el widget de agregar
  rápido.
- `PUT /api/ventas/:id` con array `items` completo — mismo patrón que ya usa
  `VentasFormPage.jsx` para agregar productos por búsqueda. Bloquea el reemplazo de items
  si ya hay entregas o pagos registrados (`update.js:188,195`) — coincide exactamente con
  la condición del legacy (`No pagada` + `Activa`), no requiere cambio.
- Flujo DTE (`Emitir DTE`) ya construido y probado — reemplaza al legacy "Emitir
  documento de pago" (que abría un menú Boleta/Factura manual, ya obsoleto).

**"Nota de Venta" confirmado sin trabajo nuevo:** `VentaPrintPage.jsx`
(`/ventas/:id/imprimir`, auto-imprime con `window.print()` al cargar, mismo patrón que
`LicitacionFichaPage.jsx`) ya es la nota de venta — su header dice "Nota de venta
interna". Ya está wireado hoy detrás del botón "Imprimir"; el rediseño solo lo mueve al
panel de Operaciones Disponibles con el label "Nota de Venta", sin lógica nueva.

## Alcance: solo `variant="page"`

`ViewVentaPanel` tiene un `variant="drawer"` que hoy no usa ninguna página (`grep` en
`frontend/src/pages` solo encuentra `VentaDetallePage.jsx` con `variant="page"`). Este
rediseño toca únicamente la rama `variant === 'page'`; la rama `drawer` queda intacta tal
cual está (sin uso actual, no vale la pena rediseñarla ahora).

## Nuevo layout de `ViewVentaPanel` (variant="page")

Reemplaza el sistema de tabs (Detalle/Taller/Pagos/Documentos) por 2 columnas fijas,
sin tabs.

### Columna izquierda (~340px fijo, `flexShrink: 0`)

1. **Card Ejecutivo + Fecha** — `v.creadorNombre`, `v.createdAt` formateado (ya
   disponibles, ya calculados como `fecha` en el componente actual).
2. **Widget "Agregar producto"** — visible solo si `v.estadoPago === 'No pagada' &&
   v.estado === 'Activa'` (misma condición que el legacy). Dos inputs (código de barra,
   código interno) + cantidad, autofocus en código de barra. `onChange`/`onBlur` dispara
   `useProductos({ codigoBarra: valor })` o `{ codigoInterno: valor }`; si encuentra
   coincidencia exacta, arma el nuevo item y hace `PUT /ventas/:id` con
   `items: [...current.items, nuevoItem]` (mismo mapeo `productoId`/`cantidad`/
   `precioUnitario` que usa `VentasFormPage.jsx`). Mensaje de error inline si no existe o
   no hay stock (igual intención que las validaciones AJAX del legacy, pero simple
   `toast.error`, no necesita ser tan elaborado).
3. **Operaciones Disponibles** — botones en bloque (ancho completo, apilados):
   - **ODTs (n°)** → navega a `/taller?ordenId=X` (o el filtro equivalente que ya soporte
     el módulo Taller)
   - **Guías Despachos (n°)** → navega a `/despachos?ordenId=X` (reusa
     `handleCreateDespacho`/lógica ya existente, ajustada para mostrar conteo)
   - **Nota de Venta** → abre `/ventas/:id/imprimir` en popup (reusa lo que ya hace el
     botón "Imprimir" actual)
   - **Notificar a Taller** → `useForzarTaller` (ya existe, solo relabel)
   - **Emitir DTE** → `EmitirDteModal` (ya existe, sin cambios)
   - **Anular Venta** → nuevo wiring a `useAnularVenta`, botón rojo, con
     `confirmDialog` antes de ejecutar, solo visible si `!v.eliminada` y
     `can(user,'ventas','delete')`
4. **Documentos Emitidos + Pagos** — contenido actual de `TabDocumentos` y `TabPagos`
   fusionado en una lista compacta inline (no tab), mismo componente/lógica interna,
   solo removido el wrapper de tab.

### Columna derecha (flexible, `flex: 1`)

1. **Total grande** — chip/banner prominente arriba a la derecha del panel, paleta verde
   del ERP actual (`var(--green-900)` fondo, texto blanco, ~28-32px), mismo peso visual
   que el original pero sin el estilo Bootstrap viejo.
2. **Cliente** — igual que el `TabDetalle` actual (sin cambios de contenido).
3. **Tabla de productos** — igual que hoy, evaluar agregar columna de foto miniatura
   (`item.producto?.fotoUrl`) si existe, ya que el legacy la tenía y el modelo Producto ya
   soporta `fotoUrl`.
4. **Resumen financiero** — igual que hoy (sin cambios de contenido).

## Fuera de alcance (recordatorio)

- Vista de licitación (sub-proyecto B) — acciones propias (Ver Cotización, Ficha Técnica
  y Económica, Ingresar Multa) se diseñan en un spec aparte, reutilizando este layout.
- `variant="drawer"` de `ViewVentaPanel` — sin uso actual, no se toca.
- Edición inline de datos del cliente en la vista (el legacy lo permitía ahí mismo) — se
  mantiene el flujo actual (ir a Editar) salvo que surja como bloqueante al implementar.
- Backend: ningún cambio, todo lo enumerado en "Backend: cero cambios necesarios" ya
  existe y se reutiliza tal cual.

## Testing

Mismo criterio que las rondas anteriores de facturación: no hay convención de tests de
componentes React en este proyecto, no se introduce infraestructura nueva. Verificación
manual: abrir una venta sala activa/no pagada y confirmar que aparece el widget de agregar
producto; agregar un producto por código interno y confirmar que se suma a la tabla y al
total; anular una venta de prueba y confirmar que revierte stock y bloquea nuevas
acciones; confirmar que Notificar a Taller, Nota de Venta y Emitir DTE disparan los mismos
flujos que ya existen. Backend no se toca — correr la suite igual
(`DATABASE_URL=...plastimar_test npx vitest run`) para confirmar 573/573 sin regresión.
