# Auditoria legacy vs nuevo - cobranza

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\cobranza`  
Estado: **Revisado y remediado en SPR-12**  
Decision: **Aprobado para continuar**

## Lectura funcional del legacy

El modulo legacy `cobranza` mezclaba dos ambitos:

- Cobranza de ventas a clientes: accesos a facturas, ventas no pagadas y busquedas en `cobranza_cliente`.
- Documentos y pagos de proveedores: gestion de `pagos_proveedores`.

## Como se mostraba en legacy

- Menu principal con accesos a:
  - Entre fechas facturas venta.
  - Factura y numero.
  - Facturas no pagadas.
  - Ventas no pagadas.
  - Facturas proveedor no pagadas.
  - Boletas proveedor no pagadas.
  - Crear nueva boleta o factura proveedor.
  - Busquedas por fechas, documento+fechas, numero y proveedor+fechas.
- Alta proveedor con:
  - Documento Factura/Boleta.
  - Numero documento.
  - Proveedor.
  - Total.
  - Estado Pagada/No pagada.
  - Fecha documento.
  - Fecha pago.
  - Observaciones.
  - Usuario, sucursal y fecha creacion desde sesion.
- Listado proveedor con:
  - N Doc, Documento, Estado, RUT, Proveedor, Fecha documento, Fecha vencimiento, Total, Fecha pago, Fecha creacion, Creada por.
  - Variante con NC Monto.
  - Subtotal por proveedor.
- Exportaciones:
  - Excel.
  - PDF landscape.
- Eliminacion:
  - Borrado fisico.
  - Reversa manual de stock si el documento tenia bodega Inventario o Taller.

## Como se muestra hoy

- `/cobranza`: cuentas por cobrar de ventas y cobranza historica.
- `/api/cobranza-historico`: historico de cobranza.
- `/api/caja/cobranza/orden/:id/pago`: registro real de pago de venta.
- `/pagos-proveedores`: documentos/pagos proveedor.
- `/stock-ingresos`: documentos proveedor que ingresan stock.
- `/proveedores`: ficha proveedor con pagos, protegida por permisos de proveedores.

## Estado de paridad

| Area | Estado | Observacion |
| --- | --- | --- |
| Cobranza ventas activas | Resuelto | KPIs backend, busqueda ampliada y export especifico con saldo/documentos/pagos. |
| Cobranza historica | Resuelto | Scope por sucursal mediante venta enlazada y export con campos legacy/modelados. |
| Alta simple boleta/factura proveedor | Resuelto | Nueva accion en `/pagos-proveedores`, sin ingreso de stock y con validaciones requeridas. |
| Filtros proveedor | Resuelto | Fecha, documento, proveedor, numero, estado y accesos rapidos no pagadas. |
| Columnas legacy proveedor | Resuelto | Fecha creacion, creada por, NC y totales por proveedor visibles. |
| Export proveedor | Resuelto parcial | CSV compatible Excel con columnas legacy; export detalle disponible. |
| PDF proveedor | Pendiente no bloqueante | No hay motor PDF nativo; implementar solo si cliente exige formato PDF formal. |
| Eliminacion legacy | Reemplazado | Se conserva anulacion segura con trazabilidad y reversa controlada; no se replica borrado fisico. |
| Permisos/sucursal | Resuelto | Cerrados bypass de rutas heredadas y mutaciones por ID fuera de sucursal. |

## Evidencia de validacion

- Backend foco SPR-12: **14 tests OK**.
- Backend CI: **95 tests OK**.
- Backend full: **333 tests OK**.
- Frontend lint: **OK**.
- Frontend build: **OK**, con advertencia conocida de chunk grande.

## Resultado

Modulo aprobado para continuar al siguiente sprint. La unica brecha funcional documentada es PDF nativo, que queda como mejora condicionada a solicitud explicita del cliente porque el reemplazo operativo CSV/Excel ya cubre filtros y datos.
