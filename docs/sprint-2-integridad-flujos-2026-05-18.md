# Sprint 2 - Integridad de datos y flujos reales

Fecha: 2026-05-18
Rama local: `codex/sprint-2-integridad-flujos`
Base: Sprint 1 commit `8638212`

## Objetivo

Cerrar riesgos operativos antes de seguir construyendo funcionalidades nuevas: datos reales, flujos venta/taller/despacho/caja, permisos UX y deploy seguro.

## Agentes

- Base de datos / integridad: auditor dry-run y checks reales.
- Backend operativo: validacion de filtros, IDs, fechas, stats y flujos.
- Frontend UX operacional: navegacion real, permisos read-only, filtros desde links legacy.
- QA / deploy: migraciones, CI/CD, backups, smoke y riesgos de produccion.

## Cambios aplicados

### Integridad de datos

- Nuevo auditor dry-run: `backend/scripts/data-integrity-audit.mjs`.
- Nuevo script npm: `npm run data:audit`.
- Tests unitarios del auditor: `backend/test/data-integrity-audit.test.js`.
- Correccion de `backend/scripts/audit-completo.mjs`: el cruce de cobranza usaba schema incorrecto y ahora cruza por `orden_id` o `n_interno`.

### Migraciones y deploy

- Nueva migracion formal: `backend/prisma/migrations/20260518113000_schema_coherence_operational/migration.sql`.
- La migracion formaliza lo que antes estaba solo en `backend/scripts/schema-coherence-fix.sql`:
  - `ventas.cobranza_historico` montos a `double precision`.
  - `ventas.cotizacion_licitacion.descuento_pct`.
  - `ventas.crm_registros.estado` a `text`.
  - FKs de guias/despachos a ordenes como `NOT VALID` para no bloquear datos historicos.
- `backend/.env.example` documenta variables minimas.
- `.github/workflows/deploy.yml` ahora:
  - valida Prisma antes de deploy,
  - crea y verifica `pg_dump -Fc`,
  - despliega backend antes que frontend,
  - corre migraciones y smoke `/api/health`,
  - publica frontend solo despues de API/DB OK.

### Backend operativo

- Nuevo helper compartido: `backend/src/routes/operational-utils.js`.
- Se endurecieron filtros/inputs en despachos, guias, caja historico, cobranza, matriz ventas, ODT bitacora y ventas list.
- Se evitan 500 por `NaN`, paginas invalidas o fechas `Invalid Date`.
- Caja historico ahora calcula ingresos/egresos segun casing real `Ingreso` / `Egreso`.
- Cobranza ahora calcula stats usando los filtros activos.
- Bitacora ODT valida existencia de ODT y pertenencia antes de crear/borrar.

### Frontend operacional

- Links read-only ya no mandan a rutas de escritura:
  - clientes -> ventas/ODT,
  - cobranza -> ventas,
  - matriz -> ventas,
  - taller -> venta asociada,
  - despachos -> orden asociada.
- `/ventas?filtro=...`, `/ventas?search=...`, `/taller?search=...`, `/taller?tipo=...` y `/despachos?ordenId=...` ahora aplican filtros reales.
- Cobranza oculta "Pagar" si el usuario no tiene escritura.
- Despachos muestra carga y permite limpiar filtro de orden.
- Boton imprimir de panel generico ahora llama `window.print()`.

## Diagnostico real en VPS

Se ejecuto `data-integrity-audit` en modo dry-run contra el VPS. No modifica datos.

Resultado:

- Checks ejecutados: 52/52 OK.
- Errores de ejecucion: 0.
- Hallazgos totales: 68.022.
- Criticos: 9.520.
- Advertencias: 58.502.

Por area:

- ventas: 55.816.
- fechas: 7.616.
- proveedores: 3.706.
- clientes: 403.
- taller: 264.
- productos: 217.

Hallazgos principales:

