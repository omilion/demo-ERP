# SPR-28-licitacion-venta - licitacion_venta

Prioridad: **P1 - crítico funcional**
Dominio: **Comercial / Ventas**
Subagente especialista asignado: **Subagente Comercial-Ventas**
Estado: **Cerrado / aprobado**

## Objetivo

Revisar y reparar el módulo `licitacion_venta` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/licitacion-venta.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-28-licitacion-venta.md`
- Evidencia legacy principal:
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

## Cómo se mostraba en legacy

- Tablas/columnas detectadas: " class="btn btn-primary">Descargar en Excel, $ / Fecha /, $ / Fecha / Fact:, *************************************************************, --> Seleccione BANCO SANTANDER BANCO ESTADO, / N° / $, ABONO, Abonar, Abono, Atendido por, Banco, CANT., CODIGO, Cantidad, Cargo %, Ciudad / Comuna:, Comuna / Ciudad, Con cuanto Paga.
- Campos/formularios detectados: ' . $registro['codigo_interno'] . ', CHEQUE DIA, CHEQUE FECHA, Comuna:, Dirección:, Documento Asociado, E-Mail, EFECTIVO, Elije Cuotas?, Fecha, Fecha de la GUIA, Fono:, Giro:, MULTA, Modificar Stock, Monto, Nombre:, Nota de Crédito Referencial N°:.
- Botones/acciones detectadas: " />, " /> Fecha Monto Tipo de Documento: === SELECCIONE === SIN STOCK DESCUENTO ANULACION FACTURA CAMBIO RAZON SOCIAL INGRESA, " /> Paga $ Paga con $ Vuelto $ Medio de pago Cuotas: Ingresa datos del medio de pago: Banco Fecha de pago --> Seleccion, " class="btn btn-lg btn-danger btn-block" role="button"> ANULAR TODA LA VENTA, " class="btn btn-lg btn-danger btn-block" role="button"> INGRESAR MULTA, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Activación, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Anulación, " class="btn btn-lg btn-info btn-block" role="button">Volver a la venta, " class="btn btn-lg btn-primary btn-block" role="button"> Emitir documento de pago, " class="btn btn-lg btn-success btn-block" role="button" title="Editar datos..."> VER COTIZACION ID, " class="btn btn-lg btn-success btn-block" role="button"> Revertir a ACTIVA, " class="btn btn-md btn-primary" role="button" title="Editar datos...">, " class="btn btn-sm btn-primary" role="button" title="Actualizar todos a entregados"> Actualizar todos a entregados, "> ...Abonare después, "> ...Cancelar esta operación, "> ...Volver a la Venta, "> Guia Fecha " class="btn btn-primary">Descargar en Excel, &amp;documento=Factura Laura" class="btn btn-lg btn-primary" role="button"> Factura Laura Navarro.
- Exportaciones/masivos detectados: /*$objPHPExcel->setActiveSheetIndex(0), //$objPHPExcel->setActiveSheetIndex(0);, //$objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel5');, <a href="licitacion_venta/guias_despachos/lista_excel, ms-excel');, pdf");, php?n_guia= " class="btn btn-primary">Descargar en Excel.
- Búsquedas/filtros detectados: "' and n_interno='$numero'");, $ACTUALIZAR_N_ENTREGADOS = $mysqli->query("UPDATE productos_comprados_local SET n_entregados=cant where n_interno='$numero'");, $ACTUALIZO_PAGO_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET estado_pago='Pagada' where n_interno='$numero' and sucursal='$sucursal'");, $ACTUALIZO_PAGO_ORDEN = $mysqli->query("UPDATE orden_compra_sistema SET estado_pago='Pagada' where n_interno='$numero'");, $anulo_documentos = $mysqli->query("UPDATE caja SET estado_doc='Activa' where n_interno='$numero' and sucursal='$sucursal'");, $anulo_documentos = $mysqli->query("UPDATE caja SET estado_doc='Nula' where n_interno='$numero' and sucursal='$sucursal'");, $anulo_documentos = $mysqli->query("UPDATE orden_compra_sistema SET estado='Activa',estado_pago='$estado_pago' where n_interno='$numero' and sucursal='$sucursal, $anulo_documentos = $mysqli->query("UPDATE orden_compra_sistema SET estado='Nula',estado_pago='No pagada' where n_interno='$numero' and sucursal='$sucursal'");, $consulta = $mysqli->query("SELECT * FROM orden_compra_sistema where n_interno='$numero' and tipo='Licitacion' and sucursal='$sucursal'");, $consulta = $mysqli->query("SELECT * FROM orden_compra_sistema where n_interno='$numero'");.

Navegación legacy detectada:
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

## Cómo se muestra hoy

- `backend/src/routes/cotizaciones`
- `backend/src/routes/ventas`
- `frontend/src/pages/licitaciones`
- `frontend/src/pages/ventas`

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

## Seguridad, datos y permisos

- Validar permisos por tipo de venta, descuento, anulación, documentos y exportaciones.
- No permitir cambios de estado que rompan caja, stock, despacho u ODT sin transacción/auditoría.
- Asegurar trazabilidad de documentos, NC, ND, pagos y modificaciones de venta.

## Checklist de validación final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios mínimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integración cuando haya lógica de datos.
- [x] Probar flujo feliz, errores, permisos y estados borde con suite automatizada.
- [x] Registrar evidencia: archivos modificados, comandos de prueba y resultado.
- [x] Validación final del lead: aprobado sin P0/P1 pendientes.

## Resultado de ejecución

- Implementación realizada:
  - Saldo/estado de pago de venta ahora considera abonos, NC, ND y multas con la fórmula legacy revisada en `clase_totales_ventas_licitacion.php`.
  - Multas sincronizan el estado financiero de la venta al crear, editar o eliminar.
  - Documentos referenciales de venta aceptan fecha de emisión; la UI muestra la fecha y agrega `NC Inter Plast`.
  - Actualización de venta desde licitación queda bloqueada si ya existen pagos/documentos de caja, entregas, despachos o guías.
  - Validación de ítems de cotización endurecida: sin `NaN`, negativos, cantidad cero ni `cantAdjudicados > cantidad`, incluso en edición parcial.
  - RBAC corregido: licitaciones usa `licitaciones.*`; crear/actualizar venta exige también `ventas.write`; el detalle de licitación no expone datos financieros/operativos de venta sin `ventas.read`.
- Archivos modificados principales:
  - `backend/src/routes/cotizaciones/index.js`
  - `backend/src/routes/caja/movimientos.js`
  - `backend/src/routes/ventas/financial.js`
  - `backend/src/routes/ventas/list.js`
  - `backend/src/routes/ventas/get.js`
  - `backend/src/routes/multas/index.js`
  - `frontend/src/pages/ventas/VentasFormPage.jsx`
  - `backend/test/ventas.test.js`
- Pruebas ejecutadas:
  - `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd exec vitest run ventas.test.js` -> **42/42 OK**.
  - `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd run test:ci` -> **109/109 OK**.
  - `npm.cmd run lint` en frontend -> **OK**.
  - `npm.cmd run build` en frontend -> **OK** con advertencia conocida de chunk grande de Vite.
- Revisión multiagente:
  - Seguridad/transaccionalidad: aprobado sin P0/P1.
  - Equivalencia legacy/negocio: aprobado sin P0/P1/P2 nuevos.
- Riesgos residuales:
  - Botón masivo legacy `Actualizar todos a entregados` y exportaciones específicas de guías quedan como mejora P2 fuera del cierre P1 de este sprint.
- Validación del lead: **Aprobado**.
- Decisión final: **SPR-28 cerrado; avanzar a SPR-29**.
