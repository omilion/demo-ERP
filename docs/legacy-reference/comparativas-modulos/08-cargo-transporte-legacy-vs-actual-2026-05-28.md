# 08 - Cargo transporte: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Cubierto, reubicado en Configuracion**.

## Fuentes revisadas

- Captura legacy: [09-editar-carga-por-transporte.png](../screenshots/09-editar-carga-por-transporte.png)
- Captura actual: [41-configuracion-cargo-transporte.png](../current-screenshots/41-configuracion-cargo-transporte.png)
- Frontend actual: `frontend/src/pages/config/ConfigPage.jsx`, `frontend/src/api/cargoTransporte.js`
- Backend actual: `backend/src/routes/cargo-transporte/index.js`

## Resumen ejecutivo

Legacy tenia una pantalla propia `Cargo por transporte`, con boton `Crear nuevo` y exportaciones PDF/Excel visibles. En el ERP actual esta funcion se administra desde `/config`, pestana **Cargo transporte**, con nombre, valor %, estado activo y exportacion CSV.

La funcion base esta cubierta. La mejora principal es que el registro puede desactivarse conservando historial y se valida duplicidad/porcentaje. La brecha a validar es la formula real con la que el cliente espera aplicar este cargo en ventas.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Pantalla | Cargo por transporte propia. | Configuracion > Cargo transporte. | Reubicado. |
| Crear cargo | Boton `Crear nuevo`. | Formulario `Nuevo cargo`. | Cubierto. |
| Campos | No se ven columnas por warnings; titulo indica cargo por transporte. | Nombre, Valor %, Activo. | Cubierto. |
| Exportacion | Botones PDF y Exportar a Excel. | Exportar CSV. | Cubierto parcialmente; validar PDF si era usado. |
| Eliminacion | No visible. | Desactivacion conserva historial. | Mejorado. |
| Validacion | No visible. | Nombre minimo, duplicados, valor 0-100. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Desactivacion en lugar de borrado historico.
- Validacion de duplicados.
- Validacion de porcentaje entre 0 y 100.
- Exportacion CSV desde backend.
- Permisos administrativos por configuracion.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Formula de uso en ventas | El baseline pide validar que formula/uso coincida con la operacion real. | Revisar flujo de venta con usuario comercial antes de cambiar calculos. |
| PDF legacy | La captura legacy muestra PDF, actual solo CSV. | Confirmar si PDF era requisito operativo o solo export heredado. |
| Datos no visibles en legacy | Warnings impiden comparar columnas exactas. | Revisar dump/codigo si se piden campos adicionales. |

## Detalles legacy que ya no tienen sentido conservar

- Warnings PHP visibles.
- Dependencia de export Excel/PDF si CSV cubre el trabajo operativo.
- Pantalla aislada si el parametro pertenece a configuracion.

## Decision del modulo

Modulo **cubierto**. No modificar hasta validar la formula de aplicacion del cargo en ventas y si PDF sigue siendo necesario.

