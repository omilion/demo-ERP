# Diagnostico base original ERP Plastimar - 2026-05-18

## Contexto

Se toma el deploy actual como checkpoint tecnico y se revisa la base original legacy entregada por Felipe:

- Archivo: `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql`
- Tamano: `633521104` bytes
- Motor origen: MariaDB 10.11
- Base origen: `plastim2_plastimar2014`
- Lineas del dump: `1480005`

No se modifico produccion durante esta revision. Las consultas al VPS fueron solo lectura.

## Inventario legacy

Resumen del dump:

| Metrica | Valor |
| --- | ---: |
| Tablas legacy | 98 |
| Bloques INSERT | 684 |
| Filas estimadas por INSERT | 1477062 |
| Tablas con filas | 95 |
| Tablas vacias | 3 |
| Constraints FK explicitas | 2 |

Observacion critica: la base esta declarada mayoritariamente como `utf8mb4`, pero muchas columnas y datos vienen en `latin1`; tambien hay mojibake visible, por ejemplo nombres tipo `MuÃƒÂ±oz`. La migracion debe tratar encoding como problema funcional, no solo estetico.

## Comparacion estructural

Contra `backend/prisma/schema.prisma`:

| Concepto | Valor |
| --- | ---: |
| Tablas legacy | 98 |
| Modelos Prisma | 74 |
| Coincidencias por mismo nombre | 33 |
| Tablas legacy sin nombre directo en Prisma | 65 |
| Tablas Prisma sin nombre legacy directo | 41 |

Esto no significa automaticamente perdida. El ERP nuevo normalizo nombres y separo dominios. Ejemplos:

| Legacy | Nuevo ERP probable |
| --- | --- |
| `orden_compra` | `ventas.orden_compra_online` |
| `productos_comprados` | `ventas.orden_compra_online_items` |
| `orden_compra_sistema` | `ventas.ordenes` |
| `productos_comprados_local` | `ventas.orden_items` |
| `historico_cobranza` | `ventas.cobranza_historico` |
| `caja` | `caja.movimientos_caja` |
| `catalogo` / `catalogo2` | `catalogo.productos` |
| `taller` | `taller.odts` |
| `productos_taller` | `taller.odt_items` y `taller.odt_item_talleres` |
| `usuarios_sistema` | `auth.users` |

## Conteos principales legacy vs produccion

| Area | Legacy | Produccion nueva | Lectura inicial |
| --- | ---: | ---: | --- |
| Accesos | `accesos` 10337 + `accesos_ventas` 2740 = 13077 | `auth.accesos` 13077 | Cierra exacto |
| Clientes | `clientes` 25968 | `clientes.clientes` 16945 | Requiere revision por RUT/duplicados |
| Productos | `catalogo` 32515, codigos unicos 32493 | `catalogo.productos` 32496 | Muy cercano; probable deduplicacion y/o altas posteriores |
| Compras online | `orden_compra` 40062, `n_compra` unicos 40020 | `ventas.orden_compra_online` 40020 | Cierra contra unicos |
| Items online | `productos_comprados` 312341 | `ventas.orden_compra_online_items` 311574 | Diferencia 767, coincide con items legacy huerfanos |
| Ventas locales | `orden_compra_sistema` 15419 | `ventas.ordenes` 16423 | Produccion tiene mas; revisar origen exacto |
| Items ventas locales | `productos_comprados_local` 83168 | `ventas.orden_items` 83728 | Produccion tiene mas; revisar altas posteriores/merge |
| Caja | `caja` 35098 | `caja.movimientos_caja` 37943 | Produccion tiene mas; revisar si incluye movimientos nuevos |
| Proveedores | `proveedores` 893, RUT unicos 777 | `catalogo.proveedores` 788 | Requiere revision por duplicados/criterio de origen |
| Pagos proveedor | `pagos_proveedores` 16036 | `catalogo.pagos_proveedores` 16036 | Cierra exacto |
| Detalle facturas bodega | `detalle_facturas_bodega` 28611 | `catalogo.detalle_facturas_proveedor` 28611 | Cierra exacto |
| Cotizaciones licitacion | `cotizacion_licitacion` 17118 | `ventas.cotizacion_licitacion` 17118 | Cierra exacto |
| Items licitacion | `productos_cotizados_licitacion` 160254 | `ventas.cotizacion_licitacion_items` 160226 | Diferencia pequena; hay huerfanos/empty ids legacy |
| Cobranza | `historico_cobranza` 3992 | `ventas.cobranza_historico` 3993 | Casi cierra |
| CRM | `crm` 1770 | `ventas.crm_registros` 1770 | Cierra exacto |
| Guias despacho | `guias_despachos` 11666 | `bodega.guias_despachos` 11762 | Produccion tiene mas |
| Stock movimientos | `movimientos_stock` 164885 | `bodega.movimientos` 0 | Pendiente real de migracion/historial |
| Taller cabeceras | `taller` 5432 | `taller.odts` 5437 | Muy cercano |
| Taller items | `productos_taller` 14536 | `taller.odt_items` 8546 + `taller.odt_item_talleres` 9562 | Requiere reconciliacion detallada |
| Bitacora taller | `bitacora_taller` 12637 | `taller.bitacora_taller` 12740 | Produccion tiene mas |
| Telas | `telas` 172 | `taller.telas` 175 | Produccion tiene mas |

