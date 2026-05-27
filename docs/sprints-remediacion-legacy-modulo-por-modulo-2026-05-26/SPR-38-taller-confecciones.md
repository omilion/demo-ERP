# SPR-38-taller-confecciones - taller_confecciones

Prioridad: **P2 - completar equivalencia**
Dominio: **Operaciones / Taller / Despacho**
Subagente especialista asignado: **Subagente Operaciones-Taller-Despacho**
Estado: **Aprobado localmente - cerrado el 2026-05-27**

## Objetivo

Revisar y reparar el módulo `taller_confecciones` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/taller-confecciones.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-38-taller-confecciones.md`
- Evidencia legacy principal:
  - `taller_confecciones\actualizar.php`
  - `taller_confecciones\actualizar_estados.php`
  - `taller_confecciones\agregar_materiales\index.php`
  - `taller_confecciones\agregar_materiales\insertar.php`
  - `taller_confecciones\buscar_fechas.php`
  - `taller_confecciones\buscar_ninterno.php`
  - `taller_confecciones\estado_general.php`
  - `taller_confecciones\estados_productos.php`
  - `taller_confecciones\ficha.php`
  - `taller_confecciones\imprime_ficha.php`
  - `taller_confecciones\imprime_lista.php`
  - `taller_confecciones\index.php`

## Cómo se mostraba en legacy

- Tablas/columnas detectadas: ************************************************************************************************************************, ..Volver a Ficha, > Pendiente Cambiar, Buscar..., Cant, Cant., Cliente, Creada por, Código, Detalle, Est. Producto, Estado, Estado OT, Estado OT:, Estado Producto, Estado Taller Confecciones, FICHA TALLER CONFECCIONES PLASTIMAR OT, Fecha Ingreso:.
- Campos/formularios detectados: Cdigo, Código, Descripcin, Descripción, Fecha de Inicio, Fecha de Término, Producto.
- Botones/acciones detectadas: " /> &times;, " class='btn btn-success btn-sm' title='Modificar'> Marcar Todos como Terminados, " data-texto=" " data-produ=" ">, " required="required" /> Fecha Término: Estado OT: Obs OT: ... Ir a atrás, "> Buscar..., "> Fecha de Término Buscar, "> Ficha, "> Volver a la Ficha, &back= " class="btn btn-sm btn-primary" role="button"> ...Cancelar operacin, &back= " role="button" class="btn btn-danger btn-sm"> ..Volver a Ficha, &back=3" role="button" class="btn btn-primary btn-sm"> Agrega Materiales, &back=4" role="button" class="btn btn-success"> Mostrar Listado Completo, &fecha1= &fecha2= &pendiente= &prioridad= ')" role="button" class="btn btn-danger btn-sm">, &id= " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Eliminación, &id= &back=3"> Cambiar, &numero= ">, &times;, ')" role="button" class="btn btn-primary btn-sm"> Imprimir Ficha.
- Búsquedas/filtros detectados: "numero":, $ACTUALIZO1=$mysqli->query("UPDATE taller SET fecha_inicio='$fecha_inicio',fecha_termino='$fecha_termino' WHERE n_interno='$numero'");, $ACTUALIZO3 = $mysqli->query("UPDATE taller SET estado_general='$estado_adquirido' WHERE n_interno='$numero'");, $ACTUALIZO=$mysqli->query("UPDATE taller_materiales SET cant=cant + $cant WHERE codigo_interno='$codigo_interno' and n_interno='$numero' and taller='$taller'");, $INSERTAR=$mysqli->query("INSERT INTO taller_materiales(n_interno,codigo_interno,nombre,cant,unidad,taller) VALUES ('$numero','$codigo_interno','$nombre_product, $INSERTAR_HISTORIAL=$mysqli->query("INSERT INTO taller_historial_materiales(n_interno,codigo_interno,nombre,egreso,ingreso,unidad,usuario,fecha,taller,sucursal), $INSERTAR_PRODUCTO=$mysqli->query("INSERT INTO taller_historial_materiales(n_interno,codigo_interno,nombre,egreso,ingreso,unidad,usuario,fecha,taller,sucursal), $consulta2 = $mysqli->query("SELECT * FROM productos_taller where n_interno='$numero' and taller_confecciones='Confecciones'");, $consulta2=$mysqli->query("SELECT * FROM productos_taller where n_interno='$numero' and taller_confecciones='Confecciones'");, $consulta2=$mysqli->query("UPDATE productos_taller SET estado_confecciones = 'Listo' where n_interno='$numero' and taller_confecciones='Confecciones'");.

Navegación legacy detectada:
- `menu.php?pag=taller_confecciones/agregar_materiales/index&numero=<?php echo $numero; ?>&back=3`
- `menu.php?pag=taller_confecciones/agregar_materiales/index&numero=<?php echo $numero; ?>&back=4`
- `menu.php?pag=taller_confecciones/buscar_fechas`
- `menu.php?pag=taller_confecciones/buscar_ninterno`
- `menu.php?pag=taller_confecciones/ficha&numero=<?php echo $numero; ?>`
- `menu.php?pag=taller_confecciones/ficha&numero=<?php echo $numero; ?>&back=<?php echo $back; ?>`
- `menu.php?pag=taller_confecciones/ficha&numero=<?php echo $registro['n_interno']; ?>`
- `menu.php?pag=taller_confecciones/index&pendiente=si`
- `menu.php?pag=taller_confecciones/index&prioridad=alta`
- `menu.php?pag=taller_confecciones/materiales/acepta_elimina&id=<?php echo $registro['id']?>&numero=<?php echo $registro['n_interno']?>`
- `menu.php?pag=taller_confecciones/modificar_estados_productos&numero=<?php echo $registro['n_interno'] ?>&id=<?php echo $registro['id'] ?>&back=3`
- `menu.php?pag=taller_confecciones/terminar_todos&numero=<?php echo $numero; ?>`

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

- Implementacion realizada: el flujo legacy de Confecciones queda cubierto en el modulo Taller unificado con tab/filtro `Confecciones`, busqueda por N interno, filtros de fecha, fechas editables, Obs OT, estado por producto/taller, accion masiva "Marcar todo listo" por taller y materiales asignados por ODT. Cada consumo descuenta stock, registra historial y actualiza `taller_materiales`.
- Archivos modificados: `backend/src/routes/odts/item-workflow.js`, `backend/src/routes/odts/consumos.js`, `backend/src/routes/odts/list.js`, `frontend/src/pages/taller/TallerFormPage.jsx`, `frontend/src/pages/taller/TallerPage.jsx`, `frontend/src/api/odts.js`.
- Pruebas ejecutadas: `npm.cmd test -- odt-item-workflow.test.js odt-consumos.test.js historial-materiales.test.js reportes-export-helpers.test.js --reporter=dot` OK; `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- odts.test.js --reporter=dot` OK; `frontend: npm.cmd run lint` OK; `frontend: npm.cmd run build` OK.
- Riesgos residuales: el modulo nuevo no replica una pantalla separada `taller_confecciones`; se aprueba como reemplazo por modulo unificado con tab y filtros. La impresion formal legacy queda reemplazada por impresion del detalle y export CSV.
- Validacion del lead: Aprobado localmente con doble auditoria multiagente.
- Decision final: Cerrado para continuar.
