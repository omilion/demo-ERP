# 10 - Gastos: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Cubierto, reubicado en Configuracion**.

## Fuentes revisadas

- Captura legacy: [12-editar-nombres-gastos.png](../screenshots/12-editar-nombres-gastos.png)
- Captura actual: [42-configuracion-gastos.png](../current-screenshots/42-configuracion-gastos.png)
- Frontend actual: `frontend/src/pages/config/ConfigPage.jsx`, `frontend/src/api/gastos.js`, `frontend/src/pages/caja/CajaFormPage.jsx`
- Backend actual: `backend/src/routes/gastos/index.js`, `backend/src/routes/caja/index.js`

## Resumen ejecutivo

Legacy administraba `GASTOS` en una pantalla propia con boton `Crear nuevo` y exportaciones PDF/Excel. En el ERP actual los nombres de gasto se administran desde `/config`, pestana **Gastos**, y se usan directamente en el formulario de movimientos de caja.

La funcion esta cubierta. La mejora clave es la eliminacion logica: si un gasto ya fue usado en caja, no debe romper el historial. La exportacion actual es CSV.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Pantalla | `GASTOS` independiente. | Configuracion > Gastos. | Reubicado. |
| Crear gasto | Boton `Crear nuevo`. | Campo `Nuevo nombre de gasto` + `Agregar`. | Cubierto. |
| Listado | No visible por warnings. | Tabla Nombre / Activo. | Cubierto. |
| Exportacion | PDF y Excel visibles. | Exportar CSV. | Cubierto parcialmente; validar PDF. |
| Uso caja | Nombres de gastos legacy usados por caja. | `CajaFormPage` consume catalogo de gastos. | Cubierto. |
| Eliminacion | No visible. | Baja logica si corresponde para conservar historial. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Catalogo centralizado en configuracion.
- Validacion de nombre minimo y duplicados.
- Estado activo/inactivo.
- Baja logica para preservar movimientos de caja.
- Exportacion CSV.
- Uso directo en nuevos movimientos de caja.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Nombres historicos | El baseline pide validar nombres usados por caja. | Comparar datos migrados antes de eliminar o renombrar. |
| PDF legacy | La captura muestra PDF; actual CSV. | Confirmar si caja necesita reporte PDF o si CSV basta. |
| Captura legacy sin tabla | No permite comparar columnas. | Revisar dump/codigo si se pide exactitud. |

## Detalles legacy que ya no tienen sentido conservar

- Warnings PHP visibles.
- Borrado fisico de catalogos usados por caja.
- Pantalla separada si el catalogo pertenece a parametros de configuracion.

## Decision del modulo

Modulo **cubierto**. Mantener en Configuracion y validar catalogo historico con caja antes de depurar nombres.

