# Sprint 3 - Trazabilidad de despachos y guias

Fecha: 2026-05-19  
Estado: implementado en codigo, pendiente de push/deploy.

## Objetivo

Hacer que despachos y guias queden relacionados al trabajo correcto, no solo a textos o numeros legacy. El flujo nuevo debe poder partir desde una orden comercial y, cuando exista, desde una ODT asociada.

## Problemas corregidos

Antes de este sprint:

- Las rutas de despachos y guias exigian orden para escrituras nuevas, pero no aceptaban `odtId`.
- `interno`/`nInterno` podia quedar distinto al `n_interno` real de la orden.
- Guias podian recibir `ordenId` y `nInterno` inconsistentes.
- No habia `origen_tipo/origen_id` formal en despachos/guias.
- La auditoria no detectaba ODT huerfana ni ODT cruzada con otra orden.

## Cambios realizados

### Modelo de datos

Se agregaron campos a `bodega.despachos`:

- `odt_id`
- `origen_tipo`
- `origen_id`

Se agregaron campos a `bodega.guias_despachos`:

- `odt_id`
- `origen_tipo`
- `origen_id`

Tambien se agregaron relaciones Prisma/FK opcionales hacia `taller.odts` e indices por `odt_id` y `origen_tipo/origen_id`.

Migracion:

- `backend/prisma/migrations/20260519120000_add_dispatch_odt_traceability/migration.sql`

Las FK quedan `NOT VALID` para no bloquear historico legacy pendiente de saneamiento.

### Despachos

Rutas:

- `POST /api/despachos`
- `PUT /api/despachos/:id`
- `GET /api/despachos`

Reglas nuevas:

- Acepta `odtId`.
- Si viene `odtId`, la ODT debe existir y tener orden asociada.
- Si vienen `ordenId` y `odtId`, deben pertenecer al mismo trabajo.
- Si viene `interno`, debe calzar con `orden.nInterno`.
- Se graba `origen_tipo` como `odt` cuando hay ODT, o `orden` cuando solo hay orden.
- Se graba `origen_id` con el id correspondiente.
- El listado permite filtrar por `odtId`.

### Guias

Rutas:

- `POST /api/despachos/guias`
- `GET /api/despachos/guias/list`

Reglas nuevas:

- Acepta `odtId`.
- Valida cruce `ordenId`/`odtId`.
- Rechaza `nInterno` inconsistente con la orden.
- Graba `odt_id`, `origen_tipo` y `origen_id`.
- El listado permite filtrar por `odtId`.

No se agrego ruta `PUT` de guia porque el modulo no la tenia; se mantuvo el alcance en nuevas escrituras y borrado existente.

### Auditoria

Se agregaron controles:

- `despachos.despacho_odt_id_huerfano`
- `despachos.despacho_origen_tipo_nulo`
- `despachos.despacho_interno_mismatch`
- `despachos.despacho_odt_orden_mismatch`
- `despachos.guia_odt_id_huerfano`
- `despachos.guia_origen_tipo_nulo`
- `despachos.guia_odt_orden_mismatch`

Estos se suman a los checks previos de orden nula, orden huerfana y guia con `n_interno` distinto.

## Validaciones ejecutadas

Comandos ejecutados en `backend`:

```bash
npm.cmd exec prisma validate
npm.cmd run db:generate
node --check src/routes/despachos/index.js
node --check scripts/data-integrity-audit.mjs
npm.cmd test -- despachos-traceability.test.js data-integrity-audit.test.js operational-utils.test.js backend-helpers.test.js
git diff --check
```

Resultado:

- Prisma schema valido.
- Prisma Client generado.
- Sintaxis JavaScript valida.
- 24 tests focalizados pasan.
- `git diff --check` sin errores.

## Pendiente fuera de este sprint

Este sprint no resuelve todavia:

- descuento automatico de stock por despacho;
- ruta de edicion de guias;
- conciliacion historica de despachos/guias legacy sin orden u ODT;
- politica de despacho parcial por item de orden;
- UI especifica para elegir ODT desde la pantalla de despacho si el frontend actual no envia `odtId`.

## Criterio de aceptacion

El Sprint 3 queda aceptable si en staging/produccion se confirma:

1. Crear despacho con `odtId` graba `orden_id`, `odt_id`, `origen_tipo=odt`, `origen_id=odt_id`.
2. Crear guia con `odtId` hace lo mismo.
3. Se rechaza una ODT que no pertenece a la orden indicada.
4. Se rechaza un `nInterno` que no calza con la orden.
5. Listados filtran por `odtId`.
6. Auditoria reporta ODT huerfana, origen nulo o cruces ODT/orden.
