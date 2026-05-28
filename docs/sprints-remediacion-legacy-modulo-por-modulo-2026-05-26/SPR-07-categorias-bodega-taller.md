# SPR-07-categorias-bodega-taller - categorias_bodega_taller

Prioridad: **P2 - completar equivalencia**
Dominio: **Bodega / Inventario**
Subagente especialista asignado: **Subagente Bodega-Inventario**
Estado: **Aprobado localmente - cerrado el 2026-05-27**

## Objetivo

Revisar y reparar el mÃ³dulo `categorias_bodega_taller` comparando cada funciÃ³n legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- AuditorÃ­a base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/categorias-bodega-taller.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-07-categorias-bodega-taller.md`
- Evidencia legacy principal:
  - `categorias_bodega_taller\acepta_eliminar.php`
  - `categorias_bodega_taller\actualizar.php`
  - `categorias_bodega_taller\consultar_nombre_existe.php`
  - `categorias_bodega_taller\eliminar.php`
  - `categorias_bodega_taller\guardar.php`
  - `categorias_bodega_taller\index.php`
  - `categorias_bodega_taller\lista.php`
  - `categorias_bodega_taller\mensaje_actualizado.php`
  - `categorias_bodega_taller\mensaje_eliminado.php`
  - `categorias_bodega_taller\mensaje_guardado.php`
  - `categorias_bodega_taller\modificar.php`
  - `categorias_bodega_taller\nuevo.php`

## CÃ³mo se mostraba en legacy

- Tablas/columnas detectadas: Nombre.
- Campos/formularios detectados: Nombre Categoria:, Nombre:.
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button">Acepto, &times;, <?php echo $id; ?>, <?php echo $nombre; ?>, Actualizar ahora, Cancelar operaciÃ³n, Crear Nuevo, Crear nuevo, No Acepto.

NavegaciÃ³n legacy detectada:
- `menu.php?pag=categorias_bodega_taller/acepta_eliminar&id=<?php echo $registro['id'];?>`
- `menu.php?pag=categorias_bodega_taller/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=categorias_bodega_taller/index`
- `menu.php?pag=categorias_bodega_taller/modificar&id=<?php echo $registro['id']?>`
- `menu.php?pag=categorias_bodega_taller/nuevo`

## CÃ³mo se muestra hoy

- `backend/src/routes/categorias-bodega-taller`
- `backend/src/routes/categorias-bodega-taller/index.js`
- `frontend/src/api/categoriasBodegaTaller.js`

## Funciones a revisar por el subagente

- Pantallas principales y pantallas auxiliares del mÃ³dulo legacy.
- Formularios, campos obligatorios, selects, autocompletados y validaciones.
- Tablas, columnas, orden, colores/estados visuales y densidad.
- Botones, acciones, doble click, navegaciÃ³n y accesos directos.
- BÃºsquedas, filtros simples, filtros mÃºltiples y estado por defecto.
- Exportaciones Excel/PDF, importaciones masivas y plantillas.
- Efectos secundarios: stock, caja, ventas, documentos, taller, despacho, auditorÃ­a.

## Brechas iniciales

- Confirmar si todos los campos legacy visibles existen en la UI nueva.
- Confirmar si todas las bÃºsquedas/filtros legacy existen o tienen reemplazo equivalente.
- Confirmar si las exportaciones Excel/PDF legacy existen con el mismo alcance.
- Confirmar si las acciones destructivas o de estado legacy tienen control de permisos y trazabilidad en el sistema nuevo.
- Registrar extras nuevos que mejoran el legacy y no deben perderse.

## Plan de reparaciÃ³n

1. Levantar checklist funcional desde archivos legacy principales.
2. Comparar contra pantalla/API nueva equivalente.
3. Agregar campos, columnas, filtros, botones y exportaciones que existÃ­an en legacy y falten hoy.
4. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
5. Validar con datos reales y usuario clave antes de marcar como cerrado.

## Criterios de aceptaciÃ³n

- Cada pantalla o flujo legacy relevante tiene equivalente nuevo, reemplazo aprobado o descarte explÃ­cito documentado.
- La UI nueva muestra los campos/columnas/filtros legacy requeridos por operaciÃ³n diaria.
- Las acciones crÃ­ticas tienen permisos, validaciones, mensajes de error y auditorÃ­a.
- Las exportaciones/importaciones legacy existentes quedan replicadas o reemplazadas por una alternativa acordada.
- La funcionalidad se valida con datos reales y no rompe mÃ³dulos relacionados.

## Seguridad, datos y permisos

- Validar permisos de lectura/escritura antes de editar stock, precios, proveedor o visibilidad web.
- Registrar auditorÃ­a para cambios masivos Excel/PDF/importaciones.
- Proteger importaciones contra columnas invÃ¡lidas, duplicados y sobrescritura accidental.

## Checklist de validaciÃ³n final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios minimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integracion cuando hubo logica de datos.
- [x] Probar flujo feliz, errores, permisos y estados borde con suite automatizada.
- [x] Registrar evidencia: archivos modificados, comandos de prueba y resultado.
- [x] Validacion final del lead: aprobado localmente.

## Resultado de ejecucion

- Implementacion realizada: se valido y reforzo CRUD de categorias/subcategorias de bodega taller. La eliminacion de una categoria sin materiales ahora tambien desactiva sus subcategorias activas para evitar referencias administrativas colgantes.
- Archivos modificados: `backend/src/routes/categorias-bodega-taller/index.js`, `backend/test/categorias-bodega-taller.test.js`.
- Pruebas ejecutadas: `npm.cmd test -- categorias-bodega-taller.test.js categorias.test.js usuarios.test.js` OK 12/12; `npm.cmd run test:ci` OK 126/126; `npm.cmd run test:full` OK 437/437; frontend `npm.cmd run lint` OK; frontend `npm.cmd run build` OK.
- Riesgos residuales: no se creo una ruta visual dedicada; queda dentro de `Admin > Configuracion`, que cubre el CRUD legacy y agrega subcategorias como mejora.
- Validacion del lead: aprobado localmente con revision multiagente backend/frontend.
- Decision final: cerrado.
