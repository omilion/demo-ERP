# Cierre Sprints 1-6 - Plastimar ERP

Fecha: 2026-05-18
Rama GitHub: `codex/sprint-6-prisma-reconcile`
Base remota: `origin/main`
Estado: listo para revision, no desplegado en produccion.

## Resumen ejecutivo

Los Sprints 1 a 6 quedaron cerrados en Git, validados localmente y con evidencia de staging en VPS. La base productiva no fue modificada con limpiezas de datos. El siguiente paso no debe ser un deploy directo: primero corresponde revision/PR, merge controlado y luego ventana productiva con backup fresco.

## Commits cerrados

| Sprint | Commit | Estado | Objetivo |
| --- | --- | --- | --- |
| Sprint 1 | `8638212` | Cerrado | Estabilizacion base ERP, RBAC/JWT, auditoria, fotos, pasar-taller y mejoras operativas iniciales |
| Sprint 2 | `fc32f15` | Cerrado | Integridad de datos, deploy mas seguro, auditor general y flujos operativos |
| Sprint 3 | `dae6820` | Cerrado | Planes de limpieza controlada: productos huerfanos, RUT, stock y fechas |
| Sprint 4 | `56f649e` | Cerrado | Restore staging, apply reversible en staging y comparacion antes/despues |
| Sprint 5 | `251c9ee` | Cerrado | Smoke staging API/build frontend y script reusable `smoke:staging` |
| Sprint 6 | `962a0b0` | Cerrado | Reconciliacion de historial Prisma validada en staging |

## Evidencia por sprint

### Sprint 1 - Estabilizacion

Resultado:

- JWT con payload ERP y validacion de audience/scope.
- RBAC reforzado.
- Rutas y helpers de productos/fotos normalizados.
- Pasar a taller y stock proveedor con controles de idempotencia.
- Auditoria inicial.
- Mejoras frontend de permisos y navegacion.

Validacion registrada:

- Backend checks focales OK.
- Prisma validate/generate OK.
- Frontend build OK.
- Lint focal OK.

Pendiente:

- El lint global frontend mantiene deuda preexistente.

### Sprint 2 - Integridad y flujos

Documento: `docs/sprint-2-integridad-flujos-2026-05-18.md`

Resultado:

- Workflow deploy mas seguro.
- Migracion `20260518113000_schema_coherence_operational`.
- Auditor general `data-integrity-audit`.
- Hardening de caja, cobranza, despachos, matriz ventas, ODT y ventas.
- UX operacional con filtros y rutas read-only.

Validacion:

- Auditor VPS inicial: 52/52 checks OK, 0 errores.
- 68.022 hallazgos, 9.520 criticos.
- Tests focales backend OK.
- Frontend build OK.

Pendiente:

- Hallazgos legacy no corregibles automaticamente quedaron para sprints posteriores.

### Sprint 3 - Limpieza controlada

Documento: `docs/sprint-3-limpieza-datos-2026-05-18.md`

Resultado:

- Script consolidado `data-cleanup-plan`.
- Script especifico `cleanup-producto-orphans`.
- Script `rut-duplicates-cleanup`.
- Script `stock-negative-dates-audit`.
- Tests unitarios para todos.

Hallazgos reales VPS:

| Area | Resultado |
| --- | ---: |
| Productos huerfanos inspeccionados | 8.938 |
| Producto exact-match automatizable | 2.595 |
| Producto manual | 6.343 |
| RUT filas revisadas | 17.733 |
| RUT formato automatico | 3.274 |
| RUT manual | 1.156 |

Validacion:

- 5 suites focales OK.
- 38 pruebas OK.
- Dry-run VPS OK.

Pendiente:

- No ejecutar `apply` en produccion sin staging y backup.

### Sprint 4 - Staging y apply reversible

Documento: `docs/sprint-4-staging-produccion-2026-05-18.md`

Resultado:

