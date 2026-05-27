# Auditoría legacy vs nuevo - caja

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\caja`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Legacy caja contiene documentos, medios de pago, boletas/facturas, NC/ND y estados de documento.
- Plan: verificar equivalencia de arqueo, movimientos, documentos SII y trazabilidad con ventas.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/caja`
- `backend/src/routes/caja/historico.js`
- `backend/src/routes/caja/index.js`
- `backend/src/routes/caja/movimientos.js`
- `backend/src/routes/caja/turno.js`
- `frontend/src/api/caja.js`
- `frontend/src/pages/caja`
- `frontend/src/pages/caja/CajaFormPage.jsx`
- `frontend/src/pages/caja/CajaPage.jsx`

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

- `caja\acepta_elimina.php`
- `caja\activar\activar.php`
- `caja\activar\index.php`
- `caja\actualizar.php`
- `caja\anular\anular.php`
- `caja\anular\index.php`
- `caja\buscar_documento.php`
- `caja\buscar_fechas.php`
- `caja\buscar_ninterno.php`
- `caja\buscar_tipo_venta.php`
- `caja\cierre_caja\index.php`
- `caja\cierre_caja\insertar.php`
- `caja\cierre_caja\mensaje_actualizado.php`
- `caja\consultar_existe_documento.php`
- `caja\egreso\index.php`
- `caja\egreso\insertar.php`
- `caja\egreso\mensaje_actualizado.php`
- `caja\eliminar.php`
- `caja\index.php`
- `caja\index2.php`
- `caja\ingreso\index.php`
- `caja\ingreso\insertar.php`
- `caja\ingreso\mensaje_actualizado.php`
- `caja\lista.php`
- `caja\lista_boleta.php`
- `caja\lista_excel.php`
- `caja\lista_excel_boleta.php`
- `caja\lista_pdf.php`
- `caja\mensaje_actualizado.php`
- `caja\mensaje_eliminado.php`
- `caja\modificar.php`
- `caja\pasar_a_get.php`
- `caja\resumen_caja.php`
- `caja\resumen_caja_pdf.php`

## Navegación legacy detectada

- `menu.php?pag=caja/acepta_elimina&id=<?php echo $registro['id']; ?>`
- `menu.php?pag=caja/activar/index&id=<? echo $registro['id'] ?>`
- `menu.php?pag=caja/activar/index&id=<? echo $registro['id']?>`
- `menu.php?pag=caja/anular/index&id=<?php echo $registro['id'] ?>`
- `menu.php?pag=caja/anular/index&id=<?php echo $registro['id']?>`
- `menu.php?pag=caja/buscar_documento`
- `menu.php?pag=caja/buscar_fechas`
- `menu.php?pag=caja/buscar_ninterno`
- `menu.php?pag=caja/buscar_tipo_venta`
- `menu.php?pag=caja/cierre_caja/index`
- `menu.php?pag=caja/egreso/index`
- `menu.php?pag=caja/index`
- `menu.php?pag=caja/ingreso/index`
- `menu.php?pag=caja/modificar&id=<?php echo $registro['id'] ?>`
- `menu.php?pag=caja/modificar&id=<?php echo $registro['id']?>`
- `menu.php?pag=caja/resumen_caja&fecha1=<?php echo $fecha1; ?>&fecha2=<?php echo $fecha2; ?>`
- `menu.php?pag=convenio_marco/venta&numero=<?php echo $registro['n_interno'] ?>`
- `menu.php?pag=convenio_marco/venta&numero=<?php echo $registro['n_interno']?>`
- `menu.php?pag=licitacion_venta/venta&numero=<?php echo $registro['n_interno'] ?>`
- `menu.php?pag=licitacion_venta/venta&numero=<?php echo $registro['n_interno']?>`
- `menu.php?pag=venta_directa/venta&numero=<?php echo $registro['n_interno'] ?>`
- `menu.php?pag=venta_directa/venta&numero=<?php echo $registro['n_interno']?>`
- `menu.php?pag=venta_web/venta&numero=<?php echo $registro['n_interno'] ?>`
- `menu.php?pag=venta_web/venta&numero=<?php echo $registro['n_interno']?>`
