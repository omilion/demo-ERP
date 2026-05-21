# Sprint 4 - Reporteria gerencial - 2026-05-21

## Objetivo

Consolidar reportes ejecutivos confiables para ventas, cobranza/caja, stock, licitaciones y operacion pendiente.

## Cambios principales

- Nuevos endpoints gerenciales no destructivos:
  - `GET /api/reportes/gerencial/ventas`
  - `GET /api/reportes/gerencial/cobranza-caja`
  - `GET /api/reportes/gerencial/stock`
  - `GET /api/reportes/gerencial/licitaciones`
  - `GET /api/reportes/gerencial/operaciones`
- Nueva pantalla `/reportes/gerenciales` con filtros por periodo, tipo de venta, vendedor y cliente/RUT.
- KPIs ejecutivos: ventas del periodo, ticket promedio, CxC pendiente, caja neta, stock critico y pendientes operacionales.
- Tablas de apoyo para ventas, licitaciones, ODTs, despachos y stock critico.
- Permiso frontend `reportes:read` para roles operativos y `solo_lectura`.
- Smoke API productivo ampliado para cubrir los cinco endpoints gerenciales.

## QA

- `npm.cmd test -- rbac audit-plugin reportes-gerenciales stock-ingresos-apply despachos-traceability caja-traceability pagos-proveedores-stock`: 52 tests OK, 5 tests DB skipped por falta de password local en `DATABASE_URL`.
- `npm.cmd exec vitest run src/utils/permissions.test.js`: 4 tests OK.
- `npm.cmd exec prisma validate`: OK.
- `npm.cmd run build` frontend: OK, bundle `assets/index-Cz7AewpV.js`.

## Riesgos residuales

- Los tests de cruce gerencial con Prisma quedan condicionados a un `DATABASE_URL` local completo; en este entorno no hay password de Postgres.
- La matriz de ventas mezcla ordenes, OC online y cotizaciones; las licitaciones vinculadas a orden pueden seguir requiriendo criterio contable para evitar doble conteo ejecutivo.
- Cobranza historica y saldos actuales de orden pueden diferir por datos legacy.
