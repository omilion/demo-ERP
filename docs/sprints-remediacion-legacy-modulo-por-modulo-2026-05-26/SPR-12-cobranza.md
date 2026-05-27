# SPR-12-cobranza

Prioridad: **P1 - critico funcional**  
Dominio: **Administracion / Finanzas / Seguridad**  
Estado: **Aprobado para continuar**  
Fecha de validacion: **2026-05-26**

## Alcance real detectado

El legacy `cobranza` no era una sola pantalla:

1. **Cobranza ventas/clientes**: accesos a facturas de venta, ventas no pagadas y busquedas en `cobranza_cliente`.
2. **Pagos/documentos de proveedores**: CRUD de `pagos_proveedores`, filtros, Excel/PDF, NC, vencimientos, usuario creador, sucursal y borrado con efecto en stock.

En la plataforma nueva el equivalente quedo distribuido correctamente:

- Cobranza de ventas/clientes: `/cobranza`, `/api/cobranza-historico`, caja/cobranza.
- Documentos de proveedores: `/pagos-proveedores`, `/stock-ingresos`, ficha de proveedor.

## Checklist legacy revisado

- `index.php`: menu mixto con cobranza clientes y pagos proveedores.
- `nuevo.php` / `insertar.php`: alta de Factura/Boleta proveedor con `documento`, `n_doc`, proveedor, total, estado Pagada/No pagada, `fecha_doc`, `fecha_pago`, `obs`, usuario, sucursal y `bodega='No hay'`.
- `lista_padre.php` / `lista.php`: filtros por fecha documento, documento+fecha, proveedor+fecha, numero, facturas no pagadas, boletas no pagadas; scope por sucursal; columnas N Doc, Documento, Estado, RUT, Proveedor, Fecha documento, Fecha vencimiento, Total, Fecha pago, Fecha creacion, Creada por; subtotal por proveedor.
- `lista2.php`: variante antigua con NC Monto.
- `modificar.php` / `actualizar.php`: edita total, NC, NC monto, estado, fechas y observacion; documento/numero/proveedor quedan bloqueados visualmente.
- `eliminar.php`: borrado fisico y reversa manual de stock si venia de Inventario/Taller.
- `lista_excel*.php`: export Excel con filtros equivalentes y columnas financieras.
- `lista_pdf.php`: PDF landscape con filtros equivalentes.

## Correcciones implementadas

- `pagos-proveedores` ahora aplica scope estricto por sucursal en listado, detalle, export, edicion y anulacion. Un usuario de sucursal no puede modificar registros globales o de otra sucursal por ID.
- Las rutas heredadas dentro de `/api/proveedores/:id/pagos` ya no usan permisos de `catalogo`; ahora exigen `proveedores:read/write/delete` y respetan sucursal.
- La ficha de proveedor no expone pagos a usuarios que solo tienen permiso de catalogo.
- `cobranza_historico` y reportes/export de cobranza ahora se filtran por sucursal usando venta enlazada (`ordenId` o `interno`) cuando el usuario tiene sucursal.
- Cobranza activa ahora calcula KPI desde stats backend, no solo desde la pagina visible.
- Busqueda de ventas/cobranza activa ahora contempla cliente, RUT, email, numero interno y documentos de caja.
- Export de cobranza activa dejo de usar el CSV generico de ventas y ahora incluye total, abono, saldo, documentos referenciales y pagos registrados.
- Export de cobranza historica agrega campos legacy/modelados: monto menos, NC, multas, gestion, ingreso pago, comision, pago comision, despacho, reclamo y observacion.
- `/pagos-proveedores` agrega alta simple "Nueva boleta/factura" sin stock, equivalente al formulario legacy.
- `/pagos-proveedores` agrega botones rapidos con contador para Facturas no pagadas y Boletas no pagadas.
- La lista de pagos proveedores muestra columnas legacy faltantes: fecha creacion, creada por y NC.
- Export de pagos proveedores agrega columnas legacy relevantes y mantiene CSV con BOM compatible con Excel.
- UI de cobranza solo muestra accion de pago si el usuario tiene `cobranza:write`, `caja:read` y `caja:write`.

## Diferencias deliberadas contra legacy

- El borrado fisico legacy no se replica. Se mantiene anulacion/soft-delete con trazabilidad y reversa controlada de stock porque es mas seguro.
- Excel nativo se reemplaza por CSV compatible Excel. El contenido y filtros quedan cubiertos.
- PDF formal no se implementa en este sprint porque no existe motor PDF en la plataforma nueva; queda como mejora no bloqueante si el cliente exige el mismo formato impreso legacy.

## Archivos modificados

- `backend/src/routes/pagos-proveedores/index.js`
- `backend/src/routes/proveedores/index.js`
- `backend/src/routes/cobranza/index.js`
- `backend/src/routes/cobranza/scope.js`
- `backend/src/routes/reportes/index.js`
- `backend/src/routes/ventas/list.js`
- `backend/src/routes/dashboard/stats.js`
- `backend/test/cobranza-pagos-proveedores.test.js`
- `backend/test/reportes-gerenciales.test.js`
- `backend/package.json`
- `frontend/src/api/caja.js`
- `frontend/src/pages/cobranza/CobranzaPage.jsx`
- `frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx`
- `frontend/src/pages/proveedores/ProveedoresPage.jsx`

## Validacion ejecutada

- `npm test -- cobranza-pagos-proveedores.test.js pagos-proveedores-stock.test.js operational.test.js --reporter=dot` -> **14/14 OK**
- `npm run test:ci -- --reporter=dot` -> **95/95 OK**
- `npm test -- --reporter=dot` -> **333/333 OK**
- `npm run lint` frontend -> **OK**
- `npm run build` frontend -> **OK** con advertencia conocida de chunk Vite mayor a 500 kB.

## Decision final

**SPR-12 aprobado para continuar.**

Queda documentado como observacion no bloqueante que el PDF legacy no fue replicado como PDF nativo. Los datos, filtros y export operativo quedan cubiertos por CSV compatible Excel y el comportamiento destructivo se reemplaza por anulacion segura.
