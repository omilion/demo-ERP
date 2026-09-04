# Matriz ejecutada de tipos de venta — 2026-09-02

## Alcance y resguardo

- Base usada: `plastimar_test` exclusivamente.
- Marca de trazabilidad: `E2E-VENTAS-20260902145729`.
- No se modificó producción, no se emitió DTE ni se llamó al SII. La validación fiscal queda separada de esta matriz; la traza previa `E2E-TRAZA-20260902144346` conserva una guía DTE 52 en borrador, sin folio ni `trackId`.
- Evidencia persistente: `AuditLog` **5703**, entidad `e2e_sales_lifecycle_matrix`.

La ejecución usa [create-sales-lifecycle-matrix.mjs](../../backend/scripts/create-sales-lifecycle-matrix.mjs), que se niega a correr si `DATABASE_URL` no contiene `plastimar_test`.

## Roles y datos de prueba

| Rol | Usuario ID | Acción comprobada |
|---|---:|---|
| Vendedor | 205 | Creación de los ocho tipos y edición previa a cobro. |
| Bodega | 206 | Entrega parcial/final y avance de flujo. |
| Caja | 208 | Apertura/cierre de turno, documento referencial y cobros. |
| Administrador | 207 | Anulación auditada de Venta Sala. |

Sucursal **6**, caja **10**, turno **128**, cliente **27897**, producto inventariado **44747** y cargo de embalaje **85** son exclusivos de esta traza.

## Resultado por tipo de venta

Todas las ventas de la tabla quedaron con `estadoPago=Pagada`, `estadoEntrega=Entregada` y `estadoFlujoFormal=CERRADA`.

| Tipo | Venta / interno | Total | Kardex al crear | Evidencia especial |
|---|---:|---:|---|---|
| Normal | 20399 / 970095612 | $1.250 | Egreso −1, mov. 2211 | Observación editada y cargo de embalaje antes de cobrar. |
| Licitación | 20400 / 970095613 | $1.000 | Egreso −1, mov. 2212 | Cotización vinculada 19605; ID `E2E-VENTAS-20260902145729-LIC`. |
| Compra Ágil | 20401 / 970095614 | $1.000 | Sin movimiento | Cierre comercial y operativo correcto. Ver decisión de stock. |
| Convenio Marco | 20402 / 970095615 | $1.000 | Egreso −1, mov. 2213 | OC única `E2E-VENTAS-20260902145729-OC-CM`. |
| Trato Directo | 20403 / 970095616 | $1.000 | Sin movimiento | Cierre comercial y operativo correcto. Ver decisión de stock. |
| Venta Web | 20404 / 970095617 | $2.000 | Egreso −2, mov. 2214 | Abono y entrega parciales antes de completar y cerrar. |
| Venta Sala (reintento) | 20407 / 970095620 | $1.000 | Egreso −1, mov. 2218 | Consumidor final anónimo, creada después de anular el intento. |
| Marketplace | 20406 / 970095619 | $1.000 | Egreso −1, mov. 2216 | Mercado Libre, referencia externa y comisión de 12% ($120). |

## Anulación y reintento

La Venta Sala inicial **20405** / interno **970095618** se creó sin cliente, se anuló mediante `POST /api/ventas/20405/anular` y no se reutilizó. Su estado quedó:

| Dato | Resultado |
|---|---|
| Estado de venta | `Nula` / `eliminada=true` |
| Estado formal | `ANULADA` |
| Kardex | Egreso −1 e ingreso +1; el stock pasó de 93 a 94 al anular. |
| Continuidad | Se creó una nueva Venta Sala 20407 y se terminó normalmente. |

Durante la primera ejecución se detectó que la anulación sólo actualizaba `estado` y `eliminada`; el flujo formal quedaba en `CREADA`. Se corrigió en los endpoints auditados de anulación y eliminación, y la reactivación administrativa vuelve de `ANULADA` a `CREADA` dejando un historial inmutable. La prueba de ventas confirmó esa conducta.

## Interfaz comprobada

En `http://127.0.0.1:5173/ventas/20406` se confirmó, tras recargar la ficha, que el detalle muestra:

- canal: **Mercado Libre**;
- referencia externa: `E2E-VENTAS-20260902145729-ML-1`;
- comisión: **12% · $120**;
- permiso de envíos parciales.

La misma sección permaneció visible a 390 px de ancho. Antes de este cambio, esos campos existían en base y en el formulario, pero quedaban ocultos en el detalle de venta.

## Verificaciones reproducibles

```powershell
Set-Location D:\plastimar-erp-v2\backend
node --env-file=.env.test.docker scripts/create-sales-lifecycle-matrix.mjs
node --env-file=.env.test.docker .\node_modules\vitest\vitest.mjs run test/ventas.test.js

Set-Location D:\plastimar-erp-v2\frontend
npm.cmd run build
```

Resultados de esta ejecución: matriz completada; **56 pruebas de `ventas.test.js` aprobadas**; compilación frontend aprobada.

## Decisión de negocio pendiente

El código actual (`isVentaDirectaStockTipo`) genera kardex inmediato para Normal, Licitación, Convenio Marco, Venta Web, Venta Sala y Marketplace, pero no para **Compra Ágil** ni **Trato Directo**. La matriz confirmó ese comportamiento con datos reales de prueba: ambas ventas se cierran, pero no tienen movimiento de bodega.

No se cambió esa política automáticamente: debe definirse si esos dos canales descuentan al crear, al despachar, o mediante una reserva. Mientras no exista esa decisión, los reportes de stock deben tratar esos tipos de forma explícita.
