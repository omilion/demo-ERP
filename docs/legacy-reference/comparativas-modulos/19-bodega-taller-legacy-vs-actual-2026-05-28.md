# 19 - Bodega taller: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con filtros de calidad legacy por validar**.

## Fuentes revisadas

- Capturas legacy: [66-mantencion-productos.png](../screenshots/66-mantencion-productos.png) a [78-sin-proveedor.png](../screenshots/78-sin-proveedor.png)
- Capturas actuales: [21-taller-bodega-taller.png](../current-screenshots/21-taller-bodega-taller.png), [44-configuracion-categorias-bodega-taller.png](../current-screenshots/44-configuracion-categorias-bodega-taller.png), [35-admin-saneamiento-legacy.png](../current-screenshots/35-admin-saneamiento-legacy.png)
- Frontend actual: `frontend/src/pages/bodega-taller/BodegaTallerPage.jsx`, `frontend/src/api/bodegaTaller.js`
- Backend actual: `backend/src/routes/bodega-taller/*`, `backend/src/routes/categorias-bodega-taller/index.js`

## Resumen ejecutivo

Legacy replicaba para bodega taller muchas pantallas similares a bodega comercial: mantencion, busquedas por codigos/nombre/categoria/proveedor, stock critico, repetidos y faltantes. El ERP actual separa correctamente materiales de taller en `/bodega-taller`, con categorias propias, filtros, exportacion y modal de alta/edicion.

La mejora clave es separar materiales de taller del inventario de venta. La brecha principal es validar si los filtros legacy de calidad quedaron suficientemente visibles.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Mantencion materiales | Pantalla legacy. | `/bodega-taller`. | Cubierto/mejorado. |
| Codigos/nombre | Pantallas separadas. | Busqueda/filtros. | Cubierto. |
| Categoria/subcategoria | Pantalla separada. | Categorias de taller y filtros. | Cubierto. |
| Proveedor | Pantalla separada. | Filtro proveedor. | Cubierto. |
| Stock critico/0 | Pantalla legacy. | KPI/filtro. | Cubierto. |
| Repetidos/sin datos | Pantallas legacy. | Parcial: validar en UI/saneamiento. | Validar. |
| Exportacion | Legacy exportaba. | Export actual. | Cubierto. |

## Mejoras nuevas que no se deben perder

- Materiales de taller separados.
- Categorias/subcategorias taller.
- Validacion de codigos.
- Export.
- Alta/edicion en modal.
- Consumo desde ODT/materiales.
- Integracion con historial de materiales.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Codigos repetidos | Legacy tenia vistas directas. | Confirmar si debe existir filtro visible. |
| Sin codigo/sin categoria/sin proveedor | Puede ser tarea diaria de limpieza. | Validar si saneamiento/admin basta. |
| Stock critico taller | Debe ser rapido para produccion. | Probar con usuario de taller/bodega. |

## Detalles legacy que ya no tienen sentido conservar

- Copiar todas las pantallas de bodega comercial para taller.
- Mezclar materiales de produccion con productos de venta.
- Borrado sin proteger consumos historicos.

## Decision del modulo

Modulo **mejorado**. Prioridad: validar filtros de calidad legacy en UI actual.

