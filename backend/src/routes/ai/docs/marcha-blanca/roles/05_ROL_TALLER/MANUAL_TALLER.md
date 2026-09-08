---
documento: DOC-05
titulo: Manual operativo de Taller y Producción
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Jefatura de Taller y supervisores
uso: Marcha Blanca
---

# DOC-05: Manual operativo de Taller y Producción

## 1. Roles

- **Jefatura (`taller`):** administra ODT, asigna trabajo, registra/valida materiales y avances, gestiona excepciones y cierra calidad.
- **Operario (`taller_operario`):** registra el avance permitido desde su terminal. No debe cerrar calidad ni alterar la planificación.

## 2. Cuándo debe existir una ODT

La fabricación comienza sólo con una ODT visible y vigente. Las ventas generan tratamiento automático para productos configurados como **transitorios**; no presupongas que “sin stock” crea siempre una ODT. Revisa la bandeja de pendientes y la acción disponible en la venta.

## 3. Planificación de jefatura

1. Abre **Taller → Órdenes de Taller**.
2. Filtra pendientes y ordena por fecha comprometida/prioridad.
3. Abre la ODT y confirma venta, producto, cantidad, especificación y estación.
4. Asigna responsable y fechas realistas.
5. Confirma materiales/requerimientos antes de iniciar.
6. Verifica que la ODT aparezca en el terminal del operario correspondiente.

## 4. Avances y materiales

- Registra la cantidad realmente procesada; admite avances parciales cuando la pantalla lo permita.
- No declares más que la cantidad pendiente.
- Registra consumos de materiales/telas con lote, calidad, cantidad y merma cuando esos controles estén disponibles.
- Una pausa debe representar una interrupción real. Al reanudar, usa la acción del mismo trabajo.
- Si falta material o la receta/especificación es ambigua, bloquea el avance y reporta; no sustituyas insumos sin autorización.

## 5. Recepción entre etapas y calidad

1. Confirma la recepción de la cantidad que pasa de una etapa a otra.
2. Si existe defecto, registra evidencia y decide el tratamiento autorizado: reproceso, descarte u otra excepción visible.
3. En control final, compara producto, cantidad y especificación.
4. Usa **Aprobar Calidad** sólo para unidades conformes.
5. Si rechazas, registra causa clara y estación de reproceso.
6. Verifica el estado final y la cantidad liberada. Despacho/Bodega deben consultar la disponibilidad; no dependas únicamente de una supuesta notificación automática.

## 6. Excepciones críticas

- ODT duplicada para la misma venta/producto.
- Cantidad de ODT superior o inferior a la necesidad de venta sin explicación.
- Producto transitorio vendido que no aparece en pendientes.
- Avance rechazado, saldo negativo o cantidad mayor al pendiente.
- Material descontado sin avance, o avance sin consumo esperado.
- Calidad aprobada por error.

En cualquiera de estos casos, no crees otra ODT para compensar. Reporta ODT, venta, producto, cantidad anterior/nueva, etapa, usuario y hora.

## 7. Criterio de cierre

La prueba se aprueba cuando una sola ODT conserva vínculo con la venta, las cantidades avanzan sin excederse, materiales y excepciones quedan trazables y sólo las unidades aprobadas se liberan.

Para el trabajo diario del operario utiliza también **DOC-05B: Ficha rápida del Operario**.
