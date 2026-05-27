# Auditoria legacy vs nuevo - subcategorias_bodega_taller

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\subcategorias_bodega_taller`

Estado: **Equivalencia funcional implementada en SPR-36**

## Como funcionaba en legacy

- `index.php` incluia `lista.php` dentro de panel `SUB CATEGORIAS BODEGA TALLER`.
- `lista.php` listaba todas las subcategorias ordenadas por `nombre`.
- Columnas visibles:
  - Nombre.
  - De categoria.
  - Modificar.
  - Eliminar.
- `nuevo.php` permitia crear:
  - Nombre Sub Categoria.
  - De Categoria.
- `modificar.php` permitia editar:
  - Nombre.
  - De Categoria.
- `acepta_eliminar.php` mostraba confirmacion.
- `eliminar.php` hacia delete fisico.
- `bodega_taller/select_dependientes_proceso.php` cargaba subcategorias dependientes de la categoria elegida.

## Como queda hoy en la plataforma nueva

- Mantenimiento maestro: `frontend/src/pages/config/ConfigPage.jsx`, tab `Cat. Bodega Taller`.
- API: `backend/src/routes/categorias-bodega-taller/index.js`.
- Uso operacional: `frontend/src/pages/bodega-taller/BodegaTallerPage.jsx`.

## Matriz de equivalencia

| Legacy | Plataforma nueva | Estado |
|---|---|---|
| Listado ordenado por nombre | API devuelve categorias/subcategorias activas ordenadas por nombre | Resuelto |
| Columna Nombre | UI permite ver/editar nombre de subcategoria | Resuelto |
| Columna De categoria | UI muestra selector de categoria en cada subcategoria | Resuelto |
| Crear Nombre Sub Categoria | UI permite crear subcategoria bajo categoria | Resuelto |
| Crear De Categoria | Creacion se hace desde categoria seleccionada y el backend valida categoria activa | Resuelto |
| Editar nombre | UI/API permiten actualizar `nombre` | Resuelto |
| Editar categoria padre | UI/API permiten mover `categoriaId` validado | Resuelto |
| Mover categoria padre con materiales existentes | API actualiza los materiales referenciados en la misma transaccion | Mejora |
| Eliminar con confirmacion | UI usa confirmacion y API hace soft-delete protegido | Reemplazo mejorado |
| Subcategorias dependientes en Bodega Taller | Modal y filtros usan selects dependientes categoria/subcategoria | Resuelto |
| Integridad categoria/subcategoria | Backend valida existencia, activo y pertenencia en materiales y stock-ingresos | Mejora |
| Exportaciones | Legacy no tenia exportacion | No aplica |

## Extras que mejora la plataforma nueva

- Permisos: lectura con `taller:read`, mantenimiento maestro solo admin/config.
- Soft-delete en vez de delete fisico.
- Bloqueo de eliminacion si hay materiales activos usando la clasificacion.
- Respuestas 400/404/409 para errores de datos en vez de fallos genericos.
- Tests automatizados para permisos, duplicados, mover categoria con materiales existentes y consistencia operacional.

## Pendientes o fuera de alcance

- FK fisica entre `BodegaTaller` y categoria/subcategoria queda como mejora tecnica posterior por impacto sobre datos migrados.
- UX de Config con draft + Guardar/Cancelar queda recomendado, pero no bloquea la paridad funcional legacy.

## Validacion

- `test/categorias-bodega-taller.test.js`
- `test/stock-ingresos-apply.test.js`
- `npm.cmd run test:full -- --reporter=dot`
- `npm.cmd run lint`
- `npm.cmd run build`
