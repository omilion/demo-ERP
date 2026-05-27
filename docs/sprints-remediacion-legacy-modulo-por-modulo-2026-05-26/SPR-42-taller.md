# SPR-42-taller - taller

Prioridad: **P1 - crítico funcional**
Dominio: **Operaciones / Taller / Despacho**
Subagente especialista asignado: **Subagente Operaciones-Taller-Despacho**
Estado: **Pendiente de ejecución**

## Objetivo

Revisar y reparar el módulo `taller` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/taller.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-42-taller.md`
- Evidencia legacy principal:
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

## Cómo se mostraba en legacy

- Legacy taller y variantes confecciones/espumas/externo deben mapearse contra ODTs y workflow actual.
- Plan: comparar estados, operaciones, bitácora, materiales y paso desde ventas/bodega.

Navegación legacy detectada:
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

## Cómo se muestra hoy

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
- Estados entre venta, ODT, taller y despacho no quedan inconsistentes.
- El usuario puede llegar al detalle operativo con un click/doble click o acción equivalente.

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

- Implementación realizada: Pendiente.
- Archivos modificados: Pendiente.
- Pruebas ejecutadas: Pendiente.
- Riesgos residuales: Pendiente.
- Validación del lead: Pendiente.
- Decisión final: Pendiente.
