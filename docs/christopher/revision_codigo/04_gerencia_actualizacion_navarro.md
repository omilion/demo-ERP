# Encuesta Gerencia — actualización Navarro

Fuente: `Encuesta_gerencia_Plastimar-lNAVARRO-2026.docx` y anexo incorporado en el informe consolidado.

## Estado general: Parcial

La actualización agrega seis decisiones de alto impacto: separación Convenio Marco/Trato Directo, estados formales, visibilidad restringida, alertas, reportes específicos y bloqueo por diferencias. Son principalmente reglas de negocio; no deben tratarse como cambios visuales.

## Revisión punto por punto

| Hallazgo | Estado | Brecha concreta |
|---|---|---|
| Separar Convenio Marco y Trato Directo | Pendiente | Convenio Marco existe; Trato Directo no es tipo independiente. |
| Estados Creada a Cerrada | Parcial | La venta combina estado, pago, entrega y DTE, sin transición única ni validación central. |
| Restricción de visibilidad | Parcial | RBAC existe; falta política de datos sensibles por atributo/reporte. |
| Alertas de excepción | Parcial | Hay notificaciones puntuales, no las 10 reglas con escalamiento solicitadas. |
| Reportes por canal y vendedor | Parcial | Reportes/Matriz permiten filtros; falta certificar cobertura de cada dimensión y exportación. |
| Bloquear operación con diferencias | Pendiente | No hay una regla transversal que impida cierre ante diferencia de monto, pago, documento o stock. |

## Diseño mínimo recomendado

Crear una transición de estado en servidor, no editable libremente por interfaz. Cada transición debe declarar precondiciones: pago confirmado, DTE válido, despacho emitido, saldo, stock y aprobación cuando corresponda. Las excepciones deben generar un registro de aprobación o alerta, no sólo un mensaje.

## Criterio de aceptación

Intentar cerrar una venta con pago incompleto, monto distinto, despacho pendiente o DTE ausente. El servidor debe rechazarla, explicar la causa, generar evidencia y permitir sólo al rol autorizado resolver la excepción.