- `orden_items.producto_id_huerfano`: 8.676 criticos.
- `clientes.rut_duplicado_normalizado`: 403 criticos. Incluye RUT vacios/placeholder y RUT duplicados reales al normalizar.
- `taller.odt_items_producto_id_huerfano`: 262 criticos.
- `productos.stock_negativo`: 167 criticos.
- `proveedores.rut_duplicado_normalizado`: 10 criticos.
- `productos.codigo_interno_duplicado_normalizado`: 1 critico (`PACK4`).
- `telas.stock_negativo`: 1 critico.
- `compra_online.codigo_vendedor_huerfano`: 39.941 advertencias.
- `fechas.operacionales_anomalas`: 7.616 advertencias, especialmente fechas `0001-01-01` en pagos proveedor.
- `cotizacion_items.codigo_interno_sin_producto`: 7.199 advertencias.
- `proveedores.detalle_codigo_interno_sin_producto`: 3.696 advertencias.
- `productos.codigo_barra_duplicado_normalizado`: 49 advertencias.

El archivo temporal copiado al VPS para ejecutar el auditor fue eliminado despues del dry-run.

## Estado de migraciones VPS

Comando ejecutado en VPS:

```bash
cd /var/www/plastimar-erp/backend
npx prisma migrate status
```

Resultado actual del deploy existente:

- 10 migraciones encontradas.
- Base `plastimar_erp`.
- Estado: `Database schema is up to date`.

Nota: localmente ahora existen migraciones nuevas de Sprint 1 y Sprint 2; deben probarse contra restore reciente antes de aplicar a produccion.

## Validaciones locales

Pasaron:

```powershell
node --check backend/src/routes/operational-utils.js
node --check backend/src/routes/despachos/index.js
node --check backend/src/routes/caja/historico.js
node --check backend/src/routes/cobranza/index.js
node --check backend/src/routes/matriz-ventas/index.js
node --check backend/src/routes/odts/bitacora.js
node --check backend/src/routes/odts/list.js
node --check backend/src/routes/ventas/list.js
node --check backend/scripts/data-integrity-audit.mjs
node --check backend/scripts/audit-completo.mjs
npx prisma validate
npx prisma generate
npm test -- --run test/app.test.js test/backend-helpers.test.js test/data-integrity-audit.test.js test/operational-utils.test.js
npm run build
npx eslint src/components/forms/FormCliente.jsx src/components/shared/index.jsx src/pages/cobranza/CobranzaPage.jsx src/pages/despachos/DespachosPage.jsx src/pages/matriz-ventas/MatrizVentasPage.jsx src/pages/taller/TallerPage.jsx src/pages/ventas/VentasPage.jsx src/utils/permissions.js
```

Notas de validacion:

- Los tests backend con DB real (`operational.test.js`, parte de `rbac.test.js`) no se ejecutaron contra produccion. Requieren Postgres local o staging.
- `npm run lint` frontend global sigue fallando por deuda previa fuera de este sprint: 80 problemas, principalmente `no-unused-vars`, `react-hooks/static-components`, `set-state-in-effect` y `react-refresh/only-export-components`.

## Riesgos pendientes

- No aplicar migraciones en produccion sin restore/staging reciente.
- No ejecutar `db:seed` ni scripts E2E destructivos contra produccion.
- Los 8.676 items de venta con producto inexistente son el bloqueo de datos mas importante para reportes, taller y despacho.
- Los duplicados de RUT normalizados deben separarse entre placeholders/vacios y clientes reales duplicados.
- Fechas `0001-01-01` deben normalizarse a `NULL` o a una fecha de negocio validada antes de usarse en reportes.
- Los codigos internos de cotizaciones/proveedores que no cruzan con catalogo deben tratarse como backlog de limpieza, no como fix automatico masivo.

## Recomendacion siguiente

Sprint 3 debe ser limpieza controlada de datos, no mas UI:

- Restaurar backup de produccion en staging.
- Ejecutar `npm run data:audit -- --samples=20 --no-fail`.
- Generar scripts dry-run para los 3 grupos criticos: producto huerfano, stock negativo y RUT duplicado.
- Aplicar solo correcciones reversibles o con tabla de auditoria.
- Validar reportes/matriz despues de cada lote.
