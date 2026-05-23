# Fase 3 Operaciones - plan multiagente por sprints

Fuente base: `Sisgestion 3.0 - ERP PLASTIMAR Abril 2026 HAZLOMEJOR.pdf`.

Alcance de la Fase 3 del PDF:

- Produccion / ODT.
- Despacho / Logistica.
- RRHH operativo.

Regla de cierre por sprint:

- Build frontend OK.
- Prisma validate OK.
- Checks de sintaxis backend OK.
- Tests focalizados OK o limitacion DB local documentada.
- Smoke produccion/staging segun corresponda.
- QA UI de rutas tocadas.
- Informe de riesgos residuales.

## Sprint 0 - Diagnostico operativo base

Objetivo: separar lo ya existente de las brechas reales del PDF.

Frentes multiagente:

- ODT/produccion: estados, responsable, bitacora, venta origen.
- Materiales/stock: consumo desde ODT, bodega taller, telas, historial.
- Despacho/logistica: despacho, guias, estados parciales, filtros territoriales.
- RRHH operativo: trabajadores activos, cargos, asignacion a ODT.

Entregables:

- Mapa de rutas y modelos.
- Backlog ejecutable para Sprints 1 a 6.
- QA checklist por flujo.

Estado base encontrado:

- ODT existe con `ordenId`, `operarioId`, `fechaInicio`, `fechaTermino`, items, talleres y bitacora.
- Despacho/guias existe con trazabilidad por orden/ODT/origen.
- RRHH existe con trabajadores, asistencias, jornadas y subrecursos.
- Materiales existen en historial taller, bodega taller, telas y movimientos, pero falta un flujo ergonomico de consumo desde ODT.

## Sprint 1 - ODT como nucleo operativo

Objetivo: que ODT sea la unidad productiva confiable.

Cambios esperados:

- Normalizar estados operativos: `Pendiente`, `Asignada`, `En proceso`, `Control calidad`, `Terminada`, `Entregada`, manteniendo compatibilidad con `Prioritaria` legacy.
- Exponer responsable/operario en API y UI.
- Validar `operarioId` contra trabajador activo cuando se informa.
- Mejorar detalle ODT con venta origen, responsable, fechas y avance.

QA:

- Crear ODT desde venta.
- Editar estado, prioridad, plazo y operario.
- Reabrir detalle y verificar persistencia.
- Smoke ODT list/detail.

## Sprint 2 - Produccion avanzada y operario

Objetivo: registrar avance productivo visible y auditable.

Cambios esperados:

- Acciones rapidas de estado: asignar, iniciar, pasar a control calidad, terminar, entregar, reabrir.
- Auto-fechas: `fechaInicio` al iniciar, `fechaTermino` al terminar/entregar.
- Bitacora con responsable y evento de cambio de estado.
- UI clara para carga de trabajo por responsable.

QA:

- Cambiar estados secuencialmente.
- Confirmar bitacora/eventos.
- Confirmar fechas.
- Confirmar filtros por responsable/estado.

## Sprint 3 - Materiales y consumo de produccion

Objetivo: conectar ODT con consumo de materiales.

Cambios esperados:

- Registrar consumo desde ODT para producto, material taller o tela.
- Descontar stock con transaccion.
- Crear historial trazable con `odtId`, usuario, origen y cantidad.
- Rechazar consumo sin stock suficiente o sin ODT valida.

QA:

- Consumir producto/material/tela desde ODT.
- Ver historial por ODT.
- Rechazar stock insuficiente.
- Auditoria sin huerfanos nuevos.

## Sprint 4 - Despacho/logistica trazable

Objetivo: cerrar despacho contra venta/ODT.

Cambios esperados:

- Crear despacho desde ODT o venta con trazabilidad coherente.
- Guias asociadas al mismo origen.
- Estados parcial/total consistentes.
- Filtros por orden, ODT, comuna, cliente, estado.

QA:

- Crear despacho parcial y total.
- Asociar guia.
- Ver despacho desde venta y ODT.
- Validar rechazo de ODT cruzada.

## Sprint 5 - RRHH operativo minimo

Objetivo: que RRHH alimente la operacion.

Cambios esperados:

- Trabajadores activos disponibles para asignar a ODT.
- Filtro por cargo/empresa/activo.
- Vista de carga operacional por trabajador.
- Permisos `rrhh` y `taller` respetados.

QA:

- Trabajador activo aparece como asignable.
- Trabajador inactivo no aparece para nuevas asignaciones.
- Filtros RRHH y taller funcionan.
- Smoke RRHH OK.

## Sprint 6 - QA operacional end-to-end

Objetivo: validar el flujo completo.

Flujo:

1. Crear venta.
2. Crear ODT desde venta.
3. Asignar responsable.
4. Cambiar estados de produccion.
5. Registrar bitacora.
6. Consumir materiales.
7. Crear despacho.
8. Asociar guia.
9. Validar estados finales.
10. Revisar reportes/smoke.

Entregables:

- Smoke productivo OK.
- Informe cierre Fase 3 Operaciones.
- Riesgos residuales y backlog siguiente: Fase 4 IA/MercadoPublico.
