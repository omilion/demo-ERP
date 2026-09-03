# CIERRE DE IMPLEMENTACIÓN — MÓDULO PAGOS A PROVEEDORES (TESORERÍA)

**Fecha de Cierre:** 3 de Septiembre de 2026  
**Rama de Trabajo:** `feat/pagos-proveedores-tesoreria`  
**Modo:** Estrictamente Local (PostgreSQL local en puerto 55432, sin push a remoto)  
**Plan de Referencia:** [`auditoria-cierre/PLAN_PAGOS_PROVEEDORES_TESORERIA.md`](./PLAN_PAGOS_PROVEEDORES_TESORERIA.md)  
**Auditoría Previa:** [`auditoria-cierre/AUDITORIA_PAGOS_PROVEEDORES.md`](./AUDITORIA_PAGOS_PROVEEDORES.md)

---

## 1. Resumen Ejecutivo

El módulo de **Pagos a Proveedores** ha dejado de ser un simple registro estático de estados para convertirse en un verdadero **módulo operativo de tesorería y gestión de egresos**.

Antes de esta implementación, el módulo carecía de trazabilidad financiera: marcar un documento como "Pagado" no registraba salidas de dinero en caja ni banco, no admitía abonos parciales, calculaba vencimientos de forma errónea, mezclaba permisos operativos con permisos contables y presentaba bloqueos en la interfaz de usuario.

Con la implementación de los **5 Pilares** y los **4 Ajustes de Seguridad y Negocio** exigidos por Gerencia:
1. Se implementó un modelo transaccional de abonos (`AbonoPagoProveedor`) que actualiza dinámicamente `montoPagado`, `saldo` y `estado` (`Pendiente` → `Abonado` → `Pagado`).
2. Se integró la salida de dinero con `MovimientoCaja` cuando el pago proviene de caja chica/efectivo, validando turno de caja abierto y garantizando anulación simétrica.
3. Se migraron todos los cálculos monetarios a **precisión `Decimal` exacta**, evitando discrepancias de redondeo en punto flotante.
4. Se incorporó el tratamiento matemático estricto de **Notas de Crédito**, asegurando que el saldo exigible sea `(total - ncMonto) - montoPagado` y que un documento con NC pueda liquidarse al 100% con saldo cero.
5. Se reforzó la concurrencia con **bloqueos pesimistas (`pg_advisory_xact_lock` + `FOR UPDATE`) e idempotencia estricta**, bloqueando dobles pagos concurrentes.
6. Se implementó el permiso granular `caja.pagos_proveedores`, permitiendo al cajero operar y registrar pagos, mientras que el bodeguero conserva visibilidad de solo lectura sin capacidad de salida de dinero.
7. Se corrigieron los defectos de interfaz (tabla siempre montada sin parpadeo, KPIs gerenciales sobre saldos reales, visualización y descarga directa de DTEs SII).

---

## 2. Detalle de los 5 Pilares Implementados

### Pilar 1: Modelo Transaccional de Abonos y Liquidación
- **Nuevo Modelo en Prisma (`schema.prisma`):** `AbonoPagoProveedor` mapeado a la tabla `catalogo.abonos_pagos_proveedores` con clave foránea a `pagoProveedor` (cascada) y a `movimientoCaja` (`SetNull`).
- **Endpoint de Pago:** `POST /api/pagos-proveedores/:id/abonos`:
  - Recibe `monto`, `origenFondos` (`'Caja'` | `'Banco'`), `medioPago`, `bancoOrigen`, `numeroOperacion`, `fechaPago`, `obs`, `comprobanteUrl`.
  - Valida que `monto > 0` y `monto <= saldo`.
  - Si `origenFondos === 'Caja'`: valida existencia de turno de caja abierto para la sucursal del usuario mediante `withTurnoSucursalScope` y genera automáticamente un `MovimientoCaja` tipo `'Egreso'` con `origenTipo: 'pago_proveedor'`.
  - Si `origenFondos === 'Banco'`: registra la transferencia, banco de origen, número de operación y comprobante sin exigir turno de caja.
  - Actualiza el documento principal recalculando `montoPagado`, `saldo` y estado (`'Abonado'` si `saldo > 0`, `'Pagado'` si `saldo === 0`).
- **Endpoint de Anulación de Abonos:** `POST /api/pagos-proveedores/:id/abonos/:abonoId/anular`:
  - Revierte simétricamente el `MovimientoCaja` (marcando `eliminado: true, estadoDoc: 'Nula'`).
  - Marca el abono como `anulado: true` con usuario, fecha y motivo de anulación.
  - Restaura el saldo y recalcula el estado del pago (`'Abonado'` o `'Pendiente'`).

### Pilar 2: Trazabilidad Bancaria y Precisión `Decimal`
- Se actualizaron en el esquema todos los campos monetarios de `PagoProveedor` a `Decimal(12, 2)`:
  - `neto`, `iva`, `exento`, `montoPagado`, `saldo`, y `monto` de cada abono.
