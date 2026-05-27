# SPR-20-despacho - Despacho

Prioridad: **P0 - critico operativo**  
Dominio: **Operaciones / Taller / Despacho**  
Estado: **Aprobado**  
Decision final: **Aprobado para continuar al siguiente sprint**

## Objetivo

Reparar el modulo `despacho` comparando el comportamiento legacy contra la plataforma nueva, sin omitir columnas, filtros, acciones, exportaciones, estados ni permisos operativos.

## Evidencia legacy revisada

- `despacho/acepta_elimina.php`
- `despacho/buscar_fechas.php`
- `despacho/buscar_guia.php`
- `despacho/buscar_idlicitacion.php`
- `despacho/buscar_nc.php`
- `despacho/buscar_nd.php`
- `despacho/buscar_ninterno.php`
- `despacho/buscar_oc.php`
- `despacho/buscar_odt.php`
- `despacho/buscar_rut_cliente.php`
- `despacho/buscar_tipo_venta.php`
- `despacho/clase_totales_ventas.php`
- `despacho/lista.php`
- `despacho/lista_excel.php`
- `despacho/lista_excel_guias.php`
- `despacho/lista_excel_ndnc.php`
- `despacho/lista_excel_detalles_productos.php`

## Hallazgos confirmados

1. **P0 - La pantalla nueva no reemplazaba la matriz legacy.**  
   Legacy listaba ventas/ordenes activas aunque no existiera todavia un registro en `despachos`. La pantalla nueva solo listaba registros `Despacho`, por lo que una venta pendiente sin despacho desaparecia del modulo.

2. **P1 - Faltaban columnas operativas.**  
   Legacy mostraba N interno, cliente, OC, total venta, total facturado, estado, pago, entrega, detalle de productos, fecha, ODTs, guias, documentos, direccion, region y comuna. La UI nueva mostraba solo datos del despacho fisico.

3. **P1 - Faltaban filtros legacy.**  
   No estaban completos filtros por N interno, RUT/cliente, OC, ID licitacion, guia real, NC, ND, ODT, tipo venta, pago, entrega, region, comuna, ciudad y ventas hoy.

4. **P1 - Riesgo de trazabilidad.**  
   Se podia marcar una venta como `Entregada` desde ventas/despacho sin guia, despacho entregado ni items entregados.

5. **P1 - Borrado fisico de despachos/guias.**  
   El nuevo modulo eliminaba registros fisicamente, dejando perdida de trazabilidad y estados de venta potencialmente obsoletos.

6. **P1 - Permisos UI incompletos.**  
   La UI mostraba borrar con permiso `write`, aunque backend exigia `delete`.

## Implementacion realizada

