# Sprint 1 - Trazabilidad de stock

Fecha: 2026-05-19  
Estado: implementado en codigo, pendiente de push/deploy.

## Objetivo

Cerrar la brecha donde el ERP podia modificar stock sin dejar una referencia formal al origen del movimiento. Este sprint cubre bodega/productos e ingreso de mercaderia desde proveedores.

## Problema corregido

Antes de este sprint, `bodega.movimientos` guardaba solamente:

- producto
- tipo
- cantidad
- motivo textual
- usuario
- fecha

Eso permitia ver que el stock cambio, pero no permitia reconstruir con certeza desde que documento o trabajo vino el cambio. Ademas habia dos flujos inconsistentes:

- `stock-ingresos/aplicar/:pagoId` sumaba stock y creaba movimiento, pero no guardaba FK al pago proveedor ni marcaba idempotencia.
- `pagos-proveedores` con `ingresaStock` sumaba stock y marcaba `stockAplicadoAt`, pero no creaba `bodega.movimientos`.

## Cambios realizados

### Modelo de datos

Se agregaron campos trazables a `bodega.movimientos`:

- `orden_id`
- `odt_id`
- `pago_proveedor_id`
- `origen_tipo`
- `origen_id`

Tambien se agregaron indices y llaves foraneas no validadas inicialmente para no bloquear bases con datos historicos:

- `bodega.movimientos.orden_id -> ventas.ordenes.id`
- `bodega.movimientos.odt_id -> taller.odts.id`
- `bodega.movimientos.pago_proveedor_id -> catalogo.pagos_proveedores.id`

Migracion:

- `backend/prisma/migrations/20260519110000_add_stock_movement_traceability/migration.sql`

### Movimientos manuales de producto

Ruta:

- `POST /api/productos/:id/movimientos`

Ahora acepta y valida referencias opcionales:

- `ordenId`
- `odtId`
- `pagoProveedorId`
- `origenTipo`
- `origenId`

Reglas aplicadas:

- Si se informa `odtId`, la ODT debe existir y tener `ordenId`.
- Si se informa `ordenId`, la orden debe existir.
- Si se informan `odtId` y `ordenId`, ambos deben calzar.
- Si se informa `pagoProveedorId`, el pago debe existir.
- Si no se informa origen, queda clasificado como `manual`.

Esto permite que el flujo actual siga funcionando, pero los movimientos nuevos ya quedan clasificables.

### Ingreso de mercaderia por pago proveedor

Rutas:

- `POST /api/stock-ingresos/aplicar/:pagoId`
- `POST /api/pagos-proveedores` con `ingresaStock: true`

Cambios:

- Todo ingreso de stock crea `bodega.movimientos`.
- El movimiento queda vinculado a `pago_proveedor_id`.
- `origen_tipo` queda como `pago_proveedor`.
- `origen_id` queda con el id del pago proveedor.
- Se mantiene proteccion idempotente con `stockAplicadoAt`.
- Se usa advisory lock para evitar doble aplicacion concurrente.
- Si falta un producto del detalle, la operacion falla antes de mover stock.

La decision importante es que el ingreso ahora es atomico: no se permite aplicar media factura y dejar la otra mitad pendiente.

### Auditoria

Se agregaron controles al auditor de integridad:

- `bodega.movimientos_origen_tipo_nulo`
- `bodega.movimientos_orden_id_huerfano`
- `bodega.movimientos_odt_id_huerfano`
- `bodega.movimientos_pago_proveedor_id_huerfano`
- `bodega.movimientos_egreso_manual_sin_trabajo`
- `proveedores.pagos_stock_aplicado_sin_movimiento_bodega`

Con esto el diagnostico ya no depende solo de mirar el codigo: la base podra reportar movimientos de stock sin origen formal o con referencias rotas.

## Validaciones ejecutadas

Comandos ejecutados en `backend`:

```bash
npm.cmd exec prisma validate
node --check src/routes/productos/movimientos.js
node --check src/routes/stock-ingresos/index.js
node --check src/routes/pagos-proveedores/index.js
node --check scripts/data-integrity-audit.mjs
npm.cmd test -- data-integrity-audit.test.js
npm.cmd test -- data-integrity-audit.test.js operational-utils.test.js backend-helpers.test.js
```

Resultado:

- Prisma schema valido.
- Sintaxis JavaScript valida.
- 17 tests pasan en el set focalizado.
- `git diff --check` sin errores.

## Pendiente fuera de este sprint

Este sprint no resuelve todavia:

- descuento automatico de stock al despachar;
- descuento automatico de stock al pasar items a taller;
- trazabilidad de caja;
- migracion historica de `movimientos_stock` legacy como `stock_lecturas`;
- conciliacion manual de movimientos historicos sin origen.

Esos puntos deben tratarse en los Sprint 2 y Sprint 3, o en un sprint posterior especifico para legacy stock snapshots.

## Criterio de aceptacion

El Sprint 1 queda aceptable si en staging/produccion se confirma:

1. La migracion agrega las columnas sin romper datos historicos.
2. Crear pago proveedor con `ingresaStock` sube stock y crea movimiento con `pago_proveedor_id`.
3. Reaplicar el mismo pago no duplica stock.
4. `stock-ingresos/aplicar/:pagoId` no aplica si ya tiene `stockAplicadoAt`.
5. La auditoria reporta movimientos sin origen o referencias huerfanas.
