# Revision manual de datos pendientes - 2026-05-19

## Proposito

Este documento prepara la revision posterior con el dueno del ERP original o con el equipo que conoce los datos historicos de Plastimar.

Despues de los lotes automaticos ya aplicados, quedan casos donde no existe una regla unica segura. Esos casos no deben corregirse por script sin validacion humana.

## Ya aplicado automaticamente

### Producto huerfano con codigo exacto

- Aplicados: 2588
- Criterio: `codigo_interno` normalizado coincide con exactamente un producto de catalogo.
- Auditoria: `migration_audit.sprint1_producto_orphans_20260519_005056`

### Orden cliente por RUT unico

- Aplicados: 4898
- Criterio: `ventas.ordenes.rut_cliente` normalizado coincide con exactamente un cliente destino.
- Auditoria: `migration_audit.sprint2_cliente_rut_20260519_010737`

### Producto legacy para items historicos sin catalogo

- Productos legacy inactivos creados: 1389
- Items `ventas.orden_items` actualizados: 6150
- Items `taller.odt_items` actualizados: 200
- Resultado final: `producto_id` huerfano en ventas/taller = 0.
- Auditorias:
  - `migration_audit.sprint3_legacy_products_20260519_011815`
  - `migration_audit.sprint3_legacy_product_item_updates_20260519_011815`

### Fechas invalidas en guias

- Guias actualizadas: 7561
- Criterio: reemplazar fechas anomalas por fecha de la orden asociada.
- Resultado final: guias con fecha operacional anomala = 0.
- Auditoria: `migration_audit.sprint3_guias_fecha_20260519_011815`

## Pendientes que requieren decision humana

### 1. Ordenes con cliente ambiguo o sin destino

Conteo conservador final por RUT normalizado:

| Tipo | Pendientes |
| --- | ---: |
| RUT apunta a varios clientes posibles | 1655 |
| RUT no tiene cliente destino | 201 |
| Candidatas seguras restantes | 0 |
| **Total** | **1856** |

Nota: este es el conteo final de cierre leido directamente en produccion para preparar la revision manual. Reemplaza como universo de trabajo al conteo intermedio del Sprint 2.

Por que no se corrigieron:

- En 1655 casos el RUT existe en mas de un cliente.
- En 201 casos el RUT de la orden no tiene cliente destino en `clientes.clientes`.
- Ya no quedan casos masivos seguros con destino unico.

Opciones de decision:

1. Elegir cliente correcto por orden.
2. Fusionar clientes duplicados y luego aplicar por RUT.
3. Crear cliente faltante.
4. Mantener historico sin cambio si no hay certeza.

### 2. Precios negativos

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

### 3. Stock negativo

| Check | Pendientes |
| --- | ---: |
| Productos con stock negativo | 167 |
| Telas con stock negativo | 1 |

Por que no se corrigio:

- Cambiar stock altera inventario, valorizacion y trazabilidad.
- Debe decidirlo bodega/administracion con criterio operativo.

Opciones de decision:

1. Ajuste inventario formal con documento de respaldo.
2. Mantener negativo si representa deuda operativa real.
3. Corregir solo productos validados por conteo fisico o fuente historica.

### 4. Duplicados maestros

| Check | Pendientes |
| --- | ---: |
| Grupos de RUT cliente duplicado normalizado | 403 |
| Grupos de RUT proveedor duplicado normalizado | 10 |
| Codigo interno producto duplicado normalizado | 1 |

Producto duplicado detectado:

- `PACK4`

Por que no se corrigieron:

- Fusionar maestros puede cambiar historial, saldos, reportes y relaciones comerciales.
- Requiere decidir cual registro queda como canonicamente correcto.

Opciones de decision:

1. Fusionar duplicados.
2. Marcar registros antiguos como inactivos.
3. Mantener separados si representan entidades realmente distintas.

### 5. Codigos historicos sin mapeo comercial

| Check | Pendientes |
| --- | ---: |
| Compras online con `codigo_vendedor` sin usuario asociado | 39941 |
| Items de cotizacion con `codigo_interno` sin producto | 3685 |
| Detalles proveedor con `codigo_interno` sin producto | 3473 |

Por que no se corrigieron:

- Los codigos de vendedor legacy no tienen mapeo confiable a `auth.users`.
- Los codigos de cotizacion/proveedor restantes no tienen producto actual o legacy creado por los lotes aplicados.
- La asignacion por similitud puede distorsionar reportes comerciales historicos.

Opciones de decision:

1. Crear tabla de equivalencias legacy.
2. Mapear vendedor antiguo a usuario actual con aprobacion.
3. Crear productos legacy adicionales para cotizaciones/proveedores si el cliente quiere reportabilidad historica completa.
4. Mantener como historico sin cruce si no hay certeza.

### 6. Fechas restantes en pagos proveedor

| Check | Pendientes |
| --- | ---: |
| Fechas operacionales anomalas restantes | 55 |

La auditoria final muestra muestras en:

- `catalogo.pagos_proveedores.fecha_pago`
- valor tipo `0001-01-01`

Por que no se corrigieron:

- No se identifico una fuente automatica equivalente a la fecha real de pago.
- Reemplazar por fecha de creacion o migracion podria alterar reportes financieros.

Opciones de decision:

1. Revisar documentos de proveedor/pago.
2. Permitir `NULL` si la fecha real es desconocida.
3. Usar una fecha aproximada solo si administracion lo aprueba.

### 7. Bitacora taller sin ODT

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

### 8. Movimientos stock legacy

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
- Dejar claro en UI/reportes que son snapshots historicos, no entradas/salidas de inventario.

## Formato recomendado para reunion con cliente

Para cada grupo manual, revisar:

1. Que significaba el dato en el ERP original.
2. Si debe afectar reportes actuales o quedar solo como historico.
3. Si existe una fuente externa para resolverlo.
4. Si se aprueba una regla masiva o solo correccion caso a caso.

No conviene aplicar reglas por similitud de nombre ni heuristicas sin aprobacion del cliente.
