# Auditoría legacy vs nuevo - taller_historial_materiales

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\taller_historial_materiales`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: Acción, Codigo, Cód producto, Egreso, Fecha, Ingreso, Nombre Producto, Operario, Saldo, Seleccionar Eliminar Selección, Taller, Total Egreso, Total Ingreso, Ubicación, Ultima Modificación, Unid Medida.
- Campos/formularios detectados: Cantidad, Cortador, Código, Fecha de Inicio, Fecha de Término, Producto, Ubicación.
- Botones/acciones detectadas: " />, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Eliminación, " data-codigo=" " data-ubicacion=" " data-tipo=" " data-ingreso="0">, " data-codigo=" " data-ubicacion=" " data-tipo=" " data-ingreso="1">, "> Fecha de Término Buscar, &fecha2= "> Exportar a Excel, &fecha2= &usuario= &taller= "> Exportar a Excel, &times;, ...Ir atras, Agregar Nueva Tela, Cancelar operación, Cantidad Cortador Código Ubicación Cerrar, Cantidad Código Cerrar, Eliminar Selección, Fecha de Término Buscar, Fechas, Guardar, Operario y Fechas.
- Exportaciones/masivos detectados: $objPHPExcel = new PHPExcel();, $objPHPExcel->getActiveSheet()->setAutoFilter("A3:J3");, $objPHPExcel->getActiveSheet()->setTitle($salida);, $objPHPExcel->getActiveSheet(0)->freezePaneByColumnAndRow(0,4);, $objPHPExcel->getProperties()->setCreator("Codigotec") //Autor, $objPHPExcel->setActiveSheetIndex(0), $objPHPExcel->setActiveSheetIndex(0);, $objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel2007'); */, $objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel5');, /* Se manda el archivo al navegador web, con el nombre que se indica (Excel2007).
- Búsquedas/filtros detectados: // APLICO FILTROS A LOS ENCABEZADOS, // Verificar si el número tiene decimales, Buscar, Búsqueda Operario entre fechas!!, Búsqueda Taller entre fechas!!, Búsqueda por Fechas !!, php?pag=taller_historial_materiales/buscar_fechas" class="btn btn-warning btn-sm" role="button">, php?pag=taller_historial_materiales/buscar_operario_fechas" class="btn btn-danger btn-sm" role="button">, php?pag=taller_historial_materiales/buscar_taller_fechas" class="btn btn-info btn-sm" role="button">.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/historial-materiales`
- `frontend/src/pages/historial-materiales`

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

- `taller_historial_materiales\acepta_elimina.php`
- `taller_historial_materiales\buscar_fechas.php`
- `taller_historial_materiales\buscar_operario_fechas.php`
- `taller_historial_materiales\buscar_taller_fechas.php`
- `taller_historial_materiales\elimina_varias.php`
- `taller_historial_materiales\eliminar.php`
- `taller_historial_materiales\index.php`
- `taller_historial_materiales\lista.php`
- `taller_historial_materiales\lista_excel.php`
- `taller_historial_materiales\mensaje_eliminado.php`
- `taller_historial_materiales\pasar_a_get.php`
- `taller_historial_materiales\telas\index.php`
- `taller_historial_materiales\telas\lista.php`
- `taller_historial_materiales\telas\lista_excel.php`
- `taller_historial_materiales\telas\save_egreso.php`

## Navegación legacy detectada

- `menu.php?pag=taller_historial_materiales/acepta_elimina&id=<?php echo $registro['id']?>`
- `menu.php?pag=taller_historial_materiales/buscar_fechas`
- `menu.php?pag=taller_historial_materiales/buscar_operario_fechas`
- `menu.php?pag=taller_historial_materiales/buscar_taller_fechas`
