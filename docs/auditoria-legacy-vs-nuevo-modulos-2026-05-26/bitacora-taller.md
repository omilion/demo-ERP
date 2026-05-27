# Auditoria legacy vs nuevo - bitacora_taller

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\bitacora_taller`

Estado actual: **Cerrado por SPR-02 - aprobado tecnicamente el 2026-05-26**

## Como se mostraba / funcionaba en legacy

- Menu principal `BITACORA ACTIVIDADES` con acciones:
  - `Crear Nuevo reporte`
  - `Fechas`
  - `Operario y Fechas`
- Alta:
  - `usuario` obligatorio desde select de operarios.
  - `fecha` tipo date, por defecto el dia actual.
  - `texto` obligatorio.
  - `usuario_reporta` y `sucursal` se tomaban desde sesion.
- Edicion:
  - permite cambiar `usuario`, `fecha`, `texto`.
  - no cambia `usuario_reporta`.
- Listado:
  - columnas `Operario`, `Fecha reporte`, `Texto`, `Reporta encargado`.
  - acciones modificar y borrar.
  - borrar visible solo para administrador legacy.
- Filtros:
  - busqueda por rango de fechas.
  - busqueda por operario + rango de fechas.
  - siempre filtrado por sucursal de sesion.
  - orden `fecha asc`.
  - paginacion de 20.
- Exportacion:
  - archivo Excel con `Operario`, `Fecha reporte`, `Detalle Actividades`, `Reporta Encargado`, `Sucursal`.
- No existian estados ni workflow propio del registro.

## Como queda hoy en la plataforma nueva

- `backend/src/routes/bitacora-taller/index.js`
- `backend/src/routes/odts/bitacora.js`
- `frontend/src/pages/bitacora-taller/BitacoraTallerPage.jsx`
- `frontend/src/api/bitacoraTaller.js`

## Brechas detectadas y cierre

| Brecha | Estado | Cierre |
|---|---|---|
| La plataforma nueva exigia `odtId`; legacy permitia bitacora diaria libre. | Cerrado | `odtId` es opcional y se agrego migracion para permitir `odt_id` nullable en base real. |
| `usuario` se guardaba como usuario autenticado, no como operario seleccionado. | Cerrado | Alta/edicion guardan `usuario` desde selector de operario. |
| `usuarioReporta` era manual. | Cerrado | Se setea automaticamente desde usuario autenticado y no se sobreescribe al editar. |
| Faltaba scope por sucursal. | Cerrado | Listado, exportacion, edicion y borrado usan sucursal del usuario. |
| Exportacion era solo de la pagina visible. | Cerrado | Export backend usa todo el filtro y columnas legacy. |
| Borrado estaba protegido por `taller:write`. | Cerrado | Ahora requiere `taller:delete` y la UI oculta la accion sin permiso. |
| Entradas ODT automaticas quedaban sin fecha/sucursal/reporta. | Cerrado | Se completan `fecha`, `sucursalId` y `usuarioReporta`. |
| UI no paginaba. | Cerrado | Se agrego paginador con limite 20. |
| Detalle y lifecycle ODT podian consultarse o mutarse por ID sin scope de sucursal. | Cerrado | `GET /api/odts/:id`, cierre, anulacion y eliminacion filtran por sucursal del usuario. |
| Operario legacy podia verse como login crudo. | Cerrado | Se agrega `usuarioLabel` cuando existe usuario/trabajador equivalente; si no existe, se conserva el valor historico. |
| Filtro por operario era `contains`. | Cerrado | Ahora es exacto como legacy. |

## Extras nuevos que se mantienen

- ODT opcional como trazabilidad adicional cuando corresponde.
- Busqueda libre por texto, operario o reporta.
- Sucursal visible en tabla.
- Export CSV autenticado desde backend.
- Integracion con trabajadores activos RRHH e historicos de bitacora para el selector de operarios.
- Detalle ODT y acciones de lifecycle con scope de sucursal.

## Evidencia de validacion

- `backend/test/bitacora-taller.test.js` cubre alta standalone, scope sucursal, edicion sin cambiar reporta, export, permiso de borrado, filtro exacto por operario, etiqueta de operario legacy, bitacora ODT con fecha/sucursal y bloqueo cross-sucursal en detalle/lifecycle ODT.
- Backend CI gate: **92/92 tests OK**.
- Backend completo: **330/330 tests OK**.
- Frontend lint: **OK**.
- Frontend build: **OK** con advertencia conocida de chunk grande.

## Decision

El modulo queda **aprobado** para avanzar al siguiente sprint. Los bloqueantes de la revision post-implementacion fueron corregidos y verificados.
