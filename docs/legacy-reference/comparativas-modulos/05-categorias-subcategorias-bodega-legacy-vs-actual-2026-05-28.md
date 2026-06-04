# 05 - Categorias y subcategorias bodega: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Cubierto, reubicado en Configuracion**.

## Fuentes revisadas

- Capturas legacy: [04-editar-categorias.png](../screenshots/04-editar-categorias.png), [05-editar-sub-categorias.png](../screenshots/05-editar-sub-categorias.png)
- Captura actual: [43-configuracion-categorias-bodega.png](../current-screenshots/43-configuracion-categorias-bodega.png)
- Frontend actual: `frontend/src/pages/config/ConfigPage.jsx`, `frontend/src/api/categorias.js`
- Backend actual: `backend/src/routes/categorias/index.js`
- Uso operativo: `frontend/src/pages/bodega/BodegaPage.jsx`, `frontend/src/pages/bodega/BodegaFormPage.jsx`, `frontend/src/pages/consulta-precios/ConsultaPreciosPage.jsx`

## Resumen ejecutivo

En legacy las categorias y subcategorias de bodega estaban separadas en dos pantallas: `Editar Categorias` y `Editar Sub-Categorias`. En la plataforma actual se consolidan en `/config`, pestana **Cat. Bodega**, con backend `/api/categorias` y relacion directa con productos, filtros de bodega y consulta de precios.

La cobertura funcional esta resuelta. No conviene volver a dos pantallas aisladas salvo que el cliente pida accesos directos por costumbre. La diferencia importante es que el sistema nuevo protege integridad: no permite eliminar categorias/subcategorias en uso y mantiene baja logica.

## Vista antigua

| Pantalla legacy | Ruta | Observacion |
|---|---|---|
| Categorias catalogo | `menu.php?pag=categorias/index` | Titulo `CATEGORIAS CATALOGO`, boton `Crear nuevo`. |
| Sub Categorias | `menu.php?pag=subcategorias/index` | Titulo `Sub Categorias`, boton `Crear nuevo`. |

Limitacion: ambas capturas muestran warnings PHP de inclusion/conexion, por lo que la tabla legacy no queda visible para comparar columnas exactas.

## Vista actual

La vista actual **Configuracion > Cat. Bodega** muestra alta de categoria con nombre, `% descuento`, selector `Mostrar web`, tabla con nombre, descuento, web y accion. En codigo tambien existen operaciones para subcategorias bajo cada categoria mediante `/categorias/:id/subcategorias`.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Pantallas | Categorias y Sub Categorias separadas. | Una pestana centralizada en Configuracion. | Reubicado. |
| Crear categoria | Boton `Crear nuevo`. | Formulario `Nueva categoria` + `Agregar`. | Cubierto. |
| Crear subcategoria | Pantalla separada. | Endpoint y API de subcategorias asociadas a categoria. | Cubierto; validar visibilidad en UI con datos reales. |
| Descuento categoria | No se confirma por captura. | Campo `% descuento`, validado 0-100. | Mejorado. |
| Mostrar web | No se confirma por captura. | Selector `Mostrar web`, usado para catalogo/web. | Mejorado. |
| Integridad | No visible. | Bloquea borrado si hay productos activos asociados. | Mejorado. |
| Uso operativo | Catalogo legacy. | Filtros y formularios de Bodega/Consulta precios. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Categorias con subcategorias relacionadas.
- Validacion de duplicados por nombre.
- Baja logica en vez de borrado riesgoso.
- Bloqueo al eliminar categorias/subcategorias en uso por productos.
- Propagacion al producto cuando una subcategoria cambia de categoria.
- Campos comerciales `% descuento` y `mostrar web`.
- Permisos separados: lectura catalogo y escritura de configuracion.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Captura legacy no muestra tabla | No permite comparar columnas exactas antiguas. | Revisar dump/codigo legacy solo si el cliente pide equivalencia campo por campo. |
| Subcategorias no visibles en captura actual sin datos | Puede parecer que solo hay categorias. | Validar con datos reales que la UI muestre gestion de subcategorias de forma clara. |
| Acceso separado legacy | Usuarios antiguos pueden buscar `Editar Sub-Categorias`. | Mantener en Configuracion salvo solicitud concreta de acceso directo. |

## Detalles legacy que ya no tienen sentido conservar

- Warnings PHP visibles.
- Dos pantallas separadas si la relacion categoria/subcategoria se resuelve mejor en una administracion central.
- Borrado sin control de uso historico.

## Decision del modulo

Modulo **cubierto**. Mantenerlo en **Configuracion > Cat. Bodega** y validar solo la exposicion de subcategorias con datos reales antes de hacer cambios visuales.

