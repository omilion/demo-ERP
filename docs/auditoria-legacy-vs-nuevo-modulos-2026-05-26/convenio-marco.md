# Auditoría legacy vs nuevo - convenio_marco

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\convenio_marco`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: " class="btn btn-primary">Descargar en Excel, *************************************************************, --> Seleccione BANCO SANTANDER BANCO ESTADO, / N° / $ / N° / $, ABONO, Abonar, Abono, Atendido por, Banco, CANT., CODIGO, Cantidad, Carga Transporte, Ciudad / Comuna:, Comuna / Ciudad, Con cuanto Paga, Contacto:, Cuanto Abona.
- Campos/formularios detectados: '.$registro['codigo_interno'].', CHEQUE DIA, CHEQUE FECHA, Cantidad:, Cargo transporte en pesos x Unidad:, Comuna:, Dirección:, E-Mail, EFECTIVO, Elije Cuotas?, Fecha, Fecha de la GUIA, Fono:, Giro:, ID Marco:, Modificar Stock, Monto, Nombre Producto:.
- Botones/acciones detectadas: " />, " /> Desc. % $ SUB TOTAL $ IVA $ TOTAL $ ABONO $ NC TOTALES $ ND TOTALES $ SALDO $, " /> Fecha Monto Tipo de Documento: === SELECCIONE === SIN STOCK DESCUENTO ANULACION FACTURA CAMBIO RAZON SOCIAL INGRESA, " /> Paga $ Paga con $ Vuelto $ Medio de pago Cuotas: Ingresa datos del medio de pago: Banco Fecha de pago --> Seleccion, " class="btn btn-lg btn-danger btn-block" role="button"> ANULAR TODA LA VENTA, " class="btn btn-lg btn-danger btn-block" role="button">Acepto, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Activación, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Anulación, " class="btn btn-lg btn-info btn-block" role="button">Volver a la venta, " class="btn btn-lg btn-primary btn-block" role="button"> Emitir documento de pago, " class="btn btn-lg btn-success btn-block" role="button"> Revertir a ACTIVA, " class="btn btn-sm btn-danger" role="button"> No hay cliente Asociado, Inserta Aquí!!, "> ...Abonare después, "> ...Cancelar esta operación, "> ...Volver a la Venta, "> ¡Este número de OC ya existe! Escribe otro Cancelar, &back= " class="btn btn-sm btn-primary" role="button"> ...Cancelar operación, &back= " class="btn btn-sm btn-primary" role="button"> ...Ir atrás.
- Exportaciones/masivos detectados: /*$objPHPExcel->setActiveSheetIndex(0), //$objPHPExcel->setActiveSheetIndex(0);, //$objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel5');, <a href="convenio_marco/guias_despachos/lista_excel, ms-excel');, pdf");, php?n_guia= " class="btn btn-primary">Descargar en Excel.
- Búsquedas/filtros detectados: "' and n_interno='$numero'");, $("#resultado_rut"), $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET rut_cliente='$rut' where n_interno='$numero'");, $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET rut_cliente='$rut_bd' where n_interno='$numero'");, $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET rut_cliente='' where n_interno='$numero'");, $ACTUALIZAR_SOLO_CANTIDAD = $mysqli->query("UPDATE productos_comprados_local SET cant=cant + $cant where n_interno='$numero' and codigo_interno='$codigo_interno, $ACTUALIZO_PAGO_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET estado_pago='Pagada' where n_interno='$numero' and sucursal='$sucursal'");, $INSERTAR_PRODUCTO=$mysqli->query("INSERT INTO productos_comprados_local(n_interno,codigo_interno,nombre,cant,precio,precio_coniva,n_entregados,descripcion,carg, $anulo_documentos = $mysqli->query("UPDATE caja SET estado_doc='Activa' where n_interno='$numero' and sucursal='$sucursal'");, $anulo_documentos = $mysqli->query("UPDATE caja SET estado_doc='Nula' where n_interno='$numero' and sucursal='$sucursal'");.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/cotizaciones`
- `backend/src/routes/ordenes-compra`
- `frontend/src/pages/licitaciones`
- `frontend/src/pages/ordenes-compra`

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

