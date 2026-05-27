# SPR-07-categorias-bodega-taller - categorias_bodega_taller

Prioridad: **P2 - completar equivalencia**
Dominio: **Bodega / Inventario**
Subagente especialista asignado: **Subagente Bodega-Inventario**
Estado: **Pendiente de ejecución**

## Objetivo

Revisar y reparar el módulo `categorias_bodega_taller` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/categorias-bodega-taller.md`
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

## Cómo se mostraba en legacy

- Tablas/columnas detectadas: Nombre.
- Campos/formularios detectados: Nombre Categoria:, Nombre:.
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button">Acepto, &times;, <?php echo $id; ?>, <?php echo $nombre; ?>, Actualizar ahora, Cancelar operación, Crear Nuevo, Crear nuevo, No Acepto.

Navegación legacy detectada:
- `menu.php?pag=categorias_bodega_taller/acepta_eliminar&id=<?php echo $registro['id'];?>`
- `menu.php?pag=categorias_bodega_taller/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=categorias_bodega_taller/index`
- `menu.php?pag=categorias_bodega_taller/modificar&id=<?php echo $registro['id']?>`
- `menu.php?pag=categorias_bodega_taller/nuevo`

## Cómo se muestra hoy

- `backend/src/routes/categorias-bodega-taller`
- `backend/src/routes/categorias-bodega-taller/index.js`
- `frontend/src/api/categoriasBodegaTaller.js`

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
4. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
5. Validar con datos reales y usuario clave antes de marcar como cerrado.

## Criterios de aceptación

- Cada pantalla o flujo legacy relevante tiene equivalente nuevo, reemplazo aprobado o descarte explícito documentado.
- La UI nueva muestra los campos/columnas/filtros legacy requeridos por operación diaria.
- Las acciones críticas tienen permisos, validaciones, mensajes de error y auditoría.
- Las exportaciones/importaciones legacy existentes quedan replicadas o reemplazadas por una alternativa acordada.
- La funcionalidad se valida con datos reales y no rompe módulos relacionados.

## Seguridad, datos y permisos

- Validar permisos de lectura/escritura antes de editar stock, precios, proveedor o visibilidad web.
- Registrar auditoría para cambios masivos Excel/PDF/importaciones.
- Proteger importaciones contra columnas inválidas, duplicados y sobrescritura accidental.

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
