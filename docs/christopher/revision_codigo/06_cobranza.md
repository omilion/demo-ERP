# Encuesta de Cobranza

Fuente: `Encuesta_cobranza_Plastimar.docx`.

## Estado general: Parcial alto

Cobranza ya cuenta con módulo, pagos/abonos, saldo por venta y navegación desde la ficha comercial. El levantamiento pide convertirla en fuente única de verdad y agregar seguimiento disciplinado por compromiso.

## Revisión

| Requerimiento | Estado | Falta para cerrar |
|---|---|---|
| Dashboard de deuda y vencimiento | Parcial alto | Confirmar filtros por cliente, antigüedad y documento contra datos reales. |
| Registrar abonos y pagos parciales | Cumplido con alcance | Hay pagos asociados a orden y saldo calculado. Falta conciliación bancaria formal. |
| Alertas 15, 5 y 0 días | Pendiente | No hay evidencia de las tres reglas automáticas con destinatario y registro. |
| Bitácora de gestiones de cobranza | Parcial | CRM tiene gestiones; falta asegurar que cobranza tenga tipo, resultado, fecha, compromiso y vínculo a deuda. |
| Fuente única contra cartola | Pendiente | Falta proceso de conciliación/importación y resolución de diferencias. |
| Visibilidad del vendedor | Parcial | Existen permisos y ficha de venta; falta regla explícita para que vea sólo sus clientes y sus gestiones. |

## Prioridad

Primero definir conciliación y modelo de compromiso de pago. Sin ello las alertas sólo automatizarían información posiblemente incorrecta.

## Criterio de aceptación

Registrar tres abonos, conciliarlos contra una cartola de prueba, crear una gestión con próximo compromiso y verificar alertas a 15, 5 y 0 días sin exponer cartera de otro vendedor.

---

## Datos de producción (26-08-2026)

| Dato | Valor | Qué cambia |
|---|---|---|
| Órdenes con deuda | **864** | Volumen manejable para arrancar el modelo de compromiso de pago sin migración masiva |
| Estados de pago reales | Pagada 15.504 · No pagada 849 · **Rechazada Webpay 17** · **Pendiente Webpay 1** | Los dos últimos **no están en el enum de validación**, igual que ocurre con el estado de entrega |
| Estados permitidos sin uso | "Parcial" y "En despacho" | Existen en la validación y nunca se usaron: **el pago parcial que pide el levantamiento no se está registrando como tal** |

El dato refuerza la prioridad que ya propone la ficha: definir el modelo de compromiso antes que las alertas. Automatizar avisos sobre un estado de pago que no distingue parcialidad produciría alertas equivocadas.

> Medido con consultas de sólo lectura sobre la base productiva. Detalle transversal en [00_datos_y_esfuerzo.md](00_datos_y_esfuerzo.md).
