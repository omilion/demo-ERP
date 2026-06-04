# 24 - Taller matriz / ODT: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, ODT como entidad central**.

## Fuentes revisadas

- Capturas legacy: [79-ot-prioridad-alta.png](../screenshots/79-ot-prioridad-alta.png) a [83-busqueda-taller-entre-fechas.png](../screenshots/83-busqueda-taller-entre-fechas.png)
- Capturas actuales: [18-taller-odt-taller.png](../current-screenshots/18-taller-odt-taller.png), [19-taller-nueva-odt.png](../current-screenshots/19-taller-nueva-odt.png)
- Frontend actual: `frontend/src/pages/taller/*`, `frontend/src/api/odts.js`
- Backend actual: `backend/src/routes/odts/*`

## Resumen ejecutivo

Legacy tenia matriz de talleres y busquedas por N OT, fechas y taller. El ERP actual consolida todo en `/taller` y `/taller/nueva`, con ODT como entidad principal, estados, prioridad, cierre/reapertura/anulacion, bitacora y consumos asociados.

La mejora es estructural: ODT pasa a ordenar taller, materiales, bitacora y despacho.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| OTs prioritarias | Vista legacy. | Prioridad/urgente en ODT. | Cubierto. |
| Buscar N OT | Pantalla separada. | Buscador/filtro en taller. | Validar rapidez. |
| Buscar fechas | Pantalla separada. | Filtros de fecha. | Cubierto. |
| Buscar taller + fechas | Pantalla separada. | Filtro tipo/taller + fechas. | Cubierto. |
| Nueva ODT | Flujo legacy por taller. | `/taller/nueva`. | Mejorado. |
| Bitacora/materiales | Separados. | Integrados a ODT. | Mejorado. |

## Mejoras nuevas que no se deben perder

- ODT centralizada.
- Estados y prioridad.
- Cierre, reapertura y anulacion con motivo.
- Bitacora dentro de ODT.
- Materiales/consumos vinculados.
- Export.
- Links desde venta/despacho.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Velocidad busqueda N OT | Operacion diaria puede depender de esto. | Probar con jefe de taller. |
| Filtros por taller/fecha | Legacy tenia pantallas directas. | Validar equivalencia en UI. |
| Nomenclatura ODT/OT | Usuario puede decir OT. | Usar ambos terminos en capacitacion si aplica. |

## Detalles legacy que ya no tienen sentido conservar

- Matrices separadas por taller si un filtro mantiene contexto.
- OTs sin entidad central para materiales/bitacora/despacho.

## Decision del modulo

Modulo **mejorado**. Validar rapidez de busquedas antes de cambios.