- Base staging `plastimar_erp_sprint4_20260518` restaurada desde dump productivo.
- Apply staging productos: 2.595 filas.
- Apply staging RUT formato seguro: 3.274 filas.
- Criticos bajaron de 9.520 a 6.925 en staging.

Validacion:

| Indicador | Antes | Despues | Delta |
| --- | ---: | ---: | ---: |
| Hallazgos totales | 68.022 | 65.427 | -2.595 |
| Criticos | 9.520 | 6.925 | -2.595 |
| Warnings | 58.502 | 58.502 | 0 |

Pendiente:

- Produccion aun no fue modificada.
- `PACK4` sigue duplicado, pero afecta 0 huerfanos exactos.

### Sprint 5 - Smoke staging

Documento: `docs/sprint-5-staging-smoke-2026-05-18.md`

Resultado:

- Backend temporal contra staging.
- Smoke API 24/24 OK.
- Frontend build OK.
- `HOST` configurable para futuros smoke.
- Script reusable `backend/scripts/staging-smoke.mjs`.

Checks cubiertos:

- Health.
- Login admin.
- RBAC solo lectura.
- Dashboard.
- Productos/clientes/ventas/ODT.
- Cobranza.
- Despachos/guias.
- Matriz ventas.
- RRHH.
- Admin integridad.

Pendiente:

- Smoke visual con navegador sigue siendo opcional si se quiere maxima confianza antes de produccion.

### Sprint 6 - Prisma reconcile

Documento: `docs/sprint-6-prisma-reconcile-2026-05-18.md`

Resultado:

- Diagnostico de divergencia `_prisma_migrations`.
- Reconciliacion probada solo en staging.
- Backup de `_prisma_migrations` staging.
- Eliminacion de 2 filas fantasma `20260514082851_add_legacy_completeness`.
- `npx prisma migrate deploy` OK en staging.
- `npx prisma migrate status` final limpio en staging.

Validacion:

- Auditoria post-reconcile: 52/52 checks OK, 0 errores.
- Hallazgos iguales a Sprint 5: 65.427 totales, 6.925 criticos, 58.502 warnings.

Pendiente:

- Ejecutar reconciliacion en produccion con backup fresco y aprobacion explicita.

## Estado GitHub

Rama publicada:

```text
origin/codex/sprint-6-prisma-reconcile
```

HEAD remoto validado:

```text
962a0b0 Sprint 6 reconcile Prisma history
```

Comparacion contra `origin/main`:

- 0 commits detras.
- 6 commits delante.

No se subieron:

- `.pnpm-store`
- `pnpm-lock.yaml` local
- `pnpm-workspace.yaml`
- `codex-sprint1-backup`
- dumps
- `.env`
- reportes temporales
- passwords o credenciales reales

## Evidencia en VPS

| Sprint | Ruta |
| --- | --- |
| Sprint 4 | `/tmp/plastimar-sprint4/artifacts` |
| Sprint 5 | `/tmp/plastimar-sprint5-smoke` |
| Sprint 6 | `/tmp/plastimar-sprint6-prisma` |

Staging:

```text
plastimar_erp_sprint4_20260518
```

Produccion:

```text
plastimar_erp
```

Produccion no contiene los apply de limpieza de datos.

## Bloqueadores antes de produccion

1. Revisar PR y aprobar merge.
2. Tomar backup productivo fresco.
3. Repetir inspeccion Prisma productiva.
4. Ejecutar reconciliacion Prisma productiva.
5. Deploy desde `main`.
6. Smoke produccion read-only.
7. Aplicar limpieza productiva controlada.

## Orden recomendado restante

1. Crear PR `codex/sprint-6-prisma-reconcile` -> `main`.
2. Revision de socio.
3. Merge a `main`.
4. Reconciliacion Prisma en produccion.
5. Deploy backend/frontend desde `main`.
6. Smoke produccion.
7. Apply productivo:
   - 2.595 `producto_id` huerfanos exactos.
   - 3.274 RUT `safe_format_only`.
8. Auditoria post-produccion y cierre.
