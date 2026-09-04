# Evidencia de producción — 2026-09-01

## Mediciones de endpoints

Período consultado: 2026-01-01 a 2026-09-01.

| Endpoint gerencial | Tiempo servidor observado |
|---|---:|
| Ventas | 2.614,6 ms |
| Cobranza/caja | 102,0 ms |
| Stock | 95,8 ms |
| Licitaciones | 407,1 ms |
| Operaciones | 204,4 ms |
| Exportación Excel gerencial | 3.070 ms extremo a extremo |

La página ejecuta esos agregados junto con endpoints de respaldo/listado; la latencia aislada no representa el peor caso concurrente.

## Resultado real de ventas

| Fuente | Cantidad | Total CLP |
|---|---:|---:|
| Órdenes | 1.353 | $1.139.548.077 |
| Pedidos web | 3.533 | $2.665.970.161 |
| Licitaciones | 2.488 | $1.883.212.361 |
| **Combinado mostrado** | **7.374** | **$5.688.730.599** |

Este total prueba que el endpoint responde; no prueba que represente ingresos ni que esté deduplicado. Se encontraron 2.390 licitaciones con `orden_id`, y 2.383 conservan monto adjudicado.

El JSON incluye claves de cliente que difieren solo por capitalización. PowerShell las considera duplicadas al convertir el objeto; el navegador las acepta pero separa el mismo cliente en grupos distintos.

## Resultado operativo del período

- Stock crítico: 2.612 productos y 0 materiales de taller; 1.448 movimientos dentro del rango.
- Licitaciones: 2.488; 294 ganadas; 2.029 pendientes.
- ODT pendientes: 5.772; vencidas informadas: 0; todas las 5.772 carecen de fecha comprometida.
- Despachos pendientes: 21.
- Caja: entradas $1.095.687.725 y salidas $0 según el agregado; requiere conciliación antes de interpretarlo como flujo neto.

## Calidad de cobranza

| Control | Resultado |
|---|---:|
| Documentos | 3.993 |
| Pendientes | 106 |
| Sin fecha de factura | 92 |
| Sin valor de factura | 3.687 |

El endpoint YTD devolvió cero CxC porque aplica el período a la fecha de emisión, no porque la cartera viva sea cero.

## VPS y PostgreSQL

- VPS: 1,9 GiB RAM; 2 GiB swap; ~257 MiB de swap usados.
- Disco raíz: 50 GB, 46 GB usados, ~1,6 GB disponibles, **97%**.
- Base: ~544 MB; 8 conexiones observadas, una activa.
- PostgreSQL: `shared_buffers=128MB`, `work_mem=4MB`, `max_connections=100`.
- 0 vistas materializadas; `pg_stat_statements` no instalado.
- `EXPLAIN` mostró sequential scans para filtros temporales en órdenes, cobranza, caja, licitaciones y ODT.
- Tablas críticas no registraban `ANALYZE`/autoanalyze previo en `pg_stat_user_tables`.

## Roles activos observados

| Rol | Activos |
|---|---:|
| admin | 4 |
| vendedor | 4 |
| coordinador | 1 |
| bodeguero | 3 |
| cajero | 1 |
| taller | 2 |
| taller_operario | 2 |
| solo_lectura | 2 |

Además había 59 vendedores inactivos. Las dos cuentas `solo_lectura` activas conservan lectura amplia, incluido RRHH.

## Limitación de navegador

Se intentó iniciar y reiniciar el controlador del navegador integrado. El runtime de Node falló con error de ruta del sistema antes de crear una pestaña. Por tanto, esta evidencia no incluye capturas, DOM, trazas de FPS o validación responsive. Esas pruebas quedan como condición formal de cierre, no como hallazgo supuesto.

