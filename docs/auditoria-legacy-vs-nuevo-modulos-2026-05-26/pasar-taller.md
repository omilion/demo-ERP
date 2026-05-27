# Auditoria legacy vs nuevo - pasar_taller

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\pasar_taller`

Estado actual: **Aprobado localmente**
Deploy: **No deployado**

## Como se mostraba / funcionaba en legacy

- Entrada desde venta por `n_interno`.
- Tabla con producto, cantidad, observacion de venta, estado producto y seleccion de talleres.
- Seleccion por producto para Confecciones, Espumas y Madera/Externo.
- Indicadores de producto en taller, sin notificar, o cantidad aumentada pendiente de notificar.
- Formulario de prioridad y observacion general de OT.
- Acciones para notificar a taller, actualizar prioridad/observacion y eliminar items de taller.

## Como se muestra hoy en la plataforma nueva

- Pantalla: `frontend/src/pages/pasar-taller/PasarTallerPage.jsx`
- API principal: `backend/src/routes/pasar-taller/index.js`
- Acceso desde venta: `frontend/src/pages/ventas/VentasFormPage.jsx`
- Ruta protegida: `frontend/src/router.jsx`

La pantalla nueva permite buscar por venta/numero interno, ver productos transitorios pendientes, seleccionar talleres por linea, guardar cantidad/observacion, prioridad y observacion general de OT.

## Equivalencia legacy cubierta

- Productos transitorios pendientes: **cubierto**.
- Seleccion de Confecciones/Espumas/Madera: **cubierto** con multiples talleres por item.
- Prioridad OT: **cubierto**.
- Observacion general OT: **cubierto**.
- Observacion por producto: **cubierto**.
- Estado "en taller" y aviso de cantidad distinta: **cubierto**.
- Notificar producto a taller: **cubierto**.
- Evitar duplicados al notificar dos veces: **mejorado** con upsert e idempotencia.
- Evitar duplicados por concurrencia: **mejorado** con advisory lock transaccional.
- Eliminar/quitar item: **cubierto** con permisos, estado abierto y bitacora.
- Scope por sucursal: **mejorado** frente al legacy.
- Bitacora: **mejorado** frente al legacy.

## Seguridad corregida durante el sprint

- Lectura de pasar-taller acepta `taller.read`, `taller.write` o `ventas.write`, coherente con la UI.
- Envio a taller acepta usuarios de ventas autorizados sin exigir permisos amplios de taller.
- Workflow de item/taller valida sucursal, ODT activa y item no eliminado.
- ODT eliminada ya no aparece por detalle directo.
- Anular ODT por update generico requiere permiso `taller.delete`.
- Consumos de ODT validan ODT activa y material_taller scopeado por sucursal.

## Evidencia de validacion

- Unitarias backend sin DB: **29/29 OK**.
- Suite enfocada con Postgres: **56/56 OK**.
- Suite backend completa con Postgres: **385/385 OK**.
- Prisma schema validate: **OK**.
- Frontend lint: **OK**.
- Frontend build: **OK**.
- Revision multiagente final: **sin P0/P1 pendientes**.

## Decision

El modulo queda **aprobado localmente para continuar al siguiente sprint**.

No queda deployado a produccion desde esta ejecucion.
