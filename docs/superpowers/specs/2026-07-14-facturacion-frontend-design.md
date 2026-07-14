# Facturación Electrónica (DTE/SII) — Frontend — Diseño

Fecha: 2026-07-14
Estado: aprobado, pendiente de implementación (vía Codex, no subagent-driven-development)
Depende de: `docs/superpowers/specs/2026-07-14-facturacion-dte-design.md` (backend, rama
`feature/facturacion-dte-backend`, PR abierto)

## Contexto

El backend de facturación electrónica (`/api/facturacion/*`) ya está implementado,
testeado (41/41 tests, suite completa 571/572) y revisado en la rama
`feature/facturacion-dte-backend`. Este documento diseña el frontend: cómo un usuario
de Plastimar ERP v2 emite una factura/boleta desde una venta, corrige/anula con NC/ND,
emite una guía de despacho electrónica, y ve el listado de documentos emitidos.

**Fuera de alcance esta ronda:** pantalla de Configuración (subir certificado .p12 y
CAFs desde la UI) — se sigue usando curl/Postman directo contra la API mientras tanto.

## Patrones existentes a seguir (ya explorados en el código real)

- **Acciones rápidas:** `frontend/src/components/forms/ViewVentaPanel.jsx:194-244` ya
  tiene una sección `<FormDivider label="Acciones rápidas" />` con botones tipo
  "Crear Despacho" / "Gatillar Taller / ODT" (ícono + texto, flex wrap, colores
  `var(--blue)`/`var(--amber)`, deshabilitados con `disabled`+`isPending`). El nuevo
  botón "Emitir DTE" sigue exactamente este patrón visual.
- **Tabs de venta:** `ViewVentaPanel.jsx` tiene tabs Detalle/Taller/Pagos/Documentos
  (líneas 489-494). El tab "Documentos" (343-419) ya existe — ahí van los DTEs emitidos
  de esa venta con sus acciones NC/ND.
- **API con TanStack Query:** `frontend/src/api/ventas.js` es la referencia — `useQuery`
  para lecturas (`useVentas`, `useVenta`), `useMutation` con `queryClient.invalidateQueries`
  en `onSuccess` para escrituras. Cliente axios en `frontend/src/api/client.js`
  (interceptor de token + refresh automático en 401).
- **Navegación:** `frontend/src/components/TopBar.jsx:10-62` define `NAV_GROUPS`, un
  array de `{ label, items: [{ label, route, module, permission?, roles? }] }`. Agregar
  grupo "Facturación" ahí.
- **Router:** `frontend/src/router.jsx` — rutas protegidas via `protect(<Componente/>,
  { module, permission })`.
- **Lista con filtros:** `frontend/src/pages/ventas/VentasPage.jsx` es la referencia —
  tabs de filtro por estado, búsqueda debounced (400ms), paginación en state, tabla con
  columnas `{ key, label, render, align }`.
- **Guías de despacho:** `frontend/src/pages/despachos/DespachosPage.jsx` tiene un tab
  `guias` (línea 13) con tabla `colsGuia` (línea 339: fechaGuia, nGuia, + botones
  Editar/Borrar por fila vía `linkButton(...)`, líneas 348-349). El nuevo botón
  "Emitir DTE" va ahí, mismo estilo `linkButton`.
- **RBAC:** el backend ya gatea todo bajo el recurso `facturacion` (`read`/`write`,
  `allowExtra: false`, hoy solo `admin` per `middleware/rbac.js` — ver nota en el spec
  de backend). El frontend debe ocultar/deshabilitar los botones nuevos si
  `can(user, 'facturacion', 'write')` es `false` (mismo patrón `canWrite`/`canDelete`
  que ya usa `ViewVentaPanel.jsx`), no solo confiar en que la API los rechace.

## Mapeo de datos: Venta → Documento DTE

El backend (`documento.js`, ya en producción-de-código) espera items con
`{ nombre, descripcion?, cantidad, unidad?, precio, descuentoMonto?, exento? }`, donde
`precio` es el **precio NETO por unidad** (el motor calcula el 19% de IVA sobre eso).

