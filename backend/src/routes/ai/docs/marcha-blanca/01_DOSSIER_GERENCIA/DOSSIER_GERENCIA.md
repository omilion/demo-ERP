---
documento: DOC-01
titulo: Dossier ejecutivo para Gerencia
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Gerencia y jefaturas
uso: Marcha Blanca
---

# DOC-01: Dossier ejecutivo para Gerencia

## 1. Resultado que debe vigilar Gerencia

SisGestión 3.0 entrega una trazabilidad compartida entre Comercial, Taller, Bodega, Despacho, Caja y Facturación. No todas las etapas se crean o cierran automáticamente: cada responsable debe ejecutar y verificar su control.

| Etapa | Entrada | Responsable | Evidencia de salida |
|---|---|---|---|
| Venta/CRM | Necesidad del cliente | Comercial | Cotización CRM o venta creada |
| Taller | ODT de producto transitorio/fabricable | Jefatura y operario | Avances, calidad y cantidad terminada |
| Bodega | Producto físico o terminado | Bodega | Movimiento, picking y packing |
| Despacho | Pedido preparado | Despacho | Programación, tracking y entrega registrada |
| Facturación | Venta/guía y datos tributarios | Facturación | DTE emitido, enviado y estado SII consultado |
| Caja/Cobranza | Saldo por pagar | Caja/Cobranza | Pago referenciado, turno y saldo actualizado |

## 2. Controles que no deben delegarse a una supuesta automatización

- Una venta descuenta stock según el flujo vigente; no debe describirse como una reserva universal.
- La ODT automática aplica a productos configurados como **transitorios**. Otros casos deben revisarse y enviarse a Taller según las acciones disponibles.
- Licitaciones y Compras Ágiles nacen desde CRM y se convierten en venta al aprobarse.
- La programación de Despacho, la guía DTE 52 y la confirmación de entrega son acciones diferenciadas.
- El envío de un DTE entrega Track ID y estado `Enviado`; la aceptación/rechazo debe consultarse posteriormente.
- El límite de 20 líneas por DTE es una regla operativa interna de Plastimar y exige dividir manualmente el documento.

## 3. Tablero diario recomendado para Marcha Blanca

Gerencia debe revisar al inicio y cierre de jornada:

1. Ventas creadas por canal y ventas anuladas.
2. Pedidos pendientes de entrega y pedidos atrasados.
3. ODT pendientes, bloqueadas, en reproceso o sin avance.
4. Diferencias de stock, movimientos reversados y productos críticos.
5. Despachos con incidencia, reprogramados, retenidos o devueltos.
6. DTE en borrador, emitidos sin envío, enviados pendientes y rechazados.
7. Saldo por cobrar, documentos con más de 30 días y abonos parciales.
8. Diferencias de cierre de caja.
9. Reportes de Marcha Blanca abiertos por severidad y antigüedad.

## 4. Reunión de control de 15 minutos

| Pregunta | Responsable de responder |
|---|---|
| ¿Qué operación está detenida y desde cuándo? | Jefatura del área |
| ¿Hay impacto en cliente, stock, dinero o SII? | Dueño del proceso |
| ¿Existe un ticket con evidencia y número de operación? | Coordinador de Marcha Blanca |
| ¿Se puede continuar con un procedimiento autorizado? | Jefatura + Administración |
| ¿Qué debe validarse antes de cerrar el incidente? | Usuario reportante |

## 5. Criterios de severidad

- **Bloqueante:** no existe alternativa segura; detiene venta, producción, entrega, caja o facturación.
- **Alta:** existe alternativa autorizada, pero afecta plazo, dinero, stock o cumplimiento tributario.
- **Media:** dificulta el trabajo o genera riesgo de error, sin detener la operación.
- **Baja:** texto, orden visual o mejora de experiencia.

## 6. Criterio de éxito de la Marcha Blanca

La salida se considera controlada cuando los flujos críticos se completan de punta a punta con responsables identificados, saldos coherentes, DTE verificados, excepciones documentadas y usuarios capaces de operar sin atajos informales. La ausencia de tickets no demuestra éxito; también puede indicar que el canal de reporte no se está usando.
