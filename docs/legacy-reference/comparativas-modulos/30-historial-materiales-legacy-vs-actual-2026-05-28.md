# 30 - Historial materiales: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con tipos de movimiento por validar**.

## Fuentes revisadas

- Capturas legacy: [101-buscar-por-fechas.png](../screenshots/101-buscar-por-fechas.png), [102-buscar-por-taller.png](../screenshots/102-buscar-por-taller.png), [103-buscar-taller-entre-fechas.png](../screenshots/103-buscar-taller-entre-fechas.png)
- Captura actual: [23-taller-historial-materiales.png](../current-screenshots/23-taller-historial-materiales.png)
- Frontend actual: `frontend/src/pages/historial-materiales/HistorialMaterialesPage.jsx`
- Backend actual: `backend/src/routes/historial-materiales/index.js`, `backend/src/routes/odts/consumos.js`

## Resumen ejecutivo

Legacy tenia busquedas de historial por fechas, taller y taller entre fechas. El ERP actual mantiene `/historial-materiales`, vinculando movimientos a ODT, taller, material y consumos desde bodega taller.

La funcion esta mejorada, pero hay que validar si todos los tipos de movimiento legacy tienen equivalente.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Buscar fechas | Pantalla legacy. | Filtro fecha. | Cubierto. |
| Buscar taller | Pantalla legacy. | Filtro taller. | Cubierto. |
| Taller + fechas | Pantalla legacy. | Filtros combinados. | Cubierto. |
| Relacion ODT | No claro. | Historial con ODT. | Mejorado. |
| Consumo material | Legacy historico. | Consumos desde ODT/bodega taller. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Movimiento con ODT/taller/material.
- Export.
- Consumo desde bodega taller.
- Filtros combinados.
- Relacion con bitacora/ODT.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Tipos de movimiento legacy | Puede faltar egreso/ajuste especifico. | Mapear tipos historicos contra actuales. |
| Filtros por operario | Si legacy lo usaba indirectamente. | Validar con taller. |

## Detalles legacy que ya no tienen sentido conservar

- Historial sin relacion a ODT cuando el consumo corresponde a una orden.
- Pantallas por combinacion de filtro.

## Decision del modulo

Modulo **mejorado**. Validar catalogo de tipos de movimiento.

