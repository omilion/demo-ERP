# Encuesta de Finanzas y Facturación

Fuente: `Encuesta_finanzas_y_facturacion_Plastimar.docx`.

## Estado general: Parcial alto

El ERP tiene una implementación DTE robusta: factura, boleta, guía, NC, ND, referencias y validaciones SII. La principal tarea es certificar las reglas operacionales del levantamiento y cerrar datos obligatorios antes de emisión.

## Cobertura

| Necesidad | Estado | Evidencia / brecha |
|---|---|---|
| Datos tributarios antes de facturar | Parcial | El motor DTE valida receptor para factura/guía/NC/ND; falta probar el flujo desde una venta incompleta y el selector de sucursal/dirección. |
| Boleta anónima | Parcial | El motor distingue boleta; Venta Sala aún exige cliente al crear, por lo que la experiencia completa no está cerrada. |
| Facturación por monto global | Cumplido | La interfaz DTE ofrece facturar como ítem global. |
| Máximo 20 ítems | Parcial | Existe utilidad de límite de líneas DTE; falta prueba de aceptación con venta de 20 y 21 ítems. |
| Guía sin venta | Por verificar | Existen rutas de despacho/guías; falta caso probado de traslado interno sin orden de venta. |
| NC/ND con motivo SII | Cumplido | Flujo DTE y catálogos de referencias/motivos están implementados. |
| NC interna para stock | Cumplido con alcance | Existe Nota de Crédito Interna, separada de DTE. Debe validarse autorización y efecto de stock. |
| Trazabilidad N° interno-guía-DTE | Parcial alto | Documentos se relacionan a orden; falta prueba de recorrido completo y reporte de excepciones. |

## Pendientes de negocio

- Definir campos mínimos para factura, boleta, guía y despacho.
- Definir tratamiento cuando una venta requiere más de un documento.
- Confirmar qué dirección debe prevalecer: sucursal cliente, SII o override comercial.

## Criterio de aceptación

Ejecutar una venta con 21 ítems, emitir documento válido, generar guía, NC y ND referidas, y verificar que cada documento pueda rastrearse desde la venta y desde el folio tributario.

---

## Datos de producción (26-08-2026)

| Dato | Valor | Qué cambia |
|---|---|---|
| DTE emitidos | **28 en total** | El módulo está en marcha blanca, no en operación |
| Tipos emitidos | 33 (18) · 52 (3) · 61 (3) · 34 (1) | |
| Estados | borrador 11 · aceptado 8 · rechazado 4 · emitido 2 | Hay rechazos del SII que conviene revisar antes de escalar el volumen |
| **Ítems por documento** | **máximo 14; ninguno sobre 20** | **La regla de máximo 20 ítems no se puede validar con datos reales** |

**Corrección a "Máximo 20 ítems — Parcial":** debería leerse como **no verificable hoy**. No hay evidencia de que la regla esté implementada ni de que se haya ejercido nunca. El criterio de aceptación de esta ficha —emitir una venta de 21 ítems— tiene que construir el caso, porque no existe en la base.

> Medido con consultas de sólo lectura sobre la base productiva. Detalle transversal en [00_datos_y_esfuerzo.md](00_datos_y_esfuerzo.md).
