# SPR-02-bitacora-taller - bitacora_taller

Prioridad: **P1 - critico funcional**  
Dominio: **Operaciones / Taller / Despacho**  
Subagente especialista asignado: **Subagente Operaciones-Taller-Despacho**  
Estado: **Aprobado - cerrado el 2026-05-26**

## Objetivo

Revisar y reparar el modulo `bitacora_taller` comparando cada funcion legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoria base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/bitacora-taller.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-02-bitacora-taller.md`
- Evidencia legacy principal:
  - `bitacora_taller/acepta_elimina.php`
  - `bitacora_taller/actualizar.php`
  - `bitacora_taller/buscar_fechas.php`
  - `bitacora_taller/buscar_operario_fechas.php`
  - `bitacora_taller/eliminar.php`
  - `bitacora_taller/index.php`
  - `bitacora_taller/insertar.php`
  - `bitacora_taller/lista.php`
  - `bitacora_taller/lista_excel.php`
  - `bitacora_taller/modificar.php`
  - `bitacora_taller/nuevo.php`
  - `bitacora_taller/pasar_a_get.php`

## Como se mostraba / funcionaba en legacy

- Pantalla principal: botones `Crear Nuevo reporte`, `Fechas`, `Operario y Fechas`.
- Alta: `usuario` obligatorio desde select de operarios, `fecha` tipo date, `texto` obligatorio.
- Campos automaticos al insertar: `usuario_reporta` desde la sesion y `sucursal` desde la sesion.
- Edicion: permite cambiar `usuario`, `fecha` y `texto`; no cambia `usuario_reporta`.
- Listado: acciones borrar/modificar, columnas `Operario`, `Fecha reporte`, `Texto`, `Reporta encargado`.
- Filtros: fechas obligatorias y operario opcional; siempre scope por sucursal; orden por `fecha asc`; paginacion de 20.
- Exportacion: Excel con columnas `Operario`, `Fecha reporte`, `Detalle Actividades`, `Reporta Encargado`, `Sucursal`.
- Borrado: boton visible solo para administrador legacy; delete fisico.
- Estados: no habia estado de registro ni workflow propio.

## Como quedo en la plataforma nueva

- Backend: `backend/src/routes/bitacora-taller/index.js`
- Backend ODT relacionado: `backend/src/routes/odts/bitacora.js`
- Frontend: `frontend/src/pages/bitacora-taller/BitacoraTallerPage.jsx`
- API frontend: `frontend/src/api/bitacoraTaller.js`

## Resolucion punto a punto legacy

| Punto legacy | Estado nuevo | Resolucion |
|---|---|---|
| Crear Nuevo reporte sin ODT | Cerrado | `odtId` ahora es opcional; se permite bitacora diaria libre. |
| Seleccionar operario | Cerrado | La UI permite seleccionar operario y el backend guarda `usuario` desde el formulario. |
| Fecha de reporte | Cerrado | Alta/edicion usan fecha tipo date; los registros ODT automaticos guardan `fecha`. |
| Texto obligatorio | Cerrado | Backend y UI validan `texto`. |
| Reporta encargado automatico | Cerrado | `usuarioReporta` se setea desde usuario autenticado y no se sobreescribe al editar. |
| Scope por sucursal | Cerrado | Listado, exportacion, edicion y borrado quedan filtrados por sucursal del usuario. |
| Filtros Fechas / Operario y Fechas | Cerrado | Filtros por `desde`, `hasta`, `operario` y busqueda libre. |
| Tabla Operario / Fecha / Texto / Reporta | Cerrado | Tabla muestra esas columnas y agrega `Sucursal` / `ODT` como trazabilidad nueva. |
| Exportar a Excel | Reemplazo aprobado | Export CSV backend con columnas legacy y sucursal, para todo el filtro, no solo pagina visible. |
| Borrar solo administrador | Cerrado | Backend exige `taller:delete`; UI oculta `Borrar` si el usuario no tiene permiso. |

## Implementacion realizada

- Se agrego migracion para permitir `taller.bitacora_taller.odt_id` nullable, requisito real para datos legacy y reportes diarios sin ODT.
- Se reescribio el endpoint global `/api/bitacora-taller` con:
  - paginacion de 20 registros,
  - filtros por fecha, operario, ODT, taller, estado ODT y busqueda,
  - scope por sucursal,
  - alta standalone,
  - edicion de operario/fecha/texto,
  - borrado con permiso `taller:delete`,
  - export backend `/export`.
- Se agrego endpoint `/api/bitacora-taller/operarios` para poblar el selector desde RRHH e historicos.
- Se alinearon bitacoras automaticas de ODT para guardar `fecha`, `usuarioReporta` y `sucursalId`.
- Se actualizo la UI para no exigir ODT, mostrar columnas legacy, exportar desde backend, paginar y ocultar acciones sin permiso.
- Se cerro scope por sucursal en detalle ODT y acciones lifecycle (`cerrar`, `anular`, `delete`) para evitar lectura o mutacion cruzada.
- Se permitio asociar bitacoras a ODT legacy sin `ordenId` cuando solo se registra una nota operativa.
- Se resolvio etiqueta visible de operario para valores legacy tipo `login_usuario` cuando existe usuario nuevo equivalente, manteniendo el valor crudo para filtros exactos.
- Se incorporaron las pruebas del sprint al gate `test:ci`.

## Archivos modificados

- `backend/prisma/migrations/20260526224500_allow_standalone_bitacora_taller/migration.sql`
- `backend/src/routes/bitacora-taller/index.js`
- `backend/src/routes/odts/bitacora.js`
- `backend/src/routes/odts/operations.js`
- `backend/src/routes/odts/item-workflow.js`
- `backend/src/routes/odts/get.js`
- `backend/src/routes/relation-guards.js`
- `backend/package.json`
- `backend/test/bitacora-taller.test.js`
- `backend/test/odt-item-workflow.test.js`
- `backend/test/odt-operations.test.js`
- `frontend/src/api/bitacoraTaller.js`
- `frontend/src/pages/bitacora-taller/BitacoraTallerPage.jsx`

## Pruebas ejecutadas

- Migracion test DB: `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npx.cmd prisma migrate deploy` -> **OK**.
- Backend foco: `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- bitacora-taller.test.js odts.test.js lifecycle-route-permissions.test.js odt-item-workflow.test.js odt-operations.test.js operational.test.js --reporter=dot` -> **53/53 OK**.
- Backend CI gate: `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd run test:ci -- --reporter=dot` -> **92/92 OK**.
- Backend completo: `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- --reporter=dot` -> **330/330 OK**.
- Frontend: `npm.cmd run lint` -> **OK**.
- Frontend: `npm.cmd run build` -> **OK**. Advertencia conocida: chunk Vite mayor a 500 kB.

## Riesgos residuales

- La exportacion legacy era `.xls`; la nueva queda como CSV autenticado desde backend. Es reemplazo aceptado porque conserva columnas, filtros y alcance completo.
- Si un `login_usuario` legacy no tiene usuario nuevo equivalente ni trabajador RRHH asociado, la plataforma muestra el valor historico crudo. Esto conserva trazabilidad y evita inventar nombres.

## Validacion multiagente

- Revisor legacy: confirmo que legacy era bitacora diaria independiente con `usuario`, `fecha`, `texto`, `usuario_reporta` y `sucursal`.
- Revisor tecnico inicial: marco como bloqueantes permisos de borrado, ODT obligatoria, exportacion parcial, fecha nula y acciones visibles sin permiso. Todos esos puntos fueron corregidos.
- Revision post-implementacion backend: detecto scope ODT faltante, compatibilidad ODT legacy y cobertura CI. Corregido y cubierto por pruebas.
- Revision post-implementacion frontend/paridad: detecto etiqueta de operario legacy y filtro no exacto. Corregido y cubierto por pruebas.

## Checklist de validacion final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios minimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integracion cuando haya logica de datos.
- [x] Probar flujo feliz, errores, permisos y estados borde.
- [x] Registrar evidencia: archivos modificados, comandos de prueba y resultado.
- [x] Validacion final del lead: aprobar, aprobar con observaciones o rechazar.

## Decision final

**Aprobado.** Los hallazgos post-implementacion fueron corregidos y la suite completa queda en verde.
