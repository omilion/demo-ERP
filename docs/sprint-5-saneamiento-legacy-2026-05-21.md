# Sprint 5 - Saneamiento legacy controlado

Fecha: 2026-05-21

## Alcance

- Amplia el plan dry-run de saneamiento legacy con nuevas familias de hallazgos:
  - codigos internos de producto duplicados o faltantes;
  - duplicados de clientes y proveedores por RUT normalizado;
  - ordenes con cliente asociado distinto al RUT guardado en la venta;
  - items de venta con precio unitario negativo.
- Expone nuevas categorias read-only en `/api/admin/integridad/resumen` y `/api/admin/integridad/:tipo`.
- Agrega la pantalla admin `/admin/saneamiento-legacy` para revisar conteos, muestras y controles sin ejecutar correcciones masivas.
- Mantiene el apply del script limitado a `product-orphans` exactos con confirmacion explicita.

## Seguridad operativa

- No se ejecuto apply masivo.
- Las categorias nuevas son de revision y clasificacion: no reasignan clientes, no fusionan entidades, no cambian precios y no corrigen stock automaticamente.
- Cualquier correccion destructiva futura debe quedar separada del dry-run, con backup, ventana aprobada y rollback probado.

## QA ejecutado

- `node --check scripts\data-cleanup-plan.mjs`
- `node --check src\routes\admin\index.js`
- `npm.cmd test -- --run test/data-cleanup-plan.test.js test/producto-orphan-cleanup.test.js test/rut-duplicates-cleanup.test.js test/stock-negative-dates.test.js`
- `npm.cmd exec prisma validate`
- `npm.cmd run build` en frontend
- `git diff --check`

## Resultado

- Backend: 32 tests especificos pasados.
- Frontend: build Vite generado correctamente.
- Prisma schema valido.
- Sin errores de whitespace en diff.

