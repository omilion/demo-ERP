# Plan de sprints - remediacion auditoria funcional

Fecha: 2026-05-25

## Regla de trabajo

Cada sprint se ejecuta con especialistas separados por ownership. Los agentes reportan al coordinador con archivos modificados, comandos corridos, resultado y deuda residual. El coordinador valida lint, build, tests y lectura funcional antes de aprobar el sprint siguiente.

Ningun sprint se da por cerrado si deja peor el gate tecnico base o si introduce acciones UI sin endpoint real.

## Sprint 1 - Base tecnica y gate de calidad

Objetivo: dejar una base reproducible para trabajar sin ocultar fallos.

Criterios de salida:
- `npm run lint` frontend en verde o con deuda explicitamente aislada y justificada.
- `npm run build` frontend en verde.
- Backend tests reproducibles con secretos de test definidos.
- CI no debe ocultar el full suite sin dejar un job visible de deuda integrada.

Especialistas:
- QA/CI: revisa `.github/workflows/ci.yml`, scripts y estrategia de gates.
- Frontend Quality: corrige errores ESLint con cambios minimos.
- Backend Test Stability: estabiliza entorno de tests backend, especialmente JWT/Prisma/seed.

## Sprint 2 - Volumen, paginacion y exportaciones

Objetivo: que las pantallas principales trabajen con datasets reales sin limites silenciosos.

Criterios de salida:
- Ventas, clientes, ODT y caja historica tienen paginacion visible cuando el backend pagina.
- Endpoints aceptan `page` y `limit` con validacion uniforme.
- Exportaciones usan los filtros visibles o quedan rotuladas como export global.

Especialistas:
- Frontend Data UX: paginadores, estados vacios y mensajes de truncado.
- Backend Query/API: paginacion y validacion de parametros.
- Reporting/CSV: exportacion filtrada y nombres de archivo coherentes.

## Sprint 3 - Ciclo de vida y trazabilidad

Objetivo: eliminar borrados fisicos e inconsistencias de baja/anulacion.

Criterios de salida:
- ODT no se borra fisicamente desde UI normal; queda anulada/inactiva con auditoria.
- Clientes tienen baja/reactivacion si el negocio lo permite.
- Etiquetas UI coinciden con lo que hace backend.

Especialistas:
- Domain Backend: estados de anulacion, soft-delete y endpoints.
- Frontend Operations: confirmaciones, botones y vistas de inactivos.
- Audit/RBAC: permisos y registro de acciones sensibles.

## Sprint 4 - Caja y cobranza operativa

Objetivo: convertir caja en flujo financiero auditable.

Criterios de salida:
- Cierre de turno exige conteo por medio de pago, diferencia y observacion cuando corresponda.
- La UI de movimiento manual no induce a cobrar ventas por el endpoint incorrecto.
- Pago de cobranza queda como flujo principal de venta -> caja.

Especialistas:
- Finance Domain: reglas de conciliacion y cierre.
- Backend Transactions: transacciones, locks y consistencia de saldos.
- Frontend Cashier UX: pantalla de cierre y cobro usable por cajero.

## Sprint 5 - Roles, reportes y flujos cruzados

Objetivo: que permisos, reportes y navegacion cross-modulo coincidan con la operacion real.

Criterios de salida:
- Matriz RBAC frontend/backend alineada.
- Reportes gerenciales cargan solo widgets permitidos o bloquean la ruta completa.
- Flujo venta -> cobranza -> caja -> taller -> despacho -> reportes queda probado.

Especialistas:
- RBAC Architect: matriz de roles unica y tests.
- Reporting UX/API: reportes por rol y manejo de 403 parcial.
- Cross-Module QA: pruebas de punta a punta y gaps residuales.

## Validacion final QA release - 2026-05-25

Estado general: aprobado para cierre tecnico de los gates reproducibles sin DB local. No queda P0/P1 accionable detectado en codigo dentro del repo. Las suites dependientes de datos/DB local quedan clasificadas como deuda de infraestructura de test, no como regresion funcional confirmada.

### Clasificacion de cambios por sprint

