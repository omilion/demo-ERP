# Paquete de revision cliente - saneamiento migracion

Fecha de corte: 2026-05-19

## Proposito

Este paquete convierte los pendientes post-saneamiento en planillas revisables por el cliente o por el dueno del ERP original.

No son scripts de correccion. Son archivos para que el cliente confirme decisiones de negocio antes de aplicar cualquier cambio adicional en produccion.

## Como completar las planillas

Cada CSV incluye columnas vacias como:

- `decision_cliente`
- `comentario_cliente`
- `producto_destino_aprobado`
- `usuario_actual_aprobado`
- `odt_aprobada_si_corresponde`

El cliente debe completar esas columnas cuando tenga certeza. Si no hay certeza, debe dejar el caso como historico sin correccion automatica.

Valores sugeridos para `decision_cliente`:

- `APROBAR_CORRECCION`
- `MANTENER_HISTORICO`
- `CREAR_REGISTRO`
- `FUSIONAR_DUPLICADOS`
- `REVISAR_DOCUMENTO`
- `SIN_CERTEZA`

## Indice de archivos

Excel consolidado actualizado con hoja forense:

- `revision-cliente-saneamiento-2026-05-19-forense.xlsx`

| Archivo | Filas de datos | Uso |
| --- | ---: | --- |
| `00_conteos_resumen.csv` | 10 | Resumen ejecutivo de pendientes. |
| `01_ordenes_cliente_revision.csv` | 1856 | Ordenes cuyo RUT no calza con cliente actual y requieren elegir/fusionar/crear cliente. |
| `02_clientes_rut_duplicados.csv` | 403 | Grupos de clientes con RUT duplicado normalizado. |
| `03_proveedores_rut_duplicados.csv` | 10 | Grupos de proveedores con RUT duplicado normalizado. |
| `04_productos_codigo_duplicado.csv` | 1 | Codigo interno producto duplicado: `PACK4`. |
| `05_precios_negativos_items.csv` | 688 | Items de venta con precio unitario negativo. |
| `06_stock_negativo_productos.csv` | 167 | Productos con stock negativo. |
| `07_stock_negativo_telas.csv` | 1 | Telas con stock negativo. |
| `08_fechas_operacionales_anomalas.csv` | 55 | Fechas fuera de rango operativo en tablas auditadas. |
| `09_codigos_vendedor_legacy_resumen.csv` | 53 | Codigos de vendedor legacy sin usuario asociado. |
| `10_cotizacion_codigos_sin_producto_resumen.csv` | 2766 | Codigos de cotizacion sin producto. |
| `11_detalle_proveedor_codigos_sin_producto_resumen.csv` | 903 | Codigos en detalle proveedor sin producto. |
| `12_bitacora_sin_odt_resumen.csv` | 12490 | Resumen por fecha/usuario de bitacora taller sin ODT. |
| `13_bitacora_sin_odt_muestra_500.csv` | 500 | Muestra revisable de bitacora taller sin ODT. |
| `14_movimientos_stock_legacy_resumen.csv` | 7 | Resumen del dump legacy `movimientos_stock`. |
| `15_movimientos_stock_legacy_codigos_resumen.csv` | 4383 | Resumen de lecturas stock legacy por codigo interno. |
| `16_movimientos_stock_legacy_usuarios_resumen.csv` | 2 | Usuarios que generaron lecturas de stock legacy. |
| `17_movimientos_stock_legacy_muestra_500.csv` | 500 | Muestra revisable de lecturas stock legacy. |
| `18_ordenes_cliente_clasificacion_forense.csv` | 1856 | Clasificacion forense de ordenes cliente usando evidencia del ERP legacy. |

## Orden recomendado de revision

1. Clientes y RUT:
   - `01_ordenes_cliente_revision.csv`
   - `02_clientes_rut_duplicados.csv`
   - `18_ordenes_cliente_clasificacion_forense.csv`

2. Inventario:
   - `06_stock_negativo_productos.csv`
   - `07_stock_negativo_telas.csv`
   - `14_movimientos_stock_legacy_resumen.csv`
   - `15_movimientos_stock_legacy_codigos_resumen.csv`
   - `17_movimientos_stock_legacy_muestra_500.csv`

3. Finanzas/compras:
   - `05_precios_negativos_items.csv`
   - `08_fechas_operacionales_anomalas.csv`
   - `11_detalle_proveedor_codigos_sin_producto_resumen.csv`

4. Comercial:
   - `09_codigos_vendedor_legacy_resumen.csv`
   - `10_cotizacion_codigos_sin_producto_resumen.csv`

5. Taller:
   - `12_bitacora_sin_odt_resumen.csv`
   - `13_bitacora_sin_odt_muestra_500.csv`

## Criterios por tema

### Clientes

Decision esperada:

- elegir cliente existente;
- fusionar clientes duplicados;
- crear cliente faltante;
- mantener historico sin cambio.

No aplicar correccion si el cliente no puede confirmar el registro correcto.

Nota forense:

- La revision del ERP PHP legacy muestra que ventas/cotizaciones guardaban `rut_cliente` o `email` como texto, no `cliente_id`.
- Para los casos duplicados se agrego `18_ordenes_cliente_clasificacion_forense.csv`, que propone maestro segun la logica que el sistema viejo habria usado.
- Si el cliente aprueba la regla legacy, la revision manual baja de 1856 ordenes a 201 casos sin cliente destino claro.

### Precios negativos

Decision esperada:

- confirmar si son devoluciones, descuentos, notas o errores;
- aprobar correccion solo cuando el caso sea error confirmado.

No normalizar a cero sin aprobacion, porque cambia total historico.

### Stock negativo

Decision esperada:

- aprobar ajuste formal de inventario;
- mantener negativo si representa deuda operativa real;
- corregir solo con respaldo de bodega/administracion.

### Fechas anomalas

Decision esperada:

- confirmar fecha real desde documento;
- permitir `NULL` historico si el modelo lo soporta;
- mantener como historico si no hay certeza.

### Vendedores legacy

Decision esperada:

- mapear `codigo_vendedor` antiguo a usuario actual;
- crear usuario historico;
- dejar codigo legacy sin asociacion.

### Codigos sin producto en cotizaciones/proveedores

Decision esperada:

- mapear a producto actual;
- crear producto legacy adicional;
- mantener codigo historico sin cruce.

### Bitacora taller sin ODT

Decision esperada:

- confirmar que es bitacora diaria general;
- asociar manualmente solo entradas con ODT evidente;
- crear vista historica separada si corresponde.

### Movimientos stock legacy

Decision esperada:

- confirmar si son lecturas/snapshots de stock;
- aprobar diseno de tabla `bodega.stock_lecturas`;
- no migrar a `bodega.movimientos` salvo que el cliente confirme que son entradas/salidas transaccionales.

## Resultado esperado despues de la revision

Con las planillas completadas se puede preparar un nuevo sprint de scripts aprobados:

1. Backups previos.
2. Tablas de auditoria por lote.
3. Dry-run con conteos.
4. Apply transaccional.
5. Smoke API.
6. Auditoria final.
