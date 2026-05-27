# SPR-05-caja - caja

Prioridad: **P0 - critico operativo**
Dominio: **Administracion / Finanzas / Seguridad**
Subagentes especialistas: **Revision funcional legacy** + **Revision seguridad/contabilidad**
Estado: **Aprobado**

## Objetivo

Revisar y reparar el modulo `caja` comparando cada funcion legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoria base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/caja.md`
- Evidencia legacy principal:
  - `caja/acepta_elimina.php`
  - `caja/activar/activar.php`
  - `caja/activar/index.php`
  - `caja/actualizar.php`
  - `caja/anular/anular.php`
  - `caja/anular/index.php`
  - `caja/buscar_documento.php`
  - `caja/buscar_fechas.php`
  - `caja/buscar_ninterno.php`
  - `caja/buscar_tipo_venta.php`
  - `caja/cierre_caja/index.php`
  - `caja/cierre_caja/insertar.php`

## Como se mostraba en legacy

- Caja separada por sucursal.
- Movimientos con documentos, medios de pago, boletas/facturas, NC/ND y estado documental `Activa/Nula`.
- Flujos explicitos para anular y activar.
- Busquedas por fecha, documento, numero interno y tipo de venta.
- Cierre/arqueo con separacion de efectivo, debito, credito, transferencia, cheque dia, cheque fecha, Webpay, Transbank y otros.
- `Referencial` no suma como caja real.
- Exportaciones Excel/PDF y resumen de caja.

## Como queda hoy

- Backend: `backend/src/routes/caja/*`, `backend/src/routes/reportes/index.js`, `backend/src/routes/ventas/*`, `backend/src/routes/cobranza/index.js`.
- Frontend: `frontend/src/pages/caja/*`, `frontend/src/pages/cobranza/CobranzaPage.jsx`, `frontend/src/pages/ventas/VentasFormPage.jsx`.
- Datos: `MovimientoCaja.sucursalId`, `estadoDoc`, auditoria por motivo en anulacion/reactivacion y cierre con usuario responsable.

## Brechas encontradas por subagentes

| Severidad | Brecha | Decision |
| --- | --- | --- |
| P0 | Caja no estaba aislada por sucursal. | Corregido. Token/login exponen `sucursalId`; turnos, historico y export quedan scoped por sucursal. |
| P0 | `Referencial` podia tratarse como pago real. | Corregido. Cobranza lo rechaza; cierres y KPIs lo excluyen de caja real. |
| P0 | Estados documentales legacy no estaban end-to-end. | Corregido. Creacion usa `Activa`; anulacion usa `Nula`; reactivacion vuelve a `Activa`. |
| P0 | Migracion historica perdia sucursal/documento/estado y confundia `n_interno` con `ordenId`. | Corregido. Migrador preserva campos legacy y resuelve `ordenId` por `ventas.ordenes.n_interno`. |
| P0 | Abonos/estado de pago podian modificarse desde Ventas. | Corregido. Ventas ya no acepta cambios directos de `abono`/`estadoPago`; deben pasar por Cobranza/Caja. |
| P0 | Reversas concurrentes podian pisar `Orden.abono`. | Corregido. Reversa/reactivacion bloquean la venta asociada dentro de la transaccion. |
| P1 | Filtros legacy no estaban completos en UI. | Corregido. Fecha desde/hasta, documento, n interno, tipo venta, estado y medios quedan visibles. |
| P1 | Cheque dia/cheque fecha no estaban separados. | Corregido en UI, cierre y backend. |
| P1 | Exportacion financiera de cobranza era demasiado amplia. | Corregido. Cobranza/export cobranza ahora requiere permiso `cobranza:read`. |

## Implementacion realizada

- Scoping de caja por sucursal usando `sucursalId` del usuario y de la caja.
- Turnos simultaneos permitidos por sucursal, sin mezclar caja de otras sucursales.
- Historico y export de caja con filtros legacy: fecha, documento, n interno, tipo de venta, medio, tipo ingreso/egreso y estado activo/anulado/todos.
- Anulacion/reactivacion de movimiento con motivo obligatorio y permiso `caja:delete`.
- Reversa/reactivacion de pagos de venta con bloqueo transaccional de `ventas.ordenes`.
- `Referencial` bloqueado en cobranza y excluido de cierre/KPIs.
- Estados documentales `estadoDoc` sincronizados con anulacion/reactivacion.
- Cierre de turno guarda usuario de cierre y snapshot de arqueo.
- Ventas ya no permite editar `abono` ni `estadoPago` desde el formulario/API generica.
- Migraciones nuevas para scope/auditoria de Caja y alineacion de columnas financieras legacy.
- Migrador legacy de Caja actualizado para no perder sucursal, documento, estados, cuotas, origen de medio, NC interna, anulados y usuario modificador.

## Archivos principales modificados

- `backend/src/routes/caja/scope.js`
- `backend/src/routes/caja/turno.js`
- `backend/src/routes/caja/movimientos.js`
- `backend/src/routes/caja/historico.js`
- `backend/src/routes/reportes/index.js`
- `backend/src/routes/ventas/create.js`
- `backend/src/routes/ventas/update.js`
- `backend/src/routes/ventas/delete.js`
- `backend/src/routes/ventas/cargos.js`
- `backend/src/routes/cobranza/index.js`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrate-caja.mjs`
- `frontend/src/pages/caja/CajaPage.jsx`
- `frontend/src/pages/caja/CajaFormPage.jsx`
- `frontend/src/pages/cobranza/CobranzaPage.jsx`
- `frontend/src/pages/ventas/VentasFormPage.jsx`

## Pruebas ejecutadas

- `backend`: `npm.cmd test` -> **35 archivos, 289 pruebas OK**.
- `backend` focalizado: Caja/Ventas/RBAC/reportes -> **88 pruebas OK**.
- `frontend`: `npm.cmd run lint` -> **OK**.
- `frontend`: `npm.cmd run build` -> **OK**.
- `prisma migrate deploy` sobre base local de sprint -> **OK**.
- `prisma generate` -> **OK**.

## Riesgos residuales

- Export legacy PDF nativo no queda implementado; se mantiene CSV compatible con Excel. No bloquea P0 porque el flujo operativo y financiero esta cubierto.
- La auditoria de negocio queda reforzada por motivo obligatorio y auditoria del request; un log financiero inmutable dedicado puede ser un hardening posterior.
- La migracion legacy depende de que existan ventas con `n_interno` para resolver `ordenId`; si no existen, conserva el documento y campos legacy pero deja `ordenId` nulo.

## Checklist de validacion final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios minimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integracion.
- [x] Probar flujo feliz, errores, permisos y estados borde.
- [x] Registrar evidencia: archivos modificados, comandos de prueba y resultado.
- [x] Validacion final del lead.

## Decision final

**Aprobado.** El sprint Caja queda cerrado como P0 corregido. Se puede avanzar al siguiente sprint P0.
