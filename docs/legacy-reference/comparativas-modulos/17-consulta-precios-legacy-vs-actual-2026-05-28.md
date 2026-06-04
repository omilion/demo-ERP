# 17 - Consulta precios: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Cubierto, vista separada de consulta rapida**.

## Fuentes revisadas

- Captura legacy: [113-consulta-precios.png](../screenshots/113-consulta-precios.png)
- Captura actual: [13-bodega-consulta-precios.png](../current-screenshots/13-bodega-consulta-precios.png)
- Frontend actual: `frontend/src/pages/consulta-precios/ConsultaPreciosPage.jsx`, `frontend/src/api/productos.js`
- Backend actual: `backend/src/routes/productos/pricing.js`, `backend/src/routes/productos/list.js`

## Resumen ejecutivo

Consulta precios existe en el ERP actual como ruta propia `/consulta-precios`, separada del mantenimiento de bodega. Esta decision es correcta: permite revisar precios y stock sin exponer edicion de inventario.

La vista actual agrega precios calculados por tipo, stock visible y filtros por categoria/proveedor.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Consulta rapida | Pantalla legacy. | `/consulta-precios`. | Cubierto. |
| Busqueda producto/codigo | Consulta simple. | Buscador y filtros. | Mejorado. |
| Stock visible | No confirmado en captura legacy. | Visible en consulta. | Mejorado. |
| Precios por tipo | No confirmado. | Precios calculados por tipo. | Mejorado. |
| Edicion | No deberia editar. | Separada de mantenimiento. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Consulta separada de edicion.
- Filtros por categoria/proveedor.
- Stock visible.
- Precios calculados.
- Permiso de lectura catalogo.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Velocidad de meson | Esta vista puede ser usada frente a cliente. | Probar con usuario de sala/bodega. |
| Lectura por scanner | Si se usa lector de codigo barra, la UI debe responder rapido. | Validar foco del buscador y tiempos. |
| Campos exactos | Pueden pedir precio marco/sala/lista especifico. | Confirmar columnas visibles. |

## Detalles legacy que ya no tienen sentido conservar

- Mezclar consulta rapida con mantencion editable.
- Pantallas lentas o separadas por criterio si un buscador central resuelve.

## Decision del modulo

Modulo **cubierto**. Validar ergonomia real de meson antes de cambios.

