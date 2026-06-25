# Módulo CRM (Gestión Comercial)

## Qué es
Permite dar seguimiento a las oportunidades de negocio, cotizaciones complejas y clientes potenciales antes de que se formalicen como ventas.

## Dónde está
Ruta: Menú **Ventas → CRM** (`/crm`).

## Cómo hago lo principal

### Gestionar prospectos en el tablero Kanban
1. Ve a **CRM** (`/crm`). Verás un tablero con cuatro columnas (Pendiente, En gestión, Prioridad alta, Cerrado).
2. Para cambiar el estado de un prospecto, arrastra la tarjeta (card) de una columna a otra (interfaz drag and drop).

### Editar detalles de una oportunidad comercial
1. Haz clic directamente sobre la tarjeta (card) del lead en el Kanban.
2. Se abrirá una ventana emergente para editar los comentarios de seguimiento, el monto estimado, la ejecutiva asignada y la fecha de la próxima acción (ej: recordatorio para la próxima semana). No es necesario entrar a la ficha completa de cliente.

### Convertir prospecto a cliente y venta
1. Cuando una oportunidad se concreta, arrastra la tarjeta a la columna **Cerrado**.
2. Al hacerlo, el sistema disparará la conversión automática de prospecto a Cliente e iniciará el flujo de ventas o creación de cotizaciones.

## Campos importantes
- **Ejecutiva comercial:** Responsable del seguimiento del lead.
- **Próxima actividad:** Agenda/bitacora comercial (ej: llamar al cliente la próxima semana).

## Preguntas frecuentes
- **¿Qué pasa si la tarjeta no se puede mover por drag and drop?** Si experimentas un bloqueo al arrastrar, verifica que todos los campos requeridos de la tarjeta estén completos o recarga la página. El arrastre requiere validación en caliente de datos en la base de datos.
