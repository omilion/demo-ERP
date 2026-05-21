# Sprint 2 - Stock, despacho y caja trazables - 2026-05-21

## Estado

Aprobado para deploy.

## Objetivo

Cerrar la cadena operacional critica desde recepcion de stock hasta caja y despacho, evitando movimientos ambiguos y reforzando trazabilidad.

## Cambios implementados

### Stock mixto

- La creacion de pago proveedor con `ingresaStock` ahora fuerza rollback transaccional si falla la aplicacion de stock.
- Se mantiene idempotencia por proveedor/documento para no duplicar stock cuando la factura ya fue aplicada.
- Se reforzo preflight de destinos mixtos antes de mutar stock.
- Tests verifican trazabilidad para producto, material taller y tela.

### Caja

- Se bloquean pagos de venta por movimiento manual de caja.
- Los pagos de venta deben entrar por `POST /api/caja/cobranza/orden/:id/pago`, que actualiza `abono`, `estadoPago` y movimiento trazable.
- `origenTipo` queda restringido a `manual`, `orden` o `gasto`.
- Movimientos manuales no pueden declarar origen asociado.
- Egresos requieren `gastoTipoId` u `ordenId`.
- Tests cubren turno cerrado, pago sin turno, sobrepago, pago formal y rechazo del pago manual ligado a venta.

### Despachos y guias

- `origenTipo` se recalcula de forma coherente: `odt` cuando existe `odtId`, `orden` cuando no.
- Filtros de despachos/guias validan cruces entre `ordenId`, `odtId`, `nInterno`, `origenTipo` y `origenId`.
- `GET /api/despachos/:id` ya no mezcla guias de otras ODTs de la misma orden.
- `PUT /api/despachos/:id` recompone trazabilidad cuando cambia orden/ODT.
- Tests cubren cruces invalidos, filtros y scope de guias.

### UI stock ingresos

- Filtros pasan a grid responsive.
- Se agregan controles de paginacion visibles.
- Cambiar filtros reinicia a pagina 1.

### Scripts E2E

- `e2e-flow-test.mjs` usa la ruta formal de cobranza para pagar ventas.
- `e2e-edge-cases.mjs` crea/usa tipo de gasto para egresos, alineado con las reglas nuevas.

## Validaciones ejecutadas

- `npm.cmd test -- stock-ingresos-apply.test.js pagos-proveedores-stock.test.js caja-traceability.test.js despachos-traceability.test.js stock-negative-dates.test.js`: 5 archivos, 41 tests OK.
- `npm.cmd run build` en frontend: OK.
- `npm.cmd exec prisma validate`: OK.
- `node --check` sobre scripts E2E y rutas tocadas: OK.
- `git diff --check`: OK.

## Riesgos residuales

- Los tests integrados completos con DB local siguen dependiendo de `DATABASE_URL` y secretos locales.
- UI protegida no pudo revisarse completa en local porque no hay backend local autenticable; se valida post-deploy contra produccion.
- Descuento automatico de stock por despacho parcial queda como decision funcional pendiente, no se activa en este sprint.

## Criterio para Sprint 3

Con caja, stock y despacho ya forzando trazabilidad, el siguiente paso logico es cerrar permisos por rol y auditoria de acciones sensibles.
