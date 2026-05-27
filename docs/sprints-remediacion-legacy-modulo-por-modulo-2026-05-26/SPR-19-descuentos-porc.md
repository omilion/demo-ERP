# SPR-19-descuentos-porc - descuentos_porc

Prioridad: **P2 - completar equivalencia**
Dominio: **Comercial / Ventas**
Subagentes revisores: **Hubble** y **Rawls**
Estado: **Aprobado**
Decision lead: **Aprobado para continuar a SPR-20**

## Objetivo

Revisar y reparar el modulo legacy `descuentos_porc`, que mantenia el catalogo de porcentajes de descuento para ventas normales/directas, y asegurar que la plataforma nueva lo use de verdad al aplicar descuentos.

## Como funcionaba en legacy

- Ruta legacy principal: `descuentos_porc`.
- Tabla administrada: `descuentos_porc`.
- Listado: `SELECT * FROM descuentos_porc order by valor`.
- Columna visible: `Valor % aplicado venta total`.
- Nuevo/editar: campo `valor` requerido.
- Ayuda visible en `nuevo.php`: `Solo enteros sin puntos`.
- Acciones: crear, modificar, confirmacion de eliminar con `Acepto` / `No Acepto`.
- Eliminacion legacy: hard delete.
- Uso real: en `venta_directa/lista_productos_comprados.php`, si la venta estaba activa y el usuario tenia `permiso_descuentos == 'si'`, se mostraba un selector cargado desde `descuentos_porc`.
- Aplicacion: `venta_directa/inserta_descuento_venta.php` hacia upsert en `descuentos_ventas` por `n_interno`.
- Formula legacy: el descuento se aplicaba a la venta total despues de sumar cargo de transporte, usando porcentaje entero.
- No habia busqueda, filtros, paginacion, exportacion, unicidad ni validacion server-side robusta.

## Estado actual despues del sprint

- La pantalla nueva `Descuentos` administra catalogos normales y Convenio Marco en secciones separadas.
- `descuentos_porc` tiene listar, crear, editar y eliminar.
- Los descuentos normales solo aceptan enteros entre 0 y 100, igual que el formulario legacy.
- Se bloquean duplicados activos.
- La eliminacion nueva es soft delete (`activo=false`), mejora aceptada frente al hard delete legacy.
- La venta normal/directa usa selector de descuentos activos desde `descuentos_porc`.
- El backend valida que ventas `Normal`, `Venta Sala`, `Venta Web` y `Venta directa` solo usen descuentos normales activos.
- El backend rechaza decimales en descuentos normales aplicados a ventas.
- Los permisos de descuentos quedaron separados de `ventas.delete`; administrar/aplicar descuentos requiere admin, `permisoDescuentos` o permiso extra `descuentos.write`.
- El descuento se calcula sobre productos + cargos, con monto redondeado antes de restar.
- Saldos de clientes, exportacion de clientes, reportes, caja y vistas de venta usan el mismo criterio.
- La migracion legacy ahora carga `descuentos_ventas` y `descuentos_marco` operacionales y backfillea `ordenes.descuento_pct`, que es el campo runtime de la plataforma nueva.

## Implementacion realizada

- `backend/src/routes/descuentos/index.js`
  - Normales: enteros 0..100.
  - Marco: decimales permitidos.
  - `POST`, `PUT`, `DELETE` usan `canApplyDescuento` sin exigir `ventas.write`.
  - Rechazo de duplicados activos.
- `backend/src/routes/ventas/descuentos-catalog.js`
  - Nuevo helper para determinar catalogo aplicable por tipo de venta.
  - Validacion de catalogo normal y Marco al crear/editar ventas.
- `backend/src/routes/ventas/descuentos-permissions.js`
  - Removida herencia desde `ventas.delete`.
- `backend/src/routes/ventas/create.js` y `backend/src/routes/ventas/update.js`
  - Validan descuento aplicado contra catalogo correspondiente.
  - Mantienen compatibilidad con ventas antiguas si el descuento no cambia.
  - Conservan bloqueo financiero antes de validar catalogo cuando ya hay pagos/documentos.
- `backend/src/routes/ventas/helpers.js`
  - `computeTotal` calcula base `items + cargos`.
  - `computeDiscountAmount` redondea el monto del descuento.
