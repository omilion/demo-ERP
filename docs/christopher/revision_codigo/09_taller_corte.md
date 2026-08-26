# Encuesta Taller de Corte

Fuente: `Encuesta_taller_de_corte_Plastimar.docx`.

## Estado general: Parcial

El Taller de Corte ya existe como módulo y se complementa con ODT, bitácora y catálogo de productos. La encuesta pide que esas piezas sean el flujo obligatorio del trabajo diario, no herramientas opcionales.

## Revisión

| Requerimiento | Estado | Falta para cerrar |
|---|---|---|
| Taller de Corte como entidad | Cumplido | Existe ruta `/taller-corte` y operación asociada. |
| Inicio, término y responsable | Parcial | Existe bitácora; falta que la OT exija y automatice esos hitos. |
| Imagen correcta por MK | Parcial | Catálogo admite imágenes; falta validación de correspondencia y control de cambios de imagen/especificación. |
| Estados Pendiente, En proceso, Terminado | Parcial | Hay estados de trabajo; falta asegurar transición visible y notificación al siguiente taller. |
| Priorización por fecha de entrega | Parcial | Hay datos de plazo/prioridad; falta algoritmo y tablero que ordene automáticamente. |
| Evitar coordinación por WhatsApp | Pendiente | Falta evidencia de cola de trabajo, notificaciones y confirmación de recepción por taller. |

## Criterio de aceptación

Crear una OT con imagen, fecha y especificación; iniciar con operario, finalizarla y verificar bitácora automática, estado actualizado y aviso al siguiente proceso sin intervención manual externa.