- Se agrego endpoint **`GET /api/despachos/matriz`** con matriz logistica basada en `Orden`, no solo en `Despacho`.
- Se agrego export backend **`GET /api/despachos/matriz/export`** con CSV completo, compatible con Excel, sin limitarse a la primera pagina visible.
- La vista `DespachosPage` ahora abre por defecto en **Matriz despacho** y mantiene tabs para **Registros** y **Guias**.
- La matriz muestra N interno, cliente/RUT, OC/ID licitacion, total, facturado, pago, entrega, detalle de productos, ODTs, guias, documentos y destino.
- Se implementaron filtros por fechas, ventas hoy, N interno, RUT, cliente, OC, ID licitacion, guia, NC, ND, ODT, tipo venta, pago, entrega, estado despacho, region, comuna, ciudad y busqueda libre.
- Se agrego paginacion real en el modulo despacho.
- Se eliminaron acciones que marcaban `Entregada` directamente desde UI sin evidencia logistica.
- `PUT /api/ventas/:id` ahora rechaza `Entregada` si no hay guia, despacho entregado o items entregados.
- `fechaEstadoEntrega` ahora se actualiza cuando despacho/guia/items cambian el estado de entrega.
- Despachos y guias ahora usan **soft-delete** (`eliminado`, `userMod`, `fecham`, `motivoEliminacion`) y recalculan `Orden.estadoEntrega`.
- La eliminacion de despachos/guias exige motivo obligatorio desde backend y la UI lo solicita antes de borrar.
- `PUT /api/despachos/:id` recalcula la orden anterior y la nueva cuando se edita o mueve un despacho, evitando estados `Entregada`/`Parcial` obsoletos.
- Se agrego edicion real de guias en backend y UI: **`PUT /api/despachos/guias/:id`**, hook frontend y modal de edicion.
- Se agregaron exports backend completos para tabs secundarios: **`GET /api/despachos/export/registros`** y **`GET /api/despachos/guias/export`**, sin limitarse a la pagina visible.
- `includeEliminados=true` queda restringido a usuarios con permiso `despacho.delete`; la UI lo muestra solo a esos usuarios.
- `nGuia` queda validado contra duplicados historicos, incluyendo guias eliminadas, para no reutilizar numeros documentales.
- Creacion de despachos/guias rechaza ordenes eliminadas/no activas y ODTs anuladas/eliminadas.
- Listados y vistas relacionadas filtran despachos/guias eliminados.
- Filtro de guia en matriz ventas/reportes ahora considera `GuiaDespacho.nGuia`, no solo el campo legacy `Orden.guias`.
- Busqueda numerica de ODT queda exacta por ID para evitar falsos positivos por textos que contengan el numero.

## Archivos modificados

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260526114500_dispatch_soft_delete_and_traceability/migration.sql`
- `backend/src/routes/despachos/index.js`
- `backend/src/routes/despachos/matriz.js`
- `backend/src/routes/relation-guards.js`
- `backend/src/routes/ventas/update.js`
- `backend/src/routes/ventas/cargos.js`
- `backend/src/routes/ventas/get.js`
- `backend/src/routes/cotizaciones/index.js`
- `backend/src/routes/matriz-ventas/index.js`
- `backend/src/routes/reportes/index.js`
- `backend/src/routes/odts/list.js`
- `backend/test/despachos.test.js`
- `frontend/src/api/despachos.js`
- `frontend/src/pages/despachos/DespachosPage.jsx`

## Pruebas ejecutadas

- `npm.cmd exec prisma validate` - OK
- `npm.cmd exec prisma generate` - OK
- `npm.cmd exec prisma migrate deploy` - OK
- `npm.cmd test -- despachos.test.js despachos-traceability.test.js operational.test.js reportes-export-helpers.test.js odts.test.js --reporter=dot` - **5 archivos, 52 tests OK**
- `npm.cmd run test:ci -- --reporter=dot` - **14 archivos, 102 tests OK**
- `npm.cmd run lint` frontend - **OK**
- `npm.cmd run build` frontend - **OK**, solo warning de chunk grande de Vite ya existente/no bloqueante

## Riesgos residuales / fuera de este cierre

- Legacy tenia exportaciones nativas separadas PDF/XLS para resumen, guias, NC/ND y detalle productos. En este sprint quedo cubierto el **alcance de datos** con CSV backend completo e impresion desde pantalla. Si el cliente exige el mismo formato exacto PDF/XLS, corresponde a un refinamiento de reportes/exportacion, no bloquea la operacion diaria.
- La eliminacion legacy de venta completa desde matriz pertenece al flujo de `matriz_ventas/ventas`; en Despacho se dejo trazabilidad segura para despachos/guias y navegacion a venta/pagos/ODT.
- La unicidad de `nGuia` queda protegida por API y pruebas funcionales. Como refuerzo futuro, podria agregarse constraint/indice unico en base de datos si se decide bloquear tambien cargas directas o carreras concurrentes fuera de API.

## Validacion final

- Revision funcional legacy vs nuevo: **aprobada**.
- Revision seguridad/datos/trazabilidad: **aprobada**.
- Revision independiente multiagente final: **aprobada, sin P0/P1**.
- Pruebas automatizadas backend/frontend: **aprobadas**.
- Decision lead: **SPR-20 Despacho aprobado**.
