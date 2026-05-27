# Auditoria legacy vs nuevo - consulta_precios

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\consulta_precios`

Estado actualizado: **Aprobado**

## Como funcionaba en legacy

- Modulo solo lectura para consultar precios y stock.
- Pantalla principal con botones de busqueda: Codigo barra, Codigo interno, ID Marco, Nombre producto, Proveedor y Categoria.
- Formularios POST a `pasar_a_get.php`; luego redireccion GET a `consulta_precios/index`.
- Filtros legacy:
  - Sin filtros: todos, ordenados por nombre.
  - Codigo barra exacto.
  - Codigo interno, nombre e ID Marco con busqueda parcial.
  - Proveedor por `codigo_proveedor`.
  - Categoria y subcategoria por ids.
- Tabla legacy:
  - Foto.
  - Cod Interno.
  - ID Marco.
  - Cod Barra.
  - Nombre.
  - Categoria.
  - Descuento categoria.
  - Descuento producto.
  - Precio Normal Sala venta + IVA.
  - Precio con descuento.
  - Precio Conv. Marco.
  - Precio Licitacion.
  - Stock.
- Paginacion legacy: 30 registros por pagina.
- No tenia exportacion propia ni mutaciones.

## Como queda hoy en la plataforma nueva

- Ruta frontend: `frontend/src/pages/consulta-precios/ConsultaPreciosPage.jsx`
- API base: `backend/src/routes/productos/list.js`
- Calculo legacy: `backend/src/routes/productos/pricing.js`
- Seguridad autocomplete: `backend/src/routes/productos/autocomplete.js`

La pantalla nueva ahora muestra la consulta con filtros equivalentes, tabla completa, calculos legacy y paginacion. Sigue siendo solo lectura.

## Equivalencia punto a punto

| Punto legacy | Estado nuevo |
|---|---|
| Buscar por Codigo barra | Disponible. Usa `codigoBarra` con match exacto. |
| Buscar por Codigo interno | Disponible. Usa `codigoInterno` con busqueda parcial. |
| Buscar por ID Marco | Disponible. Usa `idMarco` con busqueda parcial. |
| Buscar por Nombre producto | Disponible. Usa `nombre` con busqueda parcial. |
| Buscar por Proveedor | Disponible. Usa proveedor seleccionado por id, con fallback por codigo/texto en backend. |
| Buscar por Categoria/Subcategoria | Disponible. Usa `categoriaId` y `subcategoriaId`. |
| Tabla con Foto | Disponible. Usa foto del producto o placeholder. |
| Tabla con Cod Interno / ID Marco / Cod Barra / Nombre | Disponible. |
| Tabla con Categoria y Subcategoria | Disponible. |
| Descuento categoria y descuento producto | Disponible en `consultaPrecios`. |
| Precio Normal Sala venta + IVA | Disponible, calculado con margen proveedor venta sala + IVA 19%. |
| Precio con descuento | Disponible, calculado con descuento categoria + producto antes de IVA. |
| Precio Conv. Marco | Disponible desde `precioMarco`. |
| Precio Licitacion | Disponible, calculado con margen proveedor licitacion. |
| Stock | Disponible. |
| Paginacion | Disponible. API retorna `page/pages` y UI usa pager. |
| Export Excel/PDF | No aplica en legacy `consulta_precios`; no se agrega a esta pantalla. |
| Mutaciones | No aplica; se mantiene solo lectura. |

## Extras nuevos que mejoran legacy

- Busqueda general adicional por nombre, codigo, barra, ID Marco, proveedor, categoria y subcategoria.
- Filtros combinables cuando aplica.
- Control de permiso `catalogo:read` en listado y autocomplete.
- Validacion server-side de parametros numericos y bodega.
- Export de productos fuera de esta pantalla valida filtros antes de consultar Prisma.

## Riesgos residuales

- Los calculos de margen proveedor dependen de que el producto este vinculado a proveedor o que el texto migrado coincida con codigo/nombre/razon social. Si un producto legacy quedo sin dato de proveedor reconocible, se calcula con margen 0 en vez de fallar.
- El export formal PDF no se implementa aqui porque legacy `consulta_precios` no tenia exportacion propia.

## Validacion

- Backend foco: 2 archivos, 21 tests OK.
- Backend CI: 12 archivos, 95 tests OK.
- Backend full: 39 archivos, 337 tests OK.
- Frontend lint: OK.
- Frontend build: OK con warning conocido de chunk Vite mayor a 500 kB.

Decision: **aprobado**.
