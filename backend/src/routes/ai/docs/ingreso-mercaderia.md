# Módulo de Ingreso de Mercadería

## Qué es
Permite registrar la recepción física de compras a proveedores a partir de la factura correspondiente, ingresando metrajes, rollos y cantidades que alimentan el inventario general.

## Dónde está
Ruta: Menú **Bodega → Ingreso Mercadería** (`/stock-ingresos`).

## Cómo hago lo principal

### Registrar ingreso de mercadería contra factura
1. Ve a **Ingreso Mercadería** (`/stock-ingresos`).
2. Haz clic en **Nueva Recepción** y selecciona el proveedor y el número de factura.
3. El sistema cargará el detalle de la compra.
4. **Ingresar Detalles:** Escribe el metraje exacto, los códigos de cada rollo de tela y las cantidades recibidas físicamente.
5. Utiliza el checklist para corroborar que lo recibido coincide con la factura del proveedor.
6. Haz clic en **Aplicar Stock**. Esto actualizará inmediatamente las existencias en la bodega correspondiente (Bodega de Productos o Bodega Taller).

## Campos importantes
- **Metraje / Rollos:** Medida de longitud para insumos de tela. Cada rollo puede tener códigos y medidas específicas.
- **Aplicar Stock:** Acción definitiva que formaliza el movimiento y suma las unidades al inventario.

## Preguntas frecuentes
- **¿Qué pasa si la factura tiene diferencias con lo recibido?** Puedes ingresar la cantidad real recibida en el metraje y dejar una observación en la bitácora del ingreso antes de aplicar el stock.
