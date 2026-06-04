# 32 - Despachos: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, sin captura legacy directa de menu**.

## Fuentes revisadas

- Evidencia legacy: carpeta legacy `despacho`; no aparece captura directa de menu admin.
- Evidencia relacionada legacy: [112-ventas-pendientes-entrega.png](../screenshots/112-ventas-pendientes-entrega.png)
- Captura actual: [15-bodega-despachos.png](../current-screenshots/15-bodega-despachos.png)
- Frontend actual: `frontend/src/pages/despachos/DespachosPage.jsx`, `frontend/src/api/despachos.js`
- Backend actual: `backend/src/routes/despachos/index.js`, `backend/src/routes/despachos/matriz.js`

## Resumen ejecutivo

Legacy tiene evidencia de carpeta `despacho`, pero no una captura directa desde menu admin. El ERP actual dispone `/despachos`, con matriz de despacho, registros, guias, filtros por venta/ODT/fecha, export por vista y links a venta/ODT.

Es una mejora nueva/normalizada respecto al seguimiento de pendientes de entrega.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Despachos | Carpeta legacy sin captura menu. | `/despachos`. | Cubierto/mejorado. |
| Pendientes entrega | Vista matriz legacy. | Dashboard/matriz/despachos. | Cubierto. |
| Guia/registro | No documentado visualmente. | Registros y guias. | Mejorado. |
| Links venta/ODT | No claro. | Links a venta/ODT. | Mejorado. |
| Export | No claro. | Export por vista. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Matriz despacho.
- Registros y guias.
- Filtros por venta, ODT y fecha.
- Links a venta/ODT.
- Export por vista.
- Integracion con pendientes de entrega.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Sin captura legacy directa | No se puede comparar UI antigua. | Revisar codigo/carpeta `despacho` si cliente pide paridad. |
| Formato guia | Puede requerir impresion especifica. | Validar formato de guia/documento. |
| Estados despacho | Pueden existir nombres legacy. | Mapear estados antes de cambiar etiquetas. |

## Detalles legacy que ya no tienen sentido conservar

- Despacho desconectado de matriz/venta/ODT.
- Seguimiento solo como pendientes de entrega sin entidad de despacho.

## Decision del modulo

Modulo **mejorado**. Validar contra codigo legacy si se exige comparacion formal de despacho antiguo.

