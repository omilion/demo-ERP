# Encuesta Bodega 2 — Inventario y Compras

Fuente: `Encuesta_bodega_2_Plastimar.docx`.

## Estado general: Parcial

Hay productos, códigos de barra, ubicaciones estructuradas, movimientos y estados de reserva. Aún falta que la disponibilidad sea una regla única, confiable y automática para separar, comprar y despachar.

## Revisión

| Requerimiento | Estado | Falta para cerrar |
|---|---|---|
| Kardex inalterable | Parcial | Hay movimientos y auditoría; confirmar inmutabilidad, documento origen, usuario y hora para toda entrada/salida/ajuste/traslado. |
| Ubicación de 5 campos | Parcial alto | Existe modal/ruta de ubicación estructurada. Falta validar obligatoriedad y uso en picking. |
| Físico, disponible, reservado y dañado | Parcial | Se observan stock y estado Reserva; falta modelo visible y consistente para dañado y disponible. |
| OC sugerida por stock crítico | Pendiente | No hay evidencia de generación/recomendación automática basada en mínimo o ventas. |
| Código de barras obligatorio | Parcial | Hay búsqueda/lectura; falta bloqueo de recepción y despacho manual sin lectura cuando aplique. |
| Productos dañados y mermas | Parcial | Hay conceptos de movimientos; falta flujo operacional visible con responsable, causa y efecto de disponibilidad. |
| KPI de tiempos | Pendiente | No hay evidencia de métricas OC → recepción → interno → despacho. |

## Criterio de aceptación

Recibir producto con código, ubicarlo, reservarlo para venta, dañarlo parcialmente y despachar el saldo. El sistema debe mostrar en cada momento físico, reservado, disponible y dañado sin ajustes manuales paralelos.
