# SPR-37-subcategorias - subcategorias

Prioridad: **P2 - completar equivalencia**
Dominio: **Bodega / Inventario**
Estado: **Cerrado y aprobado multiagente**

## Objetivo

Revisar y reparar `subcategorias` comparando cada funcion legacy contra la plataforma nueva, con foco en nombre, categoria padre, editar, eliminar, permisos e integridad de productos.

## Evidencia legacy revisada

- `subcategorias/index.php`
- `subcategorias/lista.php`
- `subcategorias/nuevo.php`
- `subcategorias/guardar.php`
- `subcategorias/modificar.php`
- `subcategorias/actualizar.php`
- `subcategorias/acepta_eliminar.php`
- `subcategorias/eliminar.php`

## Legacy detectado

- Tabla ordenada por `nombre`.
- Columnas: `Nombre`, `De categoria`, modificar, eliminar.
- Crear: `Nombre Sub Categoria` requerido y selector `De Categoria` requerido.
- Editar: cambia `Nombre` y `De Categoria`.
- Eliminar: confirmacion y borrado fisico; legacy limpiaba referencias de productos.

## Implementacion realizada

- `backend/src/routes/categorias/index.js`
  - CRUD completo de categorias y subcategorias.
  - Lectura con `catalogo:read`.
  - Escritura maestro con `config:write` sin permisos extra, coherente con Config admin-only.
  - Validacion de IDs, nombres, duplicados activos y errores 400/404/409.
  - Soft-delete protegido: bloquea eliminacion si hay productos activos usando categoria/subcategoria.
  - Mover subcategoria actualiza productos referenciados en la misma transaccion.

- `frontend/src/api/categorias.js`
  - Hooks de crear/editar/eliminar categorias y subcategorias.

- `frontend/src/pages/config/ConfigPage.jsx`
  - Nuevo tab `Cat. Bodega` para mantener categorias/subcategorias del catalogo principal.
  - Permite editar nombre, descuento, visibilidad, categoria padre de subcategoria, crear y eliminar con confirmacion.

- `backend/src/routes/productos/create.js` y `backend/src/routes/productos/update.js`
  - Validan categoria/subcategoria activa y pertenencia antes de guardar producto.
  - El campo legacy `categoria` ya no se acepta como texto libre; se deriva desde `categoriaId` activo o se rechaza.

- `backend/src/routes/productos/list.js` y `backend/src/routes/reportes/index.js`
  - Filtro por `categoriaId` incluye productos actuales por ID y productos legacy por nombre de categoria.

- `frontend/src/pages/bodega/BodegaPage.jsx`
  - Filtro de categoria usa `categoriaId`, no nombre.

- `frontend/src/pages/bodega/BodegaFormPage.jsx`
  - En edicion, limpiar categoria envia `categoriaId: null`, `subcategoriaId: null` y limpia texto legacy.

- `backend/src/routes/stock-ingresos/apply.js`
  - Valida categoria/subcategoria de productos antes de crear faltantes desde ingresos de stock.

- `backend/src/routes/productos/importar.js`
  - Importacion de productos nuevos resuelve categoria textual contra el maestro activo y rechaza categorias desconocidas/inactivas.

- `backend/test/categorias.test.js`
  - Cobertura de crear/listar/mover/proteger subcategorias usadas, permisos y validacion de productos.

## Reemplazos y alcance

- Delete fisico legacy se reemplaza por soft-delete protegido para no dejar productos activos con taxonomia oculta.
- No habia exportaciones propias del modulo legacy.
- FK fisica `Producto.categoriaId -> Categoria` queda como mejora tecnica futura; la integridad queda cubierta en rutas de escritura y pruebas.

## Pruebas ejecutadas

- Backend focalizado: `npm.cmd exec vitest run test/categorias.test.js test/productos.test.js test/reportes-export-helpers.test.js test/stock-ingresos-apply.test.js --reporter=dot` -> 4 archivos, 40/40 OK.
- Backend completo: `npm.cmd run test:full -- --reporter=dot` -> 48 archivos, 426/426 OK.
- Frontend lint: `npm.cmd run lint` -> OK.
- Frontend build: `npm.cmd run build` -> OK, con warning conocido de chunk grande.

## Riesgos residuales

- Validacion multiagente completada: Sagan y Peirce aprobaron el sprint tras cerrar el bypass de categoria textual y la regresion de formulario.
- No se completo QA visual con navegador integrado por limitacion previa del entorno local.
- La UI de Config guarda en `onChange`; no bloquea paridad funcional, pero se recomienda evolucionar a draft + Guardar/Cancelar.
- Stock-ingresos todavia normaliza IDs no numericos a null en el parser base. Endurecer el parser para distinguir invalido vs ausente queda como mejora transversal.

## Checklist final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios trazables.
- [x] Agregar pruebas de integracion.
- [x] Ejecutar pruebas focalizadas, full backend, lint y build.
- [x] Registrar evidencia y decisiones tecnicas.
- [x] Aprobacion final multiagente.
- [x] Decision final del lead.
