# Sprint 4 - Staging y paquete de aprobacion a produccion

Fecha: 2026-05-18
Proyecto: Plastimar ERP
Rama: `codex/sprint-4-staging-cleanup`
Base staging: `plastimar_erp_sprint4_20260518`
Backup productivo usado: `/var/backups/plastimar/db/plastimar_erp_2026-05-18_132516.dump`
Artefactos VPS: `/tmp/plastimar-sprint4/artifacts`
Estado final: staging validado; produccion pendiente de aprobacion operacional.

## Objetivo

Validar en staging las limpiezas reversibles preparadas en Sprint 3:

- `producto_id` huerfano en items de venta y taller, solo con match exacto por `codigo_interno`.
- Formato automatico de RUT validos y unicos.
- Auditoria de stock negativo y fechas anomalas sin auto-fix.
- Comparacion de auditoria general antes/despues.

No se modifico la base productiva `plastimar_erp`.

## Preparacion de staging

| Campo | Resultado |
| --- | --- |
| Base productiva original | `plastimar_erp` |
| Base staging creada | `plastimar_erp_sprint4_20260518` |
| Restore desde dump | OK |
| Tamano staging restaurado | 362 MB |
| Usuario de conexion | `plastimar` |
| Schemas verificados | `auth`, `bodega`, `caja`, `catalogo`, `clientes`, `config`, `rrhh`, `taller`, `ventas` |
| Backup staging antes del apply | `/tmp/plastimar-sprint4/artifacts/staging-before-cleanup.dump` |

Conteo de tablas por schema en staging:

| Schema | Tablas |
| --- | ---: |
| `auth` | 5 |
| `bodega` | 3 |
| `caja` | 5 |
| `catalogo` | 11 |
| `clientes` | 4 |
| `config` | 3 |
| `rrhh` | 16 |
| `taller` | 12 |
| `ventas` | 15 |

La base staging fue restaurada desde dump productivo, no creada desde migraciones limpias. Esto importa porque RRHH existe en el dump pero no esta completamente formalizado en migraciones Prisma.

## Hallazgo previo bloqueante

Existe codigo duplicado `PACK4` en `catalogo.productos`, pero no toca filas huerfanas corregibles:

| Codigo | Productos con mismo codigo | Filas huerfanas afectadas |
| --- | ---: | ---: |
| `PACK4` | 2 | 0 |

Decision Sprint 4: no tocar `PACK4` en staging porque no bloquea los 2.595 matches exactos. Debe quedar como limpieza manual de catalogo en un sprint posterior.

## Auditoria general antes/despues

| Indicador | Antes staging | Despues staging | Delta | Estado |
| --- | ---: | ---: | ---: | --- |
| Checks ejecutados | 52 | 52 | 0 | OK |
| Errores de ejecucion | 0 | 0 | 0 | OK |
| Hallazgos totales | 68.022 | 65.427 | -2.595 | OK |
| Criticos | 9.520 | 6.925 | -2.595 | OK |
| Warnings | 58.502 | 58.502 | 0 | OK |

Foco por check:

| Check | Antes | Despues | Delta |
| --- | ---: | ---: | ---: |
| `orden_items.producto_id_huerfano` | 8.676 | 6.143 | -2.533 |
| `taller.odt_items_producto_id_huerfano` | 262 | 200 | -62 |
| `clientes.rut_duplicado_normalizado` | 403 | 403 | 0 |
| `proveedores.rut_duplicado_normalizado` | 10 | 10 | 0 |
| `productos.stock_negativo` | 167 | 167 | 0 |
| `telas.stock_negativo` | 1 | 1 | 0 |
| `fechas.operacionales_anomalas` | 7.616 | 7.616 | 0 |

La baja de criticos viene exclusivamente de referencias de producto corregidas. RUT formato seguro no cambia los checks de duplicidad porque no fusiona ni elimina duplicados reales.

## Limpieza productos huerfanos

Dry-run previo:

| Tabla | Correcciones seguras | Manual / omitidas |
| --- | ---: | ---: |
| `ventas.orden_items` | 2.533 | 6.143 |
| `taller.odt_items` | 62 | 200 |
| Total | 2.595 | 6.343 |

Apply en staging:

| Indicador | Resultado |
| --- | ---: |
| Filas aplicadas | 2.595 |
| Transaccion parcial | No |
| SQL reverso generado | Si |
| Exact matches pendientes despues | 0 |
| Huerfanos manuales restantes | 6.343 |

Se corrigio un borde del script durante Sprint 4: algunos codigos legacy venian con tabulacion inicial, por ejemplo `"\t PUMAD4030-1"`. JavaScript los consideraba seguros por `trim()`, pero PostgreSQL `trim()` no elimina tabs por defecto. La revalidacion SQL del apply ahora usa trim de whitespace POSIX para alinear el criterio con la clasificacion previa.

## Limpieza RUT safe_format_only

Dry-run previo:

| Entidad | Filas revisadas | Formato automatico | Manuales |
| --- | ---: | ---: | ---: |
| `clientes` | 16.945 | 2.555 | 1.093 |
| `proveedores` | 788 | 719 | 63 |
| Total | 17.733 | 3.274 | 1.156 |

