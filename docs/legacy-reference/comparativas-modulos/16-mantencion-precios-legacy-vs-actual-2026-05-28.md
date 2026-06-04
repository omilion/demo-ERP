# 16 - Mantencion precios: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, reubicado entre Bodega y Consulta Precios**.

## Fuentes revisadas

- Capturas legacy: [36-listado-completo-productos.png](../screenshots/36-listado-completo-productos.png) a [41-busqueda-por-proveedor.png](../screenshots/41-busqueda-por-proveedor.png)
- Capturas actuales: [11-bodega-inventario-productos.png](../current-screenshots/11-bodega-inventario-productos.png), [12-bodega-nuevo-producto.png](../current-screenshots/12-bodega-nuevo-producto.png), [13-bodega-consulta-precios.png](../current-screenshots/13-bodega-consulta-precios.png)
- Frontend actual: `frontend/src/pages/bodega/*`, `frontend/src/pages/consulta-precios/ConsultaPreciosPage.jsx`, `frontend/src/api/productos.js`
- Backend actual: `backend/src/routes/productos/*`, `backend/src/routes/reportes/index.js`

## Resumen ejecutivo

Legacy separaba **Mantencion precios** en listado completo y busquedas por codigo de barra, codigo interno, nombre, categoria/subcategoria y proveedor. El ERP actual reparte esa funcion entre `/bodega` para mantencion del producto y `/consulta-precios` para consulta rapida sin editar inventario.

La funcion esta mejorada porque agrega historial de precios, importacion masiva con validacion previa, exportacion y filtros consolidados.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Listado completo | Pantalla precios. | `/bodega` y `/consulta-precios`. | Reubicado/mejorado. |
| Buscar codigo barra | Pantalla separada. | Buscador general y filtros. | Cubierto. |
| Buscar codigo interno | Pantalla separada. | Buscador general. | Cubierto. |
| Buscar nombre | Pantalla separada. | Buscador general. | Cubierto. |
| Categoria/subcategoria | Pantalla separada. | Filtros de bodega. | Cubierto. |
| Proveedor | Pantalla separada. | Filtro proveedor. | Cubierto. |
| Historial precio | No visible como control moderno. | Historial de precios por producto. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Historial de precios.
- Importacion masiva CSV/XLSX con dry-run.
- Export de productos.
- Separacion consulta vs mantenimiento.
- Filtros consolidados.
- Integracion con categorias, proveedores, stock y web.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Nombre `Mantencion precios` | Usuarios pueden buscarlo como modulo separado. | Validar si basta con Bodega/Consulta Precios o si se agrega acceso directo. |
| Busquedas dedicadas | Legacy tenia pantallas individuales. | Mantener filtros consolidados salvo necesidad demostrada. |
| Columnas exactas | Puede haber columnas usadas para revision de precios. | Comparar con usuario antes de ajustar tabla. |

## Detalles legacy que ya no tienen sentido conservar

- Pantallas separadas por cada criterio de busqueda.
- Mantener precios desconectado de stock/producto.
- Importaciones sin validacion previa.

## Decision del modulo

Modulo **mejorado**. No reconstruir `Mantencion precios` como pantalla aislada; validar solo acceso/nombre y columnas diarias.

