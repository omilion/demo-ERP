# Revision manual de datos pendientes - 2026-05-19

## Proposito

Este documento prepara la revision posterior con el dueno del ERP original o con el equipo que conoce los datos historicos de Plastimar.

Despues de los dos primeros lotes automaticos ya aplicados, quedan casos donde no existe una regla unica segura. Esos casos no deben corregirse por script sin validacion humana.

## Ya aplicado automaticamente

### Producto huerfano con codigo exacto

- Aplicados: 2588
- Criterio: `codigo_interno` normalizado coincide con exactamente un producto de catalogo.
- Auditoria: `migration_audit.sprint1_producto_orphans_20260519_005056`

### Orden cliente por RUT unico

- Aplicados: 4898
- Criterio: `ventas.ordenes.rut_cliente` normalizado coincide con exactamente un cliente destino.
- Auditoria: `migration_audit.sprint2_cliente_rut_20260519_010737`

## Pendientes que requieren decision humana

### 1. Items sin producto en catalogo

| Tabla | Pendientes |
| --- | ---: |
| `ventas.orden_items` | 6150 |
| `taller.odt_items` | 200 |
| **Total** | **6350** |

Por que no se corrigieron:

- Tienen `producto_id` invalido, pero su `codigo_interno` no existe en `catalogo.productos`.
- No se debe inventar producto ni asignar por parecido de nombre sin validacion.

Opciones de decision:

1. Crear productos legacy faltantes.
2. Mapear manualmente codigos antiguos a productos actuales.
3. Permitir que esos items queden como historicos con producto no encontrado.
4. Excluirlos de reportes operativos y mantenerlos solo para trazabilidad.

### 2. Ordenes con cliente ambiguo

| Tipo | Pendientes |
| --- | ---: |
| RUT apunta a varios clientes posibles | 1655 |
| RUT no tiene cliente destino | 133 |
| **Total** | **1788** |

Por que no se corrigieron:

- En 1655 casos el RUT existe en mas de un cliente.
- En 133 casos el RUT de la orden no existe como cliente actual.

Opciones de decision:

1. Elegir cliente correcto por orden.
2. Fusionar clientes duplicados y luego aplicar por RUT.
3. Crear cliente faltante.
4. Mantener historico sin cambio si no hay certeza.

### 3. Guias con fecha `1970-01-01`

| Check | Pendientes |
| --- | ---: |
| Guias con `fecha_guia = 1970-01-01` | 7558 |
| Guias con fecha pre-2000 | 7560 |
| Fecha futura > 1 ano | 1 |

Por que no se corrigieron:

- `fecha_guia` es `NOT NULL`.
- `1970-01-01` viene de conversion de fecha legacy invalida.
- La fecha de creacion de guia en produccion es fecha de migracion, no fecha historica real.
- La fecha de orden existe, pero no necesariamente corresponde a fecha de guia.

Opciones de decision:

1. Cambiar esquema para permitir `fecha_guia = NULL`.
2. Reemplazar por fecha de orden como aproximacion historica.
3. Buscar fuente documental externa para fecha real de guia.

### 4. Precios negativos

| Check | Pendientes |
| --- | ---: |
| Items con `precio_unitario < 0` | 688 |
| Ordenes afectadas | 589 |

Por que no se corrigieron:

- Pueden representar devoluciones, notas, descuentos, errores historicos o ajustes contables.
- Cambiarlos altera totales historicos.

Opciones de decision:

1. Confirmar si son notas/devoluciones validas.
2. Convertir a mecanismo formal de nota de credito.
3. Mantener como historico si los reportes antiguos dependian de ese valor.
4. Corregir solo errores confirmados.

### 5. Bitacora taller sin ODT

| Check | Pendientes |
| --- | ---: |
| Registros de bitacora sin `odt_id` | 12740 |

Por que no se corrigieron:

- La bitacora legacy parece ser mayoritariamente bitacora diaria general de taller.
- Muchas entradas no mencionan ODT.
- Extraer numeros desde texto genera falsos positivos.

Opciones de decision:

1. Mantener como bitacora diaria legacy.
2. Crear vista/seccion separada de historico diario de taller.
3. Asociar manualmente solo entradas con ODT claramente identificable.

### 6. Movimientos stock legacy

| Check | Pendientes |
| --- | ---: |
| Filas legacy `movimientos_stock` | 164885 |
| Migradas a produccion | 0 |

Por que no se migraron:

- No parecen movimientos transaccionales, sino lecturas/snapshots de stock.
- `bodega.movimientos` no es destino correcto.

Opcion recomendada:

- Crear tabla nueva `bodega.stock_lecturas`.
- Migrar como historico de lecturas, preservando `codigo_interno`, `stock`, `fecha`, `usuario` y `id` legacy.

## Formato recomendado para reunion con cliente

Para cada grupo manual, revisar:

1. Que significaba el dato en el ERP original.
2. Si debe afectar reportes actuales o quedar solo como historico.
3. Si existe una fuente externa para resolverlo.
4. Si se aprueba una regla masiva o solo correccion caso a caso.

No conviene aplicar reglas por similitud de nombre ni heuristicas sin aprobacion del cliente.
