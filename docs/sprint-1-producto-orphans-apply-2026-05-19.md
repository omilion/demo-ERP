# Sprint 1 apply producto huerfano - 2026-05-19

## Estado

Primer lote de saneamiento aplicado en produccion.

Alcance aplicado:

- Solo `producto_id` huerfano en `ventas.orden_items` y `taller.odt_items`.
- Solo filas cuyo `codigo_interno` normalizado coincide con exactamente un producto en `catalogo.productos`.
- No se tocaron items sin match en catalogo.
- No se tocaron precios negativos, clientes, guias, bitacora ni stock historico.

## Backup

Backup previo creado y verificado:

- Archivo: `/var/backups/plastimar/db/plastimar_erp_20260519_005056_pre_sprint1_producto_orphans.dump`
- Tamano: `83M`
- SHA256: `b52b1ae3a146d3d99eeea6e66db387be5e3edf9a58685fa4330899584d3b5110`
- Verificacion: `pg_restore --list` OK

## Auditoria de apply

Se creo tabla de auditoria:

- `migration_audit.sprint1_producto_orphans_20260519_005056`

Campos relevantes guardados por fila:

- `source_table`
- `row_id`
- `parent_id`
- `old_producto_id`
- `new_producto_id`
- `codigo_interno`
- `normalized_code`
- `item_nombre`
- `matched_codigo_interno`
- `matched_nombre`
- `rule`
- `reverse_sql`
- `applied_at`

Regla aplicada:

`exact_normalized_codigo_interno_single_catalog_match`

## Resultado aplicado

| Tabla | Antes huerfanos | Aplicados | Despues huerfanos |
| --- | ---: | ---: | ---: |
| `ventas.orden_items` | 8676 | 2526 | 6150 |
| `taller.odt_items` | 262 | 62 | 200 |
| **Total** | **8938** | **2588** | **6350** |

Validacion de auditoria:

| Check | Resultado |
| --- | ---: |
| Filas auditadas total | 2588 |
| Auditadas `ventas.orden_items` | 2526 |
| Auditadas `taller.odt_items` | 62 |
| Huerfanos restantes con match exacto | 0 |

## Auditoria posterior

`backend/scripts/data-integrity-audit.mjs --json`

| Metrica | Antes | Despues | Delta |
| --- | ---: | ---: | ---: |
| Checks totales | 52 | 52 | 0 |
| Checks OK | 52 | 52 | 0 |
| Errores | 0 | 0 | 0 |
| Hallazgos totales | 68022 | 65434 | -2588 |
| Criticos | 9520 | 6932 | -2588 |
| Warnings | 58502 | 58502 | 0 |

Por area despues:

| Area | Hallazgos |
| --- | ---: |
| clientes | 403 |
| proveedores | 3706 |
| productos | 217 |
| taller | 202 |
| ventas | 53290 |
| fechas | 7616 |

## Smoke API

Smoke ejecutado contra produccion con conteos esperados actualizados:

```bash
node scripts/staging-smoke.mjs \
  --base-url=http://127.0.0.1:${PORT:-3001} \
  --expect-orden-items-huerfanos=6150 \
  --expect-odt-items-huerfanos=200 \
  --expect-productos-stock-negativo=167
```

Resultado:

- `API smoke OK: 24/24`
- Health OK
- Login admin OK
- RBAC solo lectura OK
- Dashboard, productos, clientes, ventas, ODT, cobranza, despachos, matriz, reportes, RRHH, integridad y auditoria OK
- Detalles de producto, cliente, venta y ODT/bitacora OK

## Rollback

Rollback disponible fila por fila en:

```sql
SELECT reverse_sql
FROM migration_audit.sprint1_producto_orphans_20260519_005056
WHERE run_id = 'sprint1_producto_orphans_20260519_005056'
ORDER BY audit_id;
```

Tambien existe backup completo previo al apply.

## Pendiente despues del lote

No se corrigieron automaticamente:

- `ventas.orden_items`: 6150 huerfanos restantes sin match en catalogo.
- `taller.odt_items`: 200 huerfanos restantes sin match en catalogo.
- `ventas.orden_items`: 688 precios negativos.
- `ventas.ordenes`: 6686 mismatch RUT vs `cliente_id`; 4898 candidatos con RUT unico.
- `bodega.guias_despachos`: 7558 fechas `1970-01-01`.
- `taller.bitacora_taller`: 12740 registros sin `odt_id`, no aptos para backfill automatico masivo.
- `movimientos_stock` legacy: pendiente de diseno como `stock_lecturas`.

## Siguiente lote recomendado

Preparar apply controlado de `ventas.ordenes.cliente_id` para los 4898 candidatos cuyo `rut_cliente` normalizado apunta a exactamente un cliente destino.

Requisitos antes de aplicar:

1. Backup nuevo.
2. Tabla de auditoria con `old_cliente_id`, `new_cliente_id`, `rut_cliente`, `old_rut`, `new_rut`, `reverse_sql`.
3. Dry-run final.
4. Apply transaccional.
5. Auditoria de saldos/cobranza posterior.
