# Plan de evolucion por sprints - 2026-05-21

## Regla de avance

Cada sprint se trabaja con agentes en paralelo cuando haya frentes independientes. El sprint solo queda aprobado cuando pasan:

- Build frontend.
- Prisma validate.
- Tests focalizados del sprint.
- Smoke API o smoke de produccion/staging segun corresponda.
- Revision UI en navegador para pantallas tocadas.
- Resumen de riesgos residuales aceptados.

## Sprint 1 - QA grande y matriz de riesgos

Objetivo: asegurar que lo desplegado esta vivo, documentar brechas reales y corregir bloqueos evidentes de uso.

Frentes:

- Backend/flujos: ventas, licitaciones, stock mixto, cliente/sucursal, caja y despachos.
- Frontend/UI: navegacion, tablas, formularios, responsive y estados.
- Operacion/deploy: workflow, smoke, backup, migraciones y criterios de produccion.

Cierre esperado:

- Smoke productivo API 24/24.
- UI mobile sin overflow global en rutas criticas.
- Matriz QA consolidada.
- Backlog claro para Sprint 2.

## Sprint 2 - Stock, despacho y caja trazables

Objetivo: cerrar la cadena operacional desde venta hasta stock/despacho/caja.

Frentes:

- Stock: ingreso mixto, egresos, idempotencia, rollback y auditoria de movimientos.
- Despacho/guias: vinculo orden/ODT, despacho parcial, estados y trazabilidad.
- Caja: pago de venta por ruta correcta, abonos, sobrepagos, turnos cerrados y cierre.
- UI operacional: pantallas de stock, caja y despacho con estados claros.

Criterios:

- Smokes write controlados en staging/local.
- Tests de negativos: cruce ODT/orden, sobrepago, reaplicar stock, egreso invalido.
- Auditoria sin huerfanos nuevos.

## Sprint 3 - Roles, permisos y auditoria sensible

Objetivo: impedir acciones sensibles fuera de rol y dejar rastro auditable.

Frentes:

- Matriz de permisos por rol.
- Backend RBAC para endpoints write/delete/admin.
- UI: ocultar o deshabilitar acciones no permitidas.
- Auditoria: cambios de venta, caja, stock, despacho, usuarios y permisos.

Criterios:

- E2E RBAC por rol.
- Smoke solo_lectura y roles operativos.
- Revision UI con usuarios de permisos distintos.

## Sprint 4 - Reporteria gerencial

Objetivo: transformar los datos operativos en reportes confiables.

Frentes:

- Ventas por periodo, cliente, vendedor y tipo.
- Cuentas por cobrar y caja.
- Stock critico y movimientos.
- Licitaciones ganadas/perdidas.
- Taller/despachos pendientes.

Criterios:

- Totales cruzados contra endpoints fuente.
- Export CSV validado.
- UI filtrable y legible en desktop/tablet.

## Sprint 5 - Saneamiento legacy controlado

Objetivo: limpiar deuda de datos sin romper historial.

Frentes:

- Clientes/proveedores duplicados.
- Productos/codigos legacy.
- Stocks negativos y fechas anomalas.
- Ordenes ambiguas y precios negativos.
- Dry-run, reporte y aplicacion controlada.

Criterios:

- Dry-run con conteos antes/despues.
- Backup previo.
- Migracion reversible o script de rollback documentado.
- Auditoria final sin empeorar hallazgos.

## Sprint 6 - Operacion productiva repetible

Objetivo: que deploy, backup, smoke y monitoreo sean rutina.

Frentes:

- Deploy con smoke funcional posterior, no solo health.
- Backup registrado y restore-check.
- Logs PM2/API y alertas basicas.
- Checklist release.
- E2E minimo no destructivo.

Criterios:

- Workflow falla si smoke funcional falla.
- Evidencia de backup y smoke por deploy.
- Runbook productivo actualizado.