## Duplicados y calidad de datos legacy

### Clientes

La tabla legacy `clientes` no puede migrarse 1:1 sin regla de negocio:

- Filas: 25968
- RUT unicos normalizados: 16392
- RUT vacios: 4669
- Filas duplicadas por RUT: 4907

La produccion nueva tiene 16945 clientes. Esto parece compatible con una deduplicacion por RUT mas algun criterio para clientes sin RUT, pero debe verificarse con muestras.

### Productos

`catalogo` parece ser la fuente principal de productos:

- Filas `catalogo`: 32515
- Codigos internos unicos `catalogo`: 32493
- Produccion `catalogo.productos`: 32496

El conteo es consistente, pero hay que revisar si la migracion uso `catalogo`, `catalogo2` o una mezcla:

- `catalogo2`: 33054 filas, 33030 codigos unicos
- `catalogo2-1`: 32034 filas, 32010 codigos unicos

El dump contiene versiones paralelas de catalogo y respaldos operativos, por lo que no se puede asumir que la tabla con mas filas sea la correcta.

## Integridad heredada detectada en origen

La base original ya trae relaciones rotas por diseno/contenido:

| Check legacy | Resultado |
| --- | ---: |
| Items online sin `orden_compra` | 767 filas / 132 compras |
| Items online con codigo no presente en `catalogo` | 14032 filas / 2314 codigos |
| Items locales sin `orden_compra_sistema` | 163 filas / 18 internos |
| Items locales con codigo no presente en `catalogo` | 6182 filas / 1369 codigos |
| Items taller sin cabecera `taller` | 0 |
| Items taller con codigo no presente en `catalogo` | 177 filas / 89 codigos |
| Items licitacion sin cabecera | 11 filas / 2 ids; ademas 17 ids vacios |
| Items licitacion con codigo no presente en `catalogo` | 7283 filas / 3556 codigos |
| Guias cuyo `n_interno` no esta en `odts` | 2539 filas / 1174 internos |
| Guias cuyo `n_interno` no esta en `taller` | 4697 filas / 2382 internos |

Esto explica parte de los hallazgos actuales: algunos errores no fueron creados por el ERP nuevo, vienen desde el legacy.

## Hallazgos preliminares

1. La migracion no fue simplemente incompleta; fue una mezcla de deduplicacion, normalizacion y exclusion de datos huerfanos.
2. Hay areas que cierran muy bien: accesos, pagos proveedor, detalle de facturas, cotizaciones, CRM, historial email.
3. Hay areas que requieren reconciliacion antes de avanzar funcionalmente: clientes, proveedores, caja, ventas locales, taller.
4. Hay un pendiente fuerte: `movimientos_stock` no esta representado en `bodega.movimientos`; si el cliente espera historial de stock, esto falta.
5. La base legacy trae varias tablas paralelas o de respaldo (`catalogo2`, `catalogo2-1`, `orden_compra_sistema2`, `*_111124`, `*_020625`, `taller2`, `productos_taller2`). Hay que decidir cuales son fuente oficial y cuales son snapshots.
6. La deuda de encoding es real. Antes de migrar datos nuevos desde este dump hay que definir tratamiento de `latin1`/mojibake.

## Riesgo para el proyecto

El checkpoint tecnico desplegado esta bien como punto de partida, pero ahora el riesgo principal cambia: no es solo codigo, es fidelidad historica de migracion.

No conviene seguir construyendo nuevas funciones encima sin cerrar primero:

- Tabla fuente oficial por modulo.
- Criterios de deduplicacion.
- Politica para huerfanos.
- Correccion/normalizacion de encoding.
- Reconciliacion de conteos contra produccion.

## Sprint recomendado: Reconciliacion legacy

Objetivo: determinar con evidencia que datos faltan, cuales fueron correctamente deduplicados y cuales deben migrarse/repararse.

Pasos:

1. Montar el dump original en una base MariaDB aislada, no en produccion.
2. Crear consultas de conteo y reconciliacion por modulo.
3. Comparar claves, no solo cantidades:
   - Clientes: RUT normalizado.
   - Productos: `codigo_interno`.
   - Compras online: `n_compra`.
   - Ventas locales: `n_interno`.
   - Taller: `n_interno` + items.
   - Stock: `codigo_interno` + fecha.
4. Clasificar diferencias:
   - Duplicado correctamente eliminado.
   - Huerfano excluido con justificacion.
   - Registro perdido.
   - Registro nuevo posterior al dump.
5. Generar plan de migracion/reparacion por lotes, empezando por stock movimientos y taller.

## Decision operativa

No aplicar datos desde el dump directamente sobre produccion todavia.

Primero se debe hacer una reconciliacion aislada y trazable. La base original contiene informacion valiosa, pero tambien contiene duplicados, huerfanos, tablas paralelas y encoding mixto.
