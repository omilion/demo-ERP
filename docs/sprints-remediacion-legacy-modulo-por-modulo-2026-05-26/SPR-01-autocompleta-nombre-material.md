# SPR-01-autocompleta-nombre-material - autocompleta_nombre_material

Prioridad: **P2 - completar equivalencia**
Dominio: **Operaciones / Taller / Despacho**
Subagente especialista asignado: **Subagente Operaciones-Taller-Despacho**
Estado: **Aprobado localmente - cerrado el 2026-05-27**

## Objetivo

Revisar y reparar el mÃ³dulo `autocompleta_nombre_material` comparando cada funciÃ³n legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- AuditorÃ­a base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/autocompleta-nombre-material.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-01-autocompleta-nombre-material.md`
- Evidencia legacy principal:
  - `autocompleta_nombre_material\nombre_autocompleta.php`

## CÃ³mo se mostraba en legacy

- No se detectaron pantallas PHP con etiquetas claras; revisar manualmente si contiene lÃ³gica de soporte.

## CÃ³mo se muestra hoy

- `backend/src/routes/odts`
- `backend/src/routes/telas`
- `frontend/src/pages/taller`
- `frontend/src/pages/telas`

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

- Validar permisos para mover Ã³rdenes, cambiar estados, consumir materiales o generar despachos.
- Evitar estados imposibles entre venta, ODT, taller, despacho y guÃ­a.
- Registrar bitÃ¡cora para cambios operativos y consumo de materiales.

## Checklist de validaciÃ³n final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios minimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integracion cuando hubo logica de datos.
- [x] Probar flujo feliz, errores, permisos y estados borde con suite automatizada.
- [x] Registrar evidencia: archivos modificados, comandos de prueba y resultado.
- [x] Validacion final del lead: aprobado localmente.

## Resultado de ejecucion

- Implementacion realizada: el consumo de materiales en ODT ahora usa `GET /api/bodega-taller/autocomplete` para material de taller en vez del listado general. El endpoint respeta permisos, scope de sucursal, busqueda por codigo/nombre/barra/proveedor y devuelve stock/unidad para seleccion segura.
- Archivos modificados: `backend/src/routes/bodega-taller/index.js`, `backend/src/routes/bodega-taller/helpers.js`, `frontend/src/api/bodegaTaller.js`, `frontend/src/pages/taller/TallerFormPage.jsx`, `backend/test/categorias-bodega-taller.test.js`.
- Pruebas ejecutadas: `npm.cmd test -- categorias-bodega-taller.test.js categorias.test.js usuarios.test.js` OK 12/12; `npm.cmd run test:ci` OK 126/126; `npm.cmd run test:full` OK 437/437; frontend `npm.cmd run lint` OK; frontend `npm.cmd run build` OK.
- Riesgos residuales: legacy era una funcion auxiliar sin pantalla propia; se mantiene como soporte dentro del flujo real de ODT, no como modulo independiente.
- Validacion del lead: aprobado localmente con revision multiagente backend/frontend.
- Decision final: cerrado.
