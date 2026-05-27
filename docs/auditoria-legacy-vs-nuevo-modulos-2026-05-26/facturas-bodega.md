# Auditoria legacy vs nuevo - facturas_bodega

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\facturas_bodega`  
Estado final: **Aprobado en SPR-21**

## Como se mostraba / funcionaba en legacy

- Lista de documentos de bodega filtrada por sucursal.
- Filtros por fechas, documento, proveedor, numero, facturas no pagadas y boletas no pagadas.
- Columnas: acciones, N Doc, Documento, Estado, Total, Proveedor, Fecha Creacion, Fecha Documento, Fecha Pago, Fecha Vencimiento, Bodega, Creada por.
- Acciones: modificar documento, ver/agregar detalle, eliminar con confirmacion admin.
- Nuevo documento: bodega, documento, n_doc, proveedor, total, estado, fecha_doc, fecha_vencimiento, fecha_pago, observacion.
- Detalle: codigo interno, cantidad, costo, alta de producto/material si no existia, suma de stock y actualizacion de costo.
- Nota de credito (`Nota`) descontaba stock para inventario.
- Exportaciones legacy: PDF, Excel resumen y Excel detalle.

## Como queda en la plataforma nueva

- `frontend/src/pages/stock-ingresos/StockIngresosPage.jsx`
  - formulario de documento bodega con cabecera y detalle;
  - aplica stock al guardar o posteriormente;
  - filtros por fecha, numero, documento, estado, bodega y proveedor;
  - export CSV resumen/detalle desde backend.
- `frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx`
  - vista financiera con filtros del dashboard y export backend.
- `frontend/src/pages/pagos-proveedores/PagoProveedorDetallePage.jsx`
  - detalle, estado de stock, aplicar stock, anular/reversar, edicion segura.
- `backend/src/routes/pagos-proveedores`
  - duplicados protegidos;
  - anular con reversa de stock;
  - soft-delete;
  - export filtrado.
- `backend/src/routes/stock-ingresos`
  - scope por sucursal;
  - nota como egreso;
  - alta de item faltante;
  - preflight completo antes de crear faltantes;
  - bloqueo de aplicacion en bodegas de gasto/activo;
  - costo actualizado.

## Extras nuevos frente al legacy

- Reversa trazable en vez de borrado fisico.
- Movimientos de stock ligados a `pagoProveedorId` y `origenTipo`.
- Idempotencia al aplicar stock.
- Validacion transaccional antes de mutar stock.
- Bloqueo de campos peligrosos cuando el stock ya fue aplicado.
- Export backend filtrado, no limitado a la pagina visible.
- Motivo obligatorio al anular.
- `bodega.write` obligatorio cuando la creacion aplica stock.
- Aplicacion posterior de stock protegida por sucursal y tipo de bodega.

## Riesgos residuales

- PDF nativo identico al legacy queda como mejora de reporteria.
- Selector dependiente categoria/subcategoria dentro de la factura queda pendiente como mejora UX; el backend ya puede persistir IDs si se envian.
- Permisos granulares nuevos quedan como mejora transversal de RBAC.
- Constante de bodegas que afectan stock duplicada en backend/frontend; conviene centralizar si se vuelve configurable.

## Evidencia de validacion

- Prisma validate/generate/migrate deploy OK.
- Pruebas enfocadas SPR-21: 4 archivos, 32 tests OK.
- Backend `test:ci`: 14 archivos, 102 tests OK.
- Frontend lint OK.
- Frontend build OK.
- Revision multiagente final: aprobado sin P0/P1.
