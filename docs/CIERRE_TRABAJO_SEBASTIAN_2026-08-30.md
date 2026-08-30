# Cierre de trabajo — Sebastián

Fecha de cierre: 30-08-2026  
Repositorio: `sreich69/plastimar`  
Estado publicado: `main` en commit `3b2ff27`

## Resumen ejecutivo

Se completó e integró el trabajo de las áreas de Bodega/Despacho, Finanzas y
facturación, y los flujos operativos de Taller. Además se integró el trabajo de
Ventas, CRM y permisos realizado en paralelo, se dejó Docker operativo para
desarrollo/pruebas y se corrigieron dos migraciones que bloqueaban un despliegue
contra datos reales.

No se modificaron datos de producción ni se deduplicaron productos de forma
automática.

## Entregado

### Bodega y despacho

- Stock físico, disponible, reservado y dañado en el catálogo.
- Kardex con saldos antes/después, origen, usuario y hora; el flujo de la
  aplicación sólo expone lectura y creación de movimientos.
- Validaciones operativas para reservas, daños, mermas, pérdidas y ajustes.
- Alertas de stock crítico y base para sugerencias de compra.
- Código de barras obligatorio para altas e importaciones nuevas; las
  actualizaciones de productos históricos no se bloquean por carecer de él.
- Validación de códigos repetidos en altas, cambios de código e importaciones.
- Cadena de despacho Patio → Didáctico → Reparto → Entregado, dirección de
  entrega y vista consolidada de talleres.

### Finanzas y facturación

- Flujo de DTE con validación de datos tributarios y máximo de 20 líneas.
- Venta de sala para consumidor final sin exigir ficha de cliente.
- Trazabilidad de venta, guía y documento tributario.
- Funciones de cobranza: gestiones, compromisos de pago, alertas y conciliación
  de cartola.

### Talleres

- Flujo visible Pendiente / En proceso / Terminado.
- Rechazo y reproceso con causa obligatoria.
- Priorización por fecha comprometida.
- Avisos cuando todas las estaciones de una ODT quedan listas para despacho.

### Integración con Ventas, CRM y permisos

- Integrado el trabajo paralelo de Omar: catálogo único de tipos de venta,
  Trato Directo, Compra Ágil, referencia de Marketplace, adjudicación parcial,
  versionado de cotizaciones y permisos por función.
- Unificado el consumo del flujo de estados entre ventas y matriz de ventas.

## Docker y bases locales

- Docker Desktop quedó operativo con PostgreSQL local aislado en el puerto
  `55432`.
- Bases `plastimar_dev` y `plastimar_test` con las 85 migraciones aplicadas.
- Cliente Prisma regenerado después de integrar las migraciones de Ventas/CRM.
- Las restricciones locales fueron alineadas con las migraciones de despliegue
  seguras descritas más abajo.

## Migraciones corregidas para producción

### Código de barras

La migración `20260828_SB_codigo_barra_unico` intentaba crear un índice único
sobre el catálogo completo. En una copia de producción fallaba por 51 grupos
duplicados (112 productos): 49 grupos con códigos reales repetidos y 2 grupos
con valores de relleno `0`/`1`.

Se reemplazó por un índice normalizado **no único**. La prevención de nuevos
duplicados queda en la aplicación para altas, actualizaciones e importaciones.
La restricción única se debe agregar en una migración futura, sólo después de
que negocio decida cómo sanear cada grupo histórico.

### Stock operativo y kardex

La migración `20260828_SB_stock_operacional_kardex` agregaba una restricción
que comparaba reservado + dañado con stock. La copia de producción tiene 138
productos activos con stock negativo; por ejemplo, tres productos llegan a
`-38`. Con reservado y dañado en cero, la regla original fallaba y podía dejar
el despliegue parcialmente aplicado.

La restricción quedó como `NOT VALID` y con semántica explícita:

- Stock positivo: reservado + dañado no puede superar el stock.
- Stock negativo: reservado y dañado deben mantenerse en cero.

Se comprobó en una base temporal con stock `-38` que la migración termina por
completo, que una actualización normal del producto sigue siendo posible y que
una reserva sobre ese saldo negativo es rechazada. Los 138 saldos no fueron
normalizados: requieren conciliación de recepción o ajuste de inventario.

## Validación realizada

- Integración inicial: 113 pruebas de ventas, matriz y facturación aprobadas.
- CRM, permisos, bodega, despacho y taller: 161 pruebas aprobadas.
- Catálogo tras el ajuste de códigos de barra: 30 pruebas aprobadas.
- Stock, movimientos y despacho tras el ajuste de stock: 84 pruebas aprobadas.
- Compilación de frontend con Vite aprobada.
- `prisma migrate deploy` ejecutado correctamente contra la base Docker de
  pruebas tras cada corrección.

Las pruebas anteriores cubren conjuntos dirigidos; no se declara una ejecución
completa de la suite como aprobada en este cierre.

## Historial de integración publicado

| Commit | Descripción |
| --- | --- |
| `24a5667` | Histórico sin scope explícito en matriz de ventas. |
| `c254c37` | Lectura unificada del flujo de estados de venta. |
| `cccc209` | Bases Docker locales aisladas. |
| `24cf811` | Cobranza y trazabilidad DTE. |
| `da439a4` | Stock operativo, kardex y despacho. |
| `7bc3118` | Reprocesos y avisos de taller. |
| `7e07909` | Merge del área A: Ventas/CRM/permisos. |
| `debc955` | Migración segura para códigos de barra históricos. |
| `3b2ff27` | Migración segura para stock negativo histórico. |

## Pendientes que requieren decisión o carga de datos

- Resolver los 51 grupos duplicados de códigos de barra antes de imponer
  unicidad en base de datos.
- Conciliar los 138 productos activos con stock negativo mediante recepción o
  ajuste de inventario respaldado.
- Cargar recetas de taller; sin ellas no se puede cerrar correctamente la
  explosión de materiales y mermas de espuma.
- Asignar ubicaciones a productos sin ubicación para completar picking y uso
  operativo de código de barras.
- Revisar los errores históricos de lint global ajenos a este alcance antes de
  usarlo como condición de despliegue.

## Archivos de trabajo preservados

Los CSV, reportes y scripts de análisis locales no rastreados en `backend/`
fueron preservados y no se incluyeron en los commits ni se subieron a GitHub.
