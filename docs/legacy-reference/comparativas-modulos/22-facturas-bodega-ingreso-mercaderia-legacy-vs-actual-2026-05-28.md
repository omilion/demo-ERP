# 22 - Facturas bodega / ingreso mercaderia: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, integrado con proveedor, pago y stock**.

## Fuentes revisadas

- Capturas legacy: [104-menu-ingreso-mercaderia.png](../screenshots/104-menu-ingreso-mercaderia.png) a [109-proveedor-entre-fechas.png](../screenshots/109-proveedor-entre-fechas.png)
- Capturas actuales: [14-bodega-ingreso-mercaderia.png](../current-screenshots/14-bodega-ingreso-mercaderia.png), [17-bodega-pagos-proveedores.png](../current-screenshots/17-bodega-pagos-proveedores.png)
- Frontend actual: `frontend/src/pages/stock-ingresos/StockIngresosPage.jsx`, `frontend/src/pages/pagos-proveedores`
- Backend actual: `backend/src/routes/stock-ingresos`, `backend/src/routes/pagos-proveedores`

## Resumen ejecutivo

Legacy trataba el ingreso de mercaderia como menu de facturas/boletas de bodega con busquedas por numero, fechas, documento y proveedor. El ERP actual lo maneja desde `/stock-ingresos`, conectado a proveedores y pagos proveedores, con aplicacion controlada de stock y restricciones de reversa/anulacion.

La mejora es fuerte: ingreso de mercaderia deja de ser solo documento y queda unido a stock real.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Menu ingreso mercaderia | Pantalla legacy. | `/stock-ingresos`. | Cubierto. |
| Nueva boleta/factura | Legacy proveedor/bodega. | Nuevo documento bodega y pago proveedor. | Cubierto. |
| Buscar numero | Pantalla legacy. | Busqueda/filtros en pagos/stock ingresos. | Cubierto. |
| Buscar fechas | Pantalla legacy. | Desde/Hasta. | Cubierto. |
| Proveedor entre fechas | Pantalla legacy. | Proveedor/RUT + fechas. | Cubierto. |
| Aplicar stock | No claro en captura. | Aplicacion controlada de stock. | Mejorado. |
| Reversa/anulacion | No claro. | Restricciones por stock aplicado/reversado. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Documento conectado a proveedor.
- Documento conectado a pago proveedor.
- Aplicacion de stock controlada.
- Reversa/anulacion con restricciones.
- Deteccion de duplicados.
- Scope por sucursal.
- Exportacion.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Terminologia `facturas bodega` | Cliente puede seguir usando el nombre antiguo. | Nombrar tambien "Ingreso mercaderia / facturas bodega" en capacitacion. |
| Campos exactos legacy | Pueden existir campos contables usados. | Validar con bodega/administracion. |
| Reporte por proveedor/fecha | Actual filtra, pero validar formato. | Confirmar exportacion requerida. |

## Detalles legacy que ya no tienen sentido conservar

- Documento de bodega desconectado del stock.
- Pantallas de busqueda separadas por combinacion.
- Anulaciones sin restricciones cuando hay stock aplicado.

## Decision del modulo

Modulo **mejorado**. Mantener integracion stock/proveedor/pago y validar terminologia con el cliente.