- `convenio_marco\abonar_factura\guardar.php`
- `convenio_marco\abonar_factura\index.php`
- `convenio_marco\abonar_factura\paso2.php`
- `convenio_marco\activar\activar.php`
- `convenio_marco\activar\index.php`
- `convenio_marco\anular\anular.php`
- `convenio_marco\anular\index.php`
- `convenio_marco\buscar_numero.php`
- `convenio_marco\clase_totales_convenio_marco.php`
- `convenio_marco\cliente\acepta_elimina.php`
- `convenio_marco\cliente\actualizar.php`
- `convenio_marco\cliente\consultar_email_existe.php`
- `convenio_marco\cliente\eliminar_cliente_enorden.php`
- `convenio_marco\cliente\guardar.php`
- `convenio_marco\cliente\index.php`
- `convenio_marco\cliente\insertar.php`
- `convenio_marco\cliente\modificar.php`
- `convenio_marco\cliente\nuevo.php`
- `convenio_marco\consulta_inserta_compra_marco.php`
- `convenio_marco\consultar_codigo_barra_noexiste.php`
- `convenio_marco\consultar_codigo_interno_noexiste.php`
- `convenio_marco\consultar_existe_documento.php`
- `convenio_marco\consultar_existe_oc_marco.php`
- `convenio_marco\consultar_id_marco_noexiste.php`
- `convenio_marco\consultar_pasa_stock_codbarra.php`
- `convenio_marco\consultar_pasa_stock_codinterno.php`
- `convenio_marco\crear_factura\guardar.php`
- `convenio_marco\crear_factura\index.php`
- `convenio_marco\crear_numero_interno.php`
- `convenio_marco\elegir_tipo_abono.php`
- `convenio_marco\eliminar_items.php`
- `convenio_marco\guias_despachos\eliminar.php`
- `convenio_marco\guias_despachos\guardar.php`
- `convenio_marco\guias_despachos\index.php`
- `convenio_marco\guias_despachos\lista_excel.php`
- `convenio_marco\imprimir.php`
- `convenio_marco\index.php`
- `convenio_marco\inserta_descuento_marco.php`
- `convenio_marco\lista_productos_comprados_marco.php`
- `convenio_marco\menu_imprimir.php`
- `convenio_marco\modificar_entregados\actualizar.php`
- `convenio_marco\modificar_entregados\index.php`
- `convenio_marco\modificar_producto\actualizar.php`
- `convenio_marco\modificar_producto\index.php`
- `convenio_marco\modificar_venta\actualizar.php`
- `convenio_marco\modificar_venta\index.php`
- `convenio_marco\nota_venta.php`
- `convenio_marco\odts\eliminar.php`
- `convenio_marco\odts\guardar.php`
- `convenio_marco\odts\index.php`
- `convenio_marco\pasa_get.php`
- `convenio_marco\subir_foto\index.php`
- `convenio_marco\subir_foto\subir.php`
- `convenio_marco\venta.php`

## Navegación legacy detectada

- `menu.php?pag=convenio_marco/abonar_factura/index&numero=<?php echo $numero; ?>&n_doc=<?php echo $registro_doc['n_doc']; ?>&id=<?php echo $registro_doc`
- `menu.php?pag=convenio_marco/activar/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=convenio_marco/anular/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=convenio_marco/cliente/acepta_elimina&numero=<?php echo $numero; ?>&rut=<?php echo $rut; ?>`
- `menu.php?pag=convenio_marco/cliente/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=convenio_marco/cliente/modificar&numero=<?php echo $numero; ?>&id_cliente=<?php echo $id_cliente; ?>`
- `menu.php?pag=convenio_marco/crear_factura/index&numero=<?php echo $numero; ?>&documento=Factura Laura`
- `menu.php?pag=convenio_marco/crear_factura/index&numero=<?php echo $numero; ?>&documento=Factura Plast`
- `menu.php?pag=convenio_marco/crear_factura/index&numero=<?php echo $numero; ?>&documento=NC Laura`
- `menu.php?pag=convenio_marco/crear_factura/index&numero=<?php echo $numero; ?>&documento=NC Plast`
- `menu.php?pag=convenio_marco/crear_factura/index&numero=<?php echo $numero; ?>&documento=ND Laura`
- `menu.php?pag=convenio_marco/crear_factura/index&numero=<?php echo $numero; ?>&documento=ND Plast`
- `menu.php?pag=convenio_marco/elegir_tipo_abono&numero=<?php echo $numero; ?>`
- `menu.php?pag=convenio_marco/guias_despachos/index&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=convenio_marco/index`
- `menu.php?pag=convenio_marco/modificar_entregados/index&numero=<?php echo $numero; ?>&id=<?php echo $registro['id']; ?>`
- `menu.php?pag=convenio_marco/modificar_producto/index&id=<?php echo $registro['id']; ?>&numero=<?php echo $numero; ?>`
- `menu.php?pag=convenio_marco/modificar_venta/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=convenio_marco/odts/index&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=convenio_marco/subir_foto/index&id=<?php echo $id_producto; ?>&numero=<?php echo $numero; ?>`
- `menu.php?pag=convenio_marco/venta&numero=<?php echo $_GET['numero']; ?>&back=4`
- `menu.php?pag=convenio_marco/venta&numero=<?php echo $numero; ?>`
- `menu.php?pag=convenio_marco/venta&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=convenio_marco/venta&numero=<?php echo $numero; ?>&back=<?php echo $back; ?>`
- `menu.php?pag=pasar_taller/index&numero=<?php echo $numero; ?>&origen=marco&back=3`

## Resultado SPR-14 - 2026-05-27

Estado: **Aprobado con observaciones documentadas**.

### Corregido en plataforma nueva

- Convenio Marco descuenta stock inventariado al crear venta y lo reconcilia al anular/reactivar.
- OC de Convenio Marco obligatoria, normalizada sin espacios y bloqueada contra duplicados.
- Alta de productos en venta Convenio Marco usa precio Marco + IVA como precio operativo.
- Matriz Ventas filtra `Lic. / Convenio` incluyendo Licitacion y Convenio Marco.
- Cotizaciones y ordenes de compra online respetan scope por sucursal.
- Conversion de cotizacion adjudicada a venta queda transaccional con lock.
- Descuentos requieren permiso y valores entre 0 y 100.
- Exportacion de ventas calcula total con cargos e incluye descuento, abono, saldo y facturado.

### No replicado por decision de alcance

- Venta vacia solo con OC: legacy lo permitia, pero la plataforma nueva exige cliente e items para mantener trazabilidad.
- Pantalla fiscal identica legacy con desglose separado `neto / IVA / NC / ND`: queda reemplazada por Caja/Cobranza y exportacion nueva.
- Subida de foto desde la venta Convenio Marco: queda centralizada en Catalogo/Producto.

### Validacion

- Backend completo: **39 archivos, 340 tests OK**.
- Backend CI: **95 tests OK**.
- Frontend lint: **OK**.
- Frontend build: **OK** con advertencia conocida de chunk Vite mayor a 500 kB.
