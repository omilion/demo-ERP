# 15 - Convenio Marco: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Cubierto, consolidado en Ventas/Matriz**.

## Fuentes revisadas

- Capturas legacy: [33-nueva-venta-convenio-marco.png](../screenshots/33-nueva-venta-convenio-marco.png), [34-buscar-por-numero-de-venta.png](../screenshots/34-buscar-por-numero-de-venta.png), [35-buscar-por-fechas.png](../screenshots/35-buscar-por-fechas.png)
- Capturas actuales: [03-ventas-nueva-venta.png](../current-screenshots/03-ventas-nueva-venta.png), [04-ventas-matriz-ventas.png](../current-screenshots/04-ventas-matriz-ventas.png), [33-admin-descuentos.png](../current-screenshots/33-admin-descuentos.png)
- Frontend actual: `frontend/src/pages/ventas`, `frontend/src/pages/matriz-ventas`, `frontend/src/pages/descuentos`
- Backend actual: `backend/src/routes/ventas`, `backend/src/routes/matriz-ventas`, `backend/src/routes/descuentos`

## Resumen ejecutivo

Legacy tenia Convenio Marco como modulo comercial separado: nueva venta, busqueda por numero y busqueda por fechas. El ERP actual lo normaliza como tipo de venta dentro de `/ventas` y lo consolida en `/matriz-ventas`, manteniendo descuentos Convenio Marco en `/descuentos`.

La cobertura esta resuelta. La duda no es funcional sino de acceso: puede requerir boton/menu visible si el equipo lo usa todos los dias.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Nueva venta CM | Pantalla dedicada. | `/ventas/nueva` seleccionando tipo Convenio Marco. | Reubicado. |
| Buscar por numero | Pantalla dedicada. | Buscador ventas/matriz. | Consolidado. |
| Buscar por fechas | Pantalla dedicada. | Matriz con tipo y fechas. | Consolidado. |
| Descuento CM | Pantalla `% desc. Convenio Marco`. | Bloque en `/descuentos`. | Cubierto. |
| OC/ref obligatoria | No se confirma en captura legacy. | Regla normalizada segun baseline. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Tipo de venta normalizado.
- Matriz consolidada por tipo.
- Descuentos Convenio Marco separados de descuentos normales.
- OC/referencia como dato obligatorio cuando aplica.
- Seguimiento junto a venta, cobranza y despacho.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Acceso visible separado | Usuario puede esperar modulo diario "Venta Convenio Marco". | Validar antes de agregar link directo. |
| Campos formulario legacy | Puede haber campos especificos del CM. | Comparar formulario con usuario comercial. |
| Reporte por fechas | Matriz cubre, pero tal vez necesitan vista dedicada. | Validar uso diario. |

## Detalles legacy que ya no tienen sentido conservar

- Mantener Convenio Marco como entidad aislada si el tipo de venta normalizado da mejor reporte.
- Duplicar busquedas por numero/fecha fuera de matriz.

## Decision del modulo

Modulo **cubierto**. Mantener consolidado y evaluar solo acceso directo visible.

