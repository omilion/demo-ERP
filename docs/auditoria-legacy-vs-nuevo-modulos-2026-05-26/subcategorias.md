# Auditoria legacy vs nuevo - subcategorias

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\subcategorias`

Estado: **Equivalencia funcional implementada en SPR-37**

## Como funcionaba en legacy

- `index.php` incluia el listado del modulo.
- `lista.php` mostraba subcategorias ordenadas por nombre.
- Columnas: Nombre, De categoria, modificar, eliminar.
- `nuevo.php` creaba subcategoria con nombre y categoria.
- `modificar.php` editaba nombre y categoria padre.
- `acepta_eliminar.php` confirmaba eliminacion.
- `eliminar.php` borraba fisicamente y limpiaba referencias de productos legacy.

## Como queda hoy

- Mantenimiento maestro: `frontend/src/pages/config/ConfigPage.jsx`, tab `Cat. Bodega`.
- API: `backend/src/routes/categorias/index.js`.
- Uso operacional: `frontend/src/pages/bodega/BodegaPage.jsx` y `frontend/src/pages/bodega/BodegaFormPage.jsx`.

## Matriz de equivalencia

| Legacy | Plataforma nueva | Estado |
|---|---|---|
| Listado por nombre | API/UI muestran categorias y subcategorias activas ordenadas | Resuelto |
| Columna Nombre | UI permite ver/editar nombre | Resuelto |
| Columna De categoria | UI permite cambiar categoria padre | Resuelto |
| Crear subcategoria | UI/API permiten crear bajo categoria | Resuelto |
| Editar nombre/categoria | UI/API permiten ambos cambios | Resuelto |
| Eliminar con confirmacion | UI confirma; API hace soft-delete protegido | Reemplazo mejorado |
| Limpiar referencias al eliminar | API bloquea delete si hay productos activos; mover subcategoria sincroniza productos | Mejora |
| Filtro operativo por categoria | Bodega usa `categoriaId`; backend tambien incluye productos legacy por nombre | Resuelto |
| Export con categoria | Export usa la misma equivalencia ID + nombre legacy | Resuelto |
| Categoria textual libre en productos/importacion | Backend la deriva desde maestro activo o rechaza desconocidos | Resuelto |

## Extras nuevos

- Permisos de escritura restringidos a Config/admin.
- Validaciones de pertenencia categoria/subcategoria en productos y stock-ingresos.
- Importacion masiva de productos nuevos validada contra maestro activo.
- Errores 400/404/409 documentables.
- Tests automatizados de paridad y regresion.

## Pendientes o fuera de alcance

- FK fisica para `Producto.categoriaId` queda como mejora tecnica futura.
- UX de Config con Guardar/Cancelar por fila queda recomendado.

## Validacion

- `test/categorias.test.js`
- `test/productos.test.js`
- `test/reportes-export-helpers.test.js`
- `test/stock-ingresos-apply.test.js`
- `npm.cmd run test:full -- --reporter=dot`
- `npm.cmd run lint`
- `npm.cmd run build`
