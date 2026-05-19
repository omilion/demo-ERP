# Reporte final saneamiento migracion - 2026-05-19

## Resumen ejecutivo

Se completo el saneamiento automatizable de la migracion legacy del ERP Plastimar en produccion.

El criterio usado fue conservador: solo se aplicaron cambios con regla deterministica, trazabilidad por tabla de auditoria, backup previo y validacion posterior. Los datos que requieren interpretacion de negocio quedaron separados para revision manual con el dueno del ERP original.

Estado final tecnico:

- API productiva operativa.
- Smoke API final: `24/24` OK.
- Auditoria de integridad: `52/52` checks OK.
- Errores de auditoria: `0`.
- Items de venta/taller con `producto_id` huerfano: `0`.
- Guias con fecha operacional anomala: `0`.
- Cambios aplicados con backups y rollback fila por fila.

## Cambios aplicados

### Sprint 1 - producto huerfano por match exacto

Se corrigieron items cuyo `codigo_interno` normalizado coincidia con exactamente un producto existente.

| Tabla | Aplicados |
| --- | ---: |
| `ventas.orden_items` | 2526 |
| `taller.odt_items` | 62 |
| **Total** | **2588** |

Auditoria:

- `migration_audit.sprint1_producto_orphans_20260519_005056`

Backup:

- `/var/backups/plastimar/db/plastimar_erp_20260519_005056_pre_sprint1_producto_orphans.dump`
- SHA256: `b52b1ae3a146d3d99eeea6e66db387be5e3edf9a58685fa4330899584d3b5110`

### Sprint 2 - cliente de orden por RUT unico

Se corrigio `ventas.ordenes.cliente_id` cuando `rut_cliente` normalizado apuntaba a exactamente un cliente destino.

| Metrica | Valor |
| --- | ---: |
| Ordenes actualizadas | 4898 |
| Candidatas seguras restantes | 0 |

Auditoria:

- `migration_audit.sprint2_cliente_rut_20260519_010737`

Backup:

- `/var/backups/plastimar/db/plastimar_erp_20260519_010737_pre_sprint2_cliente_rut.dump`
- SHA256: `8f05e4810f5ffb5a908e4bfb46d987a05b4e56fd0c63c0b58e337bfb2067ced8`

### Sprint 3 - productos legacy y fechas de guias

Se cerraron los items historicos sin producto creando productos legacy inactivos y se corrigieron fechas invalidas de guias usando la fecha de la orden asociada.

| Metrica | Valor |
| --- | ---: |
| Productos legacy inactivos creados | 1389 |
| Items `ventas.orden_items` actualizados | 6150 |
| Items `taller.odt_items` actualizados | 200 |
| Guias con fecha corregida | 7561 |

Auditoria:

- `migration_audit.sprint3_legacy_products_20260519_011815`
- `migration_audit.sprint3_legacy_product_item_updates_20260519_011815`
- `migration_audit.sprint3_guias_fecha_20260519_011815`

Backup:

- `/var/backups/plastimar/db/plastimar_erp_20260519_011815_pre_sprint3_legacy_products_guides.dump`
- SHA256: `ae9e07517a19e00b4709b6f1ed90574d5e061fe879e9fc10f63891344e09353b`

## Resultado antes y despues

Comparacion desde el diagnostico inicial de saneamiento hasta el cierre:

| Metrica | Antes | Despues | Delta |
| --- | ---: | ---: | ---: |
| Checks de auditoria | 52 | 52 | 0 |
| Checks OK | 52 | 52 | 0 |
| Errores de auditoria | 0 | 0 | 0 |
| Hallazgos totales | 68022 | 47786 | -20236 |
| Criticos | 9520 | 582 | -8938 |
| Warnings | 58502 | 47204 | -11298 |
| Items venta con producto huerfano | 8676 | 0 | -8676 |
| Items taller con producto huerfano | 262 | 0 | -262 |
| Guias con fecha anomala | 7561 | 0 | -7561 |

Auditoria final por area:

| Area | Hallazgos finales |
| --- | ---: |
| clientes | 403 |
| proveedores | 3483 |
| productos | 217 |
| taller | 2 |
| ventas | 43626 |
| fechas | 55 |

## Validaciones finales

### Smoke API

Comando ejecutado en VPS:

```bash
node scripts/staging-smoke.mjs \
  --base-url=http://127.0.0.1:3001 \
  --expect-orden-items-huerfanos=0 \
  --expect-odt-items-huerfanos=0 \
  --expect-productos-stock-negativo=167
```

Resultado:

- `API smoke OK: 24/24`

Cobertura del smoke:

- health
- login admin
- RBAC solo lectura
- dashboard
- productos
- clientes
- ventas
- ODT
- cobranza
- despachos
- guias
- matriz ventas
- stock critico
- RRHH
- integridad
- auditoria
- detalles de producto, cliente, venta y ODT/bitacora

### Auditoria de integridad

