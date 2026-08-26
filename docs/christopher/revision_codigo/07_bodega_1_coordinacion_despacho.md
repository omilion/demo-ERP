# Encuesta Bodega 1 — Coordinación y Despacho

Fuente: `Encuesta_bodega_1_Plastimar.docx`.

## Estado general: Parcial

El ERP ya tiene ventas, despachos, guías, entregas parciales y estados operacionales de inventario. La brecha es la visión única del pedido a través de talleres, bodega y reparto.

## Revisión

| Requerimiento | Estado | Falta para cerrar |
|---|---|---|
| Estado de pedido por taller | Parcial | Existen ODT y módulos de taller; falta consolidación automática en una sola vista de despacho. |
| Bodega Patio / Didáctico / despacho / reparto / entregado | Parcial | Hay ubicaciones y despacho, pero no una cadena operacional estándar y obligatoria. |
| Stock crítico | Cumplido con alcance | Bodega tiene filtros y alertas de stock crítico; falta validar destinatario y periodicidad. |
| Entregas parciales | Cumplido con alcance | La venta muestra entregados y pendientes; validar efecto en guía, saldo y estado de entrega. |
| Dirección completa | Parcial | Formulario captura datos de despacho; falta impedir avance cuando falten campos requeridos según tipo de despacho. |

## Criterio de aceptación

Crear una venta con dos productos, producir sólo uno, emitir despacho parcial y mostrar en una misma consulta: taller responsable, ubicación, entregado, pendiente, guía y próximo paso.

---

## Datos de producción (26-08-2026)

| Dato | Valor | Qué cambia |
|---|---|---|
| Órdenes marcadas "Entregado" | 15.813 de 16.371 | El tablero por estado que pide el levantamiento arrancaría con casi todo en una sola columna |
| Estados de entrega en uso | Sólo 2 de los 4 permitidos | "En despacho" y "Parcial" nunca se usaron: las etapas intermedias del despacho no se están registrando |

Antes de construir el tablero automático conviene entender por qué no se usan las etapas intermedias. Un tablero sobre estados que nadie mueve no reemplaza la coordinación manual, sólo la disfraza.

> Medido con consultas de sólo lectura sobre la base productiva. Detalle transversal en [00_datos_y_esfuerzo.md](00_datos_y_esfuerzo.md).
