# Auditoría legacy vs nuevo - cargo_transporte

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\cargo_transporte`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: Nombre Zona, Valor en % aplicado a la Venta.
- Campos/formularios detectados: Nombre:, Valor %, Valor %:.
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button">Acepto, &times;, ')" role="button" class="btn btn-danger btn-sm"> PDF, <?php echo $id; ?>, <?php echo $nombre; ?>, <?php echo $valor; ?>, Actualizar datos, Cancelar operación, Crear Nuevo, Crear nuevo, Exportar a Excel, No Acepto.
- Exportaciones/masivos detectados: $mpdf = new \Mpdf\Mpdf(['orientation' => 'L']); // Establece la orientación en landscape (horizontal), $mpdf->AddPage();, $mpdf->AliasNbPages();, $mpdf->Cell(10,6, $numero,1,0,'C',1);, $mpdf->Cell(10,6,'',1,0,'C',1);, $mpdf->Cell(60,6, $valor,1,1,'C',1);, $mpdf->Cell(60,6,'Valor en % aplicado a la Venta',1,1,'C',1);, $mpdf->Cell(80,10, 'Sucursal:', $mpdf->Cell(80,10,$salida, $mpdf->Cell(80,6, $nombre,1,0,'L',1);.
- Búsquedas/filtros detectados: $mpdf->Cell(10,6, $numero,1,0,'C',1);, $numero=$numero + 1;, $numero=0;, // APLICO FILTROS A LOS ENCABEZADOS, // Alias para el número total de páginas, //$pdf->fila($numero,$nombre,$valor);.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/cargo-transporte`
- `backend/src/routes/cargo-transporte/index.js`
- `backend/src/routes/ventas/cargos.js`
- `frontend/src/api/cargoTransporte.js`

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

- `cargo_transporte\acepta_eliminar.php`
- `cargo_transporte\actualizar.php`
- `cargo_transporte\consultar_nombre_existe.php`
- `cargo_transporte\eliminar.php`
- `cargo_transporte\guardar.php`
- `cargo_transporte\index.php`
- `cargo_transporte\lista.php`
- `cargo_transporte\lista_excel.php`
- `cargo_transporte\lista_pdf.php`
- `cargo_transporte\mensaje_actualizado.php`
- `cargo_transporte\mensaje_eliminado.php`
- `cargo_transporte\mensaje_guardado.php`
- `cargo_transporte\modificar.php`
- `cargo_transporte\nuevo.php`

## Navegación legacy detectada

- `menu.php?pag=cargo_transporte/acepta_eliminar&id=<?php echo $registro['id'];?>`
- `menu.php?pag=cargo_transporte/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=cargo_transporte/index`
- `menu.php?pag=cargo_transporte/modificar&id=<?php echo $registro['id'];?>`
- `menu.php?pag=cargo_transporte/nuevo`
