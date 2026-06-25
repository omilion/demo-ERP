# Matriz de Ventas

## Qué es
Vista integradora y avanzada de todas las ventas del ERP, pensada para seguimiento operativo: estados de pago y entrega, despacho, y detalle de productos de cada venta en una sola pantalla.

## Dónde está
Ruta: Menú **Ventas → Matriz Ventas** (`/matriz-ventas`).

## Cómo hago lo principal

### Revisar el estado de las ventas
1. Entra a **Matriz Ventas**.
2. Usa los filtros (fecha, estado de pago, estado de entrega) para acotar lo que buscas.
3. Cada fila muestra la venta con su región/ciudad de despacho y una mini-tabla de **Detalle de productos** (cantidad, producto, total).

### Acciones rápidas desde una fila
- **Ver venta:** abre el detalle de la orden.
- **Informe taller (ODT):** lleva a la orden de trabajo asociada.

## Campos importantes
- **Región/Ciudad de despacho:** columna para que bodega visualice rápido a dónde va cada entrega.
- **Cliente conflictivo:** si el cliente está marcado como conflictivo, aparece un indicador de advertencia ⚠.
- **Detalle de productos:** mini-tabla embebida en la fila, sin necesidad de abrir la venta.

## Preguntas frecuentes
- **¿Para qué sirve vs. el listado de Ventas?** El listado es la lista simple; la Matriz agrega despacho, detalle de productos y una vista operativa más completa.
- **¿Puedo exportar?** Sí, hay exportación de los resultados filtrados.
