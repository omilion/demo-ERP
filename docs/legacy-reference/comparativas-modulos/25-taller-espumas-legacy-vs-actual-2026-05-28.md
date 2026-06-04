# 25 - Taller Espumas: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Cubierto como filtro/tipo de ODT**.

## Fuentes revisadas

- Capturas legacy: [84-ot-prioridad-alta.png](../screenshots/84-ot-prioridad-alta.png) a [87-busqueda-fechas.png](../screenshots/87-busqueda-fechas.png)
- Captura actual: [18-taller-odt-taller.png](../current-screenshots/18-taller-odt-taller.png)
- Frontend actual: `frontend/src/pages/taller/TallerPage.jsx`
- Backend actual: `backend/src/routes/odts/*`

## Resumen ejecutivo

Legacy tenia Taller Espumas como modulo separado. El ERP actual lo resuelve como tipo/filtro dentro de `/taller`, compartiendo el mismo flujo ODT, estados, prioridad, fechas y exportacion.

Funcionalmente esta cubierto; la duda es si el cliente necesita un link directo en menu.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| OT Espumas prioridad alta | Pantalla propia. | Filtro tipo Espumas + prioridad. | Cubierto. |
| Buscar fechas | Pantalla propia. | Filtros de fecha en ODT. | Cubierto. |
| Flujo de ODT | Separado por taller. | Comun para todos los talleres. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Estados y prioridad comunes.
- Trazabilidad compartida.
- Dashboard con ODTs por taller.
- Filtros en una sola matriz.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Acceso directo `Taller Espumas` | Usuario puede esperarlo en menu. | Validar si se agrega shortcut filtrado. |

## Detalles legacy que ya no tienen sentido conservar

- Mantener una pantalla completa separada si solo cambia el tipo de taller.

## Decision del modulo

Modulo **cubierto**. Evaluar solo shortcut directo.

