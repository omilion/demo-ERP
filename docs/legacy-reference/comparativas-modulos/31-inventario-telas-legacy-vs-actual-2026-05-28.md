# 31 - Inventario telas: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, integrado al dominio taller**.

## Fuentes revisadas

- Captura legacy: [89-inventario-telas.png](../screenshots/89-inventario-telas.png)
- Captura actual: [24-taller-telas.png](../current-screenshots/24-taller-telas.png)
- Frontend actual: `frontend/src/pages/telas/TelasPage.jsx`, `frontend/src/pages/telas/TelaDetallePage.jsx`
- Backend actual: `backend/src/routes/telas/index.js`

## Resumen ejecutivo

Legacy tenia inventario de telas como pantalla propia. El ERP actual mantiene `/telas` y `/telas/:id`, convirtiendo tela en entidad consultable con detalle, movimientos, stock minimo e integracion con taller.

La funcion esta mejorada. Falta comparar campos textiles especificos del legacy contra la ficha actual.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Inventario telas | Pantalla legacy. | `/telas`. | Cubierto/mejorado. |
| Detalle tela | No claro. | `/telas/:id`. | Mejorado. |
| Stock minimo | No claro. | Control actual. | Mejorado. |
| Movimientos | No claro. | Movimientos/detalle. | Mejorado. |
| Relacion taller | Vinculado a confecciones. | Integrado al dominio taller. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Tela como entidad propia.
- Detalle consultable.
- Movimientos.
- Stock minimo.
- Integracion con ODT/confecciones.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Campos legacy exactos | Tallas, colores, anchos u otros pueden ser relevantes. | Comparar captura/dump con usuario de confecciones. |
| Flujo de consumo | Tela puede requerir unidades especiales. | Validar unidad de medida y movimientos. |

## Detalles legacy que ya no tienen sentido conservar

- Inventario de telas desconectado de taller/ODT.

## Decision del modulo

Modulo **mejorado**. Validar campos textiles antes de ajustes.

