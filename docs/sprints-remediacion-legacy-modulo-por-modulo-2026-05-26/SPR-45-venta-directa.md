# SPR-45-venta-directa - venta_directa

Prioridad: **P0 - crítico operativo**
Dominio: **Comercial / Ventas**
Subagente especialista asignado: **Subagente Comercial-Ventas**
Estado actualizado: **Aprobado**
Estado: **Aprobado**

## Objetivo

Revisar y reparar el módulo `venta_directa` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/venta-directa.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-45-venta-directa.md`
- Evidencia legacy principal:
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

## Cómo se mostraba en legacy

- Legacy separaba flujos de boleta/factura, abonos, medios de pago, activación/anulación y devolución de stock/documentos.
- Plan: validar que Venta nueva cubra todos los documentos, pagos, abonos y anulación con los mismos efectos contables/stock.

Navegación legacy detectada:
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

## Cómo se muestra hoy

- `backend/src/routes/caja`
- `backend/src/routes/ventas`
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
- Ventas, pagos, documentos, anulaciones, NC/ND y estados mantienen consistencia con caja, stock y despacho.
- La matriz permite trabajar con la misma velocidad operativa del legacy.

## Seguridad, datos y permisos

- Validar permisos por tipo de venta, descuento, anulación, documentos y exportaciones.
- No permitir cambios de estado que rompan caja, stock, despacho u ODT sin transacción/auditoría.
- Asegurar trazabilidad de documentos, NC, ND, pagos y modificaciones de venta.

## Checklist de validación final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios mínimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integración cuando haya lógica de datos.
- [x] Probar flujo feliz, errores, permisos y estados borde con pruebas automatizadas.
- [x] Registrar evidencia: archivos modificados, comandos de prueba y resultado.
- [x] Validación final del lead: aprobado.

## Resultado de ejecución

- Implementación realizada: Ver resultado actualizado.
- Archivos modificados: Ver resultado actualizado.
- Pruebas ejecutadas: Ver resultado actualizado.
- Riesgos residuales: Ver resultado actualizado.

### Resultado actualizado 2026-05-26

- Implementacion realizada:
  - Stock inventariado de Venta Sala/Venta Directa queda transaccional al crear venta, reemplazar items, anular y reactivar.
  - Anulacion/reactivacion de venta reconcilia stock, documentos de caja, abono y estado de pago, bloqueando movimientos de caja en turnos cerrados.
  - Reactivacion restaura solo movimientos anulados por la anulacion de venta, sin resucitar pagos/documentos reversados previamente.
  - Ventas, cargos y entrega de items respetan `sucursalId` en listado, detalle, edicion, cargos y entregados.
  - Reportes/exportaciones de ventas y reporte gerencial de ventas respetan `sucursalId` y variantes legacy de Venta Sala/Venta Directa/Normal.
  - Caja incorpora documento referencial de venta (`Referencial`) para Factura/Boleta/NC/ND y sincroniza `estadoPagoDoc` al registrar, anular o reactivar pagos reales.
  - Los pagos de cobranza exigen documento referencial activo y saldo disponible del documento; `Referencial` no afecta `abono`.
  - La unicidad de documento referencial por `sucursal + documento + nDoc` queda serializada con `pg_advisory_xact_lock` transaccional y validacion case-insensitive.
  - UI de venta permite crear/ver documentos referenciales y pagos asociados desde la ficha de venta; Cobranza selecciona documentos referenciales activos para pagar.
  - Descuento, cargos e items quedan bloqueados cuando existen pagos o documentos de caja para proteger total, saldo, stock y trazabilidad.
  - Guardas de relacion (`resolveOrdenForWrite`/`resolveOdtForWrite`) consideran sucursal del usuario y permiten registros legacy sin sucursal.
- Archivos modificados:
  - `backend/src/routes/ventas/create.js`
  - `backend/src/routes/ventas/update.js`
  - `backend/src/routes/ventas/list.js`
  - `backend/src/routes/ventas/get.js`
  - `backend/src/routes/ventas/cargos.js`
  - `backend/src/routes/ventas/delete.js`
  - `backend/src/routes/ventas/stock.js`
  - `backend/src/routes/caja/movimientos.js`
  - `backend/src/routes/reportes/index.js`
  - `backend/src/routes/matriz-ventas/index.js`
  - `backend/src/routes/relation-guards.js`
  - `backend/src/routes/odts/create.js`
  - `backend/src/routes/odts/update.js`
  - `backend/src/routes/productos/movimientos.js`
  - `backend/test/ventas.test.js`
  - `backend/test/caja.test.js`
  - `backend/test/matriz-ventas.test.js`
  - `backend/test/reportes-gerenciales.test.js`
  - `frontend/src/api/caja.js`
  - `frontend/src/components/forms/ViewVentaPanel.jsx`
  - `frontend/src/pages/cobranza/CobranzaPage.jsx`
  - `frontend/src/pages/ventas/VentasFormPage.jsx`
- Pruebas ejecutadas:
  - `npm.cmd test -- ventas.test.js caja.test.js matriz-ventas.test.js reportes-gerenciales.test.js` -> 61 tests OK.
  - `npm.cmd test` en backend -> 37 archivos, 323 tests OK.
  - `npm.cmd run lint` en frontend -> OK.
  - `npm.cmd run build` en frontend -> OK, solo warning existente de chunk grande de Vite.
- Riesgos residuales:
  - La emision tributaria/SII real sigue fuera del alcance tecnico actual; se registra el documento referencial operativo igual que legacy, no se integra con proveedor SII externo.
  - Registros legacy sin `sucursalId` se mantienen con tolerancia en guardas de relacion puntuales para no bloquear datos historicos; ventas nuevas y reportes operativos quedan scopiados por sucursal.
- Validacion de subagentes:
  - Galileo: Aprobado sin P1/P2 tras correccion de documentos referenciales, scope, matriz, permisos y UI.
  - Anscombe: Aprobado sin P1/P2 tras correccion adicional de concurrencia (`FOR UPDATE`) y relectura transaccional de items.
  - Gauss: Aprobado sin P1/P2 tras cierre del P2 de concurrencia de unicidad referencial con advisory lock transaccional.
- Validacion del lead: Aprobado.
- Decision final: **Aprobado. Se puede continuar al siguiente sprint.**
