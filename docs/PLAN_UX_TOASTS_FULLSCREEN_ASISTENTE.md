# Plan UX — Toasts/modales, tablas fullscreen completas, asistente doc-para-todos

> **Para el agente constructor.** Tres paquetes de trabajo independientes. Ejecutarlos en el orden A → B → C. Verificado contra el código real (rutas y hallazgos incluidos). **No romper nada: no cambiar lógica de negocio, solo la capa de interacción/presentación.** No deploy: dejar todo en working tree para revisión.

---

## PAQUETE A — Sistema de toasts y modales (adiós `alert`/`confirm`/`prompt`)

**Estado verificado:** hay **180 `alert(`, 51 `confirm(`, 10 `prompt(`** en ~40 archivos del frontend. Existe `frontend/src/store/notif.js` (zustand: `useNotifStore` con `notifs/add/dismiss`) que **nadie usa** — es la base a aprovechar.

### A.1 Infraestructura (construir primero)
En `frontend/src/components/` (nuevo archivo `Feedback.jsx` o similar):

1. **`<Toaster/>`** — renderer de toasts apilados (esquina inferior derecha, encima de todo, `zIndex` mayor que el chat IA que usa 200). Lee de `useNotifStore`. Cada toast: icono según tipo (`success` verde / `error` rojo / `info` azul / `warning` ámbar), mensaje, cierre manual (×) y auto-dismiss (4 s éxito/info, 7 s error). Animación sutil de entrada/salida. Accesible (`role="status"` / `aria-live="polite"`).
2. **Helper `toast`** — API imperativa para llamar desde cualquier lugar (incluidos callbacks de react-query, fuera de componentes):
   ```js
   toast.success('Venta creada'); toast.error('No se pudo guardar'); toast.info(...); toast.warning(...)
   ```
   Implementado sobre `useNotifStore.getState().add(...)`.
3. **`confirmDialog(opts)`** — modal de confirmación **basado en promesa** (reemplazo drop-in de `confirm()`):
   ```js
   if (!(await confirmDialog({ title: '¿Eliminar licitación?', detail: 'Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', tone: 'danger' }))) return
   ```
   Un solo modal global (estado en el mismo store o uno propio), overlay, botones Confirmar/Cancelar, Escape = cancelar, foco atrapado en el modal. `tone: 'danger'` pinta el botón de rojo.
4. **`promptDialog(opts)`** — igual pero con un input de texto (reemplazo de `prompt()`); resuelve `string | null`.
5. **Montaje:** `<Toaster/>` y los hosts de modal se montan UNA vez en `frontend/src/components/Shell.jsx` (el layout que envuelve la app).

Estilo: seguir el design system actual (vars CSS `--green-*`, `--red`, `--border`, radios 10-12, sombras suaves como el resto).

### A.2 Migración de los 241 call sites
Reglas de conversión (mecánicas, sin cambiar lógica):
- `alert('éxito...')` tras guardar/crear → `toast.success(...)`.
- `alert(err...)` en `onError` → `toast.error(...)`.
- `alert()` de validación previa ("completa el campo X") → `toast.warning(...)`.
- `if (!confirm('...')) return` → `if (!(await confirmDialog({...}))) return` (marcar la función como `async` si no lo es; verificar que los handlers de eventos toleren async — en React onClick async funciona).
- `prompt('motivo...')` (10 casos, ej. motivo de descuento en CRM/licitaciones) → `await promptDialog({...})`; respetar el contrato actual (null = cancelado).
- **Confirmaciones destructivas** (eliminar, anular) → SIEMPRE `tone: 'danger'`.

**Orden de migración por volumen** (verificado): ConfigPage (33), BodegaFormPage (14), CajaPage (12), LicitacionDetallePage (10), CobranzaPage (9), ClientesFormPage (5), CrmPage (4), CajaFormPage (4), BitacoraTallerPage (4), ViewVentaPanel (4), y el resto (~40 archivos en total). Migrar TODOS; al terminar, `grep -rE "[^a-zA-Z.](alert|confirm|prompt)\(" src --include="*.jsx"` debe devolver **0** (excepto usos legítimos no-UI si los hubiera; justificar cada excepción).

