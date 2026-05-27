# SPR-13-consulta-precios - consulta_precios

Prioridad: **P1 - critico funcional**
Dominio: **Bodega / Inventario**
Subagente especialista asignado: **Subagente Bodega-Inventario**
Estado: **Aprobado**

## Objetivo

Revisar y reparar el modulo `consulta_precios` comparando cada funcion legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoria base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/consulta-precios.md`
- Evidencia legacy principal:
  - `consulta_precios\buscar_categoria.php`
  - `consulta_precios\buscar_codigo_interno.php`
  - `consulta_precios\buscar_codigobarra.php`
  - `consulta_precios\buscar_id_marco.php`
  - `consulta_precios\buscar_nombre.php`
  - `consulta_precios\buscar_proveedor.php`
  - `consulta_precios\index.php`
  - `consulta_precios\lista.php`
  - `consulta_precios\pasar_a_get.php`

## Comportamiento legacy confirmado

- Modulo solo lectura; no se detectaron `INSERT`, `UPDATE`, `DELETE`, export Excel/PDF ni efectos secundarios sobre stock.
- Accesos visibles: Codigo barra, Codigo interno, ID Marco, Nombre producto, Proveedor y Categoria.
- `pasar_a_get.php` redirige los formularios a `consulta_precios/index` con parametros `codigo_barra`, `codigo_interno`, `nombre`, `categoria`, `subcategoria`, `proveedor`, `id_marco`.
- Filtros:
  - Sin filtro: todos los productos, ordenados por nombre.
  - Codigo barra: match exacto.
  - Codigo interno, nombre e ID Marco: `LIKE`.
  - Proveedor: por `codigo_proveedor`.
  - Categoria/subcategoria: por id.
- Paginacion legacy: 30 registros por pagina.
- Columnas legacy: Foto, Cod Interno, ID Marco, Cod Barra, Nombre, Categoria, descuento por categoria, descuento unitario producto, Precio Normal Sala venta + IVA, Precio con descuento, Precio Conv. Marco, Precio Licitacion y Stock.
- Calculos legacy:
  - Precio Normal Sala venta + IVA = `precio1 + margen proveedor venta sala`, luego IVA 19%.
  - Precio con descuento = precio sala neto menos descuento categoria + producto, luego IVA 19%.
  - Precio Conv. Marco = `precio_marco` directo.
  - Precio Licitacion = `precio1 + margen proveedor licitacion`, sin IVA agregado.

## Brechas detectadas y resolucion

| Prioridad | Brecha | Resolucion |
|---|---|---|
| P0 | La UI nueva no mostraba los precios calculados legacy ni descuentos. | Corregido. La respuesta de `/api/productos` ahora incluye `consultaPrecios` con categoria, subcategoria, proveedor, descuentos, precio sala + IVA, precio con descuento, precio convenio marco y precio licitacion. La pantalla muestra esas columnas. |
| P1 | Faltaban filtros visibles legacy: ID Marco, proveedor, categoria/subcategoria y busquedas separadas. | Corregido. La pantalla tiene modos de busqueda por Codigo barra, Codigo interno, ID Marco, Nombre producto, Proveedor y Categoria/Subcategoria. |
| P1 | El backend no aceptaba todos los filtros legacy dedicados. | Corregido. `/api/productos` acepta `codigoBarra`, `codigoInterno`, `nombre`, `idMarco`, `proveedorId`, `proveedorCodigo`, `categoriaId`, `subcategoriaId`, `search`, `bodega`, `sort` y `page`. |
| P1 | La consulta nueva ordenaba por stock/estado y no por nombre como legacy. | Corregido para Consulta Precios. La pantalla envia `sort=nombre`; Bodega mantiene su orden operativo actual. |
| P1 | El legacy tenia paginacion y la nueva vista quedaba limitada a 500. | Corregido. `/api/productos` retorna `page/pages`; Consulta Precios usa pager. |
| P1 | `/api/productos/autocomplete` exponia stock/precio a cualquier usuario autenticado. | Corregido. Ahora exige `catalogo:read`. |
| P2 | Export productos podia aceptar filtros invalidos hasta Prisma. | Corregido. Export valida `bodega`, `categoriaId`, `subcategoriaId` y `proveedorId` antes de consultar. |

## Diferencias deliberadas

- Legacy no tenia exportacion propia en `consulta_precios`; no se agrego export nuevo en esta pantalla. La exportacion CSV de productos sigue viviendo en Bodega/reportes.
- Legacy resolvia proveedor por codigo y categoria por ids. La plataforma nueva soporta ids reales y tambien fallback textual para datos migrados.
- Legacy usaba imagen `img/no_foto_chica.jpg`; la nueva UI usa placeholder visual cuando no hay foto, sin bloquear la consulta.
- Legacy dejaba que el ultimo filtro no vacio reemplazara a los anteriores. La nueva vista permite filtros combinados cuando aplica, lo que mejora la busqueda sin romper paridad.

## Archivos modificados

- `backend/src/routes/productos/pricing.js`
- `backend/src/routes/productos/list.js`
- `backend/src/routes/productos/autocomplete.js`
- `backend/src/routes/reportes/index.js`
- `backend/test/productos.test.js`
- `frontend/src/pages/consulta-precios/ConsultaPreciosPage.jsx`

## Pruebas ejecutadas

- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- productos.test.js reportes-export-helpers.test.js --reporter=dot` -> 2 archivos, 21 tests OK.
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd run test:ci -- --reporter=dot` -> 12 archivos, 95 tests OK.
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- --reporter=dot` -> 39 archivos, 337 tests OK. Solo queda warning conocido de `pg` sobre `client.query`.
- `npm.cmd run lint` en frontend -> OK.
- `npm.cmd run build` en frontend -> OK, con warning conocido de chunk Vite mayor a 500 kB.

## Validacion del lead

SPR-13 queda **aprobado**. Los puntos funcionales legacy de consulta de precios quedan cubiertos: busquedas, columnas, calculos, imagen, stock, paginacion y permisos de lectura. No queda pendiente bloqueante para continuar al siguiente sprint.

## Decision final

**Aprobado para continuar.**
