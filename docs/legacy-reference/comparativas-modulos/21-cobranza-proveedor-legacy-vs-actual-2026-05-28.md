# 21 - Cobranza proveedor: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, separado en cobranza clientes y pagos proveedores**.

## Fuentes revisadas

- Capturas legacy: [42-menu-cobranza.png](../screenshots/42-menu-cobranza.png) a [49-boletas-no-pagadas.png](../screenshots/49-boletas-no-pagadas.png)
- Capturas actuales: [17-bodega-pagos-proveedores.png](../current-screenshots/17-bodega-pagos-proveedores.png), [27-caja-cobranza-clientes.png](../current-screenshots/27-caja-cobranza-clientes.png), [16-bodega-proveedores.png](../current-screenshots/16-bodega-proveedores.png)
- Frontend actual: `frontend/src/pages/pagos-proveedores`, `frontend/src/pages/cobranza`, `frontend/src/pages/proveedores`
- Backend actual: `backend/src/routes/pagos-proveedores`, `backend/src/routes/cobranza`, `backend/src/routes/proveedores`

## Resumen ejecutivo

Legacy usaba el nombre Cobranza para flujos que mezclaban proveedor, boleta/factura, fechas, documentos no pagados y busquedas por proveedor. El ERP actual separa conceptualmente: `/cobranza` para cobrar a clientes y `/pagos-proveedores` para pagar documentos de proveedores.

Esta separacion es una mejora y debe explicarse al cliente para evitar pensar que algo falta solo porque cambio de nombre.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Menu Cobranza | Entrada mezclada. | `/cobranza` y `/pagos-proveedores`. | Reubicado/mejorado. |
| Nueva boleta/factura proveedor | Pantalla legacy. | `/pagos-proveedores` y `/stock-ingresos`. | Cubierto. |
| Buscar numero documento | Pantalla legacy. | Buscador de pagos proveedores. | Cubierto. |
| Entre fechas | Pantalla legacy. | Filtros desde/hasta. | Cubierto. |
| Documento + fechas | Pantalla legacy. | Filtros documento + fechas. | Cubierto. |
| Proveedor + fechas | Pantalla legacy. | Filtros proveedor/RUT + fechas. | Cubierto. |
| Facturas/boletas no pagadas | Pantallas legacy. | Filtros/botones de no pagadas. | Cubierto. |

## Mejoras nuevas que no se deben perder

- Separacion entre cobrar clientes y pagar proveedores.
- Detalle de documento proveedor.
- Anulacion con motivo.
- Bloqueos si stock ya fue aplicado.
- Integracion con proveedor e ingreso de mercaderia.
- Exportacion CSV.
- Scope por sucursal.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Nombre `Cobranza proveedor` | Puede confundir porque el actual habla de Pagos Proveedores. | Explicar cambio semantico en entrega al cliente. |
| Vistas no pagadas dedicadas | Actual filtra; legacy tenia pantallas. | Validar si botones actuales son suficientemente visibles. |
| Reportes impresos legacy | Si se imprimian listados, CSV puede no bastar. | Confirmar formato requerido. |

## Detalles legacy que ya no tienen sentido conservar

- Mezclar cobro a clientes con pago a proveedores bajo un solo nombre.
- Pantallas separadas para cada combinacion de filtros.
- Anular documentos sin trazabilidad de motivo/stock.

## Decision del modulo

Modulo **mejorado**. Mantener separacion actual y documentar el cambio de terminologia.

