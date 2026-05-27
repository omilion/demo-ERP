# SPR-09-clase-excel - clase_excel

Prioridad: **P3 - soporte técnico**
Dominio: **Soporte / Assets / Infraestructura**
Subagente especialista asignado: **Subagente Soporte-Legacy**
Estado: **Pendiente de ejecución**

## Objetivo

Revisar y reparar el módulo `clase_excel` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/clase-excel.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-09-clase-excel.md`
- Evidencia legacy principal:
  - No se encontraron archivos PHP en este módulo.

## Cómo se mostraba en legacy

- No se detectaron pantallas PHP con etiquetas claras; revisar manualmente si contiene lógica de soporte.

## Cómo se muestra hoy

- No se encontró equivalente directo por nombre o mapeo manual.

## Funciones a revisar por el subagente

- Pantallas principales y pantallas auxiliares del módulo legacy.
- Formularios, campos obligatorios, selects, autocompletados y validaciones.
- Tablas, columnas, orden, colores/estados visuales y densidad.
- Botones, acciones, doble click, navegación y accesos directos.
- Búsquedas, filtros simples, filtros múltiples y estado por defecto.
- Exportaciones Excel/PDF, importaciones masivas y plantillas.
- Efectos secundarios: stock, caja, ventas, documentos, taller, despacho, auditoría.

## Brechas iniciales

- Es módulo/asset de soporte. La brecha se evalúa por dependencia, no por pantalla.

## Plan de reparación

1. Inventariar dependencias usadas por pantallas legacy.
2. Eliminar solo cuando se confirme que no hay equivalencia funcional ni asset requerido.
3. Documentar reemplazo moderno si aplica.

## Criterios de aceptación

- Cada pantalla o flujo legacy relevante tiene equivalente nuevo, reemplazo aprobado o descarte explícito documentado.
- La UI nueva muestra los campos/columnas/filtros legacy requeridos por operación diaria.
- Las acciones críticas tienen permisos, validaciones, mensajes de error y auditoría.
- Las exportaciones/importaciones legacy existentes quedan replicadas o reemplazadas por una alternativa acordada.
- La funcionalidad se valida con datos reales y no rompe módulos relacionados.

## Seguridad, datos y permisos

- No migrar dependencias legacy sin revisar licencias, vulnerabilidades y uso real.
- Reemplazar librerías antiguas por equivalentes mantenidos cuando sea posible.
- Asegurar sanitización de HTML/editores de texto enriquecido si se conserva funcionalidad.

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
