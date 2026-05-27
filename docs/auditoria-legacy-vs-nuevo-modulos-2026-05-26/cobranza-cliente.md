# Auditoría legacy vs nuevo - cobranza_cliente

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\cobranza_cliente`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: Boleta o Factura entre Fechas, Boletas no pagadas ( ), Cliente, Creada por, Crear Nueva Boleta o Factura, Documento, Documento interno y Número, Entre Fechas, Entre Fechas Venta, Estado Pago, Facturas Ventas no pagadas ( ), Facturas no pagadas ( ), Fecha doc., Fecha pago, N° Doc, N° Venta, Número Boleta o Factura, Proveedor entre Fechas.
- Campos/formularios detectados: Factura:, Fecha de Inicio, Fecha de Término, Número de Factura, Número del documento.
- Botones/acciones detectadas: "> Fecha de Término Buscar, "> Ven Venta sala, "> Ver Venta C.Marco, "> Ver Venta C.WEB, "> Ver Venta Licit, &fecha2= &numero= &documento= &no_pagada_factura= "> Exportar a Excel, &times;, ...Ir a menú, ...Salir, Boleta o Factura entre Fechas, Boletas no pagadas ( ), Buscar, Cancelar operación, Crear Nueva Boleta o Factura, Documento interno y Número, Entre Fechas, Entre Fechas Venta, Factura y N°.
- Exportaciones/masivos detectados: $objPHPExcel->getProperties()->setCreator("Codigotec") //Autor, $objPHPExcel->setActiveSheetIndex(0), $objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel2007'); */, /* Se manda el archivo al navegador web, con el nombre que se indica (Excel2007), // Se crea el objeto PHPExcel, //$objPHPExcel = new PHPExcel();, //$objPHPExcel->getActiveSheet(0)->freezePane('A4');, //$objPHPExcel->getActiveSheet(0)->freezePaneByColumnAndRow(0,4);, //$objPHPExcel->setActiveSheetIndex(0), //$objPHPExcel->setActiveSheetIndex(0);.
- Búsquedas/filtros detectados: $_pagi_sql = "SELECT * FROM caja where n_doc like '%$numero%' and sucursal='$sucursal' and medio_pago='Referencial' and estado_doc='Activa' and (documento='Fact, $_pagi_sql = "SELECT * FROM caja where n_doc like '%$numero%' and sucursal='$sucursal' and medio_pago='Referencial' and estado_doc='Activa' and documento='$docu, $cliente= $row_nombre['razon_social'];, $cliente="No hay datos registrados";, $i, $cliente);, $i, $rut_cliente);, $numero, $numero;, $result_nombre=$mysqli->query("SELECT * FROM clientes where rut='$rut_cliente'");, $result_rut=$mysqli->query("SELECT * FROM orden_compra_sistema where n_interno='".

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/clientes`
- `backend/src/routes/cobranza`
- `frontend/src/pages/cobranza`

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

- `cobranza_cliente\buscar_documento.php`
- `cobranza_cliente\buscar_fechas.php`
- `cobranza_cliente\buscar_numero.php`
- `cobranza_cliente\index.php`
- `cobranza_cliente\lista.php`
- `cobranza_cliente\lista_excel.php`
- `cobranza_cliente\lista_padre.php`
- `cobranza_cliente\pasar_a_get.php`

## Navegación legacy detectada

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
- `menu.php?pag=licitacion_venta/venta&numero=<?php echo $registro['n_interno']?>`
- `menu.php?pag=matriz_ventas/index&no_pagada=si`
- `menu.php?pag=venta_directa/venta&numero=<?php echo $registro['n_interno']?>`
- `menu.php?pag=venta_web/venta&numero=<?php echo $registro['n_interno']?>`
