# Auditoría legacy vs nuevo - venta_directa

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_directa`

Estado inicial: **Parcial por verificar**
Estado actualizado: **SPR-45 aprobado**

## Estado posterior a SPR-45

| Area legacy | Estado nuevo | Evidencia |
| --- | --- | --- |
| Stock al agregar/quitar/anular/activar Venta Sala | Resuelto | Backend descuenta/devuelve stock inventariado y crea `MovimientoBodega` en crear, editar items, anular y activar. |
| Scope por sucursal | Resuelto | Listado, detalle, edicion, cargos y entregados de venta respetan `sucursalId`; guardas de relacion aplican sucursal con tolerancia a datos legacy sin sucursal. |
| Documentos Factura/Boleta/NC/ND referenciales | Resuelto operativo | Caja permite crear documento referencial por venta, sincroniza `estadoPagoDoc` con pagos reales contra `documento + nDoc` y serializa unicidad por sucursal/documento con advisory lock transaccional. |
| Pagos de cobranza | Resuelto | Todo pago exige documento referencial activo y saldo disponible; los movimientos `Referencial` no modifican `abono`. |
| Anulacion/reactivacion | Resuelto | Anular/reactivar reconcilia documentos de caja, stock, abono y estado de pago; bloquea movimientos en turnos cerrados y no restaura movimientos reversados antes de la anulacion. |
| UI de venta/cobranza | Resuelto | Ficha de venta permite crear/ver documentos referenciales y pagos asociados; Cobranza paga seleccionando documentos referenciales activos. |
| Reportes y matriz | Resuelto | Export ventas y reporte gerencial aplican sucursal; Matriz calcula facturado desde documentos referenciales de Caja. |
| Proteccion de trazabilidad | Resuelto | Items, tipo, descuento y cargos quedan bloqueados si existen pagos o documentos de caja. |
| Emision SII real | Fuera de alcance actual | El sprint replica el registro operacional legacy; integracion externa SII/proveedor tributario requiere alcance separado. |

Pruebas: `npm.cmd test -- ventas.test.js caja.test.js matriz-ventas.test.js reportes-gerenciales.test.js` OK (61), `npm.cmd test` backend OK (37 archivos / 323), `npm.cmd run lint` frontend OK, `npm.cmd run build` frontend OK.

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Legacy separaba flujos de boleta/factura, abonos, medios de pago, activación/anulación y devolución de stock/documentos.
- Plan: validar que Venta nueva cubra todos los documentos, pagos, abonos y anulación con los mismos efectos contables/stock.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/caja`
- `backend/src/routes/ventas`
- `frontend/src/pages/ventas`

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

