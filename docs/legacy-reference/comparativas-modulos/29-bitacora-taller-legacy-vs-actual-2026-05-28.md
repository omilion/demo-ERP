# 29 - Bitacora taller: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con decision pendiente sobre ODT obligatoria**.

## Fuentes revisadas

- Capturas legacy: [98-nueva-bitacora.png](../screenshots/98-nueva-bitacora.png), [99-buscar-por-operario.png](../screenshots/99-buscar-por-operario.png), [100-buscar-por-operario-entre-fechas.png](../screenshots/100-buscar-por-operario-entre-fechas.png)
- Captura actual: [22-taller-bitacora-taller.png](../current-screenshots/22-taller-bitacora-taller.png)
- Frontend actual: `frontend/src/pages/bitacora-taller/BitacoraTallerPage.jsx`
- Backend actual: `backend/src/routes/bitacora-taller/index.js`, `backend/src/routes/odts/bitacora.js`

## Resumen ejecutivo

Legacy tenia bitacora diaria con busquedas por operario y fechas. El ERP actual mantiene `/bitacora-taller` y ademas permite bitacora dentro de ODT, con filtros, exportacion y permisos.

La mejora es la posibilidad de relacionar bitacora con ODT. La decision pendiente es si se debe obligar siempre ODT o permitir bitacora diaria libre.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Nueva bitacora | Pantalla legacy. | `/bitacora-taller` y ODT. | Cubierto/mejorado. |
| Buscar operario | Pantalla legacy. | Filtro operario. | Cubierto. |
| Operario + fechas | Pantalla legacy. | Filtros combinados. | Cubierto. |
| Relacion ODT | No obligatoria/visible. | Opcional o dentro de ODT. | Mejorado. |
| Export | Legacy por reportes. | CSV. | Cubierto. |

## Mejoras nuevas que no se deben perder

- Bitacora vinculable a ODT.
- Filtros por operario, texto y fechas.
- Export CSV.
- Permisos editar/eliminar.
- Bitacora dentro de ficha ODT.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| ODT obligatoria | Cambia habito de bitacora diaria. | Decidir con jefatura de taller. |
| Campos exactos legacy | Puede haber datos diarios especificos. | Comparar formulario antes de cambiar. |

## Detalles legacy que ya no tienen sentido conservar

- Bitacora completamente desconectada de ODT si el trabajo corresponde a una orden.
- Pantallas separadas para busquedas simples.

## Decision del modulo

Modulo **mejorado**. Mantener flexibilidad hasta que el cliente defina si ODT debe ser obligatoria.

