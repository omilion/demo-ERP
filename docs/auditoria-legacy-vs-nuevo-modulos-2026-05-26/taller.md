# Auditoría legacy vs nuevo - taller

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\taller`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Legacy taller y variantes confecciones/espumas/externo deben mapearse contra ODTs y workflow actual.
- Plan: comparar estados, operaciones, bitácora, materiales y paso desde ventas/bodega.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/bitacora-taller/index.js`
- `backend/src/routes/bodega-taller/index.js`
- `backend/src/routes/categorias-bodega-taller/index.js`
- `backend/src/routes/odts`
- `backend/src/routes/pasar-taller/index.js`
- `frontend/src/api/bitacoraTaller.js`
- `frontend/src/api/bodegaTaller.js`
- `frontend/src/api/categoriasBodegaTaller.js`
- `frontend/src/api/pasarTaller.js`
- `frontend/src/pages/bitacora-taller/BitacoraTallerPage.jsx`
- `frontend/src/pages/bodega-taller/BodegaTallerPage.jsx`
- `frontend/src/pages/pasar-taller/PasarTallerPage.jsx`
- `frontend/src/pages/taller`
- `frontend/src/pages/taller/TallerFormPage.jsx`
- `frontend/src/pages/taller/TallerPage.jsx`

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

- `taller\acepta_elimina.php`
- `taller\actualizar.php`
- `taller\actualizar_estados.php`
- `taller\buscar_fechas.php`
- `taller\buscar_ninterno.php`
- `taller\buscar_taller_fechas.php`
- `taller\eliminar.php`
- `taller\estado_general.php`
- `taller\estados_productos.php`
- `taller\ficha.php`
- `taller\imprime_ficha.php`
- `taller\imprime_lista.php`
- `taller\index.php`
- `taller\lista.php`
- `taller\lista_excel.php`
- `taller\lista_excel_detalles.php`
- `taller\mensaje_actualizado.php`
- `taller\mensaje_eliminado.php`
- `taller\modificar_estados_productos.php`
- `taller\pasar_a_get.php`

## Navegación legacy detectada

- `menu.php?pag=convenio_marco/venta&numero=<?php echo $registro['n_interno']?>`
- `menu.php?pag=licitacion_venta/venta&numero=<?php echo $registro['n_interno']?>`
- `menu.php?pag=taller/acepta_elimina&numero=<?php echo $registro['n_interno']; ?>`
- `menu.php?pag=taller/buscar_fechas`
- `menu.php?pag=taller/buscar_ninterno`
- `menu.php?pag=taller/buscar_taller_fechas`
- `menu.php?pag=taller/ficha&numero=<?php echo $numero; ?>&back=<?php echo $back; ?>`
- `menu.php?pag=taller/ficha&numero=<?php echo $registro['n_interno']; ?>`
- `menu.php?pag=taller/index&pendiente=si`
- `menu.php?pag=taller/index&prioridad=alta`
- `menu.php?pag=taller/modificar_estados_productos&numero=<?php echo $registro['n_interno']?>&id=<?php echo $registro['id']?>&back=3`
- `menu.php?pag=venta_directa/venta&numero=<?php echo $registro['n_interno']?>`
- `menu.php?pag=venta_web/venta&numero=<?php echo $registro['n_interno']?>`
