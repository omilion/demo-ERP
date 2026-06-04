# 26 - Taller Confecciones: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, integrado con telas**.

## Fuentes revisadas

- Capturas legacy: [90-ot-prioridad-alta.png](../screenshots/90-ot-prioridad-alta.png) a [93-busqueda-fechas.png](../screenshots/93-busqueda-fechas.png), [89-inventario-telas.png](../screenshots/89-inventario-telas.png)
- Capturas actuales: [18-taller-odt-taller.png](../current-screenshots/18-taller-odt-taller.png), [24-taller-telas.png](../current-screenshots/24-taller-telas.png)
- Frontend actual: `frontend/src/pages/taller/*`, `frontend/src/pages/telas/*`
- Backend actual: `backend/src/routes/odts/*`, `backend/src/routes/telas/index.js`

## Resumen ejecutivo

Legacy manejaba Taller Confecciones como modulo separado y tenia inventario de telas relacionado. El ERP actual consolida Confecciones como tipo de ODT y mantiene `/telas` como inventario propio integrado al dominio taller.

La mejora es que telas y ODT conviven dentro del flujo productivo.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| OT Confecciones | Modulo separado. | Filtro tipo Confecciones. | Cubierto. |
| Busqueda fechas | Pantalla separada. | Filtros ODT. | Cubierto. |
| Inventario telas | Pantalla legacy. | `/telas` y detalle. | Mejorado. |
| Materiales por ODT | No centralizado. | Consumos/materiales vinculados. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Tela como entidad propia.
- ODT comun con estados/prioridad.
- Materiales por ODT.
- Historial y consumos.
- Integracion con bodega taller.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Flujo exacto telas | Puede ser especifico de confecciones. | Validar con taller Confecciones. |
| Campos legacy de telas | Pueden faltar campos textiles. | Comparar captura 89/datos legacy. |
| Acceso directo | Equipo puede esperar `Taller Confecciones`. | Evaluar shortcut filtrado. |

## Detalles legacy que ya no tienen sentido conservar

- Separar taller completo si ODT por tipo da trazabilidad.
- Inventario telas desconectado de ODT/materiales.

## Decision del modulo

Modulo **mejorado**. Validar flujo de telas con usuario real.

