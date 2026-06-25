# Módulo de Licitaciones

## Qué es
Permite gestionar la postulación, adjudicación y ejecución de licitaciones públicas a través de Mercado Público.

## Dónde está
Ruta: Menú **Licitaciones → Licitaciones** (`/licitaciones`).

## Cómo hago lo principal

### Editar ítems inline en una licitación (Override)
1. Abre el detalle de la licitación deseada.
2. En la tabla de productos (sección derecha del panel de 2 columnas), haz clic sobre el campo que deseas modificar (Nombre, Descripción, Precio o SKU).
3. Modifica el valor directamente en la celda (edición inline).
4. Presiona la tecla Enter o haz clic fuera para guardar.
5. **Importante:** Este cambio es un *override* exclusivo de esta licitación y **no afecta** al producto base en el catálogo general.

### Obtener la Ficha Técnica y Económica
1. Entra a la ficha de la licitación.
2. En la barra de acciones superior, haz clic en el botón **Ficha Téc. y Eco.**
3. El sistema generará automáticamente un documento PDF formateado listo para ser presentado en las ofertas de Mercado Público.

## Estructura de la Vista de Ficha
La ficha de licitación está dividida visualmente en dos columnas:
- **Columna Izquierda (Datos Generales):** Contiene el ID de licitación, el Estado, Fecha de plazo, check de Envíos Parciales permitidos y el Monto de despacho.
- **Columna Derecha (Productos):** Listado de productos comprometidos, cantidades y precios unitarios.

## Estados de una Licitación
- **Pendiente:** Ingresada pero sin postulación enviada.
- **En proceso:** Postulación enviada y en revisión por el organismo público.
- **Adjudicada:** Ganada por Plastimar; lista para generar venta u ODT.
- **No Adjudicada / Rechazada / Cerrada:** Postulaciones fallidas o procesos finalizados.

## Preguntas frecuentes
- **¿Cómo vinculo una venta con una licitación?** Al crear una nueva venta de tipo Licitación, el sistema te redirigirá a este módulo para vincular la orden de compra y asociar las ODTs de taller correspondientes.
- **¿Qué significa el check "Envíos Parciales"?** Indica si el cliente (generalmente institucional) acepta recibir la mercadería por partes o si exige la entrega del pedido completo en un único despacho.