### A.3 Pruebas del paquete A
- `npm run build` verde.
- Prueba manual mínima en 5 flujos: crear venta (toast éxito), error de guardado (toast error), eliminar licitación (confirm danger), motivo de descuento (prompt), convertir lead CRM.
- Verificar que el toast no tape el botón flotante del chat IA.

---

## PAQUETE B — Tablas en pantalla completa "completas" y consistentes

**Estado verificado:** el `Table` compartido (`frontend/src/components/shared/index.jsx`) YA tiene: fullscreen (Escape para salir), zoom, preferencias de columnas, `toolbarExtra` (slot para meter controles DENTRO de la toolbar de la tabla) y `pager`. El patrón correcto ya está aplicado en **matriz-ventas, consulta-precios y taller**: tabs/búsqueda/filtros van en `toolbarExtra` → sobreviven al fullscreen. En el resto de las páginas los filtros están FUERA → al maximizar se pierden búsqueda, filtros, export y paginación.

### B.1 Objetivo
Que en TODAS las sábanas principales, el modo pantalla completa conserve: **búsqueda, filtros, tabs, exportar y paginación**. Patrón de referencia: `MatrizVentasPage.jsx` (commit `201c28a`).

### B.2 Páginas a migrar al patrón (verificar cada una y mover sus controles a `toolbarExtra` + `pager`)
| Página | Controles a mover |
|---|---|
| `ventas/VentasPage.jsx` | búsqueda, filtros de estado/fecha, paginación |
| `licitaciones/LicitacionesPage.jsx` | búsqueda, estado, fechas, paginación |
| `clientes/ClientesPage.jsx` | búsqueda, filtros |
| `bodega/BodegaPage.jsx` | búsqueda, filtros, tabs si hay |
| `pagos-proveedores/PagosProveedoresPage.jsx` | tabs (Pendiente/Vencido...), búsqueda, fechas |
| `despachos/DespachosPage.jsx` | tabs, búsqueda, filtros |
| `cobranza/CobranzaPage.jsx` | filtros de fecha/documento |
| `crm/CrmPage.jsx` (vista Tabla) | filtros ejecutiva/prioridad/fechas |
| `ordenes-compra/OrdenesCompraPage.jsx` | búsqueda, filtros |
| `rrhh/RrhhPage.jsx` (listado) | búsqueda |

Reglas:
- NO duplicar controles (moverlos, no copiarlos). El estado (useState de filtros) queda en la página; solo cambia dónde se renderizan.
- Si una página tiene KPIs arriba, los KPIs se quedan fuera (no van a la toolbar).
- La paginación va por la prop `pager` del Table para que aparezca también en fullscreen.
- Si `toolbarExtra` necesita mejoras en el Table compartido para acomodar filtros largos (wrap en 2 filas), hacerlas en el componente compartido UNA vez, no con hacks por página.

### B.3 Pruebas del paquete B
- Por cada página migrada: entrar a fullscreen → buscar, filtrar, cambiar de página y exportar SIN salir de fullscreen. Escape sale.
- `npm run build` verde. Sin regresión visual en modo normal.

---

## PAQUETE C — Asistente IA para todos los roles, SOLO documentación (datos solo admin)

**Estado verificado:** hoy el gate es doble: backend `rbac('ai','read')` (solo admin tiene el módulo `ai`) en `chat.js`, `conversaciones.js` y `status`; frontend `if (user?.role !== 'admin') return null` en `AiChat.jsx` y bloqueo en `AsistentePage.jsx`.

### C.1 Backend — recorte de herramientas EN EL SERVIDOR (la parte de seguridad)
En `backend/src/routes/ai/chat.js`:
- Cambiar el preHandler de `/chat` y `/status` a solo `fastify.authenticate` (cualquier usuario logueado).
- Dentro del handler, derivar el modo según rol:
  ```js
  const esAdmin = request.user?.role === 'admin'
  const tools = esAdmin ? allToolDefinitions() : soloDocumentacion()  // [consultar_documentacion, ajustar_pantalla]
  ```
  `soloDocumentacion()` devuelve ÚNICAMENTE `consultar_documentacion` y `ajustar_pantalla` (UI). **NADA de tools de datos, comisiones, planillas, documentos Excel/PPT** para no-admin. Este recorte es de servidor: aunque el cliente pida otra cosa, el modelo no tiene las tools.
