# 14 - Licitaciones cotizadas: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con estados legacy por validar**.

## Fuentes revisadas

- Capturas legacy: [28-nueva-cotizacion-de-licitacion.png](../screenshots/28-nueva-cotizacion-de-licitacion.png) a [32-buscar-licitaciones-por-estados-y-fechas.png](../screenshots/32-buscar-licitaciones-por-estados-y-fechas.png)
- Capturas actuales: [06-ventas-licitaciones.png](../current-screenshots/06-ventas-licitaciones.png), [07-ventas-nueva-licitacion.png](../current-screenshots/07-ventas-nueva-licitacion.png), [09-ventas-reportes-licitaciones.png](../current-screenshots/09-ventas-reportes-licitaciones.png)
- Frontend actual: `frontend/src/pages/licitaciones`, `frontend/src/pages/reportes-licitaciones`
- Backend actual: `backend/src/routes/cotizaciones`, `backend/src/routes/reportes`

## Resumen ejecutivo

Legacy tenia nueva cotizacion de licitacion y reportes/busquedas por pendientes, ID, fechas y estados. El ERP actual mantiene `/licitaciones`, `/licitaciones/nueva` y `/reportes/licitaciones`, agregando detalle, ficha tecnica/economica, exportacion y creacion de venta desde licitacion.

La funcion esta cubierta y mejorada. Antes de cambiar etiquetas se debe validar equivalencia entre estados legacy y estados actuales.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Nueva cotizacion | Pantalla propia. | `/licitaciones/nueva`. | Cubierto. |
| Pendientes | Reporte pendiente. | Filtro por estado en licitaciones/reportes. | Cubierto. |
| Buscar por ID | Pantalla dedicada. | Buscador/listado de licitaciones. | Cubierto. |
| Buscar por fechas | Pantalla dedicada. | Filtros desde/hasta. | Cubierto. |
| Estado + fechas | Pantalla dedicada. | Reportes/listado con estado y fecha. | Cubierto. |
| Ficha tecnica/economica | No se evidencia en captura legacy. | Ruta de ficha y detalle. | Mejorado. |
| Crear venta desde licitacion | No visible. | Flujo actual soportado. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Detalle de licitacion.
- Ficha tecnica/economica.
- Reporteria especifica.
- Export CSV.
- Crear venta desde licitacion.
- Estados trazables.
- Integracion con matriz ventas.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Equivalencia de estados | Cambiar etiquetas puede romper reportes diarios. | Mapear estados legacy vs actuales con usuario comercial. |
| Campos exactos de cotizacion | Formulario legacy puede tener campos usados informalmente. | Comparar formulario antes de modificar. |
| Busquedas dedicadas | Usuarios antiguos esperan paginas separadas. | Mantener filtros consolidados salvo necesidad probada. |

## Detalles legacy que ya no tienen sentido conservar

- Reportes separados por cada combinacion de filtro.
- Duplicar pantallas si `/licitaciones` y `/reportes/licitaciones` cubren el seguimiento.

## Decision del modulo

Modulo **mejorado**. No cambiar estados sin validacion funcional.

