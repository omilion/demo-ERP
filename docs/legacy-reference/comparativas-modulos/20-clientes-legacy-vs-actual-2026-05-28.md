# 20 - Clientes: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con campos legacy por validar**.

## Fuentes revisadas

- Capturas legacy: [50-todo-el-listado.png](../screenshots/50-todo-el-listado.png), [51-buscar-por-nombre.png](../screenshots/51-buscar-por-nombre.png), [52-buscar-por-e-mail.png](../screenshots/52-buscar-por-e-mail.png)
- Capturas actuales: [28-clientes-clientes.png](../current-screenshots/28-clientes-clientes.png), [29-clientes-nuevo-cliente.png](../current-screenshots/29-clientes-nuevo-cliente.png), [10-ventas-crm.png](../current-screenshots/10-ventas-crm.png)
- Frontend actual: `frontend/src/pages/clientes`, `frontend/src/pages/crm`
- Backend actual: `backend/src/routes/clientes`, `backend/src/routes/crm`

## Resumen ejecutivo

Legacy ofrecía listado de clientes y busquedas por nombre/email. El ERP actual mantiene `/clientes` y `/clientes/nuevo`, agrega cliente canonico, sucursales, historial comercial/operativo y CRM.

La funcion esta mejorada. La validacion pendiente es comparar campos legacy exactos y reglas de duplicidad por RUT/email.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Listado completo | Pantalla dedicada. | `/clientes`. | Cubierto. |
| Buscar por nombre | Pantalla dedicada. | Buscador/filtros en clientes. | Consolidado. |
| Buscar por email | Pantalla dedicada. | Buscador/filtros en clientes. | Consolidado. |
| Crear cliente | Flujo legacy no detallado en indice. | `/clientes/nuevo`. | Cubierto. |
| Sucursales/contactos | No claro en captura legacy. | Cliente canonico y sucursales. | Mejorado. |
| CRM | No aparece como modulo legacy fuerte. | `/crm` conectado a clientes. | Extra nuevo. |

## Mejoras nuevas que no se deben perder

- Cliente canonico.
- Sucursales/datos relacionados.
- Validaciones de duplicados.
- Historial comercial/operativo.
- CRM para seguimiento.
- Permisos por modulo.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Campos legacy exactos | Puede faltar un campo usado por ventas. | Comparar formulario antiguo/dump si cliente pide paridad. |
| Regla RUT/email | Duplicados afectan ventas y cobranza. | Validar reglas con datos migrados. |
| Busqueda email dedicada | Usuarios antiguos pueden pedir boton especifico. | Mantener buscador general si cubre el caso. |

## Detalles legacy que ya no tienen sentido conservar

- Pantallas separadas por cada busqueda simple.
- Clientes duplicados por email/RUT si el modelo canonico lo evita.

## Decision del modulo

Modulo **mejorado**. Validar campos y duplicados con datos reales antes de ajustes.

