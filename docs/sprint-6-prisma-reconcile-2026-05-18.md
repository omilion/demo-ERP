# Sprint 6 - Reconciliacion historial Prisma

Fecha: 2026-05-18
Proyecto: Plastimar ERP
Rama: `codex/sprint-6-prisma-reconcile`
Base staging: `plastimar_erp_sprint4_20260518`
Artefactos VPS: `/tmp/plastimar-sprint6-prisma`
Estado final: reconciliacion validada en staging; produccion pendiente de aprobacion.

## Objetivo

Desbloquear el riesgo detectado en Sprint 5: `npx prisma migrate status` no estaba limpio por divergencia entre el historial local de migraciones y la tabla `public._prisma_migrations` de la base.

No se modifico produccion.

## Diagnostico

El repo local contiene 12 migraciones:

- Hasta `20260515013000_add_usuarios_web_banners` coinciden con DB.
- Local tiene `20260514082927_add_legacy_completeness`.
- DB tenia dos filas fantasma con nombre `20260514082851_add_legacy_completeness`.
- Local tenia dos migraciones pendientes:
  - `20260518093000_add_audit_log_and_pago_stock_aplicado`
  - `20260518113000_schema_coherence_operational`

Historial problematico observado en produccion y staging:

| Migracion DB | Estado |
| --- | --- |
| `20260514082851_add_legacy_completeness` | fila fallida |
| `20260514082927_add_legacy_completeness` | aplicada |
| `20260514082851_add_legacy_completeness` | aplicada duplicada con mismo checksum que `20260514082927` |

Interpretacion: el schema fisico siguio adelante, pero la tabla de historial quedo con dos registros extra de una migracion mal nombrada.

## Probes fisicos antes de reconciliar

Produccion y staging tenian el mismo estado fisico relevante:

| Probe | Resultado |
| --- | --- |
| `auth.audit_log` existe | Si |
| `auth.audit_log.payload` existe | Si |
| `catalogo.pagos_proveedores.stock_aplicado_at` existe | No |
| `ventas.cotizacion_licitacion.descuento_pct` existe | Si |
| `ventas.crm_registros.estado` es `text` | Si |
| FK `bodega.guias_despachos_orden_id_fkey` existe | Si |
| FK `bodega.despachos_orden_id_fkey` existe | Si |

Conclusion: la segunda migracion pendiente necesitaba principalmente registrar historia porque los cambios ya existian fisicamente. La primera migracion pendiente si agregaba al menos `stock_aplicado_at`.

## Reconciliacion ejecutada en staging

Se ejecuto solo contra `plastimar_erp_sprint4_20260518`.

Pasos:

1. Copia temporal del backend actual en `/tmp/plastimar-prisma-reconcile/backend`.
2. `npx prisma migrate status` inicial: falla por historia divergente.
3. Backup de `public._prisma_migrations`:

```sql
CREATE TABLE public."_prisma_migrations_backup_sprint6_20260518" AS
TABLE public._prisma_migrations;
```

4. Delete de filas fantasma en staging:

```sql
DELETE FROM public._prisma_migrations
WHERE migration_name = '20260514082851_add_legacy_completeness';
```

Resultado: `DELETE 2`.

5. `npx prisma migrate status`: queda con solo dos migraciones pendientes.
6. `npx prisma migrate deploy`: aplica correctamente:
   - `20260518093000_add_audit_log_and_pago_stock_aplicado`
   - `20260518113000_schema_coherence_operational`
7. `npx prisma migrate status`: `Database schema is up to date!`

## Resultado staging

| Check | Resultado |
| --- | --- |
| Backup de historial creado | OK |
| Filas fantasma eliminadas | 2 |
| `migrate deploy` | OK |
| `migrate status final` | OK |
| `stock_aplicado_at` existe despues | Si |
| `auth.audit_log` existe despues | Si |
| Filas finales `_prisma_migrations` | 12 |
| Filas backup `_prisma_migrations_backup_sprint6_20260518` | 12 |

Auditoria post-reconcile:

| Indicador | Resultado |
| --- | ---: |
| Checks | 52/52 OK |
| Errores | 0 |
| Hallazgos totales | 65.427 |
| Criticos | 6.925 |
| Warnings | 58.502 |

La auditoria de datos no empeoro respecto a Sprint 5.

## Runbook productivo propuesto

No ejecutar sin aprobacion explicita y backup fresco.

Precondiciones:

- Ventana de baja actividad.
- Backup productivo `pg_dump -Fc` tomado y verificado.
- Confirmar que `DATABASE_URL` apunta a `plastimar_erp`.
- Tener a mano rollback: restore del dump o restauracion de tabla `_prisma_migrations` desde backup.
- No mezclar con apply de limpieza de datos en la misma transaccion operativa.

Pasos productivos recomendados:

```bash
npx prisma migrate status
```

Debe mostrar exactamente:

- dos filas DB no locales `20260514082851_add_legacy_completeness`;
- dos migraciones locales pendientes `20260518093000...` y `20260518113000...`.

Luego:

```sql
CREATE TABLE public."_prisma_migrations_backup_sprint6_20260518" AS
TABLE public._prisma_migrations;

DELETE FROM public._prisma_migrations
WHERE migration_name = '20260514082851_add_legacy_completeness';
```

Validar:

```bash
npx prisma migrate status
```

Debe quedar solo:

- `20260518093000_add_audit_log_and_pago_stock_aplicado`
- `20260518113000_schema_coherence_operational`

Aplicar:

```bash
npx prisma migrate deploy
npx prisma migrate status
```

Validar probes:

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='catalogo'
    AND table_name='pagos_proveedores'
    AND column_name='stock_aplicado_at'
) AS stock_aplicado_at;

SELECT to_regclass('auth.audit_log') IS NOT NULL AS audit_log;
```

Validar auditoria:

```bash
npm run data:audit -- --json --samples=0 --no-fail
```

## Riesgos

- Tocar `public._prisma_migrations` es delicado. Se debe hacer solo porque staging demostro que las dos filas son fantasma y el schema fisico ya corresponde a la migracion correcta `20260514082927`.
- Si el estado productivo cambia antes de ejecutar, hay que repetir inspeccion.
- No ejecutar `migrate deploy` hasta que `migrate status` deje de reportar migraciones DB no locales.
- No aplicar limpieza de datos productiva en la misma ventana que una reconciliacion Prisma sin plan de rollback separado.

## Siguiente paso recomendado

Sprint 7: ejecutar esta reconciliacion en produccion con backup fresco. Despues de eso queda habilitado el apply productivo controlado de las limpiezas ya validadas:

- `2.595` `producto_id` huerfanos corregibles.
- `3.274` RUT `safe_format_only`.
