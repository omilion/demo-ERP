# AUDITORÍA PROFUNDA — MÓDULO PAGOS A PROVEEDORES (PLASTIMAR ERP)

**Fecha:** 3 de Septiembre de 2026  
**Rama:** `area-e-permisos-taller`  
**Entorno auditado:** Monorepo local (`backend/` Node.js + Fastify + Prisma ORM, `frontend/` React 19 + Vite + TanStack Query). Base de datos local Docker PostgreSQL en puerto `55432`.  
**Alcance:** Código fuente real, esquema de datos, pruebas automatizadas locales y contrastación contra documentación legacy.

> [!IMPORTANT]
> **Consideración Fundamental sobre los Datos Locales:**
> El entorno local opera deliberadamente con una **base de datos ultra-reducida** (datos semilla y fixture de tests en `plastimar_test`). Por diseño, esta base contiene únicamente 1 pago y un set mínimo de proveedores. La ausencia de filas para la sucursal activa en local es **completamente normal y esperada por volumen de datos**.
> 
> Esta auditoría **separa de forma rigurosa la escasez de datos local de los defectos reales de código, arquitectura y esquema**:
> * **Comportamiento por datos locales:** Que una consulta devuelva 0 registros para `sucursalId = 1` es normal si la semilla no pobló facturas para esa sucursal.
> * **Defectos estructurales auditados (independientes del volumen de datos):** La pantalla que se congela en "Cargando…", el estado vacío que se desmonta, el uso de `Float` en montos monetarios, la falta de integración con movimientos de caja, la ausencia de pagos parciales y el cálculo estático de facturas vencidas.

---

## Resumen Ejecutivo

| Métrica / Aspecto | Evaluación |
|---|---|
| **Veredicto General** | **CRÍTICO — Módulo incompleto a nivel financiero y desalineado con Caja** |
| **Integración con Caja** | **NULA (0%)** — Pagar a un proveedor no genera movimiento de caja, no descuenta turnos ni afecta saldos bancarios. |
| **Precisión Monetaria** | **CRÍTICA** — Campos monetarios modelados como `Float` en Prisma (`Float` IEEE 754 genera errores de redondeo). |
| **Lógica de Vencimiento** | **ROTA** — El estado "Vencido" es un string estático en BD; el KPI muestra siempre 0 mientras la tabla pinta filas rojas. |
| **Resiliencia UI** | **DEFICIENTE** — Desmonta toda la tabla y controles durante carga; oculta fallos de red sin alertar al usuario. |
| **Aislamiento Multi-Sucursal** | **PARCIAL / BLOQUEANTE** — El filtro estricto por `sucursal_id` deja invisibles facturas globales (`sucursal_id IS NULL`). |

> **Veredicto:** El módulo funciona hoy como un registro administrativo de facturas de compra y recepción de mercadería para Bodega, pero **NO como un submódulo de Caja/Finanzas**. No existe flujo de fondos, no hay pagos parciales ni abonos, y el botón "Pagar" es simplemente un alternador de texto en una columna sin impacto contable ni bancario.

---

## Causa Raíz: "Cargando…" Indefinido, KPIs en 0 y Botones CSV Deshabilitados

### 1. El "Cargando..." Indefinido
* **Evidencia en Frontend:** [PagosProveedoresPage.jsx:245-264](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L245-L264)
  ```jsx
  <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
    {isLoading
      ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
      : <Table columns={cols} rows={items} ... />
    }
  </div>
  ```
* **Mecanismo del Fallo:**
  1. La tabla entera, sus pestañas (*Todos / Pendientes / Pagados / Vencidos*), su buscador y sus filtros viven dentro de `toolbarExtra` pasado a `<Table>`.
  2. Cuando `isLoading === true`, el operador ternario **desmonta completamente la `<Table>`** y renderiza un `<div>` plano con el texto `"Cargando..."`.
  3. Si el backend local (`http://127.0.0.1:3005`) se detiene (por ejemplo, al cambiar de conversación o cerrar la terminal en el IDE), las peticiones de Vite quedan en reintentos automáticos de TanStack Query (`retry: 3`). La variable `isLoading` permanece en `true` durante decenas de segundos o de forma permanente si la conexión está caída.
  4. Además, el hook `usePagosProveedores` en [PagosProveedoresPage.jsx:79](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L79) **no captura `isError` ni `error`**. Si la petición falla definitivamente, `isLoading` pasa a `false`, `result` adopta el default `{ items: [] }`, y el componente renderiza "Sin pagos" sin jamás informar que hubo un fallo de red o servidor.

### 2. ¿Por qué los KPIs marcan 0 / $0 si la tabla está "Cargando..."?
* **Evidencia:** [PagosProveedoresPage.jsx:79-86](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L79-L86) y [L229-234](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L229-L234)
  ```jsx
  const { data: result = { items: [], total: 0, limit: 100, stats: {} }, isLoading } = usePagosProveedores(params)
  const total = result.total ?? 0
  const stats = result.stats || {}
  ```
