# 23 - Matriz ventas: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, clave para seguimiento diario**.

## Fuentes revisadas

- Capturas legacy: [110-matriz-ventas.png](../screenshots/110-matriz-ventas.png), [111-ventas-no-pagadas.png](../screenshots/111-ventas-no-pagadas.png), [112-ventas-pendientes-entrega.png](../screenshots/112-ventas-pendientes-entrega.png)
- Captura actual: [04-ventas-matriz-ventas.png](../current-screenshots/04-ventas-matriz-ventas.png)
- Frontend actual: `frontend/src/pages/matriz-ventas/MatrizVentasPage.jsx`
- Backend actual: `backend/src/routes/matriz-ventas/index.js`

## Resumen ejecutivo

Legacy ya tenia una matriz ventas y vistas derivadas para ventas no pagadas y pendientes de entrega. El ERP actual conserva `/matriz-ventas` como vista consolidada para venta sala, web, Convenio Marco y licitaciones, con KPIs, exportacion y links a venta/licitacion.

Este modulo debe tratarse como critico: cualquier ajuste debe comparar columnas exactas usadas por el cliente en seguimiento diario.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Matriz ventas | Vista propia. | `/matriz-ventas`. | Cubierto/mejorado. |
| Ventas no pagadas | Vista legacy. | KPI/filtro en matriz, dashboard y cobranza. | Cubierto. |
| Pendientes entrega | Vista legacy. | KPI/filtro en matriz, dashboard y despachos. | Cubierto. |
| Tipos de venta | Varias rutas legacy. | Consolidado por tipo. | Mejorado. |
| Links a detalle | No claro. | Links a venta/licitacion. | Mejorado. |
| Exportacion | Legacy segun reportes. | Export por formato. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Consolidacion de venta sala, web, Convenio Marco y licitaciones.
- KPIs operativos.
- Exportacion.
- Links a documentos relacionados.
- Integracion con dashboard, cobranza y despachos.
- Filtros centrales.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Columnas exactas de seguimiento | Este es modulo diario; una columna faltante puede afectar operacion. | Comparar columna por columna con usuario clave. |
| Filtros legacy especificos | Puede haber atajos usados por ventas/caja. | Convertir solo filtros confirmados en tareas. |
| Formato exportado | Cliente puede depender de Excel con columnas exactas. | Validar export CSV/XLS esperado. |

## Detalles legacy que ya no tienen sentido conservar

- Duplicar matrices separadas por tipo si una matriz consolidada filtra bien.
- Vistas independientes de no pagadas/pendiente entrega si los filtros actuales son visibles.

## Decision del modulo

Modulo **mejorado**, pero de alta sensibilidad. No tocar sin comparacion columna/filtro con usuario operativo.

