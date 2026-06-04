# 27 - Taller Madera / Externo: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Cubierto como tipo/filtro de ODT, con nomenclatura por validar**.

## Fuentes revisadas

- Capturas legacy: [94-ot-prioridad-alta.png](../screenshots/94-ot-prioridad-alta.png) a [97-busqueda-fechas.png](../screenshots/97-busqueda-fechas.png)
- Captura actual: [18-taller-odt-taller.png](../current-screenshots/18-taller-odt-taller.png)
- Frontend actual: `frontend/src/pages/taller/TallerPage.jsx`
- Backend actual: `backend/src/routes/odts/*`, `backend/src/routes/pasar-taller/index.js`

## Resumen ejecutivo

Legacy usa nomenclatura relacionada con Madera/Externo. El ERP actual lo normaliza dentro de `/taller` como tipo de ODT, usando el mismo flujo de estados, prioridad y fechas.

La funcion esta cubierta; la validacion pendiente es el nombre que espera el cliente.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| OT Madera/Externo | Modulo separado. | Filtro/tipo ODT. | Cubierto. |
| Prioridad alta | Pantalla legacy. | Prioridad ODT. | Cubierto. |
| Busqueda fechas | Pantalla legacy. | Filtros ODT. | Cubierto. |
| Trazabilidad | Separada. | Comun con ODT. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Misma entidad ODT para todos los talleres.
- Estados y prioridad comunes.
- Trazabilidad compartida con despacho/materiales.
- Dashboard por taller.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Nombre Madera vs Externo | Puede afectar capacitacion y busqueda. | Confirmar nomenclatura oficial con cliente. |
| Acceso directo | Puede ser usado por equipo especifico. | Evaluar shortcut filtrado. |

## Detalles legacy que ya no tienen sentido conservar

- Mantener modulo separado solo por nombre si el flujo es el mismo.

## Decision del modulo

Modulo **cubierto**. Resolver nomenclatura antes de cambios de menu.

