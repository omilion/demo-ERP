# Auditoría legacy vs nuevo - licitacion_venta

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\licitacion_venta`

Estado inicial: **Parcial por verificar**

Estado tras SPR-28: **P1 cerrado / aprobado**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: " class="btn btn-primary">Descargar en Excel, $ / Fecha /, $ / Fecha / Fact:, *************************************************************, --> Seleccione BANCO SANTANDER BANCO ESTADO, / N° / $, ABONO, Abonar, Abono, Atendido por, Banco, CANT., CODIGO, Cantidad, Cargo %, Ciudad / Comuna:, Comuna / Ciudad, Con cuanto Paga.
- Campos/formularios detectados: ' . $registro['codigo_interno'] . ', CHEQUE DIA, CHEQUE FECHA, Comuna:, Dirección:, Documento Asociado, E-Mail, EFECTIVO, Elije Cuotas?, Fecha, Fecha de la GUIA, Fono:, Giro:, MULTA, Modificar Stock, Monto, Nombre:, Nota de Crédito Referencial N°:.
- Botones/acciones detectadas: " />, " /> Fecha Monto Tipo de Documento: === SELECCIONE === SIN STOCK DESCUENTO ANULACION FACTURA CAMBIO RAZON SOCIAL INGRESA, " /> Paga $ Paga con $ Vuelto $ Medio de pago Cuotas: Ingresa datos del medio de pago: Banco Fecha de pago --> Seleccion, " class="btn btn-lg btn-danger btn-block" role="button"> ANULAR TODA LA VENTA, " class="btn btn-lg btn-danger btn-block" role="button"> INGRESAR MULTA, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Activación, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Anulación, " class="btn btn-lg btn-info btn-block" role="button">Volver a la venta, " class="btn btn-lg btn-primary btn-block" role="button"> Emitir documento de pago, " class="btn btn-lg btn-success btn-block" role="button" title="Editar datos..."> VER COTIZACION ID, " class="btn btn-lg btn-success btn-block" role="button"> Revertir a ACTIVA, " class="btn btn-md btn-primary" role="button" title="Editar datos...">, " class="btn btn-sm btn-primary" role="button" title="Actualizar todos a entregados"> Actualizar todos a entregados, "> ...Abonare después, "> ...Cancelar esta operación, "> ...Volver a la Venta, "> Guia Fecha " class="btn btn-primary">Descargar en Excel, &amp;documento=Factura Laura" class="btn btn-lg btn-primary" role="button"> Factura Laura Navarro.
- Exportaciones/masivos detectados: /*$objPHPExcel->setActiveSheetIndex(0), //$objPHPExcel->setActiveSheetIndex(0);, //$objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel5');, <a href="licitacion_venta/guias_despachos/lista_excel, ms-excel');, pdf");, php?n_guia= " class="btn btn-primary">Descargar en Excel.
- Búsquedas/filtros detectados: "' and n_interno='$numero'");, $ACTUALIZAR_N_ENTREGADOS = $mysqli->query("UPDATE productos_comprados_local SET n_entregados=cant where n_interno='$numero'");, $ACTUALIZO_PAGO_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET estado_pago='Pagada' where n_interno='$numero' and sucursal='$sucursal'");, $ACTUALIZO_PAGO_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET estado_pago='Pagada' where n_interno='$numero'");, $anulo_documentos = $mysqli->query("UPDATE caja SET estado_doc='Activa' where n_interno='$numero' and sucursal='$sucursal'");, $anulo_documentos = $mysqli->query("UPDATE caja SET estado_doc='Nula' where n_interno='$numero' and sucursal='$sucursal'");, $anulo_documentos = $mysqli->query("UPDATE orden_compra_sistema SET estado='Activa',estado_pago='$estado_pago' where n_interno='$numero' and sucursal='$sucursal, $anulo_documentos = $mysqli->query("UPDATE orden_compra_sistema SET estado='Nula',estado_pago='No pagada' where n_interno='$numero' and sucursal='$sucursal'");, $consulta = $mysqli->query("SELECT * FROM orden_compra_sistema where n_interno='$numero' and tipo='Licitacion' and sucursal='$sucursal'");, $consulta = $mysqli->query("SELECT * FROM orden_compra_sistema where n_interno='$numero'");.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/cotizaciones`
- `backend/src/routes/ventas`
- `frontend/src/pages/licitaciones`
- `frontend/src/pages/ventas`

