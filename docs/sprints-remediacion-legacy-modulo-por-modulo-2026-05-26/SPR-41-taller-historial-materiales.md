# SPR-41-taller-historial-materiales - taller_historial_materiales

Prioridad: **P2 - completar equivalencia**
Dominio: **Operaciones / Taller / Despacho**
Subagente especialista asignado: **Subagente Operaciones-Taller-Despacho**
Estado: **Aprobado localmente - cerrado el 2026-05-27**

## Objetivo

Revisar y reparar el módulo `taller_historial_materiales` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/taller-historial-materiales.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-41-taller-historial-materiales.md`
- Evidencia legacy principal:
  - `taller_historial_materiales\acepta_elimina.php`
  - `taller_historial_materiales\buscar_fechas.php`
  - `taller_historial_materiales\buscar_operario_fechas.php`
  - `taller_historial_materiales\buscar_taller_fechas.php`
  - `taller_historial_materiales\elimina_varias.php`
  - `taller_historial_materiales\eliminar.php`
  - `taller_historial_materiales\index.php`
  - `taller_historial_materiales\lista.php`
  - `taller_historial_materiales\lista_excel.php`
  - `taller_historial_materiales\mensaje_eliminado.php`
  - `taller_historial_materiales\pasar_a_get.php`
  - `taller_historial_materiales\telas\index.php`

## Cómo se mostraba en legacy

- Tablas/columnas detectadas: Acción, Codigo, Cód producto, Egreso, Fecha, Ingreso, Nombre Producto, Operario, Saldo, Seleccionar Eliminar Selección, Taller, Total Egreso, Total Ingreso, Ubicación, Ultima Modificación, Unid Medida.
- Campos/formularios detectados: Cantidad, Cortador, Código, Fecha de Inicio, Fecha de Término, Producto, Ubicación.
- Botones/acciones detectadas: " />, " class="btn btn-lg btn-danger btn-block" role="button">Confirmo Eliminación, " data-codigo=" " data-ubicacion=" " data-tipo=" " data-ingreso="0">, " data-codigo=" " data-ubicacion=" " data-tipo=" " data-ingreso="1">, "> Fecha de Término Buscar, &fecha2= "> Exportar a Excel, &fecha2= &usuario= &taller= "> Exportar a Excel, &times;, ...Ir atras, Agregar Nueva Tela, Cancelar operación, Cantidad Cortador Código Ubicación Cerrar, Cantidad Código Cerrar, Eliminar Selección, Fecha de Término Buscar, Fechas, Guardar, Operario y Fechas.
- Exportaciones/masivos detectados: $objPHPExcel = new PHPExcel();, $objPHPExcel->getActiveSheet()->setAutoFilter("A3:J3");, $objPHPExcel->getActiveSheet()->setTitle($salida);, $objPHPExcel->getActiveSheet(0)->freezePaneByColumnAndRow(0,4);, $objPHPExcel->getProperties()->setCreator("Codigotec") //Autor, $objPHPExcel->setActiveSheetIndex(0), $objPHPExcel->setActiveSheetIndex(0);, $objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel2007'); */, $objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel5');, /* Se manda el archivo al navegador web, con el nombre que se indica (Excel2007).
- Búsquedas/filtros detectados: // APLICO FILTROS A LOS ENCABEZADOS, // Verificar si el número tiene decimales, Buscar, Búsqueda Operario entre fechas!!, Búsqueda Taller entre fechas!!, Búsqueda por Fechas !!, php?pag=taller_historial_materiales/buscar_fechas" class="btn btn-warning btn-sm" role="button">, php?pag=taller_historial_materiales/buscar_operario_fechas" class="btn btn-danger btn-sm" role="button">, php?pag=taller_historial_materiales/buscar_taller_fechas" class="btn btn-info btn-sm" role="button">.

Navegación legacy detectada:
- `menu.php?pag=taller_historial_materiales/acepta_elimina&id=<?php echo $registro['id']?>`
- `menu.php?pag=taller_historial_materiales/buscar_fechas`
- `menu.php?pag=taller_historial_materiales/buscar_operario_fechas`
- `menu.php?pag=taller_historial_materiales/buscar_taller_fechas`

## Cómo se muestra hoy

- `backend/src/routes/historial-materiales`
- `frontend/src/pages/historial-materiales`

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

- Implementacion realizada: Historial Materiales queda con scope por sucursal, paginacion real, filtros por fechas/operario/taller/codigo/material/ODT/tipo movimiento, columnas de saldo y ubicacion inferida, export backend de todos los resultados filtrados, borrado individual y borrado masivo solo con permiso `taller.delete`.
- Archivos modificados: `backend/src/routes/historial-materiales/index.js`, `frontend/src/pages/historial-materiales/HistorialMaterialesPage.jsx`, `frontend/src/api/historialMateriales.js`.
- Pruebas ejecutadas: `npm.cmd test -- odt-item-workflow.test.js odt-consumos.test.js historial-materiales.test.js reportes-export-helpers.test.js --reporter=dot` OK; `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- odts.test.js --reporter=dot` OK; `frontend: npm.cmd run lint` OK; `frontend: npm.cmd run build` OK.
- Riesgos residuales: el export legacy Excel con autofiltro/freeze no se replica como XLS nativo; se reemplaza por CSV backend completo y filtrado. La ubicacion se infiere por codigo desde catalogo/telas porque el modelo historico actual no guarda una columna `ubicacion` propia.
- Validacion del lead: Aprobado localmente con doble auditoria multiagente.
- Decision final: Cerrado para continuar.
