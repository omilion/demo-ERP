# Encuesta Taller de Confección

Fuente: `Encuesta_taller_de_confeccion_Plastimar.docx`.

## Estado general: Parcial

ODT, talleres y bitácora proporcionan base operativa. Aún faltan datos de fabricación específicos que expliquen por qué una pieza se hizo, se rechazó o debió rehacerse.

## Revisión

| Requerimiento | Estado | Falta para cerrar |
|---|---|---|
| Visibilidad de pedidos asignados | Parcial | Existe taller/OT; falta una cola propia y notificaciones nuevas. |
| Variantes por MK y medida | Pendiente | El catálogo contiene producto, pero no evidencia suficiente de variante técnica por OT. |
| Fotos y muestras adjuntas | Parcial | Hay imágenes de producto; falta adjunto/evidencia específica por OT. |
| Tareas internas sin venta | Pendiente | Falta entidad de tarea interna con centro de costo. |
| Rechazo y retrabajo | Pendiente | No hay estado ni causa estandarizada para pieza rechazada/retrabajo. |
| Aviso de término | Parcial | Hay estados/bitácora, pero falta notificación formal a bodega o despacho. |

## Criterio de aceptación

Crear una OT de una variante, adjuntar muestra, registrar rechazo con causa y retrabajo, y comprobar que el costo/tiempo no se confunda con una venta ni desaparezca de la trazabilidad.

---

## Datos de producción (26-08-2026)

| Dato | Valor | Qué cambia |
|---|---|---|
| **Evidencia fotográfica** | tabla `taller_evidencias` creada, **0 registros** | La brecha "Fotos y muestras adjuntas" no es de modelo: la estructura existe y está vacía |
| Bitácora | 3 registros para 5.772 OT | |
| Estados de OT | 88,8% en Pendiente | El estado de rechazo y retrabajo se sumaría a un campo que hoy casi no se mueve |

**Corrección a "Fotos y muestras — Parcial":** debería leerse como **implementado sin uso**, que es distinto. El trabajo pendiente es de adopción, no de desarrollo.

> Medido con consultas de sólo lectura sobre la base productiva. Detalle transversal en [00_datos_y_esfuerzo.md](00_datos_y_esfuerzo.md).
