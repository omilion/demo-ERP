# SPR-30 - pasar_taller

Prioridad: **P1 - critico funcional**
Dominio: **Operaciones / Taller / ODT / Stock**
Estado: **Aprobado localmente**
Deploy: **No deployado**

## Objetivo

Reparar el flujo legacy `pasar_taller` para que la plataforma nueva permita enviar productos transitorios desde una venta a taller con equivalencia funcional, trazabilidad, permisos y seguridad de datos.

## Solicitud legacy revisada

Archivos legacy usados como referencia:

- `pasar_taller/eliminar_items_taller.php`
- `pasar_taller/enviar_a_taller VARIOS.php`
- `pasar_taller/enviar_obs_prioridad.php`
- `pasar_taller/enviar_obs_prioridad2.php`
- `pasar_taller/enviar_producto_a_taller.php`
- `pasar_taller/index.php`
- `pasar_taller/lista_productos_taller.php`
- `pasar_taller/lista_productos_transitorios.php`
- `pasar_taller/mensaje_elije_taller_vacio.php`

## Como funcionaba en legacy

- Se entraba desde una venta / numero interno.
- Se listaban productos transitorios pendientes.
- La tabla mostraba producto, cantidad, observacion de venta, estado producto, seleccion de talleres y estado de notificacion.
- Permitia seleccionar Confecciones, Espumas y Madera/Externo por producto.
- Permitia guardar prioridad y observacion general de la OT.
- Permitia notificar productos a taller, actualizar cantidad y quitar items.
- El flujo escribia en tablas de taller/productos_taller por `n_interno`.

## Que queda implementado ahora

- Pantalla nueva `PasarTallerPage` opera por `ordenId` o `nInterno`, no por ODT manual.
- API `GET /api/pasar-taller/orden` carga venta, cliente, ODT existente, talleres activos y productos transitorios pendientes.
- API `POST /api/pasar-taller/enviar` crea o reutiliza una ODT de taller por venta.
- Envio es idempotente: actualiza item existente por producto/codigo en vez de duplicarlo.
- Envio concurrente usa advisory lock transaccional para evitar duplicar ODT/item.
- Se soportan multiples talleres por producto.
- Se guardan `prioridad` y `obsGeneral`.
- Se registra bitacora al crear/actualizar/eliminar items.
- `DELETE /api/pasar-taller/items/:id` permite quitar item solo con permiso `taller.delete`, si la ODT esta abierta y el trabajo no inicio.
- Ventas puede acceder al flujo con `ventas.write`; taller mantiene acceso con permisos de taller.
- Listado y detalle de ODT ocultan items soft-deleted y respetan scope de sucursal.
- Workflow de item/taller bloquea ODT eliminadas, anuladas, terminadas o entregadas.
- Consumos de ODT validan ODT activa, sucursal y material de taller por sucursal.

## Archivos modificados relevantes

- `backend/src/routes/pasar-taller/index.js`
- `backend/src/routes/odts/list.js`
- `backend/src/routes/odts/get.js`
- `backend/src/routes/odts/update.js`
- `backend/src/routes/odts/item-workflow.js`
- `backend/src/routes/odts/consumos.js`
- `frontend/src/api/pasarTaller.js`
- `frontend/src/pages/pasar-taller/PasarTallerPage.jsx`
- `frontend/src/pages/ventas/VentasFormPage.jsx`
- `frontend/src/router.jsx`
- `backend/test/pasar-taller.test.js`
- `backend/test/odt-item-workflow.test.js`
- `backend/test/odt-consumos.test.js`
- `backend/test/odts.test.js`
- `backend/test/operational.test.js`

## Seguridad y permisos corregidos

- No se puede enviar a taller una venta de otra sucursal.
- No se puede modificar workflow de item/taller de otra sucursal.
- No se puede modificar workflow de ODT cerrada, anulada, entregada o eliminada.
- No se puede anular una ODT por `PUT /api/odts/:id` con solo `taller.write`; requiere `taller.delete`.
- No se puede consumir material_taller de otra sucursal si el usuario/ODT esta scopeado.
- No se puede ver por detalle directo una ODT eliminada.

## Validacion ejecutada

- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd exec prisma migrate deploy`
  - Resultado: **OK**, 26 migraciones aplicadas sobre contenedor local `plastimar-postgres-test`.
- `DATABASE_URL=... npm.cmd run db:seed`
  - Resultado: **OK**.
- `npm.cmd exec vitest run odt-item-workflow.test.js odt-consumos.test.js --reporter=dot`
  - Resultado: **2 archivos / 29 tests OK**
- `DATABASE_URL=... npm.cmd exec vitest run pasar-taller.test.js odt-item-workflow.test.js odt-consumos.test.js odts.test.js operational.test.js --reporter=dot`
  - Resultado: **5 archivos / 56 tests OK**
- `DATABASE_URL=... npm.cmd run test:full -- --reporter=dot`
  - Resultado: **43 archivos / 385 tests OK**
- `npm.cmd exec prisma validate`
  - Resultado: **OK**
- `npm.cmd run lint` en frontend
  - Resultado: **OK**
- `npm.cmd run build` en frontend
  - Resultado: **OK**, con warning conocido de chunk mayor a 500 kB.
- Revision multiagente:
  - Sagan: aprobacion estatica final, sin P0/P1.
  - Peirce: aprobacion estatica final, sin P0/P1.

## Decision del lead

**Aprobado para continuar al siguiente sprint.**

Motivo: el codigo esta implementado, revisado por dos agentes, validado con Postgres real en contenedor local, suite backend completa verde y frontend lint/build verde.

Riesgo residual: no fue deployado a produccion desde esta ejecucion.
