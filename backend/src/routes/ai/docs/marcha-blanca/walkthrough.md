---
documento: WALKTHROUGH-MB
titulo: Resumen y control de la documentación de Marcha Blanca
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Coordinación de Marcha Blanca
---

# Walkthrough de la documentación de Marcha Blanca

## Entrega

La suite contiene DOC-00 a DOC-09 y la ficha complementaria DOC-05B. Cada rol dispone de Markdown para consulta/RAG y HTML para lectura e impresión.

## Orden recomendado de validación

1. DOC-07 Facturación: emisión, envío, Track ID, consulta y rechazo.
2. DOC-04 Despacho: packing, programación, guía, tracking e incidencia.
3. DOC-06 Caja: turno, pago parcial, saldo y cierre con diferencia.
4. DOC-03 Bodega: ingreso, movimiento, daño, picking y packing.
5. DOC-05/05B Taller: ODT transitoria, parcial, reproceso y calidad.
6. DOC-02 Ventas: Sala, Convenio, CRM/Licitación y duplicidad.
7. DOC-08 Administración: rol, permiso extra, contraseña y baja.
8. DOC-09 Feedback: captura, privacidad, severidad y revalidación.

## Criterios comunes

- No duplicidad de operaciones.
- Cantidades, saldos y estados coherentes entre módulos.
- Identificador y evidencia disponibles.
- Excepción tratada sin atajo informal.
- Datos personales y secretos protegidos.
- Manual y pantalla usan el mismo concepto operativo.

## Uso en RAG

Indexar únicamente archivos con `version: MB-1.1` y `uso: Marcha Blanca`. Mantener el número de documento en cada fragmento, excluir capturas con datos personales salvo autorización y reindexar después de cambios funcionales. El asistente debe responder “requiere validación de jefatura” cuando el manual indique control humano o contingencia.

## Estado documental

| Documento | Estado | Dueño de validación |
|---|---|---|
| DOC-00 | Listo para validación | Coordinación MB |
| DOC-01 | Listo para validación | Gerencia |
| DOC-02 | Listo para validación | Jefatura Comercial |
| DOC-03 | Listo para validación | Jefatura Bodega |
| DOC-04 | Listo para validación | Jefatura Despacho + Facturación |
| DOC-05/05B | Listo para validación | Jefatura Taller |
| DOC-06 | Listo para validación | Caja/Finanzas |
| DOC-07 | Listo para validación | Facturación/Finanzas |
| DOC-08 | Listo para validación | Administración |
| DOC-09 | Listo para validación | Coordinación MB + Soporte |

“Listo para validación” significa que el documento fue corregido contra el comportamiento vigente; no reemplaza la aceptación del dueño operativo.
