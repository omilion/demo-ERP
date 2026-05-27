# SPR-14-convenio-marco - Convenio Marco

Prioridad: **P1 - critico funcional**  
Dominio: **Comercial / Ventas**  
Estado: **Aprobado con observaciones documentadas**  
Fecha de cierre: **2026-05-27**

## Objetivo

Revisar y reparar el flujo `convenio_marco` comparando legacy contra la plataforma nueva, sin omitir stock, OC, documentos, descuentos, exportaciones, scope por sucursal ni trazabilidad.

## Resultado ejecutivo

SPR-14 queda aprobado para continuar al siguiente sprint. Las brechas criticas detectadas en la auditoria fueron corregidas y validadas con pruebas:

- Convenio Marco ahora descuenta y repone stock inventariado en crear, anular y reactivar venta.
- La OC de Convenio Marco ahora es obligatoria, se normaliza sin espacios y no puede duplicarse.
- El formulario de venta usa precio Convenio Marco + IVA al agregar productos de tipo Convenio Marco.
- La pestaña `Lic. / Convenio` de Matriz Ventas ahora incluye Licitacion y Convenio Marco.
- Cotizaciones y ordenes de compra online ahora respetan scope por sucursal en lectura y escritura.
- La conversion de cotizacion adjudicada a venta ahora es transaccional y bloquea duplicados concurrentes.
- Los descuentos quedan restringidos por permiso y rango valido 0-100.
- La exportacion de ventas ahora calcula totales con cargos, e incluye descuento, abono, saldo y facturado.

## Legacy revisado

Archivos principales revisados:

- `convenio_marco/index.php`
- `convenio_marco/crear_numero_interno.php`
- `convenio_marco/venta.php`
- `convenio_marco/consulta_inserta_compra_marco.php`
- `convenio_marco/eliminar_items.php`
- `convenio_marco/clase_totales_convenio_marco.php`
- `convenio_marco/lista_productos_comprados_marco.php`
- `convenio_marco/crear_factura/*`
- `convenio_marco/abonar_factura/*`
- `convenio_marco/anular/*`
- `convenio_marco/activar/*`
- `convenio_marco/cliente/*`
- `convenio_marco/guias_despachos/*`
- `convenio_marco/odts/*`
- `convenio_marco/modificar_*/*`
- `convenio_marco/subir_foto/*`
- `convenio_marco/imprimir.php`
- `convenio_marco/nota_venta.php`

## Comparacion punto por punto

| Punto legacy | Estado nuevo | Implementacion / decision |
|---|---:|---|
| Crear venta Convenio Marco desde OC y validar que no exista | **Corregido** | `POST /api/ventas` exige OC para `Convenio Marco`, elimina espacios y bloquea duplicados con lock transaccional. |
| Agregar producto por ID Marco, codigo barra o codigo interno | **Equivalente mejorado** | Buscador de productos usa catalogo nuevo y muestra precio Marco + IVA en contexto Convenio Marco. |
| Usar `precio_marco` como base | **Corregido en UI** | Al agregar producto en Convenio Marco se usa `consultaPrecios.precioConvMarco` / `precioMarco` y se calcula + IVA para el total operativo. |
| Descontar stock inventariado al vender | **Corregido** | `Convenio Marco` entra al flujo de `applyVentaStockDeltas`; se valida stock insuficiente y se registra movimiento de bodega. |
| Devolver stock al anular y descontar al reactivar | **Corregido** | Los endpoints auditados `/ventas/:id/anular` y `/ventas/:id/activar` reconcilian stock para Convenio Marco. |
| Descuentos de Convenio Marco | **Corregido en control** | Descuentos requieren permiso y valores 0-100. No se permite modificar descuento si ya hay pagos/documentos. |
| Documentos referenciales Factura/NC/ND y abonos | **Resuelto por Caja/Cobranza** | El flujo nuevo mantiene documentos referenciales y pagos reales en Caja/Cobranza con bloqueo por turnos cerrados. No se reimplemento el bug legacy de NC/ND. |
| Anular/reactivar venta | **Mejorado** | Nuevo flujo es auditado, respeta documentos de caja, turnos cerrados, stock y reactivacion controlada. |
| Guias, ODT y pasar a taller | **Equivalente nuevo** | Existen flujos estructurados de despacho, guias, ODT y taller desde venta; reemplazan registros simples legacy. |
| Scope por sucursal | **Corregido** | Ventas, cotizaciones y OC online quedan filtradas por sucursal del usuario cuando corresponde. |
| Exportacion de ventas | **Corregido parcial** | CSV nuevo calcula total con cargos e incluye descuento, abono, saldo y facturado. Export XLS legacy se reemplaza por CSV operativo. |
| Venta vacia sin cliente/items | **No se replica** | Se mantiene requisito nuevo de cliente e items para trazabilidad. Legacy permitia orden vacia desde OC; se considera peor control de datos y queda fuera del alcance aprobado. |
| Subida de foto desde Convenio Marco | **Reemplazo por Catalogo** | La foto se gestiona en catalogo/producto, no desde la venta. No se duplica la pantalla legacy. |

## Archivos modificados

- `backend/src/routes/ventas/convenio-marco.js`
- `backend/src/routes/ventas/descuentos-permissions.js`
- `backend/src/routes/ventas/create.js`
- `backend/src/routes/ventas/update.js`
- `backend/src/routes/ventas/stock.js`
- `backend/src/routes/ventas/list.js`
- `backend/src/routes/ventas/cargos.js` ya tenia anulacion/reactivacion auditada y fue validado con Convenio Marco.
- `backend/src/routes/cotizaciones/index.js`
- `backend/src/routes/ordenes-compra/index.js`
- `backend/src/routes/descuentos/index.js`
- `backend/src/routes/reportes/index.js`
- `backend/src/plugins/jwt.js`
- `backend/test/ventas.test.js`
- `frontend/src/pages/ventas/VentasFormPage.jsx`
- `frontend/src/pages/ventas/VentasPage.jsx`

## Pruebas ejecutadas

- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- ventas.test.js --reporter=dot` -> **32/32 OK**
- `DATABASE_URL=... npm.cmd test -- reportes-export-helpers.test.js --reporter=dot` -> **5/5 OK**
- `DATABASE_URL=... npm.cmd test -- cotizaciones-flow.test.js --reporter=dot` -> **2/2 OK**
- `DATABASE_URL=... npm.cmd run test:ci -- --reporter=dot` -> **95/95 OK**
- `DATABASE_URL=... npm.cmd test -- --reporter=dot` -> **39 files, 340 tests OK**
- `frontend: npm.cmd run lint` -> **OK**
- `frontend: npm.cmd run build` -> **OK** con advertencia conocida de chunk Vite mayor a 500 kB.

## Riesgos residuales

- El desglose visual exacto legacy `neto / IVA / NC / ND` no se clono como pantalla fiscal independiente. Hoy queda cubierto por Caja/Cobranza y export de ventas, pero si el cliente pide reporte fiscal identico debe entrar como nuevo alcance.
- La venta vacia creada solo por OC no se replica por decision de trazabilidad: la nueva plataforma exige cliente e items al crear.
- El export XLS legacy de guias se mantiene reemplazado por CSV/reportes nuevos.

## Decision final

**Aprobado para continuar al siguiente sprint.**  
Las brechas criticas de operacion y seguridad quedaron corregidas, probadas y documentadas. Los puntos no replicados son decisiones de alcance/arquitectura y no bloquean la continuidad.
