# Módulo de Bodega (Inventario)

## Qué es
Permite monitorear el inventario de productos terminados, insumos y telas, controlando las existencias, ubicaciones físicas y alertas de stock crítico.

## Dónde está
Ruta: Menú **Bodega → Inventario** (`/bodega`).

## Cómo hago lo principal

### Buscar productos y consultar stock
1. Ve a **Inventario** (`/bodega`).
2. Utiliza los filtros superiores para buscar por **Código**, **Nombre**, **Categoría** o **Estado** (Disponible, En tránsito, Reservado, Descontinuado).
3. Haz clic en el producto para abrir su ficha y ver su stock disponible actual en tiempo real.

### Revisar productos en stock crítico
1. En la matriz de inventario, puedes ordenar por stock para ver los que están por debajo de su límite de seguridad.
2. Si un producto baja de su **Stock Crítico** predefinido, el sistema generará una advertencia visual.
3. Puedes emitir un reporte de Stock Crítico (incluso pedirlo vía Excel al Asistente IA) para planificar la reposición de mercadería.

## Estructura de Bodegas (Separación Operativa)
Plastimar maneja dos bodegas con lógica y stock independientes:
- **Bodega de Productos:** Contiene bienes terminados listos para ser comercializados directamente (colchones, espumas estándar, etc.).
- **Bodega Taller:** Almacena los insumos, metrajes de telas, rollos y materias primas que serán consumidos en la confección dentro del taller.

## Campos importantes
- **Stock Crítico:** Cantidad mínima requerida del producto en bodega. Si el stock real baja de este valor, se dispara una alerta.
- **Ubicación Física:** Estante, rack o sección de la bodega donde se encuentra físicamente el producto.
- **Historial de Movimientos:** Registro auditable de cada entrada, salida o transferencia de stock, indicando el usuario responsable y la venta u ODT origen.

## Preguntas frecuentes
- **¿Cómo sé si una tela está disponible en el Taller?** Consulta la pestaña o filtro de "Bodega Taller" en el buscador. El stock se actualiza automáticamente al ingresar facturas de compras o al finalizar trabajos.
- **¿Por qué hay stock negativo?** El ERP permite la facturación de productos transitorios o bajo pedido. Sin embargo, esto genera un registro temporal negativo hasta que se aplique la recepción de la mercadería correspondiente.
