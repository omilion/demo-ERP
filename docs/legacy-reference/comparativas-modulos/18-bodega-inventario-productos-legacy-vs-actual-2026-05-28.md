# 18 - Bodega inventario productos: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, modulo critico para comparar columna/filtro por filtro**.

## Fuentes revisadas

- Capturas legacy: [53-mantencion-productos.png](../screenshots/53-mantencion-productos.png) a [65-sin-proveedor.png](../screenshots/65-sin-proveedor.png)
- Capturas actuales: [11-bodega-inventario-productos.png](../current-screenshots/11-bodega-inventario-productos.png), [12-bodega-nuevo-producto.png](../current-screenshots/12-bodega-nuevo-producto.png), [14-bodega-ingreso-mercaderia.png](../current-screenshots/14-bodega-ingreso-mercaderia.png), [35-admin-saneamiento-legacy.png](../current-screenshots/35-admin-saneamiento-legacy.png)
- Frontend actual: `frontend/src/pages/bodega/*`, `frontend/src/pages/stock-ingresos/StockIngresosPage.jsx`
- Backend actual: `backend/src/routes/productos/*`, `backend/src/routes/stock-ingresos/*`

## Resumen ejecutivo

Legacy tenia muchas pantallas de bodega: mantencion productos, busquedas por codigos, nombre, categoria, proveedor, stock critico, codigos repetidos y productos sin datos. El ERP actual consolida la mayor parte en `/bodega` y mueve controles de calidad mas avanzados a saneamiento/integridad.

Es un modulo mejorado, pero sensible. Antes de cambiarlo debe compararse con usuarios columna por columna y filtro por filtro.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Mantencion productos | Pantalla principal. | `/bodega`. | Cubierto/mejorado. |
| Nuevo producto | Flujo legacy. | `/bodega/nuevo`. | Cubierto. |
| Codigo barra/interno/nombre | Pantallas separadas. | Buscador general. | Consolidado. |
| Categoria/subcategoria | Pantalla separada. | Filtros y selects dependientes. | Cubierto. |
| Proveedor | Pantalla separada. | Filtro proveedor. | Cubierto. |
| Stock critico/0 | Pantalla legacy. | KPI/filtro en bodega/dashboard. | Cubierto. |
| Codigos repetidos | Pantalla legacy. | Parcial: saneamiento/admin o reporte de calidad. | Validar. |
| Sin codigo/categoria/proveedor | Pantallas legacy. | Dashboard/saneamiento/filtros de calidad. | Reubicado/mejorado. |
| Ingreso stock | Relacionado a bodega. | `/stock-ingresos` con documentos. | Mejorado. |

## Mejoras nuevas que no se deben perder

- KPIs de stock y calidad.
- Import CSV/XLSX con dry-run.
- Movimientos de stock.
- Historial de precios.
- Fotos/producto y datos web.
- Categorias normalizadas.
- Saneamiento legacy para datos problematicos.
- Integracion con ingreso de mercaderia.
- Export productos.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Codigos repetidos visible | Legacy tenia vistas directas para repetidos. | Confirmar si el usuario necesita boton/filtro en bodega o basta saneamiento. |
| Columnas exactas | Bodega es modulo diario. | Comparar columna por columna. |
| Filtros de calidad | Sin codigo/sin categoria/sin proveedor pueden estar reubicados. | Validar que sean accesibles para bodega. |
| Nombre `Mantencion productos` | Puede ser lenguaje operativo. | Evaluar alias en menu o dashboard. |

## Detalles legacy que ya no tienen sentido conservar

- Una pantalla por cada filtro.
- Datos duplicados sin saneamiento.
- Importaciones sin validacion previa.
- Stock desconectado de documentos.

## Decision del modulo

Modulo **mejorado**, pero requiere validacion fina. No hacer cambios nuevos sin checklist de columnas/filtros.

