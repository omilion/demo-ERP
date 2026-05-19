# Sprint 3 apply productos legacy y fechas de guias - 2026-05-19

## Estado

Tercer lote de saneamiento aplicado en produccion.

Alcance aplicado:

- Cierre de integridad referencial para items historicos sin producto en `ventas.orden_items` y `taller.odt_items`.
- Creacion controlada de productos legacy inactivos para codigos antiguos que no existian en `catalogo.productos`.
- Correccion de fechas anomalas en `bodega.guias_despachos` usando la fecha de creacion de la orden asociada.
- No se tocaron precios negativos, clientes ambiguos, stock negativo, bitacora diaria ni snapshots legacy de stock.

## Backup

Backup previo creado y verificado:

- Archivo: `/var/backups/plastimar/db/plastimar_erp_20260519_011815_pre_sprint3_legacy_products_guides.dump`
- Tamano: `84M`
- SHA256: `ae9e07517a19e00b4709b6f1ed90574d5e061fe879e9fc10f63891344e09353b`
- Verificacion: `pg_restore --list` OK

## Baseline antes del apply

### Items sin producto

Despues de Sprint 1 quedaban items historicos cuyo `codigo_interno` no tenia match exacto contra catalogo.

| Tabla | Filas pendientes | Codigos distintos |
| --- | ---: | ---: |
| `ventas.orden_items` | 6150 | 1388 |
| `taller.odt_items` | 200 | 50 |
| **Total** | **6350** | **1389** |

La suma de codigos distintos no es 1438 porque algunos codigos aparecen en ambas tablas.

### Fechas de guias

| Check | Antes |
| --- | ---: |
| Guias con fecha operacional anomala | 7561 |
| Guias con `fecha_guia = 1970-01-01` | 7558 |
| Guias con fecha anterior a 2000 | 7560 |
| Guias con fecha futura mayor a 1 ano | 1 |
| Guias anomalas con orden asociada utilizable | 7561 |

## Auditoria de apply

Se crearon tablas de auditoria:

- `migration_audit.sprint3_legacy_products_20260519_011815`
- `migration_audit.sprint3_legacy_product_item_updates_20260519_011815`
- `migration_audit.sprint3_guias_fecha_20260519_011815`

### Regla para productos legacy

`legacy_placeholder_product_for_historical_item_without_catalog_match`

Por cada `codigo_interno` historico sin match en catalogo se creo un producto inactivo con:

- `codigo_interno`: codigo normalizado historico.
- `activo`: `false`.
- `bodega`: `Legacy`.
- `categoria`: `Legacy migracion`.
- `estado_inventario`: `Legacy sin match catalogo`.
- `stock`: `0`.
- precios: `0`.
- descripcion: indica que el producto fue creado para preservar integridad referencial historica.

Luego se actualizaron los items historicos para apuntar al producto legacy correspondiente.

### Regla para fechas de guia

`replace_invalid_fecha_guia_with_order_created_date_only`

Se reemplazo `bodega.guias_despachos.fecha_guia` solo cuando:

- la fecha era anterior a `2000-01-01`; o
- la fecha era mayor a un ano futuro; y
- existia una orden asociada por `orden_id`.

El valor nuevo fue `ventas.ordenes.created_at::date::timestamp`.

Importante: esta fecha no pretende ser la fecha real documental de la guia. Es una fecha operacional defensible para sacar la guia del rango invalido y mantenerla cerca del ciclo historico de la orden.

## Resultado aplicado

### Productos e items

| Metrica | Resultado |
| --- | ---: |
| Productos legacy creados | 1389 |
| Items `ventas.orden_items` actualizados | 6150 |
| Items `taller.odt_items` actualizados | 200 |
| Items historicos actualizados total | 6350 |

Estado posterior:

| Check | Despues |
| --- | ---: |
| `ventas.orden_items` con `producto_id` huerfano | 0 |
| `taller.odt_items` con `producto_id` huerfano | 0 |

### Fechas de guias

| Metrica | Resultado |
| --- | ---: |
| Guias auditadas | 7561 |
| Guias actualizadas | 7561 |
| Guias con fecha anomala posterior | 0 |

## Auditoria posterior

`backend/scripts/data-integrity-audit.mjs --json`

| Metrica | Despues Sprint 2 | Despues Sprint 3 | Delta |
| --- | ---: | ---: | ---: |
| Checks totales | 52 | 52 | 0 |
| Checks OK | 52 | 52 | 0 |
| Errores | 0 | 0 | 0 |
| Hallazgos totales | 65434 | 47786 | -17648 |
| Criticos | 6932 | 582 | -6350 |
| Warnings | 58502 | 47204 | -11298 |

Por area despues:

| Area | Hallazgos |
| --- | ---: |
| clientes | 403 |
| proveedores | 3483 |
| productos | 217 |
| taller | 2 |
| ventas | 43626 |
| fechas | 55 |

Notas:

- La baja critica corresponde al cierre de `producto_id` huerfano en ventas y taller.
- La baja de fechas corresponde a las guias saneadas; quedan 55 fechas anomalas en `catalogo.pagos_proveedores.fecha_pago`.
- Parte de la baja de warnings ocurre porque los productos legacy ahora satisfacen codigos historicos en algunas cotizaciones y detalles de proveedor. Eso no reemplaza una revision comercial de esos codigos.

## Smoke API

Smoke ejecutado contra produccion:

```bash
node scripts/staging-smoke.mjs \
  --base-url=http://127.0.0.1:3001 \
  --expect-orden-items-huerfanos=0 \
  --expect-odt-items-huerfanos=0 \
  --expect-productos-stock-negativo=167
```

Resultado:

- `API smoke OK: 24/24`
- Health OK
- Login admin OK
- RBAC solo lectura OK
- Dashboard, productos, clientes, ventas, ODT, cobranza, despachos, matriz, reportes, RRHH, integridad y auditoria OK
- Detalles de producto, cliente, venta y ODT/bitacora OK
- Conteos esperados de integridad OK

## Rollback

Rollback disponible fila por fila en las tablas de auditoria.

Para revertir items:

```sql
SELECT reverse_sql
FROM migration_audit.sprint3_legacy_product_item_updates_20260519_011815
WHERE run_id = 'sprint3_legacy_products_20260519_011815'
ORDER BY audit_id;
```

Para revertir productos legacy, hacerlo despues de revertir items:

```sql
SELECT reverse_sql
FROM migration_audit.sprint3_legacy_products_20260519_011815
WHERE run_id = 'sprint3_legacy_products_20260519_011815'
ORDER BY audit_id;
```

Para revertir fechas de guias:

```sql
SELECT reverse_sql
FROM migration_audit.sprint3_guias_fecha_20260519_011815
WHERE run_id = 'sprint3_guias_fecha_20260519_011815'
ORDER BY audit_id;
```

Tambien existe backup completo previo al apply.

## Pendiente despues del lote

Quedan fuera del apply automatico:

- Ordenes con cliente ambiguo o sin cliente destino por RUT.
- Precios negativos en items de venta.
- Stock negativo en productos y telas.
- Duplicados de RUT en clientes/proveedores.
- Duplicado de codigo interno `PACK4`.
- Codigos de vendedor legacy sin usuario asociado.
- Codigos de cotizaciones/detalles proveedor que siguen sin producto.
- Fechas anomalas restantes en pagos proveedor.
- Bitacora diaria legacy sin ODT.
- `movimientos_stock` legacy, que debe migrarse como `stock_lecturas`, no como movimientos transaccionales.