**Mapeo desde `OrdenItem`:** usar `item.precioUnitario` (neto) como `precio` — **NO**
`item.precioConIva` (ese ya incluye IVA, usarlo duplicaría el impuesto). `item.nombre` =
`OrdenItem.nombre`, `item.cantidad` = `OrdenItem.cantidad`, sin `unidad` explícita en el
modelo actual de `OrdenItem` (dejar `unidad: null`, el backend lo maneja).

**Receptor desde `Cliente`:** `rut`, `razonSocial`, `giro`, `direccion`, `comuna`,
`ciudad` — ya en el modelo `Cliente`. El backend determina factura (33) vs boleta (39)
solo por si `receptor.rut` es válido (`isValidRut`), así que el frontend no necesita
decidir el tipo — solo mostrarlo en el preview del modal después de que el usuario
confirme (el tipo real lo devuelve la respuesta de `POST /documentos`).

Para precargar el tipo esperado en el modal *antes* de enviar (para mostrarlo en el
preview), el frontend puede inferirlo localmente con la misma regla
(`cliente.rut` válido → factura, si no → boleta) usando una función `isValidRut` propia
en el frontend (validación puramente visual, el backend valida de nuevo igual).

## Flujo 1: Emitir DTE desde una venta

**Dónde:** `ViewVentaPanel.jsx`, sección "Acciones rápidas", tab Detalle.

**Botón "Emitir DTE"** — visible si `canWrite` de facturación Y la venta no tiene ya un
documento en estado `emitido`/`enviado`/`aceptado` (evitar doble emisión accidental;
sí se puede re-emitir si el único documento previo quedó en `error`).

**Al hacer clic:** abre un modal (`Modal` compartido, mismo patrón que el modal de
confirmación de eliminar venta) mostrando:
- Receptor: razón social, RUT, dirección/comuna del `Cliente` de la venta.
- Tipo detectado: "Factura Electrónica" o "Boleta Electrónica" (badge).
- Tabla de items con cantidad/precio neto/subtotal.
- Totales: Neto, IVA 19%, Total (calculados en el frontend solo para mostrar —
  el backend recalcula y es la fuente de verdad).
- Botón "Confirmar y emitir" (deshabilitado mientras `isPending`).

**Al confirmar:** el frontend hace `POST /api/facturacion/documentos` (crea el
borrador con `ordenId`, `clienteId`, `receptor`, `items` mapeados) y, si responde 201,
inmediatamente `POST /api/facturacion/documentos/:id/emitir`. Si cualquiera de los dos
pasos falla, muestra el mensaje de error de la API dentro del modal (no lo cierra, para
que el usuario pueda leer el motivo — ej. "No hay certificado digital cargado") y dejar
reintentar. Si el segundo paso fue el que falló, el documento queda en estado `error`
en el backend (no se pierde, aparece luego en el tab Documentos con badge "Error").

**Al éxito:** cierra el modal, invalida `['ventas', ordenId]` y `['facturacion',
'documentos']`, muestra notificación de éxito con el folio asignado.

## Flujo 2: NC/ND sobre un documento ya emitido

**Dónde:** tab "Documentos" de `ViewVentaPanel.jsx`, junto a cada documento ya emitido
de esa venta (requiere que el tab liste los `FactDocumento` con `ordenId` = esa venta —
nuevo `useQuery` a `GET /api/facturacion/documentos?ordenId=...`). **Ya resuelto**
(commit `a0524ab` en `feature/facturacion-dte-backend`): la ruta y el adapter Prisma
ahora aceptan `ordenId` como filtro, con test de ruta (`facturacion-routes.test.js`)
confirmando que filtra correctamente.

Cada documento con estado `aceptado` o `enviado` muestra dos botones (estilo
`linkButton`, igual que Editar/Borrar en guías): "Anular con NC" y "Corregir con ND".

**Al hacer clic:** modal simple pidiendo una razón (textarea, obligatorio). Al
confirmar: `POST /api/facturacion/documentos` con `tipoDte: 61` (NC) o `56` (ND),
`receptor` igual al documento original, `items` = una línea con el monto total a
anular/corregir (o los mismos items del original si es anulación completa — usar
anulación completa como único caso soportado esta ronda, no anulación parcial),
`referencias: [{ tipoDocRef: String(original.tipoDte), folioRef: String(original.folio),
fechaRef: original.fechaEmision, codRef: '1', razon: <texto del modal> }]` (código de
referencia SII: 1 = anula documento de referencia), luego `POST .../emitir` igual que
el flujo 1.

