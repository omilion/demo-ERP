# Encuesta Taller de Espuma

Fuente: `Encuesta_taller_de_espuma_Plastimar.docx`.

## Estado general: Parcial

El sistema puede mostrar pedidos, prioridades y productos, pero no ha cerrado el consumo real de espuma/PVC ni el control de calidad que evita usar una densidad incorrecta.

## Revisión

| Requerimiento | Estado | Falta para cerrar |
|---|---|---|
| Prioridad por fecha comprometida | Parcial | Hay fecha de entrega y prioridad; falta cálculo automático de urgencia y cola visual. |
| Densidad/especificación correcta | Parcial | Puede registrarse producto/descripción; falta atributo técnico obligatorio y visible en OT. |
| Material requerido por OT | Pendiente | No hay evidencia de explosión de materiales/cálculo de espuma y PVC por orden. |
| Consumo al momento de trabajar | Pendiente | Falta registro de consumo ligado a OT, operario, lote y hora. |
| Sobrante, merma y calidad | Pendiente | Faltan eventos estandarizados de calidad, merma y reproceso. |
| Conectividad del taller | Decisión requerida | Es condición de infraestructura; debe medirse cobertura/red antes de exigir operación en línea. |

## Criterio de aceptación

Una OT debe mostrar densidad y material requerido; el operario registra consumo y merma al terminar; el inventario queda actualizado y la desviación de material queda visible para supervisión.

---

## Datos de producción (26-08-2026)

| Dato | Valor | Qué cambia |
|---|---|---|
| **Recetas de producto** | **0** | |
| **Materiales de receta** | **0** | |
| Productos en catálogo | 37.162 | |

**Corrección de fondo:** la ficha marca "Material requerido por OT" y "Consumo al momento de trabajar" como Pendiente por falta de evidencia. El dato es más preciso: **las tablas de recetas, materiales y procesos existen y están completamente vacías**.

Eso reordena el trabajo. Implementar la explosión de materiales sobre cero recetas no le cambia nada al taller. Primero hay que cargar qué lleva cada producto, y eso es levantamiento con el taller de espuma, no desarrollo.

> Medido con consultas de sólo lectura sobre la base productiva. Detalle transversal en [00_datos_y_esfuerzo.md](00_datos_y_esfuerzo.md).
