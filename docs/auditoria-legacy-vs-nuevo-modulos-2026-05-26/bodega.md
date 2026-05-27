# Auditoría legacy vs nuevo - bodega

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\bodega`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tabla legacy: Foto, Cód Interno, ID Marco, Cód Barra, Mostrar Web, Nombre, Categoría, Subcategoria, descuento, Precio Costo, Precio Marco, Stock Crítico, Stock, Estado Inventario y Proveedor.
- Legacy tenía Exportar a Excel, PDF, Masivo Stock, Masivo Precios, Masivo WEB e Importar Inventario.
- Plan: replicar columnas/filtros masivos y separar stock de stock crítico en la vista nueva.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/bodega-taller/index.js`
- `backend/src/routes/categorias-bodega-taller/index.js`
- `backend/src/routes/productos`
- `frontend/src/api/bodegaTaller.js`
- `frontend/src/api/categoriasBodegaTaller.js`
- `frontend/src/api/productos.js`
- `frontend/src/pages/bodega`
- `frontend/src/pages/bodega-taller/BodegaTallerPage.jsx`
- `frontend/src/pages/bodega/BodegaFormPage.jsx`
- `frontend/src/pages/bodega/BodegaPage.jsx`

## Brechas a revisar

- Confirmar si todos los campos legacy visibles existen en la UI nueva.
- Confirmar si todas las búsquedas/filtros legacy existen o tienen reemplazo equivalente.
- Confirmar si las exportaciones Excel/PDF legacy existen con el mismo alcance.
- Confirmar si las acciones destructivas o de estado legacy tienen control de permisos y trazabilidad en el sistema nuevo.
- Registrar extras nuevos que mejoran el legacy y no deben perderse.

## Plan de reparación

1. Levantar checklist funcional desde archivos legacy principales.
2. Comparar contra pantalla/API nueva equivalente.
3. Agregar campos, columnas, filtros, botones y exportaciones que existían en legacy y falten hoy.
4. Replicar búsquedas/filtros legacy, incluyendo accesos por botón cuando el usuario los use.
5. Replicar exportaciones Excel/PDF legacy o justificar reemplazo.
6. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
7. Validar con datos reales y usuario clave antes de marcar como cerrado.

## Evidencia legacy revisada

- `bodega\acepta_eliminar.php`
- `bodega\actualizar.php`
- `bodega\actualizar3.php`
- `bodega\actualizar_categoria_bodega.php`
- `bodega\actualizar_codigobarra_bodega.php`
- `bodega\actualizar_estado_inventario.php`
- `bodega\actualizar_precio_bodega.php`
- `bodega\actualizar_proveedor_bodega.php`
- `bodega\actualizar_stock_bodega.php`
- `bodega\actualizar_stockcritico_bodega.php`
- `bodega\buscador\index.php`
- `bodega\buscador\lista.php`
- `bodega\buscador\ver.php`
- `bodega\buscar_categoria.php`
- `bodega\buscar_codigo_interno.php`
- `bodega\buscar_codigobarra.php`
- `bodega\buscar_idmarco.php`
- `bodega\buscar_nombre.php`
- `bodega\buscar_proveedor.php`
- `bodega\consultar_codigo_barra_existe.php`
- `bodega\consultar_codigo_interno_existe.php`
- `bodega\descargar_precios.php`
- `bodega\descargar_stock.php`
- `bodega\eliminar.php`
- `bodega\fpdf.php`
- `bodega\guardar.php`
- `bodega\guardar_stock_cero.php`
- `bodega\guardar_test.php`
- `bodega\importar_eliminar.php`
- `bodega\importar_inv_excel.php`
- `bodega\importar_precios_excel.php`
- `bodega\importar_stock_excel.php`
- `bodega\importar_web_excel.php`
- `bodega\index.php`
- `bodega\lista.php`
- `bodega\lista_excel.php`
- `bodega\lista_pdf.php`
- `bodega\mensaje_actualizado.php`
- `bodega\mensaje_eliminado.php`
- `bodega\mensaje_guardado.php`
- `bodega\modificar.php`
- `bodega\modificar3.php`
- `bodega\nuevo.php`
- `bodega\pasar_a_get.php`
- `bodega\resetear.php`
- `bodega\reseteo_error_guardado.php`
- `bodega\reseteo_ok_guardado.php`
- `bodega\select_dependientes_proceso.php`
- `bodega\subir_foto\index.php`
- `bodega\subir_foto\subir.php`

## Navegación legacy detectada

- `menu.php?pag=bodega/acepta_eliminar&id=<?php echo $registro['id'] ?>`
- `menu.php?pag=bodega/buscador/ver&id=<?php echo $registro['id'] ?>&bb=<?php echo $bb; ?>`
- `menu.php?pag=bodega/buscar_codigo_interno`
- `menu.php?pag=bodega/buscar_codigobarra`
- `menu.php?pag=bodega/buscar_idmarco`
- `menu.php?pag=bodega/buscar_nombre`
- `menu.php?pag=bodega/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=bodega/importar_eliminar`
- `menu.php?pag=bodega/importar_inv_excel`
- `menu.php?pag=bodega/importar_precios_excel`
- `menu.php?pag=bodega/importar_stock_excel`
- `menu.php?pag=bodega/importar_web_excel`
- `menu.php?pag=bodega/index&stock_critico=si`
- `menu.php?pag=bodega/index&todos_marco=si`
- `menu.php?pag=bodega/index&web=si`
- `menu.php?pag=bodega/modificar&id=<?php echo $registro['id'] ?>`
- `menu.php?pag=bodega/nuevo`
- `menu.php?pag=bodega/subir_foto/index&id=<?php echo $id; ?>`
- `menu.php?pag=bodega/subir_foto/index&id=<?php echo $registro['id'] ?>`
