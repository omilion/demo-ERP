# Módulo de Pagos a Proveedores

## Qué es
Permite monitorear las cuentas por pagar a proveedores y registrar los pagos realizados, evitando atrasos en los vencimientos.

## Dónde está
Ruta: Menú **Caja → Pagos Proveedores** (`/pagos-proveedores`).

## Cómo hago lo principal

### Consultar cuentas por pagar
1. Ve a **Pagos Proveedores** (`/pagos-proveedores`).
2. El listado muestra las facturas de proveedores cargadas en el sistema.
3. Las facturas que se encuentran **vencidas y pendientes de pago se resaltan automáticamente en color rojo** para alertar al departamento de finanzas.

### Registrar un pago a proveedor
1. Selecciona la factura vencida o por pagar.
2. Haz clic en **Registrar Pago**.
3. Selecciona la cuenta bancaria u origen de fondos, ingresa el número de transacción y guarda el movimiento.

## Campos importantes
- **Fecha de Vencimiento:** Límite para realizar el pago al proveedor.
- **Resaltado en Rojo:** Indicador crítico de que la factura ya superó su fecha límite de pago.

## Preguntas frecuentes
- **¿Cómo se cargan las facturas aquí?** Se crean de forma automática al registrar una compra en el módulo de Compras o al registrar un Ingreso de Mercadería contra factura.
