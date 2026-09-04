# Plan de Implementación — Convertir Pagos a Proveedores en Módulo de Tesorería

**Fecha:** 3 de Septiembre de 2026  
**Rama:** `feat/pagos-proveedores-tesoreria`  
**Estado:** Aprobado para ejecución  

---

## 1. Ajustes y Decisiones de Diseño Aprobadas

### 1.1 Permiso bajo el dominio `caja` (`caja.pagos_proveedores`)
* **Problema evitado:** Si el permiso dependiera de `proveedores.pagar`, el rol `bodeguero` (que posee `proveedores: ['read', 'write']`) lo heredaría por el mecanismo de fallback al módulo base, facultando a bodega a girar pagos.
* **Solución:**
  * Se crea la función `'caja.pagos_proveedores'` bajo el módulo `caja`.
  * **Rol `cajero`:** Posee `caja: ['read', 'write']`. Por regla de resolución jerárquica del RBAC, hereda automáticamente `'caja.pagos_proveedores': ['read', 'write']`, permitiéndole ingresar al módulo y registrar pagos/abonos.
  * **Rol `bodeguero`:** No posee el módulo `caja`. Se le asigna explícitamente `'caja.pagos_proveedores': ['read']` para que pueda consultar el estado de los documentos y recepciones sin facultades para girar dinero (`write`) ni anular (`delete`).
  * **Lectura de Proveedores para el Cajero:** El endpoint `GET /api/pagos-proveedores` enriquece los datos del proveedor (`nombre`, `rut`, `codigoProveedor`) directamente en el backend mediante `prisma.proveedor.findMany` dentro de `enrichPagos()`. El cajero **no requiere** permiso sobre el catálogo completo de proveedores para ver los datos en la pantalla ni en el detalle.
  * **TopBar y Router:** Se protegen las rutas `/pagos-proveedores` y `/pagos-proveedores/:id` con `module: 'caja.pagos_proveedores'`, `permission: 'read'`.
  * **Consistencia:** Se actualiza `backend/src/middleware/rbac.js`, `frontend/src/utils/permissions.js` y `backend/test/permisos-front-back-coinciden.test.js`.

### 1.2 Precisión Monetaria (`Decimal`, nunca `Float`)
* Todos los campos de dinero nuevos se crean como `Decimal(12, 2)` en PostgreSQL y Prisma:
  * `montoPagado`, `saldo`, `neto`, `iva`, `exento` en `model PagoProveedor`.
  * `monto` en `model AbonoPagoProveedor`.
* **Tratamiento de deuda técnica existente:** Los campos `total` y `ncMonto` (actualmente `Float`) se convierten a `Prisma.Decimal` (`new Prisma.Decimal(total.toFixed(2))`) en toda la lógica financiera para erradicar cualquier acumulación de residuos de coma flotante IEEE 754.

### 1.3 Tratamiento de Notas de Crédito (`nc`, `ncMonto`)
* **Regla Contable:** Una Nota de Crédito emitida por el proveedor reduce el pasivo exigible:
  $$\text{montoEfectivo} = \begin{cases} \max(0, \text{total} - \text{ncMonto}) & \text{si } nc = \text{true} \text{ y } ncMonto > 0 \\ \text{total} & \text{en caso contrario} \end{cases}$$
  $$\text{saldo} = \max(0, \text{montoEfectivo} - \text{montoPagado})$$
* **Transición de Estados:**
  * Si $\text{saldo} \le 0$: `estado = 'Pagado'`.
  * Si $\text{montoPagado} > 0$ y $\text{saldo} > 0$: `estado = 'Abonado'`.
  * Si $\text{montoPagado} = 0$: `estado = 'Pendiente'`.
  * Si una factura tiene una NC por el 100% de su valor ($\text{ncMonto} = \text{total}$), su saldo exigible es 0 y queda automáticamente en estado `'Pagado'`.

### 1.4 Idempotencia y Doble POST
* Bloqueo advisory a nivel de transacción: `SELECT pg_advisory_xact_lock(hashtext('pago-proveedor-abono:' || id)::bigint)`.
* Lectura pesimista con bloqueo de fila `FOR UPDATE` sobre `catalogo.pagos_proveedores`.
* Validación de saldo remanente dentro de la transacción: si una petición concurrente o reintento idéntico ya consumió el saldo (`monto > saldo` o `estado = 'Pagado'`), la transacción se rechaza de inmediato con código 400 y mensaje explicativo, impidiendo la duplicación de `MovimientoCaja`.

