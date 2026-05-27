# SPR-24-gastos - gastos

Prioridad: **P2 - completar equivalencia**  
Dominio: **Administracion / Finanzas / Seguridad**  
Subagentes especialistas: **Hubble + Rawls**  
Estado: **Aprobado**

## Objetivo

Revisar y reparar el modulo legacy `gastos`, asegurando equivalencia del catalogo de tipos de gasto y su uso operativo en Caja.

## Insumos

- Auditoria base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/gastos.md`
- Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\gastos`
- Legacy relacionado:
  - `caja/egreso/insertar.php`
  - `caja/lista.php`
  - `caja/lista_excel.php`
- Plataforma nueva:
  - `backend/src/routes/gastos/index.js`
  - `frontend/src/api/gastos.js`
  - `frontend/src/pages/config/ConfigPage.jsx`
  - `backend/src/routes/caja/turno.js`
  - `backend/src/routes/caja/historico.js`
  - `backend/src/routes/reportes/index.js`
  - `frontend/src/pages/caja/CajaPage.jsx`

## Como se mostraba en legacy

- Pantalla principal con tabla ordenada por `nombre`.
- Columnas visibles: `Nombre`, editar, eliminar.
- Crear nuevo gasto:
  - Campo obligatorio `Nombre`.
  - Validacion AJAX contra duplicado.
  - Rechaza caja vacia.
  - Rechaza nombres menores a 2 caracteres.
- Modificar gasto:
  - Campo `Nombre`.
  - Misma consulta AJAX de disponibilidad.
- Eliminar:
  - Pantalla de confirmacion `Acepto / No Acepto`.
  - Borrado fisico en tabla `gastos`.
- Exportaciones:
  - Excel `lista_excel.php`.
  - PDF `lista_pdf.php`.
  - Ambas exportaban el listado de titulos de gastos ordenado por nombre.
- Uso en Caja:
  - Al registrar egresos, el nombre del gasto quedaba incorporado en la operacion/referencia visible y exportable.

## Como se muestra hoy

- El catalogo vive en Configuracion > Gastos.
- Caja usa `gastoTipoId` para asociar egresos a una categoria de gasto.
- La categoria queda visible en:
  - Turno actual de caja.
  - Historico de caja.
  - Busqueda historica por nombre de gasto.
  - Export CSV de caja.
- Los egresos solo permiten categorias activas.

## Brechas detectadas y cierre

| Brecha | Estado | Resolucion |
| --- | --- | --- |
| Validacion de nombre incompleta | Cerrada | Backend y UI normalizan `trim`, exigen minimo 2 caracteres y bloquean duplicados case-insensitive. |
| Duplicado en update podia terminar en error no controlado | Cerrada | `PUT /api/gastos/:id` valida duplicado y captura `P2002`. |
| Export legacy Excel/PDF sin equivalente | Cerrada | Se agrego `GET /api/gastos/export` CSV compatible Excel y boton en UI. PDF legacy queda reemplazado por export CSV estandar de la plataforma. |
| Delete podia romper historial de caja por FK | Cerrada | Si el gasto tiene movimientos, DELETE lo desactiva en vez de borrarlo. Si no tiene uso, borra fisicamente. |
| Nombre de gasto no visible en caja | Cerrada | Turno, historico, busqueda y export de caja incluyen `gastoTipo`. |

## Cambios implementados

- `backend/src/routes/gastos/index.js`
  - Normalizacion y validacion de `nombre`.
  - Duplicado case-insensitive en alta y edicion.
  - Export CSV `/api/gastos/export`.
  - Delete seguro: desactiva si hay movimientos de caja.
- `frontend/src/api/gastos.js`
  - Helper `gastosExportUrl`.
- `frontend/src/pages/config/ConfigPage.jsx`
  - Validacion cliente antes de crear/editar.
  - Boton `Exportar CSV`.
  - Advertencia al borrar si ya fue usado en Caja.
- `backend/src/routes/caja/turno.js`
  - Incluye `gastoTipo` en movimientos del turno.
- `backend/src/routes/caja/historico.js`
  - Incluye `gastoTipo` y permite buscar por nombre de gasto.
- `backend/src/routes/reportes/index.js`
  - Export de caja agrega columna `Gasto`.
- `frontend/src/pages/caja/CajaPage.jsx`
  - Muestra badge de gasto en turno actual e historico.
- `backend/test/gastos.test.js`
  - Cobertura nueva para validacion, duplicados, export, permisos, delete seguro y visibilidad en caja.
- `backend/package.json`
  - Se agrega `gastos.test.js` a `test:ci`.

## Validacion

- Pruebas focalizadas:
  - `npm.cmd test -- gastos.test.js caja-traceability.test.js caja.test.js --reporter=dot`
  - Resultado: **3 archivos / 46 tests OK**.
- Suite CI backend:
  - `npm.cmd run test:ci -- --reporter=dot`
  - Resultado: **15 archivos / 107 tests OK**.
- Frontend:
  - `npm.cmd run lint` OK.
  - `npm.cmd run build` OK.
  - Observacion: advertencia conocida de Vite por chunk mayor a 500 kB.
- Revision por subagentes:
  - Hubble: aprobado sin P0/P1.
  - Rawls: aprobado sin P0/P1.

## Riesgos residuales

- PDF legacy no se replica literalmente. Se reemplaza por CSV compatible Excel, consistente con los reportes nuevos de la plataforma.
- Los gastos usados en caja quedan inactivos al eliminar, no desaparecen del historico. Esto es intencional para proteger trazabilidad.

## Checklist de validacion final

- [x] Revisar archivos legacy y comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar validaciones legacy relevantes.
- [x] Agregar export equivalente.
- [x] Proteger historial de caja ante eliminaciones.
- [x] Mostrar categoria de gasto donde se usa operativamente.
- [x] Agregar pruebas de backend.
- [x] Ejecutar pruebas focalizadas, CI backend, lint y build frontend.
- [x] Obtener validacion final de subagentes.

## Resultado de ejecucion

- Implementacion realizada: si.
- Archivos modificados: backend, frontend, tests y documentacion.
- Pruebas ejecutadas: focalizadas, `test:ci`, lint y build.
- Riesgos residuales: bajos y documentados.
- Validacion del lead: aprobado.
- Decision final: **SPR-24 aprobado.**