## Cierre SPR-28

Brechas P1 cerradas:

- Saldo y estado de pago: la plataforma nueva calcula venta con `total - abono - NC - ND - multas`, alineado con la lectura legacy de `clase_totales_ventas_licitacion.php`.
- Multas: crear, editar o eliminar una multa sincroniza el estado financiero de la venta.
- Documentos de venta: se agrega fecha de emisión en backend/UI y opción `NC Inter Plast`.
- Actualización de venta desde licitación: bloqueada si existen pagos/documentos de caja, entregas, despachos o guías.
- Items de cotización: validación estricta contra `NaN`, negativos, cantidad cero y adjudicados mayores a cantidad, incluyendo updates parciales.
- Permisos: licitaciones opera bajo `licitaciones.*`; pasar/actualizar a venta exige también `ventas.write`; el detalle de licitación no expone datos de venta/caja/despacho sin `ventas.read`.

Evidencia nueva:

- `backend/src/routes/ventas/financial.js`
- `backend/src/routes/caja/movimientos.js`
- `backend/src/routes/multas/index.js`
- `backend/src/routes/cotizaciones/index.js`
- `backend/src/routes/ventas/list.js`
- `backend/src/routes/ventas/get.js`
- `frontend/src/pages/ventas/VentasFormPage.jsx`
- `backend/test/ventas.test.js`

Validación:

- `vitest run ventas.test.js` -> **42/42 OK**.
- `npm.cmd run test:ci` backend -> **109/109 OK**.
- `npm.cmd run lint` frontend -> **OK**.
- `npm.cmd run build` frontend -> **OK**.

Pendiente P2 documentado, no bloqueante para cierre P1:

- Botón masivo legacy `Actualizar todos a entregados`.
- Exportaciones específicas legacy de guías/comprobantes cuando se aborde el sprint de reportes/exportaciones.

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

- `licitacion_venta\abonar_factura\guardar.php`
- `licitacion_venta\abonar_factura\guardar2.php`
- `licitacion_venta\abonar_factura\index.php`
- `licitacion_venta\abonar_factura\index2.php`
- `licitacion_venta\abonar_factura\paso2.php`
- `licitacion_venta\activar\activar.php`
- `licitacion_venta\activar\index.php`
- `licitacion_venta\anular\anular.php`
- `licitacion_venta\anular\index.php`
- `licitacion_venta\buscar_numero.php`
- `licitacion_venta\clase_totales_ventas_licitacion.php`
- `licitacion_venta\clase_totales_ventas_licitacion2.php`
- `licitacion_venta\clase_totales_ventas_licitacion3.php`
- `licitacion_venta\cliente\actualizar.php`
- `licitacion_venta\cliente\consultar_email_existe.php`
- `licitacion_venta\cliente\modificar.php`
- `licitacion_venta\consultar_existe_documento.php`
- `licitacion_venta\crear_factura\guardar.php`
- `licitacion_venta\crear_factura\index.php`
- `licitacion_venta\elegir_tipo_abono.php`
- `licitacion_venta\elegir_tipo_abono2.php`
- `licitacion_venta\guias_despachos\eliminar.php`
- `licitacion_venta\guias_despachos\guardar.php`
- `licitacion_venta\guias_despachos\index.php`
- `licitacion_venta\guias_despachos\lista_excel.php`
- `licitacion_venta\imprimir.php`
- `licitacion_venta\index.php`
- `licitacion_venta\lista_productos_comprados.php`
- `licitacion_venta\lista_productos_comprados2.php`
- `licitacion_venta\lista_productos_comprados3.php`
- `licitacion_venta\menu_imprimir.php`
- `licitacion_venta\modificar_entregados\actualizar.php`
- `licitacion_venta\modificar_entregados\index.php`
- `licitacion_venta\modificar_entregados_all\actualizar.php`
- `licitacion_venta\modificar_entregados_all\index.php`
- `licitacion_venta\modificar_venta\actualizar.php`
- `licitacion_venta\modificar_venta\index.php`
- `licitacion_venta\multa\guardar.php`
- `licitacion_venta\multa\index.php`
- `licitacion_venta\nota_venta.php`
- `licitacion_venta\odts\eliminar.php`
- `licitacion_venta\odts\guardar.php`
- `licitacion_venta\odts\guardar2.php`
- `licitacion_venta\odts\index.php`
- `licitacion_venta\odts\index2.php`
- `licitacion_venta\pasa_get.php`
- `licitacion_venta\subir_foto\index.php`
- `licitacion_venta\subir_foto\subir.php`
- `licitacion_venta\venta.php`
- `licitacion_venta\venta2.php`

