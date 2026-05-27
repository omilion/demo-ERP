# SPR-21-facturas-bodega - facturas_bodega

Prioridad: **P0 - critico operativo**  
Dominio: **Bodega / Inventario / Pagos proveedor**  
Estado: **Aprobado**

## Objetivo

Revisar y reparar el modulo legacy `facturas_bodega` contra la plataforma nueva, sin omitir campos, filtros, acciones, efectos de stock, costo, permisos ni trazabilidad.

## Auditoria multiagente

- **Averroes - funcional/UI:** confirmo que faltaba el flujo legacy completo `Crear -> agregar detalle -> aplicar stock/costo`, alta de item faltante, filtros, export detalle/resumen, navegacion desde dashboard y acciones de detalle/anulacion.
- **Laplace - datos/seguridad:** confirmo riesgos P0 en duplicados, anulacion sin reversa de stock, notas de credito sumando stock, falta de scope por sucursal y permisos demasiado amplios.

## Legacy revisado

- `facturas_bodega/lista.php`
- `facturas_bodega/nuevo.php`
- `facturas_bodega/insertar.php`
- `facturas_bodega/eliminar.php`
- `facturas_bodega/agregar_detalle/direccionar.php`
- `facturas_bodega/agregar_detalle/actualizar_detalle.php`
- `facturas_bodega/agregar_detalle/insertar.php`
- `facturas_bodega/lista_detalle/lista.php`
- `facturas_bodega/lista_detalle/eliminar.php`
- `facturas_bodega/lista_excel.php`
- `facturas_bodega/lista_excel_detalle.php`
- `facturas_bodega/lista_pdf.php`

## Brechas detectadas y resolucion

| Punto legacy / riesgo | Estado final | Resolucion |
|---|---:|---|
| Crear factura/boleta/nota con bodega, proveedor, fechas, estado, total y observacion | Resuelto | `StockIngresosPage` ahora tiene formulario de nuevo documento con cabecera legacy y detalle. |
| Agregar detalle por codigo interno y aplicar stock | Resuelto | Se guardan lineas en `DetalleFacturaProveedor` y se puede aplicar stock al guardar o posteriormente. |
| Crear producto/material/tela faltante desde el detalle | Resuelto | Backend crea el item si el codigo no existe y la linea trae nombre; luego aplica stock. |
| Actualizar costo/precio al ingresar mercaderia | Resuelto | Producto actualiza `precioLista` con historial; material/tela actualizan `precio`. |
| Nota de credito no debe sumar stock | Resuelto | Documento `Nota` aplica egreso de stock y no actualiza costo. |
| Eliminar/anular debe revertir stock | Resuelto | Nueva accion `anular` revierte stock con movimientos inversos y soft-delete; no hay borrado fisico. |
| Duplicado `documento + n_doc + proveedor + sucursal` | Resuelto | Validacion transaccional con advisory lock y migracion con indice unico condicionado si los datos existentes lo permiten. |
| Filtros legacy por fecha, documento, proveedor, numero, bodega, facturas/boletas no pagadas | Resuelto | Backend y UI leen esos filtros; dashboard `/pagos-proveedores?doc=Factura&estado=Pendiente` queda operativo. |
| Export resumen y detalle | Resuelto | Export CSV backend para resumen y detalle, con todos los registros filtrados, no solo pagina actual. |
| Scope por sucursal | Resuelto | Listado, detalle, creacion y aplicacion respetan `sucursalId` del usuario cuando existe. |
| Acceso alternativo desde ficha proveedor podia saltarse reglas | Resuelto | Rutas anidadas de proveedor ahora filtran `eliminado`, validan duplicado y no borran fisicamente. |
| Aplicacion de stock en bodegas de gasto/activo | Resuelto | Backend y UI solo permiten aplicar stock en `Inventario`, `Materias` o `Taller`; gastos/activo quedan como documentos financieros sin movimiento de stock. |
| Aplicar stock desde creacion con permiso insuficiente | Resuelto | Si `ingresaStock=true`, backend exige tambien `bodega.write`, no solo `proveedores.write`. |
| Altas faltantes parciales antes de fallar | Resuelto | El helper hace preflight completo y no crea items si otra linea faltante no puede resolverse. |
| Export completo | Resuelto | Export resumen/detalle ya no tiene corte fijo de filas ni depende de la pagina visible. |
| Anulacion trazable | Resuelto | Backend exige motivo de anulacion y UI valida motivo no vacio. |

## Implementacion

