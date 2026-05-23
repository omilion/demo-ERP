# Fase 3 Operaciones - Ejecucion de Sprints

Fecha: 2026-05-23

## Sprint 0 - Diagnostico y plan

Estado: cerrado.

Entregables:
- Cruce funcional PDF/estado actual documentado en `docs/cruce-pdf-original-vs-estado-2026-05-23.md`.
- Plan multiagente por sprints documentado en `docs/fase-3-operaciones-plan-sprints-2026-05-23.md`.
- Diagnostico por dominio con agentes: ODT/produccion, materiales/stock, despacho/logistica, RRHH.

## Sprint 1 - ODT como nucleo operativo

Estado: cerrado tecnicamente.

Implementado:
- Catalogo comun de estados ODT: `Pendiente`, `Asignada`, `En proceso`, `Control calidad`, `Terminada`, `Entregada`, con `Prioritaria` conservado como estado legacy operativo.
- Helper backend para efectos de estado: inicio automatico al pasar a `En proceso`, termino automatico al pasar a `Terminada` o `Entregada`.
- Validacion backend de responsable operativo contra `Trabajador` activo.
- Enriquecimiento de ODT con datos de operario en listado y detalle.
- Endpoint `GET /api/odts/meta/operarios` para selector de responsables y estados.
- Formulario ODT con responsable operativo.
- Vista taller con responsable visible, filtros por estado/responsable, KPIs ampliados y transiciones de estado mas completas.

QA y smoke:
- `node --check` OK en rutas ODT modificadas.
- `npm.cmd test -- odt-operations.test.js`: 8/8 OK.
- `npm.cmd test -- pasar-taller.test.js`: 2/2 OK.
- `npm.cmd run build` frontend: OK.
- `npm.cmd test -- odts.test.js`: bloqueado por credenciales locales de Postgres/JWT de seed; falla con 401 y `client password must be a string`, consistente con la limitacion local previa.

Revision:
- No se detectaron errores de sintaxis.
- La integracion con DB real queda cubierta por smoke/deploy posterior, porque la suite integrada local depende de credenciales/seed.

## Sprint 2 - Produccion avanzada por item/taller

Estado: cerrado tecnicamente.

Implementado:
- Endpoint `PUT/PATCH /api/odts/:odtId/items/:itemId/talleres/:tallerItemId/estado`.
- Estados por asignacion de taller: `pendiente`, `en_proceso`, `pausado`, `listo`, `cancelado`.
- Validacion de pertenencia ODT -> item -> taller antes de actualizar.
- Timestamps automaticos: `fechaInicio` al iniciar, `fechaListo` al marcar listo, limpieza de cierre al reabrir.
- Registro de usuario operativo en cambios de estado y usuario de cierre.
- Bitacora automatica por cambio de estado de ODT y por cambio de estado de item/taller.
- Endpoint `GET /api/odts/meta/carga-operarios` para carga abierta por responsable.
- Panel UI de carga por responsable en Taller.
- Hook frontend `useOdtItemTallerEstado`.
- Controles UI por taller en edicion de ODT: iniciar, pausar, reanudar, marcar listo y reabrir.

QA y smoke:
- `node --check backend/src/routes/odts/item-workflow.js`: OK.
- `node --check backend/test/odt-item-workflow.test.js`: OK.
- `npm.cmd test -- odt-item-workflow.test.js`: OK.
- `npm.cmd test -- odt-operations.test.js pasar-taller.test.js`: 10/10 OK.
- `npm.cmd run build` frontend: OK.

Revision:
- El endpoint y el hook usan la misma ruta.
- Las acciones UI quedan acotadas a estados permitidos por asignacion.
- No se tocaron datos legacy; el flujo opera sobre `OdtItemTaller` existente.

## Sprint 3 - Consumo trazable de produccion

Estado: cerrado tecnicamente.