## Navegación legacy detectada

- `menu.php?pag=cotizar_licitacion/cotizacion_licitacion&id_licitacion=<?php echo $id_licitacion; ?>`
- `menu.php?pag=licitacion_venta/abonar_factura/index&numero=<?php echo $numero; ?>&n_doc=<?php echo $registro_doc['n_doc']; ?>&id=<?php echo $registro_d`
- `menu.php?pag=licitacion_venta/activar/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=licitacion_venta/anular/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=licitacion_venta/cliente/modificar&numero=<?php echo $numero; ?>&id_cliente=<?php echo $id_cliente; ?>`
- `menu.php?pag=licitacion_venta/crear_factura/index&amp;numero=<?php echo $numero; ?>&amp;documento=Factura Laura`
- `menu.php?pag=licitacion_venta/crear_factura/index&amp;numero=<?php echo $numero; ?>&amp;documento=Factura Plast`
- `menu.php?pag=licitacion_venta/crear_factura/index&numero=<?php echo $numero; ?>&documento=NC Inter Plast`
- `menu.php?pag=licitacion_venta/crear_factura/index&numero=<?php echo $numero; ?>&documento=NC Laura`
- `menu.php?pag=licitacion_venta/crear_factura/index&numero=<?php echo $numero; ?>&documento=NC Plast`
- `menu.php?pag=licitacion_venta/crear_factura/index&numero=<?php echo $numero; ?>&documento=ND Laura`
- `menu.php?pag=licitacion_venta/crear_factura/index&numero=<?php echo $numero; ?>&documento=ND Plast`
- `menu.php?pag=licitacion_venta/elegir_tipo_abono&numero=<?php echo $numero; ?>`
- `menu.php?pag=licitacion_venta/guias_despachos/index&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=licitacion_venta/modificar_entregados/index&numero=<?php echo $numero; ?>&id=<?php echo $registro['id']; ?>`
- `menu.php?pag=licitacion_venta/modificar_entregados_all/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=licitacion_venta/modificar_venta/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=licitacion_venta/multa/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=licitacion_venta/multa/index&numero=<?php echo $numero; ?>&saldo=<?php echo $saldo; ?>`
- `menu.php?pag=licitacion_venta/odts/index&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=licitacion_venta/subir_foto/index&id=<?php echo $id_producto; ?>&numero=<?php echo $numero; ?>`
- `menu.php?pag=licitacion_venta/venta&numero=<?php echo $numero; ?>`
- `menu.php?pag=licitacion_venta/venta&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=licitacion_venta/venta&numero=<?php echo $numero; ?>&back=<?php echo $back; ?>`
- `menu.php?pag=pasar_taller/index&numero=<?php echo $numero; ?>&origen=licitacion&back=3`