- `venta_directa\abonar_boleta\direcciona.php`
- `venta_directa\abonar_boleta\direcciona2.php`
- `venta_directa\abonar_boleta\guardar.php`
- `venta_directa\abonar_boleta\guardar_voucher.php`
- `venta_directa\abonar_boleta\guardar_voucher2.php`
- `venta_directa\abonar_boleta\index.php`
- `venta_directa\abonar_boleta\index2.php`
- `venta_directa\abonar_boleta\paso2.php`
- `venta_directa\abonar_boleta\paso3.php`
- `venta_directa\abonar_boleta\request.php`
- `venta_directa\abonar_boleta\voucher.php`
- `venta_directa\abonar_factura\direcciona.php`
- `venta_directa\abonar_factura\direcciona2.php`
- `venta_directa\abonar_factura\guardar.php`
- `venta_directa\abonar_factura\guardar2.php`
- `venta_directa\abonar_factura\guardar_voucher.php`
- `venta_directa\abonar_factura\index.php`
- `venta_directa\abonar_factura\index2.php`
- `venta_directa\abonar_factura\paso2.php`
- `venta_directa\abonar_factura\paso3.php`
- `venta_directa\abonar_factura\request.php`
- `venta_directa\abonar_factura\voucher.php`
- `venta_directa\activar\activar.php`
- `venta_directa\activar\index.php`
- `venta_directa\anular\anular.php`
- `venta_directa\anular\index.php`
- `venta_directa\boleta_electronica\guardar.php`
- `venta_directa\boleta_electronica\index.php`
- `venta_directa\boleta_electronica\paso2.php`
- `venta_directa\boleta_manual\guardar.php`
- `venta_directa\boleta_manual\index.php`
- `venta_directa\boleta_manual\paso2.php`
- `venta_directa\buscar_numero.php`
- `venta_directa\clase_totales_ventas.php`
- `venta_directa\cliente\acepta_elimina.php`
- `venta_directa\cliente\actualizar.php`
- `venta_directa\cliente\consultar_email_existe.php`
- `venta_directa\cliente\eliminar_cliente_enorden.php`
- `venta_directa\cliente\guardar.php`
- `venta_directa\cliente\index.php`
- `venta_directa\cliente\insertar.php`
- `venta_directa\cliente\modificar.php`
- `venta_directa\cliente\nuevo.php`
- `venta_directa\consulta_inserta_compra.php`
- `venta_directa\consultar_codigo_barra_noexiste.php`
- `venta_directa\consultar_codigo_interno_noexiste.php`
- `venta_directa\consultar_existe_documento.php`
- `venta_directa\consultar_pasa_stock_codbarra.php`
- `venta_directa\consultar_pasa_stock_codinterno.php`
- `venta_directa\crear_boleta\guardar.php`
- `venta_directa\crear_boleta\index.php`
- `venta_directa\crear_factura\guardar.php`
- `venta_directa\crear_factura\index.php`
- `venta_directa\crear_numero_interno.php`
- `venta_directa\crear_producto_especial\consultar_existe_codigointerno.php`
- `venta_directa\crear_producto_especial\index.php`
- `venta_directa\crear_producto_especial\insertar.php`
- `venta_directa\crear_producto_especial\nuevo.php`
- `venta_directa\crear_producto_especial\pasar_crear.php`
- `venta_directa\crear_producto_externo\consultar_existe_codigointerno.php`
- `venta_directa\crear_producto_externo\index.php`
- `venta_directa\crear_producto_externo\insertar.php`
- `venta_directa\crear_producto_externo\nuevo.php`
- `venta_directa\crear_producto_externo\pasar_crear.php`
- `venta_directa\elegir_tipo_abono.php`
- `venta_directa\eliminar_items.php`
- `venta_directa\formulario_resta.php`
- `venta_directa\formulario_suma.php`
- `venta_directa\guias_despachos\eliminar.php`
- `venta_directa\guias_despachos\guardar.php`
- `venta_directa\guias_despachos\index.php`
- `venta_directa\guias_despachos\lista_excel.php`
- `venta_directa\imprimir.php`
- `venta_directa\index.php`
- `venta_directa\inserta_cargo_transporte.php`
- `venta_directa\inserta_descuento_venta.php`
- `venta_directa\insertar_resta.php`
- `venta_directa\insertar_suma.php`
- `venta_directa\lista_cargo_transporte.php`
- `venta_directa\lista_productos_comprados.php`
- ... 20 archivos PHP adicionales no listados aquí.

## Navegación legacy detectada

- `menu.php?pag=pasar_taller/index&numero=<?php echo $numero; ?>&origen=sala&back=3`
- `menu.php?pag=venta_directa/abonar_boleta/index&numero=<?php echo $numero; ?>&n_doc=<?php echo $registro_doc['n_doc']; ?>&id=<?php echo $registro_doc['`
- `menu.php?pag=venta_directa/abonar_factura/index&numero=<?php echo $numero; ?>&n_doc=<?php echo $registro_doc['n_doc']; ?>&id=<?php echo $registro_doc[`
- `menu.php?pag=venta_directa/activar/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_directa/anular/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_directa/boleta_electronica/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_directa/boleta_manual/index&numero=<?php echo $numero; ?>&back=4`
- `menu.php?pag=venta_directa/cliente/acepta_elimina&numero=<?php echo $numero; ?>&rut=<?php echo $rut; ?>`
- `menu.php?pag=venta_directa/cliente/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_directa/cliente/modificar&numero=<?php echo $numero; ?>&id_cliente=<?php echo $id_cliente; ?>`
- `menu.php?pag=venta_directa/crear_boleta/index&numero=<?php echo $numero; ?>&documento=Boleta Electronica`
- `menu.php?pag=venta_directa/crear_factura/index&numero=<?php echo $numero; ?>&documento=Factura Laura`
- `menu.php?pag=venta_directa/crear_factura/index&numero=<?php echo $numero; ?>&documento=Factura Plast`
- `menu.php?pag=venta_directa/crear_factura/index&numero=<?php echo $numero; ?>&documento=NC Laura`
- `menu.php?pag=venta_directa/crear_factura/index&numero=<?php echo $numero; ?>&documento=NC Plast`
- `menu.php?pag=venta_directa/crear_factura/index&numero=<?php echo $numero; ?>&documento=ND Laura`
- `menu.php?pag=venta_directa/crear_factura/index&numero=<?php echo $numero; ?>&documento=ND Plast`
- `menu.php?pag=venta_directa/crear_producto_especial/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_directa/crear_producto_externo/index&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_directa/elegir_tipo_abono&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_directa/elegir_tipo_abono&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=venta_directa/elegir_tipo_abono&numero=<?php echo $numero; ?>&back=<?php echo $back; ?>`
- `menu.php?pag=venta_directa/formulario_resta&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_directa/formulario_suma&numero=<?php echo $numero; ?>`
- `menu.php?pag=venta_directa/guias_despachos/index&numero=<?php echo $numero; ?>&back=3`