Backend:
- `backend/src/routes/pagos-proveedores/index.js`
  - filtros equivalentes al legacy;
  - export CSV resumen/detalle;
  - validacion de duplicados;
  - bloqueo de edicion peligrosa con stock aplicado;
  - motivo obligatorio de anulacion;
  - permiso `bodega.write` cuando la creacion aplica stock;
  - bloqueo de stock para bodegas que no corresponden a inventario/materias/taller;
  - `POST /api/pagos-proveedores/:id/anular`;
  - `DELETE /api/pagos-proveedores/:id` como anulacion trazable.
- `backend/src/routes/stock-ingresos/apply.js`
  - preflight antes de mutar stock;
  - alta de items faltantes;
  - no deja altas parciales si otra linea faltante fallaria;
  - actualizacion de costo;
  - nota de credito como egreso;
  - reversa transaccional.
- `backend/src/routes/stock-ingresos/index.js`
  - filtros legacy y scope;
  - aplicacion respeta sucursal estricta del pago;
  - aplicacion bloqueada para bodegas no-stock;
  - aplica solo pagos activos/no reversados.
- `backend/src/routes/proveedores/index.js`
  - elimina via soft-delete;
  - bloquea borrado inseguro si stock fue aplicado;
  - valida duplicados.
- `backend/prisma/schema.prisma`
  - trazabilidad de anulacion/reversa en `PagoProveedor`;
  - datos de item faltante en `DetalleFacturaProveedor`.
- `backend/prisma/migrations/20260526123000_harden_facturas_bodega_stock/migration.sql`
  - columnas nuevas;
  - indices de busqueda;
  - indice unico activo cuando no existan duplicados legacy previos.

Frontend:
- `frontend/src/pages/stock-ingresos/StockIngresosPage.jsx`
  - formulario de nuevo documento bodega;
  - detalle con destino producto/material/tela;
  - aplicar stock;
  - anular si el rol tiene permiso;
  - filtros legacy;
  - export resumen/detalle.
- `frontend/src/pages/pagos-proveedores/PagosProveedoresPage.jsx`
  - lee query params del dashboard;
  - filtros por documento, bodega y proveedor;
  - export backend filtrado.
- `frontend/src/pages/pagos-proveedores/PagoProveedorDetallePage.jsx`
  - muestra stock aplicado/reversado;
  - aplica stock;
  - anula;
  - bloquea campos peligrosos si el stock ya fue aplicado.
- `frontend/src/api/pagosProveedores.js` y `frontend/src/api/stockIngresos.js`
  - mutations y descargas CSV backend.

## Pruebas ejecutadas

- `npm.cmd exec prisma validate` -> OK.
- `npm.cmd exec prisma generate` -> OK.
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test npm.cmd exec prisma migrate deploy` -> OK.
- `npm.cmd test -- pagos-proveedores-stock.test.js stock-ingresos-apply.test.js cobranza-pagos-proveedores.test.js productos.test.js --reporter=dot` -> **4 archivos, 32 tests OK**.
- `npm.cmd run test:ci -- --reporter=dot` -> **14 archivos, 102 tests OK**.
- `frontend npm.cmd run lint` -> **OK**.
- `frontend npm.cmd run build` -> **OK**.

Nota: el build mantiene la advertencia conocida de chunk JS mayor a 500 kB. No bloquea funcionalidad.

## Riesgos residuales / fuera de este sprint

- PDF nativo igual al legacy queda como mejora de reporteria. Este sprint entrega CSV resumen/detalle backend, que cubre el alcance operativo y no queda limitado a la pagina visible.
- Alta completa de categorias/subcategorias desde el formulario de factura no se implemento como selector dependiente legacy; el backend ya guarda IDs si se envian. La creacion/gestion de categorias sigue en sus modulos correspondientes.
- Separacion fina de permisos nuevos (`stock_ingresos:apply`, `stock_ingresos:reverse`, etc.) queda como mejora transversal de RBAC. En este sprint se uso el RBAC existente: bodega aplica stock, proveedores modifica pago, proveedores delete/anula.
- `STOCK_BODEGAS` queda duplicado en backend/frontend como constante tecnica; no bloquea el sprint, pero conviene centralizar si se crea un catalogo configurable de bodegas.

## Decision final

**Aprobado.**  
El sprint cierra las brechas P0/P1 de integridad y flujo operativo del modulo `facturas_bodega`: ya no hay suma erronea por notas, duplicacion simple de documentos, borrado fisico de pagos, anulacion sin reversa de stock, bypass de permisos de bodega ni aplicacion de stock sobre bodegas de gasto/activo. Revision multiagente final: **aprobada sin P0/P1**.
