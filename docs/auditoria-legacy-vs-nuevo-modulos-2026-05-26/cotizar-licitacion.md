# Auditoría legacy vs nuevo - cotizar_licitacion

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\cotizar_licitacion`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: " id="descripcion " style="width: 100%;" rows="13" class="inputcajas" onchange="actualizar_descripcion(' ',' '); return, " id="ncant " value=" " class="inputcajasv" onchange="actualizar_cantidad(' ',' ',' '); return false" >, " id="nombre " style="width: 100%;" rows="13" class="inputcajas" onchange="actualizar_nombre(' ',' '); return false">, " id="tni " class="inputcajasv" value=" " readonly>, "> " id="valor " value=" " class="inputcajasv" onchange="actualizar_valor(' ',' ',' '); return false">, 0) { ?> bgcolor="#CC99CC" style='border:1px solid #000;'>, 0){ ?> bgcolor="#CC99CC" style='border:1px solid #000;'>, Cant., Cant. Adjud., Comuna / Ciudad, Comuna:, Código, Descripción, Descripción del producto, Dirección, F. Téc. y Eco., FICHA TECNICA Y ECONOMICA ID:, Fecha:.
- Campos/formularios detectados: Cantidad de Adjudicados, Cantidad:, Comuna:, Código de barra o código Interno:, Descripción:, Detalle para Licitación:, Dirección:, E-Mail, Estado:, Fecha Licitación:, Fono:, Giro:, Nombre Producto:, Nombre producto:, Nombre:, Nuevo Código Interno EJ: PLAS-EXT1:, N° Licitación o ID:, ORDEN COMPRA:.
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button">Acepto, " class="btn btn-md btn-danger" role="button" title="CREAR VENTA..."> PASAR A VENTAS PARA CREAR FACTURAS Y REGISTRAR PAG, " class="btn btn-md btn-info btn-block" role="button"> Crear un nuevo Producto Externo..., " class="btn btn-md btn-info" role="button" title="Editar datos..."> SOLO QUIERO VER LA VENTA N° ASOCIADA A ESTA LICITAC, " class="btn btn-md btn-primary" role="button" title="Editar datos...">, " class="btn btn-md btn-primary" role="button" title="Editar datos...">AQUI!, " class="btn btn-md btn-success" role="button" title="Editar datos..."> ACTUALIZAR LA VENTA N° ASOCIADA A ESTA LICITACIO, " class="btn btn-sm btn-danger" role="button"> No hay cliente Asociado, Inserta Aquí!!, " id="valor " value=" " class="inputcajasv" onchange="actualizar_valor(' ',' ',' '); return false"> " id="tni " class="i, "> ¡Este número de ID ya existe! Escribe otro Fecha Licitación: Cancelar, &back=3" class="btn btn-lg btn-info btn-block" role="button">No Acepto, &back=3" class="btn btn-sm btn-primary" role="button"> ...Cancelar operación, &back=3" class="btn btn-sm btn-primary" role="button"> Cancelar operación, &back=3" class="btn btn-sm btn-warning" role="button"> ...Ir a la venta, &back=4" class="btn btn-sm btn-primary" role="button"> Cancelar operación, &id_cliente= " class="btn btn-sm btn-primary" role="button" title="Modificar Datos Cliente"> Modificar Datos Cliente, &id_licitacion= " class="btn btn-sm btn-primary" role="button">, &rut= " class="btn btn-sm btn-danger" role="button" title="Sacar Cliente de la Cotización"> Sacar Cliente.
- Exportaciones/masivos detectados: pdf");, php?pag=cotizar_licitacion/masivo">.
- Búsquedas/filtros detectados: "> ACTUALIZAR LA VENTA N° ASOCIADA A ESTA LICITACION, "> SOLO QUIERO VER LA VENTA N° ASOCIADA A ESTA LICITACION, $("#resultado_rut"), $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE cotizacion_licitacion SET rut_cliente='$rut' where id_licitacion='$id_licitacion'");, $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE cotizacion_licitacion SET rut_cliente='$rut_bd' where id_licitacion='$id_licitacion'");, $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE cotizacion_licitacion SET rut_cliente='' where id_licitacion='$id_licitacion'");, $ACTUALIZO_ORDEN_COMPRA_SISTEMA=$mysqli->query("UPDATE orden_compra_sistema SET orden_compra='$orden_compra_licitacion',rut_cliente='$rut_cliente_licitacion' ,o, $ACTUALIZO_PRODUCTO_COMPRA_LOCAL = $mysqli->query("UPDATE productos_comprados_local SET nombre='$nombre',cant='$cant_adjudicados',precio='$precio',descripcion=', $INSERTAR_PRODUCTO_COMPRA_LOCAL=$mysqli->query("INSERT INTO productos_comprados_local(n_interno,codigo_interno,nombre,cant,precio,precio_coniva,n_entregados,des, $cliente= $consulta_rut->fetch_assoc();.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/cotizaciones`
- `frontend/src/pages/licitaciones`

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

