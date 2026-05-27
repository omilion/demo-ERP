# SPR-36-subcategorias-bodega-taller - subcategorias_bodega_taller

Prioridad: **P2 - completar equivalencia**
Dominio: **Bodega / Inventario / Taller**
Estado: **Cerrado y aprobado multiagente**

## Objetivo

Revisar y reparar `subcategorias_bodega_taller` comparando cada funcion legacy contra la plataforma nueva, sin omitir campos, relacion con categoria, acciones, permisos ni efectos sobre materiales de bodega taller.

## Evidencia legacy revisada

- `subcategorias_bodega_taller/index.php`
- `subcategorias_bodega_taller/lista.php`
- `subcategorias_bodega_taller/nuevo.php`
- `subcategorias_bodega_taller/guardar.php`
- `subcategorias_bodega_taller/modificar.php`
- `subcategorias_bodega_taller/actualizar.php`
- `subcategorias_bodega_taller/acepta_eliminar.php`
- `subcategorias_bodega_taller/eliminar.php`
- `bodega_taller/select_dependientes_proceso.php`

## Legacy detectado

- Vista principal: tabla ordenada por `nombre`.
- Columnas: `Nombre`, `De categoria`, modificar, eliminar.
- Crear: `Nombre Sub Categoria` requerido y selector `De Categoria` requerido.
- Editar: permite cambiar `Nombre` y `De Categoria`.
- Eliminar: pantalla de confirmacion y borrado fisico.
- Uso operacional: la subcategoria depende de la categoria por `relacion`; el selector de bodega taller filtra subcategorias por categoria.

## Implementacion realizada

- `backend/src/routes/categorias-bodega-taller/index.js`
  - GET protegido con `taller:read` para consumo operacional.
  - CRUD maestro protegido con `config:write` sin permisos extra; coincide con la UI admin-only de Config.
  - Validacion de IDs positivos, nombres requeridos y trim.
  - Bloqueo de duplicados normalizados por categoria/subcategoria activa.
  - Edicion de subcategoria permite cambiar `nombre` y `categoriaId`, como legacy.
  - Si una subcategoria usada se mueve a otra categoria, actualiza en la misma transaccion los materiales que la referencian para mantener consistencia.
  - Eliminacion es soft-delete, pero bloquea `409` si hay materiales activos usando la categoria/subcategoria.
  - Se elimino mass assignment: no se acepta `request.body` completo ni reactivacion por PUT.

- `frontend/src/pages/config/ConfigPage.jsx`
  - En Config / Cat. Bodega Taller, cada subcategoria ahora muestra nombre y selector de categoria.
  - Desde la UI se puede cambiar la categoria padre de una subcategoria, cubriendo el flujo legacy `modificar.php`.

- `backend/src/routes/bodega-taller/index.js`
  - Crear/editar material valida que categoria y subcategoria existan, esten activas y correspondan entre si.
  - PUT parsea numeros igual que POST (`stock`, `stockCritico`, `precio`) y ya no guarda strings numericos.

- `frontend/src/pages/bodega-taller/BodegaTallerPage.jsx`
  - Modal de nuevo/editar material incorpora select de categoria y subcategoria dependiente.
  - El usuario puede clasificar materiales de taller al crearlos o editarlos, no solo filtrar por clasificacion.

- `backend/src/routes/stock-ingresos/apply.js`
  - Al crear materiales faltantes desde ingresos de stock, valida categoria/subcategoria antes de insertar.

- `backend/test/categorias-bodega-taller.test.js`
  - Cobertura de crear, listar, mover, soft-delete, permisos, duplicados y consistencia categoria/subcategoria en materiales.

- `backend/test/stock-ingresos-apply.test.js`
  - Cobertura para impedir creacion de material con categoria/subcategoria incompatibles.

## Reemplazos y alcance

- El borrado fisico legacy se reemplaza por soft-delete con bloqueo si la clasificacion esta en uso. Es una mejora de seguridad de datos.
- No se agrega exportacion Excel/PDF porque el modulo legacy no tenia exportaciones.
- No se agrega migracion de FK en este sprint; la integridad queda garantizada en las rutas de escritura cubiertas. Agregar FK fisica puede quedar como mejora tecnica futura si se revisa impacto de datos migrados.

## Pruebas ejecutadas

- Backend focalizado: `npm.cmd exec vitest run test/categorias-bodega-taller.test.js test/stock-ingresos-apply.test.js --reporter=dot` -> 2 archivos, 13/13 OK.
- Backend completo: `npm.cmd run test:full -- --reporter=dot` -> 47 archivos, 423/423 OK.
- Frontend lint: `npm.cmd run lint` -> OK.
- Frontend build: `npm.cmd run build` -> OK, con warning conocido de chunk grande.

## Riesgos residuales

- Validacion multiagente completada: Sagan y Peirce aprobaron el sprint tras corregir sincronizacion transaccional al mover subcategorias usadas.
- No se completo QA visual con navegador integrado por limitacion previa del entorno local.
- La UI de Config sigue guardando nombres en `onChange`; no bloquea la paridad legacy, pero se recomienda pasar a draft + Guardar/Cancelar como mejora UX posterior.
- No hay FK fisica entre `BodegaTaller` y las tablas de categoria/subcategoria; la validacion queda aplicada en rutas de escritura.

## Checklist final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios minimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integracion.
- [x] Probar flujo feliz, errores, permisos y estados borde por tests.
- [x] Registrar evidencia, archivos modificados y comandos de prueba.
- [x] Aprobacion final multiagente.
- [x] Decision final del lead.
