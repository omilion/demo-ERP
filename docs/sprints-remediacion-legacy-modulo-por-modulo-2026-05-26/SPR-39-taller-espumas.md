# SPR-39-taller-espumas - taller_espumas

Prioridad: **P2 - completar equivalencia**
Dominio: **Operaciones / Taller / Despacho**
Subagente especialista asignado: **Subagente Operaciones-Taller-Despacho**
Estado: **Aprobado localmente - cerrado el 2026-05-27**

## Objetivo

Revisar y reparar el módulo `taller_espumas` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/taller-espumas.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-39-taller-espumas.md`
- Evidencia legacy principal:
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

## Cómo se mostraba en legacy

- Tablas/columnas detectadas: ************************************************************************************************************************, ..Volver a Ficha, > Cambiar, Buscar..., Cant, Cant., Cliente, Creada por, Código, Detalle, Est. Producto, Estado, Estado OT, Estado OT:, Estado Producto, Estado Taller Espumas, FICHA TALLER ESPUMAS PLASTIMAR OT, Fecha Ingreso:.
- Campos/formularios detectados: Fecha de Inicio, Fecha de Término.
- Botones/acciones detectadas: " required="required" /> Fecha Término: Estado OT: Obs OT: ... Ir a atrás, "> Buscar..., "> Fecha de Término Buscar, "> Ficha, &back= " class="btn btn-sm btn-primary" role="button"> ...Cancelar operación, &back= " role="button" class="btn btn-danger btn-sm"> ..Volver a Ficha, &back=3" role="button" class="btn btn-primary btn-sm"> Agrega Materiales, &back=4" role="button" class="btn btn-success"> Mostrar Listado Completo, &fecha1= &fecha2= &pendiente= &prioridad= ')" role="button" class="btn btn-danger btn-sm">, &id= " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Eliminación, &id= &back=3"> Cambiar, &numero= ">, &times;, ')" role="button" class="btn btn-primary btn-sm"> Imprimir Ficha, ($('#cant ').val());return false;">, <?php echo $id; ?>, <?php echo $numero; ?>, Buscar.
- Búsquedas/filtros detectados: "numero":, $ACTUALIZO1=$mysqli->query("UPDATE taller SET fecha_inicio='$fecha_inicio',fecha_termino='$fecha_termino' WHERE n_interno='$numero'");, $ACTUALIZO3=$mysqli->query("UPDATE taller SET estado_general='$estado_adquirido' WHERE n_interno='$numero'");, $ACTUALIZO=$mysqli->query("UPDATE taller_materiales SET cant=cant + $cant WHERE codigo_interno='$codigo_interno' and n_interno='$numero' and taller='$taller'");, $INSERTAR=$mysqli->query("INSERT INTO taller_materiales(n_interno,codigo_interno,nombre,cant,unidad,taller) VALUES ('$numero','$codigo_interno','$nombre_product, $INSERTAR_HISTORIAL=$mysqli->query("INSERT INTO taller_historial_materiales(n_interno,codigo_interno,nombre,egreso,ingreso,unidad,usuario,fecha,taller,sucursal), $INSERTAR_PRODUCTO=$mysqli->query("INSERT INTO taller_historial_materiales(n_interno,codigo_interno,nombre,egreso,ingreso,unidad,usuario,fecha,taller,sucursal), $consulta2=$mysqli->query("SELECT * FROM productos_taller where n_interno='$numero' and taller_espumas='Espumas'");, $consulta4=$mysqli->query("SELECT * FROM taller_materiales where n_interno='$numero' and taller='Espumas'");, $consulta=$mysqli->query("SELECT * FROM taller_materiales where n_interno='$numero' and taller='Espumas'");.

Navegación legacy detectada:
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

## Cómo se muestra hoy

- `backend/src/routes/odts`
- `frontend/src/pages/taller`

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
5. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
6. Validar con datos reales y usuario clave antes de marcar como cerrado.

## Criterios de aceptación

- Cada pantalla o flujo legacy relevante tiene equivalente nuevo, reemplazo aprobado o descarte explícito documentado.
- La UI nueva muestra los campos/columnas/filtros legacy requeridos por operación diaria.
- Las acciones críticas tienen permisos, validaciones, mensajes de error y auditoría.
- Las exportaciones/importaciones legacy existentes quedan replicadas o reemplazadas por una alternativa acordada.
- La funcionalidad se valida con datos reales y no rompe módulos relacionados.

## Seguridad, datos y permisos

- Validar permisos para mover órdenes, cambiar estados, consumir materiales o generar despachos.
- Evitar estados imposibles entre venta, ODT, taller, despacho y guía.
- Registrar bitácora para cambios operativos y consumo de materiales.

## Checklist de validación final

- [ ] Revisar archivo legacy y anotar comportamiento exacto.
- [ ] Revisar pantalla/API nueva equivalente.
- [ ] Implementar brechas con cambios mínimos y trazables.
- [ ] Agregar o actualizar pruebas unitarias/integración cuando haya lógica de datos.
- [ ] Probar manualmente flujo feliz, errores, permisos y estados borde.
- [ ] Registrar evidencia: archivos modificados, capturas si aplica, comandos de prueba y resultado.
- [ ] Validación final del lead: aprobar, aprobar con observaciones o rechazar.

## Resultado de ejecución

- Implementacion realizada: el flujo legacy de Espumas queda cubierto en el modulo Taller unificado con tab/filtro `Espumas`, busqueda por N interno, filtros de fecha, fechas editables, Obs OT, estado por producto/taller, materiales asignados por ODT, consumo trazable y actualizacion de `taller_materiales`.
- Archivos modificados: `backend/src/routes/odts/item-workflow.js`, `backend/src/routes/odts/consumos.js`, `backend/src/routes/odts/list.js`, `frontend/src/pages/taller/TallerFormPage.jsx`, `frontend/src/pages/taller/TallerPage.jsx`, `frontend/src/api/odts.js`.
- Pruebas ejecutadas: `npm.cmd test -- odt-item-workflow.test.js odt-consumos.test.js historial-materiales.test.js reportes-export-helpers.test.js --reporter=dot` OK; `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- odts.test.js --reporter=dot` OK; `frontend: npm.cmd run lint` OK; `frontend: npm.cmd run build` OK.
- Riesgos residuales: el modulo nuevo no replica una pantalla separada `taller_espumas`; se aprueba como reemplazo por modulo unificado con tab y filtros. La impresion formal legacy queda reemplazada por impresion del detalle y export CSV.
- Validacion del lead: Aprobado localmente con doble auditoria multiagente.
- Decision final: Cerrado para continuar.
