# Resumen ejecutivo — Auditoría de Talleres

## Dictamen

**Estado general: parcial avanzado, no cerrado para operación obligatoria.**

El trabajo reciente resolvió buena parte de la arquitectura faltante. El problema principal ya no es solamente “falta desarrollar”: es la distancia entre el código, la configuración de datos y la ejecución real en producción.

| Área | Código | Datos/configuración | Uso real | Dictamen |
|---|---:|---:|---:|---|
| Coordinación de ODT | Alto | Parcial | Bajo | Utilizable con controles pendientes |
| Corte | Parcial/alto | Bajo | No demostrado | No listo para adopción obligatoria |
| Confección | Parcial | Bajo | No demostrado | Flujo demasiado genérico |
| Espuma | Alto en modelo | Muy bajo | No demostrado | Función dormida por falta de maestros/lotes |
| Costeo | Alto | Alto en recetas | Bajo | Recetas cargadas, sin evidencia de costo histórico aplicado |
| Calidad | Bajo | Nulo | Nulo | Brecha crítica transversal |
| Bodega Taller | Alto en modelo | Bajo | Nulo | Sin movimientos ni consumos reales |
| Despacho | Parcial | Parcial | No demostrado | Handoff sin aceptación formal |
| Roles/RRHH | Parcial | Parcial | Parcial | Usuarios creados, enlaces y alcance requieren corrección |

## Lo que sí quedó resuelto

- ODT sin venta, asociables a centro de costo.
- Devolución de una ODT desde Taller hacia Ventas con motivo.
- Estados operativos por ítem/etapa: pendiente, en proceso, pausado, listo, rechazado y cancelado.
- Rechazo individual con motivo obligatorio.
- Bitácora para cambios de estado.
- Registro estructurado de avances y fotografías para Corte.
- Campos de densidad, espesor y formato en materias primas de espuma.
- Modelo de lotes con estado de calidad.
- Consumos con lote, calidad, merma y motivo.
- Recetas de fabricación cargadas en producción.
- Roles de taller y operario separados; usuarios clave creados.

## Lo que impide declarar cierre

1. **La bandeja personal del operario nace vacía.** Las 28.414 etapas productivas tienen responsable nulo; la pantalla móvil abre en “Mis tareas”.
2. **No existe prueba de operación real.** Producción tiene 0 avances, 0 evidencias, 0 consumos y solo 3 entradas históricas en bitácora.
3. **Espuma no está configurada.** Bodega Taller tiene 70 materiales activos en total; los 4 asociados a Espumas no tienen densidad, espesor ni formato, y hay 0 lotes. La validación de lote aprobado no se activa sin densidad.
4. **Calidad no es un proceso transversal.** No existe inspección obligatoria, responsable, resultado, evidencia ni bloqueo previo a Despacho.
5. **Los estados no forman un flujo controlado.** El backend admite saltos entre estados no destructivos; es posible pasar directamente de pendiente a listo.
6. **Cerrar una ODT no exige terminar etapas, cuadrar consumos ni aprobar calidad.**
7. **Corte tiene una incompatibilidad de permisos.** Sus endpoints de avance/evidencia exigen `taller:write`, mientras el rol `taller_operario` dispone de `taller.avance:write` y solo lectura general de Taller.
8. **Riesgo de sobreconsumo concurrente por lote.** El stock general se descuenta con condición atómica, pero el lote se verifica y descuenta en pasos separados.
9. **Prioridad y fecha comprometida no están operacionalizadas.** Las 5.772 ODT tienen `fecha_entrega_compromiso` vacía; se pierde el criterio “días para entrega” pedido por Corte y Espuma.
10. **Costeo aún no deja historia aplicada.** Hay recetas, pero 0 snapshots de costo.

## Qué cambió respecto de la auditoría del 26 de agosto

La revisión anterior encontró cero recetas. Esa conclusión ya no representa producción: ahora existen 2.554 recetas, 4.104 materiales y 4.832 procesos. Lo que sigue pendiente es la adopción: no hay snapshots de costo ni consumos reales de taller.

También se implementaron ODT internas, rechazo, avances/evidencias de Corte y trazabilidad de espuma. Son mejoras reales, pero todavía no cuentan con datos ni uso operativo suficiente.

## Decisión recomendada

No rehacer el módulo. Cerrar la brecha en este orden:

1. Corregir permisos y asignación de trabajo por responsable.
2. Definir y hacer cumplir la máquina de estados y las condiciones de cierre.
3. Cargar densidades, espesores, formatos, lotes y stock inicial de espuma.
4. Convertir avances, calidad, consumos y entrega a Despacho en registros obligatorios.
5. Pilotear con Jenifer, Mercedes, Zalma y Sebastián sobre ODT reales.
6. Medir adopción durante una semana antes de declarar cierre.

El detalle y los criterios de aceptación están en [PLAN_CIERRE_PRIORIZADO.md](PLAN_CIERRE_PRIORIZADO.md).
