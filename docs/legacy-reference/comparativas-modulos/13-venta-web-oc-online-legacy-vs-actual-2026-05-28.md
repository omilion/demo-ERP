# 13 - Venta web / OC online: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, reubicado como Ordenes de Compra online**.

## Fuentes revisadas

- Capturas legacy: [25-buscar-por-numero-de-venta.png](../screenshots/25-buscar-por-numero-de-venta.png), [26-buscar-por-orden-compra.png](../screenshots/26-buscar-por-orden-compra.png), [27-buscar-por-fechas.png](../screenshots/27-buscar-por-fechas.png)
- Capturas actuales: [05-ventas-oc-online-venta-web.png](../current-screenshots/05-ventas-oc-online-venta-web.png), [04-ventas-matriz-ventas.png](../current-screenshots/04-ventas-matriz-ventas.png)
- Frontend actual: `frontend/src/pages/ordenes-compra`, `frontend/src/pages/matriz-ventas/MatrizVentasPage.jsx`
- Backend actual: `backend/src/routes/ordenes-compra`, `backend/src/routes/matriz-ventas`

## Resumen ejecutivo

Legacy trataba venta web mediante busquedas por venta, orden de compra y fechas. El ERP actual representa este flujo como `/ordenes-compra`, con OC online como entidad propia, y la integra con `/matriz-ventas` para seguimiento comercial.

La mejora es conceptual: la venta web ya no queda solo como busqueda, sino como OC trazable que puede relacionarse con venta y despacho.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Buscar por numero venta | Pantalla venta web. | `/ordenes-compra` y matriz. | Consolidado. |
| Buscar por OC | Pantalla dedicada. | Busqueda por OC en ordenes y matriz. | Cubierto. |
| Buscar por fechas | Pantalla dedicada. | Ordenes/matriz; validar filtro visible de fecha en OC. | Parcial / validar. |
| Entidad web | Venta web como busqueda. | OC online como entidad con detalle. | Mejorado. |
| Estado trazable | No claro en captura legacy. | Estados de OC/venta. | Mejorado. |

## Mejoras nuevas que no se deben perder

- OC online como entidad propia.
- Detalle de OC.
- Integracion con matriz comercial.
- Estado trazable.
- Relacion potencial web -> venta -> despacho.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Filtro de fecha visible en OC | Legacy tenia pantalla por fechas. | Validar si matriz basta o si OC requiere filtro directo. |
| Flujo completo web a despacho | Baseline lo marca como punto clave. | Revisar con usuario clave antes de cambios. |
| Portal web legacy | Parte tecnica `web/usuarios-web/banners` requiere comparacion aparte si cliente lo pide. | Mantener separado del ERP interno. |

## Detalles legacy que ya no tienen sentido conservar

- Tratar venta web solo como busquedas aisladas.
- Duplicar venta web si OC online cubre origen y trazabilidad.

## Decision del modulo

Modulo **mejorado**. Validar flujo completo OC online -> venta -> despacho y si filtro de fecha directo en `/ordenes-compra` es necesario.

