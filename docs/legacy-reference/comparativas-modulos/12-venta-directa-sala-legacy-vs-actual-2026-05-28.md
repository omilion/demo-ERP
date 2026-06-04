# 12 - Venta directa / venta sala: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, venta sala consolidada en Ventas**.

## Fuentes revisadas

- Capturas legacy: [22-nueva-venta.png](../screenshots/22-nueva-venta.png), [23-buscar-por-numero-de-venta.png](../screenshots/23-buscar-por-numero-de-venta.png), [24-buscar-por-fechas.png](../screenshots/24-buscar-por-fechas.png)
- Capturas actuales: [02-ventas-listado-ventas.png](../current-screenshots/02-ventas-listado-ventas.png), [03-ventas-nueva-venta.png](../current-screenshots/03-ventas-nueva-venta.png), [04-ventas-matriz-ventas.png](../current-screenshots/04-ventas-matriz-ventas.png)
- Frontend actual: `frontend/src/pages/ventas/VentasPage.jsx`, `frontend/src/pages/ventas/VentasFormPage.jsx`, `frontend/src/pages/matriz-ventas/MatrizVentasPage.jsx`
- Backend actual: `backend/src/routes/ventas`, `backend/src/routes/matriz-ventas`

## Resumen ejecutivo

Legacy trataba venta directa o venta sala como flujo propio, con nueva venta y busquedas por numero/fecha. El ERP actual la integra en `/ventas`, `/ventas/nueva` y `/matriz-ventas`, manteniendo el tipo de venta dentro de un modelo comercial unificado.

La funcionalidad esta cubierta y mejorada. La unica duda es de nomenclatura: si el usuario necesita ver "Venta sala" como acceso separado o acepta que sea un tipo dentro de Ventas.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Nueva venta | Pantalla `Nueva Venta`. | `/ventas/nueva`. | Cubierto. |
| Buscar por numero | Pantalla separada. | Buscador en ventas y matriz. | Consolidado. |
| Buscar por fecha | Pantalla separada. | Filtros en matriz/listados. | Consolidado. |
| Tipo venta sala | Modulo separado. | Tipo dentro de ventas unificadas. | Mejorado. |
| Impresion/documento | Legacy dependia de flujo antiguo. | Ruta de impresion de venta y links desde listados. | Mejorado. |
| Estados pago/entrega | No centralizado en legacy. | No pagadas y pendiente entrega visibles en dashboard/matriz. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Venta unificada por tipos.
- Matriz ventas como vista de seguimiento.
- Filtros y KPIs compartidos.
- Impresion desde venta.
- Exportacion.
- Integracion con despacho, cobranza y dashboard.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Nombre `Venta sala` | Puede ser lenguaje diario del equipo. | Validar si se agrega acceso directo sin duplicar modelo. |
| Campos exactos de formulario legacy | La captura debe compararse con usuarios si se pide paridad total. | Revisar columna/campo antes de tocar formulario. |
| Flujo rapido de meson | Consolidar puede agregar pasos. | Probar con vendedor en flujo real. |

## Detalles legacy que ya no tienen sentido conservar

- Busquedas como pantallas separadas si la matriz las cubre.
- Duplicar venta sala como entidad distinta cuando el tipo normalizado resuelve reportes.

## Decision del modulo

Modulo **mejorado**. Mantener ventas unificadas y validar solo nomenclatura/acceso directo "Venta sala".

