# Auditoría legacy vs nuevo - venta_web

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_web`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: " class="btn btn-primary">Descargar en Excel, *************************************************************, --> Seleccione BANCO SANTANDER BANCO ESTADO, / N° / $, ABONO, Abonar Abonar, Abono, Atendido por, Banco, Boleta Electrónica, Boleta Manual, CANT., CODIGO, Cantidad, Ciudad / Comuna:, Comuna / Ciudad, Con cuanto Paga, Contacto:.
- Campos/formularios detectados: '.$registro['codigo_interno'].', CHEQUE DIA, CHEQUE FECHA, Cantidad:, Categoria:, Comuna:, Código de barra o código Interno:, Detalle o descripción:, Dirección:, E-Mail:, EFECTIVO, Elije Cuotas?, Fecha, Fecha de boleta, Fecha de la GUIA, Fono:, Giro:, MULTA.
- Botones/acciones detectadas: " />, " /> EFECTIVO CHEQUE DIA CHEQUE FECHA TRANSFERENCIA 2) INGRESA PAGO PAGO $ Con cuanto Paga Su Vuelto es Continuar, " /> Fecha Monto Tipo de Documento: === SELECCIONE === SIN STOCK DESCUENTO ANULACION FACTURA CAMBIO RAZON SOCIAL INGRESA, " /> Fecha de boleta Monto boleta Stock N°: Nota de Crédito Referencial N°: CREAR DOCUMENTO, " /> Paga $ Paga con $ Vuelto $ Medio de pago Cuotas: Ingresa datos del medio de pago: Banco N° documento --> Fecha de p, " /> Paga $ Paga con $ Vuelto $ Medio de pago Cuotas: Ingresa datos del medio de pago: Banco N° documento FINALIZAR PAGO, " /> Paga o Abona $ Medio de pago Cuotas: N°: FINALIZAR PAGO, " /> Paga o Abona $ Medio de pago Ingresa datos del medio de pago: Banco N° documento N°: FINALIZAR PAGO, " /> TARJETA DEBITO TARJETA CREDITO Elije Cuotas? 1 4 2) INGRESA PAGO TOTAL O ABONO Continuar, " class="btn btn-lg btn-danger btn-block" role="button"> ANULAR TODA LA VENTA, " class="btn btn-lg btn-danger btn-block" role="button">Acepto, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Activación, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Anulación, " class="btn btn-lg btn-info btn-block" role="button">Volver a la venta, " class="btn btn-lg btn-primary btn-block" role="button"> Emitir documento de pago, " class="btn btn-lg btn-success btn-block" role="button"> Revertir a ACTIVA, " class="btn btn-lg btn-warning" role="button"> Voucher, " class="btn btn-md btn-primary" role="button" title="Editar datos...">.
- Exportaciones/masivos detectados: /*$objPHPExcel->setActiveSheetIndex(0), //$objPHPExcel->setActiveSheetIndex(0);, //$objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel5');, <a href="venta_web/guias_despachos/lista_excel, ms-excel');, pdf");, php?n_guia= " class="btn btn-primary">Descargar en Excel.
- Búsquedas/filtros detectados: " autocomplete="off" onkeyup="consulta_rut_existe($('#rut'), "' and n_interno='$numero'");, "rut" : rut, $("#resultado_rut"), $ACTUALIZAR_N_ENTREGADOS = $mysqli->query("UPDATE productos_comprados_local SET n_entregados=cant where n_interno='$numero'");, $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET email='$email' where n_interno='$numero'");, $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET email='$email_bd' where n_interno='$numero'");, $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET email='' where n_interno='$numero'");, $ACTUALIZAR_SOLO_CANTIDAD = $mysqli->query("UPDATE productos_comprados_local SET cant=cant + $cant where n_interno='$numero' and codigo_interno='$codigo_interno, $ACTUALIZO_ORDEN_SISTEMA = $mysqli->query("UPDATE orden_compra_sistema SET estado_pago='No pagada' where n_interno='$numero'");.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/ordenes-compra`
- `backend/src/routes/productos/publicWeb.js`
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