- **System prompt por rol:** para no-admin, un prompt reducido en `llm.js` (`buildSystemPromptDocs(user)`): "Eres el asistente de ayuda de Plastimar. SOLO respondes cómo usar el sistema con la herramienta consultar_documentacion. NO tienes acceso a datos de negocio (ventas, sueldos, comisiones, stock): si te preguntan por datos, responde que esa consulta está disponible solo para gerencia y ofrece explicar cómo encontrarlo en pantalla."
- Defensa en profundidad en `executeTool`: si el usuario no es admin y la tool solicitada no está en la lista permitida → devolver `{ error: 'Herramienta no disponible para tu rol' }` (por si acaso).
- En `conversaciones.js`: cambiar gate a `fastify.authenticate` (el scope por `userId` ya garantiza que cada quien ve solo lo suyo — verificado).

### C.2 Frontend
- `AiChat.jsx`: quitar `if (user?.role !== 'admin') return null`. Mensaje de bienvenida según rol: admin mantiene el actual; no-admin: "Hola. Puedo ayudarte a usar el sistema: pregúntame cómo hacer algo o dónde encontrar una función." Sugerencias para no-admin orientadas a uso ("¿Cómo creo una venta?", "¿Dónde veo mis despachos pendientes?").
- `AsistentePage.jsx`: permitir todos los roles (misma lógica de bienvenida/sugerencias).
- `router.jsx`: la ruta `/asistente` pasa de `allowedRoles: ['admin']` a todos los roles autenticados.
- `TopBar.jsx`: el item "Asistente IA" del menú Admin — moverlo o duplicarlo a un lugar visible para todos (o dejar el acceso por el botón flotante, que ahora ven todos). Decisión simple: el botón flotante basta; el item de menú puede quedar admin-only o hacerse visible a todos. Elegir lo más simple y documentarlo.

### C.3 Pruebas del paquete C (CRÍTICAS — es un cambio de permisos)
1. **Como vendedor** (no admin): el chat aparece; preguntar "¿cómo creo una venta?" → responde desde la documentación. Preguntar "¿cuánto vendimos este mes?" o "¿cuál es el sueldo de X?" → el modelo NO tiene la herramienta y responde que esa consulta es solo para gerencia. **Verificar en el log del backend que NO se invocó ninguna tool de datos.**
2. **Como admin:** todo sigue igual que hoy (datos + documentación + documentos).
3. Conversaciones: un vendedor guarda y reabre sus conversaciones; NO ve las de otros (scope por userId).
4. Tests: agregar en `ai-assistant.test.js` un test de que el toolset para no-admin contiene SOLO consultar_documentacion y ajustar_pantalla.
5. `vitest run ai-assistant` verde + backend arranca + frontend compila.

---

## Reglas globales
1. Orden: A → B → C. Cada paquete termina con su verificación en verde antes de pasar al siguiente.
2. NO tocar lógica de negocio, endpoints de datos, ni schema. No hay migraciones en este plan.
3. Reutilizar el design system existente (vars CSS, Btn, Badge, Icon). No introducir librerías nuevas de UI.
4. Si algo del plan no calza con el código real, marcar `// POR CONFIRMAR` y reportar, NO improvisar.
5. Al final: `npm run build` verde, `vitest run ai-assistant crm` verde, y `grep` de alert/confirm/prompt = 0.

## Archivos principales
| Paquete | Archivos |
|---|---|
| A | `frontend/src/store/notif.js` (ampliar), `frontend/src/components/Feedback.jsx` (nuevo), `Shell.jsx` (montaje), ~40 páginas (migración mecánica) |
| B | `frontend/src/components/shared/index.jsx` (mejoras a toolbar si hacen falta), 10 páginas de sábanas |
| C | `backend/src/routes/ai/chat.js`, `llm.js`, `conversaciones.js`; `frontend/src/components/AiChat.jsx`, `AsistentePage.jsx`, `router.jsx`, `TopBar.jsx`; `backend/test/ai-assistant.test.js` |
