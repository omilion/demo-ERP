# Módulo de Ventas

## Qué es
Permite registrar y gestionar los pedidos y órdenes de venta de los clientes en Plastimar. Es el origen de todo el flujo del ERP (caja, bodega, taller y despachos).

## Dónde está
Ruta: Menú **Ventas → Listado de Ventas** (`/ventas`) o **Nueva Venta** (`/ventas/nueva`).

## Cómo hago lo principal

### Crear una nueva venta
1. Ve a **Nueva Venta** (`/ventas/nueva`).
2. **Seleccionar Cliente:** Escribe el RUT o nombre. Si es nuevo, recuerda crearlo primero en el módulo de Clientes.
3. **Tipo de Venta:** Selecciona el canal correcto (Venta Sala, Licitación, Convenio Marco o Venta Web). El tipo por defecto es **Venta Sala** (el tipo "Normal" fue descontinuado).
4. **Asignación de Vendedor:**
   - Si eres administrador, puedes asignar la venta a cualquier vendedor de la lista (o marcarla como "Venta del Admin").
   - Si eres vendedor, el sistema te autoasignará por defecto.
5. **Agregar Productos:** En el buscador de ítems, escribe el código o nombre. El buscador desplegará imágenes en miniatura para facilitar la identificación visual del producto.
6. **Formulario de Despacho (Si aplica):**
   - Completa la dirección y añade indicaciones de entrega (datos extra).
   - Elige la región y comuna (los desplegables están encadenados: seleccionar la región filtrará las comunas correspondientes).
   - Escribe el nombre del contacto de entrega y su teléfono (campos separados para asegurar consistencia).
7. Haz clic en **Guardar Venta**. El ERP te redirigirá automáticamente al detalle de la venta (si seleccionaste tipo Licitación, te llevará directamente al módulo de Licitaciones para continuar el proceso).

## Campos importantes
- **Venta Sala:** Venta presencial directa en el local.
- **Licitación / Convenio Marco:** Ventas a instituciones públicas reguladas por Mercado Público. Generan órdenes de trabajo con flujos específicos.
- **Venta Web:** Órdenes recibidas desde el sitio e-commerce.
- **Región y Comuna:** Campos dinámicos requeridos para calcular costos de envío o despachos.

## Preguntas frecuentes
- **¿Por qué no puedo guardar la venta?** Asegúrate de que todos los campos requeridos (Cliente, Vendedor, al menos un Producto e Información de despacho si aplica) estén completos.
- **¿Dónde veo el estado del despacho de una venta?** Puedes consultarlo en la ficha de detalle de la venta o directamente en la pantalla de Despachos.