### 1.5 Corrección de Defectos de UI Diagnosticados
* Reestructuración de [PagosProveedoresPage.jsx](file:///c:/Users/flipe/OneDrive/Documentos/New%20project%204/plastimar/frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx):
  * La `<Table>` se mantiene montada permanentemente, evitando el desmontaje abrupto ante `isLoading = true`.
  * Manejo de `emptyMessage` dinámico (`'Cargando pagos...'` / `'Sin pagos'`).
  * Banner de error explícito con botón de reintento ante fallos de conexión.
  * Botones de exportación CSV habilitados dinámicamente según resultados reales.

---

## 2. Plan de Ejecución por Pilares (1 → 5)

```
┌───────────────────────────┐
│ PILAR 1: Tesorería & Caja │ ──> Registro de pago atómico, egreso en turno abierto, bancos
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ PILAR 2: Abonos Parciales │ ──> Modelo AbonoPagoProveedor, historial, saldo, NCs, idempotencia
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ PILAR 3: Vencimientos & UI│ ──> SQL dinámico para vencidos, KPIs, semáforo y fixes de UI
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ PILAR 4: Desglose & DTEs  │ ──> Neto/IVA F29, enlace a PDF/XML SII, subida de comprobantes
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ PILAR 5: Roles y RBAC     │ ──> caja.pagos_proveedores, cajero con permisos, bodega acotada
└───────────────────────────┘
```

### Pilar 1: Conexión con Tesorería y Movimientos de Caja
1. Crear migración Prisma con nuevos modelos y campos.
2. Implementar endpoint `POST /api/pagos-proveedores/:id/abonos`.
3. Validar origen de fondos:
   * **Caja:** Bloquear con error 400 si no existe turno abierto (`withTurnoSucursalScope`). Si existe, insertar `MovimientoCaja` con `tipo = 'Egreso'`, `origenTipo = 'pago_proveedor'`.
   * **Banco:** Registrar egreso con cuenta y N° de transferencia para conciliación bancaria.
4. Implementar reversa auditable en `POST /:id/abonos/:abonoId/anular` (marca `eliminado = true, estadoDoc = 'Nula'`).

### Pilar 2: Abonos Parciales y Lógica de Saldo
1. Modelo `AbonoPagoProveedor` con FK y relación a `MovimientoCaja`.
2. Cálculo de `montoPagado` y `saldo` respetando `ncMonto`.
3. Máquina de estados: `Pendiente` → `Abonado` → `Pagado` / `Anulado`.
4. Pruebas de idempotencia contra doble POST concurrente.

### Pilar 3: Vencimientos, Flujo Proyectado y Corrección de UI
1. Cálculo de "Vencidos" en SQL: `fechaVencimiento < CURRENT_DATE AND saldo > 0`.
2. Tarjetas KPI de tesorería: *Por pagar esta semana*, *Por pagar este mes*, *Vencidos*, *Saldo total*.
3. Semáforo visual en frontend: días para vencer o días de atraso.
4. Corrección de los defectos de UI (tabla desmontada, falsos vacíos y CSV).

### Pilar 4: Desglose Tributario (F29) y Respaldos
1. Campos `neto`, `iva`, `exento` en `PagoProveedor`.
2. Migración de registros existentes estimando 19% IVA en facturas.
3. Botón para previsualizar PDF y descargar XML de DTEs recibidos de proveedores.
4. Endpoint de carga de comprobantes de transferencia a `UPLOADS_DIR`.

### Pilar 5: Alineación de Roles y Permisos (RBAC)
1. Declarar `'caja.pagos_proveedores'` en `backend/src/middleware/rbac.js` y `frontend/src/utils/permissions.js`.
2. Asignar permisos: `cajero` (read + write), `bodeguero` (read), `admin` (completo).
3. Actualizar `TopBar.jsx` y `router.jsx`.
4. Verificar paso de tests de concordancia de permisos.

---

## 3. Verificación Automatizada

* Suite dedicada: `backend/test/pagos-proveedores-tesoreria.test.js`.
* Suite de concordancia: `backend/test/permisos-front-back-coinciden.test.js`.
* Suite de stock: `backend/test/pagos-proveedores-stock.test.js`.