- `venta_web\abonar_boleta\direcciona.php`
- `venta_web\abonar_boleta\guardar.php`
- `venta_web\abonar_boleta\guardar_voucher.php`
- `venta_web\abonar_boleta\index.php`
- `venta_web\abonar_boleta\paso2.php`
- `venta_web\abonar_boleta\request.php`
- `venta_web\abonar_boleta\voucher.php`
- `venta_web\abonar_factura\direcciona.php`
- `venta_web\abonar_factura\guardar.php`
- `venta_web\abonar_factura\guardar_voucher.php`
- `venta_web\abonar_factura\index.php`
- `venta_web\abonar_factura\index2.php`
- `venta_web\abonar_factura\paso2.php`
- `venta_web\abonar_factura\request.php`
- `venta_web\abonar_factura\voucher.php`
- `venta_web\activar\activar.php`
- `venta_web\activar\index.php`
- `venta_web\anular\anular.php`
- `venta_web\anular\index.php`
- `venta_web\boleta_electronica\guardar.php`
- `venta_web\boleta_electronica\index.php`
- `venta_web\boleta_electronica\paso2.php`
- `venta_web\boleta_manual\guardar.php`
- `venta_web\boleta_manual\index.php`
- `venta_web\boleta_manual\paso2.php`
- `venta_web\buscar_numero.php`
- `venta_web\clase_totales_ventas_web.php`
- `venta_web\cliente\acepta_elimina.php`
- `venta_web\cliente\actualizar.php`
- `venta_web\cliente\consultar_rut_existe.php`
- `venta_web\cliente\eliminar_cliente_enorden.php`
- `venta_web\cliente\guardar.php`
- `venta_web\cliente\index.php`
- `venta_web\cliente\insertar.php`
- `venta_web\cliente\modificar.php`
- `venta_web\cliente\nuevo.php`
- `venta_web\consulta_inserta_compra_web.php`
- `venta_web\consultar_codigo_barra_noexiste.php`
- `venta_web\consultar_codigo_interno_noexiste.php`
- `venta_web\consultar_existe_documento.php`
- `venta_web\consultar_pasa_stock_codbarra.php`
- `venta_web\consultar_pasa_stock_codinterno.php`
- `venta_web\crear_boleta\guardar.php`
- `venta_web\crear_boleta\index.php`
- `venta_web\crear_factura\guardar.php`
- `venta_web\crear_factura\index.php`
- `venta_web\crear_producto_especial\consultar_existe_codigointerno.php`
- `venta_web\crear_producto_especial\index.php`
- `venta_web\crear_producto_especial\insertar.php`
- `venta_web\crear_producto_especial\nuevo.php`
- `venta_web\crear_producto_especial\pasar_crear.php`
- `venta_web\elegir_tipo_abono.php`
- `venta_web\eliminar_items.php`
- `venta_web\guias_despachos\eliminar.php`
- `venta_web\guias_despachos\guardar.php`
- `venta_web\guias_despachos\index.php`
- `venta_web\guias_despachos\lista_excel.php`
- `venta_web\imprimir.php`
- `venta_web\lista_productos_comprados_web.php`
- `venta_web\menu_imprimir.php`
- `venta_web\modificar_entregados\actualizar.php`
- `venta_web\modificar_entregados\index.php`
- `venta_web\modificar_entregados_all\actualizar.php`
- `venta_web\modificar_entregados_all\index.php`
- `venta_web\modificar_producto\actualizar.php`
- `venta_web\modificar_producto\index.php`
- `venta_web\modificar_venta\actualizar.php`
- `venta_web\modificar_venta\index.php`
- `venta_web\nota_venta.php`
- `venta_web\odts\eliminar.php`
- `venta_web\odts\guardar.php`
- `venta_web\odts\guardar2.php`
- `venta_web\odts\index.php`
- `venta_web\odts\index2.php`
- `venta_web\pasa_get.php`
- `venta_web\subir_foto\index.php`
- `venta_web\subir_foto\subir.php`
- `venta_web\venta.php`
- `venta_web\voucher\guardar.php`
- `venta_web\voucher\index.php`
- ... 1 archivos PHP adicionales no listados aquí.

## Navegación legacy detectada

- `menu.php?pag=pasar_taller/index&numero=<?php echo $numero; ?>&origen=web&back=3`
- `menu.php?pag=venta_web/abonar_boleta/index&numero=<?php echo $numero; ?>&n_doc=<?php echo $registro_doc['n_doc']; ?>&id=<?php echo $registro_doc['id']`
- `menu.php?pag=venta_web/abonar_factura/index&numero=<?php echo $numero; ?>&n_doc=<?php echo $registro_doc['n_doc']; ?>&id=<?php echo $registro_doc['id'`
- `menu.php?pag=venta_web/activar/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_web/anular/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_web/cliente/acepta_elimina&numero=<?php echo $numero; ?>&email=<?php echo $email; ?>`
- `menu.php?pag=venta_web/cliente/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_web/cliente/modificar&numero=<?php echo $numero; ?>&id_cliente=<?php echo $id_cliente; ?>`
- `menu.php?pag=venta_web/crear_boleta/index&numero=<?php echo $numero; ?>&documento=Boleta Electronica`
- `menu.php?pag=venta_web/crear_boleta/index&numero=<?php echo $numero; ?>&documento=Boleta Manual`
- `menu.php?pag=venta_web/crear_factura/index&numero=<?php echo $numero; ?>&documento=Factura Laura`
- `menu.php?pag=venta_web/crear_factura/index&numero=<?php echo $numero; ?>&documento=Factura Plast`
- `menu.php?pag=venta_web/crear_factura/index&numero=<?php echo $numero; ?>&documento=NC Laura`
- `menu.php?pag=venta_web/crear_factura/index&numero=<?php echo $numero; ?>&documento=NC Plast`
- `menu.php?pag=venta_web/crear_factura/index&numero=<?php echo $numero; ?>&documento=ND Laura`
- `menu.php?pag=venta_web/crear_factura/index&numero=<?php echo $numero; ?>&documento=ND Plast`
- `menu.php?pag=venta_web/crear_producto_especial/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_web/elegir_tipo_abono&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_web/guias_despachos/index&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=venta_web/index`
- `menu.php?pag=venta_web/modificar_entregados/index&numero=<?php echo $numero; ?>&id=<?php echo $registro['id']; ?>`
- `menu.php?pag=venta_web/modificar_entregados_all/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_web/modificar_venta/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_web/odts/index&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=venta_web/subir_foto/index&id=<?php echo $id_producto; ?>&numero=<?php echo $numero; ?>`
