# Matriz de control gerencial

## Matriz actual

| Métrica / KPI | Módulo y dato de origen | Actualización observable | Permiso / alcance actual | Drill-down real | Estado |
|---|---|---|---|---|---|
| Ventas período | Ventas: órdenes + pedidos web + licitaciones adjudicadas | Consulta viva; caché cliente 60 s; no sello “al corte de” | `reportes:read` y permisos de ventas; alcance principalmente por sucursal, no por cartera propia | Parcial: tabla limitada de órdenes; no reconcilia las tres fuentes | **Rojo**: mezcla hechos y puede duplicar licitación/orden |
| Cantidad de ventas | Conteo combinado de las mismas tres fuentes | Igual que ventas | Igual | Parcial | **Rojo**: denominador semánticamente mixto |
| Ticket promedio | Total combinado / cantidad combinada | Derivado en cada respuesta | Igual | No existe explicación ni listado reconciliable | **Rojo** |
| Comparación período anterior | Reejecución completa del agregado para un rango anterior equivalente | En cada filtro | Igual | No | **Rojo**: el rango inicial es año calendario completo, no YTD explícito |
| Ventas por vendedor | Endpoint agregado; paneles auxiliares pueden usar solo la primera página de `/ventas` | 60 s en cliente | Lectura de ventas/reportes | Parcial, sin reconciliación total | **Rojo** |
| Ventas por cliente | Agregado por claves no normalizadas | 60 s | Lectura de ventas/reportes | No llega al documento completo | **Rojo**: un cliente puede dividirse por mayúsculas/minúsculas |
| Cuentas por cobrar | `ventas.cobranza_historico`, documentos emitidos dentro del rango | Consulta viva; caché cliente 60 s | Requiere caja/cobranza además de reportes | Sin detalle desde la tarjeta | **Rojo**: no es cartera “as of”; suma factura completa pendiente |
| Cobrado histórico | Documentos marcados cancelados y monto registrado | 60 s | Caja/cobranza | No | **Rojo**: etiqueta y rango pueden inducir a error |
| Caja neta | Entradas menos salidas de `caja.movimientos_caja` | 60 s | Caja/cobranza | No desde el KPI | **Ámbar/Rojo**: no es saldo bancario ni flujo de caja |
| Stock crítico | Catálogo/bodega y materiales de taller, estado actual | 120 s en cliente | Bodega + reportes | Navega al módulo genérico, no al corte/ítem exacto | **Ámbar**: útil operativamente; no histórico |
| Movimientos de stock | Bodega, bodega taller y telas dentro del rango | 120 s | Bodega | No | **Ámbar** |
| Licitaciones ganadas/pendientes | Cotizaciones de licitación e ítems | 60 s | Ventas/licitaciones | Parcial | **Ámbar**; requiere definir conversión sin doble conteo |
| ODT pendientes | Taller/ODT con alta hasta fecha final | 60 s | Taller + despacho + reportes | Tabla parcial, máximo inicial limitado | **Rojo**: ignora fecha inicial |
| ODT vencidas / en riesgo | ODT y `fechaEntregaCompromiso` | 60 s; usa hora actual | Taller + despacho | Parcial | **Rojo**: 5.772 ODT sin fecha comprometida producen falso cero |
| Despachos pendientes | Despachos y guías | 60 s | Taller + despacho | Navegación genérica | **Ámbar/Rojo** |
| Meta/avance comercial del dashboard | Matriz de totales operativos | Polling cada 120 s | Ventas/reportes | Parcial | **Ámbar**: panel operativo, no financiero |
| EBITDA | No implementado | — | — | — | **No existe** |
| Margen bruto/neto | No hay unión confiable entre facturación y costo real/snapshot | — | — | — | **No existe** |
| Flujo de caja proyectado | No implementado | — | — | — | **No existe** |
| Inventario valorizado, rotación e inmovilizado | No implementado como KPI gerencial | — | — | — | **No existe** |
| Ocupación/capacidad/rentabilidad de taller | No existen tiempos y consumos reales suficientemente completos | — | — | — | **No existe** |

## Diagnóstico de actualización

“Consulta viva” no significa tiempo real confiable. El servidor recalcula sobre tablas transaccionales y React Query conserva resultados 60 o 120 segundos. La reportería no muestra:

- hora exacta del corte;
- estado de conciliación;
- versión de la definición del KPI;
- retraso de cada sistema origen;
- advertencia de datos incompletos.

Además, la página no hace polling continuo de todos los reportes; vuelve a consultar al cambiar filtros o al recuperar foco cuando el dato está obsoleto. Dos ejecutivos pueden ver cifras de distinta antigüedad sin saberlo.

## Matriz objetivo mínima

Antes de certificar el módulo, cada KPI debe tener un contrato explícito:

| KPI objetivo | Hecho contable/operativo válido | Corte | Drill-down obligatorio |
|---|---|---|---|
| Ingreso neto facturado | DTE emitido, menos NC/anulaciones | Devengo y fecha de documento | DTE → orden → cliente |
| Margen bruto | Ingreso neto − costo vendido congelado al despacho/facturación | Mismo corte del ingreso | Producto/OT → componentes del costo |
| EBITDA | Margen bruto − gastos operacionales clasificados | Cierre mensual conciliado | Cuenta contable → comprobante |
| CxC vigente | Saldo original − pagos aplicados − NC, reconstruido a fecha | “As of” seleccionable | Cliente → documento → aplicación de pago |
| Flujo proyectado | Saldo disponible + cobros/pagos probabilizados | Diario/semanal | Evento proyectado → documento origen |
| Inventario valorizado | Existencia por lote × método de costo definido | Cierre diario | Bodega → producto/lote → movimiento |
| Ocupación de taller | Horas planificadas/ejecutadas ÷ capacidad disponible | Turno/día/semana | Centro → operario/máquina → ODT |

