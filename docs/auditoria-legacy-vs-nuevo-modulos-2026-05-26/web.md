# Auditoría legacy vs nuevo - web

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\web`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: Banner, Eliminar, Escribir, IMAGEN SOBREPASA EL TAMA�O DE ANCHO Y ALTO PERMITIDO !!!! SOLO IMAGENES FORMATO PNG O JPG !!!! IMAGEN SUBIDA CON EXITO !, Modulo, Orden, SE ESTA SUBIENDO ESPERE UN MOMENTO...!!!!, Submodulo, Texto, Titulo, m&aacute;x 3 MB.
- Campos/formularios detectados: Código Vendedor:, Estado:, Nivel:, Nombre:, Password:, Permite hacer descuentos :, Rut: (EJ: 12456754-8), Sucursal:, Usuario: (EJ: codigotec).
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button"> Acepto, &times;, ...Ir atras, <?= $rut ?>, <?php echo $codigo_vendedor; ?>, <?php echo $id; ?>, <?php echo $login_usuario; ?>, <?php echo $nombre; ?>, <?php echo $password; ?>, <?php echo $row['id']; ?>, Actualizar datos, Cancelar operación, Crear nuevo, No Acepto, SUBIR IMAGEN.
- Exportaciones/masivos detectados: pdf");.
- Búsquedas/filtros detectados: "rut": rut, $("#resultado_rut"), $numero = $matches[1];, $result1=$mysqli->query("SELECT * FROM usuarios_sistema WHERE rut='$rut'");, $result1=$mysqli->query("UPDATE usuarios_sistema SET login_usuario='$usuario',id_nivel_usuario='$nivel', id_sucursal_usuario='$sucursal', nombre_usuario='$nombr, $result2=$mysqli->query("INSERT INTO usuarios_sistema(login_usuario,nombre_usuario,id_nivel_usuario,id_sucursal_usuario,password_usuario,estado_usuario,codigo_v, $rut = $row['rut'];, $rut = str_replace(', $rut = trim($rut);, $rut=$_REQUEST['rut'];.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/banners`
- `backend/src/routes/productos/publicWeb.js`
- `backend/src/routes/usuarios-web`
- `backend/src/routes/usuarios-web/index.js`

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

- `web\acepta_eliminar.php`
- `web\actualizar.php`
- `web\consultar_rut_existe.php`
- `web\consultar_usuario_existe.php`
- `web\eliminar.php`
- `web\guardar.php`
- `web\guardar_permiso.php`
- `web\index.php`
- `web\lista.php`
- `web\mensaje_actualizado.php`
- `web\mensaje_eliminado.php`
- `web\mensaje_guardado.php`
- `web\modificar.php`
- `web\nuevo.php`
- `web\subir.php`
- `web\subir_foto\index.php`
- `web\subir_foto\subir.php`

## Navegación legacy detectada

- `menu.php?pag=usuarios/acepta_eliminar&id=<?php echo $registro['id_usuario']; ?>`
- `menu.php?pag=usuarios/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=usuarios/index`
- `menu.php?pag=usuarios/modificar&id=<?php echo $registro['id_usuario']; ?>`
- `menu.php?pag=web/subir_foto/index`
