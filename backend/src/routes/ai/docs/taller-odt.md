# Módulo de Taller (Órdenes de Trabajo - ODT)

## Qué es
Permite gestionar la fabricación, costura y ensamble de productos personalizados o a medida ordenados por los clientes.

## Dónde está
Ruta: Menú **Taller → Órdenes de Trabajo** (`/taller`) y **Pasar a Taller** (`/pasar-taller`).

## Cómo hago lo principal

### Creación Automática de ODTs
1. Cuando se guarda una venta que contiene productos marcados como "transitorios" o fabricables, el ERP genera automáticamente las Órdenes de Trabajo (ODT) correspondientes y las deriva a la cola de "Pasar a Taller".
2. Un encargado debe revisar la cola en `/pasar-taller`, validar los materiales y confirmar la ODT para que sea visible por los operarios.

### Talleres del ERP
Las ODTs se dividen según la especialidad en cuatro talleres:
- **Espumas:** Corte y preparado de planchas y bloques de espuma.
- **Confecciones:** Costura, forros, fundas y tapizado.
- **Madera:** Carpintería y estructuras.
- **Externo:** Trabajos derivados a subcontratistas externos.

### Vista de Operario (Móvil)
Ruta: `/taller-operario` (diseñada para celulares o tablets en el área de producción).
1. El operario inicia sesión y ve la lista de ODTs asignadas a su taller.
2. Selecciona una ODT y puede:
   - **Iniciar:** Cambia el estado a "En proceso" y registra la hora de inicio.
   - **Registrar Avance:** Escribir comentarios sobre el estado del producto.
   - **Finalizar:** Marca como finalizado y mueve el stock del producto al inventario disponible, listando la ODT para despacho.

## Campos importantes
- **Fecha de Entrega (Plazo / Compromiso):** Hito formal e inamovible que define el límite para finalizar el trabajo antes de marcarse como "ODT Atrasada".
- **Estado de la ODT:** Pendiente, En proceso, Terminada, Entregada.

## Preguntas frecuentes
- **¿Por qué una ODT figura como atrasada si ya terminamos el producto?** Asegúrate de que el operario haya presionado el botón "Finalizar" en la vista móvil. Si no lo hace, el sistema seguirá contabilizando las horas de ciclo de producción.
- **¿Cómo se calcula el tiempo de ciclo?** Es el tiempo transcurrido desde que la ODT se crea (o inicia) hasta que se marca formalmente como Terminada. Se reporta en horas.