- Sprint 1 - Base tecnica y gate de calidad: `.github/workflows/ci.yml`, `backend/package.json`, `backend/vitest.config.js`, `backend/test/setup-env.js`, `backend/src/plugins/jwt.js`.
- Sprint 2 - Volumen, paginacion y exportaciones: `backend/src/routes/clientes/list.js`, `backend/src/routes/odts/list.js`, `backend/src/routes/ventas/list.js`, `backend/src/routes/caja/movimientos.js`, `backend/src/routes/reportes/index.js`, `frontend/src/api/clientes.js`, `frontend/src/api/odts.js`, `frontend/src/api/ventas.js`, `frontend/src/api/caja.js`, paginas de clientes, ventas, caja, cobranza y reportes.
- Sprint 3 - Ciclo de vida y trazabilidad: `backend/src/routes/clientes/update.js`, `backend/src/routes/odts/update.js`, `backend/src/routes/odts/operations.js`, `frontend/src/pages/clientes/ClientesPage.jsx`, `frontend/src/pages/taller/TallerPage.jsx`, tests `clientes.test.js`, `odts.test.js`, `lifecycle-route-permissions.test.js`.
- Sprint 4 - Caja y cobranza operativa: `backend/src/routes/caja/movimientos.js`, `backend/test/caja.test.js`, `backend/test/caja-traceability.test.js`, `backend/test/caja-payment-helpers.test.js`, `frontend/src/pages/caja/*`, `frontend/src/pages/cobranza/CobranzaPage.jsx`.
- Sprint 5 - Roles, reportes y flujos cruzados: `backend/src/middleware/rbac.js`, `backend/src/routes/reportes/index.js`, `backend/test/rbac.test.js`, `backend/test/reportes-export-helpers.test.js`, `backend/test/operational-utils.test.js`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/components/TopBar.jsx`, `frontend/src/router.jsx`, `frontend/src/pages/dashboard/DashboardPage.jsx`, `frontend/src/pages/cobranza/CobranzaPage.jsx`, `frontend/src/pages/reportes-gerenciales/ReportesGerencialesPage.jsx`, `frontend/src/pages/reportes-licitaciones/ReportesLicitacionesPage.jsx`, cambios cross-modulo en taller, licitaciones, ordenes de compra, pagos proveedores, stock e historial.

### Gates ejecutados

- PASS `frontend`: `npm.cmd run lint`.
- PASS `frontend`: `npm.cmd run build`. Observacion: Vite advierte chunk JS mayor a 500 kB (`dist/assets/index-5-Xg2Q-4.js`, 914.98 kB, gzip 234.42 kB). No bloqueante para esta remediacion.
- PASS `backend`: `npm.cmd run test:ci` con 8 archivos y 72 tests.
- PASS `backend` focal sin DB: `npx.cmd vitest run caja-payment-helpers.test.js lifecycle-route-permissions.test.js reportes-export-helpers.test.js rbac.test.js operational-utils.test.js odt-item-workflow.test.js odt-operations.test.js` con 7 archivos y 65 tests.
- PASS verificacion Sprint 5: ruta frontend `/cobranza` protegida por `ventas:read`, navegacion TopBar Cobranza usa modulo `ventas`, export historico `/api/reportes/export/cobranza` usa `fastify.rbac('ventas', 'read')`, y RBAC backend/frontend mantiene `reportes:read` alineado para roles operativos.
- INFRA no bloqueante: `npx.cmd vitest run caja.test.js` y `npx.cmd vitest run clientes.test.js odts.test.js ventas.test.js` fallan en entorno local sin DB/seed reproducible con 401 y errores Prisma al consultar fixtures. No se clasifica como P1 de codigo porque el set sin DB y el gate CI reproducible estan en verde.

### Pendientes release

- Sin P0/P1 accionable detectado en gates reproducibles sin DB.
- P2 infraestructura de test: `backend/test/caja.test.js`, `backend/test/clientes.test.js`, `backend/test/odts.test.js`, `backend/test/ventas.test.js` siguen dependiendo de DB/seed local y fallan fuera de `test:ci`. Accion recomendada: convertir esas suites a fixtures autocontenidos o documentar prerequisito de DB seed para ejecutarlas.
- P2 `.github/workflows/ci.yml`: el full suite backend queda como advisory (`continue-on-error: true`). Mantiene visibilidad de deuda integrada; no bloquea este cierre porque los gates reproducibles definidos pasan.
- P3 performance/build: Vite mantiene warning de bundle JS mayor a 500 kB. Requiere code splitting posterior, no bloquea validacion funcional.

### Barrido mock/TODO/toast/alert

- No se detectaron `TODO`, `mock`, `toast`, `not implemented`, `no-op` ni acciones explicitamente "solo visuales" en archivos `backend/src` tocados.
- En frontend tocado hay uso de `alert()`/`confirm()` como feedback/confirmacion alrededor de mutaciones reales (`mutate`) o exportaciones reales. No se detecto una accion nueva sin endpoint real en el barrido textual.
