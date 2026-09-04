# CIERRE DE IMPLEMENTACIÓN — MÓDULO PAGOS A PROVEEDORES (TESORERÍA)

**Fecha de Cierre:** 3 de Septiembre de 2026  
**Rama de Trabajo:** `feat/pagos-proveedores-tesoreria`  
**Modo:** Estrictamente Local (PostgreSQL local en puerto 55432, sin push a remoto)  
**Plan de Referencia:** [`auditoria-cierre/PLAN_PAGOS_PROVEEDORES_TESORERIA.md`](./PLAN_PAGOS_PROVEEDORES_TESORERIA.md)  
**Auditoría Previa:** [`auditoria-cierre/AUDITORIA_PAGOS_PROVEEDORES.md`](./AUDITORIA_PAGOS_PROVEEDORES.md)

---

## 1. Resumen Ejecutivo

El módulo de **Pagos a Proveedores** fue transformado de un registro estático de estados a un **módulo operativo de tesorería y gestión de egresos**.

Durante la primera fase de entrega se detectaron 4 regresiones en la suite global de pruebas (reportadas en la auditoría de control gerencial). Esta versión final documenta la resolución integral de las 4 regresiones, la verificación de concurrencia real contra PostgreSQL, la corrección de los permisos RBAC y la ejecución del 100% de la suite de pruebas del backend (1088/1088 pruebas aprobadas en 125 archivos de prueba).

---

## 2. Resolución de Regresiones y Ajustes Críticos

### 2.1. Regresión en `stats.facturasNoPagadas` (`test/cobranza-pagos-proveedores.test.js`)
- **Causa Raíz:** Al reescribir la agregación de estadísticas en `backend/src/routes/pagos-proveedores/index.js`, se introdujo la condición `saldo: { gt: 0 }` para `facturasNoPagadas`. En las pruebas unitarias y en registros históricos creados directamente vía Prisma sin pasar por el cálculo de negocio, el campo `saldo` mantiene su valor por defecto `0.00` con `estado: 'Pendiente'`. Por tanto, el contador devolvía `0` en vez del número real de documentos impagos.
- **Solución Implementada:** Se restauró la función de ámbito `noPagadaDocumentoWhere(user, documento)`, la cual busca documentos con:
  ```javascript
  {
    eliminado: false,
    ...(userSucursalId ? { sucursalId: userSucursalId } : {}),
    ...(documentoWhere(documento) || { documento }),
    estado: { in: ['Pendiente', 'No pagada', 'No pagado', 'Abonado', 'Abonada', 'Vencido', 'Vencida'] }
  }
  ```
  Esto garantiza que el conteo refleje todos los documentos pendientes o con abonos parciales dentro de la sucursal del usuario, independientemente de si provienen de datos históricos o de la nueva lógica de saldo.
- **Resultado:** `test/cobranza-pagos-proveedores.test.js` pasa al 100% (3/3 tests).

---

