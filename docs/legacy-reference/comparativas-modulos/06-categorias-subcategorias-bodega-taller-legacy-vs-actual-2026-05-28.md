# 06 - Categorias y subcategorias bodega taller: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Cubierto, reubicado en Configuracion**.

## Fuentes revisadas

- Capturas legacy: [06-editar-categorias-bodega-taller.png](../screenshots/06-editar-categorias-bodega-taller.png), [07-editar-sub-categorias-bodega-taller.png](../screenshots/07-editar-sub-categorias-bodega-taller.png)
- Captura actual: [44-configuracion-categorias-bodega-taller.png](../current-screenshots/44-configuracion-categorias-bodega-taller.png)
- Frontend actual: `frontend/src/pages/config/ConfigPage.jsx`, `frontend/src/api/categoriasBodegaTaller.js`, `frontend/src/pages/bodega-taller/BodegaTallerPage.jsx`
- Backend actual: `backend/src/routes/categorias-bodega-taller/index.js`, `backend/src/routes/bodega-taller/index.js`

## Resumen ejecutivo

Legacy separaba categorias y subcategorias de bodega taller en pantallas propias. El ERP actual las centraliza en `/config`, pestana **Cat. Bodega Taller**, con backend `/api/categorias-bodega-taller` y uso directo en el inventario de materiales de taller.

La separacion entre catalogo de venta y catalogo de taller es una mejora importante del ERP nuevo. No conviene mezclar estas categorias con las de bodega comercial.

## Vista antigua

| Pantalla legacy | Ruta | Observacion |
|---|---|---|
| Categorias Bodega Taller | `menu.php?pag=categorias_bodega_taller/index` | Boton `Crear nuevo`; tabla no visible por warnings. |
| Sub Categorias Bodega Taller | `menu.php?pag=subcategorias_bodega_taller/index` | Boton `Crear nuevo`; tabla no visible por warnings. |

## Vista actual

La captura actual muestra **Configuracion > Cat. Bodega Taller**, con formulario `Nueva categoria` y boton `Agregar`. El codigo incluye endpoints de subcategorias, actualizacion, baja logica y bloqueo si hay materiales de taller asociados.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Categorias taller | Pantalla separada. | Pestana Cat. Bodega Taller. | Cubierto. |
| Subcategorias taller | Pantalla separada. | Subcategorias asociadas a categoria en API/UI. | Cubierto; validar visibilidad con datos reales. |
| Uso operativo | Bodega taller legacy. | `/bodega-taller`, ODT/materiales y filtros de taller. | Mejorado. |
| Integridad | No visible. | Bloquea eliminacion si categoria/subcategoria esta en uso por materiales. | Mejorado. |
| Permisos | No visible. | Lectura por `taller`, escritura por `config`. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Catalogo de taller separado del inventario de venta.
- Subcategorias activas ordenadas por categoria.
- Validacion de duplicados.
- Baja logica y bloqueo de eliminacion en uso.
- Actualizacion de materiales si una subcategoria cambia de categoria.
- Uso directo en filtros y altas de bodega taller.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Capturas legacy no muestran columnas | No permite comparacion campo por campo. | Revisar dump/codigo si el cliente exige exactitud de columnas. |
| UI actual sin datos en captura | No se observa como queda la lista con subcategorias reales. | Validar con datos migrados. |
| Nombre visible | Usuarios pueden esperar menu separado `Categorias bodega taller`. | Mantener en Configuracion salvo necesidad operativa de acceso directo. |

## Detalles legacy que ya no tienen sentido conservar

- Warnings PHP visibles.
- Duplicar pantallas separadas si la relacion se puede administrar en una sola pestana.
- Mezclar categorias de venta con categorias de materiales de taller.

## Decision del modulo

Modulo **cubierto**. Mantener la separacion actual de catalogos y validar solo la visibilidad de subcategorias con datos reales.