Apply en staging:

| Indicador | Resultado |
| --- | ---: |
| Filas formateadas | 3.274 |
| Resultados apply | 3.274 |
| `safe_format_only` pendientes despues | 0 |
| Manuales restantes | 1.156 |

Clasificaciones manuales despues del apply:

| Clasificacion | Filas |
| --- | ---: |
| `real_duplicate` | 841 |
| `invalid` | 275 |
| `placeholder_empty` | 24 |
| `placeholder_zero` | 16 |

No se fusionaron clientes/proveedores, no se reasignaron ventas, cobranzas, ODT ni pagos. Solo se normalizo puntuacion/case de RUT validos y unicos.

## Stock negativo y fechas anomalas

Auditoria especializada en staging, dry-run:

| Grupo | Resultado |
| --- | ---: |
| Stock negativo especializado | 101 |
| Fechas anomalas | 247 |
| Columnas de fecha escaneadas | 108 |
| Errores de stock | 0 |
| Errores de fechas | 0 |
| Fechas modificadas | 0 |

Tipos de fechas:

| Tipo | Cantidad |
| --- | ---: |
| `pre_2000` | 55 |
| `sentinel_1970` | 120 |
| `sentinel_0001` | 8 |
| `future_extreme` | 64 |

Decision Sprint 4: no aplicar cambios automaticos de stock ni fechas. Stock requiere ajuste inventariado con respaldo operacional. Fechas requieren aprobacion de negocio por campo.

## Validacion ejecutada

En VPS staging:

- Restore del dump productivo: OK.
- Verificacion de DB conectada: `plastimar_erp_sprint4_20260518`.
- Backup staging antes del apply: OK.
- Auditoria general baseline: 52/52 checks OK.
- Producto dry-run: 2.595 candidatos seguros.
- Producto apply: 2.595 filas aplicadas.
- Producto post dry-run: 0 candidatos exactos pendientes.
- RUT dry-run: 3.274 formato seguro.
- RUT apply: 3.274 filas actualizadas.
- RUT post dry-run: 0 formato seguro pendiente.
- Auditoria general post: 52/52 checks OK, criticos -2.595.

En local:

```bash
node --check backend/scripts/cleanup-producto-orphans.mjs
npm.cmd test -- --run test/producto-orphan-cleanup.test.js test/data-cleanup-plan.test.js
```

Resultado:

- Sintaxis OK.
- 2 archivos de pruebas OK.
- 13 pruebas OK.

Pendiente:

- Smoke funcional con backend/frontend apuntando a staging. Este Sprint 4 valido datos y scripts; no se levanto una app staging publica.

## Artefactos generados

Principales archivos en `/tmp/plastimar-sprint4/artifacts`:

| Archivo | Uso |
| --- | --- |
| `baseline-data-audit.json` | Auditoria general antes |
| `post-data-audit.json` | Auditoria general despues |
| `staging-before-cleanup.dump` | Backup staging previo al apply |
| `product-dryrun/producto-orphans-plan.json` | Plan producto previo |
| `product-apply/producto-orphans-applied.json` | Producto aplicado y reversa |
| `product-post/producto-orphans-plan.json` | Producto despues |
| `rut-dryrun.json` / `rut-dryrun.csv` | Plan RUT previo |
| `rut-apply.json` | RUT aplicado |
| `rut-post.json` | RUT despues |
| `stock-dates-dryrun.json` | Stock/fechas dry-run |
| `sprint4-summary.json` | Resumen consolidado |

## Criterio para aprobar produccion

Produccion se puede aprobar solo si:

- Se toma backup productivo fresco inmediatamente antes del apply real.
- Se aplica exactamente el mismo codigo validado en staging.
- El apply de productos modifica 2.595 filas como maximo, o cualquier diferencia queda justificada y aprobada antes de ejecutar.
- El apply de RUT modifica 3.274 filas como maximo, solo `safe_format_only`.
- No se toca `PACK4` automaticamente.
- No se aplican cambios automaticos de stock ni fechas.
- El auditor post-produccion mantiene 52/52 checks OK y reduce criticos en 2.595 sin aumentar warnings.
- Se conserva JSON/CSV del plan, resultado aplicado y reversa.
- El socio revisa muestras de ventas, ODT, clientes y proveedores.
- Hay ventana de baja actividad y criterio de rollback acordado.

Bloquear produccion si:

- La base objetivo no es verificada explicitamente antes del apply.
- Cambian los conteos esperados.
- Aparecen errores en auditoria.
- Falta backup previo.
- Se detectan colisiones nuevas de RUT.
- El cliente no aprueba tocar datos historicos.

## Siguiente paso recomendado

Sprint 5 deberia ser "apply productivo controlado" o "smoke staging app", segun el nivel de riesgo aceptado:

1. Opcion conservadora: levantar backend/frontend staging contra `plastimar_erp_sprint4_20260518` y validar flujos visuales con muestras corregidas.
2. Opcion operativa: preparar ventana de produccion y aplicar solo los dos cambios ya validados: 2.595 `producto_id` y 3.274 formatos RUT.
