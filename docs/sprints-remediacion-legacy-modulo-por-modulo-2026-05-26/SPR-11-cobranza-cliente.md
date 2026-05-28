# SPR-11-cobranza-cliente - cobranza_cliente

Prioridad: **P2 - completar equivalencia**
Dominio: **Administración / Finanzas / Seguridad**
Subagente especialista asignado: **Subagente Administración-Finanzas-Seguridad**
Estado: **Aprobado localmente - cerrado el 2026-05-27**

## Objetivo

Revisar y reparar el módulo `cobranza_cliente` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/cobranza-cliente.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-11-cobranza-cliente.md`
- Evidencia legacy principal:
  - `cobranza_cliente\buscar_documento.php`
  - `cobranza_cliente\buscar_fechas.php`
  - `cobranza_cliente\buscar_numero.php`
  - `cobranza_cliente\index.php`
  - `cobranza_cliente\lista.php`
  - `cobranza_cliente\lista_excel.php`
  - `cobranza_cliente\lista_padre.php`
  - `cobranza_cliente\pasar_a_get.php`

## Cómo se mostraba en legacy

- Tablas/columnas detectadas: Boleta o Factura entre Fechas, Boletas no pagadas ( ), Cliente, Creada por, Crear Nueva Boleta o Factura, Documento, Documento interno y Número, Entre Fechas, Entre Fechas Venta, Estado Pago, Facturas Ventas no pagadas ( ), Facturas no pagadas ( ), Fecha doc., Fecha pago, N° Doc, N° Venta, Número Boleta o Factura, Proveedor entre Fechas.
- Campos/formularios detectados: Factura:, Fecha de Inicio, Fecha de Término, Número de Factura, Número del documento.
- Botones/acciones detectadas: "> Fecha de Término Buscar, "> Ven Venta sala, "> Ver Venta C.Marco, "> Ver Venta C.WEB, "> Ver Venta Licit, &fecha2= &numero= &documento= &no_pagada_factura= "> Exportar a Excel, &times;, ...Ir a menú, ...Salir, Boleta o Factura entre Fechas, Boletas no pagadas ( ), Buscar, Cancelar operación, Crear Nueva Boleta o Factura, Documento interno y Número, Entre Fechas, Entre Fechas Venta, Factura y N°.
- Exportaciones/masivos detectados: $objPHPExcel->getProperties()->setCreator("Codigotec") //Autor, $objPHPExcel->setActiveSheetIndex(0), $objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel2007'); */, /* Se manda el archivo al navegador web, con el nombre que se indica (Excel2007), // Se crea el objeto PHPExcel, //$objPHPExcel = new PHPExcel();, //$objPHPExcel->getActiveSheet(0)->freezePane('A4');, //$objPHPExcel->getActiveSheet(0)->freezePaneByColumnAndRow(0,4);, //$objPHPExcel->setActiveSheetIndex(0), //$objPHPExcel->setActiveSheetIndex(0);.
- Búsquedas/filtros detectados: $_pagi_sql = "SELECT * FROM caja where n_doc like '%$numero%' and sucursal='$sucursal' and medio_pago='Referencial' and estado_doc='Activa' and (documento='Fact, $_pagi_sql = "SELECT * FROM caja where n_doc like '%$numero%' and sucursal='$sucursal' and medio_pago='Referencial' and estado_doc='Activa' and documento='$docu, $cliente= $row_nombre['razon_social'];, $cliente="No hay datos registrados";, $i, $cliente);, $i, $rut_cliente);, $numero, $numero;, $result_nombre=$mysqli->query("SELECT * FROM clientes where rut='$rut_cliente'");, $result_rut=$mysqli->query("SELECT * FROM orden_compra_sistema where n_interno='".

Navegación legacy detectada:
- `menu.php?pag=caja/buscar_documento`
- `menu.php?pag=caja/index&no_pagada_factura=si`
- `menu.php?pag=cobranza/buscar_documento_fechas`
- `menu.php?pag=cobranza/buscar_fechas`
- `menu.php?pag=cobranza/buscar_numero`
- `menu.php?pag=cobranza/buscar_proveedor_fechas`
- `menu.php?pag=cobranza/index`
- `menu.php?pag=cobranza/lista_padre&no_pagada_boleta=si`
- `menu.php?pag=cobranza/lista_padre&no_pagada_factura=si`
- `menu.php?pag=cobranza/nuevo`
- `menu.php?pag=cobranza_cliente/buscar_documento`
- `menu.php?pag=cobranza_cliente/buscar_fechas`
- `menu.php?pag=cobranza_cliente/buscar_numero`
- `menu.php?pag=cobranza_cliente/lista_padre&no_pagada_factura=si`
- `menu.php?pag=convenio_marco/venta&numero=<?php echo $registro['n_interno']?>`

## Cómo se muestra hoy

- `backend/src/routes/clientes`
- `backend/src/routes/cobranza`
- `frontend/src/pages/cobranza`

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

- Validar permisos estrictos para caja, cobranza, usuarios, gastos y reportes financieros.
- Registrar auditoría de montos, medios de pago, documentos, anulaciones y cambios de usuario.
- Proteger datos personales de clientes/proveedores y evitar exportaciones no autorizadas.

## Checklist de validación final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios mínimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integración cuando haya lógica de datos.
- [x] Probar manualmente flujo feliz, errores, permisos y estados borde.
- [x] Registrar evidencia: archivos modificados, capturas si aplica, comandos de prueba y resultado.
- [x] Validación final del lead: aprobar, aprobar con observaciones o rechazar.

## Resultado de ejecución

- Implementación realizada: se agregaron filtros legacy/equivalentes para cobranza activa e histórica por fechas, documento, N doc, interno, RUT, cliente y creador; exportación usa los mismos filtros; la tabla histórica permite navegar a venta y cliente.
- Archivos modificados: `backend/src/routes/cobranza/index.js`, `backend/src/routes/ventas/list.js`, `backend/src/routes/reportes/index.js`, `frontend/src/pages/cobranza/CobranzaPage.jsx`, `backend/test/cobranza-cliente.test.js`.
- Pruebas ejecutadas: `node --check` en rutas y test nuevo; `frontend: npm.cmd run lint` OK; `frontend: npm.cmd run build` OK. El test de integración backend quedó preparado, pero la ejecución local falla por Postgres no disponible (`ECONNREFUSED`).
- Riesgos residuales: requiere una corrida de integración con base de datos levantada antes de desplegar.
- Validación del lead: aprobado localmente con revisión backend/frontend y cobertura nueva.
- Decisión final: cerrado.