* **Explicación:** Los KPIs **NO** se calculan por separado de la tabla; vienen en el mismo JSON devuelto por la API (`{ items, total, stats }`). Sin embargo, mientras la petición está en vuelo, la desestructuración le asigna el valor por defecto síncrono: `total = 0`, `stats = {}`. Los `<KpiCard>` renderizan directamente `0` y `$0` sin comprobar `isLoading`, mientras que la sección de la tabla tiene un bloqueo explícito `{isLoading ? ... : ...}`. Esto provoca la paradoja visual de KPIs en cero junto a una tabla que no termina de cargar.

### 3. ¿Por qué "Exportar CSV" y "CSV detalle" están deshabilitados?
* **Evidencia:** [PagosProveedoresPage.jsx:222-223](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L222-L223)
  ```jsx
  <Btn variant="secondary" icon="download" size="sm" onClick={handleExport} disabled={!items.length}>Exportar CSV</Btn>
  <Btn variant="secondary" icon="download" size="sm" onClick={handleExportDetalle} disabled={!items.length}>CSV detalle</Btn>
  ```
* **Causa:** La propiedad `disabled` está atada rígidamente a `!items.length`. Si no hay filas cargadas en memoria (por estar cargando o por haber 0 resultados), ambos botones se desactivan automáticamente.

### 4. La exclusión en Base de Datos por Scope de Sucursal
* **Evidencia en Backend:** [backend/src/routes/pagos-proveedores/index.js:201-203](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L201-L203)
  ```javascript
  const userSucursalId = getUserSucursalId(user)
  if (userSucursalId) clauses.push({ sucursalId: userSucursalId })
  ```
* **Comprobación de Datos en Entorno Local:** En la base de datos local ultra-reducida de pruebas (`plastimar_test`), existe únicamente 1 registro en `pagos_proveedores` (`id: 939`), el cual posee `sucursal_id = NULL`. Dado que el usuario `admin@plastimar.cl` tiene asignado en su ficha `sucursalId = 1` (Casa Matriz), la consulta filtra rígidamente por `WHERE sucursal_id = 1` y excluye ese registro global. Por tanto, es natural que en local el backend responda legítimamente con `{ items: [], total: 0, stats: { ... 0 } }`. El problema en UI es que ante este resultado legítimo (0 filas), la pantalla no debería congelarse en "Cargando…", sino mostrar fluidamente su estado vacío ("Sin pagos") con sus filtros operativos.

---

## Diagrama de Flujo y Máquina de Estados

### 1. Flujo Integral de Entradas y Salidas
```
                        FUENTES DE ENTRADA
 ┌────────────────────────────────────────────────────────────────────────┐
 │ A. Carga Rápida Manual       --> PagosProveedoresPage (+ Nueva Factura)│
 │ B. Ingreso de Mercadería     --> StockIngresosPage (+ Doc Bodega)      │
 │ C. DTE Electrónico Proveedor --> DocumentosRecibidosPage (SII DTE 33)  │
 │ D. Gasto Operacional / DTE   --> RegistrarGastoModal (GAdmin/GMant/etc)│
 └────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼  POST /api/pagos-proveedores
                     ┌───────────────────────────────┐
                     │ catalogo.pagos_proveedores    │
                     │ estado: "Pendiente"           │
                     │ stockAplicadoAt: null | Date  │
                     └───────────────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
   [Acción: Pagar]                                       [Acción: Anular]
   PUT /api/pagos-proveedores/:id                        POST /api/pagos-proveedores/:id/anular
   - Setea estado = "Pagado"                             - Reversa stock físico si aplica
   - Setea fechaPago = hoy                               - Setea estado = "Anulado", eliminado = true
   ─────────────────────────────                         ──────────────────────────────────────
   ⚠️ BRECHA CRÍTICA:                                    ⚠️ BRECHA:
   * NO crea MovimientoCaja                              * No devuelve dinero a caja
   * NO afecta TurnoCaja                                 * No desvincula DocumentoRecibido
   * NO pide cuenta bancaria                             * No hay bitácora de auditoría
```

### 2. Máquina de Estados Real vs. Esperada
```
  [ESTADO REAL EN CÓDIGO]                     [ESTADO REQUERIDO CONTABLE]

      ┌───────────┐                                  ┌───────────┐
      │ Pendiente │                                  │ Pendiente │
      └─────┬─────┘                                  └─────┬─────┘
            │                                              │
    ┌───────┴───────┐                        ┌─────────────┼─────────────┐
    ▼               ▼                        ▼             ▼             ▼
┌────────┐    ┌─────────┐              ┌───────────┐ ┌───────────┐ ┌─────────┐
│ Pagado │    │ Anulado │              │  Vencido  │ │  Parcial  │ │ Anulado │
└────────┘    └─────────┘              │(Auto/Días)│ │ (Abonos)  │ └─────────┘
                                       └─────┬─────┘ └─────┬─────┘
  * "Vencido" NO se transiciona              │             │
    automáticamente en BD.                   └─────────────┼─────────────┘
  * "Parcial" NO existe.                                   ▼
                                                     ┌───────────┐
                                                     │  Pagado   │
                                                     └───────────┘
```

---

## Alcance Obligatorio Auditado

### 1. Entrada — ¿Cómo y cuándo aparece algo aquí?