- `backend/src/routes/clientes/helpers.js`, `backend/src/routes/clientes/list.js`, `backend/src/routes/reportes/index.js`
  - SQL de saldos/exportaciones alineado con `computeTotal`.
- `backend/migrate-legacy-extra.mjs`
  - Agregado `descuentos_marco` operacional al set de migracion.
  - Backfill de `ventas.ordenes.descuento_pct` desde `descuentos_ventas` y `descuentos_marco`.
- `frontend/src/pages/descuentos/DescuentosPage.jsx`
  - Validacion frontend de enteros para descuentos normales.
  - Placeholder normal: `Solo enteros sin puntos`.
- `frontend/src/pages/ventas/VentasFormPage.jsx`
  - Selector de catalogo normal para `Normal`, `Venta Sala`, `Venta Web` y `Venta directa`.
  - Total preview considera cargos existentes y descuento redondeado.
- `frontend/src/components/forms/ViewVentaPanel.jsx`
  - Detalle financiero muestra cargos y descuento sobre venta total.
- `frontend/src/pages/ventas/VentaPrintPage.jsx`
  - Impresion considera cargos antes de descuento.
- `frontend/src/router.jsx` y `frontend/src/components/TopBar.jsx`
  - Ruta/menu `Descuentos` alineados con permiso `descuentos.write`.
- Tests:
  - `backend/test/descuentos.test.js`
  - `backend/test/ventas.test.js`
  - `backend/test/clientes.test.js`
  - `backend/test/reportes-gerenciales.test.js`

## Decisiones y diferencias frente a legacy

- **Soft delete en vez de hard delete:** aprobado por trazabilidad.
- **Pantalla conjunta normales + Marco:** aprobado. Reemplaza dos pantallas legacy con dos secciones claras.
- **Sin busqueda/filtros/exportacion:** aprobado. El legacy no tenia esas funciones y el volumen del catalogo es bajo.
- **Unicidad activa nueva:** mejora aprobada. Evita duplicar porcentajes en selectores.
- **Permiso separado:** mejora obligatoria. Legacy tenia `permiso_descuentos`; la plataforma nueva ya no permite que `ventas.delete` habilite descuentos.
- **Calculo neto/IVA legacy:** no se reintroduce en este sprint. La plataforma nueva mantiene su contrato de precios actuales, pero el descuento si queda alineado al criterio legacy de venta total: productos + cargos, redondeado.

## Riesgos residuales

- Si existen ventas historicas ya migradas antes de este cambio, se debe correr backfill o migracion correctiva para poblar `ordenes.descuento_pct` desde `descuentos_ventas` / `descuentos_marco`.

## Pruebas ejecutadas

- `node --check migrate-legacy-extra.mjs`
  - Resultado: **OK**.
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- ventas.test.js descuentos.test.js clientes.test.js reportes-gerenciales.test.js --reporter=dot`
  - Resultado: **5 archivos / 64 tests OK**.
- `npm.cmd run lint` en `frontend`
  - Resultado: **OK**.
- `npm.cmd run build` en `frontend`
  - Resultado: **OK** con advertencia conocida de chunk mayor a 500 kB.
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd run test:ci -- --reporter=dot`
  - Resultado: **14 archivos / 102 tests OK**.
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- --reporter=dot`
  - Resultado: **41 archivos / 352 tests OK**.
  - Observacion: advertencia conocida de `pg` sobre `client.query()` concurrente.

## Checklist de validacion final

- [x] Revisar comportamiento exacto legacy.
- [x] Revisar uso real del catalogo en venta directa.
- [x] Implementar selector de catalogo normal.
- [x] Validar enteros normales y catalogo activo en backend.
- [x] Separar permisos de descuentos.
- [x] Alinear calculo de descuento sobre venta total.
- [x] Corregir saldos/exportaciones relacionados.
- [x] Corregir migracion de descuentos historicos.
- [x] Validar frontend con lint y build.
- [x] Validar backend con suite enfocada, `test:ci` y suite completa.
- [x] Registrar decisiones y riesgos residuales.
- [x] Validacion final del lead.

## Decision final

**SPR-19 aprobado.** Se puede continuar con **SPR-20-despacho**.
