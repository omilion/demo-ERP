# Encuesta de Gerencia

Fuente: `Encuesta_gerencia_Plastimar.docx`.

## Estado general: Parcial alto

Gerencia ya tiene reportes, permisos administrativos, auditoría, descuentos con aprobación y visibilidad de módulos. El pendiente no es crear otra pantalla, sino formalizar controles de excepción y restricciones de información.

## Revisión de necesidades

| Necesidad | Estado | Observación |
|---|---|---|
| Dashboard ejecutivo por canal | Parcial | Existe Reportería Gerencial y Matriz; falta validar todos los cortes solicitados: canal, vendedor, cliente, producto y periodo. |
| Aprobar descuentos con trazabilidad | Cumplido con alcance | Se implementó solicitud, aprobación/rechazo, permiso de aprobación y bloqueo de autoaprobación. Falta definir la política comercial real y cargar reglas. |
| Aprobar anulaciones, OC y excepciones | Parcial | Hay permisos y flujos puntuales, no una bandeja única de aprobaciones para todos los eventos. |
| Auditoría y cuadratura | Parcial | Existe módulo de auditoría e integridad; falta acordar qué descuadres se bloquean y cuáles generan alerta. |
| Alertas de operación | Parcial | Hay notificaciones, pero no cobertura garantizada de entrega atrasada, factura proveedor, RRHH, producción lista y licitación adjudicada. |
| Información sensible sólo a Gerencia | Parcial | Hay RBAC por módulo. Falta verificar protección de márgenes, costos, flujo de caja y reportes individuales a nivel de dato, no sólo de pantalla. |

## Brechas prioritarias

1. Catálogo de aprobaciones: descuento, precio bajo margen, anulación, NC/ND, plazo, venta sin stock y devolución.
2. Matriz explícita de visibilidad de márgenes, costos, remuneraciones y datos bancarios.
3. Tablero de excepciones con responsable, fecha límite, estado y evidencia de resolución.

## Criterio de aceptación

Con un usuario de Ventas, Finanzas, Bodega y Gerencia, probar que cada uno ve sólo lo autorizado; que una excepción se crea, se asigna, se aprueba/rechaza y queda auditada con usuario y hora.

---

## Datos de producción (26-08-2026)

| Dato | Valor | Qué cambia |
|---|---|---|
| Estados de venta | 3 campos independientes; 15.813 órdenes con un valor que la validación rechaza | Refuerza el bloqueo del flujo único con evidencia dura: no es sólo que los estados estén repartidos, es que validación y datos no coinciden |
| Segmento de cliente | **16.645 de 16.645 en "C"** | Los reportes por segmento que pide el levantamiento no tienen de dónde salir |
| Tipo de cliente | 97% clasificado el 26-08-2026 | Recién utilizable; hasta el día anterior estaba vacío en el 99,9% |
| Oportunidades CRM | 33.934, sin ninguna gestión humana registrada | Los KPI de gestión comercial medirían una actividad que todavía no ocurre |

> Medido con consultas de sólo lectura sobre la base productiva. Detalle transversal en [00_datos_y_esfuerzo.md](00_datos_y_esfuerzo.md).
