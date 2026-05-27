# Auditoría legacy vs nuevo - bodega_taller

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\bodega_taller`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: Categoría, Cód Barra, Cód Interno, Nombre, Proveedor, Stock, Stock Crítico, Subcategoria, Unid. Medida.
- Campos/formularios detectados: Categoria:, Costo:, Código barra:, Código interno:, Nombre producto:, Proveedor:, Stock Crítico:, Stock:, Subategoria:, Subcategoria:, Unidad Medida:.
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button">Acepto, "> Código interno: Código barra: Unidad Medida: Unidad Mts Mts2 Litros Categoria: Subcategoria: Seleccione Stock Crítico, &codigo_barra= &codigo_interno= &nombre= &categoria= &subcategoria= &stock_critico= &barra_repetido= &interno_repetido=, &codigo_interno= &nombre= &categoria= &subcategoria= &stock_critico= &barra_repetido= &interno_repetido= &sin_codigo_bar, &times;, Buscar, Cancelar operación, Crear nuevo, Código barra, Código interno, Código interno: Código barra: Unidad Medida: Seleccione Unidad Mts Mts2 Litros Categoria: Seleccione Subategoria: Selecc, No Acepto, Nombre producto, Stock Crítico ( ).
- Exportaciones/masivos detectados: $mpdf = new \Mpdf\Mpdf(['orientation' => 'L']); // Establece la orientación en landscape (horizontal), $mpdf->AddPage();, $mpdf->AliasNbPages();, $mpdf->Cell(10,6, $numero,1,0,'C',1);, $mpdf->Cell(10,6,'',1,0,'C',1);, $mpdf->Cell(15,6, $costo,1,1,'C',1);, $mpdf->Cell(15,6, $stock,1,0,'C',1);, $mpdf->Cell(15,6,'Costo',1,1,'C',1);, $mpdf->Cell(15,6,'Stock',1,0,'C',1);, $mpdf->Cell(20,6, utf8_decode($unidad_medida),1,0,'C',1);.
- Búsquedas/filtros detectados: $_pagi_sql = "SELECT * FROM bodega_taller where (nombre like '%$nombre%' or nombre like '%$buscar_sinacento%') and sucursal='$sucursal'";, $buscar_sinacento = eliminar_tildes($nombre);, $mpdf->Cell(10,6, $numero,1,0,'C',1);, $numero=$numero + 1;, $numero=0;, $salida="Resultado busqueda proveedor ", $salida="Resultado búsqueda ", $salida="Resultado búsqueda Nombre ", $salida="Resultado búsqueda categoria ", $salida="Resultado búsqueda código de barra ".

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/bodega-taller`
- `backend/src/routes/bodega-taller/index.js`
- `backend/src/routes/categorias-bodega-taller/index.js`
- `frontend/src/api/bodegaTaller.js`
- `frontend/src/pages/bodega-taller`
- `frontend/src/pages/bodega-taller/BodegaTallerPage.jsx`

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

- `bodega_taller\acepta_eliminar.php`
- `bodega_taller\actualizar.php`
- `bodega_taller\buscar_categoria.php`
- `bodega_taller\buscar_codigo_interno.php`
- `bodega_taller\buscar_codigobarra.php`
- `bodega_taller\buscar_nombre.php`
- `bodega_taller\buscar_proveedor.php`
- `bodega_taller\consultar_codigo_barra_existe.php`
- `bodega_taller\consultar_codigo_interno_existe.php`
- `bodega_taller\eliminar.php`
- `bodega_taller\guardar.php`
- `bodega_taller\index.php`
- `bodega_taller\lista.php`
- `bodega_taller\lista_excel.php`
- `bodega_taller\lista_pdf.php`
- `bodega_taller\mensaje_actualizado.php`
- `bodega_taller\mensaje_eliminado.php`
- `bodega_taller\mensaje_guardado.php`
- `bodega_taller\modificar.php`
- `bodega_taller\nuevo.php`
- `bodega_taller\pasar_a_get.php`
- `bodega_taller\select_dependientes_proceso.php`

## Navegación legacy detectada

- `menu.php?pag=bodega_taller/acepta_eliminar&id=<?php echo $registro['id']?>`
- `menu.php?pag=bodega_taller/buscar_codigo_interno`
- `menu.php?pag=bodega_taller/buscar_codigobarra`
- `menu.php?pag=bodega_taller/buscar_nombre`
- `menu.php?pag=bodega_taller/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=bodega_taller/index&stock_critico=si`
- `menu.php?pag=bodega_taller/modificar&id=<?php echo $registro['id']?>`
- `menu.php?pag=bodega_taller/nuevo`