- `cotizar_licitacion\actualizar_cantidad.php`
- `cotizar_licitacion\actualizar_descripcion.php`
- `cotizar_licitacion\actualizar_nombre.php`
- `cotizar_licitacion\actualizar_valor.php`
- `cotizar_licitacion\actualizar_venta.php`
- `cotizar_licitacion\buscar_id.php`
- `cotizar_licitacion\clase_totales_cotizacion_licitacion.php`
- `cotizar_licitacion\cliente\acepta_elimina.php`
- `cotizar_licitacion\cliente\actualizar.php`
- `cotizar_licitacion\cliente\consultar_email_existe.php`
- `cotizar_licitacion\cliente\eliminar_cliente_enorden.php`
- `cotizar_licitacion\cliente\guardar.php`
- `cotizar_licitacion\cliente\index.php`
- `cotizar_licitacion\cliente\insertar.php`
- `cotizar_licitacion\cliente\modificar.php`
- `cotizar_licitacion\cliente\nuevo.php`
- `cotizar_licitacion\consulta_inserta_cotizacion.php`
- `cotizar_licitacion\consultar_codigo_barra_noexiste.php`
- `cotizar_licitacion\consultar_codigo_interno_noexiste.php`
- `cotizar_licitacion\consultar_existe_licitacion.php`
- `cotizar_licitacion\cotizacion_licitacion.php`
- `cotizar_licitacion\cotizacion_licitacion2.php`
- `cotizar_licitacion\crear_licitacion.php`
- `cotizar_licitacion\crear_producto\consultar_existe_codigointerno.php`
- `cotizar_licitacion\crear_producto\index.php`
- `cotizar_licitacion\crear_producto\insertar.php`
- `cotizar_licitacion\crear_producto\nuevo.php`
- `cotizar_licitacion\crear_producto\pasar_crear.php`
- `cotizar_licitacion\crear_venta.php`
- `cotizar_licitacion\eliminar_items.php`
- `cotizar_licitacion\imprimir_licitacion.php`
- `cotizar_licitacion\index.php`
- `cotizar_licitacion\lib_fecha_texto.php`
- `cotizar_licitacion\lista_productos_cotizados.php`
- `cotizar_licitacion\lista_productos_cotizados2.php`
- `cotizar_licitacion\masivo.php`
- `cotizar_licitacion\masivo2.php`
- `cotizar_licitacion\modificar_licitacion\actualizar.php`
- `cotizar_licitacion\modificar_licitacion\index.php`
- `cotizar_licitacion\modificar_producto\actualizar.php`
- `cotizar_licitacion\modificar_producto\index.php`
- `cotizar_licitacion\pasa_get.php`
- `cotizar_licitacion\subir_foto\index.php`
- `cotizar_licitacion\subir_foto\subir.php`

## Navegación legacy detectada

- `menu.php?pag=cotizar_licitacion/cliente/acepta_elimina&id_licitacion=<?php echo $id_licitacion; ?>&rut=<?php echo $rut; ?>`
- `menu.php?pag=cotizar_licitacion/cliente/index&id_licitacion=<?php echo $id_licitacion; ?>`
- `menu.php?pag=cotizar_licitacion/cliente/modificar&id_licitacion=<?php echo $id_licitacion; ?>&id_cliente=<?php echo $id_cliente; ?>`
- `menu.php?pag=cotizar_licitacion/cotizacion_licitacion&id_licitacion=<?php echo $_GET['id_licitacion']; ?>&back=4`
- `menu.php?pag=cotizar_licitacion/cotizacion_licitacion&id_licitacion=<?php echo $id_licitacion; ?>&back=3`
- `menu.php?pag=cotizar_licitacion/cotizacion_licitacion&id_licitacion=<?php echo $id_licitacion; ?>&back=4`
- `menu.php?pag=cotizar_licitacion/crear_producto/index&id_licitacion=<?php echo $id_licitacion; ?>`
- `menu.php?pag=cotizar_licitacion/modificar_licitacion/index&id_licitacion=<?php echo $id_licitacion; ?>`
- `menu.php?pag=cotizar_licitacion/modificar_producto/index&id=<?php echo $registro['id']; ?>&id_licitacion=<?php echo $id_licitacion; ?>`
- `menu.php?pag=cotizar_licitacion/subir_foto/index&id=<?php echo $id_producto; ?>&id_licitacion=<?php echo $id_licitacion; ?>`
- `menu.php?pag=licitacion_venta/venta&numero=<?php echo $numero_venta; ?>`

## Resultado SPR-15 - 2026-05-27

Estado: **Aprobado con observaciones documentadas**.

### Corregido en plataforma nueva

- ID licitacion obligatorio, normalizado sin espacios y bloqueado contra duplicados.
- Fecha licitacion obligatoria.
- Estado `No Adjudicada` agregado y clasificado como perdida.
- Conversion a venta valida cliente, estado Adjudicada, plazo, OC, items adjudicados y productos existentes.
- Conversion y actualizacion de venta vinculada descuentan/reconcilian stock inventariado.
- Actualizacion de venta vinculada bloquea si ya hay pagos o documentos de caja.
- Items de cotizacion validan cantidad, precio y adjudicados.
- Detalle de licitacion incluye buscador de producto de catalogo con precio licitacion.
- Accion `Adjudicar todo` disponible.
- RUT organismo editable desde detalle.
- Reporte gerencial de licitaciones respeta scope por sucursal para usuarios no admin.

### No replicado por decision de alcance

- Ficha tecnica/economica PDF exacta con membrete/fotos/totales IVA.
- Excel XLS resumen/detalle legacy.
- Adjudicacion masiva por seleccion parcial; hoy existe adjudicacion total.
- Crear/modificar cliente completo desde la licitacion; se centraliza en modulo Clientes.

### Validacion

- Backend completo: **39 archivos, 342 tests OK**.
- Backend CI: **95 tests OK**.
- Frontend lint: **OK**.
- Frontend build: **OK** con advertencia conocida de chunk Vite mayor a 500 kB.
