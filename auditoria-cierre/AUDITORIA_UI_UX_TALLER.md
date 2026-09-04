# Auditoría UI/UX — Talleres

## Método

Revisión profunda de componentes frontend actuales, contratos de API, datos de producción y capturas históricas disponibles. Las capturas incluidas corresponden a una línea base anterior y se identifican como históricas; no se presentan como prueba visual del despliegue del 1 de septiembre.

No se completó una sesión interactiva autenticada del navegador en esta consolidación. Los hallazgos de interacción actual se sustentan en código y datos; deben confirmarse con el piloto de aceptación.

## Principio rector

Cada rol necesita una bandeja que responda en segundos:

- ¿qué debo hacer ahora?;
- ¿qué está atrasado o bloqueado?;
- ¿qué información no debo equivocarme en copiar?;
- ¿qué acción puedo ejecutar aquí mismo?;
- ¿qué cambió y quién lo hizo?

## Dashboard de coordinación

### Fortalezas

- Lista y Kanban.
- Filtros por estado, taller, búsqueda y prioridad.
- KPI y distribución de carga por operario.
- Acciones de asignación, edición, devolución y cierre.
- Densidad informativa superior a la versión histórica.

### Problemas

- “Pendientes críticas” no aplica el mismo criterio al abrir el detalle.
- Capacidad por conteo de ODT puede ocultar una orden grande versus varias pequeñas.
- No muestra bloqueos de materiales, cola de calidad ni dependencia de etapas como indicadores principales.
- La ausencia de responsables deja sin valor el KPI por operario.
- Fechas comprometidas nulas vuelven imprecisa la urgencia.
- El Kanban habilita saltos de estado que el negocio no debería aceptar.
- Filtros y etiquetas mezclan estados históricos y normalizados; se necesita un único catálogo visible.

### Diseño recomendado

Cabecera con cuatro KPI accionables: **Atrasadas**, **Bloqueadas por material**, **Pendientes de calidad**, **Listas para entregar**. Debajo, carga por etapa expresada en unidades/horas estándar y una cola de excepciones. Cada KPI debe abrir exactamente el conjunto contado.

## Vista del operario

### Fortalezas

- Diseño móvil, tarjetas grandes y acciones directas.
- Selector Mis tareas/Todas.
- Información básica de producto, cliente, cantidad y observaciones.
- Inicio y término accesibles.

### Problemas críticos

- Abre por defecto en “Mis tareas”, pero producción tiene cero asignaciones: primera impresión de “no hay trabajo”.
- No muestra la fotografía/referencia real como elemento principal.
- “Avance/Notas” es una observación mutable, no una línea de tiempo.
- No pide cantidad terminada, desperdicio, causa de pausa ni foto al finalizar.
- No ofrece acciones visibles de Pausar, Rechazar o Solicitar ayuda.
- Expone reasignación de responsable al operario.
- No muestra la etapa anterior, su aceptación ni el destino siguiente.
- No entrega modo de conectividad débil/cola offline, relevante para Espuma.

### Diseño recomendado

Una tarjeta debe contener, en este orden:

1. urgencia y hora/día de compromiso;
2. foto de referencia;
3. código/MK, producto y cantidad;
4. medidas, color, material/densidad en formato no editable;
5. estado de material y etapa anterior;
6. botones **Iniciar**, **Registrar cantidad**, **Pausar**, **Reportar problema**, **Finalizar**;
7. historial cronológico compacto.

La asignación debe retirarse de la vista operaria.

## Vista de Confección/Zalma

Debe priorizar:

- cola por fecha comprometida;
- trabajo sin operaria;
- carga de cada operaria en unidades/minutos;
- tareas esperando Corte;
- muestras/artículos nuevos esperando autorización;
- rechazados y reprocesos;
- producto listo para entregar a Despacho.

La vista actual cubre la administración genérica, pero no esas colas operativas.

## Vista de Espuma/Sebastián

Debe mostrar en una misma pantalla:

- ODT/MK y foto;
- medidas y densidad requerida;
- stock disponible por lote aprobado;
- consumo teórico y saldo después de reservar;
- alerta de falta de material;
- solicitud de sustitución a Diego;
- consumo real y merma al cerrar.

Hoy los campos y formularios existen, pero la ausencia de atributos/lotes hace que la interfaz no tenga datos útiles para mostrarlos.

## Materiales de Taller

La interfaz debe permitir crear, editar, desactivar/eliminar según uso, y distinguir:

- datos comunes: código, nombre, unidad, categoría, stock, costo;
- atributos de espuma: densidad, espesor, formato;
- lote: código, recepción, cantidad, calidad y observación;
- historial: entradas, consumos, mermas, ajustes y usuario.

La edición no debe consistir solo en “Editar precio”. Densidad y atributos técnicos son datos maestros operativos y deben estar visibles en tabla, filtros y formulario.

## Calidad y handoff

Se recomienda una acción única **Entregar etapa** que obligue a:

- cantidad entregada;
- control de calidad o excepción;
- evidencia cuando corresponda;
- usuario receptor;
- observaciones/discrepancias.

El receptor debe aceptar o rechazar. Hasta entonces, la tarea queda “Esperando recepción”, no “Lista” genérica.

## Accesibilidad y prevención de errores

- Usar etiquetas y texto, no depender solo del color.
- Mantener acciones principales fijas en móvil.
- Confirmar acciones irreversibles con resumen de impacto.
- Evitar escribir dos veces medidas, color o densidad.
- Mostrar la versión de la especificación y avisar si Ventas la modifica.
- Permitir búsqueda por MK, cliente, producto y código interno.
- Registrar automáticamente usuario y hora; no pedirlos manualmente.

## Dictamen UI/UX

La UI administrativa es bastante más madura que la operación que alimenta sus indicadores. El principal trabajo no es agregar más tarjetas: es asegurar asignaciones, eventos estructurados, datos maestros y acciones por rol. Sin esos datos, el dashboard se ve completo pero no dirige la planta.

