# Sprint 2 apply cliente por RUT - 2026-05-19

## Estado

Segundo lote de saneamiento aplicado en produccion.

Alcance aplicado:

- Solo `ventas.ordenes.cliente_id`.
- Solo ordenes donde `rut_cliente` normalizado apunta a exactamente un cliente destino en `clientes.clientes`.
- No se tocaron ordenes ambiguas.
- No se tocaron ordenes sin cliente destino por RUT.
- No se modificaron montos, caja, cobranza ni items.

## Backup

Backup previo creado y verificado:

- Archivo: `/var/backups/plastimar/db/plastimar_erp_20260519_010737_pre_sprint2_cliente_rut.dump`
- Tamano: `83M`
- SHA256: `8f05e4810f5ffb5a908e4bfb46d987a05b4e56fd0c63c0b58e337bfb2067ced8`
- Verificacion: `pg_restore --list` OK

## Baseline antes del apply

| Metrica | Valor |
| --- | ---: |
| Ordenes con `rut_cliente` distinto al RUT de `cliente_id` | 6686 |
| Candidatas seguras con RUT destino unico | 4898 |
| Candidatas ambiguas | 1655 |
| Sin cliente destino por RUT | 133 |
| Clientes actuales afectados | 2295 |
| Clientes destino afectados | 1970 |

Distribucion de las 4898 candidatas por ano:

| Ano | Ordenes |
| --- | ---: |
| 2016 | 8 |
| 2017 | 305 |
| 2018 | 385 |
| 2019 | 440 |
| 2020 | 591 |
| 2021 | 534 |
| 2022 | 454 |
| 2023 | 599 |
| 2024 | 715 |
| 2025 | 674 |
| 2026 | 193 |

Distribucion principal por tipo/estado:

| Tipo | Estado | Pago | Ordenes |
| --- | --- | --- | ---: |
| Venta Web | Activa | Pagada | 2075 |
| Licitacion | Activa | Pagada | 1148 |
| Convenio Marco | Activa | Pagada | 1133 |
| Venta Sala | Activa | Pagada | 367 |
| Venta Web | Nula | No pagada | 50 |
| Licitacion | Activa | No pagada | 40 |
| Licitacion | Nula | No pagada | 27 |
| Venta Web | Activa | No pagada | 20 |
| Venta Sala | Nula | No pagada | 15 |
| Convenio Marco | Nula | No pagada | 12 |
| Venta Sala | Activa | No pagada | 11 |

## Auditoria de apply

Se creo tabla de auditoria:

- `migration_audit.sprint2_cliente_rut_20260519_010737`

Campos relevantes guardados por fila:

- `orden_id`
- `n_interno`
- `old_cliente_id`
- `new_cliente_id`
- `rut_cliente`
- `order_rut_norm`
- `old_rut`
- `old_rut_norm`
- `new_rut`
- `new_rut_norm`
- `old_nombre`
- `new_nombre`
- `tipo`
- `estado`
- `estado_pago`
- `created_at`
- `rule`
- `reverse_sql`
- `applied_at`

Regla aplicada:

`rut_cliente_normalized_single_target_client`

## Resultado aplicado

| Check | Resultado |
| --- | ---: |
| Filas auditadas | 4898 |
| Filas actualizadas | 4898 |
| Auditadas que actualmente apuntan al nuevo cliente | 4898 |

Estado posterior de mismatch:

| Metrica | Antes | Despues | Delta |
| --- | ---: | ---: | ---: |
| Total mismatch RUT vs cliente | 6686 | 1788 | -4898 |
| Candidatas seguras por RUT unico | 4898 | 0 | -4898 |
| Ambiguas por RUT duplicado | 1655 | 1655 | 0 |
| Sin cliente destino por RUT | 133 | 133 | 0 |

## Verificacion posterior

Smoke API produccion:

```bash
node scripts/staging-smoke.mjs \
  --base-url=http://127.0.0.1:${PORT:-3001} \
  --expect-orden-items-huerfanos=6150 \
  --expect-odt-items-huerfanos=200 \
  --expect-productos-stock-negativo=167
```

Resultado:

- `API smoke OK: 24/24`

Auditoria general:

| Metrica | Resultado |
| --- | ---: |
| Checks totales | 52 |
| Checks OK | 52 |
| Errores | 0 |
| Hallazgos totales | 65434 |
| Criticos | 6932 |
| Warnings | 58502 |

Nota: la auditoria general no mide mismatch RUT/cliente, por eso los hallazgos generales no bajan en este sprint. La metrica especifica del sprint si bajo de 6686 a 1788.

## Rollback

Rollback disponible fila por fila:

```sql
SELECT reverse_sql
FROM migration_audit.sprint2_cliente_rut_20260519_010737
WHERE run_id = 'sprint2_cliente_rut_20260519_010737'
ORDER BY audit_id;
```

Tambien existe backup completo previo al apply.

## Pendientes para revision manual

Quedan fuera del apply automatico:

- 1655 ordenes con `rut_cliente` que apunta a mas de un cliente posible.
- 133 ordenes cuyo `rut_cliente` no tiene cliente destino en `clientes.clientes`.

Estos registros requieren validacion manual del dueno del ERP original o del equipo administrativo, porque no existe una regla unica segura para decidir el `cliente_id`.

Nota posterior de cierre 2026-05-19:

- La verificacion final conservadora de saneamiento contabiliza 1856 ordenes para revision manual: 1655 ambiguas y 201 sin cliente destino.
- Para preparar la revision con cliente usar el conteo final de `docs/reporte-final-saneamiento-migracion-2026-05-19.md` y `docs/revision-manual-datos-pendientes-2026-05-19.md`.
- La conclusion tecnica no cambia: no quedan candidatas seguras por RUT unico para corregir automaticamente.

## Siguiente paso recomendado

Preparar documento de revision manual para el cliente con:

1. Ordenes ambiguas agrupadas por `rut_cliente`.
2. Lista de clientes candidatos para cada RUT.
3. Ordenes sin cliente destino.
4. Recomendacion de accion por grupo:
   - elegir cliente existente;
   - fusionar clientes duplicados;
   - crear cliente faltante;
   - dejar historico sin correccion si no hay certeza.