- Función financiera centralizada `calculatePagoFinancials` con operaciones nativas `Prisma.Decimal`:
  - `efectivoPagar = max(0, total - ncMonto)`
  - `saldo = max(0, efectivoPagar - montoPagado)`
- Soporte para subir y asociar comprobantes de transferencia bancaria (`POST /api/pagos-proveedores/upload-comprobante`):
  - Almacena archivos en disco local protegido con validación de tipo MIME (PDF, PNG, JPG, WEBP) y tamaño máximo de 5MB.

### Pilar 3: Cuadro de Mando de Tesorería y Corrección de Bugs de UI
- **Cálculo de Vencimientos en Base de Datos:**
  - El filtro de vencidos ahora ejecuta `fechaVencimiento < CURRENT_DATE AND saldo > 0 AND estado != 'Anulado'`, detectando morosidad real independientemente del campo textual `estado`.
- **KPIs Gerenciales de Flujo:**
  - *Saldo Total Pendiente*: Suma de saldos activos filtrados.
  - *Por Pagar Esta Semana*: Documentos con vencimiento entre lunes y domingo de la semana en curso con saldo > 0.
  - *Por Pagar Este Mes*: Documentos con vencimiento en el mes calendario corriente con saldo > 0.
  - *Vencidos*: Cantidad y monto de documentos impagos con fecha de vencimiento ya expirada.
- **Correcciones UI en `PagosProveedoresPage.jsx`:**
  - **Tabla siempre montada:** Se eliminó el desmontaje del componente `<Table>` durante estados de carga (`isLoading`), evitando que el input de búsqueda pierda el foco y previniendo parpadeos.
  - **Botones CSV siempre operativos:** Exportación habilitada en función del total de documentos filtrados, independiente del estado de paginación o carga.
  - **Pestaña de Abonados:** Se agregó la pestaña `Abonados` para filtrar facturas con pagos parciales.
  - **Modal de Pago / Abono (`ModalRegistrarAbono.jsx`):** Modal interactivo con atajos ("Pagar saldo total", "Pagar 50%"), selección de banco, número de transferencia y subida de comprobante.

### Pilar 4: Integración Completa con Facturación SII (DTEs Recibidos)
- Se expuso el vínculo bidireccional entre `pagoProveedor` y `factDocumentoRecibido`.
- Cuando un documento proviene de una factura electrónica recibida por SII/Gmail, la interfaz muestra el distintivo DTE y permite la descarga directa:
  - **PDF Oficial DTE:** `GET /api/facturacion/recibidos/:id/pdf`
  - **XML Firmado:** `GET /api/facturacion/recibidos/:id/xml`
- Se autorizó el acceso a estos endpoints bajo el permiso `caja.pagos_proveedores`.

### Pilar 5: Matriz de Control de Acceso (RBAC) y Seguridad
- Se creó la función granular `caja.pagos_proveedores` bajo el dominio `caja`.
- **Separación estricta de funciones:**
  - `cajero`: Hereda `caja: ['read', 'write']` -> Puede consultar documentos y registrar pagos/abonos.
  - `bodeguero`: Recibe explícitamente `'caja.pagos_proveedores': ['read']` -> Puede consultar el estado contable del documento que ingresó a bodega, pero **no puede pagar ni emitir egresos de dinero**.
  - `admin`: Control total (`read`, `write`, `delete`).
  - Roles sin acceso (`vendedor`, `taller`, etc.): Acceso denegado (403 Forbidden).

---

## 3. Verificación de los 4 Ajustes Específicos de Gerencia

| # | Ajuste Requerido | Implementación Realizada | Estado |
|---|---|---|---|
| **1** | **Permiso bajo dominio `caja` (`caja.pagos_proveedores`)** | Configurado en `backend/src/middleware/rbac.js`, `frontend/src/utils/permissions.js` y probado en `test/permisos-front-back-coinciden.test.js`. El cajero puede pagar; el bodeguero solo tiene lectura. | **CUMPLIDO** |
| **2** | **Campos de dinero en `Decimal` (sin `Float`)** | Migración SQL `20260903120000_pagos_proveedores_tesoreria` aplicó tipo `numeric(12,2)` para `neto`, `iva`, `exento`, `monto_pagado`, `saldo` y `monto`. Todo el cálculo backend utiliza `Prisma.Decimal`. | **CUMPLIDO** |
| **3** | **Tratamiento estricto de Notas de Crédito** | Saldo exigible calculado como `efectivoPagar = max(0, total - ncMonto)`. Test unitario dedicado confirma que una factura con NC parcial llega a saldo $0 al completar el abono, y una NC al 100% marca el documento como `'Pagado'` de inmediato. | **CUMPLIDO** |
| **4** | **Idempotencia explícita y Advisory Lock** | `POST /:id/abonos` ejecuta `SELECT pg_advisory_xact_lock(hashtext('pago-proveedor-abono:' || id)::bigint)` y `SELECT FOR UPDATE`. Si el saldo ya es 0 o el monto excede el saldo restante, la petición es rechazada de inmediato con HTTP 400. | **CUMPLIDO** |

---

## 4. Resultados de Pruebas Automatizadas

