# Sprint 5 - Smoke staging post-limpieza

Fecha: 2026-05-18
Proyecto: Plastimar ERP
Rama: `codex/sprint-5-staging-smoke`
Base staging: `plastimar_erp_sprint4_20260518`
Backend temporal: `/tmp/plastimar-smoke/backend` durante la prueba, eliminado al finalizar
Artefactos VPS: `/tmp/plastimar-sprint5-smoke`
Estado final: smoke API y build frontend aprobados.

## Objetivo

Validar que el ERP levanta y responde correctamente contra la base staging ya limpiada en Sprint 4, antes de decidir si se pasa a produccion.

Alcance:

- Backend actual del repo, no el despliegue viejo.
- Base staging `plastimar_erp_sprint4_20260518`.
- Flujos API read-only principales.
- Login y RBAC basico.
- Integridad post-limpieza.
- Build frontend.

No se modifico produccion. El unico write funcional del smoke fue login/session en staging.

## Preparacion

Se subio una copia temporal del backend actual a `/tmp/plastimar-smoke/backend` en el VPS y se apunto `DATABASE_URL` a staging.

Validaciones previas:

| Check | Resultado |
| --- | --- |
| `npx prisma validate` contra staging | OK |
| Backend temporal health | OK |
| Usuario admin staging | `admin@plastimar.cl` activo |
| Usuario solo lectura staging | `solo_lectura@plastimar.cl` activo |

Warning Prisma:

`npx prisma migrate status` no queda limpio porque el historial de migraciones del dump productivo y el repo local divergen:

- Local pendiente: `20260518093000_add_audit_log_and_pago_stock_aplicado`
- Local pendiente: `20260518113000_schema_coherence_operational`
- En la DB existen entradas `20260514082851_add_legacy_completeness` que no estan localmente.

Este warning no bloqueo el smoke runtime, pero si bloquea cualquier idea de ejecutar `migrate deploy` directo en staging/produccion sin reconciliar historial.

## Resultado smoke API

Reporte: `/tmp/plastimar-sprint5-smoke/smoke-report.json`

| Indicador | Resultado |
| --- | ---: |
| Checks ejecutados | 24 |
| Checks aprobados | 24 |
| Fallos | 0 |

Checks aprobados:

| Area | Resultado |
| --- | --- |
| Health | OK |
| Login admin | OK |
| RBAC `solo_lectura` lee productos | OK |
| RBAC `solo_lectura` no crea productos | OK, 403 esperado |
| Dashboard stats | OK |
| Productos listado | OK, 500 items |
| Productos detalle | OK, id `26465` |
| Clientes listado | OK, 500 items |
| Clientes detalle | OK, id `2695` |
| Ventas listado | OK, 100 items |
| Ventas detalle | OK, id `16447` |
| ODT listado | OK, 100 items |
| ODT detalle | OK, id `5` |
| ODT bitacora | OK |
| Cobranza historico | OK, 100 items |
| Cobranza ejecutivas | OK, 17 items |
| Despachos listado | OK, 28 items |
| Guias despacho | OK, 100 items |
| Matriz ventas | OK, 100 items |
| Matriz totales | OK |
| Reporte stock critico | OK |
| RRHH resumen | OK |
| RRHH trabajadores | OK, 37 items |
| Admin auditoria | OK, 4 items |

## Integridad post-limpieza via API

El smoke valido `GET /api/admin/integridad/resumen` contra staging:

| Indicador | Resultado esperado | Resultado smoke |
| --- | ---: | ---: |
| `orden_items_huerfanos` | 6.143 | 6.143 |
| `odt_items_huerfanos` | 200 | 200 |
| `productos_stock_negativo` | 167 | 167 |

Estos valores coinciden con Sprint 4 despues de aplicar 2.595 correcciones de `producto_id`.

## Resultado frontend

Comando local:

```bash
npm.cmd run build
```

Resultado:

- Build Vite OK.
- 217 modulos transformados.
- Bundle JS principal: 845,23 kB.
- Warning conocido: chunk mayor a 500 kB. No bloquea smoke, pero conviene abordar code-splitting despues.

## Seguridad y limpieza

Durante el smoke se detecto que `src/app.js` escuchaba siempre en `0.0.0.0`. Se agrego soporte para `HOST`, manteniendo el default actual:

```env
HOST=0.0.0.0
```

Para futuros smoke se debe usar:

```env
HOST=127.0.0.1
PORT=3101
```

Limpieza ejecutada:

- Backend temporal detenido.
- Puerto `3101` verificado sin listener.
- Copia temporal `/tmp/plastimar-smoke` eliminada.
- Tar temporal eliminado.
- Scripts temporales removidos.
- Evidencia conservada en `/tmp/plastimar-sprint5-smoke`.

## Validacion local

Comandos:

```bash
node --check backend/src/app.js
node --check backend/scripts/staging-smoke.mjs
npm.cmd test -- --run test/app.test.js test/data-integrity-audit.test.js
npm.cmd test -- --run test/data-cleanup-plan.test.js test/producto-orphan-cleanup.test.js test/rut-duplicates-cleanup.test.js test/stock-negative-dates.test.js test/data-integrity-audit.test.js
```

Resultados:

- Sintaxis OK.
- `test/app.test.js` y `test/data-integrity-audit.test.js`: 9 pruebas OK.
- Suites focales de limpieza/auditoria: 38 pruebas OK.

## Decision

Desde smoke funcional, staging queda aprobado para pasar a la siguiente decision.

Antes de produccion, quedan dos opciones:

1. Hacer smoke visual con frontend servido contra backend staging usando `HOST=127.0.0.1` y tunnel local.
2. Preparar apply productivo controlado con backup fresco, ventana acordada y los mismos scripts/conteos de Sprint 4.

Bloqueador tecnico pendiente: reconciliar o documentar formalmente la divergencia del historial Prisma antes de cualquier `migrate deploy` productivo.