* **Rutas Frontend y Backend exactas:**
  * UI: `/pagos-proveedores` ([PagosProveedoresPage.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx)) y `/pagos-proveedores/:id` ([PagoProveedorDetallePage.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagoProveedorDetallePage.jsx)).
  * Endpoints Backend: `GET /api/pagos-proveedores`, `GET /api/pagos-proveedores/export`, `GET /api/pagos-proveedores/:id`, `POST /api/pagos-proveedores`, `PUT /api/pagos-proveedores/:id`, `POST /api/pagos-proveedores/:id/anular`, `DELETE /api/pagos-proveedores/:id` ([backend/src/routes/pagos-proveedores/index.js:400-687](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L400-L687)).
* **Discrepancia de Permisos (Router vs. Menú vs. Backend):**
  * En [router.jsx:124-125](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/router.jsx#L124-L125), las rutas exigen `{ module: 'proveedores' }`.
  * En [TopBar.jsx:70-74](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/components/TopBar.jsx#L70-L74), la opción vive dentro del grupo **Caja**, pero tiene configurado `module: 'proveedores'`.
  * En [permissions.js:31-37](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/utils/permissions.js#L31-L37), el rol `cajero` tiene `caja: ['read', 'write']` y `cobranza: ['read', 'write']`, pero **NO tiene permiso sobre `proveedores`**. En consecuencia, **el cajero no ve "Pagos Proveedores" en su menú Caja**.
  * En cambio, el rol `bodeguero` sí tiene `proveedores: ['read', 'write']` ([permissions.js:29](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/utils/permissions.js#L29)), por lo que un bodeguero tiene acceso a gestionar pagos dentro del menú Caja.
  * En [ConfigPage.jsx:469](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/config/ConfigPage.jsx#L469), el módulo figura como `'pagos-proveedores'` en la lista de permisos extra asignables, pero ni el router ni el backend evalúan jamás ese string (esperan siempre `'proveedores'`). Si un administrador le otorga el permiso extra `'pagos-proveedores'` a un usuario, no surte ningún efecto.
* **Orígenes de los Documentos:**
  1. *Ingreso de Stock:* [StockIngresosPage.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/stock-ingresos/StockIngresosPage.jsx) llama a `POST /api/pagos-proveedores` con `ingresaStock: true` y array `detalles`. Inserta en `pagos_proveedores`, crea filas en `detalles_factura_proveedor`, actualiza stock en `productos`/`telas` y registra en `movimientos_bodega`.
  2. *Documentos Recibidos SII (DTEs):* [DocumentosRecibidosPage.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/facturacion/DocumentosRecibidosPage.jsx) llama al endpoint pasando `documentoRecibidoId`. El backend bloquea la fila mediante `SELECT ... FOR UPDATE` en `documentos_recibidos` y marca `pagoProveedorId` ([pagos-proveedores/index.js:523-526](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L523-L526)).
  3. *Gasto Registrado:* [RegistrarGastoModal.jsx:43-57](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/components/facturacion/RegistrarGastoModal.jsx#L43-L57) crea un registro con `bodega: 'GAdministrativos' | 'GOperacionales' | 'GMantencion' | 'GTransporte'` e `ingresaStock: false`.
  4. *Carga Manual Rápida:* [PagosProveedoresPage.jsx:108-127](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L108-L127) crea un registro con `bodega: 'No hay'` e `ingresaStock: false`.
* **Control de Duplicados:**
  * El backend implementa un advisory lock con hash ([pagos-proveedores/index.js:534](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L534)) y verifica unicidad activa mediante `findDuplicate()` (line 125).
  * En la base de datos PostgreSQL existe el índice único parcial:
    `CREATE UNIQUE INDEX "pagos_proveedores_doc_provider_active_uidx" ON catalogo.pagos_proveedores (lower(documento), lower(n_doc), proveedor_id, codigo_proveedor, sucursal_id) WHERE eliminado = false AND estado <> 'Anulado'`.
  * **Falla:** No normaliza folios numéricos con ceros a la izquierda (`00123` != `123`).
* **Scope de Datos:**
  * Forzado por `getUserSucursalId(user)` ([pagos-proveedores/index.js:201](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L201)). Un usuario asignado a una sucursal no puede listar, ver, editar ni pagar documentos de otra sucursal (retorna 404 intencionalmente).

---

### 2. Salida — ¿Cuándo se cierra un pago?

* **Máquina de Estados Real:**
  * Estados posibles en código: `'Pendiente'`, `'Pagado'`, `'Vencido'`, `'Anulado'` ([PagosProveedoresPage.jsx:11-16](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L11-L16)).
  * **La Falla de "Vencido":** En [backend/src/routes/pagos-proveedores/index.js:416-436](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L416-L436), los KPIs agrupan por la columna persistida `estado` (`groupBy: ['estado']`). Dado que ningún proceso de fondo ni trigger actualiza el string a `'Vencido'` cuando expira `fechaVencimiento`, las facturas vencidas permanecen con `estado = 'Pendiente'`.
  * En la tabla ([PagosProveedoresPage.jsx:256](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L256)), la UI calcula el vencimiento al vuelo (`row.estado === 'Pendiente' && row.fechaVencimiento < todayStr`) y pinta la fila de rojo.
  * Al hacer clic en la pestaña "Vencidos" (`/pagos-proveedores?estado=Vencido`), el backend filtra rígidamente por `estado = 'Vencido'`, **devolviendo 0 registros**, a pesar de que el usuario acaba de ver facturas vencidas resaltadas en rojo en la pestaña "Todos".
* **Abonos y Pagos Parciales:**
  * **Inexistentes.** El modelo `PagoProveedor` ([schema.prisma:381](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/prisma/schema.prisma#L381)) solo posee el campo `total`. No existen entidades de abonos, ni `montoPagado`, ni `saldoPendiente`. Una factura se marca completa como "Pagada" o queda como "Pendiente".
* **Sobrepago y Montos Negativos:**
  * En `PUT /api/pagos-proveedores/:id` ([index.js:641](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L641)):
    `if (body.total !== undefined) data.total = parseFloat(body.total) || 0`
  * No hay validación de cota inferior. Un usuario con permiso de edición puede enviar un `total` negativo o cero.
* **Anulación y Reversa:**
  * Implementado en [pagos-proveedores/index.js:356-397](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L356-L397). Exige motivo obligatorio y permiso `proveedores:delete`.
  * Si el documento ingresó mercadería y no ha sido revertido, ejecuta `reverseStockIngreso()` para descontar el stock físico de las bodegas correspondientes.
  * **Falla:** No revierte ningún flujo de dinero (porque nunca se registró salida en caja) y no desvincula la factura en `factDocumentoRecibido`, dejando ese DTE bloqueado como "ingresado".
* **Relación con Turno de Caja:**
  * **Absolutamente ninguna.** Al presionar "Pagar", el backend no consulta si hay turno de caja abierto, no solicita caja de egreso ni cuenta bancaria, y no crea fila en `catalogo.movimientos_caja`.

---

### 3. Inventario Exhaustivo de Acciones y Botones

| Botón / Acción | Handler Frontend (`archivo:línea`) | Endpoint Backend (`archivo:línea`) | Validación Backend | Efecto en Base de Datos | Permiso Requerido | Condición Habilitado | Feedback Usuario | Idempotencia |
|---|---|---|---|---|---|---|---|---|
| **Exportar CSV** | `handleExport` ([PagosProveedoresPage.jsx:97](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L97)) | `GET /api/pagos-proveedores/export` ([index.js:451](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L451)) | Scope sucursal + filtros validados | Ninguno (Lectura streaming) | `proveedores:read` | `items.length > 0` | Descarga de archivo blob `.csv` | Sí (GET) |
| **CSV Detalle** | `handleExportDetalle` ([PagosProveedoresPage.jsx:102](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L102)) | `GET /api/pagos-proveedores/export?detalle=1` ([index.js:451](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L451)) | Scope sucursal + include detalles | Ninguno (Lectura con líneas) | `proveedores:read` | `items.length > 0` | Descarga `.csv` con detalle líneas | Sí (GET) |
| **Nueva Boleta/Factura** | `setShowCreate(true)` ([PagosProveedoresPage.jsx:224](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L224)) | `POST /api/pagos-proveedores` ([index.js:483](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L483)) | Proveedor activo, doc, nDoc, total > 0 | Inserta fila en `pagos_proveedores` (`bodega: 'No hay'`) | `proveedores:write` | Siempre visible si tiene permiso | Cierra modal, recarga queries | Protegido por advisory lock y uidx |
| **Nuevo Doc Bodega** | `navigate('/stock-ingresos')` ([PagosProveedoresPage.jsx:225](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L225)) | N/A (Ruta React Router) | N/A | N/A | `proveedores:write` | Siempre visible si tiene permiso | Navegación a pantalla de bodega | N/A |
| **Chip Facturas No Pagadas** | `onClick={() => setDocumento('Factura')...}` ([PagosProveedoresPage.jsx:236](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L236)) | `GET /api/pagos-proveedores?documento=Factura&estado=Pendiente` | Filtro `documentoWhere` + `estadoWhere` | Ninguno (Filtro React State) | Ninguno (Público en vista) | Siempre activo | Actualiza tabla y paginador | Sí (GET) |
| **Chip Boletas No Pagadas** | `onClick={() => setDocumento('Boleta')...}` ([PagosProveedoresPage.jsx:239](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L239)) | `GET /api/pagos-proveedores?documento=Boleta&estado=Pendiente` | Filtro `documentoWhere` + `estadoWhere` | Ninguno (Filtro React State) | Ninguno (Público en vista) | Siempre activo | Actualiza tabla y paginador | Sí (GET) |
| **Pagar en Fila** | `updateMut.mutate` ([PagosProveedoresPage.jsx:169](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L169)) | `PUT /api/pagos-proveedores/:id` ([index.js:608](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L608)) | Scope sucursal, ID válido, no anulado | Actualiza `estado='Pagado'`, `fechaPago=hoy`, `userMod` | `proveedores:write` | Visible si `estado !== 'Pagado' && !== 'Anulado'` | Diálogo de confirmación + toast | `disabled={updateMut.isPending}` |
| **Ver Detalle Fila** | `navigate('/pagos-proveedores/:id')` ([PagosProveedoresPage.jsx:160](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L160)) | `GET /api/pagos-proveedores/:id` ([index.js:468](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L468)) | Scope sucursal, eliminado: false | Ninguno (Lectura) | `proveedores:read` | Siempre habilitado | Navega a ficha de detalle | Sí (GET) |
| **Aplicar Stock (Detalle)** | `aplicarMut.mutate` ([PagoProveedorDetallePage.jsx:62](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagoProveedorDetallePage.jsx#L62)) | `POST /api/stock-ingresos/aplicar/:id` | Bodega válida, detalles > 0, no aplicado | Aumenta stock, crea `movimiento_bodega`, marca `stockAplicadoAt` | `bodega:write` | `!stockAplicadoAt && isStockBodega` | Diálogo confirmación + toast | Bloqueo si `stockAplicadoAt` existe |
| **Editar Documento (Detalle)** | `handleSave` ([PagoProveedorDetallePage.jsx:56](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagoProveedorDetallePage.jsx#L56)) | `PUT /api/pagos-proveedores/:id` ([index.js:608](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L608)) | Si stock aplicado: prohíbe tocar total/doc/bodega | Modifica campos permitidos en `pagos_proveedores` | `proveedores:write` | En modo edición | Toast éxito/error | Advisory lock transaccional |
| **Anular Documento (Detalle)** | `handleAnular` ([PagoProveedorDetallePage.jsx:64](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagoProveedorDetallePage.jsx#L64)) | `POST /api/pagos-proveedores/:id/anular` ([index.js:680](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L680)) | Motivo obligatorio, scope sucursal | Reversa stock físico, marca `estado='Anulado'`, `eliminado=true` | `proveedores:delete` | Visible si `!eliminado` | Prompt para ingresar motivo + toast | Advisory lock `pago-proveedor-anular:id` |

---

### 4. Información Visible vs. Información Necesaria

```
INFORMACIÓN ENTREGADA POR API                  INFORMACIÓN MOSTRADA EN UI
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│ id, proveedorId, codigoProveedor     │  ──>  │ (Ocultos / Resueltos internamente)   │
│ documento, nDoc                      │  ──>  │ Mostrados (Columnas Tipo y N Doc)    │
│ proveedor: { nombre, rut }           │  ──>  │ Mostrado (Columna Proveedor + RUT)   │
│ fechaDoc, fechaVencimiento, fechaPago│  ──>  │ Mostrados (Fechas formato es-CL)     │
│ createdAt, usuario                   │  ──>  │ Mostrados (Creación y Creada por)    │
│ total, nc, ncNumero, ncMonto         │  ──>  │ Mostrados (Total monetario, badge NC)│
│ estado, bodega                       │  ──>  │ Mostrados (Badges de estado y bodega)│
│ sucursalNombre, userMod, fecham, obs │  ──>  │ ⚠️ DESCARTADOS en tabla principal    │
└──────────────────────────────────────┘       └──────────────────────────────────────┘
```

#### Información Faltante en Pantalla (Imprescindible para Tesorería/Finanzas)
1. **Días de Mora / Días para Vencimiento:** No existe indicador de antigüedad de deuda (ej. "+15 días vencido" o "vence hoy").
2. **Condición de Pago / Plazo:** Contado, 30 días, 60 días, crédito pactado.
3. **Desglose de Impuestos (Neto, IVA Crédito Fiscal, Exento):** Solo existe `total`. En la contabilidad chilena, registrar compras exige separar el IVA crédito fiscal del monto neto para la declaración F29.
4. **Monto Pagado y Saldo Pendiente:** Solo se puede estar 100% impago o 100% pagado. No hay registro de saldo insoluto.
5. **Medio de Pago / Cuenta de Egreso:** No se especifica si se pagó vía Banco Estado, Santander, efectivo de caja chica o transferencia electrónica.
6. **N° de Operación / Comprobante Bancario:** Imposible conciliar contra cartola bancaria porque no hay campo para folio de transferencia.
7. **Documento de Respaldo Adjunto (PDF / XML DTE):** No existe visualizador ni enlace para abrir el PDF de la factura electrónica o el XML original emitido por el proveedor.
8. **Orden de Compra Asociada:** No hay trazabilidad hacia la OC interna que autorizó la compra.
9. **Usuario que Ejecutó el Pago:** Solo se guarda `userMod` genérico (que cambia si alguien edita las observaciones después).

---

### 5. Conexión con la Base de Datos

* **Definición en Prisma Schema:** [backend/prisma/schema.prisma:381-417](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/prisma/schema.prisma#L381-L417)
  ```prisma
  model PagoProveedor {
    id               Int       @id @default(autoincrement())
    proveedorId      Int?      @map("proveedor_id")
    codigoProveedor  Int?      @map("codigo_proveedor")
    sucursalId       Int?      @map("sucursal_id")
    total            Float     @default(0)   // 🚨 CRÍTICO: Debe ser Decimal
    ncMonto          Float?    @map("nc_monto") // 🚨 CRÍTICO: Debe ser Decimal
    estado           String    @default("Pendiente")
    ...
  }
  ```
* **Hallazgo Crítico de Precisión Monetaria (`Float` vs `Decimal`):**
  * Tanto `total` como `ncMonto` en `PagoProveedor`, y `cantidad`/`precio` en `DetalleFacturaProveedor` están tipados como `Float`.
  * En JavaScript y PostgreSQL, las sumas de flotantes IEEE 754 sufren de imprecisiones de coma flotante (ej. `0.1 + 0.2 = 0.30000000000000004`). En sistemas contables y tributarios, **el uso de `Float` es inaceptable** y debe ser reemplazado por `Decimal(12, 2)` o enteros (`BigInt` / `Int` para moneda local CLP sin decimales).
* **Ausencia de Integridad Referencial (Foreign Keys Huérfanas):**
  * `proveedorId`: **No tiene relación `@relation` con el modelo `Proveedor`**. Si un proveedor es eliminado de la base de datos, los pagos quedan con un ID huérfano. El script [data-integrity-audit.mjs:402](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/scripts/data-integrity-audit.mjs#L402) audita activamente pagos con `proveedor_id` inexistente debido a la falta de esta FK.
  * `sucursalId`: No tiene relación con `Sucursal`.
* **Índices Faltantes de Alto Impacto:**
  * La consulta principal ordena por `ORDER BY fecha_vencimiento ASC, fecha_doc ASC, id ASC` ([pagos-proveedores/index.js:411](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L411)). **No existe índice sobre `fecha_vencimiento` ni sobre `fecha_doc`**. Con miles de registros en producción, la consulta degenera en un *Sequential Scan + External Sort*.
  * No existe índice compuesto sobre `(sucursal_id, eliminado, estado)`, provocando que los 5 conteos de los KPIs escaneen la tabla repetidamente.
* **Corrupción de Paginación en Memoria:**
  * En [backend/src/routes/pagos-proveedores/index.js:412-447](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L412-L447), la base de datos pagina con `take: 100, skip: offset` ordenando por fecha de vencimiento.
  * Inmediatamente después, el backend ejecuta en JavaScript:
    ```javascript
    enriched.sort((a, b) => {
      const rut = String(a.proveedor?.rut || '').localeCompare(String(b.proveedor?.rut || ''), 'es')
      if (rut) return rut
      ...
    })
    ```
  * **Efecto:** La API corta un lote de 100 filas ordenado cronológicamente y luego **lo reordena alfabéticamente por RUT en memoria antes de enviarlo al cliente**. Si un usuario cambia a la página 2, vuelve a ver proveedores ordenados de la A a la Z, haciendo que la paginación sea completamente inconsistente e imposibilitando una paginación estable.

---

### 6. UI/UX y Accesibilidad

* **Falla de Renderizado en Estado Vacío / Error:**
  * Como se detalló en la Causa Raíz, la pantalla carece de un contenedor de estado de carga no bloqueante. En lugar de mantener visibles las pestañas, filtros y encabezados de la tabla mostrando un indicador de carga en el cuerpo (`<tbody>`), reemplaza toda la estructura visual por un string de texto.
  * Si el backend arroja error 500 o no responde, no existe ningún mensaje de alerta ni botón de reintento.
* **Problema del Logo de TopBar (Explicación Técnica de la Captura):**
  * El logo se importa como asset estático en [TopBar.jsx:9](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/components/TopBar.jsx#L9): `import plastimarLogo from '../assets/plastimar-logo.webp'`.
  * En modo desarrollo (`npm run dev`), Vite sirve este archivo mediante su servidor HTTP interno (`http://localhost:5173/src/assets/plastimar-logo.webp`).
  * Cuando el servidor de Vite se cayó o estuvo inalcanzable, la petición del navegador falló con error de red. El navegador mostró el icono nativo de imagen rota acompañado del texto alternativo `Plastimar Sisgestion 3.0`.
  * Adicionalmente, el archivo físico [plastimar-logo.webp](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/assets/plastimar-logo.webp) contiene isotipo y texto en color verde oscuro con fondo transparente. Al renderizarse sobre el `<header>` con fondo `var(--green-900)` (`#0f3822`), sufre de una relación de contraste casi nula, lo que dificulta su visibilidad incluso cuando carga con éxito.
* **Flujo Operativo del Usuario:**
  * Marcar como pagado desde la grilla principal requiere 2 clics (botón "Pagar" + modal de confirmación).
  * Sin embargo, para ver el desglose de ítems o notas de crédito, el usuario debe salir de la pantalla e ingresar a `/pagos-proveedores/:id`. No hay drawer lateral ni modal emergente.

---

### 7. Integración con el Resto del ERP y Brechas vs. Legacy

* **Desconexión con Flujo de Caja y Reportes Gerenciales:**
  * El reporte gerencial de caja ([backend/src/routes/reportes/index.js:847](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/reportes/index.js#L847)) toma datos aislados sumando `pagoProveedor.total`.
  * Pero el arqueo de caja real y el reporte de movimientos de tesorería leen exclusivamente de la tabla `movimientos_caja`.
  * Como los pagos a proveedores **jamás generan un movimiento de caja**, el dinero pagado a proveedores no se descuenta de los saldos de caja. Esto genera un descuadre estructural permanente entre el saldo contable de caja y la realidad física/bancaria.
* **Ficción Documental en la Documentación Interna:**
  * En [backend/src/routes/ai/docs/pagos-proveedores.md:16-19](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/ai/docs/pagos-proveedores.md#L16-L19), la guía del módulo declara:
    > *1. Selecciona la factura vencida o por pagar.*  
    > *2. Haz clic en Registrar Pago.*  
    > *3. Selecciona la cuenta bancaria u origen de fondos, ingresa el número de transacción y guarda el movimiento.*
  * **Realidad en código:** Nada de esto existe. El modal no existe, la selección de cuenta bancaria no existe y el registro de número de transacción bancaria no existe.
* **Comparativa Frente al Sistema Legacy:**
  * Según [docs/legacy-reference/comparativas-modulos/21-cobranza-proveedor-legacy-vs-actual-2026-05-28.md](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/docs/legacy-reference/comparativas-modulos/21-cobranza-proveedor-legacy-vs-actual-2026-05-28.md):
    * **Legacy:** Tenía pantallas dedicadas para cobranza y pagos con trazabilidad de cuenta de egreso y medios de pago.
    * **Actual:** Ganó integración con stock (`stock-ingresos`) y filtros unificados, pero **perdió la dimensión financiera y de egreso bancario**.

---

### 8. Seguridad

* **Manipulación Arbitraria de Totales:**
  * En `PUT /api/pagos-proveedores/:id` ([index.js:641](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L641)), si el documento no tiene stock aplicado, el usuario puede actualizar el campo `total` sin validación de esquema que restrinja montos negativos.
* **Falta de Trazabilidad e Inmutabilidad en Pagos:**
  * No existe un log de eventos contables ni tabla de auditoría para pagos.
  * Si un usuario marca un pago como "Pagado" y posteriormente otro usuario edita las observaciones, el campo `userMod` y `fecham` se sobrescriben, perdiéndose el registro de quién autorizó o ejecutó el pago originalmente.
* **IDOR y Fuga Multi-Tenant:**
  * Mitigado adecuadamente si el usuario tiene `sucursalId` asignado. No obstante, si un usuario posee rol administrativo sin sucursal fija (`sucursalId === null`), la API le permite mutar o anular pagos de cualquier sucursal mediante llamadas directas al endpoint sin validar ámbito comercial.

---

## Tabla de Hallazgos por Severidad

| ID | Severidad | Área | Descripción | Evidencia (`archivo:línea`) | Impacto de Negocio | Fix Propuesto | Esfuerzo |
|---|---|---|---|---|---|---|---|
| **PAG-01** | **Crítico** | **Datos** | Montos monetarios tipados como `Float` en lugar de `Decimal` o `Int`. | [schema.prisma:392, 397](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/prisma/schema.prisma#L392) | Inexactitud en centavos/pesos, descuadre contable y fiscal en declaraciones IVA F29. | Migrar columnas `total`, `nc_monto`, `precio` a `Decimal(12, 2)` o `Int` en BD. | Medio (2 días) |
| **PAG-02** | **Crítico** | **Backend** | Pagar un documento no crea movimiento de caja ni descuenta de ningún turno. | [index.js:608-678](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L608-L678) | Descuadre total entre la tesorería real y el módulo de pagos a proveedores. | Crear transacción en `PUT /:id` o endpoint dedicado `POST /:id/pagar` que inserte en `movimientos_caja`. | Alto (4 días) |
| **PAG-03** | **Crítico** | **Backend/UI**| Estado "Vencido" roto: KPI marca 0 por agrupar columna estática y pestaña muestra 0 filas. | [index.js:416-436](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L416-L436), [PagosProveedoresPage.jsx:256](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L256) | Cuentas vencidas no detectadas a tiempo; pestaña "Vencidos" inútil. | En backend, calcular vencidos con `WHERE estado = 'Pendiente' AND fecha_vencimiento < CURRENT_DATE`. | Bajo (4 horas) |
| **PAG-04** | **Alto** | **Frontend** | Desmontaje de tabla durante carga y omisión de captura de errores de red. | [PagosProveedoresPage.jsx:79, 245](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx#L79) | Pantalla congelada en "Cargando…", pérdida de controles y falsos vacíos. | Mantener `<Table>` montada con `emptyMessage` dinámico y añadir banner `isError` con reintento. | Bajo (2 horas) |
| **PAG-05** | **Alto** | **Seguridad** | Rol `cajero` bloqueado del módulo Pagos en menú Caja; bodeguero habilitado. | [TopBar.jsx:73](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/components/TopBar.jsx#L73), [permissions.js:31-37](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/utils/permissions.js#L31-L37) | Personal de caja no puede registrar egresos de proveedores asignados a mostrador. | Unificar módulo a `caja` o habilitar `canAny(['proveedores', 'caja'])` en ruta y menú. | Bajo (2 horas) |
| **PAG-06** | **Alto** | **Datos** | Falta de Foreign Key e integridad referencial con tabla `proveedores`. | [schema.prisma:383](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/prisma/schema.prisma#L383) | Pagos huérfanos si se depuran o fusionan proveedores en catálogo. | Declarar `@relation(fields: [proveedorId], references: [id])` en `schema.prisma`. | Medio (1 día) |
| **PAG-07** | **Medio** | **Backend** | Paginación rota: SQL pagina por fecha y Node.js reordena por RUT en memoria. | [index.js:440-447](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L440-L447) | Saltos incoherentes entre páginas; datos duplicados o saltados al paginar. | Mover el ordenamiento al `ORDER BY` de la consulta SQL (usando `proveedor.nombre`). | Bajo (3 horas) |
| **PAG-08** | **Medio** | **Backend** | Ausencia de índices en `fecha_vencimiento`, `fecha_doc` y `sucursal_id`. | [schema.prisma:411-414](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/prisma/schema.prisma#L411-L414) | Degradación severa del rendimiento con volumen real en producción. | Crear índices B-Tree en migration SQL para las 3 columnas y el compuesto de KPIs. | Bajo (2 horas) |
| **PAG-09** | **Medio** | **Seguridad** | `PUT /:id` permite guardar montos `total` negativos o cero sin validación. | [index.js:641](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L641) | Corrupción intencional o accidental de estadísticas y cuentas por pagar. | Validar que si `body.total` viene presente, sea número finito estrictamente mayor a 0. | Bajo (1 hora) |
| **PAG-10** | **Bajo** | **UX** | Contraste insuficiente e icono roto en logo del TopBar al fallar servidor de assets. | [TopBar.jsx:9, 419](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/components/TopBar.jsx#L9) | Imagen rota en cabecera y mala legibilidad sobre fondo verde institucional. | Reemplazar asset por versión en blanco/alto contraste y manejar fallback en `onError`. | Bajo (2 horas) |

---

## Backlog Priorizado de Corrección

### Fase 1: Quick Wins (Inmediato — < 1 día de desarrollo)
1. **Fix de UI en [PagosProveedoresPage.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx):**
   * Retirar el condicional que desmonta `<Table>`; mantener siempre visibles las pestañas, búsqueda y filtros.
   * Asignar `emptyMessage={isLoading ? 'Cargando pagos...' : isError ? 'Error al cargar pagos' : 'Sin pagos'}`.
   * Añadir captura de `isError, error, refetch` con banner visual y botón "Reintentar".
   * Mostrar `'...'` en KPIs mientras `isLoading === true`.
2. **Corrección de Lógica "Vencidos" en Backend:**
   * En [pagos-proveedores/index.js:406](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L406), modificar el filtro de vencidos para que `estado === 'Vencido'` aplique la condición SQL: `{ estado: { in: ['Pendiente', 'No pagada'] }, fechaVencimiento: { lt: new Date() } }`.
   * Corregir el cálculo de `stats.Vencido` para que cuente las facturas con fecha de vencimiento menor a hoy.
3. **Paginación SQL:**
   * Eliminar el `.sort()` en memoria de Node.js en [pagos-proveedores/index.js:440](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/backend/src/routes/pagos-proveedores/index.js#L440) para respetar el orden natural de la paginación.
4. **Validación de Cota en Totales:**
   * Rechazar con código 400 si se intenta actualizar un pago con `total <= 0`.

### Fase 2: Correcciones Estructurales (1 semana)
1. **Integración con Movimientos de Caja:**
   * Diseñar el flujo de pago real: al presionar "Pagar", abrir modal que solicite:
     * Medio de pago (Efectivo Caja / Transferencia Bancaria).
     * Caja o Cuenta Bancaria de origen.
     * Número de transacción / comprobante.
   * Ejecutar en una transacción Prisma la actualización del documento a `'Pagado'` junto con la inserción del correspondiente `MovimientoCaja` de tipo `Egreso` asociado al turno abierto del usuario.
2. **Migración de Tipos Numéricos en Base de Datos:**
   * Generar migración Prisma cambiando `Float` a `Decimal(12, 2)` en `pagos_proveedores` y `detalles_factura_proveedor`.
3. **Integridad Referencial:**
   * Agregar FK `@relation` hacia `Proveedor` y `Sucursal` con regla `onDelete: Restrict`.
4. **Índices de Rendimiento:**
   * Aplicar índices B-Tree en PostgreSQL para `fecha_vencimiento`, `fecha_doc`, `sucursal_id` y el índice compuesto para estadísticas de estado.

### Fase 3: Completitud Funcional y Brechas Legacy (Siguientes Sprints)
1. **Módulo de Abonos Parciales:** Crear entidad `AbonoPagoProveedor` para registrar múltiples pagos parciales sobre una misma factura.
2. **Desglose Contable F29:** Incorporar campos `neto`, `iva`, `exento` en la cabecera del documento.
3. **Gestor de Documentos Adjuntos:** Permitir adjuntar y previsualizar los PDFs y DTEs XML de respaldo.
4. **Normalización de Permisos:** Homogeneizar el módulo `'pagos-proveedores'` tanto en el catálogo de permisos extra como en los middlewares de autorización del backend.