## Flujo 3: Guía de despacho electrónica

**Dónde:** `DespachosPage.jsx`, tab "Guias", columna de acciones de `colsGuia` (junto a
Editar/Borrar, línea ~348).

**Botón "Emitir DTE"** — deshabilitado (con `title` tooltip "Esta guía no tiene una
orden asociada") si `row.ordenId` es null. Si tiene `ordenId`: mismo modal de
confirmación que el Flujo 1, pero precarga además `guiaDespachoId: row.id` y usa
`tipoDte: 52`. El receptor y los items salen de la Orden asociada (`row.ordenId`) igual
que el Flujo 1.

## Flujo 4: Módulo "Facturación → Documentos Emitidos"

**Nueva ruta:** `/facturacion/documentos` — agregar grupo "Facturación" en
`TopBar.jsx` `NAV_GROUPS` y la ruta protegida (`module: 'facturacion'`) en
`router.jsx`.

**Página** (`frontend/src/pages/facturacion/DocumentosPage.jsx`, nueva), mismo patrón
que `VentasPage.jsx`:
- Tabs de filtro por estado: Todos, Borrador, Emitido, Enviado, Aceptado, Rechazado,
  Error.
- Select de filtro por tipo de documento (33/39/52/56/61, con label legible via
  `TIPOS_DTE` — necesita un mapa espejo en frontend o pedirlo al backend; más simple:
  hardcodear el mismo mapa en frontend ya que son 7 valores fijos y estables).
- Tabla: folio, tipo, fecha emisión, receptor (razón social), total, estado (badge de
  color por estado), link a la venta si `ordenId` no es null.
- Click en fila abre un panel de detalle (mismo patrón `ViewVentaPanel` pero de solo
  lectura): datos del documento, botón "Descargar XML" (`GET .../xml`, dispara
  descarga), botón "Ver HTML" (`GET .../html`, abre en popup como ya hace "Imprimir" en
  venta).
- Sin creación de documentos sueltos desde acá — solo lectura esta ronda.

## API frontend nueva

Nuevo archivo `frontend/src/api/facturacion.js`, seteando el patrón de
`frontend/src/api/ventas.js` (axios + TanStack Query):

```javascript
export const useDocumentos = (params = {}) => useQuery({
  queryKey: ['facturacion', 'documentos', params],
  queryFn: () => api.get('/facturacion/documentos', { params }).then(r => r.data),
  staleTime: 30_000,
})

export const useDocumento = (id) => useQuery({
  queryKey: ['facturacion', 'documentos', id],
  queryFn: () => api.get(`/facturacion/documentos/${id}`).then(r => r.data),
  enabled: !!id,
})

export const useCrearDocumento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/facturacion/documentos', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'documentos'] }),
  })
}

export const useEmitirDocumento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/facturacion/documentos/${id}/emitir`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'documentos'] }),
  })
}
```

Un hook combinado `useEmitirDteDesdeVenta({ ordenId, clienteId, guiaDespachoId?,
tipoDte, receptor, items })` que encadena `useCrearDocumento` + `useEmitirDocumento` es
razonable para no repetir la lógica de dos pasos en los 3 lugares que la usan (venta,
guía, NC/ND) — extraerlo a un solo hook reutilizable en `api/facturacion.js`.

## Testing

`frontend/src/__tests__/` solo tiene un test (`md-render.test.jsx`, markdown) — no hay
convención establecida de testing de componentes/páginas React en este proyecto. No
introducir infraestructura de testing de frontend nueva para esta feature. Verificar
manualmente cada flujo (correr `npm run dev` en frontend + backend, click a través de
los 4 flujos) y apoyarse en los tests de backend ya existentes (42/42 en la suite
facturacion) que cubren cada endpoint que este frontend consume.

## Fuera de alcance (recordatorio)

- Pantalla de Configuración (upload cert/CAF) — sigue por curl.
- Anulación parcial de NC (solo anulación completa esta ronda).
- Libros IECV/RCOF, ambiente producción — ya fuera de alcance desde el spec de backend.
