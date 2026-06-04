# 33 - Reporteria gerencial: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Extra nuevo, no deuda legacy**.

## Fuentes revisadas

- Baseline: no existia como modulo fuerte legacy.
- Captura actual: [08-ventas-reporteria-gerencial.png](../current-screenshots/08-ventas-reporteria-gerencial.png)
- Frontend actual: `frontend/src/pages/reportes-gerenciales/ReportesGerencialesPage.jsx`, `frontend/src/api/reportesGerenciales.js`
- Backend actual: `backend/src/routes/reportes/index.js`

## Resumen ejecutivo

Reporteria gerencial no aparece como modulo legacy fuerte. En el ERP actual existe como extra ejecutivo con KPIs y reportes consolidados de ventas, cobranza/caja, stock, licitaciones y operaciones.

No debe tratarse como faltante ni como pantalla que deba igualar al sistema antiguo. Es valor agregado del ERP nuevo.

## Alcance actual

| Area | Funcion actual |
|---|---|
| Ventas | KPIs, ventas, ticket promedio, exportaciones. |
| Cobranza/Caja | CxC, caja neta, cobrado/pendiente. |
| Stock | Stock critico y alertas. |
| Licitaciones | Seguimiento ejecutivo. |
| Operaciones | ODTs, despachos y actividad operacional. |

## Mejoras nuevas que no se deben perder

- Vista ejecutiva consolidada.
- Exportaciones CSV.
- Evita depender de busquedas manuales por modulo.
- Permite revisar salud operacional sin entrar a cada pantalla legacy.

## Brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Criterio contable | Puede haber diferencias entre cobranza historica y saldos actuales. | Validar definiciones con administracion. |
| Doble conteo ventas/licitaciones | Riesgo si una licitacion crea venta. | Confirmar reglas de agregacion. |
| Filtros ejecutivos | Gerencia puede pedir cortes por periodo/sucursal/tipo. | Levantar requerimientos reales, no por paridad legacy. |

## Detalles legacy que ya no tienen sentido conservar

- Depender de multiples busquedas manuales para obtener vista gerencial.

## Decision del modulo

Modulo **extra nuevo**. Preservar y ajustar solo por requerimientos ejecutivos reales.

