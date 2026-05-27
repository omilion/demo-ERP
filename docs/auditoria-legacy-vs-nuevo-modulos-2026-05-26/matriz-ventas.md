# Auditoria legacy vs nuevo - matriz_ventas

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\matriz_ventas`

Estado final: **Aprobado en SPR-29**

## Como se mostraba / funcionaba en legacy

- Default: **Ventas Hoy**.
- Busquedas: N Interno, ID Licitacion, OC, ODT, Guia, NC, ND, Fechas, Cliente y Tipo Venta.
- Shortcuts: No pagadas, Pendiente entrega y Entregadas no pagadas.
- Tabla: operaciones, N Interno, Nombre, OC, Total Venta, Abono, Total Facturado, Saldo, Estado, Estado Pago, Estado Entrega, detalle de productos, Fecha Creacion, Creada por, ODTs, Guias Desp., Documentos, Cliente e ID Licitacion.
- Exportaciones: resumen, detalle productos, guias, NC/ND, PDF e impresion.
- Eliminacion/anulacion: accion sensible por impacto en caja, stock, taller/despacho y trazabilidad.

## Como queda hoy en la plataforma nueva

- Backend principal: `backend/src/routes/matriz-ventas/index.js`
- UI principal: `frontend/src/pages/matriz-ventas/MatrizVentasPage.jsx`
- Seguridad adicional: `backend/src/routes/ventas/update.js`
- Pruebas: `backend/test/matriz-ventas.test.js` y `backend/test/ventas.test.js`

## Equivalencia legacy vs plataforma actual

| Funcion legacy | Estado actual | Evidencia |
| --- | --- | --- |
| Ventas Hoy por defecto | **Resuelto** | Backend aplica fecha local cuando no hay filtros; UI muestra indicador "Ventas hoy". |
| N Interno | **Resuelto** | Filtro dedicado `nInterno`; restringe la union a ordenes. |
| ID Licitacion | **Resuelto** | Filtro dedicado `idLicitacion`; busca `CotizacionLicitacion.idLicitacion` y el dato legacy migrado en `Orden.licitacion`, sin duplicar vinculadas. |
| OC | **Resuelto** | Filtro dedicado `oc` para ordenes, OC online y licitaciones cuando corresponde. |
| ODT | **Resuelto** | Lookup por ODT con `eliminado=false` y scope por sucursal. |
| Guia | **Resuelto** | Lookup por guia con `eliminado=false` y scope por sucursal. |
| NC | **Resuelto** | Filtro por documentos NC desde Caja por `documento` o `tipoDocumento`, con columna de total NC y exclusion de `estadoDoc=Nula`. |
| ND | **Resuelto** | Filtro por documentos ND desde Caja por `documento` o `tipoDocumento`, con columna de total ND y exclusion de `estadoDoc=Nula`. |
| Fechas | **Resuelto** | Filtros `desde` y `hasta` aplicados por origen. |
| Cliente por RUT | **Resuelto** | Filtro `rut`. |
| Cliente por nombre | **Resuelto** | Filtro `nombre`, resolviendo clientes por `nombre`/`razonSocial`. |
| Tipo venta | **Resuelto** | Tabs: Todos, Venta sala, Venta web, Convenio marco, Licitaciones. |
| No pagadas | **Resuelto** | Shortcut `noPagada`. |
| Pendiente entrega | **Resuelto** | Shortcut `pendienteEntrega`. |
| Entregadas no pagadas | **Resuelto** | Shortcut `entregada`. |
| Detalle productos inline | **Resuelto** | Nueva columna compacta de detalle. |
| ODTs, guias y documentos inline | **Resuelto** | Columnas y acciones de navegacion; documentos anulados no se muestran ni se cuentan. |
| Export resumen | **Resuelto** | `/matriz-ventas/export?formato=resumen`. |
| Export resumen con documentos | **Resuelto** | Incluye documentos concatenados como `documento-n_doc`. |
| Export detalle productos | **Resuelto** | `/matriz-ventas/export?formato=detalle-productos`, con categoria, subcategoria y proveedor. |
| Export guias | **Resuelto** | `/matriz-ventas/export?formato=guias`. |
| Export NC/ND | **Resuelto** | `/matriz-ventas/export?formato=ndnc`, filtrado por sucursal y solo documentos activos. |
| PDF / impresion legacy | **Reemplazado parcialmente** | Datos cubiertos por CSV. PDF exacto queda como tarea separada si el cliente exige formato impreso. |
| Anulacion / eliminacion segura | **Mejorado** | `PUT /ventas/:id` ya no permite cambios destructivos de estado; deben pasar por flujo auditado. |
| Anulacion con sucursal | **Resuelto** | El flujo auditado verifica `sucursalId` antes de modificar la orden. |
| Saldo con NC/ND/multas | **Resuelto** | La fila usa el helper financiero canonico: `total - abono - NC - ND - multas`. |
| KPI/totales filtrados | **Resuelto** | Los KPI usan los mismos filtros que la tabla. |
| Scope por sucursal | **Mejorado** | Matriz, totales, filtros por documentos/lookups y exportaciones respetan `sucursalId`. |

## Extras actuales que mejoran legacy

- Consolidacion en una sola vista de ordenes, OC online y licitaciones.
- Acciones directas a venta, licitacion, ODT, despacho/guias y caja.
- Invalidacion de cache de Matriz Ventas al actualizar ventas, cargos, anulaciones, reactivaciones o entregas.
- Bloqueo de `facturado`, `abono` y `estadoPago` desde endpoints genericos de ventas; se actualizan desde Cobranza/Caja.
- Pruebas automatizadas para default Ventas Hoy, scope por sucursal, totales con cargos, NC/ND, documentos `Nula`, export y deduplicacion de licitacion vinculada.

## Validacion

- Backend focalizado Matriz: **5 tests OK**.
- Backend focalizado Ventas: **39 tests OK**.
- Backend completo: **43 archivos, 374 tests OK**.
- Frontend lint: **OK**.
- Frontend build: **OK**.

## Revision final SPR-29

- Harvey: **aprobado**, sin P0/P1 pendientes.
- Hypatia: **aprobado**, sin P0/P1 pendientes.

## Pendiente condicionado

- Implementar PDF/print con formato exacto legacy solo si el cliente lo solicita como requisito de presentacion formal. No bloquea la operacion diaria porque los datos exportables ya estan cubiertos.