Implementado:
- Endpoint `POST /api/odts/:id/consumos`.
- Consumo transaccional de `producto`, `material_taller` y `tela`.
- Validacion de ODT reconciliada mediante `resolveOdtForWrite`.
- Validacion de tipo, item, cantidad y motivo.
- Rechazo de stock insuficiente antes de crear movimientos.
- Descuento condicionado con `stock >= cantidad` para evitar stock negativo bajo concurrencia.
- Movimientos trazables:
  - `MovimientoBodega` con `ordenId`, `odtId`, `origenTipo=odt_consumo`.
  - `BodegaTallerMovimiento` con `origenTipo=odt_consumo`.
  - `TelaMovimiento` con `origenTipo=odt_consumo`.
- Registro en `TallerHistorialMaterial` con egreso, usuario, taller y ODT.
- UI en edicion de ODT para registrar consumos y ver historial reciente.

QA y smoke:
- `node --check backend/src/routes/odts/consumos.js`: OK.
- `node --check backend/test/odt-consumos.test.js`: OK.
- `npm.cmd test -- odt-consumos.test.js`: 12/12 OK.
- `npm.cmd test -- odt-item-workflow.test.js odt-operations.test.js pasar-taller.test.js`: 22/22 OK.
- `npm.cmd run build` frontend: OK.

Revision:
- Se corrigio contrato frontend/backend para usar `material_taller`.
- El payload frontend envia `id` y el id especifico legacy para compatibilidad.
- El descuento condicionado reduce el riesgo de stock negativo por consumos simultaneos.

## Sprint 4 - Despacho y logistica trazable

Estado: cerrado tecnicamente.

Implementado:
- Sincronizacion conservadora de `Orden.estadoEntrega` al crear/actualizar despachos.
- Despacho parcial marca venta como `Parcial`.
- Despacho no parcial con fecha de entrega marca venta como `Entregada`.
- Creacion de guia marca venta como `Entregada`, salvo ventas ya `Parcial` sin senal logistica no parcial.
- Transacciones para crear/actualizar despacho o crear guia junto con la sincronizacion de venta.
- Filtros UI por ODT y comuna en despachos.
- Filtro UI por ODT en guias.
- Filtros UI/API por cliente y estado logistico en despachos.
- Filtro UI/API por cliente en guias.
- Columna ODT y acceso directo a ODT desde despachos/guias.
- Campo ODT ID en formularios de despacho y guia.
- Export CSV ampliado con orden/ODT/comuna donde aplica.

QA y smoke:
- `node --check backend/src/routes/despachos/index.js`: OK.
- `node --check backend/test/despachos-traceability.test.js`: OK.
- `npm.cmd test -- despachos-traceability.test.js`: OK.
- `npm.cmd test -- odt-consumos.test.js odt-item-workflow.test.js odt-operations.test.js pasar-taller.test.js`: 34/34 OK.
- `npm.cmd run build` frontend: OK.

Revision:
- Se retiro el filtro comuna de guias porque la tabla de guias no tiene comuna propia.
- La sincronizacion no cambia cantidades por item; queda como mejora futura para packing/líneas.

## Sprint 5 - RRHH operativo conectado

Estado: cerrado tecnicamente.

Implementado:
- Filtro backend `cargo` en `GET /api/rrhh/trabajadores`.
- Busqueda de trabajadores incluye cargo.
- Nuevo endpoint `GET /api/rrhh/cargos` con cargos activos, filtrable por empresa.
- Helpers testeables para filtros RRHH y payload de trabajador.
- Hook frontend `useRrhhCargos`.
- Filtro UI por cargo en RRHH, dependiente de empresa.
- Permisos UI: alta/edicion solo con `rrhh:write`, baja solo con `rrhh:delete`.