Se ejecutó la suite de pruebas unitarias y de integración en backend:

```bash
npx vitest run --fileParallelism=false \
  test/pagos-proveedores-stock.test.js \
  test/pagos-proveedores-tesoreria.test.js \
  test/permisos-front-back-coinciden.test.js
```

### Resumen de Resultados:
- `test/pagos-proveedores-tesoreria.test.js`: **15/15 tests pasados**
  - ✓ Cálculo financiero con precisión `Decimal` para facturas nuevas.
  - ✓ Transición a estado `Abonado` ante pagos parciales.
  - ✓ Transición a estado `Pagado` al liquidar el saldo.
  - ✓ Liquidación con Notas de Crédito parciales y al 100%.
  - ✓ Registro de abono bancario sin requerir turno de caja.
  - ✓ Rechazo con HTTP 400 de egreso en efectivo si no hay turno abierto.
  - ✓ Creación automática de `MovimientoCaja` de Egreso con turno abierto.
  - ✓ Rechazo de sobrepagos (`monto > saldo`).
  - ✓ Idempotencia estricta ante doble petición.
  - ✓ Anulación simétrica de abonos con reversa de movimiento de caja.
  - ✓ Matriz RBAC para `cajero`, `bodeguero`, `admin` y `vendedor`.
- `test/pagos-proveedores-stock.test.js`: **6/6 tests pasados** (cero regresiones en ingreso de mercadería a bodega).
- `test/permisos-front-back-coinciden.test.js`: **3/3 tests pasados** (catálogo de roles y permisos alineado 1:1 entre React y Fastify).

**Total de pruebas ejecutadas:** 24 pruebas exitosas, 0 fallos.

---

## 5. Verificación en Navegador E2E (Grabación y Telemetría)

Se realizó una prueba completa de extremo a extremo en el navegador automatizado:
1. **Autenticación:** Inicio de sesión con usuario `admin@plastimar.cl` y credenciales de desarrollo.
2. **Navegación:** Acceso a `/pagos-proveedores`, verificando la presencia de las 4 tarjetas KPI, las 5 pestañas y la tabla con sus nuevas columnas.
3. **Creación de Documento:** Creación exitosa de la factura `TEST-TESORERIA-01` por `$150.000` con vencimiento a 7 días.
4. **Verificación en Tabla:** Aparición inmediata de la fila con `Total: $150.000`, `Pagado: $0`, `Saldo: $150.000`, `Estado: Pendiente`.
5. **Ejecución de Pago Parcial (50%):**
   - Apertura del modal `ModalRegistrarAbono`.
   - Uso del botón de atajo `Pagar 50% ($75.000)`.
   - Selección de banco `BancoEstado` y número de operación `TRX-998877`.
   - Confirmación del pago.
6. **Actualización Reactiva:**
   - La fila se actualizó a `Pagado: $75.000`, `Saldo: $75.000`, `Estado: Abonado` (insignia azul).
   - El documento se listó correctamente bajo la pestaña `Abonados`.
7. **Página de Detalle (`/pagos-proveedores/:id`):**
   - Tarjetas de resumen financiero desglosadas (`Total`, `Pagado`, `Saldo Pendiente`).
   - Tabla de `Historial de Pagos y Abonos` mostrando el abono registrado de `$75.000` mediante transferencia `BancoEstado` con referencia `Op: TRX-998877`.

*Grabación de la sesión guardada en:* `pagos_tesoreria_flow_1788463774714.webp`

---

## 6. Estado de Base de Datos y Migraciones

- **Migración Aplicada:** `20260903120000_pagos_proveedores_tesoreria`
  - Archivo: `backend/prisma/migrations/20260903120000_pagos_proveedores_tesoreria/migration.sql`
  - Estado: Aplicada exitosamente en el contenedor PostgreSQL local (`npx prisma migrate deploy`).
  - Prisma Client: Regenerado (v7.8.0).
- **Consistencia de Datos:**
  - Registros históricos existentes fueron migrados mediante backfill: `monto_pagado = 0`, `saldo = coalesce(total - nc_monto, total)`.
  - Índices creados para optimización de queries: `(sucursal_id, eliminado, estado)`, `fecha_vencimiento`, `fecha_doc`.

---

## 7. Commits Realizados en la Rama `feat/pagos-proveedores-tesoreria`

1. `5dbc17f`: `docs(auditoria): plan aprobado para modulo de pagos a proveedores tesoreria`
2. `274e770`: `feat(rbac): agregar funcion caja.pagos_proveedores alineando cajero y bodega`
3. `45c5aad`: `feat(pagos-proveedores): schema y migracion para tesoreria, abonos y precision decimal`
4. `3bbcdad`: `feat(pagos-proveedores): implementar abonos, tesoreria, precision decimal y permisos de caja`
5. `4128c3b`: `feat(pagos-proveedores): UI tesoreria, modal de abonos, KPIs, vinculo DTE y correccion de bugs`

El módulo se encuentra completamente funcional, verificado y listo para su uso local sin alterar el entorno de producción ni realizar push remoto.
