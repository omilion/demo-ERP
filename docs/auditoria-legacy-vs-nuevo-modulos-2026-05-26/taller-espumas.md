# Auditoría legacy vs nuevo - taller_espumas

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\taller_espumas`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: ************************************************************************************************************************, ..Volver a Ficha, > Cambiar, Buscar..., Cant, Cant., Cliente, Creada por, Código, Detalle, Est. Producto, Estado, Estado OT, Estado OT:, Estado Producto, Estado Taller Espumas, FICHA TALLER ESPUMAS PLASTIMAR OT, Fecha Ingreso:.
- Campos/formularios detectados: Fecha de Inicio, Fecha de Término.
- Botones/acciones detectadas: " required="required" /> Fecha Término: Estado OT: Obs OT: ... Ir a atrás, "> Buscar..., "> Fecha de Término Buscar, "> Ficha, &back= " class="btn btn-sm btn-primary" role="button"> ...Cancelar operación, &back= " role="button" class="btn btn-danger btn-sm"> ..Volver a Ficha, &back=3" role="button" class="btn btn-primary btn-sm"> Agrega Materiales, &back=4" role="button" class="btn btn-success"> Mostrar Listado Completo, &fecha1= &fecha2= &pendiente= &prioridad= ')" role="button" class="btn btn-danger btn-sm">, &id= " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Eliminación, &id= &back=3"> Cambiar, &numero= ">, &times;, ')" role="button" class="btn btn-primary btn-sm"> Imprimir Ficha, ($('#cant ').val());return false;">, <?php echo $id; ?>, <?php echo $numero; ?>, Buscar.
- Búsquedas/filtros detectados: "numero":, $ACTUALIZO1=$mysqli->query("UPDATE taller SET fecha_inicio='$fecha_inicio',fecha_termino='$fecha_termino' WHERE n_interno='$numero'");, $ACTUALIZO3=$mysqli->query("UPDATE taller SET estado_general='$estado_adquirido' WHERE n_interno='$numero'");, $ACTUALIZO=$mysqli->query("UPDATE taller_materiales SET cant=cant + $cant WHERE codigo_interno='$codigo_interno' and n_interno='$numero' and taller='$taller'");, $INSERTAR=$mysqli->query("INSERT INTO taller_materiales(n_interno,codigo_interno,nombre,cant,unidad,taller) VALUES ('$numero','$codigo_interno','$nombre_product, $INSERTAR_HISTORIAL=$mysqli->query("INSERT INTO taller_historial_materiales(n_interno,codigo_interno,nombre,egreso,ingreso,unidad,usuario,fecha,taller,sucursal), $INSERTAR_PRODUCTO=$mysqli->query("INSERT INTO taller_historial_materiales(n_interno,codigo_interno,nombre,egreso,ingreso,unidad,usuario,fecha,taller,sucursal), $consulta2=$mysqli->query("SELECT * FROM productos_taller where n_interno='$numero' and taller_espumas='Espumas'");, $consulta4=$mysqli->query("SELECT * FROM taller_materiales where n_interno='$numero' and taller='Espumas'");, $consulta=$mysqli->query("SELECT * FROM taller_materiales where n_interno='$numero' and taller='Espumas'");.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/odts`
- `frontend/src/pages/taller`

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
5. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
6. Validar con datos reales y usuario clave antes de marcar como cerrado.

## Evidencia legacy revisada

- `taller_espumas\actualizar.php`
- `taller_espumas\actualizar_estados.php`
- `taller_espumas\agregar_materiales\index.php`
- `taller_espumas\agregar_materiales\insertar.php`
- `taller_espumas\buscar_fechas.php`
- `taller_espumas\buscar_ninterno.php`
- `taller_espumas\estado_general.php`
- `taller_espumas\estados_productos.php`
- `taller_espumas\ficha.php`
- `taller_espumas\imprime_ficha.php`
- `taller_espumas\imprime_lista.php`
- `taller_espumas\index.php`
- `taller_espumas\lista.php`
- `taller_espumas\materiales\acepta_elimina.php`
- `taller_espumas\materiales\eliminar.php`
- `taller_espumas\materiales\lista.php`
- `taller_espumas\materiales\mensaje_eliminado.php`
- `taller_espumas\mensaje_actualizado.php`
- `taller_espumas\modificar_estados_productos.php`
- `taller_espumas\pasar_a_get.php`

## Navegación legacy detectada

- `menu.php?pag=taller_espumas/agregar_materiales/index&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=taller_espumas/agregar_materiales/index&numero=<?php echo $numero; ?>&back=4`
- `menu.php?pag=taller_espumas/buscar_fechas`
- `menu.php?pag=taller_espumas/buscar_ninterno`
- `menu.php?pag=taller_espumas/ficha&numero=<?php echo $numero; ?>&back=<?php echo $back; ?>`
- `menu.php?pag=taller_espumas/ficha&numero=<?php echo $registro['n_interno']; ?>`
- `menu.php?pag=taller_espumas/index&pendiente=si`
- `menu.php?pag=taller_espumas/index&prioridad=alta`
- `menu.php?pag=taller_espumas/materiales/acepta_elimina&id=<?php echo $registro['id']?>&numero=<?php echo $registro['n_interno']?>`
- `menu.php?pag=taller_espumas/modificar_estados_productos&numero=<?php echo $registro['n_interno']?>&id=<?php echo $registro['id']?>&back=3`
