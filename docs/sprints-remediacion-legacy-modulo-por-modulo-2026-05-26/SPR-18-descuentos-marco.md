# SPR-18-descuentos-marco - descuentos_marco

Prioridad: **P2 - completar equivalencia**
Dominio: **Comercial / Ventas**
Subagentes revisores: **Hubble** y **Rawls**
Estado: **Aprobado**
Decision lead: **Aprobado para continuar a SPR-19**

## Objetivo

Revisar y reparar el modulo legacy `descuentos_marco`, que mantenia el catalogo de porcentajes aplicables a ventas Convenio Marco, y asegurar que la plataforma nueva no lo trate como una pantalla aislada.

## Como funcionaba en legacy

- Ruta legacy principal: `descuentos_marco`.
- Tabla administrada: `descuentos_porc_marco`.
- Listado: columna unica `Valor % aplicado venta total Convenio Marco`, ordenada por `valor`.
- Nuevo/editar: campo requerido `valor`, con ayuda `EJ: 1.8 (utilice punto para decimales)`.
- Acciones: crear, modificar, confirmacion de eliminar con `Acepto` / `No Acepto`.
- Eliminacion legacy: hard delete.
- Uso real: el catalogo se cargaba en Convenio Marco como selector y el descuento se aplicaba a la venta total.
- Formula legacy: `round(($subtotal * $descuento_aplicado) / 100)` y luego resta sobre la base de venta usada por Convenio Marco.
- No habia filtros, exportacion, auditoria, unicidad ni validacion numerica robusta.

## Estado actual despues del sprint

- La pantalla nueva `Descuentos` administra catalogos normales y Convenio Marco en una misma vista.
- `descuentos_marco` tiene crear, editar, listar y eliminar.
- Los porcentajes se validan como numeros entre 0 y 100.
- Se bloquean duplicados activos para no ensuciar el selector.
- La eliminacion nueva es soft delete (`activo=false`), mejora aceptada frente al hard delete legacy.
- Las acciones de administracion exigen permiso real para descuentos.
- La venta Convenio Marco muestra selector de descuentos autorizados desde el catalogo.
- El backend rechaza descuentos Convenio Marco no autorizados por catalogo cuando se crean o modifican.
- Se conserva compatibilidad para ventas antiguas: si una venta Convenio Marco ya tenia un valor fuera del catalogo y no se cambia, se puede seguir editando otros datos.
- El calculo de descuento quedo alineado con legacy: productos + cargos como base, monto del descuento redondeado en pesos antes de restar.
- La vista de formulario, panel de detalle, impresion, reportes y totales backend usan el mismo criterio de redondeo.

## Implementacion realizada

- `backend/src/routes/descuentos/index.js`
  - Agregado `PUT` para editar porcentajes.
  - Validacion estricta de `valor`.
  - Validacion de permisos para administrar descuentos.
  - Rechazo de duplicados activos.
  - Delete mantiene soft delete.
- `backend/src/routes/ventas/convenio-marco.js`
  - Agregada validacion de descuento Convenio Marco contra `descuentoPorcMarco` activo.
- `backend/src/routes/ventas/create.js`
  - Valida catalogo antes de crear venta Convenio Marco con descuento.
- `backend/src/routes/ventas/update.js`
  - Valida catalogo al cambiar descuento o convertir una venta a Convenio Marco.
  - No bloquea ediciones administrativas de ventas antiguas con descuento no catalogado si el descuento no cambia.
- `backend/src/routes/ventas/helpers.js`
  - Centralizado `computeDiscountAmount` con `Math.round`.
  - `computeTotal` usa productos + cargos como base y descuenta monto redondeado.
- `backend/src/routes/cotizaciones/index.js`, `backend/src/routes/odts/get.js`, `backend/src/routes/reportes/index.js`
  - Totales relacionados alineados con `computeTotal` / `computeDiscountAmount`.
- `frontend/src/pages/descuentos/DescuentosPage.jsx`
  - Edicion inline, validaciones visibles, confirmacion de eliminar y subtitulo correcto para Convenio Marco.
- `frontend/src/api/descuentos.js`
  - Hook `useUpdateDescuento`.
- `frontend/src/pages/ventas/VentasFormPage.jsx`
  - Selector de descuentos Convenio Marco desde catalogo.
  - OC obligatoria para Convenio Marco.
  - Total preview con descuento redondeado.
- `frontend/src/pages/ventas/VentaPrintPage.jsx`
  - Descuento impreso redondeado.
- `frontend/src/components/forms/ViewVentaPanel.jsx`
  - Detalle financiero muestra descuento redondeado.
- `backend/test/descuentos.test.js`
  - CRUD de catalogo marco, permisos, validaciones y duplicados.
- `backend/test/ventas.test.js`
  - Descuento Convenio Marco autorizado por catalogo.
  - Rechazo de descuento no catalogado.
  - Total redondeado igual que legacy.
- `backend/test/reportes-gerenciales.test.js`
  - Helper de expectativa actualizado al contrato redondeado.

## Decisiones y diferencias frente a legacy

- **Soft delete en vez de hard delete:** aprobado. Evita perdida de trazabilidad y no cambia el uso diario porque los eliminados dejan de aparecer.
- **Pantalla conjunta normales + Marco:** aprobado. El legacy tenia dos modulos, pero la vista nueva los separa visualmente en dos secciones y reduce navegacion.
- **Sin exportacion:** aprobado. El legacy de `descuentos_marco` no tenia exportacion Excel/PDF.
- **Sin busqueda/filtros:** aprobado. El legacy no tenia busqueda y el volumen esperado del catalogo es bajo.
- **Unicidad activa nueva:** mejora aceptada. Legacy permitia duplicar, pero duplicar porcentajes no aporta valor y complica seleccion.

## Riesgos residuales

- La administracion de descuentos normales se completara y documentara en **SPR-19-descuentos-porc**.
- La ruta de ventas mantiene compatibilidad con ventas antiguas si el descuento Convenio Marco no cambia; esto evita bloquear historicos, pero no normaliza datos antiguos por si sola.

## Pruebas ejecutadas

- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- ventas.test.js descuentos.test.js --reporter=dot`
  - Resultado: **3 archivos / 37 tests OK**.
- `npm.cmd run lint` en `frontend`
  - Resultado: **OK**.
- `npm.cmd run build` en `frontend`
  - Resultado: **OK** con advertencia conocida de chunk mayor a 500 kB.
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd run test:ci -- --reporter=dot`
  - Resultado: **14 archivos / 102 tests OK**.
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- --reporter=dot`
  - Resultado: **41 archivos / 350 tests OK**.
  - Observacion: advertencia conocida de `pg` sobre `client.query()` concurrente.

## Checklist de validacion final

- [x] Revisar comportamiento exacto legacy.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas funcionales.
- [x] Agregar pruebas de CRUD, permisos, duplicados, aplicacion en venta y redondeo.
- [x] Validar frontend con lint y build.
- [x] Validar backend con suite enfocada, `test:ci` y suite completa.
- [x] Registrar decisiones y riesgos residuales.
- [x] Validacion final del lead.

## Decision final

**SPR-18 aprobado.** Se puede continuar con **SPR-19-descuentos-porc**.