### 2.2. Regresión de Permisos RBAC en Rutas de Proveedores (`test/proveedores.test.js`)
- **Causa Raíz:** Al aplicar el permiso `caja.pagos_proveedores: write` sobre `POST /api/pagos-proveedores`, se bloqueó al rol `bodeguero` (que solo posee `proveedores: ['read', 'write']` y `'caja.pagos_proveedores': ['read']`). En el flujo operativo del ERP, el bodeguero es quien recibe la mercadería y registra la factura física del proveedor al ingresar el stock. Al restringir la creación del documento solo a caja, las peticiones del bodeguero rebotaban con HTTP 403 Forbidden antes de validar la existencia del proveedor (esperado 404) o detectar duplicados (esperado 409).
- **Decisión de Diseño y Arquitectura:**
  1. **Separación estricta entre Registrar Documento y Pagar:**
     - **Crear / Editar Documento de Proveedor:** Corresponde tanto a Adquisiciones/Bodega (recepción de compras) como a Tesorería. Por ello, `POST /api/pagos-proveedores`, `PUT /api/pagos-proveedores/:id`, `GET /api/pagos-proveedores` y las rutas anidadas de proveedores aceptan `['proveedores', 'caja.pagos_proveedores']`.
     - **Registrar Abono / Salida de Dinero (`POST /:id/abonos`):** Es **exclusivo de Tesorería** (`caja.pagos_proveedores: 'write'`). El bodeguero tiene prohibido el pago y no puede generar egresos en caja chica ni transferencias.
  2. **Vigencia de la Ruta Anidada (`/api/proveedores/:id/pagos`):**
     - La ruta anidada **no se depreca**. Se mantiene plenamente operativa como la ficha contable del proveedor en el módulo de compras, asegurando compatibilidad con el frontend y pruebas legadas. Al crear registros por esta vía, ahora se inicializan también `montoPagado = 0` y `saldo = max(0, total - ncMonto)`.
  3. **Soporte de Múltiples Módulos en RBAC:**
     - Se dotó a `can(role, module, permission)` en `backend/src/middleware/rbac.js` y `frontend/src/utils/permissions.js` de soporte nativo para arreglos de módulos (`Array.isArray(module)`), permitiendo sintaxis declarativa limpia: `fastify.rbac(['proveedores', 'caja.pagos_proveedores'], 'write')`.
- **Resultado:** `test/proveedores.test.js` pasa al 100% (15/15 tests).

---

### 2.3. Verificación de Concurrencia Real, Advisory Lock y Restricción Estructural
- **Problema Diagnosticado:** Los tests iniciales empleaban mocks/stubs de Prisma (`$queryRaw: vi.fn()`, `$transaction: vi.fn()`), convirtiendo el advisory lock y la transacción en no-ops.
- **Implementación de Pruebas de Integración con Base Local (`buildRealApp`):**
  Se incorporaron 2 pruebas de concurrencia real en `backend/test/pagos-proveedores-tesoreria.test.js` que se ejecutan contra el PostgreSQL local (puerto 55432):
  1. **Doble POST Concurrente de Abono Total (100%):**
     - Dos peticiones simultáneas (`Promise.all`) intentan abonar `$100.000` sobre una factura de `$100.000` con `origenFondos: 'Caja'`.
     - `pg_advisory_xact_lock` + `SELECT FOR UPDATE` serializan la ejecución.
     - **Resultado:** Exactamente 1 petición responde con HTTP 201 (Abono creado) y la otra es rechazada con HTTP 400 (`"El documento ya fue pagado en su totalidad"`). En la base de datos se crea exactamente 1 registro en `AbonoPagoProveedor` y exactamente 1 `MovimientoCaja` de Egreso por `$100.000`. El saldo final es `$0.00` con estado `'Pagado'`.
  2. **Doble POST Concurrente de Abonos Parciales que Suman Exceso:**
     - Dos peticiones simultáneas intentan abonar `$60.000` cada una sobre una factura de `$100.000` (suma = `$120.000`).
     - **Resultado:** La primera descuenta `$60.000` (quedando saldo `$40.000`), y la segunda es rechazada con HTTP 400 (`"Monto ($60000) excede el saldo pendiente ($40000.00)"`). En la base de datos queda exactamente 1 abono por `$60.000` y saldo `$40.000` con estado `'Abonado'`.
- **Segunda Línea de Defensa Estructural:**
  - En la migración `20260903120000_pagos_proveedores_tesoreria` se definió un **índice único parcial**:
    ```sql
    CREATE UNIQUE INDEX "abonos_pagos_proveedores_movimiento_caja_id_key" 
    ON "catalogo"."abonos_pagos_proveedores"("movimiento_caja_id") 
    WHERE "movimiento_caja_id" IS NOT NULL;
    ```
  - Esta restricción a nivel de motor PostgreSQL es más robusta que el bloqueo lógico: garantiza que ningún fallo de concurrencia o de código de aplicación pueda jamás vincular dos veces un mismo movimiento de caja a múltiples abonos.