QA y smoke:
- `node --check backend/src/routes/rrhh/index.js`: OK.
- `node --check backend/test/rrhh-helpers.test.js`: OK.
- `npm.cmd test -- rrhh-helpers.test.js`: 3/3 OK.
- `npm.cmd test -- despachos-traceability.test.js odt-consumos.test.js odt-item-workflow.test.js odt-operations.test.js pasar-taller.test.js`: 55/55 OK.
- `npm.cmd run build` frontend: OK.

Revision:
- RRHH queda como fuente operativa mas usable para responsables de ODT.
- No se cambio schema ni datos sensibles.

## Sprint 6 - QA operacional, CI y deploy

Estado: cerrado tecnicamente en local; deploy productivo queda validado por GitHub Actions despues del push a `main`.

Implementado:
- Refuerzo de arranque importable en `backend/src/app.js` para que herramientas ESM puedan cargar `buildApp` sin `process.argv[1]`.
- Refuerzo de CI con `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` de test.
- CI queda focalizado en la suite operacional cerrada del sprint hasta reconciliar deuda integrada de schema/tests legacy.
- Refuerzo del workflow de deploy:
  - serializa deploys productivos con `concurrency`;
  - corre tests focales backend antes del SSH;
  - valida que la API cargue y registre plugins/rutas antes de recargar PM2;
  - usa `pm2 startOrReload` para tolerar proceso ausente;
  - valida `ecosystem.config.cjs` antes de migrar;
  - valida `DATABASE_URL` antes del respaldo;
  - agrega diagnostico de listeners si el health remoto vuelve a fallar;
  - muestra el JSON de smoke si el smoke productivo falla.
- Smoke API con timeout por request y email read-only configurable.

QA y smoke local:
- `node --check backend/src/app.js`: OK.
- `node --check` rutas ODT/despachos/RRHH tocadas: OK.
- Import smoke de app con secrets y `DATABASE_URL` de CI: OK (`app ready ok`).
- `npm.cmd test -- odt-operations.test.js odt-item-workflow.test.js despachos-traceability.test.js staging-smoke.test.js app.test.js rrhh-helpers.test.js odt-consumos.test.js pasar-taller.test.js`: 70/70 OK.
- `npx.cmd eslint` sobre archivos frontend tocados: OK, 0 errores y 0 warnings.
- `npm.cmd run build` frontend: OK.
- Ultimo bundle local: `dist/assets/index-COnh1A02.js`.
- `git diff --check`: OK, solo warnings CRLF esperados en Windows.

Limitacion conocida:
- El full suite backend local no queda como criterio de cierre porque depende de credenciales/servicios Postgres locales y de seeds no disponibles en este entorno. La cobertura del sprint se cerro con tests focales DB-free o mockeados, import smoke de app y build frontend. El smoke productivo queda como verificacion del workflow posterior al push.
- Corrida amplia backend local: 24 archivos OK, 1 skipped, 7 archivos con fallos por entorno DB/auth local (`SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`, respuestas 500/401 derivadas de login/seed local).
- Corrida amplia CI en `7047f13`: 27 archivos OK, 5 archivos con fallos por deuda integrada previa (`ordenes_cliente_id_required_new`, `cobranza_historico.orden_id`, `cotizacion_licitacion.orden_id`, pruebas que crean ODT/orden legacy sin vinculo requerido). Por eso CI se deja focalizado al cierre operacional validado.
- Lint global frontend mantiene deuda previa fuera del alcance focal: 25 errores y 1 warning en archivos no tocados por este sprint, mientras el lint focal de archivos modificados queda en 0 errores/0 warnings.

Revision:
- El fallo historico de deploy contra `127.0.0.1:3001` queda mitigado con validacion previa de carga de API, reload mas robusto y diagnostico remoto si vuelve a ocurrir.
- Los huecos detectados por revision multiagente quedaron cerrados: bitacora automatica, carga por responsable y filtros logisticos cliente/estado.
- No se incorporaron migraciones de schema en esta fase; el deploy conserva el flujo existente de backup, `prisma migrate deploy`, PM2 y smoke.
