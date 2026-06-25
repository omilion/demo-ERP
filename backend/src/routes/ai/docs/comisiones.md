# Módulo de Comisiones

## Qué es
Permite consultar el cálculo y reporte de las comisiones acumuladas por los vendedores durante un período de tiempo.

## Dónde está
Ruta: Menú **Ventas → Comisiones** (`/reportes/comisiones`).

## Cómo hago lo principal

### Consultar el reporte de comisiones
1. Ve a **Comisiones** (`/reportes/comisiones`).
2. Selecciona el Período y el vendedor que deseas consultar.
3. El sistema desplegará un desglose detallado de las ventas del vendedor y el monto de comisión acumulado.

## Reglas de cálculo del ERP (Motor de Comisiones)
El ERP aplica reglas estrictas para el pago de comisiones comerciales:
- **Requisitos de Pago:** La comisión solo se devenga y se marca para pago cuando la venta cumple con tres condiciones simultáneas: **Pagada + Entregada + Facturada**.
- **Descuentos y Penalizaciones:** Se descuentan automáticamente del cálculo las notas de crédito emitidas y las multas aplicadas a la orden.
- **Sin Reglas Activas:** Si las comisiones muestran un total de **$0**, verifica que estén cargadas las comisiones base en el módulo **Admin → Reglas de Comisión**. Por defecto, si no hay reglas configuradas, el motor calcula $0 para todas las transacciones.

## Campos importantes
- **Vendido CLP:** Monto neto facturado por el vendedor.
- **Cobrado CLP:** Monto efectivamente pagado por los clientes.
- **Comisión CLP:** Monto a pagar al vendedor tras aplicar las reglas y descuentos.

## Preguntas frecuentes
- **¿Por qué la comisión de una venta cerrada aún marca $0?** Verifica si la venta ya está marcada como "Entregada" y "Facturada". Si falta alguno de estos hitos, la comisión permanecerá retenida hasta su cumplimiento.
