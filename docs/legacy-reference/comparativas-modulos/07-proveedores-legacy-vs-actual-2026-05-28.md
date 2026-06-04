# 07 - Proveedores: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con validacion pendiente de campos legacy exactos**.

## Fuentes revisadas

- Captura legacy: [08-editar-proveedores.png](../screenshots/08-editar-proveedores.png)
- Captura actual: [16-bodega-proveedores.png](../current-screenshots/16-bodega-proveedores.png)
- Frontend actual: `frontend/src/pages/proveedores/ProveedoresPage.jsx`, `frontend/src/api/proveedores.js`
- Backend actual: `backend/src/routes/proveedores/index.js`, `backend/src/routes/proveedores/helpers.js`, `backend/src/routes/pagos-proveedores/index.js`

## Resumen ejecutivo

Legacy tenia una pantalla propia de **Proveedores** con crear nuevo, busqueda por RUT, busqueda por nombre y exportaciones PDF/Excel. La plataforma actual mantiene `/proveedores` como modulo propio y lo mejora con KPIs, busqueda por modo, export CSV, impresion/PDF, ficha lateral, margenes por tipo de venta y pagos asociados.

La funcion esta cubierta y ampliada. La captura legacy no muestra la grilla por warnings PHP, por lo que queda pendiente comparar todos los campos historicos exactos si el cliente lo exige. Aun asi, los campos operativos principales estan representados en el formulario actual.

## Vista antigua

La captura [08-editar-proveedores.png](../screenshots/08-editar-proveedores.png) muestra:

| Elemento legacy | Observacion |
|---|---|
| Titulo `Proveedores` | Modulo directo desde menu. |
| Boton `Crear nuevo` | Alta de proveedor. |
| Botones `RUT` y `Nombre` | Busquedas dedicadas. |
| Botones `PDF` y `Exportar a Excel` | Salidas legacy. |
| Warnings PHP | La tabla no carga visualmente por errores de include/desconexion. |

## Vista actual

La captura [16-bodega-proveedores.png](../current-screenshots/16-bodega-proveedores.png) muestra:

| Elemento actual | Funcion |
|---|---|
| KPIs | Total proveedores, con email, con margen configurado, margen promedio sala. |
| Busqueda por modo | Todos, Nombre, RUT, Codigo. |
| Acciones | Exportar CSV, PDF/Imprimir, Nuevo proveedor. |
| Tabla | Codigo, proveedor/RUT, giro, email, telefono, margenes, region. |
| Ficha lateral | Datos, pagos, registrar pago, editar y eliminar segun permisos. |

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Listado proveedores | Pantalla propia; grilla no visible en captura. | Tabla con filtros, KPIs y paginacion backend. | Mejorado. |
| Crear proveedor | Boton `Crear nuevo`. | Modal `Nuevo proveedor`. | Cubierto. |
| Buscar por RUT | Boton dedicado. | Modo de busqueda `RUT`. | Cubierto. |
| Buscar por nombre | Boton dedicado. | Modo de busqueda `Nombre`. | Cubierto. |
| Buscar por codigo | No visible en captura legacy. | Modo `Codigo`, codigo proveedor autogenerable/validado. | Mejorado. |
| Exportacion | PDF y Excel. | CSV e impresion/PDF desde navegador. | Cubierto; validar Excel/PDF formal. |
| Ficha proveedor | No visible por captura. | Panel lateral con datos, contacto, margenes y pagos. | Mejorado. |
| Pagos asociados | Legacy lo trataba tambien desde cobranza. | Pagos asociados al proveedor y a pagos proveedores. | Mejorado. |
| Eliminacion | No visible. | Baja logica `activo=false`; pagos se anulan con trazabilidad. | Mejorado. |

## Mejoras nuevas que no se deben perder

- KPIs del catalogo de proveedores.
- Busqueda unificada y tambien por nombre/RUT/codigo.
- Codigo proveedor controlado.
- Margenes separados: venta sala, Convenio Marco y licitacion.
- Ficha lateral sin salir del listado.
- Pagos del proveedor visibles desde la ficha.
- Control de duplicados y locks transaccionales para escritura.
- Anulacion de pagos con restricciones si hay stock aplicado.
- Scope por sucursal para pagos.
- Permisos separados de lectura/escritura/eliminacion.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Campos legacy exactos no visibles | La captura antigua no permite comparar columna por columna. | Revisar dump/codigo legacy de proveedores si se pide equivalencia total. |
| Excel legacy | Actual exporta CSV, no XLS nativo. | Confirmar si CSV basta o si usuario necesita XLSX. |
| PDF legacy | Actual usa impresion/PDF del navegador. | Validar si cliente requiere formato PDF fijo. |
| Datos actuales vacios en captura | La captura muestra 0 proveedores por ambiente local. | Validar con datos migrados antes de demo. |
| Ficha de pagos cruza otro modulo | Pagos tambien vive en `/pagos-proveedores`. | Aclarar al cliente que proveedor y pagos se separan pero se enlazan. |

## Detalles legacy que ya no tienen sentido conservar

- Warnings PHP visibles.
- Pantallas/botones de busqueda separados si la vista actual ya filtra por modo.
- Excel/PDF legacy como dependencia tecnica si CSV/impresion cubren la operacion.
- Eliminar registros sin conservar trazabilidad.

## Decision del modulo

Modulo **cubierto y mejorado**. Mantener `/proveedores` como modulo propio y validar solo campos historicos exactos, formato de exportacion y datos migrados reales.