---

### 2.4. Normalización de Diff en `frontend/src/utils/permissions.js`
- **Diagnóstico:** El archivo `frontend/src/utils/permissions.js` mostraba un diff de 253 líneas en Git (-126, +127) a pesar de haber modificado solo una línea conceptual. La causa fue una conversión involuntaria de saltos de línea (CRLF a LF) provocada por el editor.
- **Corrección:** Se restauraron los saltos de línea nativos (`CRLF`). El diff en Git ahora refleja con exactitud quirúrgica las únicas líneas agregadas:
  ```diff
  @@ -27,6 +27,7 @@ export const ROLE_PERMISSIONS = {
       ventas: ['read'],
       clientes: ['read'],
       proveedores: ['read', 'write'],
  +    'caja.pagos_proveedores': ['read'],
     },
     cajero: {
  ```
  Adicionalmente se añadió el soporte de arreglos en la función `can()` para alinearla con el backend.

---

## 3. Estado de la Suite Completa de Pruebas (Vitest)

Se ejecutó la suite completa del backend (`npx vitest run`):

```text
Test Files: 125 passed (125)
Tests:      1088 passed (1088)
Errors:     0
```

### Detalle de Suites Relevantes del Módulo:
- `test/pagos-proveedores-tesoreria.test.js`: **17/17 pasados** (cálculo Decimal, abonos banco/caja, validación de turnos, reversas, RBAC y concurrencia real).
- `test/pagos-proveedores-stock.test.js`: **6/6 pasados** (ingreso y reversa física de stock).
- `test/cobranza-pagos-proveedores.test.js`: **3/3 pasados** (alcance y filtrado por sucursal).
- `test/proveedores.test.js`: **15/15 pasados** (gestión de proveedores, duplicados y ficha de pagos).
- `test/permisos-front-back-coinciden.test.js`: **3/3 pasados** (matriz RBAC 1:1 entre frontend y backend).
- Resto de módulos (Ventas, Caja, Taller, Facturación, CRM, RRHH): **1044/1044 pasados**.

---

## 4. Matriz Final de Control y Permisos

| Rol | Ver Pagos | Registrar Documento Proveedor | Pagar / Abonar (Caja o Banco) | Anular Pago / Abono |
|---|:---:|:---:|:---:|:---:|
| **Admin** | Sí | Sí | Sí | Sí |
| **Cajero** | Sí | Sí | Sí | No |
| **Bodeguero** | Sí | Sí | **No** (Bloqueado por RBAC) | **No** |
| **Vendedor / Taller** | No (403) | No (403) | No (403) | No (403) |

---

## 5. Resumen de Commits en `feat/pagos-proveedores-tesoreria`

1. `5dbc17f`: `docs(plan): versionar plan aprobado de tesoreria para pagos proveedores`
2. `274e770`: `feat(rbac): agregar funcion caja.pagos_proveedores alineando cajero y bodega`
3. `45c5aad`: `feat(pagos-proveedores): schema y migracion para tesoreria, abonos y precision decimal`
4. `3bbcdad`: `feat(pagos-proveedores): implementar abonos, tesoreria, precision decimal y permisos de caja`
5. `4128c3b`: `feat(pagos-proveedores): UI tesoreria, modal de abonos, KPIs, vinculo DTE y correccion de bugs`
6. `e5ff383`: `docs(cierre): informe final de implementacion de pagos a proveedores tesoreria`
7. *(Siguiente commit)*: `fix(pagos-proveedores): corregir stats de facturas impagas, rbac dual y pruebas de concurrencia real`

Todos los cambios residen exclusivamente en la rama local `feat/pagos-proveedores-tesoreria`, sin interacción remota ni impacto en producción.
