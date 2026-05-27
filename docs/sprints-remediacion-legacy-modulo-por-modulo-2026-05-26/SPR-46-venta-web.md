# SPR-46-venta-web - venta_web

Prioridad: **P1 - crítico funcional**
Dominio: **Comercial / Ventas**
Subagente especialista asignado: **Subagente Comercial-Ventas**
Estado: **Pendiente de ejecución**

## Objetivo

Revisar y reparar el módulo `venta_web` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/venta-web.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-46-venta-web.md`
- Evidencia legacy principal:
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

## Cómo se mostraba en legacy

- Tablas/columnas detectadas: " class="btn btn-primary">Descargar en Excel, *************************************************************, --> Seleccione BANCO SANTANDER BANCO ESTADO, / N° / $, ABONO, Abonar Abonar, Abono, Atendido por, Banco, Boleta Electrónica, Boleta Manual, CANT., CODIGO, Cantidad, Ciudad / Comuna:, Comuna / Ciudad, Con cuanto Paga, Contacto:.
- Campos/formularios detectados: '.$registro['codigo_interno'].', CHEQUE DIA, CHEQUE FECHA, Cantidad:, Categoria:, Comuna:, Código de barra o código Interno:, Detalle o descripción:, Dirección:, E-Mail:, EFECTIVO, Elije Cuotas?, Fecha, Fecha de boleta, Fecha de la GUIA, Fono:, Giro:, MULTA.
- Botones/acciones detectadas: " />, " /> EFECTIVO CHEQUE DIA CHEQUE FECHA TRANSFERENCIA 2) INGRESA PAGO PAGO $ Con cuanto Paga Su Vuelto es Continuar, " /> Fecha Monto Tipo de Documento: === SELECCIONE === SIN STOCK DESCUENTO ANULACION FACTURA CAMBIO RAZON SOCIAL INGRESA, " /> Fecha de boleta Monto boleta Stock N°: Nota de Crédito Referencial N°: CREAR DOCUMENTO, " /> Paga $ Paga con $ Vuelto $ Medio de pago Cuotas: Ingresa datos del medio de pago: Banco N° documento --> Fecha de p, " /> Paga $ Paga con $ Vuelto $ Medio de pago Cuotas: Ingresa datos del medio de pago: Banco N° documento FINALIZAR PAGO, " /> Paga o Abona $ Medio de pago Cuotas: N°: FINALIZAR PAGO, " /> Paga o Abona $ Medio de pago Ingresa datos del medio de pago: Banco N° documento N°: FINALIZAR PAGO, " /> TARJETA DEBITO TARJETA CREDITO Elije Cuotas? 1 4 2) INGRESA PAGO TOTAL O ABONO Continuar, " class="btn btn-lg btn-danger btn-block" role="button"> ANULAR TODA LA VENTA, " class="btn btn-lg btn-danger btn-block" role="button">Acepto, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Activación, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Anulación, " class="btn btn-lg btn-info btn-block" role="button">Volver a la venta, " class="btn btn-lg btn-primary btn-block" role="button"> Emitir documento de pago, " class="btn btn-lg btn-success btn-block" role="button"> Revertir a ACTIVA, " class="btn btn-lg btn-warning" role="button"> Voucher, " class="btn btn-md btn-primary" role="button" title="Editar datos...">.
- Exportaciones/masivos detectados: /*$objPHPExcel->setActiveSheetIndex(0), //$objPHPExcel->setActiveSheetIndex(0);, //$objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel5');, <a href="venta_web/guias_despachos/lista_excel, ms-excel');, pdf");, php?n_guia= " class="btn btn-primary">Descargar en Excel.
- Búsquedas/filtros detectados: " autocomplete="off" onkeyup="consulta_rut_existe($('#rut'), "' and n_interno='$numero'");, "rut" : rut, $("#resultado_rut"), $ACTUALIZAR_N_ENTREGADOS = $mysqli->query("UPDATE productos_comprados_local SET n_entregados=cant where n_interno='$numero'");, $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET email='$email' where n_interno='$numero'");, $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET email='$email_bd' where n_interno='$numero'");, $ACTUALIZAR_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET email='' where n_interno='$numero'");, $ACTUALIZAR_SOLO_CANTIDAD = $mysqli->query("UPDATE productos_comprados_local SET cant=cant + $cant where n_interno='$numero' and codigo_interno='$codigo_interno, $ACTUALIZO_ORDEN_SISTEMA = $mysqli->query("UPDATE orden_compra_sistema SET estado_pago='No pagada' where n_interno='$numero'");.

Navegación legacy detectada:
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

## Cómo se muestra hoy

- `backend/src/routes/ordenes-compra`
- `backend/src/routes/productos/publicWeb.js`
- `frontend/src/pages/ordenes-compra`

## Funciones a revisar por el subagente

- Pantallas principales y pantallas auxiliares del módulo legacy.
- Formularios, campos obligatorios, selects, autocompletados y validaciones.
- Tablas, columnas, orden, colores/estados visuales y densidad.
- Botones, acciones, doble click, navegación y accesos directos.
- Búsquedas, filtros simples, filtros múltiples y estado por defecto.
- Exportaciones Excel/PDF, importaciones masivas y plantillas.
- Efectos secundarios: stock, caja, ventas, documentos, taller, despacho, auditoría.

## Brechas iniciales

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

## Criterios de aceptación

- Cada pantalla o flujo legacy relevante tiene equivalente nuevo, reemplazo aprobado o descarte explícito documentado.
- La UI nueva muestra los campos/columnas/filtros legacy requeridos por operación diaria.
- Las acciones críticas tienen permisos, validaciones, mensajes de error y auditoría.
- Las exportaciones/importaciones legacy existentes quedan replicadas o reemplazadas por una alternativa acordada.
- La funcionalidad se valida con datos reales y no rompe módulos relacionados.
- Ventas, pagos, documentos, anulaciones, NC/ND y estados mantienen consistencia con caja, stock y despacho.
- La matriz permite trabajar con la misma velocidad operativa del legacy.

## Seguridad, datos y permisos

- Validar permisos por tipo de venta, descuento, anulación, documentos y exportaciones.
- No permitir cambios de estado que rompan caja, stock, despacho u ODT sin transacción/auditoría.
- Asegurar trazabilidad de documentos, NC, ND, pagos y modificaciones de venta.

## Checklist de validación final

- [ ] Revisar archivo legacy y anotar comportamiento exacto.
- [ ] Revisar pantalla/API nueva equivalente.
- [ ] Implementar brechas con cambios mínimos y trazables.
- [ ] Agregar o actualizar pruebas unitarias/integración cuando haya lógica de datos.
- [ ] Probar manualmente flujo feliz, errores, permisos y estados borde.
- [ ] Registrar evidencia: archivos modificados, capturas si aplica, comandos de prueba y resultado.
- [ ] Validación final del lead: aprobar, aprobar con observaciones o rechazar.

## Resultado de ejecución

- Implementación realizada: Pendiente.
- Archivos modificados: Pendiente.
- Pruebas ejecutadas: Pendiente.
- Riesgos residuales: Pendiente.
- Validación del lead: Pendiente.
- Decisión final: Pendiente.