`node scripts/data-integrity-audit.mjs --json`

Resultado:

- `totalChecks`: 52
- `okChecks`: 52
- `errorChecks`: 0
- `findings`: 47786
- `critical`: 582
- `warn`: 47204

Nota operativa: el script retorna exit code `1` cuando quedan hallazgos, aunque no existan errores de ejecucion. En este cierre el resultado esperado es auditoria ejecutada OK con hallazgos pendientes de negocio/manuales.

## Pendientes no automatizados

Estos puntos no deben cerrarse por script sin criterio del cliente o validacion administrativa.

### Clientes de orden ambiguos o sin destino

Verificacion conservadora final por RUT normalizado:

| Tipo | Pendientes |
| --- | ---: |
| RUT apunta a varios clientes posibles | 1655 |
| RUT no tiene cliente destino | 201 |
| Candidatas seguras restantes | 0 |
| **Total para revision manual** | **1856** |

Nota: este es el conteo final de cierre leido directamente en produccion para preparar la revision manual. Reemplaza como universo de trabajo al conteo intermedio del Sprint 2.

Accion recomendada:

- Revisar por RUT.
- Fusionar clientes duplicados cuando corresponda.
- Crear cliente faltante si el RUT es valido y no existe.
- Corregir `cliente_id` solo despues de aprobacion.

### Precios negativos

| Check | Pendientes |
| --- | ---: |
| Items con `precio_unitario < 0` | 688 |
| Ordenes afectadas | 589 |

No se corrigieron porque pueden representar devoluciones, descuentos, notas o ajustes contables historicos.

### Stock negativo

| Check | Pendientes |
| --- | ---: |
| Productos con stock negativo | 167 |
| Telas con stock negativo | 1 |

No se corrigieron porque afectan inventario y valorizacion. Requieren decision de bodega/administracion.

### Duplicados maestros

| Check | Pendientes |
| --- | ---: |
| Grupos de RUT cliente duplicado normalizado | 403 |
| Grupos de RUT proveedor duplicado normalizado | 10 |
| Codigo interno producto duplicado normalizado | 1 |

Producto duplicado detectado:

- `PACK4`

### Codigos historicos sin mapeo comercial

| Check | Pendientes |
| --- | ---: |
| Compras online con `codigo_vendedor` sin usuario asociado | 39941 |
| Items de cotizacion con `codigo_interno` sin producto | 3685 |
| Detalles proveedor con `codigo_interno` sin producto | 3473 |

Estos hallazgos no bloquean integridad referencial principal, pero afectan reportes comerciales historicos por vendedor/producto.

### Fechas restantes

| Check | Pendientes |
| --- | ---: |
| Fechas operacionales anomalas restantes | 55 |

La auditoria muestra que corresponden a `catalogo.pagos_proveedores.fecha_pago` con valores tipo `0001-01-01`.

### Bitacora taller legacy

| Check | Pendientes |
| --- | ---: |
| Registros `taller.bitacora_taller` sin `odt_id` | 12740 |

No se corrigieron porque la evidencia indica que muchas filas son bitacora diaria general, no necesariamente bitacora de una ODT.

### Stock historico legacy

| Check | Pendientes |
| --- | ---: |
| Filas legacy `movimientos_stock` no migradas | 164885 |

Conclusion tecnica:

- No corresponden claramente a movimientos transaccionales.
- Deben tratarse como lecturas/snapshots historicos.
- Destino recomendado: nueva tabla `bodega.stock_lecturas`, no `bodega.movimientos`.

## Riesgos residuales

- Los productos legacy inactivos preservan integridad historica, pero no sustituyen una decision comercial sobre si esos codigos deben fusionarse con productos actuales.
- Las fechas de guia saneadas usan la fecha de la orden asociada, no una fuente documental externa de guia.
- La baja de warnings en cotizaciones/proveedores ocurre por existencia de productos legacy; debe revisarse si esos codigos tienen equivalentes actuales.
- Los hallazgos pendientes son principalmente de negocio, deduplicacion maestra o interpretacion historica.

## Estado git y deploy

El saneamiento fue aplicado en produccion/VPS y validado ahi.

La documentacion queda en git local para revision, pero no se hizo push a GitHub en este cierre para evitar gatillar deploy automatico sin aprobacion explicita.

Branch local:

- `main`

Estado esperado:

- `main` local queda por delante de `origin/main`.
- Pendiente de decision: hacer push/deploy del paquete documental cuando el usuario lo apruebe.

## Recomendacion siguiente

Antes de nuevas features, preparar revision manual con el cliente usando `docs/revision-manual-datos-pendientes-2026-05-19.md`.

Orden recomendado:

1. Clientes duplicados/mismatch por RUT.
2. Stock negativo y stock historico legacy.
3. Precios negativos.
4. Codigos vendedor legacy.
5. Cotizaciones y detalles proveedor con codigos historicos.
6. Bitacora diaria taller.
