# 11 - Caja: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con filtros legacy por validar**.

## Fuentes revisadas

- Capturas legacy: [13-movimientos-hoy.png](../screenshots/13-movimientos-hoy.png) a [21-boletas.png](../screenshots/21-boletas.png)
- Capturas actuales: [25-caja-movimientos-caja.png](../current-screenshots/25-caja-movimientos-caja.png), [26-caja-nuevo-movimiento-caja.png](../current-screenshots/26-caja-nuevo-movimiento-caja.png), [27-caja-cobranza-clientes.png](../current-screenshots/27-caja-cobranza-clientes.png)
- Frontend actual: `frontend/src/pages/caja/CajaPage.jsx`, `frontend/src/pages/caja/CajaFormPage.jsx`, `frontend/src/api/caja.js`
- Backend actual: `backend/src/routes/caja/index.js`

## Resumen ejecutivo

Legacy separaba Caja en varias pantallas: movimientos de hoy, busquedas por fecha, documento/numero, numero interno, tipo de venta, ingreso, egreso, cierre de caja y boletas. El ERP actual consolida la operacion en `/caja` y `/caja/nuevo`, con turno de caja, apertura/cierre, historico, registro de ingresos/egresos, anulacion/reactivacion y exportacion CSV.

La mejora principal es que caja deja de ser solo una lista de movimientos y pasa a operar por turno, con control de apertura/cierre y trazabilidad. Las brechas a validar son filtros muy especificos del legacy.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Movimientos del dia | `Movimientos hoy`. | `/caja`, turno actual e historico. | Mejorado. |
| Buscar por fecha | Pantalla separada. | Filtros Desde/Hasta en historico. | Cubierto. |
| Documento + numero | Pantalla separada. | Documento/numero se registran y muestran; buscador dedicado no confirmado. | Parcial / validar. |
| Numero interno | Pantalla separada. | Se cruza con referencias y matriz ventas. | Parcial / validar. |
| Tipo de venta | Pantalla caja separada. | Se filtra mejor en Matriz Ventas/reportes. | Reubicado. |
| Ingreso/Egreso | Pantallas separadas. | `/caja/nuevo` con tipo de movimiento. | Cubierto. |
| Cierre caja | `Cerrar caja`. | Cierre de turno. | Mejorado. |
| Boletas | Vista aislada. | Documentos de venta/cobranza/caja. | Parcial / validar. |

## Mejoras nuevas que no se deben perder

- Turnos de caja con apertura/cierre.
- Conteo y control operativo de turno.
- Historico centralizado.
- Exportacion CSV.
- Anulacion/reactivacion segun permisos.
- Catalogo de gastos conectado a movimientos.
- Scope por sucursal/usuario cuando aplica.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Filtro directo Documento + Numero | Puede ser busqueda diaria de caja. | Confirmar con cajero antes de agregar. |
| Filtro directo Numero Interno | Puede ser usado para conciliacion. | Validar si Matriz Ventas cubre el caso. |
| Vista Boletas dedicada | Usuarios antiguos pueden pedirla. | Confirmar si basta con documentos en venta/cobranza/caja. |
| Reporte PDF legacy | Si se imprimia cierre diario, CSV no reemplaza todo. | Validar formato requerido de cierre. |

## Detalles legacy que ya no tienen sentido conservar

- Muchas pantallas separadas para busquedas que pueden resolverse con filtros.
- Cierre de caja sin modelo formal de turno.
- Warnings PHP visibles en varias pantallas.

## Decision del modulo

Modulo **mejorado**. No copiar pantallas de busqueda legacy; convertir solo filtros confirmados por caja en criterios de aceptacion.

